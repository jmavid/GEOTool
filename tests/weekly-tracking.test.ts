import { describe, expect, it } from "vitest";
import { MIN_GAP_MS, pickWebsitesToRefresh } from "@/lib/tracking";
import { confirmationEmail, escapeHtml, scoreChange, weeklyEmail, type WeeklyEmailData } from "@/lib/email/templates";
import { parseSender } from "@/lib/email/send";

const NOW = Date.UTC(2026, 10, 2, 7);
const ago = (ms: number) => new Date(NOW - ms);
const DAY = 24 * 3_600_000;

describe("pickWebsitesToRefresh", () => {
  it("re-runs sites last analyzed a week ago, oldest first", () => {
    const picked = pickWebsitesToRefresh(
      [
        { websiteId: "recent", status: "COMPLETED", createdAt: ago(7 * DAY) },
        { websiteId: "older", status: "FAILED", createdAt: ago(20 * DAY) },
      ],
      NOW,
      10,
    );
    expect(picked).toEqual(["older", "recent"]);
  });

  it("skips sites analyzed in the last 6 days or still running", () => {
    const picked = pickWebsitesToRefresh(
      [
        { websiteId: "by-hand-yesterday", status: "COMPLETED", createdAt: ago(DAY) },
        { websiteId: "just-under-gap", status: "COMPLETED", createdAt: ago(MIN_GAP_MS - 1) },
        { websiteId: "running", status: "RUNNING", createdAt: ago(10 * DAY) },
        { websiteId: "queued", status: "QUEUED", createdAt: ago(10 * DAY) },
        { websiteId: "at-gap", status: "COMPLETED", createdAt: ago(MIN_GAP_MS) },
      ],
      NOW,
      10,
    );
    expect(picked).toEqual(["at-gap"]);
  });

  it("respects the weekly cap", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ websiteId: `s${i}`, status: "COMPLETED", createdAt: ago((10 + i) * DAY) }));
    expect(pickWebsitesToRefresh(rows, NOW, 2)).toEqual(["s4", "s3"]);
    expect(pickWebsitesToRefresh(rows, NOW, 0)).toEqual([]);
  });
});

describe("tracking emails", () => {
  const base: WeeklyEmailData = {
    to: "ana@example.com",
    brand: "Acme",
    domain: "acme.com",
    score: 41,
    previous: 38,
    mentioned: 12,
    responses: 50,
    topFix: "Publish a comparison page",
    reportUrl: "https://geo.test/report/1",
    unsubscribeUrl: "https://geo.test/subscription/t?action=unsubscribe",
    oneClickUnsubscribeUrl: "https://geo.test/api/subscriptions/manage?token=t&action=unsubscribe",
  };

  it("labels the score change", () => {
    expect(scoreChange(41, 38)).toEqual({ delta: 3, label: "+3 since last week" });
    expect(scoreChange(35, 38)).toEqual({ delta: -3, label: "-3 since last week" });
    expect(scoreChange(38, 38).label).toBe("no change");
    expect(scoreChange(38, null)).toEqual({ delta: null, label: "first tracked run" });
  });

  it("puts the change in the subject and supports one-click unsubscribe", () => {
    const mail = weeklyEmail(base);
    expect(mail.subject).toBe("Acme: GEO Score 41 (+3)");
    expect(weeklyEmail({ ...base, previous: null }).subject).toBe("Acme: GEO Score 41");
    expect(mail.headers).toEqual({ "List-Unsubscribe": `<${base.oneClickUnsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(mail.text).toContain(base.unsubscribeUrl);
    expect(mail.html).toContain(escapeHtml(base.unsubscribeUrl));
  });

  it("escapes brand and LLM-written text in the HTML", () => {
    const mail = weeklyEmail({ ...base, brand: '<img src=x onerror="alert(1)">', topFix: "Use <script>alert(1)</script> & co" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
  });

  it("asks for confirmation before any weekly email", () => {
    const mail = confirmationEmail({ to: "ana@example.com", domain: "acme.com", confirmUrl: "https://geo.test/subscription/t?action=confirm", questions: 25 });
    expect(mail.subject).toContain("Confirm");
    expect(mail.text).toContain("https://geo.test/subscription/t?action=confirm");
    expect(mail.html).toContain("25 buyer questions");
  });
});

describe("parseSender", () => {
  it("reads a named or bare sender", () => {
    expect(parseSender("GEO Score <scores@geo.test>")).toEqual({ name: "GEO Score", email: "scores@geo.test" });
    expect(parseSender('"Ana" <ana@geo.test>')).toEqual({ name: "Ana", email: "ana@geo.test" });
    expect(parseSender("scores@geo.test")).toEqual({ name: "GEO Score", email: "scores@geo.test" });
    expect(parseSender("")).toBeNull();
    expect(parseSender("not an email")).toBeNull();
  });
});
