import { after } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SiteFacts } from "@/lib/analyzer/site";
import type { BrandProfile } from "@/lib/pipeline/profile";
import type { GeoScore } from "@/lib/pipeline/score";
import type { Evidence } from "@/lib/pipeline/insights";
import { runAnalysis } from "@/lib/pipeline/run";
import { notifyOwner, type RequestMeta } from "@/lib/owner-notify";
import { canonicalWebsiteUrl, validatePublicUrl } from "@/lib/security/url";
import { REPORT_REUSE_HOURS } from "@/lib/reuse";
import { hashIp, unlimitedIp } from "@/lib/security/rate-limit";
import { UserError } from "@/lib/errors";
import type { User } from "@/lib/auth/session";
import { planLimitError, promptsFor } from "@/lib/plans";
import { analysesLast30Days, attachWebsite, defaultProjectId, ownedProject, trackedWebsiteIds } from "@/lib/projects";
import { connectedExternalProviders, EXTERNAL_PROVIDERS, externalProvidersIncluded } from "@/providers";

const DEDUPE_WINDOW_MS = REPORT_REUSE_HOURS * 3_600_000;
const STALE_MS = 15 * 60_000;

/**
 * Creates (or reuses) an analysis for a URL. Reuse within 24h is the main cost control:
 * the same site analyzed twice in a day costs nothing the second time (except from UNLIMITED_IPS, which always rerun).
 *
 * Anonymous visitors get the free check, limited per IP and by a global daily cap. Signed-in users run on their
 * plan: the site joins their dashboard (within the plan's website limit) and counts against its monthly analyses.
 */
export async function createAnalysis(rawUrl: string, meta: RequestMeta, user: User | null = null, projectId?: string): Promise<{ id: string; reused: boolean }> {
  const ip = meta.ip;
  const url = validatePublicUrl(rawUrl);
  const canonical = canonicalWebsiteUrl(url);
  const db = getDb();
  const plan = user?.plan ?? "FREE";

  await db
    .insert(schema.websites)
    .values({ url: canonical, domain: url.hostname.replace(/^www\./, "") })
    .onConflictDoNothing();
  const website = (await db.query.websites.findFirst({ where: eq(schema.websites.url, canonical) }))!;

  let project: string | null = null;
  if (user) {
    const tracked = await trackedWebsiteIds(user.id);
    const alreadyTracked = tracked.includes(website.id);
    // A site already in the dashboard stays where it is unless a project is named.
    if (projectId) {
      project = (await ownedProject(user.id, projectId))?.id ?? null;
      if (!project) throw new UserError("That project doesn't exist.");
    } else if (!alreadyTracked) project = await defaultProjectId(user.id);
    const error = planLimitError(plan, {
      trackedSites: tracked.length,
      alreadyTracked,
      // Only the website limit applies to a reused analysis, so its count is checked below.
      analysesLast30Days: 0,
    });
    if (error) throw new UserError(error);
  }

  const recent = await db.query.analyses.findFirst({
    where: and(
      eq(schema.analyses.websiteId, website.id),
      gte(schema.analyses.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS)),
      inArray(schema.analyses.status, ["QUEUED", "RUNNING", "COMPLETED"]),
    ),
    orderBy: desc(schema.analyses.createdAt),
  });
  // A smaller run (fewer questions than this plan asks) is not a substitute. The owner's own IPs always get a fresh run.
  if (recent && promptsFor(recent.plan) >= promptsFor(plan) && !unlimitedIp(ip)) {
    if (project) await attachWebsite(project, website.id);
    after(() => notifyOwner(recent.id, meta, { reused: true }));
    return { id: recent.id, reused: true };
  }

  const ipHash = hashIp(ip);
  if (unlimitedIp(ip)) {
    // The owner's own IP: no daily, global or monthly analysis limit (the website limit above still applies).
  } else if (user) {
    const error = planLimitError(plan, { trackedSites: 0, alreadyTracked: true, analysesLast30Days: await analysesLast30Days(user.id) });
    if (error) throw new UserError(error);
  } else {
    const limit = Number(process.env.FREE_ANALYSES_PER_IP_PER_DAY ?? 3);
    const today = await db.query.analyses.findMany({
      columns: { id: true },
      where: and(eq(schema.analyses.ipHash, ipHash), gte(schema.analyses.createdAt, new Date(Date.now() - 24 * 3_600_000))),
    });
    if (today.length >= limit) throw new UserError("You've reached the free analysis limit for today. Try again tomorrow.");

    // Global budget guard for anonymous checks: caps Workers AI spend even if many IPs are used. Accounts are bounded
    // by their plan and weekly tracking runs by MAX_WEEKLY_ANALYSES, so neither is locked out by a busy day.
    const globalLimit = Number(process.env.MAX_ANALYSES_PER_DAY ?? 100);
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.analyses)
      .where(and(eq(schema.analyses.trigger, "USER"), isNull(schema.analyses.userId), gte(schema.analyses.createdAt, new Date(Date.now() - 24 * 3_600_000))));
    if (n >= globalLimit) throw new UserError("We're at capacity for today. Please try again tomorrow.");
  }

  const [created] = await db.insert(schema.analyses).values({ websiteId: website.id, ipHash, plan, userId: user?.id ?? null }).returning({ id: schema.analyses.id });
  if (project) await attachWebsite(project, website.id);
  await enqueue(created.id, meta);
  return { id: created.id, reused: false };
}

/** Production: Cloudflare Queue (no 30s waitUntil limit). `next dev`: run in-process after the response. */
export async function enqueue(analysisId: string, meta?: RequestMeta) {
  const queue = process.env.NODE_ENV === "production" ? getCloudflareContext().env.ANALYSIS_QUEUE : undefined;
  if (queue) await queue.send({ analysisId, meta });
  else after(() => runAnalysis(analysisId, meta));
}

export type Report = NonNullable<Awaited<ReturnType<typeof getReport>>>;

export async function getReport(id: string) {
  const db = getDb();
  let analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, id) });
  if (!analysis) return null;

  if ((analysis.status === "RUNNING" || analysis.status === "QUEUED") && Date.now() - analysis.createdAt.getTime() > STALE_MS) {
    await db.update(schema.analyses).set({ status: "FAILED", error: "The analysis took too long. Please try again." }).where(eq(schema.analyses.id, id));
    analysis = { ...analysis, status: "FAILED", error: "The analysis took too long. Please try again." };
  }
  const website = (await db.query.websites.findFirst({ where: eq(schema.websites.id, analysis.websiteId) }))!;
  const base = {
    id: analysis.id,
    status: analysis.status,
    stage: analysis.stage,
    progress: analysis.progress,
    error: analysis.error,
    url: website.url,
    domain: website.domain,
    createdAt: analysis.createdAt.toISOString(),
    profile: analysis.profile as BrandProfile | null,
  };
  if (analysis.status !== "COMPLETED") return { ...base, result: null };

  const [prompts, responses, competitors, recommendations, history] = await Promise.all([
    db.query.prompts.findMany({ where: eq(schema.prompts.analysisId, id), orderBy: asc(schema.prompts.position) }),
    db.query.aiResponses.findMany({ where: eq(schema.aiResponses.analysisId, id) }),
    db.query.competitors.findMany({ where: eq(schema.competitors.analysisId, id), orderBy: desc(schema.competitors.mentions) }),
    db.query.recommendations.findMany({ where: eq(schema.recommendations.analysisId, id), orderBy: asc(schema.recommendations.order) }),
    db.query.analyses.findMany({
      columns: { id: true, geoScore: true, createdAt: true },
      where: and(eq(schema.analyses.websiteId, analysis.websiteId), eq(schema.analyses.status, "COMPLETED")),
      orderBy: asc(schema.analyses.createdAt),
    }),
  ]);

  const connected = new Set(connectedExternalProviders().map((p) => p.id));
  const providerScores = (analysis.providerScores ?? {}) as Record<string, { name?: string; mentionRate: number; responses: number; browses?: boolean }>;
  const insights = analysis.insights as { reasons: { title: string; detail: string }[]; evidence: Evidence } | null;

  return {
    ...base,
    result: {
      geoScore: analysis.geoScore ?? 0,
      breakdown: analysis.scoreBreakdown as GeoScore,
      // Engines actually tested first, then the commercial assistants that are not connected.
      providers: [
        ...Object.entries(providerScores).map(([id, p]) => ({ id, name: p.name ?? id, mentionRate: p.mentionRate as number | null, tested: true, paidOnly: false })),
        ...EXTERNAL_PROVIDERS.filter((p) => !providerScores[p.id]).map((p) => ({
          id: p.id,
          name: p.name,
          mentionRate: null,
          tested: false,
          // Connected but left out because of this analysis's plan: a paid-plan feature, not a missing integration.
          paidOnly: connected.has(p.id) && !externalProvidersIncluded(analysis.plan),
        })),
      ],
      competitors: competitors.map((c) => ({ name: c.name, domain: c.domain, isTarget: c.isTarget, mentions: c.mentions, share: c.shareOfVoice })),
      reasons: insights?.reasons ?? [],
      evidence: insights?.evidence ?? null,
      recommendations: recommendations.map((r) => ({ order: r.order, priority: r.priority, title: r.title, problem: r.problem, evidence: r.evidence, action: r.action, impact: r.impact, difficulty: r.difficulty })),
      queries: prompts.map((p) => ({
        text: p.text,
        category: p.category,
        results: responses
          .filter((r) => r.promptId === p.id)
          .map((r) => ({
            provider: r.provider,
            brandMentioned: r.brandMentioned,
            recommended: r.recommended,
            position: r.position,
            sentiment: r.sentiment as "positive" | "neutral" | "negative" | null,
            context: r.context,
            competitors: r.competitorsMentioned,
            citations: r.citations.slice(0, 8),
            response: r.response,
          })),
      })),
      siteFacts: analysis.siteFacts as SiteFacts,
      promptsReused: !!analysis.promptsFromAnalysisId,
      history: history.map((h) => ({ id: h.id, score: h.geoScore ?? 0, date: h.createdAt.toISOString() })),
      cost:
        process.env.SHOW_COSTS === "true" || process.env.NODE_ENV !== "production"
          ? { usd: analysis.costUsd, tokensIn: analysis.tokensIn, tokensOut: analysis.tokensOut, breakdown: analysis.costBreakdown }
          : null,
    },
  };
}
