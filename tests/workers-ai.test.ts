import { describe, expect, it } from "vitest";
import { readWorkersAiOutput } from "@/lib/ai/workers-ai";
import { activeProviders, connectedExternalProviders } from "@/providers";
import { readClaudeContent, webSearchTool } from "@/providers/claude";
import { readResponsesOutput } from "@/providers/openai";
import { priceFor } from "@/lib/ai/cost";
import { workersAiProvider } from "@/providers/workers-ai";

describe("readWorkersAiOutput", () => {
  it("reads OpenAI-style chat completions (current Workers AI models)", () => {
    const out = {
      model: "@cf/openai/gpt-oss-120b",
      choices: [{ message: { content: '{"brands":["A"]}', reasoning_content: "thinking..." } }],
      usage: { prompt_tokens: 52, completion_tokens: 16, neurons: 4.6 },
    };
    expect(readWorkersAiOutput(out)).toEqual({ text: '{"brands":["A"]}', model: "@cf/openai/gpt-oss-120b", usage: { inputTokens: 52, outputTokens: 16 } });
  });

  it("reads the legacy { response } shape, string or JSON-mode object", () => {
    expect(readWorkersAiOutput({ response: "hello" }).text).toBe("hello");
    expect(readWorkersAiOutput({ response: { a: 1 } }).text).toBe('{"a":1}');
  });

  it("strips inline <think> blocks and survives empty/garbage output", () => {
    expect(readWorkersAiOutput({ response: "<think>hmm</think>\nAnswer" }).text).toBe("Answer");
    expect(readWorkersAiOutput({ choices: [{ message: { content: null } }] }).text).toBe("");
    expect(readWorkersAiOutput(null)).toEqual({ text: "", model: undefined, usage: { inputTokens: 0, outputTokens: 0 } });
  });
});

const env = process.env as Record<string, string | undefined>;

describe("providers", () => {
  it("defaults to Workers AI models only until EXTERNAL_PROVIDERS lists an assistant", () => {
    delete env.EXTERNAL_PROVIDERS;
    delete env.AI_VISIBILITY_MODELS;
    expect(activeProviders("PRO").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017"]);
  });

  it("includes ChatGPT and Claude only on paid plans", () => {
    env.EXTERNAL_PROVIDERS = "openai,claude";
    expect(activeProviders("FREE").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017"]);
    expect(activeProviders("AGENCY").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017", "openai", "claude"]);
    expect(connectedExternalProviders().map((p) => p.name)).toEqual(["ChatGPT", "Claude"]);
    env.EXTERNAL_PROVIDER_PLANS = "AGENCY";
    expect(activeProviders("PRO").map((p) => p.id)).not.toContain("claude");
    delete env.EXTERNAL_PROVIDERS;
    delete env.EXTERNAL_PROVIDER_PLANS;
  });

  it("reads Claude's answer text and web citations", () => {
    const content = [
      { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "facturación" } },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      { type: "text", text: "Holded es ", citations: null },
      {
        type: "text",
        text: "una buena opción.",
        citations: [
          { type: "web_search_result_location", url: "https://holded.com/es", title: "Holded" },
          { type: "web_search_result_location", url: "https://holded.com/es", title: "Holded" },
        ],
      },
    ];
    expect(readClaudeContent(content)).toEqual({ text: "Holded es una buena opción.", citations: [{ url: "https://holded.com/es", title: "Holded" }] });
  });

  it("localizes Claude's web search to the brand's country", () => {
    expect(webSearchTool("ES")).toMatchObject({ type: "web_search_20250305", user_location: { type: "approximate", country: "ES" } });
    expect(webSearchTool()).not.toHaveProperty("user_location");
  });

  it("reads ChatGPT's answer, citations and searches from a Responses output", () => {
    const out = readResponsesOutput({
      output: [
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: "Try Holded.", annotations: [{ type: "url_citation", url: "https://holded.com", title: "Holded" }] }] },
      ],
    });
    expect(out).toEqual({ text: "Try Holded.", citations: [{ url: "https://holded.com", title: "Holded" }], webSearchCalls: 1 });
  });

  it("prices AI Gateway models like the provider's own, plus the 5% credit fee", () => {
    expect(priceFor("anthropic/claude-haiku-5.5").input).toBeCloseTo(0.105);
    expect(priceFor("openai/gpt-5-mini").output).toBeCloseTo(2.1);
  });

  it("Workers AI engines don't browse, so citations aren't expected from them", () => {
    expect(workersAiProvider("@cf/openai/gpt-oss-120b")).toMatchObject({ name: "GPT-OSS 120B", browses: false });
  });
});
