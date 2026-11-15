// Worker entry: serves the Next.js app (OpenNext), consumes the analysis queue and runs the weekly cron.
// The consumer calls the app's internal route through a self service binding, so the
// whole pipeline runs inside the Next.js bundle and only has to be built once.
// Plain JS on purpose: `.open-next/worker.js` only exists after `opennextjs-cloudflare build`.
import { default as handler } from "./.open-next/worker.js";
import { canonicalRedirect } from "./canonical-host.js";

export default {
  /** One public address (APP_URL): www. and the workers.dev URL redirect there, keeping path and query. */
  async fetch(request, env, ctx) {
    const target = canonicalRedirect(request.url, env.APP_URL);
    if (target) return Response.redirect(target, 308);
    return handler.fetch(request, env, ctx);
  },

  /** @param {MessageBatch<{ analysisId: string, meta?: { ip: string, country?: string, userAgent?: string } }>} batch */
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/run", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": env.INTERNAL_SECRET },
        body: JSON.stringify({ analysisId: msg.body.analysisId, meta: msg.body.meta }),
      });
      if (!res.ok) console.error(`run ${msg.body.analysisId} -> HTTP ${res.status}`);
      msg.ack(); // never retry automatically: a retry would pay for the AI calls again
    }
  },

  /** Weekly tracking (Cron Trigger in wrangler.jsonc): queues a re-run for every confirmed subscription. */
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/weekly", {
        method: "POST",
        headers: { "x-internal-secret": env.INTERNAL_SECRET },
      }).then((res) => {
        if (!res.ok) console.error(`weekly tracking -> HTTP ${res.status}`);
      }),
    );
  },
};

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
