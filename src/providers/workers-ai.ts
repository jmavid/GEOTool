import { runChat } from "@/lib/ai/workers-ai";
import type { AIProvider, ProviderResult } from "./types";
import { SYSTEM_PROMPT } from "./types";

/** Display names for the models we know; anything else shows its model slug. */
const NAMES: Record<string, string> = {
  "@cf/openai/gpt-oss-120b": "GPT-OSS 120B",
  "@cf/openai/gpt-oss-20b": "GPT-OSS 20B",
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017": "DeepSeek V4.1",
  "@cf/deepseek-ai/deepseek-v4-pro-0813": "DeepSeek V4 Pro",
  "@cf/moonshotai/kimi-k2.6": "Kimi K2.6",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "Llama 3.3 70B",
  "@cf/google/gemma-4-26b-a4b-it": "Gemma 4",
  "@cf/mistralai/mistral-small-3.1-24b-instruct": "Mistral Small 3.1",
};

export const DEFAULT_VISIBILITY_MODELS = ["@cf/openai/gpt-oss-120b", "@cf/deepseek-ai/deepseek-v4.1-flash-1017"];

export function workersAiProviderId(model: string): string {
  return model.split("/").pop()!;
}

/** A model served by Workers AI, asked like a buyer would ask it. No web search, so no citations. */
export function workersAiProvider(model: string): AIProvider {
  return {
    id: workersAiProviderId(model),
    name: NAMES[model] ?? workersAiProviderId(model),
    model,
    browses: false,
    isConfigured: () => true,
    async executePrompt(prompt): Promise<ProviderResult> {
      const res = await runChat(
        model,
        [
          // Open models write report-length tables by default; real assistant answers are shorter.
          { role: "system", content: `${SYSTEM_PROMPT} Keep the answer under 250 words.` },
          { role: "user", content: prompt },
        ],
        { maxTokens: 1_500 },
      );
      return { text: res.text, citations: [], model, usage: { ...res.usage, webSearchCalls: 0 } };
    },
  };
}

export function visibilityModels(): string[] {
  const list = process.env.AI_VISIBILITY_MODELS?.split(",").map((s) => s.trim()).filter(Boolean);
  return list?.length ? list : DEFAULT_VISIBILITY_MODELS;
}
