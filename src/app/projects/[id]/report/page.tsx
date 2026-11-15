import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Panel } from "@/components/panel";
import { currentUser } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";
import { clientReport, type ClientReportSite } from "@/lib/projects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Client report | GEO Garner", robots: { index: false } };

export default async function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  let report: Awaited<ReturnType<typeof clientReport>>;
  try {
    report = await clientReport(user, id);
  } catch (err) {
    return (
      <Panel title="Client report unavailable">
        <p>{publicMessage(err)}</p>
      </Panel>
    );
  }
  const today = new Date().toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex-1 bg-surface print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-8 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/dashboard" className="text-sm underline underline-offset-2">
            Back to dashboard
          </Link>
          <PrintButton />
        </div>

        <header className="flex flex-col gap-1 border-b pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {report.agencyName ? `${report.agencyName} · ` : ""}AI visibility report · {today}
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{report.project.name}</h1>
          <p className="text-sm text-muted-foreground">How AI assistants mention and recommend each brand when buyers ask for options. Scores go from 0 to 100.</p>
        </header>

        {report.sites.length === 0 && <p className="text-sm text-muted-foreground">This project has no websites yet.</p>}
        {report.sites.map((s) => (
          <SiteSection key={s.domain} site={s} />
        ))}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Results come from real questions asked to AI models. Answers vary over time; the trend matters more than one run.
        </p>
      </div>
    </div>
  );
}

function SiteSection({ site }: { site: ClientReportSite }) {
  const pct = (n: number) => (site.responses ? Math.round((n / site.responses) * 100) : 0);
  const delta = site.score !== null && site.previous !== null ? site.score - site.previous : null;
  const rated = site.sentiment.positive + site.sentiment.neutral + site.sentiment.negative;

  return (
    <section className="flex break-inside-avoid flex-col gap-5 rounded-2xl border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{site.brand}</h2>
          <p className="text-sm text-muted-foreground">
            {site.domain}
            {site.date && ` · analyzed ${site.date.toLocaleDateString("en", { month: "short", day: "numeric" })}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold tabular-nums">{site.score ?? "–"}</p>
          {delta !== null && (
            <p className={cn("text-sm font-medium", delta > 0 ? "text-blue-700" : delta < 0 ? "text-orange-800" : "text-muted-foreground")}>
              {delta > 0 ? `+${delta}` : delta === 0 ? "no change" : delta} since last run
            </p>
          )}
        </div>
      </div>

      {site.score === null ? (
        <p className="text-sm text-muted-foreground">No completed analysis yet.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Mentioned", `${pct(site.mentioned)}%`],
              ["Recommended", `${pct(site.recommended)}%`],
              ["Positive tone", rated ? `${Math.round((site.sentiment.positive / rated) * 100)}%` : "–"],
              ["Trend", site.history.length > 1 ? site.history.join(" → ") : "first run"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {site.competitors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Share of voice</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {site.competitors.map((c) => `${c.isTarget ? `${c.name} (client)` : c.name} ${Math.round(c.share * 100)}%`).join(" · ")}
              </p>
            </div>
          )}

          {site.fixes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Next steps</h3>
              <ol className="mt-2 space-y-2 text-sm">
                {site.fixes.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      {i + 1}. {f.title}
                    </span>
                    <span className="text-muted-foreground"> {f.action}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}
