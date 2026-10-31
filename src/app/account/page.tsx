import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { billingConfigured } from "@/lib/billing";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Account | GEO Score", robots: { index: false } };

const button = "inline-flex h-11 items-center rounded-xl border bg-background px-4 font-medium hover:bg-muted";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { error, saved } = await searchParams;
  const plan = PLANS[user.plan];
  const renews = user.currentPeriodEnd?.toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Account</h1>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="flex flex-col gap-4 rounded-2xl border bg-background p-6">
          <h2 className="text-lg font-semibold">Plan and billing</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Plan</dt>
            <dd>
              {plan.label}
              {plan.priceEurMonth > 0 && ` · €${plan.priceEurMonth}/month`}
            </dd>
            {user.subscriptionStatus && (
              <>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {user.subscriptionStatus === "past_due" ? "Payment failed: update your card to keep your plan" : user.subscriptionStatus}
                  {renews && user.plan !== "FREE" && ` · renews ${renews}`}
                </dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            {user.stripeCustomerId && billingConfigured() && (
              <form method="post" action="/api/billing/portal">
                <button type="submit" className={button}>
                  Manage subscription and invoices
                </button>
              </form>
            )}
            {user.plan === "FREE" && (
              <Link href="/pricing" className="inline-flex h-11 items-center rounded-xl bg-brand px-4 font-semibold text-brand-foreground hover:bg-brand/90">
                See plans
              </Link>
            )}
          </div>
        </section>

        {plan.reports && (
          <form method="post" action="/api/account" className="flex flex-col gap-3 rounded-2xl border bg-background p-6">
            <h2 className="text-lg font-semibold">Client reports</h2>
            <label htmlFor="agencyName" className="text-sm text-muted-foreground">
              Agency name shown on the reports you send to clients.
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="agencyName"
                name="agencyName"
                defaultValue={user.agencyName ?? ""}
                maxLength={80}
                placeholder="Your agency"
                className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3.5 text-[15px] outline-none focus-visible:border-brand"
              />
              <button type="submit" className={button}>
                Save
              </button>
            </div>
            {saved && (
              <p role="status" className="text-sm text-blue-700">
                Saved.
              </p>
            )}
          </form>
        )}

        <form method="post" action="/api/auth/logout">
          <button type="submit" className="text-sm font-medium underline underline-offset-2">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
