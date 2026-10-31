import * as cheerio from "cheerio/slim";

export interface PageData {
  url: string;
  title: string;
  metaDescription: string;
  lang: string;
  canonical: string;
  ogSiteName: string;
  h1: string[];
  h2: string[];
  jsonLdTypes: string[];
  jsonLdOrgName: string;
  /** Visible text, whitespace-collapsed and truncated. Never rendered as HTML. */
  text: string;
  wordCount: number;
  internalLinks: { href: string; text: string }[];
}

const MAX_TEXT_CHARS = 8_000;

const clean = (s: string | undefined) =>
  (s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function collectJsonLd($: cheerio.CheerioAPI): { types: string[]; orgName: string } {
  const types = new Set<string>();
  let orgName = "";
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    for (const type of Array.isArray(t) ? t : [t]) {
      if (typeof type === "string") {
        types.add(type);
        if (!orgName && /Organization|Corporation|LocalBusiness|Brand/.test(type) && typeof obj.name === "string") {
          orgName = obj.name;
        }
      }
    }
    if (obj["@graph"]) visit(obj["@graph"]);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  });
  return { types: [...types].slice(0, 30), orgName: clean(orgName) };
}

export function parseHtml(html: string, pageUrl: string): PageData {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const jsonLd = collectJsonLd($);

  const internalLinks: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const u = new URL(href, base);
      if (u.protocol !== "https:" && u.protocol !== "http:") return;
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
      u.hash = "";
      u.search = "";
      const key = u.toString().replace(/\/$/, "");
      if (seen.has(key) || key === base.toString().replace(/\/$/, "")) return;
      seen.add(key);
      internalLinks.push({ href: key, text: clean($(el).text()).slice(0, 80) });
    } catch {
      // ignore invalid hrefs
    }
  });

  const title = clean($("title").first().text());
  const metaDescription = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"));
  const h1 = $("h1").map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 5);
  const h2 = $("h2").map((_, el) => clean($(el).text())).get().filter(Boolean).slice(0, 20);

  $("script, style, noscript, svg, iframe, template, nav, footer, form").remove();
  const main = $("main").length ? $("main") : $("body");
  const fullText = clean(main.text());

  return {
    url: pageUrl,
    title,
    metaDescription,
    lang: clean($("html").attr("lang")).slice(0, 10),
    canonical: clean($('link[rel="canonical"]').attr("href")),
    ogSiteName: clean($('meta[property="og:site_name"]').attr("content")),
    h1,
    h2,
    jsonLdTypes: jsonLd.types,
    jsonLdOrgName: jsonLd.orgName,
    text: fullText.slice(0, MAX_TEXT_CHARS),
    wordCount: fullText ? fullText.split(" ").length : 0,
    internalLinks: internalLinks.slice(0, 200),
  };
}

const PAGE_KEYWORDS: [RegExp, number][] = [
  [/pric|precio|tarifa|plan/i, 5],
  [/product|producto|feature|funcionalidad|caracter/i, 4],
  [/solution|soluci|service|servicio/i, 4],
  [/about|nosotros|quienes|empresa|company/i, 3],
  [/compar|vs|alternativ/i, 3],
  [/use-case|casos|customers|clientes|industr/i, 2],
];
const SKIP = /login|developer|desarrollador|api-reference|referencia-api|signin|sign-in|signup|register|cart|checkout|privacy|privacidad|cookie|legal|terms|aviso|careers|empleo|\.(pdf|jpg|png|zip)$/i;

/** Picks a few high-signal internal pages (pricing, product, about...). No mass crawling. */
export function pickRelevantPages(links: { href: string; text: string }[], max = 3): string[] {
  return links
    .filter((l) => !SKIP.test(l.href))
    .map((l) => {
      const hay = `${new URL(l.href).pathname} ${l.text}`;
      const depth = new URL(l.href).pathname.split("/").filter(Boolean).length;
      const score = PAGE_KEYWORDS.reduce((s, [re, w]) => (re.test(hay) ? s + w : s), 0) - depth;
      return { href: l.href, score };
    })
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((l) => l.href);
}

export const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot"];

/** Returns the AI crawlers that robots.txt blocks from the whole site ("Disallow: /"). */
export function aiBotsBlockedByRobots(robots: string): string[] {
  const groups: { agents: string[]; disallowAll: boolean; allowRoot: boolean }[] = [];
  let current: { agents: string[]; disallowAll: boolean; allowRoot: boolean } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false, allowRoot: false };
        groups.push(current);
      }
      current.agents.push(value.trim().toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (k === "disallow" && value.trim() === "/") current.disallowAll = true;
      if (k === "allow" && value.trim() === "/") current.allowRoot = true;
    }
  }
  const blockedFor = (agent: string) => {
    const specific = groups.find((g) => g.agents.includes(agent.toLowerCase()));
    const group = specific ?? groups.find((g) => g.agents.includes("*"));
    return !!group && group.disallowAll && !group.allowRoot;
  };
  return AI_BOTS.filter(blockedFor);
}
