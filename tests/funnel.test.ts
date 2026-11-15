import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFunnel, isOwner, ownerIpHashes } from "@/lib/funnel";

afterEach(() => vi.unstubAllEnvs());

describe("funnel", () => {
  it("computes step-to-step conversion and skips it after an empty step", () => {
    const steps = buildFunnel({ started: 40, completed: 30, leads: 12, accounts: 0, paid: 0 });
    expect(steps.map((s) => s.count)).toEqual([40, 30, 12, 0, 0]);
    expect(steps[0].fromPrevious).toBeNull();
    expect(steps[1].fromPrevious).toBe(0.75);
    expect(steps[2].fromPrevious).toBe(0.4);
    expect(steps[3].fromPrevious).toBe(0);
    expect(steps[4].fromPrevious).toBeNull();
  });

  it("only lets the owner's email in", () => {
    vi.stubEnv("OWNER_NOTIFY_EMAIL", "Owner@Example.com");
    expect(isOwner("owner@example.com")).toBe(true);
    expect(isOwner("someone@example.com")).toBe(false);
    vi.stubEnv("OWNER_NOTIFY_EMAIL", "");
    expect(isOwner("owner@example.com")).toBe(false);
  });

  it("hashes exact owner IPs and ignores prefixes", () => {
    vi.stubEnv("UNLIMITED_IPS", "203.0.113.7, 2001:db8:1:");
    expect(ownerIpHashes()).toHaveLength(1);
  });
});
