import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileText, Play, Plus, Trash2 } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { PLANS } from "@/lib/plans";
import { analysesLast30Days, dashboard, type DashboardSite } from "@/lib/projects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard | GEO Score", robots: { index: false } };

const input = "h-11 min-w-0 flex-1 rounded-xl border bg-background px-3.5 text-[15px] outline-none focus-visible:border-brand";
const primary = "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground hover:bg-brand/90";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; checkout?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [{ error, checkout }, projects, used] = await Promise.all([searchParams, dashboard(user.id), analysesLast30Days(user.id)]);
  const limits = PLANS[user.plan];
  const sites = new Set(projects.flatMap((p) => p.sites.map((s) => s.websiteId))).size;
  const agency = limits.reports;

  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">Your websites</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {limits.label} plan · {sites}/{limits.websites} websites · {used}/{limits.analysesPerMonth} analyses in the last 30 days
              {limits.tracking === "weekly" ? " · re-checked every Monday" : ""}
            </p>
          </div>
          {user.plan === "FREE" ? (
            <Link href="/pricing" className={primary}>
              Upgrade for weekly tracking <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link href="/account" className="text-sm font-medium underline underline-offset-2">
              Plan and billing
            </Link>
          )}
        </div>

        {checkout === "success" && (
          <p role="status" className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm">
            Thanks! Your plan is being activated; refresh in a few seconds if it still says Free.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-background px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {projects.map((project) => (
          <section key={project.id} id={`project-${project.id}`} className="scroll-mt-20 rounded-2xl border bg-background p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{project.name}</h2>
              {agency && project.sites.length > 0 && (
                <Link href={`/projects/${project.id}/report`} className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2">
                  <FileText className="size-4" aria-hidden /> Client report
                </Link>
              )}
            </div>

            {project.sites.length > 0 ? (
              <ul className="mt-4 divide-y rounded-xl border">
                {project.sites.map((site) => (
                  <SiteRow key={site.linkId} site={site} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No websites yet. Add one below: we run its first analysis right away.</p>
            )}

            <form method="post" action="/api/projects/websites" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="projectId" value={project.id} />
              <label htmlFor={`url-${project.id}`} className="sr-only">
                Website URL
              </label>
              <input id={`url-${project.id}`} name="url" type="text" inputMode="url" placeholder="yourwebsite.com" required className={input} />
              <button type="submit" className={primary}>
                <Plus className="size-4" aria-hidden /> Add website
              </button>
            </form>
          </section>
        ))}

        {agency && (
          <form method="post" action="/api/projects" className="flex flex-col gap-2 rounded-2xl border border-dashed border-foreground/20 p-5 sm:flex-row sm:items-center">
            <label htmlFor="project-name" className="text-sm font-medium sm:w-40">
              New client project
            </label>
            <input id="project-name" name="name" placeholder="Client name" required maxLength={80} className={input} />
            <button type="submit" className="inline-flex h-11 items-center rounded-xl border bg-background px-4 font-medium hover:bg-muted">
              Create project
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function SiteRow({ site }: { site: DashboardSite }) {
  const scores = site.history.map((h) => h.score);
  const last = scores.at(-1);
  const delta = scores.length > 1 ? last! - scores.at(-2)! : null;
  const running = site.latest && (site.latest.status === "QUEUED" || site.latest.status === "RUNNING");
  const date = site.latest?.createdAt.toLocaleDateString("en", { month: "short", day: "numeric" });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      <div className="min-w-0 flex-[1_1_200px]">
        <p className="truncate font-medium">{site.domain}</p>
        <p className="text-xs text-muted-foreground">
          {running ? "Analysis running…" : date ? `Last run ${date}` : "Not analyzed yet"}
          {scores.length > 1 && <span className="font-mono"> · {scores.join(" → ")}</span>}
        </p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{last ?? "–"}</span>
        {delta !== null && delta !== 0 && (
          <span className={cn("text-sm font-medium tabular-nums", delta > 0 ? "text-blue-700" : "text-orange-800")}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {site.latest && (
          <Link href={`/report/${site.latest.id}`} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">
            Report
          </Link>
        )}
        <form method="post" action="/api/projects/run">
          <input type="hidden" name="websiteId" value={site.websiteId} />
          <button type="submit" disabled={!!running} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <Play className="size-3.5" aria-hidden /> Run now
          </button>
        </form>
        <form method="post" action="/api/projects/websites/remove">
          <input type="hidden" name="linkId" value={site.linkId} />
          <button type="submit" aria-label={`Remove ${site.domain}`} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </li>
  );
}
