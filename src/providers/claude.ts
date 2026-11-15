import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, Citation, ExecuteOptions, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 2 });
  return client;
}

/** The dynamic-filtering web search needs Sonnet/Opus/Fable-class models; Haiku keeps the basic tool. */
export function webSearchTool(model: string, country?: string): Anthropic.Messages.ToolUnion {
  const user_location = country ? { type: "approximate" as const, country } : undefined;
  return /^claude-haiku/.test(model)
    ? { type: "web_search_20250305", name: "web_search", max_uses: 2, user_location }
    : { type: "web_search_20260209", name: "web_search", max_uses: 2, user_location };
}

/** Text and cited URLs from a Messages response. Pure, so it is unit-tested. */
export function readClaudeContent(content: Anthropic.Messages.ContentBlock[]): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  let text = "";
  for (const block of content) {
    if (block.type !== "text") continue;
    text += block.text;
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location") citations.push({ url: c.url, title: c.title ?? undefined });
    }
  }
  return { text: text.trim(), citations: uniqueCitations(citations) };
}

/** "Claude" as a buyer experiences it in claude.ai: a chat answer with web search, localized to the market. */
export const claudeProvider: AIProvider = {
  id: "claude",
  name: "Claude",
  browses: true,
  get model() {
    return process.env.CLAUDE_MODEL ?? "claude-haiku-5-5";
  },
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  async executePrompt(prompt: string, options: ExecuteOptions = {}): Promise<ProviderResult> {
    const model = this.model;
    const country = options.country && /^[A-Z]{2}$/.test(options.country) ? options.country : undefined;
    const tools = [webSearchTool(model, country)];
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
    const content: Anthropic.Messages.ContentBlock[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
    let served = model;

    // The server-side search loop can pause; resending the turn resumes it. Capped so a stuck turn can't loop.
    for (let turn = 0; turn < 3; turn++) {
      const res = await anthropic().messages.create({
        model,
        max_tokens: 8_000,
        system: SYSTEM_PROMPT,
        // A quick consumer-style answer, not a deep research pass.
        output_config: { effort: "low" },
        messages,
        tools,
      });
      served = res.model;
      usage.inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      usage.outputTokens += res.usage.output_tokens;
      usage.webSearchCalls += res.usage.server_tool_use?.web_search_requests ?? 0;
      content.push(...res.content);
      if (res.stop_reason === "refusal") throw new Error(`Claude declined to answer (${res.stop_details?.category ?? "no category"})`);
      if (res.stop_reason !== "pause_turn") break;
      messages.splice(1, messages.length - 1, { role: "assistant", content: content as Anthropic.Messages.ContentBlockParam[] });
    }

    const { text, citations } = readClaudeContent(content);
    if (!text) throw new Error(`${model} returned an empty answer`);
    return { text, citations, model: served, usage };
  },
};
