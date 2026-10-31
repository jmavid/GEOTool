import { z } from "zod";
import { generateJson } from "@/lib/ai/llm";
import { clipped } from "@/lib/ai/json";
import type { CostTracker } from "@/lib/ai/cost";
import type { BrandProfile } from "./profile";

export const PROMPT_CATEGORIES = ["DISCOVERY", "COMPARISON", "RECOMMENDATION", "PROBLEM_SOLVING", "PURCHASE_INTENT"] as const;
export type PromptCategoryId = (typeof PROMPT_CATEGORIES)[number];

const QueriesSchema = z.object({
  queries: z
    .array(
      z.object({
        text: clipped(300).pipe(z.string().min(8)),
        category: z
          .string()
          .trim()
          .toUpperCase()
          .transform((c) => c.replace(/[\s-]+/g, "_"))
          .pipe(z.enum(PROMPT_CATEGORIES))
          .catch("DISCOVERY" as const),
      }),
    )
    .min(5),
});
export type GeneratedQuery = { text: string; category: PromptCategoryId };

const SYSTEM = `You write the questions real potential buyers type into ChatGPT when looking for a product or service.
Rules:
- Write them in the buyer's language ({LANG}) and for their market ({COUNTRY}).
- Do NOT include the brand name being analyzed.
- At most 3 questions may name a competitor, and only as "alternatives to X" or "X vs Y" comparisons where other
  products could also be recommended. Never ask about one competitor's price, plans or features alone: the answer
  could not mention anyone else.
- Natural, specific, varied. Mix short and long questions. Include company size, use case or location when realistic.
- Spread across categories: DISCOVERY ("best X for Y"), COMPARISON ("X vs Y", "compare the best X"),
  RECOMMENDATION ("which X should I use for..."), PROBLEM_SOLVING ("how do I solve <pain> ..."),
  PURCHASE_INTENT ("cheapest X with Y", "X pricing for small business").
Return {"queries":[{"text": string, "category": "DISCOVERY"|"COMPARISON"|"RECOMMENDATION"|"PROBLEM_SOLVING"|"PURCHASE_INTENT"}]}`;

/** Normalized-text dedupe so near-identical questions aren't paid for twice. */
export function dedupeQueries(queries: GeneratedQuery[], brand: string, limit: number): GeneratedQuery[] {
  const seen = new Set<string>();
  const brandKey = brand.toLowerCase();
  const out: GeneratedQuery[] = [];
  for (const q of queries) {
    const key = q.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) continue;
    if (brandKey.length > 2 && key.includes(brandKey)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

export async function generateQueries(profile: BrandProfile, count: number, tracker: CostTracker): Promise<GeneratedQuery[]> {
  const system = SYSTEM.replace("{LANG}", profile.language || profile.languageCode).replace("{COUNTRY}", profile.country || "global");
  const user = JSON.stringify({
    howMany: count + 3,
    brandToExclude: profile.brand,
    industry: profile.industry,
    description: profile.description,
    products: profile.products,
    targetCustomer: profile.targetCustomer,
    knownCompetitors: profile.competitors.map((c) => c.name),
  });
  const { queries } = await generateJson({ step: "queries", schema: QueriesSchema, system, user, tracker });
  return dedupeQueries(queries, profile.brand, count);
}

/**
 * Decides which questions an analysis asks. A website keeps the question set of its previous
 * analysis, so the score history measures the same thing every time; new questions are only
 * generated for a first analysis or to fill a larger plan limit.
 */
export function planQuerySet(previous: GeneratedQuery[], limit: number): { reuse: GeneratedQuery[]; missing: number } {
  const reuse = previous.slice(0, limit);
  return { reuse, missing: Math.max(0, limit - reuse.length) };
}
