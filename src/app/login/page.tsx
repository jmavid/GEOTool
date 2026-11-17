import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Sign in | GEO Garner", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = paidPlan((await searchParams).plan);
  if (await currentUser()) redirect(plan ? `/pricing?plan=${plan}` : "/dashboard");
  return (
    <AuthShell
      title="Sign in to GEO Garner"
      subtitle={plan ? "Then you'll continue to checkout." : undefined}
      footer={
        <>
          New here? <AuthLink href={plan ? `/signup?plan=${plan}` : "/signup"}>Create an account</AuthLink>
        </>
      }
    >
      <SignInForm turnstileSiteKey={turnstileSiteKey()} plan={plan} />
    </AuthShell>
  );
}
