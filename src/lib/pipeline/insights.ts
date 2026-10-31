import { z } from "zod";
import { generateJson } from "@/lib/ai/llm";
import { clipped, upTo } from "@/lib/ai/json";
import type { CostTracker } from "@/lib/ai/cost";
import type { SiteFacts } from "@/lib/analyzer/site";
import { hostOf, sameSite } from "./detect";
import type { BrandProfile } from "./profile";
import type { GeoScore, ShareOfVoiceEntry } from "./score";

export interface EvidenceResponse {
  prompt: string;
  category: string;
  brandMentioned: boolean;
  competitorsMentioned: string[];
  citations: { url: string }[];
}

export interface Evidence {
  technicalIssues: string[];
  categoryStats: { category: string; prompts: number; mentionRate: number; topCompetitor: string | null }[];
  topCitedDomains: { domain: string; count: number }[];
  lostQueries: { prompt: string; competitors: string[] }[];
}

/** Deterministic site checks that matter for AI visibility. */
export function technicalIssues(f: SiteFacts): string[] {
  const issues: string[] = [];
  if (f.aiBotsBlocked.length) issues.push(`robots.txt blocks AI crawlers: ${f.aiBotsBlocked.join(", ")}`);
  if (!f.hasOrganizationSchema) issues.push("No Organization structured data (JSON-LD) found");
  if (!f.hasProductSchema) issues.push("No Product/Service/SoftwareApplication structured data found");
  if (!f.hasFaqSchema) issues.push("No FAQPage structured data found");
  if (!f.llmsTxtFound) issues.push("No /llms.txt file");
  if (!f.sitemapFound) issues.push("No XML sitemap found");
  if (!f.metaDescription) issues.push("Homepage has no meta description");
  if (f.homepageWordCount < 300) issues.push(`Homepage has little indexable text (${f.homepageWordCount} words)`);
  if (!f.h1.length) issues.push("Homepage has no H1 heading");
  return issues;
}

/** Aggregates stored responses into compact, factual evidence. */
export function buildEvidence(facts: SiteFacts, responses: EvidenceResponse[]): Evidence {
  const byCat = new Map<string, EvidenceResponse[]>();
  for (const r of responses) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const categoryStats = [...byCat.entries()].map(([category, rs]) => {
    const comp = new Map<string, number>();
    rs.forEach((r) => r.competitorsMentioned.forEach((c) => comp.set(c, (comp.get(c) ?? 0) + 1)));
    const top = [...comp.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      category,
      prompts: rs.length,
      mentionRate: Math.round((rs.filter((r) => r.brandMentioned).length / rs.length) * 100),
      topCompetitor: top ? top[0] : null,
    };
  });

  const domains = new Map<string, number>();
  for (const r of responses) {
    for (const h of new Set(r.citations.map((c) => hostOf(c.url)).filter((h): h is string => !!h))) {
      if (sameSite(h, facts.domain)) continue;
      domains.set(h, (domains.get(h) ?? 0) + 1);
    }
  }
  const topCitedDomains = [...domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const lostQueries = responses
    .filter((r) => !r.brandMentioned && r.competitorsMentioned.length > 0)
    .slice(0, 10)
    .map((r) => ({ prompt: r.prompt, competitors: r.competitorsMentioned.slice(0, 5) }));

  return { technicalIssues: technicalIssues(facts), categoryStats, topCitedDomains, lostQueries };
}

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const InsightsSchema = z.object({
  reasons: upTo(z.object({ title: clipped(160).pipe(z.string().min(3)), detail: clipped(600).catch("") }), 7).refine((a) => a.length > 0),
  actions: upTo(
      z.object({
        priority: z
          .string()
          .trim()
          .toUpperCase()
          .pipe(z.enum(PRIORITIES))
          .catch("MEDIUM" as const),
        title: clipped(160).pipe(z.string().min(3)),
        problem: clipped(500).catch(""),
        evidence: clipped(500).catch(""),
        action: clipped(800).catch(""),
        impact: clipped(300).catch(""),
        difficulty: clipped(20).catch("Medium"),
      }),
      12,
    ).refine((a) => a.length > 0),
});
export type Insights = z.infer<typeof InsightsSchema>;

const SYSTEM = `You are a GEO (Generative Engine Optimization) consultant. You get hard data from testing how AI assistants answer buyer questions about a market.
Explain why competitors are recommended instead of the target brand and what to do next.
Rules:
- Every reason and action MUST be grounded in the provided data (cite numbers, competitor names, query examples, cited domains, technical issues). No generic advice without evidence.
- reasons: 3 to 7 items, most important first. Cover: which competitors appear most, in which query types, which sources are cited, what content seems to favor them, which topics the site does not cover (compare queries vs site headings).
- actions: about 10, sorted by priority (CRITICAL, HIGH, MEDIUM, LOW). Concrete (e.g. "Create a /best-<category>-software comparison page", "Get listed on <cited domain>", "Add Organization JSON-LD").
  difficulty is one of "Easy", "Medium", "Hard". impact is a short expected outcome.
- Write in English. Return {"reasons":[{"title","detail"}],"actions":[{"priority","title","problem","evidence","action","impact","difficulty"}]}`;

export async function generateInsights(
  input: { profile: BrandProfile; facts: SiteFacts; score: GeoScore; sov: ShareOfVoiceEntry[]; evidence: Evidence },
  tracker: CostTracker,
): Promise<Insights> {
  const { profile, facts, score, sov, evidence } = input;
  const user = JSON.stringify({
    target: { brand: profile.brand, domain: facts.domain, industry: profile.industry, products: profile.products, market: profile.country },
    geoScore: score.score,
    scoreComponents: score.components.filter((c) => c.measured).map((c) => ({ label: c.label, score: c.score, detail: c.detail })),
    shareOfVoice: sov.slice(0, 8).map((s) => ({ brand: s.name, answers: s.mentions, share: `${Math.round(s.share * 100)}%`, isTarget: s.isTarget })),
    byQueryType: evidence.categoryStats,
    // Without web-search engines there are no citations at all: say so, or the model reads "no sources" as a finding.
    ...(score.totals.citationsMeasured
      ? { mostCitedSources: evidence.topCitedDomains }
      : { citations: "NOT MEASURED: the AI models tested answer from training data without web search. Do not draw any conclusion about citations, sources or backlinks from this test." }),
    queriesWhereCompetitorsWinAndTargetIsAbsent: evidence.lostQueries,
    technicalIssues: evidence.technicalIssues,
    siteContent: { title: facts.title, metaDescription: facts.metaDescription, h1: facts.h1, h2: facts.h2, schemaTypes: facts.jsonLdTypes },
  });
  const result = await generateJson({ step: "insights", schema: InsightsSchema, system: SYSTEM, user, tracker });
  const order = (p: string) => PRIORITIES.indexOf(p as (typeof PRIORITIES)[number]);
  return { reasons: result.reasons, actions: [...result.actions].sort((a, b) => order(a.priority) - order(b.priority)) };
}
