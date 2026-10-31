import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { field, formRoute } from "@/lib/form-route";

/** Account settings: for now the agency name printed on client reports. */
export const POST = formRoute("/account", async (user, form) => {
  const agencyName = field(form, "agencyName").slice(0, 80) || null;
  await getDb().update(schema.users).set({ agencyName }).where(eq(schema.users.id, user.id));
  return "/account?saved=1";
});
