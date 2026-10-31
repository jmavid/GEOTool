import type { AIProvider, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

interface PerplexityResponse {
  model?: string;
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { url?: string; title?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Prepared, untested without a key: Perplexity Sonar (search is built in). */
export const perplexityProvider: AIProvider = {
  id: "perplexity",
  name: "Perplexity",
  browses: true,
  get model() {
    return process.env.PERPLEXITY_MODEL ?? "sonar";
  },
  isConfigured: () => !!process.env.PERPLEXITY_API_KEY,
  async executePrompt(prompt): Promise<ProviderResult> {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}`);
    const data = (await res.json()) as PerplexityResponse;
    const citations = data.search_results?.length
      ? data.search_results.map((r) => ({ url: r.url ?? "", title: r.title }))
      : (data.citations ?? []).map((url) => ({ url }));
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      citations: uniqueCitations(citations),
      model: data.model ?? this.model,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, webSearchCalls: 1 },
    };
  },
};
