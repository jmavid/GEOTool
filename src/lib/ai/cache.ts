import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const TTL_MS = () => Number(process.env.LLM_CACHE_TTL_HOURS ?? 72) * 3_600_000;

export function cacheKey(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

async function cacheGet<T>(key: string): Promise<T | null> {
  const row = await getDb().query.llmCache.findFirst({ where: eq(schema.llmCache.key, key) });
  if (!row || Date.now() - row.createdAt.getTime() > TTL_MS()) return null;
  return row.value as T;
}

async function cacheSet(key: string, value: unknown): Promise<void> {
  await getDb()
    .insert(schema.llmCache)
    .values({ key, value, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.llmCache.key, set: { value, createdAt: new Date() } });
}

/** Runs fn once per key within the TTL; concurrent identical calls in-process share one promise. */
const inflight = new Map<string, Promise<unknown>>();
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit) return { value: hit, hit: true };
  if (inflight.has(key)) return { value: (await inflight.get(key)) as T, hit: true };
  const p = fn();
  inflight.set(key, p);
  try {
    const value = await p;
    await cacheSet(key, value);
    return { value, hit: false };
  } finally {
    inflight.delete(key);
  }
}
