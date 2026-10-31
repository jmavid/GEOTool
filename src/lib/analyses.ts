import { createHash } from "node:crypto";
import { after } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SiteFacts } from "@/lib/analyzer/site";
import type { BrandProfile } from "@/lib/pipeline/profile";
import type { GeoScore } from "@/lib/pipeline/score";
import type { Evidence } from "@/lib/pipeline/insights";
import { runAnalysis } from "@/lib/pipeline/run";
import { canonicalWebsiteUrl, validatePublicUrl } from "@/lib/security/url";
import { UserError } from "@/lib/errors";
import { EXTERNAL_PROVIDERS } from "@/providers";

const DEDUPE_WINDOW_MS = 24 * 3_600_000;
const STALE_MS = 15 * 60_000;

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${process.env.IP_HASH_SALT ?? "geotool"}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Creates (or reuses) an analysis for a URL. Reuse within 24h is the main cost control:
 * the same site analyzed twice in a day costs nothing the second time.
 */
export async function createAnalysis(rawUrl: string, ip: string): Promise<{ id: string; reused: boolean }> {
  const url = validatePublicUrl(rawUrl);
  const canonical = canonicalWebsiteUrl(url);
  const db = getDb();

  await db
    .insert(schema.websites)
    .values({ url: canonical, domain: url.hostname.replace(/^www\./, "") })
    .onConflictDoNothing();
  const website = (await db.query.websites.findFirst({ where: eq(schema.websites.url, canonical) }))!;

  const recent = await db.query.analyses.findFirst({
    where: and(
      eq(schema.analyses.websiteId, website.id),
      gte(schema.analyses.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS)),
      inArray(schema.analyses.status, ["QUEUED", "RUNNING", "COMPLETED"]),
    ),
    orderBy: desc(schema.analyses.createdAt),
  });
  if (recent) return { id: recent.id, reused: true };

  const ipHash = hashIp(ip);
  const limit = Number(process.env.FREE_ANALYSES_PER_IP_PER_DAY ?? 3);
  const today = await db.query.analyses.findMany({
    columns: { id: true },
    where: and(eq(schema.analyses.ipHash, ipHash), gte(schema.analyses.createdAt, new Date(Date.now() - 24 * 3_600_000))),
  });
  if (today.length >= limit) throw new UserError("You've reached the free analysis limit for today. Try again tomorrow.");

  // Global budget guard: caps Workers AI spend even if many IPs are used. Weekly tracking runs have their own cap
  // (MAX_WEEKLY_ANALYSES), so a Monday batch never locks visitors out.
  const globalLimit = Number(process.env.MAX_ANALYSES_PER_DAY ?? 100);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.analyses)
    .where(and(eq(schema.analyses.trigger, "USER"), gte(schema.analyses.createdAt, new Date(Date.now() - 24 * 3_600_000))));
  if (n >= globalLimit) throw new UserError("We're at capacity for today. Please try again tomorrow.");

  const [created] = await db.insert(schema.analyses).values({ websiteId: website.id, ipHash, plan: "FREE" }).returning({ id: schema.analyses.id });
  await enqueue(created.id);
  return { id: created.id, reused: false };
}

/** Production: Cloudflare Queue (no 30s waitUntil limit). `next dev`: run in-process after the response. */
export async function enqueue(analysisId: string) {
  const queue = process.env.NODE_ENV === "production" ? getCloudflareContext().env.ANALYSIS_QUEUE : undefined;
  if (queue) await queue.send({ analysisId });
  else after(() => runAnalysis(analysisId));
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

  const providerScores = (analysis.providerScores ?? {}) as Record<string, { name?: string; mentionRate: number; responses: number; browses?: boolean }>;
  const insights = analysis.insights as { reasons: { title: string; detail: string }[]; evidence: Evidence } | null;

  return {
    ...base,
    result: {
      geoScore: analysis.geoScore ?? 0,
      breakdown: analysis.scoreBreakdown as GeoScore,
      // Engines actually tested first, then the commercial assistants that are not connected.
      providers: [
        ...Object.entries(providerScores).map(([id, p]) => ({ id, name: p.name ?? id, mentionRate: p.mentionRate as number | null, tested: true })),
        ...EXTERNAL_PROVIDERS.filter((p) => !providerScores[p.id]).map((p) => ({ id: p.id, name: p.name, mentionRate: null, tested: false })),
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
