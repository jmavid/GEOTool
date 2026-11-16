"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";

export function LoginForm({ turnstileSiteKey = null, plan = null }: { turnstileSiteKey?: string | null; plan?: string | null }) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (turnstileSiteKey && !token) {
      setError("Please wait a second while we check you're not a bot.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, plan: plan ?? undefined, turnstileToken: token ?? undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
      setResetSignal((n) => n + 1);
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl border border-brand/20 bg-brand-soft p-5">
        <p className="font-semibold">Check your inbox.</p>
        <p className="mt-1 text-sm text-muted-foreground">We sent a sign-in link to {email}. It works once and expires in 15 minutes.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      <label htmlFor={inputId} className="text-sm font-semibold">
        Work email
      </label>
      <Input
        id={inputId}
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        className="mt-2 h-11 rounded-md text-base"
        required
      />
      <label className="mt-5 flex items-start gap-2.5 text-sm text-muted-foreground">
        <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
        <span>
          I accept the{" "}
          <a href="/terms" className="text-foreground underline underline-offset-2">
            Terms
          </a>{" "}
          &amp;{" "}
          <a href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy notice
          </a>
        </span>
      </label>
      {turnstileSiteKey && (
        <div className="mt-4">
          <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetSignal={resetSignal} />
        </div>
      )}
      <Button type="submit" disabled={state === "sending"} className="mt-7 h-11 w-full rounded-md bg-brand text-[15px] font-semibold text-brand-foreground hover:bg-brand/90">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
