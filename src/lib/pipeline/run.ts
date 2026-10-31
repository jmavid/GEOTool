import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { analyzeSite } from "@/lib/analyzer/site";
import { cached, cacheKey } from "@/lib/ai/cache";
import { CostTracker } from "@/lib/ai/cost";
import { publicMessage, UserError } from "@/lib/errors";
import { promptsFor } from "@/lib/plans";
import { notifySubscribers } from "@/lib/tracking";
import { activeProviders } from "@/providers";
import type { ProviderResult } from "@/providers/types";
import { BrandRegistry, llmAnalyzeResponse, mergeVerdict } from "./analyze-response";
import { makeBrandRef } from "./detect";
import { buildEvidence, generateInsights } from "./insights";
import { extractProfile } from "./profile";
import { dedupeQueries, generateQueries, planQuerySet, type GeneratedQuery } from "./queries";
import { computeGeoScore, providerVisibility, shareOfVoice, type ScoredResponse } from "./score";

const CONCURRENCY = () => Number(process.env.AI_CONCURRENCY ?? 10);

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/** Full analysis pipeline. Each step persists its output so results survive and can be inspected. */
export async function runAnalysis(analysisId: string): Promise<void> {
  const db = getDb();
  const tracker = new CostTracker();
  const update = (data: Partial<typeof schema.analyses.$inferInsert>) => db.update(schema.analyses).set(data).where(eq(schema.analyses.id, analysisId));
  const costFields = () => {
    const t = tracker.totals();
    return { tokensIn: t.inputTokens, tokensOut: t.outputTokens, costUsd: t.costUsd, costBreakdown: tracker.breakdown() };
  };

  const analysis = await db.query.analyses.findFirst({ where: eq(schema.analyses.id, analysisId) });
  if (!analysis || analysis.status !== "QUEUED") return; // already picked up: never pay twice
  const website = await db.query.websites.findFirst({ where: eq(schema.websites.id, analysis.websiteId) });
  if (!website) return;

  try {
    const providers = activeProviders();
    if (!providers.length) throw new UserError("No AI provider is configured yet.");
    await update({ status: "RUNNING", stage: "Reading your website", progress: 5 });

    // STEP 1 — website analysis
    const snapshot = await analyzeSite(website.url);
    await update({ siteFacts: snapshot.facts, stage: "Understanding your business", progress: 15 });

    // STEP 1b — brand profile
    const profile = await extractProfile(snapshot, tracker);
    await update({ profile, stage: "Writing buyer questions", progress: 25, ...costFields() });

    // STEP 2 — query set: reuse the website's previous questions so its score history is comparable
    const previous = await db.query.analyses.findFirst({
      columns: { id: true },
      where: and(eq(schema.analyses.websiteId, website.id), eq(schema.analyses.status, "COMPLETED"), ne(schema.analyses.id, analysisId)),
      orderBy: desc(schema.analyses.createdAt),
    });
    const previousQueries: GeneratedQuery[] = previous
      ? (await db.query.prompts.findMany({ where: eq(schema.prompts.analysisId, previous.id), orderBy: asc(schema.prompts.position) })).map((p) => ({
          text: p.text,
          category: p.category as GeneratedQuery["category"],
        }))
      : [];
    const limit = promptsFor(analysis.plan);
    const { reuse, missing } = planQuerySet(previousQueries, limit);
    let queries = reuse;
    if (missing > 0) {
      const fresh = await generateQueries(profile, missing + reuse.length, tracker);
      queries = dedupeQueries([...reuse, ...fresh], profile.brand, limit);
    }
    if (previousQueries.length) await update({ promptsFromAnalysisId: previous!.id });
    for (const [position, q] of queries.entries()) {
      await db.insert(schema.prompts).values({ analysisId, position, text: q.text, category: q.category });
    }
    const prompts = await db.query.prompts.findMany({ where: eq(schema.prompts.analysisId, analysisId), orderBy: asc(schema.prompts.position) });
    await update({ stage: `Asking ${providers.map((p) => p.name).join(", ")}`, progress: 30, ...costFields() });

    // STEP 3 — AI visibility test
    const target = makeBrandRef(profile.brand, profile.brandAliases, snapshot.facts.domain);
    const competitorRefs = profile.competitors.map((c) => makeBrandRef(c.name, [], c.domain));
    const registry = new BrandRegistry(target, competitorRefs);
    const jobs = providers.flatMap((provider) => prompts.map((prompt) => ({ provider, prompt })));
    const country = profile.countryCode ?? undefined;
    let done = 0;
    let failures = 0;

    await pool(jobs, CONCURRENCY(), async ({ provider, prompt }) => {
      try {
        const key = cacheKey(["visibility", provider.id, provider.model, prompt.text, country, provider.browses]);
        const { value: result, hit } = await cached<ProviderResult>(key, () => provider.executePrompt(prompt.text, { country, language: profile.languageCode }));
        const cost = tracker.add(`visibility:${provider.id}`, result.model, result.usage, hit);
        const llm = await llmAnalyzeResponse(result.text, target, profile.brandAliases, tracker);
        const v = mergeVerdict(result.text, result.citations, target, competitorRefs, llm, registry);
        await db.insert(schema.aiResponses).values({
          analysisId,
          promptId: prompt.id,
          provider: provider.id,
          model: result.model,
          response: result.text,
          brandMentioned: v.brandMentioned,
          recommended: v.recommended,
          position: v.position,
          competitorsMentioned: v.competitorsMentioned,
          citations: result.citations,
          brandCited: v.brandCited,
          sentiment: v.sentiment,
          context: v.context,
          cached: hit,
          tokensIn: hit ? 0 : result.usage.inputTokens,
          tokensOut: hit ? 0 : result.usage.outputTokens,
          costUsd: cost,
        });
      } catch (err) {
        failures++;
        console.error(`[analysis ${analysisId}] ${provider.id} failed for "${prompt.text}":`, err);
      } finally {
        done++;
        if (done % 3 === 0 || done === jobs.length) {
          await update({ stage: `Asking AI assistants (${done}/${jobs.length})`, progress: 30 + Math.round((done / jobs.length) * 55) });
        }
      }
    });
    if (failures === jobs.length) throw new Error("All AI requests failed");

    // STEP 4 — deterministic GEO score + STEP 5 — share of voice
    await update({ stage: "Calculating your GEO Score", progress: 88 });
    const stored = await db.query.aiResponses.findMany({ where: eq(schema.aiResponses.analysisId, analysisId) });
    const promptById = new Map(prompts.map((p) => [p.id, p]));
    const providerById = new Map(providers.map((p) => [p.id, p]));
    const scored: ScoredResponse[] = stored.map((r) => ({
      provider: r.provider,
      brandMentioned: r.brandMentioned,
      recommended: r.recommended,
      position: r.position,
      brandCited: r.brandCited,
      citationsMeasured: providerById.get(r.provider)?.browses ?? false,
      competitorsMentioned: r.competitorsMentioned,
    }));
    const visibility = providerVisibility(scored);
    const providerScores = Object.fromEntries(
      providers.map((p) => [p.id, { name: p.name, model: p.model, browses: p.browses, ...(visibility[p.id] ?? { mentionRate: 0, responses: 0 }) }]),
    );
    const geo = computeGeoScore(scored, profile.brand);
    const sov = shareOfVoice(scored, profile.brand);
    const guessed = new Map(profile.competitors.map((c) => [c.name, c.domain]));
    for (const s of sov.slice(0, 30)) {
      await db.insert(schema.competitors).values({
        analysisId,
        name: s.name,
        domain: s.isTarget ? snapshot.facts.domain : (guessed.get(s.name) ?? null),
        isTarget: s.isTarget,
        source: s.isTarget || guessed.has(s.name) ? "site" : "ai",
        mentions: s.mentions,
        shareOfVoice: s.share,
      });
    }
    await update({ geoScore: geo.score, scoreBreakdown: geo, providerScores, stage: "Building your action plan", progress: 92, ...costFields() });

    // STEP 6 + 7 — why you're losing + action plan
    const evidence = buildEvidence(
      snapshot.facts,
      stored.map((r) => ({
        prompt: promptById.get(r.promptId)?.text ?? "",
        category: promptById.get(r.promptId)?.category ?? "DISCOVERY",
        brandMentioned: r.brandMentioned,
        competitorsMentioned: r.competitorsMentioned,
        citations: r.citations,
      })),
    );
    const insights = await generateInsights({ profile, facts: snapshot.facts, score: geo, sov, evidence }, tracker);
    for (const [order, a] of insights.actions.entries()) {
      await db.insert(schema.recommendations).values({ analysisId, order, ...a });
    }

    await update({ insights: { reasons: insights.reasons, evidence }, status: "COMPLETED", stage: "Done", progress: 100, completedAt: new Date(), ...costFields() });
    console.info(`[analysis ${analysisId}] completed: score ${geo.score}, cost ≈ $${tracker.totals().costUsd}`);
  } catch (err) {
    console.error(`[analysis ${analysisId}] failed:`, err);
    await update({ status: "FAILED", error: publicMessage(err), ...costFields() }).catch(() => {});
    return;
  }

  // Outside the try: a mail failure must never mark a finished analysis as FAILED.
  if (analysis.trigger === "SCHEDULED") {
    await notifySubscribers(analysisId).catch((err) => console.error(`[analysis ${analysisId}] weekly email failed:`, err));
  }
}
