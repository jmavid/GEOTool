import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createAnalysis } from "@/lib/analyses";
import { UserError } from "@/lib/errors";
import { field, formRoute } from "@/lib/form-route";
import { trackedWebsiteIds } from "@/lib/projects";
import { clientIp } from "@/lib/security/rate-limit";

/** "Run now" on a dashboard site: a fresh analysis on the user's plan (or today's, if one already ran). */
export const POST = formRoute("/dashboard", async (user, form, req) => {
  const websiteId = field(form, "websiteId");
  if (!(await trackedWebsiteIds(user.id)).includes(websiteId)) throw new UserError("That website isn't in your dashboard.");
  const website = await getDb().query.websites.findFirst({ columns: { url: true }, where: eq(schema.websites.id, websiteId) });
  if (!website) throw new UserError("That website isn't in your dashboard.");
  const { id } = await createAnalysis(website.url, clientIp(req), user);
  return `/report/${id}`;
});
