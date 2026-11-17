import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { usableTokenPurpose } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";

export const metadata: Metadata = { title: "Confirm your email | GEO Garner", robots: { index: false }, referrer: "same-origin" };

/** Landing page of the sign-up confirmation email. It only spends the token on the button press (a POST), never on this GET. */
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ plan?: string }> }) {
  const [{ token }, { plan }] = await Promise.all([params, searchParams]);
  const purpose = await usableTokenPurpose(token);
  if (purpose !== "verify" && purpose !== "login") {
    return (
      <AuthShell title="This link has expired" subtitle="Confirmation links work once and for 15 minutes. Sign up again to get a new one, or sign in if you already confirmed.">
        <div className="flex flex-col gap-3">
          <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
            Sign up again
          </Link>
          <Link href="/login" className="text-center text-sm text-foreground underline underline-offset-2">
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={purpose === "verify" ? "Confirm your email" : "Sign in to GEO Garner"} subtitle={purpose === "verify" ? "One click and your account is ready." : undefined}>
      <form method="post" action="/api/auth/verify">
        <input type="hidden" name="token" value={token} />
        {paidPlan(plan) && <input type="hidden" name="plan" value={paidPlan(plan)!} />}
        <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
          {purpose === "verify" ? "Confirm and open my account" : "Continue"}
        </button>
      </form>
    </AuthShell>
  );
}
