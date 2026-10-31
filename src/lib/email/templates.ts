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
<p style="margin:0 0 24px;font-size:15px;font-weight:600">GEO Score</p>
${body}
</td></tr></table>
<p style="margin:16px 0 0;max-width:520px;font-size:12px;line-height:1.5;color:#5b6170">${footer}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2b4eff;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${escapeHtml(label)}</a>`;
}

export function confirmationEmail(p: { to: string; domain: string; confirmUrl: string; questions: number }): OutgoingEmail {
  const domain = escapeHtml(p.domain);
  return {
    to: p.to,
    subject: `Confirm weekly GEO Score tracking for ${p.domain}`,
    html: layout(
      `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Confirm weekly tracking for ${domain}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#4a5060">Every Monday we'll ask AI models the same ${p.questions} buyer questions and email you the new score, so you can see if your fixes work.</p>
${button(p.confirmUrl, "Confirm weekly tracking")}`,
      "You got this because someone entered this address on GEO Score. If it wasn't you, ignore this email: nothing will be sent without confirming.",
    ),
    text: `Confirm weekly GEO Score tracking for ${p.domain}:\n${p.confirmUrl}\n\nIf it wasn't you, ignore this email: nothing will be sent without confirming.`,
  };
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
