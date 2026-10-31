import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { currentUser } from "@/lib/auth/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Visibility Checker: do AI assistants recommend your business? | GEO Score",
  description:
    "Free GEO (Generative Engine Optimization) check. See how often AI models mention and recommend your brand, who they recommend instead, and what to fix first.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <header className="border-b print:hidden">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="#9bb0ff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 12h8" />
                </svg>
              </span>
              GEO Score
            </Link>
            <nav aria-label="Main" className="flex items-center gap-7 text-sm">
              <Link href="/#how" className="hidden text-muted-foreground hover:text-foreground sm:inline">How it works</Link>
              <Link href="/#report" className="hidden text-muted-foreground hover:text-foreground sm:inline">What you get</Link>
              <Link href="/pricing" className="hidden text-muted-foreground hover:text-foreground sm:inline">Pricing</Link>
              {user ? (
                <>
                  <Link href="/account" className="hidden text-muted-foreground hover:text-foreground sm:inline">Account</Link>
                  <Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 font-medium text-background hover:bg-foreground/85">
                    Dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-muted-foreground hover:text-foreground">Sign in</Link>
                  <Link href="/#check" className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 font-medium text-background hover:bg-foreground/85">
                    Check my site
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t print:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-8">
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              <span>© {new Date().getFullYear()} GEO Score</span>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
            </span>
            <span>Results come from real questions asked to AI models. Answers vary over time.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
