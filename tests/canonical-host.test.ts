import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "../canonical-host.js";

describe("canonicalRedirect", () => {
  const app = "https://geo.test";

  it("moves www. and workers.dev to the public domain, keeping path and query", () => {
    expect(canonicalRedirect("https://www.geo.test/report/1?x=2", app)).toBe("https://geo.test/report/1?x=2");
    expect(canonicalRedirect("https://geotool.someone.workers.dev/pricing", app)).toBe("https://geo.test/pricing");
  });

  it("serves the canonical host, local previews and the internal self-binding as they are", () => {
    expect(canonicalRedirect("https://geo.test/", app)).toBeNull();
    expect(canonicalRedirect("http://localhost:8787/", app)).toBeNull();
    expect(canonicalRedirect("https://internal/api/internal/run", app)).toBeNull();
  });

  it("does nothing while the app still lives on workers.dev or has no APP_URL", () => {
    expect(canonicalRedirect("https://geotool.someone.workers.dev/", "https://geotool.someone.workers.dev")).toBeNull();
    expect(canonicalRedirect("https://www.geo.test/", undefined)).toBeNull();
  });
});
