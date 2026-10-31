import { detachWebsite } from "@/lib/projects";
import { field, formRoute } from "@/lib/form-route";

export const POST = formRoute("/dashboard", async (user, form) => {
  await detachWebsite(user.id, field(form, "linkId"));
  return "/dashboard";
});
