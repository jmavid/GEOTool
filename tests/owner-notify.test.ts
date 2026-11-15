import { describe, expect, it } from "vitest";
import { ownerAnalysisEmail } from "@/lib/email/templates";

const base = {
  to: "owner@example.com",
  domain: "holded.com",
  reportUrl: "https://example.com/report/abc",
  score: 54,
  error: null,
  plan: "FREE",
  account: null,
  engines: ["GPT-OSS 120B", "DeepSeek V4.1"],
  costUsd: 0.1073,
  seconds: 463,
};

describe("owner analysis email", () => {
  it("summarizes a finished analysis by an anonymous visitor", () => {
    const m = ownerAnalysisEmail({ ...base, status: "COMPLETED" });
    expect(m.to).toBe("owner@example.com");
    expect(m.subject).toBe("New analysis: holded.com · 54/100 (FREE, anonymous visitor)");
    expect(m.text).toContain("Models: GPT-OSS 120B, DeepSeek V4.1");
    expect(m.text).toContain("AI cost: $0.107");
    expect(m.text).toContain("Report: https://example.com/report/abc");
  });

  it("names the client's account and the error of a failed run, escaped in HTML", () => {
    const m = ownerAnalysisEmail({ ...base, status: "FAILED", score: null, error: "HTTP 403 <blocked>", plan: "PRO", account: "client@example.com" });
    expect(m.subject).toBe("New analysis: holded.com · failed (PRO, client@example.com)");
    expect(m.text).toContain("Result: Failed: HTTP 403 <blocked>");
    expect(m.html).toContain("HTTP 403 &lt;blocked&gt;");
  });
});
