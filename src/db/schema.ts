import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const PLANS = ["FREE", "STARTER", "PRO", "AGENCY"] as const;
export type Plan = (typeof PLANS)[number];
export const ANALYSIS_STATUS = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUS)[number];
/** USER: someone submitted the URL. SCHEDULED: the weekly tracking run for confirmed subscribers. */
export const ANALYSIS_TRIGGERS = ["USER", "SCHEDULED"] as const;
export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  plan: text("plan", { enum: PLANS }).notNull().default("FREE"),
  createdAt: createdAt(),
});

export const projects = sqliteTable("projects", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** One row per canonical URL. Analyses hang from it, so score history is per website. */
export const websites = sqliteTable(
  "websites",
  {
    id: id(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    url: text("url").notNull().unique(),
    domain: text("domain").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("websites_domain_idx").on(t.domain)],
);

export const analyses = sqliteTable(
  "analyses",
  {
    id: id(),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    status: text("status", { enum: ANALYSIS_STATUS }).notNull().default("QUEUED"),
    stage: text("stage").notNull().default("Queued"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    plan: text("plan", { enum: PLANS }).notNull().default("FREE"),
    trigger: text("trigger", { enum: ANALYSIS_TRIGGERS }).notNull().default("USER"),
    ipHash: text("ip_hash"),
    /** Analysis whose buyer questions were reused, so scores of the same website stay comparable. */
    promptsFromAnalysisId: text("prompts_from_analysis_id"),
    /** Brand profile extracted from the site (brand, industry, competitors...). */
    profile: text("profile", { mode: "json" }),
    /** Deterministic on-page facts (title, schema types, robots rules, sitemap...). */
    siteFacts: text("site_facts", { mode: "json" }),
    geoScore: integer("geo_score"),
    scoreBreakdown: text("score_breakdown", { mode: "json" }),
    providerScores: text("provider_scores", { mode: "json" }),
    /** "Why you're losing" reasons + the evidence they were built from. */
    insights: text("insights", { mode: "json" }),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    costBreakdown: text("cost_breakdown", { mode: "json" }),
    createdAt: createdAt(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("analyses_website_idx").on(t.websiteId, t.createdAt), index("analyses_ip_idx").on(t.ipHash, t.createdAt)],
);

export const prompts = sqliteTable(
  "prompts",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    category: text("category").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("prompts_analysis_idx").on(t.analysisId)],
);

export const aiResponses = sqliteTable(
  "ai_responses",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    response: text("response").notNull(),
    brandMentioned: integer("brand_mentioned", { mode: "boolean" }).notNull(),
    recommended: integer("recommended", { mode: "boolean" }).notNull(),
    position: integer("position"),
    competitorsMentioned: text("competitors_mentioned", { mode: "json" }).$type<string[]>().notNull(),
    citations: text("citations", { mode: "json" }).$type<{ url: string; title?: string }[]>().notNull(),
    brandCited: integer("brand_cited", { mode: "boolean" }).notNull().default(false),
    sentiment: text("sentiment"),
    context: text("context"),
    cached: integer("cached", { mode: "boolean" }).notNull().default(false),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_responses_analysis_idx").on(t.analysisId)],
);

export const competitors = sqliteTable(
  "competitors",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    isTarget: integer("is_target", { mode: "boolean" }).notNull().default(false),
    /** "site" = guessed from the website analysis, "ai" = discovered in AI answers. */
    source: text("source").notNull(),
    mentions: integer("mentions").notNull().default(0),
    shareOfVoice: real("share_of_voice").notNull().default(0),
  },
  (t) => [index("competitors_analysis_idx").on(t.analysisId)],
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: id(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    priority: text("priority", { enum: PRIORITIES }).notNull(),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    evidence: text("evidence").notNull(),
    action: text("action").notNull(),
    impact: text("impact").notNull(),
    difficulty: text("difficulty").notNull(),
  },
  (t) => [index("recommendations_analysis_idx").on(t.analysisId)],
);

/** Cache of LLM/provider calls: identical (provider, model, prompt) within the TTL is never paid twice. */
export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  createdAt: createdAt(),
});

/**
 * "Track my score weekly" sign-ups. Double opt-in: only confirmed, not unsubscribed rows get weekly runs and emails,
 * so nobody can make us re-analyze sites or email strangers by typing their address.
 */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: id(),
    email: text("email").notNull(),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
    ipHash: text("ip_hash"),
    /** Secret in the confirm/unsubscribe links. Nullable only because SQLite can't add a NOT NULL column to filled tables. */
    token: text("token").$defaultFn(() => crypto.randomUUID()),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
    /** Last scheduled analysis emailed to this subscriber: an analysis is never reported twice. */
    lastNotifiedAnalysisId: text("last_notified_analysis_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subscriptions_email_website_idx").on(t.email, t.websiteId), uniqueIndex("subscriptions_token_idx").on(t.token)],
);
