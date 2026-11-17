import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PASSWORD } from "@/lib/auth/password";
import { authRoute } from "@/lib/auth/route-helpers";
import { signUp } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";

const Body = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().max(MAX_PASSWORD),
  plan: z.string().max(20).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

/** Sign-up form: emails a confirmation link (the account is created when it's clicked). */
export async function POST(req: Request) {
  return authRoute(req, "signup", Body, "Enter a valid email address.", async (d, ip) => {
    await signUp(d.email, d.password, ip, paidPlan(d.plan));
    return NextResponse.json({ ok: true });
  });
}
