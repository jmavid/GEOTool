import { describe, expect, it } from "vitest";
import { readWorkersAiOutput } from "@/lib/ai/workers-ai";
import { activeProviders } from "@/providers";
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
    const ids = activeProviders().map((p) => p.id);
    expect(ids).toEqual(["gpt-oss-120b", "deepseek-v4.1-flash-1017"]);
    env.EXTERNAL_PROVIDERS = "openai";
    expect(activeProviders().map((p) => p.id)).toContain("openai");
    delete env.EXTERNAL_PROVIDERS;
    delete env.OPENAI_API_KEY;
  });

  it("Workers AI engines don't browse, so citations aren't expected from them", () => {
    expect(workersAiProvider("@cf/openai/gpt-oss-120b")).toMatchObject({ name: "GPT-OSS 120B", browses: false });
  });
});
