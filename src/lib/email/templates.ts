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

export function loginEmail(p: { to: string; loginUrl: string; minutes: number }): OutgoingEmail {
  return {
    to: p.to,
    subject: "Your GEO Garner sign-in link",
    html: layout(
      `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Sign in to GEO Garner</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4a5060">Click the button to sign in. The link works once and expires in ${p.minutes} minutes.</p>
${button(p.loginUrl, "Sign in")}`,
      "If you didn't ask to sign in, ignore this email: nobody can get in without this link.",
    ),
    text: `Sign in to GEO Garner (the link works once and expires in ${p.minutes} minutes):\n${p.loginUrl}\n\nIf you didn't ask to sign in, ignore this email.`,
  };
}

export interface OwnerAnalysisData {
  to: string;
  domain: string;
  reportUrl: string;
  status: "COMPLETED" | "FAILED";
  score: number | null;
  error: string | null;
  plan: string;
  /** The client's account email, or null for an anonymous free check. */
  account: string | null;
  engines: string[];
  costUsd: number;
  seconds: number | null;
}

/** To the site owner: a client just ran an analysis. Nothing here is shown to the client. */
export function ownerAnalysisEmail(d: OwnerAnalysisData): OutgoingEmail {
  const who = d.account ?? "anonymous visitor";
  const outcome = d.status === "COMPLETED" ? `${d.score ?? 0}/100` : "failed";
  const rows: [string, string][] = [
    ["Website", d.domain],
    ["Result", d.status === "COMPLETED" ? `GEO Score ${d.score ?? 0}/100` : `Failed: ${d.error ?? "unknown error"}`],
    ["Client", who],
    ["Plan", d.plan],
    ["Models", d.engines.join(", ") || "none"],
    ["AI cost", `$${d.costUsd.toFixed(3)}`],
    ["Time", d.seconds !== null ? `${Math.round(d.seconds)} s` : "n/a"],
  ];
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:#5b6170">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0b0d12">${escapeHtml(v)}</td></tr>`)
    .join("");
  return {
    to: d.to,
    subject: `New analysis: ${d.domain} · ${outcome} (${d.plan}, ${who})`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px">New analysis: ${escapeHtml(d.domain)}</h1>
<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:0 0 24px">${table}</table>
${button(d.reportUrl, "Open the report")}`,
      "You get this for every analysis a client runs (OWNER_NOTIFY_EMAIL).",
    ),
    text: [...rows.map(([k, v]) => `${k}: ${v}`), `Report: ${d.reportUrl}`].join("\n"),
  };
}
