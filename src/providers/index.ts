import type { Plan } from "@/db/schema";
import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { claudeProvider } from "./claude";
import { perplexityProvider } from "./perplexity";
import { visibilityModels, workersAiProvider } from "./workers-ai";
import type { AIProvider } from "./types";

/**
 * Commercial assistants. OFF unless listed in EXTERNAL_PROVIDERS and given an API key, and then only for the plans in
 * EXTERNAL_PROVIDER_PLANS: they search the web and cost far more per answer than the Workers AI models.
 */
export const EXTERNAL_PROVIDERS: AIProvider[] = [openaiProvider, geminiProvider, claudeProvider, perplexityProvider];

const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** External assistants that are switched on and have a key, regardless of plan. */
export function connectedExternalProviders(): AIProvider[] {
  const enabled = list(process.env.EXTERNAL_PROVIDERS);
  return EXTERNAL_PROVIDERS.filter((p) => enabled.includes(p.id) && p.isConfigured());
}

export function externalProvidersIncluded(plan: Plan): boolean {
  return list(process.env.EXTERNAL_PROVIDER_PLANS ?? "STARTER,PRO,AGENCY").includes(plan);
}

/** Questions per analysis sent to each external assistant (the rest go to the Workers AI models only). */
export const externalPromptLimit = () => Number(process.env.EXTERNAL_PROMPTS_PER_ANALYSIS ?? 25);

export function activeProviders(plan: Plan): AIProvider[] {
  return [...visibilityModels().map(workersAiProvider), ...(externalProvidersIncluded(plan) ? connectedExternalProviders() : [])];
}

export type { AIProvider } from "./types";
