import { NextResponse } from "next/server";
import { z } from "zod";
import { requestLoginLink, sameOrigin } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { publicMessage } from "@/lib/errors";
import { burstLimited, clientIp } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

const Body = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  plan: z.string().max(20).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const ip = clientIp(req);
  if (burstLimited(`login:${ip}`)) return NextResponse.json({ error: "Too many requests. Slow down a little." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return NextResponse.json({ error: "We couldn't verify you're human. Refresh the page and try again." }, { status: 403 });
  }
  try {
    await requestLoginLink(parsed.data.email, ip, paidPlan(parsed.data.plan));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = publicMessage(err);
    if (message.startsWith("Something went wrong")) console.error("login link failed:", err);
    return NextResponse.json({ error: message }, { status: message.startsWith("Something went wrong") ? 500 : 400 });
  }
}
