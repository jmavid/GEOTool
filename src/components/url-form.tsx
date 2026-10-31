"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";

export function UrlForm({ initialUrl = "", turnstileSiteKey = null }: { initialUrl?: string; turnstileSiteKey?: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (turnstileSiteKey && !token) {
      setError("Please wait a second while we check you're not a bot.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, turnstileToken: token ?? undefined }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/report/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
      setResetSignal((n) => n + 1);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor={inputId} className="mb-2.5 block text-[13px] font-medium">
        Your website
      </label>
      <div className="flex flex-col gap-2 rounded-2xl border border-foreground/15 bg-card p-1.5 shadow-xs focus-within:border-brand sm:flex-row">
        <Input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-[52px] border-0 px-3.5 text-[17px] shadow-none focus-visible:ring-0 md:text-[17px]"
          required
        />
        <Button type="submit" disabled={loading} className="h-[52px] gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-brand-foreground hover:bg-brand/90">
          {loading ? "Starting…" : "Check my AI visibility"}
          {!loading && <ArrowRight className="size-[18px]" aria-hidden />}
        </Button>
      </div>
      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetSignal={resetSignal} />}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
