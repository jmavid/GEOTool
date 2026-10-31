/** Errors whose message is safe to show to the end user. Anything else is reported generically. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export const ANALYSIS_FAILED = "Something went wrong while analyzing this website. Please try again in a few minutes.";
export const GENERIC_FAILURE = "Something went wrong. Please try again in a few minutes.";

export function publicMessage(err: unknown, fallback = GENERIC_FAILURE): string {
  if (err instanceof Error && (err.name === "UserError" || err.name === "UrlValidationError")) return err.message;
  return fallback;
}
