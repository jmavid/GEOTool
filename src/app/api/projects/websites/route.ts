import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createAnalysis } from "@/lib/analyses";
import { UserError } from "@/lib/errors";
import { field, formRoute } from "@/lib/form-route";
import { planLimitError } from "@/lib/plans";
import { attachWebsite, defaultProjectId, trackedWebsiteIds } from "@/lib/projects";
import { clientIp } from "@/lib/security/rate-limit";

/**
 * Add a website to a project. From the dashboard (url): runs, or reuses today's, analysis. From a report (analysisId):
 * only adds the site, so following a report never starts a paid run by surprise.
 */
export const POST = formRoute("/dashboard", async (user, form, req) => {
  const analysisId = field(form, "analysisId");
  if (analysisId) {
    const analysis = /^[0-9a-f-]{36}$/.test(analysisId)
      ? await getDb().query.analyses.findFirst({ columns: { websiteId: true }, where: eq(schema.analyses.id, analysisId) })
      : null;
    if (!analysis) throw new UserError("This report doesn't exist.");
    const tracked = await trackedWebsiteIds(user.id);
    const error = planLimitError(user.plan, { trackedSites: tracked.length, alreadyTracked: tracked.includes(analysis.websiteId), analysesLast30Days: 0 });
    if (error) throw new UserError(error);
    await attachWebsite(await defaultProjectId(user.id), analysis.websiteId);
    return "/dashboard";
  }
  const url = field(form, "url");
  if (!url || url.length > 2048) throw new UserError("Enter a website URL.");
  const { id } = await createAnalysis(url, clientIp(req), user, field(form, "projectId") || undefined);
  return `/report/${id}`;
});
