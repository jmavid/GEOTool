import type { Report } from "@/lib/analyses";

/** What a locked report shows before the email: the score and one hook, never who beats them or the action plan. */
export interface ReportTeaser {
  geoScore: number;
  mentioned: number;
  responses: number;
  /** How many other brands AI assistants named more often than this one (names stay behind the email). */
  aheadCount: number;
}

export function reportTeaser(result: NonNullable<Report["result"]>): ReportTeaser {
  const me = result.competitors.find((c) => c.isTarget)?.mentions ?? 0;
  return {
    geoScore: result.geoScore,
    mentioned: result.breakdown.totals.mentioned,
    responses: result.breakdown.totals.responses,
    aheadCount: result.competitors.filter((c) => !c.isTarget && c.mentions > me).length,
  };
}
