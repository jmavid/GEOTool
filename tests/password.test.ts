import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

describe("passwords", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct hors", stored)).toBe(false);
  });

  it("salts each hash, so the same password never stores the same value", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("rejects missing or malformed stored hashes", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "plain-text")).toBe(false);
  });

  it("asks for 8 to 128 characters", () => {
    expect(passwordProblem("short")).toMatch(/8/);
    expect(passwordProblem("x".repeat(129))).toMatch(/128/);
    expect(passwordProblem("long enough")).toBeNull();
  });
});
