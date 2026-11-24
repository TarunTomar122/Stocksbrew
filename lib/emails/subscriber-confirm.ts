/**
 * The confirmation email for the no-account morning email (lib/email-subscribers.ts). Drawn in the backend/mail kit's
 * look (backend/mail/theme.py, kit.render): warm paper, one card, copper as the one accent, one button.
 */

import { confirmHeadline, whenLine } from "@/lib/email-capture-copy";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://")
  ? process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "")
  : "https://www.stocksbrew.online";
const CONTACT_EMAIL = process.env.STOCKSBREW_CONTACT_EMAIL ?? "tomartarun2001@gmail.com";

// backend/mail/theme.py, baked to hex: email clients cannot read CSS custom properties.
const PAGE = "#f0eadd";
const CARD = "#fffdf9";
const INK = "#1d1a16";
const BODY = "#3a352d";
const MUTED = "#564f44";
const BORDER = "#e4ddcf";
const COPPER = "#9a4816";
const COPPER_FG = "#fffaf2";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The confirm page's link; with `add`, the link that adds that one stock to a confirmed record. */
export function confirmUrl(id: string, token: string, add?: string): string {
  return `${APP_URL}/email/confirm?${new URLSearchParams({ s: id, t: token, ...(add ? { a: add } : {}) }).toString()}`;
}

/**
 * The confirmation, or with `add` the one-stock version a confirmed address gets when a signup asks for a new stock:
 * the form takes any address, so a stock joins a confirmed list only from a click in that inbox.
 */
export function buildSubscriberConfirmEmail(params: { tickers: readonly string[]; confirmUrl: string; add?: string }): { subject: string; html: string; text: string } {
  const add = params.add;
  const subject = add ? `Add ${add} to your morning email?` : "Confirm your email from stocksbrew";
  // The same promise as the form (lib/email-capture-copy.ts): before the open, only on days something happens.
  const headline = add ? `Add ${add} to your morning email?` : confirmHeadline(params.tickers);
  const line = add ? whenLine([add]) : whenLine(params.tickers);
  const button = add ? `Add ${add}` : "Confirm my email";
  const ignore = add ? "Didn't ask for this? Ignore it and nothing changes." : "Didn't ask for this? Ignore it and you won't hear from us.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};color:${BODY}">
<div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;opacity:0;color:${PAGE}">${esc(line)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="padding:0 4px 14px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${INK}">
      <img src="${APP_URL}/email/mark.png" width="22" height="22" alt="" style="vertical-align:-5px;margin-right:8px;border-radius:7px" />stocksbrew
    </td></tr>
    <tr><td bgcolor="${CARD}" style="background:${CARD};border:1px solid ${BORDER};border-radius:18px;padding:28px">
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:${INK}">${esc(headline)}</h1>
      <p style="margin:0;font-size:16px;line-height:1.5;color:${BODY}">${esc(line)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr>
        <td bgcolor="${COPPER}" style="border-radius:10px;background:${COPPER}">
          <a href="${esc(params.confirmUrl)}" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:700;color:${COPPER_FG};text-decoration:none;border-radius:10px">${esc(button)}</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:18px 4px 8px">
      <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED}">${esc(ignore)}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED}">Research to help you decide, not investment advice. stocksbrew &middot; <a href="mailto:${esc(CONTACT_EMAIL)}" style="color:${MUTED};text-decoration:underline">${esc(CONTACT_EMAIL)}</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  const text = `${headline}\n\n${line}\n\n${button}: ${params.confirmUrl}\n\n--\n${ignore}\nResearch to help you decide, not investment advice. stocksbrew · ${CONTACT_EMAIL}`;
  return { subject, html, text };
}
