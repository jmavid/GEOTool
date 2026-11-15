// Per-isolate burst limiter for the create endpoint. The durable daily limit lives in D1 (see createAnalysis).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

export function burstLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * IPs with no daily or monthly analysis limit (the owner's own), from UNLIMITED_IPS: comma-separated exact addresses,
 * or prefixes ending in "." or ":" (e.g. "2a01:db8:1234:" for an IPv6 /48 whose suffix changes).
 * Keep it in the deployed config only, never in the repo.
 */
export function unlimitedIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  const entries = (process.env.UNLIMITED_IPS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const value = ip.trim().toLowerCase();
  return entries.some((e) => (e.endsWith(".") || e.endsWith(":") ? value.startsWith(e) : value === e));
}
