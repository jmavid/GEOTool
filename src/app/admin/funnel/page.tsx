import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { funnelSince, isOwner } from "@/lib/funnel";

export const metadata: Metadata = { title: "Funnel | GEO Garner", robots: { index: false } };

const PERIODS = [7, 30, 90] as const;
const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

/** The owner's view of the funnel: analysis launched → finished → email → account → paid. Visits live in Web Analytics. */
export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await currentUser();
  if (!user || !isOwner(user.email)) notFound();
  const requested = Number((await searchParams).days);
  const days = PERIODS.find((p) => p === requested) ?? 30;
  const steps = await funnelSince(days);
  const top = Math.max(steps[0]?.count ?? 0, 1);

  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">Funnel</h1>
            <p className="mt-1 text-sm text-muted-foreground">Last {days} days. Your own IPs and email are left out.</p>
          </div>
          <nav aria-label="Period" className="flex gap-1 rounded-xl border bg-background p-1 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/admin/funnel?days=${p}`}
                aria-current={p === days ? "page" : undefined}
                className={p === days ? "rounded-lg bg-foreground px-3 py-1.5 font-medium text-background" : "rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground"}
              >
                {p} days
              </Link>
            ))}
          </nav>
        </div>

        <section className="rounded-2xl border bg-background p-5 sm:p-6">
          <p className="text-sm font-medium">Visits</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Visitors and the pages they see are counted by Cloudflare Web Analytics (no cookies): open it in the Cloudflare dashboard under{" "}
            <a href="https://dash.cloudflare.com/?to=/:account/web-analytics" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              Analytics &amp; Logs → Web Analytics
            </a>
            .
          </p>
        </section>

        <ol className="flex flex-col gap-3">
          {steps.map((s) => (
            <li key={s.key} className="rounded-2xl border bg-background p-5 sm:p-6">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{s.label}</p>
                  <p className="text-sm text-muted-foreground">{s.hint}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-2xl font-semibold tabular-nums">{s.count}</p>
                  {s.key !== "started" && <p className="text-xs text-muted-foreground">{pct(s.fromPrevious)} of previous step</p>}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((s.count / top) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
