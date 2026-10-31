import { describe, expect, it } from "vitest";
import { buildBrandVariants, detectInResponse, extractListItems, isDomainCited, makeBrandRef, mentions, normalizeText, rankBrands } from "@/lib/pipeline/detect";

describe("normalization", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalizeText("Café-Bar  S.L.")).toBe("cafe bar s l");
    expect(normalizeText("Ñandú & Co.")).toBe("nandu and co");
  });
});

describe("brand variants", () => {
  it("covers camelCase, compact, legal suffixes and domain", () => {
    const v = buildBrandVariants("HubSpot Inc.", [], "hubspot.com");
    expect(v).toEqual(expect.arrayContaining(["hubspot", "hub spot"]));
    expect(v).not.toContain("inc");
  });

  it("drops tiny variants to avoid false positives", () => {
    expect(buildBrandVariants("AI", [])).toEqual([]);
  });
});

describe("mentions", () => {
  const hubspot = makeBrandRef("HubSpot", [], "hubspot.com");
  it.each([
    "I recommend HubSpot for small teams",
    "Try Hubspot CRM.",
    "hub spot is popular",
    "See hubspot.com for pricing",
    "HUBSPOT's free plan",
  ])("detects '%s'", (t) => expect(mentions(t, hubspot)).toBe(true));

  it("does not match inside other words", () => {
    const notion = makeBrandRef("Notion");
    expect(mentions("Notional value of the contract", notion)).toBe(false);
    expect(mentions("Use Notion for docs", notion)).toBe(true);
  });

  it("detects accented / unaccented variations", () => {
    const b = makeBrandRef("Facturación Ágil");
    expect(mentions("prueba facturacion agil hoy", b)).toBe(true);
  });

  it("detects brand without legal suffix", () => {
    const b = makeBrandRef("Holded Technologies S.L.", ["Holded"]);
    expect(mentions("Holded es una buena opción", b)).toBe(true);
  });
});

describe("ranking and position", () => {
  const answer = `Here are the best CRMs for small businesses:

1. **Salesforce** – the enterprise standard.
2. **Pipedrive**: great for sales pipelines. Many compare it with HubSpot.
3. **HubSpot** - free plan and marketing tools.
4. Zoho CRM - affordable.`;
  const refs = ["HubSpot", "Salesforce", "Pipedrive", "Zoho"].map((n) => makeBrandRef(n));

  it("extracts list items", () => {
    expect(extractListItems(answer)).toHaveLength(4);
  });

  it("ranks by list item head, not by first mention", () => {
    expect(rankBrands(answer, refs)).toEqual(["Salesforce", "Pipedrive", "HubSpot", "Zoho"]);
  });

  it("detects target, position, competitors", () => {
    const d = detectInResponse(answer, [], refs[0], refs.slice(1));
    expect(d.brandMentioned).toBe(true);
    expect(d.position).toBe(3);
    expect(d.competitorsMentioned).toEqual(["Salesforce", "Pipedrive", "Zoho"]);
  });

  it("falls back to order of mention in prose", () => {
    const d = detectInResponse("Most people pick Zoho, though HubSpot is also good.", [], refs[0], refs.slice(1));
    expect(d.position).toBe(2);
  });

  it("reports absence", () => {
    const d = detectInResponse("Use Salesforce.", [], refs[0], refs.slice(1));
    expect(d).toMatchObject({ brandMentioned: false, position: null, competitorsMentioned: ["Salesforce"] });
  });
});

describe("citations", () => {
  it("matches the domain and subdomains in citations or inline URLs", () => {
    expect(isDomainCited("", [{ url: "https://blog.acme.com/post" }], "acme.com")).toBe(true);
    expect(isDomainCited("see https://www.acme.com/pricing", [], "acme.com")).toBe(true);
    expect(isDomainCited("", [{ url: "https://notacme.com" }], "acme.com")).toBe(false);
    expect(isDomainCited("", [{ url: "garbage" }], "acme.com")).toBe(false);
  });
});
