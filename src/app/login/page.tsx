import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Panel } from "@/components/panel";
import { currentUser } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { emailConfigured } from "@/lib/email/send";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Sign in | GEO Score", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = paidPlan((await searchParams).plan);
  if (await currentUser()) redirect(plan ? `/pricing?plan=${plan}` : "/dashboard");
  return (
    <Panel title="Sign in or create your account">
      {emailConfigured() ? (
        <>
          <p>
            No password: we email you a link that signs you in. New here? The same link creates your account.
            {plan && " Then you'll continue to checkout."}
          </p>
          <LoginForm turnstileSiteKey={turnstileSiteKey()} plan={plan} />
        </>
      ) : (
        <p>Accounts are opening soon. Meanwhile, the free check on the home page works without one.</p>
      )}
    </Panel>
  );
}
