import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Gauge, ListChecks, MessageSquareText, ChartColumn } from "lucide-react";
import { UrlForm } from "@/components/url-form";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { activeProviders, EXTERNAL_PROVIDERS } from "@/providers";
import { promptsFor } from "@/lib/plans";

const FEATURES = [
  { icon: Gauge, title: "GEO Score, 0–100", text: "One number built from five signals: brand visibility, recommendations, average position, citations and share of voice." },
  { icon: ChartColumn, title: "Who wins instead of you", text: "Share of voice for every brand the AIs mention, so you see exactly which competitors take your spot." },
  { icon: MessageSquareText, title: "Every answer, word for word", text: "Read what each model replied to each question, with the brands it named and the sources it cited." },
  { icon: ListChecks, title: "A prioritized fix list", text: "Each fix comes with the problem, the evidence from the answers, what to do, and how hard it is." },
];

export default async function Home() {
  await connection(); // read the Turnstile key and model list at request time, not at build time
  const siteKey = turnstileSiteKey();
  const tested = activeProviders();
  const comingSoon = EXTERNAL_PROVIDERS.filter((p) => !tested.some((t) => t.id === p.id)).map((p) => p.name);
  const testedNames = tested.map((p) => p.name);
  const questions = promptsFor("FREE");

  const faq: [string, string][] = [
    ["What is GEO?", "Generative Engine Optimization: making sure AI assistants know your brand and recommend it when buyers ask for options. It is SEO for answers instead of links."],
    [
      "Which AI models do you test?",
      `Today: ${listify(testedNames)}.${comingSoon.length ? ` ${listify(comingSoon)} ${comingSoon.length > 1 ? "are" : "is"} coming soon.` : ""} Your report always says which models answered.`,
    ],
    [
      "How is the score calculated?",
      "A weighted mix of how often you are mentioned, how often you are recommended, your average position in lists, the citations to your site, and your share of voice against competitors. The report shows each part and its weight.",
    ],
    ["Why does my score change between runs?", "AI answers vary. We reuse the same questions for your site each time, so the trend is comparable even when single answers move."],
    ["Is it really free?", "Yes: a full analysis with no account. Weekly tracking is coming; leave your email on the report to hear when it's ready."],
  ];

  return (
    <>
      <section className="mx-auto w-full grid max-w-6xl items-center gap-12 px-4 pb-24 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <p className="inline-flex items-center gap-2 self-start rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-medium text-brand-ink">
            <span className="size-1.5 rounded-full bg-brand" />
            Free AI visibility check · no sign-up
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">Do AI assistants recommend your business?</h1>
          <p className="max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
            We ask AI models the questions your buyers ask, then show you who they recommend, where you rank, and what to fix first.
          </p>
          <div id="check" className="mt-2 scroll-mt-24">
            <UrlForm turnstileSiteKey={siteKey} />
            <p className="mt-2.5 text-[13px] text-muted-foreground">1–3 minutes · {questions} real buyer questions · a report link you can share</p>
          </div>
          <div className="flex flex-col gap-2.5 border-t pt-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Models tested today</p>
            <div className="flex flex-wrap gap-2">
              {testedNames.map((name) => (
                <span key={name} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border bg-surface px-3 text-[13px] font-medium">
                  <Check className="size-3.5 text-blue-700" strokeWidth={2.5} aria-hidden />
                  {name}
                </span>
              ))}
              {comingSoon.length > 0 && (
                <span className="inline-flex h-[30px] items-center rounded-lg border border-dashed border-foreground/20 px-3 text-[13px] text-muted-foreground">
                  {comingSoon.join(" · ")}: coming soon
                </span>
              )}
            </div>
          </div>
        </div>
        <SampleReport />
      </section>

      <section id="how" className="scroll-mt-16 border-y bg-surface py-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 sm:px-8">
          <SectionHeading eyebrow="How it works" title="Three steps, no setup" />
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              ["We read your site", "Your brand, products, market and competitors are detected automatically from your homepage."],
              ["We ask the AIs", `${questions} questions written the way your customers ask them, sent to each model. Every answer is saved.`],
              ["You get a plan", "Your GEO Score, who wins instead of you, and a prioritized list of fixes backed by the answers."],
            ].map(([title, text], i) => (
              <li key={title} className="flex flex-col gap-3.5 rounded-2xl border bg-background p-7">
                <span className="font-mono text-[13px] text-muted-foreground">0{i + 1}</span>
                <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="report" className="mx-auto flex w-full max-w-6xl scroll-mt-16 flex-col gap-12 px-4 py-24 sm:px-8">
        <SectionHeading eyebrow="What you get" title="A report you can act on this week" />
        <div className="grid gap-6 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl border p-7">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon className="size-5" strokeWidth={1.8} aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 border-t py-24">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 sm:px-8">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Questions</h2>
          <div className="border-t">
            {faq.map(([q, a], i) => (
              <details key={q} open={i === 0} className="group border-b py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-8">
        <div className="flex flex-col items-center gap-5 rounded-3xl bg-foreground px-6 py-16 text-center text-background sm:px-12">
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-[44px] sm:leading-[1.08]">Find out what AI says about you</h2>
          <p className="text-background/70">Free, in a few minutes, with every answer to back it up.</p>
          <Link href="#check" className="mt-2 inline-flex h-[52px] items-center gap-2 rounded-xl bg-background px-6 font-semibold text-foreground hover:bg-background/90">
            Check my AI visibility
            <ArrowRight className="size-[18px]" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-brand-ink">{eyebrow}</p>
      <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{title}</h2>
    </div>
  );
}

/** Static, clearly labelled example of the report so visitors know what they get. */
function SampleReport() {
  const r = 52;
  const c = 2 * Math.PI * r;
  const sov: [string, number, boolean][] = [
    ["Tilecraft", 41, false],
    ["StoneHaus", 25, false],
    ["You", 9, true],
  ];
  return (
    <figure aria-label="Sample report with illustrative data">
      <div className="overflow-hidden rounded-[20px] border bg-background shadow-[0_24px_48px_-24px_rgba(11,13,18,0.18),0_2px_6px_rgba(11,13,18,0.04)]">
        <div className="flex items-center justify-between border-b bg-surface px-5 py-3.5 font-mono text-xs text-muted-foreground">
          <span>acme-tiles.com</span>
          <span className="text-[11px] uppercase tracking-[0.06em]">Sample report</span>
        </div>
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-5">
            <div className="relative size-28 shrink-0">
              <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r={r} className="fill-none stroke-muted" strokeWidth="11" />
                <circle cx="60" cy="60" r={r} className="fill-none stroke-orange-600" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.62} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">38</span>
                <span className="text-[11px] text-muted-foreground">/ 100</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="self-start rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800">Low visibility</span>
              <p className="text-[15px] leading-snug">
                Mentioned in <strong>7 of 50</strong> AI answers. <strong>Tilecraft</strong> appeared in 31.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">AI share of voice</p>
            {sov.map(([name, share, you]) => (
              <div key={name} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2.5 text-[13px]">
                <span className={you ? "font-semibold" : undefined}>{name}</span>
                <span className="h-2 overflow-hidden rounded bg-muted">
                  <span className={`block h-full rounded ${you ? "bg-brand" : "bg-foreground/40"}`} style={{ width: `${share * 1.5}%` }} />
                </span>
                <span className={`text-right tabular-nums ${you ? "font-semibold" : ""}`}>{share}%</span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-surface p-3.5">
            <span className="shrink-0 rounded-[5px] bg-orange-800 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.06em] text-white">FIX #1</span>
            <p className="text-sm leading-snug">Publish a comparison page: “Acme Tiles vs Tilecraft”. AIs cite comparisons for 9 of your missed questions.</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">Illustrative data. Your report uses your real site and competitors.</figcaption>
    </figure>
  );
}

function listify(items: string[]) {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
