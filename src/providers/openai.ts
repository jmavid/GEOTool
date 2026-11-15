import { runGatewayModel } from "./gateway";
import type { AIProvider, Citation, ExecuteOptions, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

/** The parts of an OpenAI Responses API response we read. */
interface ResponsesOutput {
  model?: string;
  output_text?: string;
  output?: {
    type: string;
    content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Text, cited URLs and search count from a Responses API output. Pure, so it is unit-tested. */
export function readResponsesOutput(res: ResponsesOutput): { text: string; citations: Citation[]; webSearchCalls: number } {
  const citations: Citation[] = [];
  let text = "";
  let webSearchCalls = 0;
  for (const item of res.output ?? []) {
    if (item.type === "web_search_call") webSearchCalls++;
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      text += part.text ?? "";
      for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) citations.push({ url: a.url, title: a.title });
    }
  }
  return { text: (text || res.output_text || "").trim(), citations: uniqueCitations(citations), webSearchCalls };
}

/** "ChatGPT" as a buyer experiences it: a chat model with web search, localized to the market. Billed through Cloudflare. */
export const openaiProvider: AIProvider = {
  id: "openai",
  name: "ChatGPT",
  browses: true,
  get model() {
    return process.env.OPENAI_VISIBILITY_MODEL ?? "openai/gpt-5-mini";
  },
  isConfigured: () => true,
  async executePrompt(prompt: string, options: ExecuteOptions = {}): Promise<ProviderResult> {
    const model = this.model;
    const country = options.country && /^[A-Z]{2}$/.test(options.country) ? options.country : undefined;
    const res = await runGatewayModel<ResponsesOutput>(model, {
      instructions: SYSTEM_PROMPT,
      input: prompt,
      ...(model.includes("gpt-5") ? { reasoning: { effort: "low" } } : {}),
      tools: [{ type: "web_search", search_context_size: "low", ...(country ? { user_location: { type: "approximate", country } } : {}) }],
    });
    const { text, citations, webSearchCalls } = readResponsesOutput(res);
    if (!text) throw new Error(`${model} returned an empty answer`);
    return {
      text,
      citations,
      model: res.model ?? model,
      usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, webSearchCalls },
    };
  },
};
