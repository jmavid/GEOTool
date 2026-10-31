import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Cloudflare Email Service binding (`send_email` in wrangler.jsonc); absent until a sending domain is onboarded. */
function binding(): SendEmail | undefined {
  try {
    return (getCloudflareContext().env as unknown as { EMAIL?: SendEmail }).EMAIL;
  } catch {
    return undefined;
  }
}

/** "GEO Score <scores@example.com>" or a bare address. */
export function parseSender(raw: string): { name: string; email: string } | null {
  const m = raw.trim().match(/^(?:(.*?)\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))$/);
  if (!m) return null;
  return { name: (m[1] ?? "").replace(/^"|"$/g, "").trim() || "GEO Score", email: m[2] ?? m[3] };
}

const isDev = () => process.env.NODE_ENV !== "production";

/**
 * Whether emails really go out. In production that needs the EMAIL binding and EMAIL_FROM;
 * in development emails are printed to the console instead, so the whole flow can be tried locally.
 */
export function emailConfigured(): boolean {
  if (isDev()) return true;
  return !!binding() && !!parseSender(process.env.EMAIL_FROM ?? "");
}

/** Returns false (never throws) when the email could not be sent. */
export async function sendEmail(msg: OutgoingEmail): Promise<boolean> {
  const from = parseSender(process.env.EMAIL_FROM ?? "");
  const email = binding();
  if (!email || !from) {
    if (isDev()) {
      console.info(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
      return true;
    }
    console.warn("[email] not configured (EMAIL binding / EMAIL_FROM): skipped", msg.subject);
    return false;
  }
  try {
    await email.send({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
    return true;
  } catch (err) {
    console.error(`[email] send to ${msg.to} failed:`, err);
    return false;
  }
}
