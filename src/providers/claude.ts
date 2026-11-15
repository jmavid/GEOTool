import { runGatewayModel } from "./gateway";
import type { AIProvider, Citation, ExecuteOptions, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

/** The parts of an Anthropic Messages response we read. */
interface MessagesBlock {
  type: string;
  text?: string;
  citations?: { type: string; url?: string; title?: string | null }[] | null;
}
interface MessagesResponse {
  model?: string;
  content?: MessagesBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    server_tool_use?: { web_search_requests?: number } | null;
  };
}

/** Anthropic's web search tool as AI Gateway accepts it, localized to the brand's market. */
export function webSearchTool(country?: string) {
  return { type: "web_search_20250305", name: "web_search", max_uses: 2, ...(country ? { user_location: { type: "approximate", country } } : {}) };
}

/** Text and cited URLs from a Messages response. Pure, so it is unit-tested. */
export function readClaudeContent(content: MessagesBlock[]): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  let text = "";
  for (const block of content) {
    if (block.type !== "text") continue;
    text += block.text ?? "";
    for (const c of block.citations ?? []) {
      if (c.type === "web_search_result_location" && c.url) citations.push({ url: c.url, title: c.title ?? undefined });
    }
  }
  return { text: text.trim(), citations: uniqueCitations(citations) };
}

/** "Claude" as a buyer experiences it in claude.ai: a chat answer with web search. Billed through Cloudflare. */
export const claudeProvider: AIProvider = {
  id: "claude",
  name: "Claude",
  browses: true,
  get model() {
    return process.env.CLAUDE_MODEL ?? "anthropic/claude-haiku-5.5";
  },
  isConfigured: () => true,
  async executePrompt(prompt: string, options: ExecuteOptions = {}): Promise<ProviderResult> {
    const model = this.model;
    const country = options.country && /^[A-Z]{2}$/.test(options.country) ? options.country : undefined;
    const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: prompt }];
    const content: MessagesBlock[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, webSearchCalls: 0 };
    let served = model;

    // The server-side search loop can pause; resending the turn resumes it. Capped so a stuck turn can't loop.
    for (let turn = 0; turn < 3; turn++) {
      const res = await runGatewayModel<MessagesResponse>(model, {
        max_tokens: 8_000,
        system: SYSTEM_PROMPT,
        // A quick consumer-style answer, not a deep research pass.
        output_config: { effort: "low" },
        messages,
        tools: [webSearchTool(country)],
      });
      served = res.model ?? model;
      const u = res.usage ?? {};
      usage.inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      usage.outputTokens += u.output_tokens ?? 0;
      usage.webSearchCalls += u.server_tool_use?.web_search_requests ?? 0;
      content.push(...(res.content ?? []));
      if (res.stop_reason === "refusal") throw new Error("Claude declined to answer");
      if (res.stop_reason !== "pause_turn") break;
      messages.splice(1, messages.length - 1, { role: "assistant", content });
    }

    const { text, citations } = readClaudeContent(content);
    if (!text) throw new Error(`${model} returned an empty answer`);
    return { text, citations, model: served, usage };
  },
};
