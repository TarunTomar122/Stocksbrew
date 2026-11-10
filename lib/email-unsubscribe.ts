import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links for the emails in backend/mail.
 *
 * The backend signs `uid:category` with EMAIL_UNSUBSCRIBE_SECRET
 * (backend/mail/send.py, unsubscribe_token) and this file checks it, so a
 * link can only turn off the one category for the one account it was sent to.
 */

export const EMAIL_CATEGORIES = {
  daily: { field: "email_digest_enabled", label: "the daily brief", blurb: "the short email before the US open on days something changed in your stocks" },
  weekly: { field: "email_weekly_enabled", label: "the weekly recap", blurb: "the Saturday recap of your week and how our calls did" },
  alerts: { field: "email_alerts_enabled", label: "alert emails", blurb: "emails from your agent jobs and price alerts" },
  product: { field: "email_product_enabled", label: "account emails", blurb: "setup tips, plan notices and the occasional check-in" },
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EMAIL_CATEGORIES, value);
}

export function expectedToken(uid: string, category: string, secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? ""): string | null {
  if (!secret) return null;
  const mac = createHmac("sha256", secret).update(`${uid}:${category}`).digest().subarray(0, 18);
  return mac.toString("base64url");
}

export function verifyUnsubscribe(uid: unknown, category: unknown, token: unknown, secret?: string): boolean {
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) return false;
  if (!isEmailCategory(category) || typeof token !== "string") return false;
  const expected = expectedToken(uid, category, secret);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
