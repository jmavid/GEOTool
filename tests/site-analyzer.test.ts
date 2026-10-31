import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aiBotsBlockedByRobots, parseHtml, pickRelevantPages } from "@/lib/analyzer/html";

const html = readFileSync(path.join(__dirname, "fixtures/example-site.html"), "utf8");

describe("parseHtml on the example site", () => {
  const page = parseHtml(html, "https://www.facturalia.example/");

  it("extracts title, meta, headings, lang", () => {
    expect(page.title).toMatch(/^Facturalia/);
    expect(page.metaDescription).toMatch(/autónomos/);
    expect(page.lang).toBe("es");
    expect(page.h1).toEqual(["Facturación online para autónomos"]);
    expect(page.h2).toHaveLength(2);
    expect(page.ogSiteName).toBe("Facturalia");
  });

  it("reads JSON-LD from @graph and survives broken blocks", () => {
    expect(page.jsonLdTypes).toEqual(expect.arrayContaining(["Organization", "SoftwareApplication"]));
    expect(page.jsonLdOrgName).toBe("Facturalia S.L.");
  });

  it("keeps only visible text (no scripts, nav, footer)", () => {
    expect(page.text).toMatch(/20\.000 autónomos/);
    expect(page.text).not.toMatch(/console\.log|Entrar|©/);
  });

  it("picks a few relevant internal pages and skips login/legal/external", () => {
    const picked = pickRelevantPages(page.internalLinks);
    expect(picked).toEqual(["https://www.facturalia.example/precios", "https://www.facturalia.example/funcionalidades", "https://www.facturalia.example/sobre-nosotros"]);
  });
});

describe("robots.txt AI crawler rules", () => {
  it("detects AI bots blocked from the whole site", () => {
    const robots = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n";
    expect(aiBotsBlockedByRobots(robots)).toEqual(["GPTBot", "CCBot"]);
  });
  it("applies the wildcard group to bots without their own group", () => {
    expect(aiBotsBlockedByRobots("User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /")).not.toContain("ClaudeBot");
    expect(aiBotsBlockedByRobots("User-agent: *\nDisallow: /")).toContain("PerplexityBot");
  });
  it("ignores partial disallows", () => {
    expect(aiBotsBlockedByRobots("User-agent: GPTBot\nDisallow: /private")).toEqual([]);
  });
});
