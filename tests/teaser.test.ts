import { describe, expect, it } from "vitest";
import { reportSummary } from "@/lib/teaser";

const result = (competitors: { name: string; mentions: number; isTarget: boolean }[], positions: (number | null)[] = []) =>
  ({
    geoScore: 43,
    breakdown: { totals: { responses: 50, mentioned: 15, recommended: 13, cited: 0, citationsMeasured: true }, components: [] },
    competitors: competitors.map((c) => ({ ...c, share: 0 })),
    queries: [{ results: positions.map((position) => ({ position })) }],
    recommendations: [{ title: "Remove AI-crawler blocks from robots.txt" }, { title: "Second fix" }],
    providers: [],
  }) as never;

describe("report summary (what a locked report shows)", () => {
  it("has the score, KPIs, the leading rival and fix #1 only", () => {
    const s = reportSummary(
      result(
        [
          { name: "Bloomberg", mentions: 26, isTarget: false },
          { name: "Me", mentions: 15, isTarget: true },
          { name: "Expansión", mentions: 9, isTarget: false },
        ],
        [1, 3, null],
      ),
    );
    expect(s).toEqual({ geoScore: 43, mentioned: 15, recommended: 13, responses: 50, avgPosition: 2, leader: { name: "Bloomberg", mentions: 26 }, topFix: "Remove AI-crawler blocks from robots.txt" });
    expect(JSON.stringify(s)).not.toContain("Expansión");
    expect(JSON.stringify(s)).not.toContain("Second fix");
  });

  it("names no rival when the brand leads, and no position when never listed", () => {
    const s = reportSummary(result([{ name: "Me", mentions: 15, isTarget: true }, { name: "Rival", mentions: 4, isTarget: false }]));
    expect(s.leader).toBeNull();
    expect(s.avgPosition).toBeNull();
  });
});
