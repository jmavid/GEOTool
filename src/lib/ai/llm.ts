import type { z } from "zod";
import { cached, cacheKey } from "./cache";
import type { CostTracker, Usage } from "./cost";
import { parseWithSchema } from "./json";
import { runChat } from "./workers-ai";

export const analysisModel = () => process.env.AI_ANALYSIS_MODEL ?? "@cf/openai/gpt-oss-120b";

async function callOnce(system: string, user: string, maxTokens: number): Promise<{ text: string; usage: Usage }> {
  return runChat(
    analysisModel(),
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json: true, maxTokens },
  );
}

/**
 * Asks the analysis model for JSON, validates it with Zod, retries once on malformed
 * output and caches successful results. Throws only if both attempts are invalid.
 */
export async function generateJson<T extends z.ZodType>(opts: {
  step: string;
  schema: T;
  system: string;
  user: string;
  tracker: CostTracker;
  /** Output budget incl. reasoning tokens. */
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const system = `${opts.system}\nRespond with a single valid JSON object only.`;
  const model = analysisModel();
  const key = cacheKey(["json", model, system, opts.user]);
  const { value, hit } = await cached(key, async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: { text: string; usage: Usage };
      try {
        res = await callOnce(system, opts.user, opts.maxTokens ?? 4_000);
      } catch (err) {
        if (attempt === 1) throw err;
        continue; // empty answer or transient error: one retry
      }
      opts.tracker.add(opts.step, model, res.usage);
      const parsed = parseWithSchema(res.text, opts.schema);
      if (parsed) return parsed;
    }
    throw new Error(`The AI returned an invalid response during "${opts.step}".`);
  });
  if (hit) opts.tracker.add(opts.step, model, { inputTokens: 0, outputTokens: 0 }, true);
  return value as z.infer<T>;
}
