"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, CircleAlert, Link as LinkIcon, RotateCcw, X } from "lucide-react";
import type { Report } from "@/lib/analyses";
import { UrlForm } from "@/components/url-form";
import { TrackForm } from "@/components/track-form";
import { cn } from "@/lib/utils";

type Result = NonNullable<Report["result"]>;

/** Pipeline stages with the progress value each one starts at (see lib/pipeline/run.ts). */
const STEPS: [string, number][] = [
  ["Reading your website", 0],
  ["Understanding your business", 15],
  ["Writing buyer questions", 25],
  ["Asking AI assistants", 30],
  ["Calculating your GEO Score", 88],
  ["Building your action plan", 92],
];

// Blue/orange rather than green/red so the tones stay distinct with color blindness.
function scoreTone(score: number) {
  if (score >= 70) return { stroke: "stroke-blue-600", bar: "bg-blue-600", chip: "bg-blue-50 text-blue-800", label: "Strong visibility", verb: "often recommend" };
  if (score >= 40) return { stroke: "stroke-amber-500", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800", label: "Needs work", verb: "sometimes mention" };
  return { stroke: "stroke-orange-600", bar: "bg-orange-600", chip: "bg-orange-50 text-orange-800", label: "Low visibility", verb: "rarely recommend" };
}

export function ReportView({ id, turnstileSiteKey, trackingLive }: { id: string; turnstileSiteKey: string | null; trackingLive: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
        if (res.status === 404) return setNotFound(true);
        const data = (await res.json()) as Report;
        if (cancelled) return;
        setReport(data);
        if (data.status === "QUEUED" || data.status === "RUNNING") timer = setTimeout(load, 2500);
      } catch {
        timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) return <Shell><p className="text-muted-foreground">This report doesn&apos;t exist.</p></Shell>;
  if (!report) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;
  if (report.status === "FAILED") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t finish this analysis</h1>
        <p className="mt-2 text-muted-foreground">{report.error}</p>
        <div className="mt-8 rounded-2xl border bg-background p-6">
          <UrlForm initialUrl={report.url} turnstileSiteKey={turnstileSiteKey} />
        </div>
      </Shell>
    );
  }
  if (!report.result) return <Running report={report} />;
  return <Completed report={report} result={report.result} trackingLive={trackingLive} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-8">{children}</div>
    </div>
  );
}

function Card({ id, title, subtitle, children, className }: { id?: string; title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-6 rounded-2xl border bg-background p-5 sm:p-7", className)}>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Running({ report }: { report: Report }) {
  const current = STEPS.findLastIndex(([, from]) => report.progress >= from);
  return (
    <Shell>
      <p className="font-mono text-xs text-muted-foreground">{report.domain}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Asking AI models about {report.profile?.brand ?? report.domain}…
      </h1>
      <p className="mt-2 text-muted-foreground">Usually 1–3 minutes. You can leave this page: the report link keeps working.</p>

      <section className="mt-8 rounded-2xl border bg-background p-5 sm:p-7">
        <div className="flex justify-between gap-4 text-sm">
          <span className="font-medium">{report.stage}</span>
          <span className="tabular-nums text-muted-foreground">{report.progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuenow={report.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.max(3, report.progress)}%` }} />
        </div>
        <ol className="mt-7 space-y-3.5">
          {STEPS.map(([label], i) => (
            <li key={label} className={cn("flex items-center gap-3 text-[15px]", i > current ? "text-muted-foreground" : i === current && "font-semibold")}>
              {i < current ? (
                <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-blue-50">
                  <Check className="size-3.5 text-blue-700" strokeWidth={3} aria-hidden />
                </span>
              ) : i === current ? (
                <span className="inline-flex size-[22px] items-center justify-center rounded-full border-2 border-brand">
                  <span className="size-2 animate-pulse rounded-full bg-brand" />
                </span>
              ) : (
                <span className="size-[22px] rounded-full border-2 border-foreground/15" />
              )}
              {label}
              <span className="sr-only">{i < current ? "(done)" : i === current ? "(in progress)" : ""}</span>
            </li>
          ))}
        </ol>
      </section>

      {report.profile && (
        <section className="mt-6 rounded-2xl border bg-background p-5 sm:px-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">What we detected</p>
          <dl className="mt-3.5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Brand", report.profile.brand],
              ["Industry", report.profile.industry],
              ["Market", report.profile.country],
              [
                "Competitors",
                report.profile.competitors.length
                  ? `${report.profile.competitors.slice(0, 2).map((c) => c.name).join(", ")}${report.profile.competitors.length > 2 ? ` +${report.profile.competitors.length - 2}` : ""}`
                  : "–",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 font-medium">{v || "–"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </Shell>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-40 shrink-0 sm:size-[168px]">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`GEO Score ${score} out of 100`}>
        <circle cx="60" cy="60" r={r} className="fill-none stroke-muted" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} className={cn("fill-none transition-all duration-700", tone.stroke)} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-5xl font-semibold tracking-[-0.04em] tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">GEO Score</span>
      </div>
    </div>
  );
}

function Completed({ report, result, trackingLive }: { report: Report; result: Result; trackingLive: boolean }) {
  const tone = scoreTone(result.geoScore);
  const t = result.breakdown.totals;
  const brand = report.profile?.brand ?? report.domain;
  const me = result.competitors.find((c) => c.isTarget);
  const leader = result.competitors.find((c) => !c.isTarget);
  const providerNames = Object.fromEntries(result.providers.map((p) => [p.id, p.name]));
  const tested = result.providers.filter((p) => p.tested);
  const untested = result.providers.filter((p) => !p.tested);
  const positions = result.queries.flatMap((q) => q.results.map((r) => r.position)).filter((p): p is number => p !== null);
  const avgPosition = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  const pct = (n: number) => (t.responses ? Math.round((n / t.responses) * 100) : 0);
  const topFix = result.recommendations[0];
  const date = new Date(report.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex-1 bg-surface">
      {/* SUMMARY */}
      <section className="border-b bg-background pt-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-muted-foreground">
              {[report.domain, report.profile?.industry, report.profile?.country, date].filter(Boolean).join(" · ")}
            </p>
            <CopyLinkButton />
          </div>

          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
            <ScoreRing score={result.geoScore} />
            <div className="flex flex-col gap-3">
              <span className={cn("self-start rounded-md px-2.5 py-1 text-[13px] font-semibold", tone.chip)}>{tone.label}</span>
              <h1 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
                AI assistants {tone.verb} {brand}
              </h1>
              <p className="max-w-2xl text-[17px] leading-normal text-muted-foreground">
                Mentioned in{" "}
                <strong className="text-foreground">
                  {t.mentioned} of {t.responses}
                </strong>{" "}
                answers to buyer questions.
                {leader && leader.mentions > (me?.mentions ?? 0) && (
                  <>
                    {" "}
                    <strong className="text-foreground">{leader.name}</strong> appeared in {leader.mentions}.
                  </>
                )}
              </p>
              {result.history.length > 1 && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <RotateCcw className="size-3.5" aria-hidden />
                  History <span className="font-mono text-foreground">{result.history.map((h) => h.score).join(" → ")}</span>
                  {result.promptsReused && " · same questions each run"}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Mentioned" value={`${pct(t.mentioned)}%`} hint="of answers name you" />
            <Kpi label="Recommended" value={`${pct(t.recommended)}%`} hint="of answers suggest you" />
            <Kpi label="Average position" value={avgPosition ? `#${avgPosition.toFixed(1)}` : "–"} hint={avgPosition ? "when you are listed" : "never listed"} />
          </div>

          {topFix && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-foreground px-5 py-4 text-background">
              <div className="flex min-w-0 flex-[1_1_420px] items-start gap-3.5">
                <span className="shrink-0 rounded-md bg-brand px-2 py-1 font-mono text-[11px] tracking-[0.06em] text-brand-foreground">FIX #1</span>
                <p className="text-[15px] leading-normal">{topFix.title}</p>
              </div>
              <a href="#plan" className="inline-flex items-center gap-1.5 text-sm font-medium text-background hover:underline">
                See the full plan
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </div>
          )}

          <nav aria-label="Report sections" className="-mx-1 flex gap-1.5 overflow-x-auto border-t py-2.5">
            {[
              ["#breakdown", "Score breakdown"],
              ["#models", "Models"],
              ["#competitors", "Competitors"],
              ["#plan", "Action plan"],
              ["#questions", "Questions"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-brand-soft hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-8">
        <Card id="breakdown" title="Score breakdown" subtitle="Five signals, weighted. Low bars are where points are easiest to win.">
          <div className="grid gap-5">
            {result.breakdown.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className="font-medium">
                    {c.label} <span className="text-[13px] font-normal text-muted-foreground">· {c.measured ? `${Math.round(c.weight * 100)}% of score` : "not measured"}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{c.measured ? c.score : "–"}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  {c.measured && <div className={cn("h-full rounded-full", scoreTone(c.score).bar)} style={{ width: `${Math.max(2, c.score)}%` }} />}
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{c.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card id="models" title="By AI model" subtitle={`Share of the ${result.queries.length} questions where each model mentioned you.`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {tested.map((p) => {
              const answered = result.queries.flatMap((q) => q.results.filter((r) => r.provider === p.id));
              const hits = answered.filter((r) => r.brandMentioned).length;
              const best = answered.map((r) => r.position).filter((x): x is number => x !== null).sort((a, b) => a - b)[0];
              return (
                <div key={p.id} className="flex flex-col gap-2.5 rounded-xl border p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-medium">{p.name}</span>
                    <span className="text-[26px] font-semibold tabular-nums">{p.mentionRate ?? 0}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-brand" style={{ width: `${p.mentionRate ?? 0}%` }} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {hits} of {answered.length} questions{best ? ` · best position #${best}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
          {untested.length > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-foreground/20 px-3.5 py-3 text-[13px] text-muted-foreground">
              <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
              {untested.map((p) => p.name).join(", ")} {untested.length > 1 ? "aren’t" : "isn’t"} in this report yet. This score only reflects the models above.
            </p>
          )}
        </Card>

        <Card id="competitors" title="Who the AIs recommend instead" subtitle="Share of voice: how often each brand appears across all answers.">
          <div className="space-y-3">
            {result.competitors.slice(0, 8).map((c) => (
              <div key={c.name} className="grid grid-cols-[minmax(0,6rem)_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,10rem)_1fr_3rem]">
                <span className={cn("truncate", c.isTarget && "font-semibold")}>{c.isTarget ? `${c.name} (you)` : c.name}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", c.isTarget ? "bg-brand" : "bg-foreground/35")} style={{ width: `${Math.max(2, c.share * 100)}%` }} />
                </div>
                <span className={cn("text-right tabular-nums", c.isTarget && "font-semibold")}>{Math.round(c.share * 100)}%</span>
              </div>
            ))}
          </div>

          {result.reasons.length > 0 && (
            <div className="mt-7 border-t pt-6">
              <h3 className="font-semibold">Why they win</h3>
              <ol className="mt-4 space-y-4">
                {result.reasons.map((r, i) => (
                  <li key={i} className="flex gap-3.5">
                    <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-ink">{i + 1}</span>
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="mt-1 text-sm leading-normal text-muted-foreground">{r.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>

        <Card id="plan" title="Action plan" subtitle="Ordered by impact on your score. Each fix is backed by the answers below.">
          <div className="space-y-2.5">
            {result.recommendations.map((a, i) => (
              <details key={a.order} open={i === 0} className="group rounded-xl border p-4 sm:p-[18px]">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 [&::-webkit-details-marker]:hidden">
                  <PriorityBadge priority={a.priority} />
                  <span className="min-w-0 flex-1 text-[15px] font-medium">{a.title}</span>
                  <span className="text-[13px] text-muted-foreground">{a.difficulty}</span>
                  <ChevronDown className="size-[18px] text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <dl className="mt-4 grid gap-3 text-sm leading-normal">
                  {[
                    ["Problem", a.problem],
                    ["Evidence", a.evidence],
                    ["What to do", a.action],
                    ["Impact", a.impact],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        </Card>

        <TrackForm analysisId={report.id} brand={brand} questions={result.queries.length} live={trackingLive} />

        <Questions result={result} providerNames={providerNames} />

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Results come from real questions asked to AI models on {date}. Answers vary over time; the trend matters more than one run.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border px-[18px] py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked (e.g. insecure context): nothing useful to show.
        }
      }}
      className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-3.5 text-sm font-medium hover:bg-muted"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <LinkIcon className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

type Filter = "all" | "hit" | "miss";

function Questions({ result, providerNames }: { result: Result; providerNames: Record<string, string> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = result.queries.map((q) => ({ q, hits: q.results.filter((r) => r.brandMentioned).length }));
  const counts = { all: rows.length, hit: rows.filter((r) => r.hits > 0).length, miss: rows.filter((r) => r.q.results.length && !r.hits).length };
  const shown = rows.filter((r) => filter === "all" || (filter === "hit" ? r.hits > 0 : r.q.results.length && !r.hits));

  return (
    <Card
      id="questions"
      title={`The ${result.queries.length} questions we asked`}
      subtitle={`${result.promptsReused ? "Same questions as your previous analysis, so scores are comparable. " : ""}Open one to read each answer.`}
    >
      <div role="group" aria-label="Filter questions" className="-mt-2 mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ["all", `All ${counts.all}`],
            ["hit", `Mentioned ${counts.hit}`],
            ["miss", `Missed ${counts.miss}`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "h-9 rounded-lg border px-3 text-[13px] font-medium",
              filter === id ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="divide-y overflow-hidden rounded-xl border">
        {shown.map(({ q, hits }) => {
          const best = q.results.map((r) => r.position).filter((p): p is number => p !== null).sort((a, b) => a - b)[0];
          return (
            <li key={q.text}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                  <QueryStatus answered={q.results.length > 0} hit={hits > 0} />
                  <span className="min-w-0 flex-1">{q.text}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{categoryLabel(q.category)}</span>
                  {q.results.length > 1 && <span className="font-mono text-xs text-muted-foreground">{hits}/{q.results.length}</span>}
                  {best && <span className="font-mono text-xs text-muted-foreground">#{best}</span>}
                </summary>
                {q.results.map((res) => (
                  <div key={res.provider} className="space-y-2.5 px-4 pb-5 text-[13px] sm:pl-[7.75rem]">
                    <p className="font-medium">
                      {providerNames[res.provider] ?? res.provider} ·{" "}
                      <span className={res.brandMentioned ? "text-blue-700" : "text-orange-800"}>
                        {res.brandMentioned ? `mentions you${res.position ? ` (#${res.position})` : ""}` : "doesn't mention you"}
                      </span>
                    </p>
                    {res.competitors.length > 0 && <p className="text-muted-foreground">Brands named: {res.competitors.slice(0, 8).join(", ")}</p>}
                    <p className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs leading-relaxed">{res.response}</p>
                    {res.citations.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Sources:{" "}
                        {res.citations.filter((c) => /^https?:\/\//.test(c.url)).map((c, j) => (
                          <a key={j} href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="mr-2 underline underline-offset-2">
                            {safeHost(c.url)}
                          </a>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </details>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No questions in this group.</li>}
      </ul>
    </Card>
  );
}

/** Icon plus word, so the status never depends on color alone. */
function QueryStatus({ answered, hit }: { answered: boolean; hit: boolean }) {
  if (!answered) return <span className="w-24 shrink-0 text-[13px] text-muted-foreground">No answer</span>;
  return (
    <span className={cn("inline-flex w-24 shrink-0 items-center gap-1.5 text-[13px] font-medium", hit ? "text-blue-700" : "text-orange-800")}>
      {hit ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : <X className="size-4" strokeWidth={2.5} aria-hidden />}
      {hit ? "Mentioned" : "Missed"}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    CRITICAL: "bg-orange-800 text-white",
    HIGH: "bg-orange-100 text-orange-900",
    MEDIUM: "bg-amber-50 text-amber-900",
    LOW: "bg-muted text-muted-foreground",
  };
  return <span className={cn("shrink-0 rounded-[5px] px-2 py-0.5 font-mono text-[11px] tracking-[0.04em]", styles[priority])}>{priority}</span>;
}

function categoryLabel(category: string) {
  const s = category.replaceAll("_", " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
