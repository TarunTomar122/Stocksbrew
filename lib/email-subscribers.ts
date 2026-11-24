import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * No-account email capture: "email me this each morning" on /news, /calendar, the earnings pages and the stock pages.
 *
 * One document per address in tm_email_subscribers, keyed by the sha256 of the lowercased address, so a repeat
 * signup lands on the same record. Double opt-in: only an address that clicked the signed link in its confirmation
 * email (confirmed_at set, no unsubscribed_at) gets the morning email (backend/mail/subscribers.py). An address that
 * makes an account is linked to it (linked_uid) and from then on gets the account's own mail instead.
 *
 * The pure rules live here (validation, tokens, what a signup changes); lib/email-subscribers-store.ts does the
 * reads and writes. Never log an address: log the id's first characters at most.
 */

export const SUBSCRIBERS = "tm_email_subscribers";
/** How many stocks one address can follow without an account. */
export const MAX_SUBSCRIBER_TICKERS = 10;
/** A repeat signup never sends a second confirmation inside this window. */
export const CONFIRM_RESEND_MS = 24 * 60 * 60 * 1000;

export const CAPTURE_SOURCES = ["news", "calendar", "earnings", "stock"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export type SubscriberDoc = {
  email: string;
  tickers: string[];
  /** The page the first signup came from; `last_source` the latest. */
  source: CaptureSource;
  last_source?: CaptureSource;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  confirm_sent_at: string | null;
  /** When the last "add a stock?" email went to this confirmed record (24-hour resend rule, like confirm_sent_at). */
  add_sent_at?: string | null;
  unsubscribed_at: string | null;
  linked_uid: string | null;
  linked_at: string | null;
};

export function isCaptureSource(value: unknown): value is CaptureSource {
  return typeof value === "string" && (CAPTURE_SOURCES as readonly string[]).includes(value);
}

/** The address as stored: trimmed and lowercased, or null when it is not one we would send to. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  // One @, a local part of at most 64 printable characters, a domain with a dot and a 2+ letter ending. Strict on
  // purpose: a typo is better caught here than as a bounce.
  const match = /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24})$/.exec(email);
  if (!match) return null;
  const [, local, domain] = match;
  if (local!.startsWith(".") || local!.endsWith(".") || local!.includes("..")) return null;
  if (domain!.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-"))) return null;
  return email;
}

/** "nvda" -> "NVDA", "brk.b" -> "BRK.B"; null for anything that is not a US ticker's shape. */
export function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ticker = raw.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z]{1,2})?$/.test(ticker) ? ticker : null;
}

/** "BRK.B" -> "US_BRK_B", the id tracked stocks and tm_instruments use. */
export function instrumentIdOf(ticker: string): string {
  return `US_${ticker.replace(/[.-]/g, "_")}`;
}

export function subscriberId(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function isSubscriberId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/* ── signed links ───────────────────────────────────────────────────────── */

/** `add:<TICKER>`: the link that adds one stock to a confirmed record (addPurpose). */
export type TokenPurpose = "confirm" | "stop" | `add:${string}`;

/** The purpose of the "add NVDA to your morning email?" link: signed per ticker, so it cannot add any other stock. */
export function addPurpose(ticker: string): TokenPurpose {
  return `add:${ticker}`;
}

/**
 * HMAC over `sub:<id>:<purpose>` with EMAIL_UNSUBSCRIBE_SECRET, the same secret the account unsubscribe links use.
 * backend/mail/subscribers.py signs the stop link the same way. Null without a secret.
 */
export function subscriberToken(id: string, purpose: TokenPurpose, secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? ""): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(`sub:${id}:${purpose}`).digest().subarray(0, 18).toString("base64url");
}

export function verifySubscriberToken(id: unknown, purpose: TokenPurpose, token: unknown, secret?: string): id is string {
  if (!isSubscriberId(id) || typeof token !== "string") return false;
  const expected = subscriberToken(id, purpose, secret);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── what a signup changes ──────────────────────────────────────────────── */

/** The new ticker added at the end, no repeats, at most MAX_SUBSCRIBER_TICKERS (a full list stays as it is). */
export function mergeTickers(current: readonly string[] | undefined, ticker: string | null): string[] {
  const list = Array.from(new Set((current ?? []).filter((t): t is string => typeof t === "string" && normalizeTicker(t) === t)));
  if (ticker && !list.includes(ticker) && list.length < MAX_SUBSCRIBER_TICKERS) list.push(ticker);
  return list.slice(0, MAX_SUBSCRIBER_TICKERS);
}

export type CapturePlan =
  /** The address belongs to an account: nothing is written, nothing is sent (the account has its own mail). */
  | { kind: "linked" }
  /** `sendAdd`: the ticker a confirmed record is asked to add by email, or null. */
  | { kind: "write"; doc: SubscriberDoc; sendConfirm: boolean; sendAdd: string | null };

const ms = (value: string | null | undefined): number | null => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** No email of this kind went out in the last 24 hours (a stamp in the future counts as none). */
function resendDue(sentAt: string | null | undefined, now: number): boolean {
  const at = ms(sentAt);
  return at == null || now - at >= CONFIRM_RESEND_MS || at > now;
}

/**
 * What one signup does to the record. An address still waiting (or one that stopped the email and now asks again)
 * gains the ticker and gets a confirmation, but never a second one within 24 hours. A confirmed, active address never
 * gains a ticker from the form, since anyone can type any address: it gets one "add NVDA to your morning email?"
 * email with a signed link instead (under the same 24-hour rule; a ticker asked for inside it is dropped).
 * `confirm_sent_at` and `add_sent_at` are only planned here: the store sets them when it claims the send.
 */
export function planCapture(
  existing: Partial<SubscriberDoc> | null,
  input: { email: string; ticker: string | null; source: CaptureSource },
  now: number,
): CapturePlan {
  if (existing?.linked_uid) return { kind: "linked" };
  const stamp = new Date(now).toISOString();
  const active = Boolean(existing?.confirmed_at) && !existing?.unsubscribed_at;
  const sendConfirm = !active && resendDue(existing?.confirm_sent_at, now);
  const current = mergeTickers(existing?.tickers, null);
  const isNew = Boolean(input.ticker) && !current.includes(input.ticker!) && current.length < MAX_SUBSCRIBER_TICKERS;
  const sendAdd = active && isNew && resendDue(existing?.add_sent_at, now) ? input.ticker : null;
  const doc: SubscriberDoc = {
    email: input.email,
    tickers: active ? current : mergeTickers(existing?.tickers, input.ticker),
    source: isCaptureSource(existing?.source) ? existing!.source : input.source,
    last_source: input.source,
    created_at: existing?.created_at ?? stamp,
    updated_at: stamp,
    confirmed_at: existing?.confirmed_at ?? null,
    confirm_sent_at: existing?.confirm_sent_at ?? null,
    add_sent_at: existing?.add_sent_at ?? null,
    unsubscribed_at: existing?.unsubscribed_at ?? null,
    linked_uid: null,
    linked_at: null,
  };
  return { kind: "write", doc, sendConfirm, sendAdd };
}

/** Whether the morning email goes to this record. */
export function isActiveSubscriber(doc: Partial<SubscriberDoc> | null | undefined): boolean {
  return Boolean(doc?.confirmed_at) && !doc?.unsubscribed_at && !doc?.linked_uid;
}

/** The tickers a new account starts with: a confirmed, active, unlinked record's first `limit`. */
export function seedTickers(doc: Partial<SubscriberDoc> | null | undefined, limit: number): string[] {
  if (!isActiveSubscriber(doc)) return [];
  return mergeTickers(doc?.tickers, null).slice(0, Math.max(0, limit));
}
