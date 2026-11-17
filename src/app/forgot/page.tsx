import type { Metadata } from "next";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "@/components/auth-forms";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Reset your password | GEO Garner", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <ForgotForm turnstileSiteKey={turnstileSiteKey()} />
    </AuthShell>
  );
}
