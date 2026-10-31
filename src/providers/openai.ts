import OpenAI from "openai";
import type { AIProvider, Citation, ExecuteOptions, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

let client: OpenAI | null = null;
export function openaiClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 2 });
  return client;
}

/** "ChatGPT" as a buyer experiences it: a chat model with web search, localized to the market. */
export const openaiProvider: AIProvider = {
  id: "openai",
  name: "ChatGPT",
  browses: true,
  get model() {
    return process.env.OPENAI_VISIBILITY_MODEL ?? "gpt-5-mini";
  },
  isConfigured: () => !!process.env.OPENAI_API_KEY,
  async executePrompt(prompt: string, options: ExecuteOptions = {}): Promise<ProviderResult> {
    const webSearch = process.env.OPENAI_WEB_SEARCH !== "false";
    const country = options.country && /^[A-Z]{2}$/.test(options.country) ? options.country : undefined;
    const res = await openaiClient().responses.create({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: prompt,
      reasoning: this.model.startsWith("gpt-5") ? { effort: "low" } : undefined,
      tools: webSearch
        ? [{ type: "web_search", search_context_size: "low", ...(country ? { user_location: { type: "approximate", country } } : {}) }]
        : undefined,
    });

    const citations: Citation[] = [];
    let webSearchCalls = 0;
    for (const item of res.output) {
      if (item.type === "web_search_call") webSearchCalls++;
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "output_text") {
            for (const a of part.annotations) if (a.type === "url_citation") citations.push({ url: a.url, title: a.title });
          }
        }
      }
    }
    return {
      text: res.output_text ?? "",
      citations: uniqueCitations(citations),
      model: res.model ?? this.model,
      usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, webSearchCalls },
    };
  },
};
