import { describe, expect, it } from "vitest";
import { planLimitError } from "@/lib/plans";
import { planFromSubscription } from "@/lib/billing";
import { withinPlan } from "@/lib/projects";
import { isTokenShape, sameOrigin } from "@/lib/auth/session";

describe("planLimitError", () => {
  it("allows a new site within the plan's website limit", () => {
    expect(planLimitError("PRO", { trackedSites: 4, alreadyTracked: false, analysesLast30Days: 0 })).toBeNull();
    expect(planLimitError("PRO", { trackedSites: 5, alreadyTracked: false, analysesLast30Days: 0 })).toMatch(/5 websites/);
  });

  it("never blocks a site that is already in the dashboard for the website limit", () => {
    expect(planLimitError("STARTER", { trackedSites: 1, alreadyTracked: true, analysesLast30Days: 0 })).toBeNull();
  });

  it("caps analyses per 30 days", () => {
    expect(planLimitError("STARTER", { trackedSites: 1, alreadyTracked: true, analysesLast30Days: 4 })).toBeNull();
    expect(planLimitError("STARTER", { trackedSites: 1, alreadyTracked: true, analysesLast30Days: 5 })).toMatch(/5 analyses/);
  });
});

describe("planFromSubscription", () => {
  const prices = { STARTER: "price_s", PRO: "price_p", AGENCY: "price_a" };

  it("maps the paid price of a live subscription to its plan", () => {
    expect(planFromSubscription("active", "price_p", prices)).toBe("PRO");
    expect(planFromSubscription("trialing", "price_a", prices)).toBe("AGENCY");
    expect(planFromSubscription("past_due", "price_s", prices)).toBe("STARTER");
  });

  it("drops to FREE when the subscription ends or the price is unknown", () => {
    expect(planFromSubscription("canceled", "price_p", prices)).toBe("FREE");
    expect(planFromSubscription("unpaid", "price_p", prices)).toBe("FREE");
    expect(planFromSubscription("incomplete", "price_p", prices)).toBe("FREE");
    expect(planFromSubscription("active", "price_other", prices)).toBe("FREE");
    expect(planFromSubscription("active", undefined, prices)).toBe("FREE");
  });

  it("never matches an unset price id", () => {
    expect(planFromSubscription("active", "", { STARTER: "", PRO: "", AGENCY: "" })).toBe("FREE");
  });
});

describe("sign-in tokens and origin checks", () => {
  it("only accepts 32-byte base64url tokens", () => {
    expect(isTokenShape("a".repeat(43))).toBe(true);
    expect(isTokenShape("a".repeat(42))).toBe(false);
    expect(isTokenShape(`${"a".repeat(42)}/`)).toBe(false);
  });

  it("rejects cross-origin form posts", () => {
    const req = (headers: Record<string, string>) => new Request("https://geo.test/api/auth/logout", { method: "POST", headers });
    expect(sameOrigin(req({ origin: "https://geo.test" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://evil.test" }))).toBe(false);
    expect(sameOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameOrigin(req({}))).toBe(true);
    expect(sameOrigin(req({ origin: "null", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameOrigin(req({ origin: "null", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});

describe("withinPlan", () => {
  it("tracks at most the plan's websites per account, oldest first, once each", () => {
    const rows = [
      { userId: "a", websiteId: "w1", plan: "STARTER" as const },
      { userId: "a", websiteId: "w1", plan: "STARTER" as const },
      { userId: "a", websiteId: "w2", plan: "STARTER" as const },
      { userId: "b", websiteId: "w2", plan: "PRO" as const },
      { userId: "b", websiteId: "w3", plan: "PRO" as const },
    ];
    expect(withinPlan(rows).map((r) => `${r.userId}:${r.websiteId}`)).toEqual(["a:w1", "b:w2", "b:w3"]);
  });
});
