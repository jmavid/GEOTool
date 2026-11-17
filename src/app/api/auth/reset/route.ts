import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PASSWORD } from "@/lib/auth/password";
import { authRoute } from "@/lib/auth/route-helpers";
import { resetPassword, startSession } from "@/lib/auth/session";

const Body = z.object({ token: z.string().max(64), password: z.string().max(MAX_PASSWORD), turnstileToken: z.string().optional() });

/** The reset page's form: spends the emailed link, sets the new password and signs in. */
export async function POST(req: Request) {
  return authRoute(
    req,
    "reset",
    Body,
    "Enter a new password.",
    async (d) => {
      const user = await resetPassword(d.token, d.password);
      if (!user) return NextResponse.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 400 });
      await startSession(user.id);
      return NextResponse.json({ ok: true, next: "/dashboard" });
    },
    false, // the emailed one-time link already proves it's a person with the inbox
  );
}
