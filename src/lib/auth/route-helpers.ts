import { NextResponse } from "next/server";
import type { z } from "zod";
import { sameOrigin } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";
import { burstLimited, clientIp } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

const json = (body: object, status = 200) => NextResponse.json(body, { status });

/**
 * Shared checks for the account forms: same origin, burst limit per IP, body shape and (when `turnstile`) the bot check.
 * Then runs `handle` and turns a UserError into a 400 with its message.
 */
export async function authRoute<T extends { turnstileToken?: string }>(
  req: Request,
  name: string,
  schema: z.ZodType<T>,
  invalid: string,
  handle: (data: T, ip: string) => Promise<NextResponse>,
  turnstile = true,
): Promise<NextResponse> {
  if (!sameOrigin(req)) return json({ error: "Forbidden." }, 403);
  const ip = clientIp(req);
  if (burstLimited(`${name}:${ip}`)) return json({ error: "Too many requests. Slow down a little." }, 429);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: invalid }, 400);
  if (turnstile && !(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return json({ error: "We couldn't verify you're human. Refresh the page and try again." }, 403);
  }
  try {
    return await handle(parsed.data, ip);
  } catch (err) {
    const message = publicMessage(err);
    const unexpected = message.startsWith("Something went wrong");
    if (unexpected) console.error(`${name} failed:`, err);
    return json({ error: message }, unexpected ? 500 : 400);
  }
}
