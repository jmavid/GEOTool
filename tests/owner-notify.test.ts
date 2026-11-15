import { describe, expect, it } from "vitest";
import { ownerAnalysisEmail } from "@/lib/email/templates";
import { buildMime } from "@/lib/email/owner-send";
import { requestMeta } from "@/lib/owner-notify";

const base = {
  to: "owner@example.com",
  domain: "holded.com",
  url: "https://holded.com/",
  reportUrl: "https://example.com/report/abc",
  reused: false,
  score: 54,
  error: null,
  plan: "FREE",
  account: null,
  ip: "203.0.113.7",
  country: "ES",
  userAgent: "Mozilla/5.0 (Macintosh)",
  engines: ["GPT-OSS 120B", "DeepSeek V4.1"],
  costUsd: 0.1073,
  seconds: 463,
  at: new Date("2026-11-15T09:30:00Z"),
};

describe("owner analysis email", () => {
  it("summarizes a finished analysis with the caller's IP and request details", () => {
    const m = ownerAnalysisEmail({ ...base, status: "COMPLETED" });
    expect(m.to).toBe("owner@example.com");
    expect(m.subject).toBe("New analysis: holded.com · 54/100 (FREE, anonymous visitor, 203.0.113.7)");
    for (const line of ["IP: 203.0.113.7", "Country: ES", "Browser: Mozilla/5.0 (Macintosh)", "AI cost: $0.107", "When (UTC): 2026-11-15 09:30:00"]) {
      expect(m.text).toContain(line);
    }
    expect(m.text).toContain("Report: https://example.com/report/abc");
  });

  it("names the client's account and the error of a failed run, escaped in HTML", () => {
    const m = ownerAnalysisEmail({ ...base, status: "FAILED", score: null, error: "HTTP 403 <blocked>", plan: "PRO", account: "client@example.com" });
    expect(m.subject).toBe("New analysis: holded.com · failed (PRO, client@example.com, 203.0.113.7)");
    expect(m.html).toContain("HTTP 403 &lt;blocked&gt;");
  });

  it("says when a recent report was reused instead of running a new analysis", () => {
    const m = ownerAnalysisEmail({ ...base, status: "RUNNING", reused: true, costUsd: 0, seconds: null });
    expect(m.subject).toBe("Report viewed: holded.com · running (FREE, anonymous visitor, 203.0.113.7)");
    expect(m.text).toContain("Run: Reused a recent report (no new AI calls)");
  });
});

describe("raw MIME for Email Routing", () => {
  it("encodes non-ASCII subjects and both parts in base64", () => {
    const raw = buildMime(
      { to: "owner@example.com", subject: "New analysis: ñ · 54", text: "Hola ñ", html: "<p>Hola ñ</p>" },
      { name: "GEO Garner", email: "notify@example.com" },
      { messageId: "abc-123", date: new Date("2026-11-15T09:30:00Z") },
    );
    expect(raw).toContain("From: GEO Garner <notify@example.com>\r\n");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("Message-ID: <abc-123@example.com>");
    expect(raw).toContain(btoa(String.fromCharCode(...new TextEncoder().encode("Hola ñ"))));
    expect(raw.trimEnd().endsWith("--b_abc123--")).toBe(true);
  });
});

describe("request details", () => {
  it("reads IP, country and browser from Cloudflare's headers", () => {
    const req = new Request("https://example.com", { headers: { "cf-connecting-ip": "203.0.113.7", "cf-ipcountry": "ES", "user-agent": "UA" } });
    expect(requestMeta(req)).toEqual({ ip: "203.0.113.7", country: "ES", userAgent: "UA" });
  });
});
