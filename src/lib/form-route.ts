import { NextResponse } from "next/server";
import { currentUser, sameOrigin, type User } from "@/lib/auth/session";
import { publicMessage } from "@/lib/errors";

/**
 * Shared shape of the dashboard's form POSTs: same-origin, signed in, then a 303 to the page `run` returns,
 * or back to `fallback` with the error in the query string.
 */
export function formRoute(fallback: string, run: (user: User, form: FormData, req: Request) => Promise<string>) {
  return async (req: Request) => {
    if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
    const user = await currentUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);
    const form = (await req.formData().catch(() => null)) ?? new FormData();
    try {
      return NextResponse.redirect(new URL(await run(user, form, req), req.url), 303);
    } catch (err) {
      const message = publicMessage(err);
      if (message.startsWith("Something went wrong")) console.error(`${new URL(req.url).pathname} failed:`, err);
      return NextResponse.redirect(new URL(`${fallback}?error=${encodeURIComponent(message)}`, req.url), 303);
    }
  };
}

export const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
