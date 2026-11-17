import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PASSWORD } from "@/lib/auth/password";
import { authRoute } from "@/lib/auth/route-helpers";
import { signIn, startSession } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { burstLimited } from "@/lib/security/rate-limit";

const Body = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(MAX_PASSWORD),
  plan: z.string().max(20).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

/** Email + password sign-in. Answers where to go next, so the form can navigate. */
export async function POST(req: Request) {
  return authRoute(req, "signin", Body, "Enter your email and password.", async (d) => {
    // Also limited per address, so one account can't be guessed at from many IPs in a burst.
    if (burstLimited(`signin-email:${d.email.toLowerCase()}`)) return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
    const user = await signIn(d.email, d.password);
    if (!user) return NextResponse.json({ error: "Wrong email or password. If you used email links before, set a password with “Forgot password”." }, { status: 401 });
    await startSession(user.id);
    const plan = paidPlan(d.plan);
    return NextResponse.json({ ok: true, next: plan ? `/pricing?plan=${plan}` : "/dashboard" });
  });
}
