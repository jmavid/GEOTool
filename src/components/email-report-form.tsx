"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail } from "lucide-react";

const storageKey = (id: string) => `geo-lead:${id}`;

/**
 * The email a visitor must give to open a finished report. While the analysis runs it is offered early ("running"), so
 * they can leave and get the result by email; on a finished report it is the only way in ("locked").
 */
export function EmailReportForm({ analysisId, brand, variant, onDone }: { analysisId: string; brand: string; variant: "running" | "locked"; onDone?: () => void }) {
  const locked = variant === "locked";
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  // Only rendered after the report loads in the browser, so reading storage here never mismatches the server HTML.
  const [sentTo, setSentTo] = useState<string | null>(() => {
    if (locked) return null; // the server decides: a remembered address doesn't open a report without its cookie
    try {
      return localStorage.getItem(storageKey(analysisId));
    } catch {
      return null; // Storage blocked: the form simply shows again.
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, email, marketing }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "We couldn't save your email. Try again.");
      const saved = email.trim();
      setSentTo(saved);
      try {
        localStorage.setItem(storageKey(analysisId), saved);
      } catch {}
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <section className="mt-6 flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-soft p-5 sm:px-7" aria-live="polite">
        <span className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-blue-50">
          <Check className="size-3.5 text-blue-700" strokeWidth={3} aria-hidden />
        </span>
        <p className="text-[15px] leading-normal">
          {locked ? (
            <>Opening your report…</>
          ) : (
            <>
              Done. Your report opens here when it&apos;s ready, and we&apos;ll email it to <strong className="break-all">{sentTo}</strong>. You can close this page.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-brand/20 bg-brand-soft p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Mail className="size-5 text-brand" aria-hidden /> {locked ? "Enter your email to see the report" : "Where should we send your report?"}
      </h2>
      <p className="mt-1 text-sm leading-normal text-muted-foreground">
        {locked
          ? `Your GEO Score, who AI recommends instead of ${brand}, and your action plan. We'll also email you a copy.`
          : `You'll need your email to open the results. Leave it now and we'll also send the report when it's ready, so you don't have to wait here.`}
      </p>
      <form onSubmit={submit} className="mt-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <label htmlFor="lead-email" className="sr-only">
            Your email
          </label>
          <input
            id="lead-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full min-w-0 shrink-0 rounded-xl border sm:w-auto sm:flex-1 bg-background px-3.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
          >
            {busy ? "Saving…" : locked ? "See my report" : "Send me the report"} {!busy && <ArrowRight className="size-4" aria-hidden />}
          </button>
        </div>
        <label className="mt-3 flex items-start gap-2.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
          <span>Also send me occasional tips to get recommended by AI assistants (optional, unsubscribe anytime).</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-orange-700">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          We use your email to give you this report{marketing ? " and the tips you asked for" : ""}. No account, no spam. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </section>
  );
}
