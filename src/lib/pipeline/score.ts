/**
 * GEO Score: deterministic, computed only from stored response analyses.
 * Every component is 0-100 and carries the raw numbers that produced it.
 */

export interface ScoredResponse {
  provider: string;
  brandMentioned: boolean;
  recommended: boolean;
  position: number | null;
  brandCited: boolean;
  /** False when the engine can't browse the web, so citations are impossible, not missing. */
  citationsMeasured: boolean;
  competitorsMentioned: string[];
}

export type ComponentKey = "mentions" | "recommendations" | "position" | "citations" | "shareOfVoice";

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  /** Effective weight in this analysis (0 when the component could not be measured). */
  weight: number;
  measured: boolean;
  score: number;
  /** Human-readable explanation with the underlying numbers. */
  detail: string;
}

export interface GeoScore {
  score: number;
  components: ScoreComponent[];
  totals: { responses: number; mentioned: number; recommended: number; cited: number; citationsMeasured: boolean };
}

export const WEIGHTS: Record<ComponentKey, number> = {
  mentions: 0.3,
  recommendations: 0.25,
  position: 0.2,
  citations: 0.15,
  shareOfVoice: 0.1,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Rank 1 = 100, each place below loses 20 points, floor 10 for anything mentioned. */
export function positionToScore(position: number): number {
  if (!Number.isFinite(position) || position < 1) return 0;
  return clamp(Math.max(10, 100 - (position - 1) * 20));
}

export interface ShareOfVoiceEntry {
  name: string;
  mentions: number;
  share: number;
  isTarget: boolean;
}

/** Share of voice: each brand counts once per answer it appears in. */
export function shareOfVoice(responses: ScoredResponse[], targetName: string): ShareOfVoiceEntry[] {
  const counts = new Map<string, number>();
  counts.set(targetName, 0);
  for (const r of responses) {
    if (r.brandMentioned) counts.set(targetName, (counts.get(targetName) ?? 0) + 1);
    for (const c of new Set(r.competitorsMentioned)) {
      if (c === targetName) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  return [...counts.entries()]
    .map(([name, mentions]) => ({ name, mentions, share: total ? mentions / total : 0, isTarget: name === targetName }))
    .sort((a, b) => b.mentions - a.mentions || Number(b.isTarget) - Number(a.isTarget));
}

export function computeGeoScore(responses: ScoredResponse[], targetName: string): GeoScore {
  const n = responses.length;
  const mentioned = responses.filter((r) => r.brandMentioned);
  const recommended = responses.filter((r) => r.brandMentioned && r.recommended);
  const citable = responses.filter((r) => r.citationsMeasured);
  const cited = citable.filter((r) => r.brandCited);
  const positions = mentioned.map((r) => r.position).filter((p): p is number => typeof p === "number" && p >= 1);

  const mentionRate = n ? mentioned.length / n : 0;
  const recommendationRate = n ? recommended.length / n : 0;
  const citationRate = citable.length ? cited.length / citable.length : 0;
  // No engine browsed the web: citations are not measurable, so their weight is spread proportionally over the rest.
  const citationsMeasured = citable.length > 0;
  const w = (key: ComponentKey) => (citationsMeasured ? WEIGHTS[key] : key === "citations" ? 0 : WEIGHTS[key] / (1 - WEIGHTS.citations));
  const avgPosition = positions.length ? positions.reduce((s, p) => s + p, 0) / positions.length : null;
  // Average of per-answer position scores (more robust than scoring the average position).
  const positionScore = positions.length ? positions.reduce((s, p) => s + positionToScore(p), 0) / positions.length : 0;

  const sov = shareOfVoice(responses, targetName);
  const me = sov.find((s) => s.isTarget)!;
  const leader = sov.find((s) => !s.isTarget) ?? null;
  const topShare = Math.max(me.share, leader?.share ?? 0);
  const sovScore = topShare > 0 ? (me.share / topShare) * 100 : 0;

  const components: ScoreComponent[] = [
    {
      key: "mentions",
      measured: true,
      label: "Brand visibility",
      weight: w("mentions"),
      score: clamp(mentionRate * 100),
      detail: `Mentioned in ${mentioned.length} of ${n} AI answers (${pct(mentionRate)}).`,
    },
    {
      key: "recommendations",
      measured: true,
      label: "Recommendations",
      weight: w("recommendations"),
      score: clamp(recommendationRate * 100),
      detail: `Actively recommended in ${recommended.length} of ${n} answers (${pct(recommendationRate)}).`,
    },
    {
      key: "position",
      measured: true,
      label: "Average position",
      weight: w("position"),
      score: clamp(positionScore),
      detail: avgPosition
        ? `Average rank #${avgPosition.toFixed(1)} when mentioned (#1 = 100, each place lower −20).`
        : "Never ranked in any answer.",
    },
    {
      key: "citations",
      measured: citationsMeasured,
      label: "Citations",
      weight: w("citations"),
      score: clamp(citationRate * 100),
      detail: citationsMeasured
        ? `Your website was cited as a source in ${cited.length} of ${citable.length} web-search answers (${pct(citationRate)}).`
        : "Not measured: the AI models tested answer from their own knowledge, without web search. Its 15% is spread over the other components.",
    },
    {
      key: "shareOfVoice",
      measured: true,
      label: "Share of voice",
      weight: w("shareOfVoice"),
      score: clamp(sovScore),
      detail: leader
        ? `You hold ${pct(me.share)} of brand mentions; the most mentioned competitor (${leader.name}) holds ${pct(leader.share)}. Score = your share ÷ top share.`
        : `You hold ${pct(me.share)} of brand mentions.`,
    },
  ];

  const score = clamp(components.reduce((s, c) => s + c.score * c.weight, 0));
  return { score, components, totals: { responses: n, mentioned: mentioned.length, recommended: recommended.length, cited: cited.length, citationsMeasured } };
}

/** Per-provider visibility = mention rate for that provider, 0-100. */
export function providerVisibility(responses: ScoredResponse[]): Record<string, { mentionRate: number; responses: number }> {
  const out: Record<string, { mentionRate: number; responses: number }> = {};
  for (const r of responses) {
    out[r.provider] ??= { mentionRate: 0, responses: 0 };
    out[r.provider].responses += 1;
    if (r.brandMentioned) out[r.provider].mentionRate += 1;
  }
  for (const k of Object.keys(out)) out[k].mentionRate = Math.round((out[k].mentionRate / out[k].responses) * 100);
  return out;
}
