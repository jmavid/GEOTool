import { timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Workers secrets reach process.env in production, but `next dev` only exposes .dev.vars through the context. */
function internalSecret(): string {
  if (process.env.INTERNAL_SECRET) return process.env.INTERNAL_SECRET;
  try {
    return (getCloudflareContext().env as unknown as { INTERNAL_SECRET?: string }).INTERNAL_SECRET ?? "";
  } catch {
    return "";
  }
}

/** True only for calls from worker.js (queue consumer, cron) carrying INTERNAL_SECRET through the self binding. */
export function isInternalRequest(req: Request): boolean {
  const expected = internalSecret();
  const given = req.headers.get("x-internal-secret") ?? "";
  return !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
