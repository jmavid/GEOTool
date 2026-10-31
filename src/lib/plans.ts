import type { Plan } from "@/db/schema";

export interface PlanLimits {
  label: string;
  /** One-line pitch on the pricing page. */
  pitch: string;
  priceEurMonth: number;
  websites: number;
  promptsPerAnalysis: number;
  /** Analyses per rolling 30 days. */
  analysesPerMonth: number;
  tracking: "none" | "weekly";
  competitorAnalysis: boolean;
  actionPlan: boolean;
  reports: boolean;
}

/** Single source of truth for plan limits. The Stripe webhook sets User.plan (lib/billing.ts). */
export const PLANS: Record<Plan, PlanLimits> = {
  FREE: {
    label: "Free",
    pitch: "Check where you stand today.",
    priceEurMonth: 0,
    websites: 1,
    promptsPerAnalysis: Number(process.env.FREE_PROMPTS_PER_ANALYSIS ?? 25),
    analysesPerMonth: 3,
    tracking: "none",
    competitorAnalysis: true,
    actionPlan: true,
    reports: false,
  },
  STARTER: { label: "Starter", pitch: "Track one site every week.", priceEurMonth: 19, websites: 1, promptsPerAnalysis: 25, analysesPerMonth: 5, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: false },
  PRO: { label: "Pro", pitch: "Deeper reports for a few brands.", priceEurMonth: 49, websites: 5, promptsPerAnalysis: 100, analysesPerMonth: 30, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: false },
  AGENCY: { label: "Agency", pitch: "Client projects and reports.", priceEurMonth: 149, websites: 30, promptsPerAnalysis: 100, analysesPerMonth: 150, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: true },
};

/** Hard ceiling regardless of plan: protects the API budget from config mistakes. */
export const MAX_PROMPTS_PER_ANALYSIS = 100;

export function promptsFor(plan: Plan): number {
  return Math.min(PLANS[plan].promptsPerAnalysis, MAX_PROMPTS_PER_ANALYSIS);
}

export const ANALYSIS_WINDOW_MS = 30 * 24 * 3_600_000;

/** Pure: why a signed-in user can't start this analysis, or null when the plan allows it. */
export function planLimitError(plan: Plan, usage: { trackedSites: number; alreadyTracked: boolean; analysesLast30Days: number }): string | null {
  const limits = PLANS[plan];
  if (!usage.alreadyTracked && usage.trackedSites >= limits.websites) {
    return `Your ${limits.label} plan includes ${limits.websites} website${limits.websites > 1 ? "s" : ""}. Remove one from your dashboard or upgrade.`;
  }
  if (usage.analysesLast30Days >= limits.analysesPerMonth) {
    return `You've used the ${limits.analysesPerMonth} analyses your ${limits.label} plan includes per 30 days. Upgrade for more.`;
  }
  return null;
}
