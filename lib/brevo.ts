const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "yourtrace.online@gmail.com";
const FROM_NAME = "Tarun from stocksbrew";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stocksbrew.online").replace(/\/$/, "");

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[brevo] BREVO_API_KEY not set, skipping email");
    return false;
  }
  try {
    const res = await fetch(BREVO_API, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: to }],
        subject,
        htmlContent: htmlBody,
      }),
    });
    if (res.ok) return true;
    const text = await res.text().catch(() => "");
    console.error(`[brevo] error ${res.status}: ${text.slice(0, 240)}`);
    return false;
  } catch (err) {
    console.error("[brevo] exception:", err);
    return false;
  }
}

export function buildFirstRadarItemEmail(firstName: string): { subject: string; html: string } {
  const subject = "getting value from stocksbrew?";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">

      <table width="580" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:20px">
          <span style="font-size:24px;font-weight:800;color:#6d28d9;letter-spacing:-0.05em">stocksbrew</span>
        </td></tr>
      </table>

      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden">

        <tr>
          <td style="padding:36px 32px 28px 32px">
            <div style="font-size:28px;font-weight:800;color:#111111;line-height:1.2;letter-spacing:-0.03em;margin-bottom:20px">
              Hey ${firstName}, quick check-in
            </div>
            <div style="font-size:15px;color:#374151;line-height:1.75">
              <p style="margin:0 0 16px 0">
                You added your first stock to Radar. Wanted to make sure it's actually useful for you.
              </p>
              <p style="margin:0 0 16px 0">
                Radar runs daily AI analysis across everything you track, prices, news, fundamentals, and builds a clear buy / hold / sell call for each position. The goal is that you never have to wonder "so what do I do with this?" again.
              </p>
              <p style="margin:0 0 16px 0">
                If something feels off, missing, or you want a feature that doesn't exist yet, just reply to this email. I read every reply and ship fast when I hear a real need.
              </p>
              <p style="margin:0">
                Talk soon,<br />Tarun
              </p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px 32px">
            <a href="${APP_URL}/watchlist" style="display:inline-block;background:#111111;color:#ffffff !important;-webkit-text-fill-color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 24px;border-radius:999px;letter-spacing:-0.01em">
              Open your Radar &rarr;
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px 32px">
            <div style="border-top:1px solid #f3f4f6;padding-top:20px">
              <div style="font-size:15px;font-weight:700;color:#111111;margin-bottom:4px">Tarun</div>
              <div style="font-size:13px;color:#9ca3af">Founder, stocksbrew</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:2px">
                <a href="mailto:tomartarun2001@gmail.com" style="color:#6b7280;text-decoration:underline">tomartarun2001@gmail.com</a>
              </div>
            </div>
          </td>
        </tr>

      </table>

      <table width="580" cellpadding="0" cellspacing="0" style="margin-top:24px">
        <tr><td style="font-size:12px;color:#9ca3af;line-height:1.8">
          You're getting this because you're on stocksbrew Pro. Not investment advice. Not a broker.
        </td></tr>
        <tr><td style="font-size:11px;color:#d1d5db;padding-top:4px">&copy; 2026 stocksbrew</td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}

export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const token = local.replace(/[._]/g, " ").trim().split(/\s+/)[0] ?? "";
  const cleaned = token.replace(/[^a-zA-Z]/g, "");
  if (cleaned.length < 2) return "there";
  return cleaned[0]!.toUpperCase() + cleaned.slice(1).toLowerCase();
}
