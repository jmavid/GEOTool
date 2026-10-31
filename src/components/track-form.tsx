"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "waitlist" | "pending" | "confirmed";

const DONE: Record<Status, (brand: string) => [string, string]> = {
  waitlist: (brand) => ["You're on the list.", `We'll email you when weekly tracking for ${brand} is ready.`],
  pending: () => ["Check your inbox.", "Click the link in the email we just sent to start weekly tracking."],
  confirmed: (brand) => ["You're already tracking this site.", `The next ${brand} score arrives on Monday.`],
};

/**
 * "Track my score weekly". `live` = tracking emails can be sent (double opt-in, then every Monday);
 * otherwise the address joins the waitlist.
 */
export function TrackForm({ analysisId, brand, questions, live }: { analysisId: string; brand: string; questions: number; live: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, email }),
      });
      const data = (await res.json()) as { error?: string; status?: Status };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setState(data.status ?? "waitlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state !== "idle" && state !== "sending") {
    const [title, text] = DONE[state](brand);
    return (
      <div role="status" className="rounded-2xl border border-brand/20 bg-brand-soft p-7 text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-brand/20 bg-brand-soft p-5 sm:p-7">
      <h2 className="text-xl font-semibold tracking-tight">Did the fixes work? Track it weekly.</h2>
      <p className="mt-1.5 text-sm leading-normal text-muted-foreground">
        {live
          ? `Every Monday we re-ask the same ${questions} questions and email you ${brand}'s new score. We'll send a confirmation link first.`
          : `We'll re-ask the same ${questions} questions every week and email you when ${brand} moves. Weekly tracking is opening soon.`}
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 bg-background"
        />
        <Button type="submit" disabled={state === "sending"} className="h-11 shrink-0 bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90">
          {state === "sending" ? "Saving…" : live ? "Track weekly" : "Notify me"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Only used for score updates about this site. No spam, unsubscribe anytime.</p>
    </section>
  );
}
