import { describe, expect, it } from "vitest";
import { readWorkersAiOutput } from "@/lib/ai/workers-ai";
import { activeProviders, connectedExternalProviders } from "@/providers";
import { readClaudeContent, webSearchTool } from "@/providers/claude";
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
  it("defaults to Workers AI models only, even if an external key exists", () => {
    env.OPENAI_API_KEY = "sk-test";
    delete env.EXTERNAL_PROVIDERS;
    delete env.AI_VISIBILITY_MODELS;
    const ids = activeProviders("PRO").map((p) => p.id);
    expect(ids).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017"]);
    env.EXTERNAL_PROVIDERS = "openai";
    expect(activeProviders("PRO").map((p) => p.id)).toContain("openai");
    delete env.EXTERNAL_PROVIDERS;
    delete env.OPENAI_API_KEY;
  });

  it("includes ChatGPT and Claude only on paid plans, and only once their key is set", () => {
    env.EXTERNAL_PROVIDERS = "openai,claude";
    env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(activeProviders("STARTER").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017", "claude"]);
    expect(activeProviders("FREE").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017"]);
    env.OPENAI_API_KEY = "sk-test";
    expect(activeProviders("AGENCY").map((p) => p.id)).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017", "openai", "claude"]);
    expect(connectedExternalProviders().map((p) => p.name)).toEqual(["ChatGPT", "Claude"]);
    env.EXTERNAL_PROVIDER_PLANS = "AGENCY";
    expect(activeProviders("PRO").map((p) => p.id)).not.toContain("claude");
    for (const k of ["EXTERNAL_PROVIDERS", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "EXTERNAL_PROVIDER_PLANS"]) delete env[k];
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
          { type: "web_search_result_location", url: "https://holded.com/es", title: "Holded", cited_text: "…", encrypted_index: "x" },
          { type: "web_search_result_location", url: "https://holded.com/es", title: "Holded", cited_text: "…", encrypted_index: "y" },
        ],
      },
    ] as unknown as Parameters<typeof readClaudeContent>[0];
    expect(readClaudeContent(content)).toEqual({ text: "Holded es una buena opción.", citations: [{ url: "https://holded.com/es", title: "Holded" }] });
  });

  it("uses the web search tool each Claude model supports", () => {
    expect(webSearchTool("claude-haiku-5-5", "ES")).toMatchObject({ type: "web_search_20250305", user_location: { type: "approximate", country: "ES" } });
    expect(webSearchTool("claude-sonnet-5-5")).toMatchObject({ type: "web_search_20260209" });
  });

  it("Workers AI engines don't browse, so citations aren't expected from them", () => {
    expect(workersAiProvider("@cf/openai/gpt-oss-120b")).toMatchObject({ name: "GPT-OSS 120B", browses: false });
  });
});
