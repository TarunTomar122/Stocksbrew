import { ATTRIBUTION_SOURCES } from "@/lib/attribution";
import { parseMs } from "@/lib/analytics/funnel";
import { utcDay } from "@/lib/analytics/visitor";

/**
 * The Signups tab of /admin/analytics: who made an account, newest first, and
 * what they did since. Pure: lib/analytics/signups-load.ts reads Firebase Auth
 * (sign-up time, sign-in method, last token refresh) and the `users` docs,
 * agent jobs and baskets, and hands them here.
 *
 * Read only, and nothing new is tracked: the visitor analytics never ties a
 * visit to an account (lib/analytics/ingest.ts), so "where they came from" is
 * the person's own answer to "How did you hear about us?" on their user doc.
 *
 * A field we don't have stays null (shown blank), never zero: an account
 * without a user doc has no stock count or plan.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The list shows the newest this many accounts until "Show all" is asked for, to keep the page light. */
export const MAX_ROWS = 500;

export type AuthAccount = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /** providerData ids: "google.com", "password", ... */
  providers: string[];
  createdMs: number | null;
  lastSignInMs: number | null;
  /** The last ID token refresh: the browser does this about hourly while the app is open. */
  lastRefreshMs: number | null;
};

export type AccountDoc = { uid: string; data: Record<string, unknown> };

/** One agent job or basket: whose it is and whether it is switched on. */
export type AgentOwner = { uid: string; on: boolean };

export type SignupsInput = {
  /** Null when Firebase Auth could not be listed: the user docs alone then. */
  auth: AuthAccount[] | null;
  docs: AccountDoc[];
  /** Null when the agents could not be read: the agent counts then stay blank. */
  agents: AgentOwner[] | null;
  now: number;
};

export type Method = "google" | "email" | "phone" | "other";
export type PlanKind = "pro" | "trial" | "free";

export type SignupRow = {
  uid: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  createdMs: number | null;
  method: Method | null;
  plan: PlanKind | null;
  /** A word on the plan for the hover title ("cancels at period end", "gifted"), or null. */
  planNote: string | null;
  paying: boolean;
  stocks: number | null;
  agents: number | null;
  lastSeenMs: number | null;
  /** Seen again a day or more after signing up; null while the account is under a day old or never seen. */
  cameBack: boolean | null;
  heard: { id: string; label: string; other: string | null } | null;
};

export type SignupsView = {
  total: number;
  firstMs: number | null;
  /** Today (UTC) so far, by hour, against yesterday by the same hour. */
  today: { count: number; yesterday: number; hours: number[] };
  week: { count: number; previous: number; days: number[] };
  month: { count: number; previous: number; days: number[] };
  /** Came back a day or more after signing up, out of the accounts at least a day old. */
  cameBack: { count: number; eligible: number };
  addedStocks: { count: number; known: number };
  /** Null when the agents didn't load. */
  agentsOn: { count: number } | null;
  pro: { count: number; paying: number; trial: number };
  rows: SignupRow[];
  authMissing: boolean;
};

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function methodOf(providers: readonly string[] | null | undefined): Method | null {
  if (!providers || providers.length === 0) return null;
  if (providers.includes("google.com")) return "google";
  if (providers.includes("password") || providers.includes("emailLink")) return "email";
  if (providers.includes("phone")) return "phone";
  return "other";
}

/**
 * The plan a user doc gives, the way lib/watchlist.ts resolveIsSubscribed decides access, but without its
 * local-development "unlock Pro" switch, so this page tells the truth on a laptop too.
 */
export function planOfDoc(data: Record<string, unknown>, now: number): { plan: PlanKind; note: string | null; paying: boolean } {
  const status = String(data.subscriptionStatus ?? "").trim().toLowerCase();
  const hasSubscription = Boolean(str(data.subscriptionId));
  if (data.proGifted) {
    // Read the way resolveIsSubscribed reads it, so the two never disagree.
    const until = Date.parse(String(data.proGiftExpiresAt || ""));
    return Number.isFinite(until) && until > now ? { plan: "pro", note: "gifted", paying: false } : { plan: "free", note: "gift ended", paying: false };
  }
  if (["payment_failed", "failed", "on_hold", "cancelled", "expired"].includes(status)) {
    return { plan: "free", note: status.replace("_", " "), paying: false };
  }
  const trial = status === "trialing" || status === "on_trial";
  if (data.is_subscribed || status === "active" || trial) {
    const note = trial ? "on trial" : data.cancelAtPeriodEnd ? "cancels at period end" : hasSubscription ? null : "complimentary";
    return { plan: trial ? "trial" : "pro", note, paying: hasSubscription && !trial };
  }
  return { plan: "free", note: null, paying: false };
}

const HEARD = new Map<string, string>(ATTRIBUTION_SOURCES.map((s) => [s.id, s.label]));

export function heardOf(data: Record<string, unknown>): SignupRow["heard"] {
  const id = str(data.heard_about_us)?.toLowerCase();
  if (!id) return null;
  const label = HEARD.get(id);
  if (!label) return null;
  return { id, label, other: id === "other" ? str(data.heard_about_us_other)?.slice(0, 120) ?? null : null };
}

function maxMs(...values: Array<number | null | undefined>): number | null {
  const known = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return known.length ? Math.max(...known) : null;
}

/**
 * A profile photo we will load on the owner's page: Google's own photo host only. Anyone can set their Auth
 * photoURL to any address, and loading an arbitrary one would tell its owner when this page was opened.
 */
export function safePhoto(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Joins the Auth record, the user doc and the agents for one account. */
export function rowOf(uid: string, auth: AuthAccount | undefined, doc: Record<string, unknown> | undefined, agents: number | null, now: number): SignupRow {
  const createdMs = auth?.createdMs ?? (doc ? parseMs(doc.created_at) : null);
  const visits = doc?.briefing_visits as { last_at?: unknown } | undefined;
  const lastSeenMs = maxMs(auth?.lastRefreshMs, auth?.lastSignInMs, doc ? parseMs(doc.last_sign_in_at) : null, visits ? parseMs(visits.last_at) : null);
  const plan = doc ? planOfDoc(doc, now) : null;
  let cameBack: boolean | null = null;
  if (createdMs != null && now - createdMs >= DAY_MS) cameBack = lastSeenMs != null && lastSeenMs - createdMs >= DAY_MS;
  return {
    uid,
    email: str(auth?.email) ?? (doc ? str(doc.email) : null),
    name: str(auth?.displayName) ?? (doc ? str(doc.display_name) : null),
    photo: safePhoto(auth?.photoURL) ?? (doc ? safePhoto(doc.photo_url) : null),
    createdMs,
    method: auth ? methodOf(auth.providers) : null,
    plan: plan?.plan ?? null,
    planNote: plan?.note ?? null,
    paying: plan?.paying ?? false,
    stocks: doc ? (Array.isArray(doc.tracked_stocks) ? doc.tracked_stocks.length : 0) : null,
    agents,
    lastSeenMs,
    cameBack,
    heard: doc ? heardOf(doc) : null,
  };
}

/** Counts per bucket: bucket i holds [start + i * size, start + (i + 1) * size). */
function buckets(times: readonly number[], start: number, size: number, count: number): number[] {
  const out = new Array<number>(count).fill(0);
  for (const ms of times) {
    const index = Math.floor((ms - start) / size);
    if (index >= 0 && index < count) out[index]! += 1;
  }
  return out;
}

export function buildSignups({ auth, docs, agents, now }: SignupsInput): SignupsView {
  const authById = new Map((auth ?? []).map((a) => [a.uid, a]));
  const docById = new Map(docs.map((d) => [d.uid, d.data]));
  const agentCount = new Map<string, number>();
  for (const agent of agents ?? []) if (agent.on) agentCount.set(agent.uid, (agentCount.get(agent.uid) ?? 0) + 1);

  // An account is an Auth record: a user doc without one can't sign in (the store holds a few billing-only docs
  // like that, written by the payment webhook). Only when Auth didn't answer do the docs stand in, and then only
  // the ones that look like a profile (an email or a sign-up time).
  const ids = auth
    ? new Set(authById.keys())
    : new Set(docs.filter((d) => str(d.data.email) || parseMs(d.data.created_at) != null).map((d) => d.uid));
  const rows = Array.from(ids, (uid) => {
    // Every agent was read, so an account with none has 0, not blank.
    return rowOf(uid, authById.get(uid), docById.get(uid), agents ? agentCount.get(uid) ?? 0 : null, now);
  }).sort((a, b) => (b.createdMs ?? -Infinity) - (a.createdMs ?? -Infinity) || a.uid.localeCompare(b.uid));

  const created = rows.map((r) => r.createdMs).filter((ms): ms is number => ms != null && ms <= now);
  const todayStart = Date.parse(`${utcDay(now)}T00:00:00.000Z`);
  const sinceMidnight = now - todayStart;
  const countIn = (start: number, end: number) => created.filter((ms) => ms >= start && ms < end).length;

  const weekStart = todayStart - 6 * DAY_MS;
  const monthStart = todayStart - 29 * DAY_MS;
  const eligible = rows.filter((r) => r.cameBack !== null);
  const pro = rows.filter((r) => r.plan === "pro" || r.plan === "trial");

  return {
    total: rows.length,
    firstMs: created.length ? created.reduce((a, b) => Math.min(a, b)) : null,
    today: {
      count: countIn(todayStart, now + 1),
      // Like with like: yesterday up to the same minute.
      yesterday: countIn(todayStart - DAY_MS, todayStart - DAY_MS + sinceMidnight + 1),
      hours: buckets(created, todayStart, HOUR_MS, Math.floor(sinceMidnight / HOUR_MS) + 1),
    },
    // The periods before end at the same time of their last day, as the Visitors tab compares them.
    week: { count: countIn(weekStart, now + 1), previous: countIn(weekStart - 7 * DAY_MS, weekStart - DAY_MS + sinceMidnight + 1), days: buckets(created, weekStart, DAY_MS, 7) },
    month: { count: countIn(monthStart, now + 1), previous: countIn(monthStart - 30 * DAY_MS, monthStart - DAY_MS + sinceMidnight + 1), days: buckets(created, monthStart, DAY_MS, 30) },
    cameBack: { count: eligible.filter((r) => r.cameBack).length, eligible: eligible.length },
    addedStocks: { count: rows.filter((r) => (r.stocks ?? 0) > 0).length, known: rows.filter((r) => r.stocks != null).length },
    agentsOn: agents ? { count: rows.filter((r) => (r.agents ?? 0) > 0).length } : null,
    pro: { count: pro.length, paying: pro.filter((r) => r.paying).length, trial: pro.filter((r) => r.plan === "trial").length },
    rows,
    authMissing: auth === null,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "just now", "12 min ago", "3 h ago", "4 days ago", "2 months ago". Empty for an unknown time. */
export function agoText(ms: number | null | undefined, now: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** The UTC day, like the rest of the page: "Nov 12", or "Nov 12, 2025" in another year. Empty for an unknown time. */
export function dayText(ms: number | null | undefined, now: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const day = utcDay(ms);
  const label = `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
  return day.slice(0, 4) === utcDay(now).slice(0, 4) ? label : `${label}, ${day.slice(0, 4)}`;
}

/** For a hover title: "Nov 12, 2026, 14:05 UTC". */
export function stampText(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const iso = new Date(ms).toISOString();
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The UTC calendar day in words, under the "3 h ago" line: "today", "yesterday", the weekday within the last
 * week, and the date ("Nov 2") past that. Empty for an unknown time.
 */
export function dayWordsUtc(ms: number | null | undefined, now: number): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const gap = Math.round((Date.parse(`${utcDay(now)}T00:00:00Z`) - Date.parse(`${utcDay(ms)}T00:00:00Z`)) / DAY_MS);
  if (gap <= 0) return "today";
  if (gap === 1) return "yesterday";
  if (gap <= 6) return WEEKDAYS[new Date(ms).getUTCDay()]!;
  return dayText(ms, now);
}

/** The rows the list shows: the newest MAX_ROWS, or every account when `all` is asked for. */
export function visibleRows(view: SignupsView, all: boolean): SignupRow[] {
  return all ? view.rows : view.rows.slice(0, MAX_ROWS);
}
