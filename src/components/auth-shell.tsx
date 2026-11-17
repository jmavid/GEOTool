import Link from "next/link";
import { Bot, Brain, Globe, MessageCircle, Search, Sparkles, type LucideIcon } from "lucide-react";

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

/** The account pages' frame (sign up, sign in, recovery): dotted background and a centered white column. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
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
        <Link href="/" className="flex items-center justify-center gap-2.5 text-2xl font-semibold tracking-tight">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-foreground">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#9bb0ff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 12h8" />
            </svg>
          </span>
          GEO Garner
        </Link>
        <h1 className="mt-5 text-center text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p>}
        <hr className="my-7" />
        {children}
        {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
      </section>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-foreground underline underline-offset-2">
      {children}
    </Link>
  );
}
