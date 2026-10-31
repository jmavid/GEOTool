import { cancelSubscriptionNow } from "@/lib/billing";
import { deleteAccount } from "@/lib/auth/session";
import { UserError } from "@/lib/errors";
import { field, formRoute } from "@/lib/form-route";

/** Typing the account email confirms it. Billing is cancelled first: if that fails, nothing is deleted. */
export const POST = formRoute("/account", async (user, form) => {
  if (field(form, "confirm").toLowerCase() !== user.email) throw new UserError("Type your email address to confirm.");
  await cancelSubscriptionNow(user);
  await deleteAccount(user);
  return "/?deleted=1";
});
