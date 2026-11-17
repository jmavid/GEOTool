import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/auth/route-helpers";
import { requestPasswordReset } from "@/lib/auth/session";

const Body = z.object({ email: z.string().trim().max(254).pipe(z.email()), turnstileToken: z.string().max(2048).optional() });

/** Password recovery: emails a reset link if the address has an account. Same answer either way. */
export async function POST(req: Request) {
  return authRoute(req, "forgot", Body, "Enter a valid email address.", async (d, ip) => {
    await requestPasswordReset(d.email, ip);
    return NextResponse.json({ ok: true });
  });
}
