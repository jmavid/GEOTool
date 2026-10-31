import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS as PLAN_IDS, type Plan } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { billingConfigured, paidPlan } from "@/lib/billing";
import { PLANS, promptsFor } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing | GEO Score",
  description: "Track how AI assistants talk about your brand every week. Plans for one site, several brands, or agencies.",
};

function features(plan: Plan): string[] {
  const p = PLANS[plan];
  return [
    `${p.websites} website${p.websites > 1 ? "s" : ""}`,
    `${promptsFor(plan)} buyer questions per analysis`,
    `${p.analysesPerMonth} analyses every 30 days`,
    p.tracking === "weekly" ? "Weekly re-check + email every Monday" : "One-off checks",
    "Competitors, sentiment and action plan",
    ...(p.reports ? ["Client projects", "Printable client reports with your agency name"] : []),
  ];
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const [{ error, plan }, user] = await Promise.all([searchParams, currentUser()]);
  const resume = user?.plan === "FREE" ? paidPlan(plan) : null;
  const live = billingConfigured();

  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-brand-ink">Pricing</p>
          <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">See if your fixes work, every week</h1>
          <p className="text-lg text-muted-foreground">Monthly plans, cancel anytime. Taxes are calculated at checkout.</p>
        </div>
        {resume && live && (
          <form method="post" action="/api/billing/checkout" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand-soft p-5">
            <p className="font-medium">You&apos;re signed in. Continue with the {PLANS[resume].label} plan?</p>
            <input type="hidden" name="plan" value={resume} />
            <button type="submit" className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
              Continue to checkout
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const p = PLANS[id];
            const current = user?.plan === id;
            const featured = id === "PRO";
            return (
              <div key={id} className={cn("flex flex-col gap-5 rounded-2xl border bg-background p-6", featured && "border-brand ring-1 ring-brand")}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{p.label}</h2>
                    {current && <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">Your plan</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.pitch}</p>
                </div>
                <p>
                  <span className="text-4xl font-semibold tracking-tight">€{p.priceEurMonth}</span>
                  {p.priceEurMonth > 0 && <span className="text-sm text-muted-foreground"> / month</span>}
                </p>
                <ul className="flex flex-1 flex-col gap-2.5 text-sm">
                  {features(id).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                {id === "FREE" ? (
                  <Link href="/#check" className="inline-flex h-11 items-center justify-center rounded-xl border font-medium hover:bg-muted">
                    Free check
                  </Link>
                ) : current ? (
                  <form method="post" action="/api/billing/portal">
                    <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-xl border font-medium hover:bg-muted">
                      Manage subscription
                    </button>
                  </form>
                ) : (
                  <form method="post" action="/api/billing/checkout">
                    <input type="hidden" name="plan" value={id} />
                    <button
                      type="submit"
                      disabled={!live}
                      className={cn(
                        "inline-flex h-11 w-full items-center justify-center rounded-xl font-semibold disabled:cursor-not-allowed disabled:opacity-50",
                        featured ? "bg-brand text-brand-foreground hover:bg-brand/90" : "bg-foreground text-background hover:bg-foreground/85",
                      )}
                    >
                      {!live ? "Opening soon" : user && user.plan !== "FREE" ? `Switch to ${p.label}` : `Get ${p.label}`}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Payments are handled by Stripe. We never see your card. Change plan, download invoices or cancel from your account page.
        </p>
      </div>
    </div>
  );
}
