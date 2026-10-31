import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Usage } from "./cost";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  usage: Usage;
}

/** Shapes Workers AI returns: OpenAI chat completion (current models) or the legacy { response }. */
interface WorkersAiOutput {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  response?: unknown;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Pulls the answer text out of any Workers AI text-generation output. Pure, so it is unit-tested. */
export function readWorkersAiOutput(out: unknown): { text: string; model?: string; usage: Usage } {
  const o = (out ?? {}) as WorkersAiOutput;
  let text = "";
  if (o.choices?.length) text = o.choices[0]?.message?.content ?? "";
  else if (typeof o.response === "string") text = o.response;
  else if (o.response && typeof o.response === "object") text = JSON.stringify(o.response);
  // Some reasoning models inline their thinking; it is never part of the answer.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return {
    text,
    model: o.model,
    usage: { inputTokens: o.usage?.prompt_tokens ?? 0, outputTokens: o.usage?.completion_tokens ?? 0 },
  };
}

/** One chat call through the Workers AI binding. Never leaves Cloudflare. */
export async function runChat(model: string, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<ChatResult> {
  const { env } = getCloudflareContext();
  const out = await env.AI.run(model as Parameters<Ai["run"]>[0], {
    messages,
    max_tokens: opts.maxTokens ?? 2_000,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  } as never);
  const parsed = readWorkersAiOutput(out);
  if (!parsed.text) throw new Error(`${model} returned an empty answer`);
  return { text: parsed.text, model, usage: parsed.usage };
}
