import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/leads";
import { ownerAnalysisEmail, ownerLeadEmail, reportReadyEmail } from "@/lib/email/templates";

describe("lead emails", () => {
  it("accepts real addresses, lower-cased and trimmed", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
    expect(normalizeEmail("a.b+tag@sub.example.es")).toBe("a.b+tag@sub.example.es");
  });

  it("rejects things that aren't addresses or could inject headers", () => {
    for (const bad of ["", "ana", "ana@", "@example.com", "ana@example", "ana@example.com\r\nBcc: x@y.com", "a b@example.com", "<a@example.com>"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

const ready = {
  to: "ana@example.com",
  domain: "holded.com",
  brand: "Holded",
  score: 54,
  mentioned: 27,
  responses: 50,
  topFix: "Add a <comparison> page",
  reportUrl: "https://example.com/report/abc",
  homeUrl: "https://example.com",
};

describe("report-ready email", () => {
  it("sends the score, the top fix (escaped) and the report link", () => {
    const m = reportReadyEmail(ready);
    expect(m.subject).toBe("Holded: GEO Score 54/100 — your AI visibility report is ready");
    expect(m.text).toContain("27 of 50");
    expect(m.text).toContain("Full report and action plan: https://example.com/report/abc");
    expect(m.html).toContain("Add a &lt;comparison&gt; page");
  });

  it("says the analysis failed and links to a new check", () => {
    const m = reportReadyEmail({ ...ready, score: null });
    expect(m.subject).toBe("We couldn't finish the AI visibility report for holded.com");
    expect(m.text).toContain("https://example.com");
  });
});

describe("owner emails about contacts", () => {
  it("names the new contact and whether they want product news", () => {
    const m = ownerLeadEmail({ to: "owner@example.com", email: "ana@example.com", domain: "holded.com", marketing: true, reportUrl: "https://example.com/report/abc", ip: "203.0.113.7", country: "ES" });
    expect(m.subject).toBe("New contact: ana@example.com (holded.com)");
    expect(m.text).toContain("Product news: Yes, opted in");
  });

  it("lists contacts in the analysis email", () => {
    const m = ownerAnalysisEmail({
      to: "owner@example.com", domain: "holded.com", url: "https://holded.com/", reportUrl: "https://example.com/report/abc", status: "COMPLETED",
      reused: false, score: 54, error: null, plan: "FREE", account: null, contacts: ["ana@example.com"], ip: "203.0.113.7", country: "ES",
      userAgent: null, engines: [], costUsd: 0.1, seconds: 300, at: new Date("2026-11-15T09:30:00Z"),
    });
    expect(m.text).toContain("Contact: ana@example.com");
  });
});
