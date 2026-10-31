import Link from "next/link";

/** Centered card on the grey surface, for short single-purpose pages (sign-in, confirmations). */
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-surface px-4 py-16 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-2xl border bg-background p-7 text-[15px] leading-relaxed text-muted-foreground">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {children}
        <Link href="/" className="text-sm text-foreground underline underline-offset-2">
          Back to GEO Score
        </Link>
      </div>
    </div>
  );
}
