import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { claudeProvider } from "./claude";
import { perplexityProvider } from "./perplexity";
import { visibilityModels, workersAiProvider } from "./workers-ai";
import type { AIProvider } from "./types";

/**
 * External assistants. Prepared but OFF unless listed in EXTERNAL_PROVIDERS and given an API key:
 * by default every AI call stays inside Cloudflare (Workers AI).
 */
export const EXTERNAL_PROVIDERS: AIProvider[] = [openaiProvider, geminiProvider, claudeProvider, perplexityProvider];

export function activeProviders(): AIProvider[] {
  const enabled = (process.env.EXTERNAL_PROVIDERS ?? "").split(",").map((s) => s.trim());
  return [
    ...visibilityModels().map(workersAiProvider),
    ...EXTERNAL_PROVIDERS.filter((p) => enabled.includes(p.id) && p.isConfigured()),
  ];
}

export type { AIProvider } from "./types";
