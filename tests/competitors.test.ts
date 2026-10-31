import { describe, expect, it } from "vitest";
import { BrandRegistry, mergeVerdict, type ResponseAnalysis } from "@/lib/pipeline/analyze-response";
import { makeBrandRef } from "@/lib/pipeline/detect";
import { buildEvidence } from "@/lib/pipeline/insights";
import type { SiteFacts } from "@/lib/analyzer/site";

const target = makeBrandRef("Facturalia", ["Facturalia App"], "facturalia.es");
const known = [makeBrandRef("Holded", [], "holded.com"), makeBrandRef("Quipu", [], "getquipu.com")];

describe("competitor extraction", () => {
  it("canonicalizes spelling variants to known competitors and keeps new brands", () => {
    const reg = new BrandRegistry(target, known);
    expect(reg.canonical("HOLDED")).toBe("Holded");
    expect(reg.canonical("Holded ERP")).toBe("Holded");
    expect(reg.canonical("Billin")).toBe("Billin");
    expect(reg.canonical("billin")).toBe("Billin");
    expect(reg.canonical("Facturalia")).toBeNull();
  });

  it("merges literal detection with the LLM pass", () => {
    const answer = "1. Holded – complete ERP\n2. Billin – simple invoicing\n3. Quipu";
    const llm: ResponseAnalysis = {
      brands: [
        { name: "Holded", rank: 1, recommended: true },
        { name: "Billin", rank: 2, recommended: true },
        { name: "Quipu", rank: 3, recommended: false },
      ],
      target: { mentioned: false, recommended: false, sentiment: null, context: null },
    };
    const v = mergeVerdict(answer, [], target, known, llm, new BrandRegistry(target, known));
    expect(v.brandMentioned).toBe(false);
    expect(v.competitorsMentioned.sort()).toEqual(["Billin", "Holded", "Quipu"]);
  });

  it("trusts the LLM for semantic variants the literal pass misses", () => {
    const answer = "1. Holded\n2. The Facturalia invoicing app from Spain";
    const llm: ResponseAnalysis = {
      brands: [{ name: "Holded", rank: 1, recommended: true }, { name: "Facturalia", rank: 2, recommended: true }],
      target: { mentioned: true, recommended: true, sentiment: "positive", context: "The Facturalia invoicing app" },
    };
    const v = mergeVerdict(answer, [], target, known, llm, new BrandRegistry(target, known));
    expect(v).toMatchObject({ brandMentioned: true, recommended: true, position: 2 });
  });

  it("never lets a negative mention count as a recommendation", () => {
    const llm: ResponseAnalysis = { brands: [], target: { mentioned: true, recommended: true, sentiment: "negative", context: null } };
    const v = mergeVerdict("Avoid Facturalia.", [], target, known, llm, new BrandRegistry(target, known));
    expect(v.brandMentioned).toBe(true);
    expect(v.recommended).toBe(false);
  });

  it("works without the LLM (deterministic fallback)", () => {
    const v = mergeVerdict("1. Quipu\n2. Facturalia", [{ url: "https://facturalia.es/precios" }], target, known, null, new BrandRegistry(target, known));
    expect(v).toMatchObject({ brandMentioned: true, recommended: true, position: 2, brandCited: true, competitorsMentioned: ["Quipu"] });
  });
});

describe("evidence for 'why you're losing'", () => {
  it("aggregates categories, cited domains (excluding own) and lost queries", () => {
    const facts = { domain: "facturalia.es", aiBotsBlocked: ["GPTBot"], hasOrganizationSchema: true, hasProductSchema: true, hasFaqSchema: false, llmsTxtFound: false, sitemapFound: true, metaDescription: "x", homepageWordCount: 800, h1: ["x"] } as unknown as SiteFacts;
    const e = buildEvidence(facts, [
      { prompt: "best invoicing app", category: "DISCOVERY", brandMentioned: false, competitorsMentioned: ["Holded"], citations: [{ url: "https://g2.com/x" }, { url: "https://facturalia.es" }] },
      { prompt: "holded vs quipu", category: "COMPARISON", brandMentioned: true, competitorsMentioned: ["Holded", "Quipu"], citations: [{ url: "https://www.g2.com/y" }] },
    ]);
    expect(e.topCitedDomains).toEqual([{ domain: "g2.com", count: 2 }]);
    expect(e.lostQueries).toEqual([{ prompt: "best invoicing app", competitors: ["Holded"] }]);
    expect(e.technicalIssues[0]).toMatch(/GPTBot/);
    expect(e.categoryStats.find((c) => c.category === "COMPARISON")?.mentionRate).toBe(100);
  });
});
