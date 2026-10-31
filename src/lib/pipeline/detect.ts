/**
 * Deterministic brand detection. Pure functions, no I/O: easy to test and to trust.
 * The LLM pass in analyze-response.ts complements this, it never replaces it.
 */

export interface BrandRef {
  name: string;
  domain?: string | null;
  variants: string[];
}

const LEGAL_SUFFIXES =
  /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|gmbh|ag|sa|s a|sl|s l|slu|sau|sas|srl|bv|nv|plc|oy|ab|as|pty|spa|s p a)\b\.?$/;

/** Lowercase, strip accents and punctuation, collapse whitespace. "Café-Bar S.L." -> "cafe bar s l" */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function stripLegalSuffix(normalized: string): string {
  let prev = "";
  let cur = normalized;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(LEGAL_SUFFIXES, "").trim();
  }
  return cur || normalized;
}

function splitCamel(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function domainLabel(domain: string): string {
  const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const parts = host.split(".");
  if (parts.length > 2 && ["co", "com", "org", "net"].includes(parts[parts.length - 2])) return parts[parts.length - 3];
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

/**
 * All normalized spellings we accept for a brand: original, without legal suffix,
 * camelCase split ("HubSpot" -> "hub spot"), compact ("hub spot" -> "hubspot"), domain label.
 * Variants shorter than 3 chars are dropped to avoid false positives.
 */
export function buildBrandVariants(name: string, aliases: string[] = [], domain?: string | null): string[] {
  const raw = [name, ...aliases];
  if (domain) raw.push(domainLabel(domain), domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
  const out = new Set<string>();
  for (const r of raw) {
    if (!r) continue;
    for (const form of [r, splitCamel(r)]) {
      const n = normalizeText(form);
      const base = stripLegalSuffix(n);
      for (const v of [n, base]) {
        if (!v) continue;
        out.add(v);
        const compact = v.replace(/ /g, "");
        if (compact.length >= 4) out.add(compact);
        // "hubspot" -> also match "hub spot" only when we already know the split form (handled by splitCamel)
      }
      // Domain-like "acme.io" normalizes to "acme io"; also keep the label alone.
      const label = base.split(" ")[0];
      if (/\.(com|io|ai|app|co|net|org|es|de|fr|uk)\b/i.test(r) && label.length >= 4) out.add(label);
    }
  }
  return [...out].filter((v) => v.replace(/ /g, "").length >= 3);
}

export function makeBrandRef(name: string, aliases: string[] = [], domain?: string | null): BrandRef {
  return { name, domain: domain ?? null, variants: buildBrandVariants(name, aliases, domain) };
}

/** Index (in normalized text) of the first whole-word occurrence of any variant, or -1. */
export function findMention(normalizedText: string, variants: string[]): number {
  const padded = ` ${normalizedText} `;
  let best = -1;
  for (const v of variants) {
    const i = padded.indexOf(` ${v} `);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

export function mentions(text: string, ref: BrandRef): boolean {
  return findMention(normalizeText(text), ref.variants) >= 0;
}

const LIST_ITEM = /^\s{0,3}(?:#{1,4}\s*)?(?:\d{1,2}[.)]|[-*•–]|\*\*)\s*/;

/** Top-level list items / numbered headings, in order. Each item includes its continuation lines. */
export function extractListItems(text: string): string[] {
  const items: string[] = [];
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (LIST_ITEM.test(line) && !/^\s{4,}/.test(line)) {
      if (current !== null) items.push(current);
      current = line.replace(LIST_ITEM, "");
    } else if (current !== null && line.trim()) {
      current += ` ${line.trim()}`;
    } else if (current !== null && !line.trim()) {
      items.push(current);
      current = null;
    }
  }
  if (current !== null) items.push(current);
  return items.filter((i) => i.trim().length > 0);
}

/** The "head" of a list item: the part before the first colon/dash, usually the product name. */
function itemHead(item: string): string {
  return item.split(/:|\s[–—-]\s|\.\s/)[0].slice(0, 100);
}

/**
 * Orders the brands that appear in an answer. If the answer is a list, the rank is the
 * list item where the brand is named (head first); otherwise, order of first mention.
 */
export function rankBrands(text: string, brands: BrandRef[]): string[] {
  const normalized = normalizeText(text);
  const present = brands.filter((b) => findMention(normalized, b.variants) >= 0);
  const items = extractListItems(text);

  const score = (b: BrandRef): number => {
    if (items.length >= 2) {
      const headIdx = items.findIndex((it) => findMention(normalizeText(itemHead(it)), b.variants) >= 0);
      if (headIdx >= 0) return headIdx * 1_000_000;
      const anyIdx = items.findIndex((it) => findMention(normalizeText(it), b.variants) >= 0);
      if (anyIdx >= 0) return anyIdx * 1_000_000 + 500_000;
    }
    return 100_000_000 + findMention(normalized, b.variants);
  };
  return present
    .map((b) => ({ name: b.name, s: score(b) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.name);
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sameSite(host: string, domain: string): boolean {
  const d = domain.replace(/^www\./, "").toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

/** True if any citation, or any URL written in the answer, points to the brand's domain. */
export function isDomainCited(text: string, citations: { url: string }[], domain: string): boolean {
  const urls = [...citations.map((c) => c.url), ...(text.match(/https?:\/\/[^\s)\]>"']+/g) ?? [])];
  return urls.some((u) => {
    const h = hostOf(u);
    return !!h && sameSite(h, domain);
  });
}

export interface DeterministicDetection {
  brandMentioned: boolean;
  position: number | null;
  ranked: string[];
  competitorsMentioned: string[];
  brandCited: boolean;
}

export function detectInResponse(
  text: string,
  citations: { url: string }[],
  target: BrandRef,
  competitors: BrandRef[],
): DeterministicDetection {
  const ranked = rankBrands(text, [target, ...competitors]);
  const idx = ranked.indexOf(target.name);
  return {
    brandMentioned: idx >= 0,
    position: idx >= 0 ? idx + 1 : null,
    ranked,
    competitorsMentioned: ranked.filter((n) => n !== target.name),
    brandCited: target.domain ? isDomainCited(text, citations, target.domain) : false,
  };
}
