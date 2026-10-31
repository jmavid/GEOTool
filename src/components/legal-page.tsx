/** Shared shell for /privacy and /terms: readable prose column on the grey surface. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 bg-surface">
      <article className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-14 text-[15px] leading-relaxed text-muted-foreground sm:px-8 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{title}</h1>
        <p className="text-sm">Last updated {updated}</p>
        {children}
      </article>
    </div>
  );
}
