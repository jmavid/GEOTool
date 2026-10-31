import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileSiteKey, verifyTurnstile } from "@/lib/security/turnstile";

const env = process.env as Record<string, string | undefined>;
afterEach(() => {
  delete env.TURNSTILE_SITE_KEY;
  delete env.TURNSTILE_SECRET_KEY;
});

const answer = (success: boolean) => vi.fn(async () => Response.json({ success })) as unknown as typeof fetch;

describe("turnstile", () => {
  it("is off until both keys exist, so the form keeps working", async () => {
    expect(turnstileSiteKey()).toBeNull();
    env.TURNSTILE_SITE_KEY = "site";
    expect(turnstileSiteKey()).toBeNull();
    expect(await verifyTurnstile(undefined, "1.2.3.4", answer(false))).toBe(true);
  });

  it("requires a valid token when configured", async () => {
    env.TURNSTILE_SITE_KEY = "site";
    env.TURNSTILE_SECRET_KEY = "secret";
    expect(turnstileSiteKey()).toBe("site");
    expect(await verifyTurnstile(undefined, "1.2.3.4", answer(true))).toBe(false);
    expect(await verifyTurnstile("tok", "1.2.3.4", answer(false))).toBe(false);
    expect(await verifyTurnstile("tok", "1.2.3.4", answer(true))).toBe(true);
  });

  it("fails closed if Cloudflare can't be reached", async () => {
    env.TURNSTILE_SITE_KEY = "site";
    env.TURNSTILE_SECRET_KEY = "secret";
    const broken = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "1.2.3.4", broken)).toBe(false);
  });
});
