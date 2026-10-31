import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/panel";
import { loginTokenUsable } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in | GEO Score", robots: { index: false }, referrer: "same-origin" };

/** Landing page of the email link. It only spends the token on the button press (a POST), never on this GET. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await loginTokenUsable(token))) {
    return (
      <Panel title="This sign-in link has expired">
        <p>Links work once and for 15 minutes.</p>
        <Link href="/login" className="inline-flex h-11 items-center self-start rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
          Send a new link
        </Link>
      </Panel>
    );
  }
  return (
    <Panel title="Sign in to GEO Score">
      <form method="post" action="/api/auth/verify">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
          Continue
        </button>
      </form>
    </Panel>
  );
}
