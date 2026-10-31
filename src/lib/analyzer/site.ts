import { UserError } from "@/lib/errors";
import { safeFetch } from "@/lib/security/safe-fetch";
import { aiBotsBlockedByRobots, parseHtml, pickRelevantPages, type PageData } from "./html";

export interface SiteFacts {
  url: string;
  finalUrl: string;
  domain: string;
  title: string;
  metaDescription: string;
  lang: string;
  h1: string[];
  h2: string[];
  jsonLdTypes: string[];
  hasOrganizationSchema: boolean;
  hasFaqSchema: boolean;
  hasProductSchema: boolean;
  homepageWordCount: number;
  pagesAnalyzed: string[];
  robotsFound: boolean;
  aiBotsBlocked: string[];
  sitemapFound: boolean;
  sitemapUrlCount: number;
  llmsTxtFound: boolean;
}

export interface SiteSnapshot {
  facts: SiteFacts;
  pages: PageData[];
}

async function fetchText(url: string, maxBytes: number): Promise<string | null> {
  try {
    const res = await safeFetch(url, { maxBytes, timeoutMs: 6_000, accept: "text/plain,application/xml,text/xml,*/*;q=0.5" });
    if (res.status !== 200) return null;
    if (/text\/html/i.test(res.contentType) && !url.endsWith(".xml")) return null; // soft 404s
    return res.body;
  } catch {
    return null;
  }
}

export async function analyzeSite(inputUrl: string): Promise<SiteSnapshot> {
  const home = await safeFetch(inputUrl);
  if (home.status >= 400) throw new UserError(`The website answered with HTTP ${home.status}.`);
  if (!/html/i.test(home.contentType)) throw new UserError("The URL does not return an HTML page.");

  const homePage = parseHtml(home.body, home.url);
  const origin = new URL(home.url).origin;

  const extraUrls = pickRelevantPages(homePage.internalLinks, 3);
  const [extraPages, robots, llmsTxt] = await Promise.all([
    Promise.all(
      extraUrls.map(async (u) => {
        try {
          const r = await safeFetch(u, { timeoutMs: 7_000, maxBytes: 800_000 });
          return r.status < 400 && /html/i.test(r.contentType) ? parseHtml(r.body, r.url) : null;
        } catch {
          return null;
        }
      }),
    ),
    fetchText(`${origin}/robots.txt`, 100_000),
    fetchText(`${origin}/llms.txt`, 50_000),
  ]);

  const sitemapUrl = robots?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? `${origin}/sitemap.xml`;
  const sitemap = await fetchText(sitemapUrl, 500_000);
  const sitemapUrlCount = sitemap ? (sitemap.match(/<loc>/gi) ?? []).length : 0;

  const pages = [homePage, ...extraPages.filter((p): p is PageData => !!p)];
  const allTypes = [...new Set(pages.flatMap((p) => p.jsonLdTypes))];

  return {
    pages,
    facts: {
      url: inputUrl,
      finalUrl: home.url,
      domain: new URL(home.url).hostname.replace(/^www\./, ""),
      title: homePage.title,
      metaDescription: homePage.metaDescription,
      lang: homePage.lang,
      h1: homePage.h1,
      h2: homePage.h2.slice(0, 12),
      jsonLdTypes: allTypes,
      hasOrganizationSchema: allTypes.some((t) => /Organization|Corporation|LocalBusiness/.test(t)),
      hasFaqSchema: allTypes.includes("FAQPage"),
      hasProductSchema: allTypes.some((t) => /Product|SoftwareApplication|Service|Offer/.test(t)),
      homepageWordCount: homePage.wordCount,
      pagesAnalyzed: pages.map((p) => p.url),
      robotsFound: robots !== null,
      aiBotsBlocked: robots ? aiBotsBlockedByRobots(robots) : [],
      sitemapFound: sitemapUrlCount > 0,
      sitemapUrlCount,
      llmsTxtFound: !!llmsTxt && llmsTxt.trim().length > 20 && !/<html/i.test(llmsTxt),
    },
  };
}

/** Compact, delimited site content for the LLM. Treated strictly as data. */
export function siteDigest(snapshot: SiteSnapshot, maxChars = 12_000): string {
  const perPage = Math.floor(maxChars / snapshot.pages.length);
  return snapshot.pages
    .map((p) =>
      [
        `URL: ${p.url}`,
        `TITLE: ${p.title}`,
        `META: ${p.metaDescription}`,
        p.jsonLdOrgName && `SCHEMA ORG NAME: ${p.jsonLdOrgName}`,
        p.ogSiteName && `OG SITE NAME: ${p.ogSiteName}`,
        `H1: ${p.h1.join(" | ")}`,
        `H2: ${p.h2.join(" | ")}`,
        `TEXT: ${p.text}`,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, perPage),
    )
    .join("\n---\n");
}
