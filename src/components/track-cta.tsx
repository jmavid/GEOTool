import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { Plan } from "@/db/schema";
import { PLANS } from "@/lib/plans";

export type Viewer = { plan: Plan; tracked: boolean } | null;

/** "Track it weekly" upsell under the action plan. Weekly tracking is part of the paid plans. */
export function TrackCta({ analysisId, brand, viewer }: { analysisId: string; brand: string; viewer: Viewer }) {
  const box = "flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/20 bg-brand-soft p-5 sm:p-7";
  const primary = "inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand/90";

  if (viewer?.tracked && PLANS[viewer.plan].tracking === "weekly") {
    return (
      <section className={box}>
        <p className="flex items-center gap-2 font-medium">
          <Check className="size-5 text-blue-700" aria-hidden /> {brand} is tracked weekly. New scores arrive every Monday.
        </p>
        <Link href="/dashboard" className="text-sm font-medium underline underline-offset-2">
          Open dashboard
        </Link>
      </section>
    );
  }
  return (
    <section className={box}>
      <div className="min-w-0 flex-[1_1_360px]">
        <h2 className="text-xl font-semibold tracking-tight">Did the fixes work? Track it weekly.</h2>
        <p className="mt-1.5 text-sm leading-normal text-muted-foreground">
          {viewer && !viewer.tracked
            ? `Add ${brand} to your dashboard to follow its score.`
            : `Every Monday we re-ask the same questions and email you ${brand}'s new score. From €${PLANS.STARTER.priceEurMonth}/month.`}
        </p>
      </div>
      {viewer && !viewer.tracked ? (
        <form method="post" action="/api/projects/websites">
          <input type="hidden" name="analysisId" value={analysisId} />
          <button type="submit" className={primary}>
            Add to dashboard <ArrowRight className="size-4" aria-hidden />
          </button>
        </form>
      ) : (
        <Link href="/pricing" className={primary}>
          See plans <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}
