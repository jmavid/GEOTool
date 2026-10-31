import { describe, expect, it } from "vitest";
import { parseJsonLoose, parseWithSchema } from "@/lib/ai/json";
import { ResponseAnalysisSchema } from "@/lib/pipeline/analyze-response";
import { BrandProfileSchema } from "@/lib/pipeline/profile";
import { InsightsSchema } from "@/lib/pipeline/insights";
import { dedupeQueries, planQuerySet } from "@/lib/pipeline/queries";

describe("parseJsonLoose", () => {
  it("parses plain, fenced and prose-wrapped JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! Here it is: {"a":1} Hope it helps')).toEqual({ a: 1 });
  });
  it("returns undefined for garbage", () => {
    expect(parseJsonLoose("not json at all")).toBeUndefined();
    expect(parseJsonLoose('{"a":')).toBeUndefined();
    expect(parseJsonLoose("")).toBeUndefined();
    expect(parseJsonLoose(null)).toBeUndefined();
  });
});

describe("schemas tolerate partially wrong AI output", () => {
  it("response analysis: bad fields fall back to safe defaults", () => {
    const v = parseWithSchema('{"brands":"oops","target":{"mentioned":"yes","sentiment":"ecstatic"}}', ResponseAnalysisSchema);
    expect(v).toEqual({ brands: [], target: { mentioned: false, recommended: false, sentiment: null, context: null } });
  });

  it("response analysis: missing target", () => {
    const v = parseWithSchema('{"brands":[{"name":"A","rank":"first","recommended":true}]}', ResponseAnalysisSchema);
    expect(v?.brands[0]).toEqual({ name: "A", rank: null, recommended: true });
    expect(v?.target.mentioned).toBe(false);
  });

  it("profile: requires a brand, normalizes codes", () => {
    expect(parseWithSchema('{"description":"x"}', BrandProfileSchema)).toBeNull();
    const p = parseWithSchema('{"brand":"Acme","countryCode":"es","languageCode":"Spanish","competitors":[{"name":"B"}]}', BrandProfileSchema);
    expect(p).toMatchObject({ brand: "Acme", countryCode: "ES", languageCode: "en", competitors: [{ name: "B", domain: null }] });
  });

  it("insights: unknown priority becomes MEDIUM, empty reasons is invalid", () => {
    expect(parseWithSchema('{"reasons":[],"actions":[]}', InsightsSchema)).toBeNull();
    const v = parseWithSchema('{"reasons":[{"title":"abc","detail":"d"}],"actions":[{"priority":"urgent!!","title":"Do it"}]}', InsightsSchema);
    expect(v?.actions[0]).toMatchObject({ priority: "MEDIUM", title: "Do it", difficulty: "Medium" });
  });
});

describe("query dedupe", () => {
  it("removes duplicates and queries containing the brand", () => {
    const out = dedupeQueries(
      [
        { text: "Best CRM for startups?", category: "DISCOVERY" },
        { text: "best crm for startups", category: "DISCOVERY" },
        { text: "Is Acme good?", category: "RECOMMENDATION" },
        { text: "CRM pricing for SMBs", category: "PURCHASE_INTENT" },
      ],
      "Acme",
      10,
    );
    expect(out.map((q) => q.text)).toEqual(["Best CRM for startups?", "CRM pricing for SMBs"]);
  });
});

describe("verbose model output is clipped, not rejected", () => {
  it("keeps the first items of over-long lists and truncates long strings", () => {
    const products = Array.from({ length: 15 }, (_, i) => `Product ${i}`);
    const p = parseWithSchema(JSON.stringify({ brand: "Acme", description: "x".repeat(900), products }), BrandProfileSchema);
    expect(p?.products).toHaveLength(10);
    expect(p?.description).toHaveLength(400);
  });

  it("insights survive long details and too many actions", () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({ priority: "HIGH", title: `Action ${i}`, action: "y".repeat(2000) }));
    const v = parseWithSchema(JSON.stringify({ reasons: [{ title: "Why", detail: "z".repeat(2000) }], actions }), InsightsSchema);
    expect(v?.actions).toHaveLength(12);
    expect(v?.actions[0].action).toHaveLength(800);
    expect(v?.reasons[0].detail).toHaveLength(600);
  });
});

describe("question set reuse", () => {
  const prev = Array.from({ length: 25 }, (_, i) => ({ text: `Question number ${i}`, category: "DISCOVERY" as const }));

  it("first analysis generates everything", () => {
    expect(planQuerySet([], 25)).toEqual({ reuse: [], missing: 25 });
  });

  it("later analyses reuse the exact same questions in the same order, with nothing new to pay for", () => {
    const plan = planQuerySet(prev, 25);
    expect(plan.reuse).toEqual(prev);
    expect(plan.missing).toBe(0);
  });

  it("a bigger plan keeps the old questions and only fills the gap", () => {
    expect(planQuerySet(prev, 100)).toMatchObject({ reuse: prev, missing: 75 });
  });

  it("a smaller limit keeps the first questions", () => {
    expect(planQuerySet(prev, 10).reuse).toEqual(prev.slice(0, 10));
  });
});
