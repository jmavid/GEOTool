import { describe, expect, it } from "vitest";
import { computeGeoScore, positionToScore, providerVisibility, shareOfVoice, WEIGHTS, type ScoredResponse } from "@/lib/pipeline/score";

const r = (o: Partial<ScoredResponse> = {}): ScoredResponse => ({
  provider: "openai",
  brandMentioned: false,
  recommended: false,
  position: null,
  brandCited: false,
  citationsMeasured: true,
  competitorsMentioned: [],
  ...o,
});

describe("GEO score", () => {
  it("weights sum to 100%", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("is 0 when the brand never appears", () => {
    const s = computeGeoScore([r({ competitorsMentioned: ["A"] }), r({ competitorsMentioned: ["B"] })], "Me");
    expect(s.score).toBe(0);
    expect(s.components.every((c) => c.score === 0)).toBe(true);
  });

  it("is 100 when the brand is always first, recommended, cited and dominant", () => {
    const s = computeGeoScore([r({ brandMentioned: true, recommended: true, position: 1, brandCited: true }), r({ brandMentioned: true, recommended: true, position: 1, brandCited: true })], "Me");
    expect(s.score).toBe(100);
  });

  it("computes each component deterministically from the stored results", () => {
    const responses = [
      r({ brandMentioned: true, recommended: true, position: 1, brandCited: true, competitorsMentioned: ["A"] }),
      r({ brandMentioned: true, recommended: false, position: 3, competitorsMentioned: ["A", "B"] }),
      r({ competitorsMentioned: ["A"] }),
      r({ competitorsMentioned: ["A", "B"] }),
    ];
    const s = computeGeoScore(responses, "Me");
    const by = Object.fromEntries(s.components.map((c) => [c.key, c.score]));
    expect(by.mentions).toBe(50); // 2/4
    expect(by.recommendations).toBe(25); // 1/4
    expect(by.position).toBe(80); // (100 + 60) / 2
    expect(by.citations).toBe(25); // 1/4
    expect(by.shareOfVoice).toBe(50); // me 2 mentions vs leader A 4
    expect(s.score).toBe(Math.round(50 * 0.3 + 25 * 0.25 + 80 * 0.2 + 25 * 0.15 + 50 * 0.1));
    // same input, same output
    expect(computeGeoScore(responses, "Me")).toEqual(s);
  });

  it("redistributes the citation weight when no engine can browse", () => {
    const responses = [
      r({ brandMentioned: true, recommended: true, position: 1, citationsMeasured: false, competitorsMentioned: ["A"] }),
      r({ citationsMeasured: false, competitorsMentioned: ["A"] }),
    ];
    const s = computeGeoScore(responses, "Me");
    const cit = s.components.find((c) => c.key === "citations")!;
    expect(cit).toMatchObject({ measured: false, weight: 0 });
    expect(s.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1);
    // mentions 50, recs 50, position 100, SoV 50 -> weighted over 85% and rescaled
    expect(s.score).toBe(Math.round((50 * 0.3 + 50 * 0.25 + 100 * 0.2 + 50 * 0.1) / 0.85));
    // a perfect brand still reaches 100 without citations
    expect(computeGeoScore([r({ brandMentioned: true, recommended: true, position: 1, citationsMeasured: false })], "Me").score).toBe(100);
  });

  it("only counts citations over answers that could cite", () => {
    const s = computeGeoScore([r({ brandCited: true }), r({ citationsMeasured: false })], "Me");
    expect(s.components.find((c) => c.key === "citations")!.score).toBe(100);
  });

  it("handles no responses without NaN", () => {
    const s = computeGeoScore([], "Me");
    expect(s.score).toBe(0);
    expect(s.components.every((c) => Number.isFinite(c.score))).toBe(true);
  });

  it("maps positions to scores", () => {
    expect(positionToScore(1)).toBe(100);
    expect(positionToScore(2)).toBe(80);
    expect(positionToScore(5)).toBe(20);
    expect(positionToScore(9)).toBe(10);
    expect(positionToScore(0)).toBe(0);
  });
});

describe("share of voice", () => {
  it("counts each brand once per answer and sorts by mentions", () => {
    const sov = shareOfVoice([r({ brandMentioned: true, competitorsMentioned: ["A", "A"] }), r({ competitorsMentioned: ["A", "B"] })], "Me");
    expect(sov.map((s) => [s.name, s.mentions])).toEqual([["A", 2], ["Me", 1], ["B", 1]]);
    expect(sov.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });

  it("per-provider visibility", () => {
    expect(providerVisibility([r({ brandMentioned: true }), r(), r({ provider: "gemini", brandMentioned: true })])).toEqual({
      openai: { mentionRate: 50, responses: 2 },
      gemini: { mentionRate: 100, responses: 1 },
    });
  });
});
