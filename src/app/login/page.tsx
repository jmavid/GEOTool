import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Brain, Globe, MessageCircle, Search, Sparkles, type LucideIcon } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { currentUser } from "@/lib/auth/session";
import { paidPlan } from "@/lib/billing";
import { emailConfigured } from "@/lib/email/send";
import { turnstileSiteKey } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Sign in | GEO Garner", robots: { index: false } };

/** Floating "AI assistant" bubbles on each side of the form (decorative, wide screens only). */
const BUBBLES: { Icon: LucideIcon; className: string; tone: string }[] = [
  { Icon: Sparkles, className: "left-[7%] top-[14%]", tone: "text-violet-600" },
  { Icon: MessageCircle, className: "left-[4%] top-[52%]", tone: "text-emerald-600" },
  { Icon: Search, className: "left-[12%] top-[80%]", tone: "text-sky-600" },
  { Icon: Brain, className: "right-[8%] top-[20%]", tone: "text-teal-600" },
  { Icon: Bot, className: "right-[5%] top-[50%]", tone: "text-brand" },
  { Icon: Globe, className: "right-[11%] top-[78%]", tone: "text-orange-600" },
];
const DOTS = ["left-[15%] top-[34%]", "left-[17%] top-[66%]", "right-[15%] top-[36%]", "right-[16%] top-[64%]"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = paidPlan((await searchParams).plan);
  if (await currentUser()) redirect(plan ? `/pricing?plan=${plan}` : "/dashboard");
  return (
    <div className="relative flex flex-1 justify-center overflow-hidden bg-surface bg-[radial-gradient(circle,#d4d8e0_1px,transparent_1.2px)] bg-[size:22px_22px]">
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {BUBBLES.map(({ Icon, className, tone }) => (
          <span key={className} className={`absolute inline-flex size-12 items-center justify-center rounded-full bg-background shadow-[0_4px_16px_rgba(16,24,40,0.10)] ${className}`}>
            <Icon className={`size-6 ${tone}`} strokeWidth={1.8} />
          </span>
        ))}
        {DOTS.map((c) => (
          <span key={c} className={`absolute size-2 rounded-full bg-[#d4d8e0] ${c}`} />
        ))}
      </div>

      <section className="relative flex w-full max-w-[440px] flex-col border-x bg-background px-6 py-12 sm:px-12">
        <div className="flex items-center justify-center gap-2.5 text-2xl font-semibold tracking-tight">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-foreground">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#9bb0ff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 12h8" />
            </svg>
          </span>
          GEO Garner
        </div>
        <h1 className="mt-5 text-center text-[26px] font-semibold tracking-[-0.02em]">Sign in to GEO Garner</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">New here? The same link creates your account.</p>
        <hr className="my-7" />

        {emailConfigured() ? (
          <>
            <LoginForm turnstileSiteKey={turnstileSiteKey()} plan={plan} />
            <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
              No password: we email you a link that signs you in.
              {plan && " Then you'll continue to checkout."}
            </p>
          </>
        ) : (
          <p className="text-center text-[15px] text-muted-foreground">Accounts are opening soon. Meanwhile, the free check on the home page works without one.</p>
        )}

        <Link href="/" className="mt-8 text-center text-sm text-foreground underline-offset-2 hover:underline">
          Back to GEO Garner
        </Link>
      </section>
    </div>
  );
}
