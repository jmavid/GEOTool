"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/turnstile";

type Common = { turnstileSiteKey?: string | null; plan?: string | null };

/** Posts a form's JSON to an auth route; returns the parsed body or throws with the server's message. */
async function post(url: string, body: object): Promise<{ next?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; next?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

/** Form state shared by every account form: busy flag, error, bot-check token and its reset. */
function useAuthForm(turnstileSiteKey: string | null | undefined) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  async function run(action: (turnstileToken: string | undefined) => Promise<void>) {
    setError(null);
    if (turnstileSiteKey && !token) return setError("Please wait a second while we check you're not a bot.");
    setBusy(true);
    try {
      await action(token ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setResetSignal((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  const widget = turnstileSiteKey ? (
    <div className="mt-4">
      <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetSignal={resetSignal} />
    </div>
  ) : null;
  return { busy, error, run, widget };
}

function Field({ label, hint, children, id, aside }: { label: string; hint?: string; children: React.ReactNode; id: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-md pr-11 text-base" required />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function EmailInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <Input id={id} type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-md text-base" required />;
}

function Submit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <Button type="submit" disabled={busy} className="mt-7 h-11 w-full rounded-md bg-brand text-[15px] font-semibold text-brand-foreground hover:bg-brand/90">
      {busy ? busyLabel : label}
    </Button>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-3 text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

/** The "we emailed you" state after sign-up and recovery. */
export function InboxNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft p-5">
      <span className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-blue-50">
        <Check className="size-3.5 text-blue-700" strokeWidth={3} aria-hidden />
      </span>
      <div className="text-[15px] leading-normal">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export function SignUpForm({ turnstileSiteKey, plan }: Common) {
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const f = useAuthForm(turnstileSiteKey);

  if (sent) {
    return (
      <InboxNotice title="Confirm your email">
        We sent a link to <strong className="break-all text-foreground">{email}</strong>. Click it to finish creating your account (it expires in 15 minutes). Not there? Look in spam.
      </InboxNotice>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        f.run(async (turnstileToken) => {
          await post("/api/auth/signup", { email, password, plan: plan ?? undefined, turnstileToken });
          setSent(true);
        });
      }}
      className="flex flex-col gap-5"
    >
      <Field id={ids.email} label="Work email">
        <EmailInput id={ids.email} value={email} onChange={setEmail} />
      </Field>
      <Field id={ids.password} label="Password" hint="(8 characters minimum)">
        <PasswordInput id={ids.password} value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
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
      <div className="-mt-5">
        {f.widget}
        <Submit busy={f.busy} label="Sign up" busyLabel="Creating your account…" />
        <ErrorText error={f.error} />
      </div>
    </form>
  );
}

export function SignInForm({ turnstileSiteKey, plan }: Common) {
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const f = useAuthForm(turnstileSiteKey);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        f.run(async (turnstileToken) => {
          const { next } = await post("/api/auth/signin", { email, password, plan: plan ?? undefined, turnstileToken });
          window.location.assign(next ?? "/dashboard"); // full load, so the header shows the signed-in menu
        });
      }}
      className="flex flex-col gap-5"
    >
      <Field id={ids.email} label="Work email">
        <EmailInput id={ids.email} value={email} onChange={setEmail} />
      </Field>
      <Field
        id={ids.password}
        label="Password"
        aside={
          <Link href="/forgot" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Forgot password?
          </Link>
        }
      >
        <PasswordInput id={ids.password} value={password} onChange={setPassword} autoComplete="current-password" />
      </Field>
      <div className="-mt-5">
        {f.widget}
        <Submit busy={f.busy} label="Sign in" busyLabel="Signing in…" />
        <ErrorText error={f.error} />
      </div>
    </form>
  );
}

export function ForgotForm({ turnstileSiteKey }: Common) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const f = useAuthForm(turnstileSiteKey);
  if (sent) {
    return (
      <InboxNotice title="Check your inbox">
        If <strong className="break-all text-foreground">{email}</strong> has an account, we sent it a link to set a new password (it expires in 15 minutes). Not there? Look in spam.
      </InboxNotice>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        f.run(async (turnstileToken) => {
          await post("/api/auth/forgot", { email, turnstileToken });
          setSent(true);
        });
      }}
      className="flex flex-col"
    >
      <Field id={id} label="Work email">
        <EmailInput id={id} value={email} onChange={setEmail} />
      </Field>
      {f.widget}
      <Submit busy={f.busy} label="Email me a reset link" busyLabel="Sending…" />
      <ErrorText error={f.error} />
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const f = useAuthForm(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        f.run(async () => {
          const { next } = await post("/api/auth/reset", { token, password });
          window.location.assign(next ?? "/dashboard");
        });
      }}
      className="flex flex-col"
    >
      <Field id={id} label="New password" hint="(8 characters minimum)">
        <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <Submit busy={f.busy} label="Save password and sign in" busyLabel="Saving…" />
      <ErrorText error={f.error} />
    </form>
  );
}
