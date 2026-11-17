import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { emailConfigured } from "@/lib/email/send";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Sign up | GEO Garner", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = paidPlan((await searchParams).plan);
  if (await currentUser()) redirect(plan ? `/pricing?plan=${plan}` : "/dashboard");
  return (
    <AuthShell
      title="Sign up to GEO Garner"
      subtitle={plan ? "Create your account, then you'll continue to checkout." : "Track how AI assistants talk about your business."}
      footer={
        <>
          Already have an account? <AuthLink href={plan ? `/login?plan=${plan}` : "/login"}>Sign in</AuthLink>
        </>
      }
    >
      {emailConfigured() ? (
        <SignUpForm turnstileSiteKey={turnstileSiteKey()} plan={plan} />
      ) : (
        <p className="text-center text-[15px] text-muted-foreground">Accounts are opening soon. Meanwhile, the free check on the home page works without one.</p>
      )}
    </AuthShell>
  );
}
