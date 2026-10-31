import type { Plan } from "@/db/schema";

export interface PlanLimits {
  label: string;
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

/** Single source of truth for plan limits. Billing (Stripe) plugs in later by setting User.plan. */
export const PLANS: Record<Plan, PlanLimits> = {
  FREE: {
    label: "Free",
    priceEurMonth: 0,
    websites: 1,
    promptsPerAnalysis: Number(process.env.FREE_PROMPTS_PER_ANALYSIS ?? 25),
    analysesPerMonth: 1,
    tracking: "none",
    competitorAnalysis: true,
    actionPlan: true,
    reports: false,
  },
  STARTER: { label: "Starter", priceEurMonth: 19, websites: 1, promptsPerAnalysis: 25, analysesPerMonth: 5, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: false },
  PRO: { label: "Pro", priceEurMonth: 49, websites: 5, promptsPerAnalysis: 100, analysesPerMonth: 30, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: false },
  AGENCY: { label: "Agency", priceEurMonth: 149, websites: 30, promptsPerAnalysis: 100, analysesPerMonth: 150, tracking: "weekly", competitorAnalysis: true, actionPlan: true, reports: true },
};

/** Hard ceiling regardless of plan: protects the API budget from config mistakes. */
export const MAX_PROMPTS_PER_ANALYSIS = 100;

export function promptsFor(plan: Plan): number {
  return Math.min(PLANS[plan].promptsPerAnalysis, MAX_PROMPTS_PER_ANALYSIS);
}
