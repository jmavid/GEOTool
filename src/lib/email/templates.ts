import type { OutgoingEmail } from "./send";

/** Brand names, fix titles and domains come from the site and from LLM output: always escaped. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0d12">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e6eb;border-radius:16px">
<tr><td style="padding:28px">
<p style="margin:0 0 24px;font-size:15px;font-weight:600">GEO Garner</p>
${body}
</td></tr></table>
<p style="margin:16px 0 0;max-width:520px;font-size:12px;line-height:1.5;color:#5b6170">${footer}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2b4eff;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${escapeHtml(label)}</a>`;
}

export interface WeeklyEmailData {
  to: string;
  brand: string;
  domain: string;
  score: number;
  previous: number | null;
  mentioned: number;
  responses: number;
  topFix: string | null;
  reportUrl: string;
  unsubscribeUrl: string;
  oneClickUnsubscribeUrl: string;
}

export function scoreChange(score: number, previous: number | null): { delta: number | null; label: string } {
  if (previous === null) return { delta: null, label: "first tracked run" };
  const delta = score - previous;
  return { delta, label: delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${delta} since last week` };
}

export function weeklyEmail(d: WeeklyEmailData): OutgoingEmail {
  const { delta, label } = scoreChange(d.score, d.previous);
  const brand = escapeHtml(d.brand);
  // Blue up, orange down: readable with color blindness, like the report.
  const deltaColor = delta === null || delta === 0 ? "#5b6170" : delta > 0 ? "#1d4ed8" : "#9a3412";
  const subjectDelta = delta === null || delta === 0 ? "" : ` (${delta > 0 ? "+" : ""}${delta})`;
  return {
    to: d.to,
    subject: `${d.brand}: GEO Score ${d.score}${subjectDelta}`,
    headers: {
      "List-Unsubscribe": `<${d.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    html: layout(
      `<p style="margin:0;font-size:13px;color:#5b6170">${escapeHtml(d.domain)} · weekly check</p>
<p style="margin:8px 0 0;font-size:48px;font-weight:700;letter-spacing:-1px;line-height:1">${d.score}<span style="font-size:16px;font-weight:400;color:#5b6170"> / 100</span></p>
<p style="margin:8px 0 20px;font-size:15px;font-weight:600;color:${deltaColor}">${escapeHtml(label)}${d.previous !== null ? ` <span style="font-weight:400;color:#5b6170">(was ${d.previous})</span>` : ""}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4a5060">AI models mentioned ${brand} in <strong style="color:#0b0d12">${d.mentioned} of ${d.responses}</strong> answers to the same buyer questions as last time.</p>
${d.topFix ? `<p style="margin:0 0 24px;padding:14px;border-radius:10px;background:#f6f7f9;font-size:14px;line-height:1.5"><strong>Fix #1:</strong> ${escapeHtml(d.topFix)}</p>` : ""}
${button(d.reportUrl, "See the full report")}`,
      `You confirmed weekly tracking for ${escapeHtml(d.domain)}. <a href="${escapeHtml(d.unsubscribeUrl)}" style="color:#5b6170">Unsubscribe</a>.`,
    ),
    text: [
      `${d.domain}: GEO Score ${d.score}/100 (${label}${d.previous !== null ? `, was ${d.previous}` : ""})`,
      `Mentioned in ${d.mentioned} of ${d.responses} AI answers.`,
      d.topFix ? `Fix #1: ${d.topFix}` : "",
      `Full report: ${d.reportUrl}`,
      `Unsubscribe: ${d.unsubscribeUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Confirms a new account's address; the account (and its password) only exists once this link is used. */
export function verifyEmail(p: { to: string; url: string; minutes: number }): OutgoingEmail {
  return {
    to: p.to,
    subject: "Confirm your email for GEO Garner",
    html: layout(
      `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Confirm your email</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4a5060">Click the button to confirm this address and finish creating your GEO Garner account. The link works once and expires in ${p.minutes} minutes.</p>
${button(p.url, "Confirm my email")}`,
      "If you didn't sign up for GEO Garner, ignore this email: no account is created without this link.",
    ),
    text: `Confirm your email and finish creating your GEO Garner account (the link works once and expires in ${p.minutes} minutes):\n${p.url}\n\nIf you didn't sign up, ignore this email.`,
  };
}

/** Password recovery. Also sent when someone tries to sign up with an address that already has an account. */
export function resetEmail(p: { to: string; url: string; minutes: number; signupAttempt?: boolean }): OutgoingEmail {
  const intro = p.signupAttempt
    ? "Someone (probably you) tried to create a GEO Garner account with this email, but you already have one. Sign in with your password, or set a new one here."
    : "Click the button to choose a new password for your GEO Garner account.";
  return {
    to: p.to,
    subject: p.signupAttempt ? "You already have a GEO Garner account" : "Reset your GEO Garner password",
    html: layout(
      `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${p.signupAttempt ? "You already have an account" : "Reset your password"}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4a5060">${intro} The link works once and expires in ${p.minutes} minutes.</p>
${button(p.url, "Set a new password")}`,
      "If you didn't ask for this, ignore this email: your password stays the same.",
    ),
    text: `${intro}\n${p.url}\n\nThe link works once and expires in ${p.minutes} minutes. If you didn't ask for this, ignore this email.`,
  };
}

export interface OwnerAnalysisData {
  to: string;
  domain: string;
  url: string;
  reportUrl: string;
  /** COMPLETED / FAILED for a new run; any status for a reused report. */
  status: string;
  /** An existing recent report was shown instead of running a new analysis. */
  reused: boolean;
  score: number | null;
  error: string | null;
  plan: string;
  /** The client's account email, or null for an anonymous free check. */
  account: string | null;
  /** Emails left on the report page ("email me the report"). */
  contacts?: string[];
  ip: string | null;
  country: string | null;
  userAgent: string | null;
  engines: string[];
  costUsd: number;
  seconds: number | null;
  at: Date;
}

function ownerResult(d: OwnerAnalysisData): string {
  if (d.status === "COMPLETED") return `GEO Score ${d.score ?? 0}/100`;
  if (d.status === "FAILED") return `Failed: ${d.error ?? "unknown error"}`;
  return "Still running";
}

/** To the site owner: a client just asked for an analysis. Nothing here is shown to the client. */
export function ownerAnalysisEmail(d: OwnerAnalysisData): OutgoingEmail {
  const who = d.account ?? "anonymous visitor";
  const outcome = d.status === "COMPLETED" ? `${d.score ?? 0}/100` : d.status === "FAILED" ? "failed" : "running";
  const rows: [string, string][] = [
    ["Website", d.url || d.domain],
    ["Run", d.reused ? "Reused a recent report (no new AI calls)" : "New analysis"],
    ["Result", ownerResult(d)],
    ["Client", who],
    ["Contact", d.contacts?.length ? d.contacts.join(", ") : "none left yet"],
    ["IP", d.ip ?? "unknown"],
    ["Country", d.country ?? "unknown"],
    ["Browser", d.userAgent ?? "unknown"],
    ["Plan", d.plan],
    ["Models", d.engines.join(", ") || "none"],
    ["AI cost", `$${d.costUsd.toFixed(3)}`],
    ["Time", d.seconds !== null ? `${Math.round(d.seconds)} s` : "n/a"],
    ["When (UTC)", d.at.toISOString().replace("T", " ").slice(0, 19)],
  ];
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5b6170">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0b0d12">${escapeHtml(v)}</td></tr>`)
    .join("");
  return {
    to: d.to,
    subject: `${d.reused ? "Report viewed" : "New analysis"}: ${d.domain} · ${outcome} (${d.plan}, ${who}, ${d.ip ?? "no IP"})`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px">${d.reused ? "Report viewed" : "New analysis"}: ${escapeHtml(d.domain)}</h1>
<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 24px">${table}</table>
${button(d.reportUrl, "Open the report")}`,
      "You get this for every analysis a client runs (OWNER_NOTIFY_EMAIL).",
    ),
    text: [...rows.map(([k, v]) => `${k}: ${v}`), `Report: ${d.reportUrl}`].join("\n"),
  };
}

export interface ReportReadyData {
  to: string;
  domain: string;
  brand: string;
  /** null when the analysis failed. */
  score: number | null;
  mentioned: number;
  responses: number;
  topFix: string | null;
  reportUrl: string;
  /** Where to run a new check when the analysis failed. */
  homeUrl: string;
}

/** To a visitor who asked on the report page to get the report by email. */
export function reportReadyEmail(d: ReportReadyData): OutgoingEmail {
  const brand = escapeHtml(d.brand);
  if (d.score === null) {
    return {
      to: d.to,
      subject: `We couldn't finish the AI visibility report for ${d.domain}`,
      html: layout(
        `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">We couldn't finish your report</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4a5060">Something stopped the analysis of ${escapeHtml(d.domain)}. Running it again usually works.</p>
${button(d.homeUrl, "Try again")}`,
        "You asked for this report on GEO Garner. We only email you about it.",
      ),
      text: `We couldn't finish the AI visibility report for ${d.domain}. Running it again usually works: ${d.homeUrl}`,
    };
  }
  return {
    to: d.to,
    subject: `${d.brand}: GEO Score ${d.score}/100 — your AI visibility report is ready`,
    html: layout(
      `<p style="margin:0;font-size:13px;color:#5b6170">${escapeHtml(d.domain)} · AI visibility report</p>
<p style="margin:8px 0 20px;font-size:48px;font-weight:700;letter-spacing:-1px;line-height:1">${d.score}<span style="font-size:16px;font-weight:400;color:#5b6170"> / 100</span></p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#4a5060">AI models mentioned ${brand} in <strong style="color:#0b0d12">${d.mentioned} of ${d.responses}</strong> answers to your buyers' questions. The report shows who they recommend instead and what to fix first.</p>
${d.topFix ? `<p style="margin:0 0 24px;padding:14px;border-radius:10px;background:#f6f7f9;font-size:14px;line-height:1.5"><strong>Fix #1:</strong> ${escapeHtml(d.topFix)}</p>` : ""}
${button(d.reportUrl, "See the full report and action plan")}`,
      "You asked for this report on GEO Garner. Reply to this email if you have questions about it.",
    ),
    text: [
      `${d.domain}: GEO Score ${d.score}/100`,
      `AI models mentioned ${d.brand} in ${d.mentioned} of ${d.responses} answers.`,
      d.topFix ? `Fix #1: ${d.topFix}` : "",
      `Full report and action plan: ${d.reportUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** To the site owner: a visitor left their email on a report. */
export function ownerLeadEmail(d: { to: string; email: string; domain: string; marketing: boolean; reportUrl: string; ip: string | null; country: string | null }): OutgoingEmail {
  const rows: [string, string][] = [
    ["Email", d.email],
    ["Website checked", d.domain],
    ["Product news", d.marketing ? "Yes, opted in" : "No (report only)"],
    ["IP", d.ip ?? "unknown"],
    ["Country", d.country ?? "unknown"],
  ];
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5b6170">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0b0d12">${escapeHtml(v)}</td></tr>`)
    .join("");
  return {
    to: d.to,
    subject: `New contact: ${d.email} (${d.domain})`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px">New contact: ${escapeHtml(d.email)}</h1>
<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 24px">${table}</table>
${button(d.reportUrl, "Open their report")}`,
      "A visitor asked to get their report by email (OWNER_NOTIFY_EMAIL).",
    ),
    text: [...rows.map(([k, v]) => `${k}: ${v}`), `Report: ${d.reportUrl}`].join("\n"),
  };
}
