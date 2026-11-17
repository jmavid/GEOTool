import type { Report } from "@/lib/analyses";

/**
 * The report summary (score, headline, KPIs and fix #1). A locked report shows only this before the email is
 * verified; the breakdown, models, competitors list, full plan and questions stay behind the email link.
 */
export interface ReportSummary {
  geoScore: number;
  mentioned: number;
  recommended: number;
  responses: number;
  /** Average rank when the brand is listed, or null when it never is. */
  avgPosition: number | null;
  /** The most-named rival, only when it was named more often than the brand. */
  leader: { name: string; mentions: number } | null;
  topFix: string | null;
}

export function reportSummary(result: NonNullable<Report["result"]>): ReportSummary {
  const t = result.breakdown.totals;
  const me = result.competitors.find((c) => c.isTarget)?.mentions ?? 0;
  const leader = result.competitors.find((c) => !c.isTarget);
  const positions = result.queries.flatMap((q) => q.results.map((r) => r.position)).filter((p): p is number => p !== null);
  return {
    geoScore: result.geoScore,
    mentioned: t.mentioned,
    recommended: t.recommended,
    responses: t.responses,
    avgPosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
    leader: leader && leader.mentions > me ? { name: leader.name, mentions: leader.mentions } : null,
    topFix: result.recommendations[0]?.title ?? null,
  };
}
