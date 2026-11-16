import { describe, expect, it } from "vitest";
import { reportTeaser } from "@/lib/teaser";

const result = (competitors: { name: string; mentions: number; isTarget: boolean }[]) =>
  ({
    geoScore: 34,
    breakdown: { totals: { responses: 20, mentioned: 5, recommended: 2, cited: 0, citationsMeasured: true }, components: [] },
    competitors: competitors.map((c) => ({ ...c, share: 0 })),
  }) as never;

describe("report teaser", () => {
  it("counts only rivals named more often than the brand, and gives no names", () => {
    const t = reportTeaser(
      result([
        { name: "Rival A", mentions: 9, isTarget: false },
        { name: "Me", mentions: 5, isTarget: true },
        { name: "Rival B", mentions: 7, isTarget: false },
        { name: "Rival C", mentions: 5, isTarget: false },
      ]),
    );
    expect(t).toEqual({ geoScore: 34, mentioned: 5, responses: 20, aheadCount: 2 });
    expect(JSON.stringify(t)).not.toContain("Rival");
  });

  it("treats a brand missing from the list as never named", () => {
    expect(reportTeaser(result([{ name: "Rival A", mentions: 1, isTarget: false }])).aheadCount).toBe(1);
  });
});
