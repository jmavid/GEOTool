import { createProject } from "@/lib/projects";
import { field, formRoute } from "@/lib/form-route";

export const POST = formRoute("/dashboard", async (user, form) => {
  const id = await createProject(user, field(form, "name"));
  return `/dashboard#project-${id}`;
});
