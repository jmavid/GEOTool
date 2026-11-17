import type { Metadata } from "next";
import Link from "next/link";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ResetForm } from "@/components/auth-forms";
import { usableTokenPurpose } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password | GEO Garner", robots: { index: false }, referrer: "same-origin" };

/** Landing page of the password-reset email. The link is only spent when the new password is saved. */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if ((await usableTokenPurpose(token)) !== "reset") {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once and for 15 minutes.">
        <Link href="/forgot" className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
          Send a new link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <>
          Changed your mind? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
