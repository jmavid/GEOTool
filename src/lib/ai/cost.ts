/**
 * Approximate list prices in USD per 1M tokens. Used for cost estimates only;
 * unknown models fall back to DEFAULT_PRICE so estimates err on the high side.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  // Workers AI (USD per 1M tokens, from `wrangler ai models list`)
  "@cf/openai/gpt-oss-120b": { input: 0.35, output: 0.75 },
  "@cf/openai/gpt-oss-20b": { input: 0.2, output: 0.3 },
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017": { input: 0.3, output: 1.2 },
  "@cf/deepseek-ai/deepseek-v4-pro-0813": { input: 1.32, output: 3.96 },
  "@cf/moonshotai/kimi-k2.6": { input: 0.95, output: 4 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { input: 0.293, output: 2.253 },
  "@cf/google/gemma-4-26b-a4b-it": { input: 0.1, output: 0.3 },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": { input: 0.351, output: 0.555 },
  // External providers (only used if EXTERNAL_PROVIDERS enables them)
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  sonar: { input: 1, output: 1 },
  "sonar-pro": { input: 3, output: 15 },
  "claude-sonnet": { input: 3, output: 15 },
  "claude-haiku": { input: 1, output: 5 },
};
const DEFAULT_PRICE = { input: 2.5, output: 10 };

/** USD per web-search tool call (OpenAI / Gemini grounding / Claude web search are all ~$10 per 1k). */
export const WEB_SEARCH_CALL_USD = 0.01;

export function priceFor(model: string) {
  if (PRICES[model]) return PRICES[model];
  // Match by longest known prefix, e.g. "gpt-5-mini-2025-08-07" -> "gpt-5-mini"
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : DEFAULT_PRICE;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  webSearchCalls?: number;
}

export function estimateCostUsd(model: string, usage: Usage): number {
  const p = priceFor(model);
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000 + (usage.webSearchCalls ?? 0) * WEB_SEARCH_CALL_USD;
}

export interface CostLine {
  step: string;
  calls: number;
  cachedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Accumulates token usage and estimated cost per pipeline step. */
export class CostTracker {
  private lines = new Map<string, CostLine>();

  add(step: string, model: string, usage: Usage, cached = false): number {
    const line = this.lines.get(step) ?? { step, calls: 0, cachedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const cost = cached ? 0 : estimateCostUsd(model, usage);
    line.calls += 1;
    if (cached) line.cachedCalls += 1;
    else {
      line.inputTokens += usage.inputTokens;
      line.outputTokens += usage.outputTokens;
      line.costUsd += cost;
    }
    this.lines.set(step, line);
    return cost;
  }

  breakdown(): CostLine[] {
    return [...this.lines.values()].map((l) => ({ ...l, costUsd: Math.round(l.costUsd * 10_000) / 10_000 }));
  }

  totals() {
    const b = this.breakdown();
    return {
      inputTokens: b.reduce((s, l) => s + l.inputTokens, 0),
      outputTokens: b.reduce((s, l) => s + l.outputTokens, 0),
      costUsd: Math.round(b.reduce((s, l) => s + l.costUsd, 0) * 10_000) / 10_000,
    };
  }
}
