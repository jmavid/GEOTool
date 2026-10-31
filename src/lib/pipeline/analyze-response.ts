import { z } from "zod";
import { generateJson } from "@/lib/ai/llm";
import { clipped, upTo } from "@/lib/ai/json";
import type { CostTracker } from "@/lib/ai/cost";
import { detectInResponse, findMention, normalizeText, type BrandRef } from "./detect";

const SENTIMENTS = ["positive", "neutral", "negative"] as const;

export const ResponseAnalysisSchema = z.object({
  brands: upTo(
      z.object({
        name: clipped(80).pipe(z.string().min(1)),
        rank: z.number().int().min(1).max(50).nullable().catch(null),
        recommended: z.boolean().catch(false),
      }),
      30,
    ).catch([]),
  target: z
    .object({
      mentioned: z.boolean().catch(false),
      recommended: z.boolean().catch(false),
      sentiment: z.enum(SENTIMENTS).nullable().catch(null),
      context: clipped(300).nullable().catch(null),
    })
    .catch({ mentioned: false, recommended: false, sentiment: null, context: null }),
});
export type ResponseAnalysis = z.infer<typeof ResponseAnalysisSchema>;

const SYSTEM = `You analyze an AI assistant's answer to a buyer question.
List every company, product or brand the answer names, in the order the answer ranks or presents them
(rank 1 = first/top recommendation; null if not ranked). "recommended" = the answer suggests choosing it (not just mentions it or warns against it).
Then evaluate the TARGET brand: it counts as mentioned even with spelling variations, abbreviations, its product names or its domain.
Return {"brands":[{"name":string,"rank":number|null,"recommended":boolean}],
"target":{"mentioned":boolean,"recommended":boolean,"sentiment":"positive"|"neutral"|"negative"|null,"context":string|null (short quote where the target appears)}}`;

export async function llmAnalyzeResponse(answer: string, target: BrandRef, aliases: string[], tracker: CostTracker): Promise<ResponseAnalysis | null> {
  const user = `TARGET brand: ${target.name}${aliases.length ? ` (also known as: ${aliases.join(", ")})` : ""}${target.domain ? `, website ${target.domain}` : ""}
<answer>
${answer.slice(0, 12_000)}
</answer>`;
  try {
    return await generateJson({ step: "response-analysis", schema: ResponseAnalysisSchema, system: SYSTEM, user, tracker, maxTokens: 2_000 });
  } catch {
    return null; // Fall back to deterministic detection only.
  }
}

/** Maps any brand name to a stable display name, reusing known competitors and earlier spellings. */
export class BrandRegistry {
  private byKey = new Map<string, string>();
  constructor(
    private target: BrandRef,
    private known: BrandRef[],
  ) {}

  isTarget(name: string): boolean {
    const n = normalizeText(name);
    return findMention(n, this.target.variants) >= 0 || this.target.variants.includes(n.replace(/ /g, ""));
  }

  canonical(name: string): string | null {
    const n = normalizeText(name);
    if (!n || n.replace(/ /g, "").length < 2) return null;
    if (this.isTarget(name)) return null;
    const known = this.known.find((k) => k.variants.includes(n) || k.variants.includes(n.replace(/ /g, "")) || findMention(n, k.variants) === 0);
    if (known) return known.name;
    const key = n.replace(/ /g, "");
    if (!this.byKey.has(key)) this.byKey.set(key, name.trim());
    return this.byKey.get(key)!;
  }
}

export interface ResponseVerdict {
  brandMentioned: boolean;
  recommended: boolean;
  position: number | null;
  competitorsMentioned: string[];
  brandCited: boolean;
  sentiment: string | null;
  context: string | null;
}

/** Combines literal detection with the semantic LLM pass. Literal hits are never overruled. */
export function mergeVerdict(
  answer: string,
  citations: { url: string }[],
  target: BrandRef,
  competitors: BrandRef[],
  llm: ResponseAnalysis | null,
  registry: BrandRegistry,
): ResponseVerdict {
  const det = detectInResponse(answer, citations, target, competitors);
  const llmTarget = llm?.brands.find((b) => registry.isTarget(b.name));
  const brandMentioned = det.brandMentioned || !!llm?.target.mentioned || !!llmTarget;

  let position = det.position;
  if (position === null && brandMentioned && llm) {
    // Position among brands as the LLM ordered them.
    const ordered = llm.brands.filter((b) => b.rank !== null).sort((a, b) => a.rank! - b.rank!);
    const idx = ordered.findIndex((b) => registry.isTarget(b.name));
    position = idx >= 0 ? idx + 1 : (llmTarget?.rank ?? null);
  }

  const sentiment = brandMentioned ? (llm?.target.sentiment ?? null) : null;
  const recommended =
    brandMentioned &&
    sentiment !== "negative" &&
    (llm ? llm.target.recommended || !!llmTarget?.recommended : position !== null && position <= 5);

  const competitorNames = new Set<string>(det.competitorsMentioned);
  for (const b of llm?.brands ?? []) {
    const c = registry.canonical(b.name);
    if (c) competitorNames.add(c);
  }

  return {
    brandMentioned,
    recommended,
    position,
    competitorsMentioned: [...competitorNames],
    brandCited: det.brandCited,
    sentiment,
    context: brandMentioned ? (llm?.target.context ?? null) : null,
  };
}
