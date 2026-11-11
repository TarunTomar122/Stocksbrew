import { firstNameFromEmail } from "@/lib/brevo";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stocksbrew.online").replace(/\/$/, "");
const SUPPORT_EMAIL = "tomartarun2001@gmail.com";

// oa-design tokens, hardcoded — email clients can't read CSS custom properties.
const BG = "#f6f6f6";
const CARD = "#ffffff";
const INK = "#292929";
const BODY = "#4a4a4a";
const MUTED = "#6d6d6d";
const BORDER = "#e7e7e7";
const DIVIDER = "#efefef";
const PRIMARY = "#305dde";

const TIPS: Array<{ title: string; body: string }> = [
  {
    title: "Open a stock, click Track",
    body:
      "If a stock doesn't have an AI brief yet, tracking it adds it to your Watchlist and " +
      "kicks off research right away. It's usually ready in 10 to 15 minutes.",
  },
  {
    title: "Search for anything, request what's missing",
    body:
      "Type a ticker into search. If we don't cover it yet, the search bar will offer to " +
      "request it for you. One click and it's in the queue.",
  },
  {
    title: "Still can't find it? Email me",
    body:
      `If a stock you want still isn't showing up, just email me directly at ${SUPPORT_EMAIL}. ` +
      "I read every email myself and I'll get it added.",
  },
  {
    title: "Connect your AI agent",
    body:
      "Pro includes agent access, so if you use Claude, ChatGPT, or another AI agent for " +
      "research, you can connect it to Stocksbrew and pull our calls, targets, and drivers " +
      "straight into your workflow.",
  },
];

function firstNameFromProfile(displayName: string | null | undefined, email: string): string {
  const raw = (displayName ?? "").trim();
  if (raw) {
    const token = raw.split(/\s+/)[0]?.replace(/[.,]+$/, "");
    if (token) return token.charAt(0).toUpperCase() + token.slice(1);
  }
  return firstNameFromEmail(email);
}

export function buildWelcomeProEmail(params: {
  email: string;
  displayName?: string | null;
}): { subject: string; html: string } {
  const hi = firstNameFromProfile(params.displayName, params.email);
  const subject = "Welcome to Pro. A few tips before you dive in.";

  const tipRows = TIPS.map(
    (tip) => `
        <tr><td style="padding:16px 0;border-top:1px solid ${DIVIDER}">
          <p style="margin:0;font-size:15px;font-weight:600;color:${INK}">${escapeHtml(tip.title)}</p>
          <p style="margin:6px 0 0;font-size:14px;line-height:1.6;color:${BODY}">${escapeHtml(tip.body)}</p>
        </td></tr>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding-bottom:18px">
        <span style="font-size:20px;font-weight:700;color:${PRIMARY};letter-spacing:-0.02em">stocksbrew</span>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border:1px solid ${BORDER};border-radius:20px;overflow:hidden">
      <tr><td style="padding:32px 28px 8px 28px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:${PRIMARY};text-transform:uppercase">Welcome to Pro</div>
        <p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:${INK}">Hey ${escapeHtml(hi)},</p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:${BODY}">
          Thanks for going Pro. I built stocksbrew because I wanted something that actually
          reads the market for me instead of dumping raw numbers and leaving me to figure it
          out, so it means a lot that you're trusting it with your own money decisions.
        </p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:${BODY}">
          A few things that will help you get the most out of it:
        </p>
      </td></tr>
      <tr><td style="padding:6px 28px 4px 28px">
        <table width="100%" cellpadding="0" cellspacing="0">${tipRows}</table>
      </td></tr>
      <tr><td style="padding:20px 28px 4px 28px;border-top:1px solid ${DIVIDER}">
        <p style="margin:0;font-size:15px;line-height:1.65;color:${BODY}">
          And honestly, if something's missing, confusing, or you've got an idea for a
          feature, just email it to ${SUPPORT_EMAIL}. I read all of it, and a good chunk of
          what's in the product today came directly from people telling me what they wanted.
        </p>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:${BODY}">
          Thanks again for being here.
        </p>
        <p style="margin:18px 0 0;font-size:15px;line-height:1.4;color:${INK}">
          Tarun<br/>
          <span style="font-size:13px;color:${MUTED}">Founder, stocksbrew</span>
        </p>
      </td></tr>
      <tr><td style="padding:18px 28px 28px 28px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${APP_URL}/portfolio" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">
            Open your Watchlist &#8594;
          </a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:18px 24px 24px 24px;border-top:1px solid ${DIVIDER}">
        <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED}">You're receiving this because you subscribed to stocksbrew Pro. <a href="${APP_URL}/profile" style="color:${PRIMARY};text-decoration:none;font-weight:600">Manage your account</a> &middot; Not investment advice.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
