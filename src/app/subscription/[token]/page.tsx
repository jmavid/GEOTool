import type { Metadata } from "next";
import Link from "next/link";
import { findSubscription } from "@/lib/tracking";

export const metadata: Metadata = { title: "Weekly tracking | GEO Score", robots: { index: false } };

export default async function SubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string; done?: string }>;
}) {
  const [{ token }, { action, done }] = await Promise.all([params, searchParams]);
  const sub = /^[0-9a-f-]{32,36}$/.test(token) ? await findSubscription(token) : null;

  if (!sub) {
    return (
      <Panel title="This link is no longer valid">
        <p>It may have been replaced by a newer email. You can sign up again from any report.</p>
      </Panel>
    );
  }

  const tracking = !!sub.confirmedAt && !sub.unsubscribedAt;
  if (done === "confirm" || (action === "confirm" && tracking)) {
    return (
      <Panel title={`You're tracking ${sub.domain}`}>
        <p>Every Monday we&apos;ll re-ask the same buyer questions and email {sub.email} the new GEO Score.</p>
      </Panel>
    );
  }
  if (done === "unsubscribe" || (action === "unsubscribe" && sub.unsubscribedAt)) {
    return (
      <Panel title="You're unsubscribed">
        <p>
          We won&apos;t email {sub.email} about {sub.domain} again.
        </p>
        <ActionButton token={token} action="confirm" label="Resume weekly tracking" variant="secondary" />
      </Panel>
    );
  }
  if (action === "unsubscribe") {
    return (
      <Panel title={`Stop weekly emails for ${sub.domain}?`}>
        <p>{sub.email} will no longer get the weekly GEO Score.</p>
        <ActionButton token={token} action="unsubscribe" label="Unsubscribe" variant="secondary" />
      </Panel>
    );
  }
  return (
    <Panel title={`Track ${sub.domain} every week`}>
      <p>Every Monday we&apos;ll re-ask the same buyer questions and email {sub.email} the new GEO Score. Unsubscribe anytime.</p>
      <ActionButton token={token} action="confirm" label="Confirm weekly tracking" />
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-surface px-4 py-16 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border bg-background p-7 text-[15px] leading-relaxed text-muted-foreground">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {children}
        <Link href="/" className="text-sm text-foreground underline underline-offset-2">
          Back to GEO Score
        </Link>
      </div>
    </div>
  );
}

/** A real form POST: link scanners only follow GET, so they can't confirm or unsubscribe anyone. */
function ActionButton({ token, action, label, variant = "primary" }: { token: string; action: "confirm" | "unsubscribe"; label: string; variant?: "primary" | "secondary" }) {
  return (
    <form method="post" action={`/api/subscriptions/manage?token=${token}&action=${action}`} className="mt-2">
      <button
        type="submit"
        className={
          variant === "primary"
            ? "inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90"
            : "inline-flex h-11 items-center rounded-xl border bg-background px-5 font-medium text-foreground hover:bg-muted"
        }
      >
        {label}
      </button>
    </form>
  );
}
