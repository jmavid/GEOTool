import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseSender, sendEmail, type OutgoingEmail } from "./send";

/**
 * Owner notifications go through an Email Routing binding locked to the owner's verified address
 * (`"send_email": [{ "name": "OWNER_EMAIL", "destination_address": "..." }]`), so they work without onboarding a
 * sending domain in Email Service. Without that binding they fall back to the general EMAIL binding.
 */
function ownerBinding(): SendEmail | undefined {
  try {
    return (getCloudflareContext().env as unknown as { OWNER_EMAIL?: SendEmail }).OWNER_EMAIL;
  } catch {
    return undefined;
  }
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const wrap = (s: string) => s.match(/.{1,76}/g)?.join("\r\n") ?? "";
/** RFC 2047 encoded-word, so accents and "·" survive in the subject and sender name. */
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** A raw MIME message (text + HTML) for EmailMessage. Pure, so it is unit-tested. */
export function buildMime(msg: OutgoingEmail, from: { name: string; email: string }, opts: { messageId: string; date: Date }): string {
  const boundary = `b_${opts.messageId.replace(/[^a-z0-9]/gi, "")}`;
  return [
    `From: ${encodeWord(from.name)} <${from.email}>`,
    `To: ${msg.to}`,
    `Subject: ${encodeWord(msg.subject)}`,
    `Message-ID: <${opts.messageId}@${from.email.split("@")[1]}>`,
    `Date: ${opts.date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(msg.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(msg.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Returns false (never throws) when the email could not be sent. */
export async function sendOwnerEmail(msg: OutgoingEmail): Promise<boolean> {
  const binding = ownerBinding();
  const from = parseSender(process.env.OWNER_EMAIL_FROM ?? "");
  if (!binding || !from) {
    console.warn(`[email] owner notification: ${binding ? "OWNER_EMAIL_FROM is invalid" : "no OWNER_EMAIL binding"}, using the EMAIL binding`);
    return sendEmail(msg);
  }
  try {
    // Email Routing takes a raw MIME EmailMessage. "cloudflare:email" only exists in the Workers runtime, so it is
    // loaded at run time and left out of the Next.js bundle.
    const { EmailMessage } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "cloudflare:email" as string)) as {
      EmailMessage: new (from: string, to: string, raw: string) => EmailMessage;
    };
    const raw = buildMime(msg, from, { messageId: crypto.randomUUID(), date: new Date() });
    await binding.send(new EmailMessage(from.email, msg.to, raw));
    return true;
  } catch (err) {
    console.error(`[email] owner notification to ${msg.to} failed:`, err);
    return false;
  }
}
