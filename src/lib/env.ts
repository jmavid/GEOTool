import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Worker vars and secrets reach process.env in production; `next dev` only exposes .dev.vars through the context. */
export function env(name: string): string {
  const value = process.env[name];
  if (value) return value;
  try {
    return String((getCloudflareContext().env as unknown as Record<string, unknown>)[name] ?? "");
  } catch {
    return "";
  }
}
