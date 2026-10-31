import { isPublicIp, validatePublicUrl, UrlValidationError } from "./url";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

const USER_AGENT = "Mozilla/5.0 (compatible; GEOScoreBot/0.1)";
const DOH_URL = "https://cloudflare-dns.com/dns-query";

type Resolver = (hostname: string) => Promise<string[]>;

/** Resolves A + AAAA records over DNS-over-HTTPS (works on Workers, where node:dns is unavailable). */
export const dohResolve: Resolver = async (hostname) => {
  const lookups = ["A", "AAAA"].map(async (type) => {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
    const data = (await res.json()) as { Answer?: { type: number; data: string }[] };
    // type 1 = A, 28 = AAAA (CNAME records in the chain are skipped)
    return (data.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  });
  return (await Promise.all(lookups)).flat();
};

/** Throws unless the hostname resolves, and only to public unicast addresses. */
export async function assertResolvesPublic(hostname: string, resolve: Resolver = dohResolve): Promise<void> {
  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new UrlValidationError("We couldn't resolve that domain.");
  }
  if (!addresses.length) throw new UrlValidationError("That domain doesn't exist or has no website.");
  if (addresses.some((a) => !isPublicIp(a))) throw new UrlValidationError("That address resolves to a private network.");
}

async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      chunks.push(value.subarray(0, value.byteLength - (size - maxBytes)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return { body: new TextDecoder().decode(all), truncated };
}

/**
 * GET a user-supplied URL with SSRF protection: strict URL validation, DNS check that every
 * resolved address is public, manual redirects re-validated hop by hop, timeout and size cap.
 * On Cloudflare the `global_fetch_strictly_public` flag adds a platform-level guarantee on top.
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}, resolve: Resolver = dohResolve): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxBytes ?? 1_500_000;
  const maxRedirects = options.maxRedirects ?? 4;
  const accept = options.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5";
  const signal = AbortSignal.timeout(timeoutMs);

  let url = validatePublicUrl(input.toString());
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertResolvesPublic(url.hostname, resolve);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": USER_AGENT, accept, "accept-language": "en,es;q=0.8,*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new Error(`Redirect without location from ${url}`);
      url = validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    const { body, truncated } = await readCapped(res, maxBytes);
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body, truncated };
  }
  throw new UrlValidationError("Too many redirects.");
}
