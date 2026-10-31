# GEO Score — PageSpeed Insights for AI visibility

Enter a URL → we read the site, write the questions real buyers ask ChatGPT, ask them, and return a
**deterministic GEO Score (0-100)**, **AI share of voice** and **what to do next**.

Runs entirely on **Cloudflare**: Next.js 16 on Workers (OpenNext), D1 (SQLite), Queues and **Workers AI**.
No AI call leaves Cloudflare: the analysis and the visibility test both use Workers AI models.

## Architecture

```
Browser ──POST /api/analyses──▶ Worker (Next.js via OpenNext)
                                  │ validate URL (SSRF) · rate limit · dedupe 24h
                                  │ insert analysis (D1) ──▶ Queue "geotool-analyses"
Browser ◀─poll GET /api/analyses/:id (2.5s)                    │
                                                               ▼
                 worker.js queue() ──service binding──▶ POST /api/internal/run (secret header)
                                                               │ runAnalysis(id)  (no 30s waitUntil limit)
                                                               ▼
   1 analyzeSite  → 2 extractProfile → 3 generateQueries → 4 providers × prompts
   → 5 detect + LLM verdict per answer → 6 computeGeoScore + shareOfVoice (pure code)
   → 7 generateInsights (why you're losing + action plan) → D1
```

| Path | What |
|---|---|
| `src/app/page.tsx` | Landing (hero + URL input) |
| `src/app/report/[id]` + `src/components/report-view.tsx` | Progress + results page (score, providers, SoV, reasons, actions, queries, history) |
| `src/app/api/analyses` | Create (POST) / read report (GET) |
| `src/app/api/internal/run` | Pipeline entry, only callable by the queue consumer |
| `worker.js` | Worker entry: OpenNext `fetch` + Queue `queue()` consumer |
| `src/lib/security/` | URL validation, SSRF-safe fetch (DoH + redirect re-check + size cap), burst limiter |
| `src/lib/analyzer/` | HTML parsing (cheerio/slim), page picking, robots/sitemap/llms.txt |
| `src/lib/pipeline/` | profile, queries, detect (pure), analyze-response, score (pure), insights, run |
| `src/lib/ai/` | Workers AI chat wrapper, JSON-mode helper with Zod + retry, D1-backed cache, cost tracker |
| `src/providers/` | `workers-ai.ts` (active: one engine per model in `AI_VISIBILITY_MODELS`); `openai.ts`, `gemini.ts`, `claude.ts`, `perplexity.ts` prepared but off |
| `src/db/schema.ts` | Drizzle schema → `migrations/` (applied with wrangler) |
| `src/lib/plans.ts` | Plan limits (FREE / STARTER / PRO / AGENCY) |

**Why not Postgres/Prisma:** the app must deploy to Cloudflare. D1 + Drizzle is native there (no external DB,
no connection pooling, tiny bundle). Prisma's engine is heavy on Workers. Swapping to Postgres later means
changing `src/db/*` only (Drizzle has a pg dialect; Hyperdrive for pooling).

## Data model (D1)

`users` → `projects` → `websites` (unique canonical URL) → `analyses` (status, stage, profile, siteFacts,
geoScore, scoreBreakdown, providerScores, insights, tokens, costUsd, costBreakdown) →
`prompts` (text, category) · `ai_responses` (prompt, provider, model, response, brandMentioned, recommended,
position, competitorsMentioned, citations, brandCited, sentiment, context, cached, tokens, cost, timestamp) ·
`competitors` (name, mentions, shareOfVoice, isTarget, source) · `recommendations` (priority, problem,
evidence, action, impact, difficulty). Plus `llm_cache` and `subscriptions` ("Track my score weekly" emails per website: the demand signal before billing).

History: every analysis of a website is kept; the report shows `34 → 38 → 41`.

## Provider interface

```ts
interface AIProvider {
  id: string;              // "gpt-oss-120b", "openai"...
  name: string;            // "GPT-OSS 120B"
  model: string;
  browses: boolean;        // web search => its answers can cite the site
  isConfigured(): boolean;
  executePrompt(prompt, { country, language }): Promise<{ text, citations, model, usage }>;
}
```

**Default (all inside Cloudflare):**
- Analysis tasks (profile, queries, per-answer verdicts, insights): `AI_ANALYSIS_MODEL` = `@cf/openai/gpt-oss-120b`.
- Engines asked the buyer questions: `AI_VISIBILITY_MODELS` = `@cf/openai/gpt-oss-120b` (OpenAI's open model, the
  closest proxy to ChatGPT's knowledge) and `@cf/deepseek-ai/deepseek-v4.1-flash-1017`. Add more by listing them
  (e.g. `@cf/moonshotai/kimi-k2.6`); each one is a column in the report and multiplies the visibility cost.

**What this measures:** how well open LLMs *know and recommend* the brand from their training data. These models
don't search the web, so: (1) the report shows them by their real names, never as "ChatGPT"; (2) the Citations
component is marked "not measured" and its 15% is redistributed proportionally; (3) very recent brands score low
until they enter training data. Live assistants with web search (ChatGPT, Gemini, Claude, Perplexity) are written in
`src/providers/` and can be switched on with `EXTERNAL_PROVIDERS=openai,...` plus their key, if you ever decide to.

Model choice was tested on 2026-10-27 with real calls: gpt-oss-120b and DeepSeek V4.1 Flash answered in ~4s with
good brand lists and valid JSON; Kimi K2.6 was good but ~3× slower; GLM-5.3-flash spent its whole budget reasoning
and returned nothing.

## GEO Score (deterministic)

Computed in `src/lib/pipeline/score.ts` from stored rows only. The LLM never outputs a score.

| Component | Weight | Formula |
|---|---|---|
| Brand visibility | 30% | answers mentioning the brand ÷ answers |
| Recommendations | 25% | answers that recommend it (not negative) ÷ answers |
| Average position | 20% | mean of per-answer rank scores (#1=100, −20 per place, min 10) |
| Citations | 15% | answers citing the brand's domain ÷ answers from web-search engines (not measured with Workers AI: weight redistributed) |
| Share of voice | 10% | brand share ÷ top brand share |

Brand detection = literal pass (accent/case/punctuation normalization, legal suffixes, camelCase, compact
and domain variants, word boundaries, list-position ranking) **OR** a semantic LLM pass per answer
(variants, product names, sentiment). Literal hits are never overruled; a negative mention never counts as a recommendation.

## Security

URL: http(s) only, no credentials, ports 80/443, no IP literals (incl. `2130706433`, `0x7f.1`), blocked
`localhost/.local/.internal/metadata.*`. Fetch: every hop is resolved over DoH and **all** A/AAAA must be
public unicast (private, loopback, link-local 169.254.x incl. cloud metadata, CGNAT, ULA, v4-mapped are
refused), manual redirects re-validated, 10s timeout, 1.5MB cap. On Cloudflare the
`global_fetch_strictly_public` flag adds a platform guarantee against DNS rebinding. Site text is passed to
the LLM as delimited untrusted data; React escapes all output; citation links are http(s) only.
Abuse: Cloudflare Turnstile on the form (verified server-side, fails closed; on once `TURNSTILE_SITE_KEY` + the
`TURNSTILE_SECRET_KEY` secret exist), 5 req/min per IP (isolate), `FREE_ANALYSES_PER_IP_PER_DAY` and a global
`MAX_ANALYSES_PER_DAY` budget cap in D1 (IP stored hashed).

## Cost control

- Same site within 24h → the existing analysis is returned (cost 0).
- `llm_cache` (72h): identical provider+model+prompt or JSON task is never paid twice.
- Query dedupe; hard cap 100 prompts; plan limit (FREE 25); queue `max_retries: 0` so a failure never re-bills.
- Every call is metered per step (`costBreakdown`), visible in the report when `SHOW_COSTS=true` (always in dev).

Rough estimate with the default Workers AI setup (25 prompts × 2 models + 50 verdicts + profile/queries/insights):
**≈ $0.05–0.15 per analysis** (gpt-oss-120b $0.35/$0.75 per 1M tokens, DeepSeek V4.1 Flash $0.30/$1.20; reasoning
tokens count as output). Workers AI includes 10,000 free neurons/day. Real numbers: `analyses.cost_breakdown`.

## Weekly tracking

"Track your score weekly" on the report → `subscriptions` row + a **double opt-in** email (`/subscription/[token]`,
confirm/unsubscribe are form POSTs so mail link scanners can't trigger them). Only confirmed, not unsubscribed rows count,
so nobody can make us re-analyze a site or email a stranger by typing an address.

A Cron Trigger (Mondays 07:00 UTC, `worker.js scheduled()` → `/api/internal/weekly`) queues one `SCHEDULED` analysis per
tracked website not analyzed in the last 6 days (cap `MAX_WEEKLY_ANALYSES`, separate from the visitors' daily cap). Runs
reuse the website's questions, so scores are comparable. When a scheduled run completes, each confirmed subscriber gets
the new score, the change since last time and Fix #1 (`List-Unsubscribe` one-click supported); never twice per analysis.

Emails use **Cloudflare Email Service** (nothing leaves Cloudflare). Until it is set up, sign-ups are kept as a waitlist
and no weekly run is queued. In `next dev` emails are printed to the console, so the whole flow works locally.

## Plans

Defined in `src/lib/plans.ts` (FREE 1 analysis/25 prompts · STARTER €19 1 site/25 prompts/weekly ·
PRO €49 5 sites/100 prompts · AGENCY €149 30 sites/reports). No auth/Stripe yet: anonymous runs are FREE.
Billing = set `users.plan`.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars        # INTERNAL_SECRET, IP_HASH_SALT (no AI keys needed)
cp wrangler.example.jsonc wrangler.jsonc
npm run db:migrate:local
npm run dev                            # next dev, bindings via initOpenNextCloudflareForDev (runs pipeline in-process)
npm run preview                        # production build in workerd, with the real queue flow, :8787
npm test                               # vitest: score, detection, competitors, URL/SSRF, malformed AI output, example site
```

`tests/fixtures/example-site.html` is the example website used by the analyzer tests.

## Deploy (Cloudflare)

```bash
cp wrangler.example.jsonc wrangler.jsonc       # git-ignored; holds your own ids
npx wrangler d1 create geotool                 # put the database_id in wrangler.jsonc
npx wrangler queues create geotool-analyses
npm run db:migrate:remote
npx wrangler secret put INTERNAL_SECRET
npx wrangler secret put IP_HASH_SALT
npx wrangler secret put TURNSTILE_SECRET_KEY   # + TURNSTILE_SITE_KEY in wrangler.jsonc vars
npm run deploy
```
Weekly tracking emails: onboard a sending domain in Cloudflare Email Service, then in `wrangler.jsonc` add
`"send_email": [{ "name": "EMAIL" }]`, set `EMAIL_FROM` (e.g. `GEO Score <scores@yourdomain.com>`) and `APP_URL`, and
`npm run db:migrate:remote` + `npm run deploy`.
Queues and the CPU time of a 2-3 min
analysis need the Workers Paid plan.

## Implementation status

Done: phases 1-12 (landing, analyzer, profile, queries, OpenAI provider, response analysis, score, results,
competitors, recommendations, persistence/history, tests, Cloudflare deploy setup).
Weekly tracking: done (needs the Email Service setup above to send in production).
Next: tune prompts/weights on real analyses · auth + projects UI · plan limits · Stripe.

## License

[MIT](LICENSE)
