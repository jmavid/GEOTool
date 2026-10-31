import { env } from "@/lib/env";

/**
 * Who runs the service, for the legal pages. Set in your own (git-ignored) wrangler.jsonc so no personal or company
 * details live in the repository: LEGAL_NAME (name or company, address, VAT id) and CONTACT_EMAIL.
 */
export function operator() {
  return { name: env("LEGAL_NAME") || "the operator of this website", email: env("CONTACT_EMAIL") || null };
}

export const LEGAL_UPDATED = "October 31, 2026";
