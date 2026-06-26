const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = process.env.STOCKSBREW_FROM_EMAIL ?? "yourtrace.online@gmail.com";
const FROM_NAME = process.env.STOCKSBREW_FROM_NAME ?? "stocksbrew";

function emailsEnabled(): boolean {
  const flag = (process.env.EMAILS_ENABLED ?? "0").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/** Send transactional email. Off by default — set EMAILS_ENABLED=1 to ship. */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  if (!emailsEnabled()) {
    console.warn(`[email] disabled — skipped: ${subject.slice(0, 100)}`);
    return false;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("[email] BREVO_API_KEY not set, skipping email");
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
    console.error(`[email] brevo error ${res.status}: ${text.slice(0, 240)}`);
    return false;
  } catch (err) {
    console.error("[email] exception:", err);
    return false;
  }
}

export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "there";
  const token = local.replace(/[._]/g, " ").split(/\s+/)[0] ?? "";
  const cleaned = token.replace(/[^a-zA-Z]/g, "");
  if (cleaned.length >= 2) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }
  return "there";
}
