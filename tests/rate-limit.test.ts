import { afterEach, describe, expect, it } from "vitest";
import { unlimitedIp } from "@/lib/security/rate-limit";

const env = process.env as Record<string, string | undefined>;

describe("unlimited IPs", () => {
  afterEach(() => delete env.UNLIMITED_IPS);

  it("lets nobody through when UNLIMITED_IPS is empty", () => {
    expect(unlimitedIp("203.0.113.7")).toBe(false);
  });

  it("matches exact addresses and prefixes ending in . or :", () => {
    env.UNLIMITED_IPS = "203.0.113.7, 2001:DB8:1234:";
    expect(unlimitedIp("203.0.113.7")).toBe(true);
    expect(unlimitedIp("203.0.113.70")).toBe(false);
    expect(unlimitedIp("2001:db8:1234:abcd::1")).toBe(true);
    expect(unlimitedIp("2001:db8:9999::1")).toBe(false);
    expect(unlimitedIp("unknown")).toBe(false);
  });
});
