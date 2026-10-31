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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-[13px] font-medium">
        Email
      </label>
      <Input
        id={inputId}
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        className="h-12 text-base"
        required
      />
      <Button type="submit" disabled={state === "sending"} className="h-12 rounded-xl bg-brand text-base font-semibold text-brand-foreground hover:bg-brand/90">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <p className="text-xs text-muted-foreground">
        By continuing you accept the{" "}
        <a href="/terms" className="underline underline-offset-2">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy notice
        </a>
        .
      </p>
      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetSignal={resetSignal} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
