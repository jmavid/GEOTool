import type { AIProvider, Citation, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

interface ClaudeResponse {
  model?: string;
  content?: { type: string; text?: string; citations?: { url?: string; title?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
}

/** Prepared, untested without a key: Claude Messages API with the server-side web search tool. */
export const claudeProvider: AIProvider = {
  id: "claude",
  name: "Claude",
  browses: true,
  get model() {
    return process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
  },
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  async executePrompt(prompt): Promise<ProviderResult> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
    const data = (await res.json()) as ClaudeResponse;
    const textBlocks = (data.content ?? []).filter((b) => b.type === "text");
    const citations: Citation[] = textBlocks.flatMap((b) => (b.citations ?? []).map((c) => ({ url: c.url ?? "", title: c.title })));
    return {
      text: textBlocks.map((b) => b.text ?? "").join(""),
      citations: uniqueCitations(citations),
      model: data.model ?? this.model,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        webSearchCalls: data.usage?.server_tool_use?.web_search_requests ?? 0,
      },
    };
  },
};
