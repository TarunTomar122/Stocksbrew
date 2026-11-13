/**
 * After-hours and pre-market quotes (`tm_extended_quotes/{TICKER}`, written by backend/agentdata/extended_hours.py
 * from Yahoo Finance every 15 minutes after the close and three times before the open).
 *
 * Extended-hours prices are thin. Everything here keeps them apart from the regular session: they are always said as
 * "after hours" or "pre-market" with their time, never as the close, and nothing in this file feeds a call, a level or
 * the day's % change. A quote is only shown while it is newer than the regular close it moved from and the next
 * regular session has not opened (`isExtendedLive`).
 *
 * Pure: no server imports, safe on the client.
 */

import { etDayOf, etToday, onDayWords } from "@/lib/day-words";
import { nextOpenAt } from "@/lib/market-session";

export type ExtendedSession = "post" | "pre";

export type ExtendedEarnings = {
  /** The report day, New York. */
  date: string;
  session: "amc" | "bmo";
  /** The 8-K is on file (the earnings day job read it); false when only the calendar says so. */
  confirmed: boolean;
  /** A few words from the release: "raised its outlook and revenue up 55% on a year ago". */
  reason: string | null;
};

export type ExtendedPrint = {
  session: ExtendedSession;
  price: number;
  /** Percent from the regular close before it. */
  changePct: number;
  regularClose: number;
  /** When that close printed (ISO). */
  regularCloseAt: string;
  /** When the extended print traded (ISO). */
  asOf: string;
  /** First print of this session whose move reached 3% / 5%, ISO, when one did. */
  crossedAt: { "3"?: string; "5"?: string };
};

export type ExtendedQuote = ExtendedPrint & {
  ticker: string;
  source: string;
  /** Last evening's after-hours print, kept when a pre-market print is newer. Null when the newest is it. */
  lastPost: ExtendedPrint | null;
  earnings: ExtendedEarnings | null;
};

/** A move this big after a report, or bigger than the other one without, is the agent's news. */
export const REPORTED_MOVE_PCT = 3;
export const BIG_MOVE_PCT = 5;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function printFrom(raw: unknown, session?: ExtendedSession): ExtendedPrint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const kind = str(row.session) || session;
  const price = num(row.price);
  const changePct = num(row.change_pct);
  const regularClose = num(row.regular_close);
  const regularCloseAt = str(row.regular_close_at);
  const asOf = str(row.as_of);
  if ((kind !== "post" && kind !== "pre") || price === null || price <= 0 || changePct === null || regularClose === null || regularClose <= 0) return null;
  const closeMs = ms(regularCloseAt);
  const atMs = ms(asOf);
  // A print that is not after its close is not an extended quote.
  if (closeMs === null || atMs === null || atMs <= closeMs) return null;
  const crossed = row.crossed_at && typeof row.crossed_at === "object" ? (row.crossed_at as Record<string, unknown>) : {};
  const crossedAt: ExtendedPrint["crossedAt"] = {};
  if (ms(str(crossed["3"])) !== null) crossedAt["3"] = str(crossed["3"]);
  if (ms(str(crossed["5"])) !== null) crossedAt["5"] = str(crossed["5"]);
  return { session: kind, price, changePct, regularClose, regularCloseAt, asOf, crossedAt };
}

/** A stored document as a quote, or null when it is not one we can stand behind. */
export function parseExtendedDoc(raw: unknown): ExtendedQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  const ticker = str(doc.ticker).toUpperCase();
  const session = str(doc.session) as ExtendedSession;
  // The newest print, from its own session block when there is one (it carries the crossings).
  const top = printFrom(doc[session], session) ?? printFrom(doc);
  if (!ticker || !top) return null;
  const post = top.session === "pre" ? printFrom(doc.post, "post") : null;
  // Last evening's print only when it moved from the same close this morning's print did.
  const lastPost = post && post.regularCloseAt === top.regularCloseAt ? post : null;
  const rawEarnings = doc.earnings && typeof doc.earnings === "object" ? (doc.earnings as Record<string, unknown>) : null;
  const earningsSession = str(rawEarnings?.session);
  const earningsDate = str(rawEarnings?.date);
  const earnings: ExtendedEarnings | null =
    rawEarnings && (earningsSession === "amc" || earningsSession === "bmo") && /^\d{4}-\d{2}-\d{2}$/.test(earningsDate)
      ? { date: earningsDate, session: earningsSession, confirmed: rawEarnings.confirmed === true, reason: str(rawEarnings.reason) || null }
      : null;
  return { ...top, ticker, source: str(doc.source) || "Yahoo Finance", lastPost, earnings };
}

/**
 * Whether a report explains a print: an after-close report on the close the print moved from, or a before-open report
 * for that morning's pre-market print. A before-open report never explains the evening before.
 */
export function reportFits(print: Pick<ExtendedPrint, "session" | "regularCloseAt" | "asOf">, earnings: ExtendedEarnings | null): boolean {
  if (!earnings) return false;
  if (earnings.session === "amc") return earnings.date === etDayOf(print.regularCloseAt);
  return print.session === "pre" && earnings.date === etDayOf(print.asOf);
}

/** Last evening's after-hours print as a quote of its own, with the report only when it explains that print. */
export function lastPostQuote(quote: ExtendedQuote): ExtendedQuote | null {
  if (!quote.lastPost) return null;
  const post: ExtendedQuote = { ...quote, ...quote.lastPost, lastPost: null };
  return { ...post, earnings: reportFits(post, quote.earnings) ? quote.earnings : null };
}

/** When the quote stops being news: the next regular open after it traded (ms since epoch). */
export function extendedDropAt(quote: Pick<ExtendedPrint, "asOf">): number | null {
  const at = ms(quote.asOf);
  return at === null ? null : nextOpenAt(new Date(at)).getTime();
}

/**
 * Whether to show the quote now: it traded after its regular close, the next regular session has not opened, and no
 * regular-session price newer than it is on the page (`regularAt`, the page's own quote time).
 */
export function isExtendedLive(quote: Pick<ExtendedPrint, "asOf" | "regularCloseAt">, now: number | Date = Date.now(), regularAt?: string | null): boolean {
  const at = ms(quote.asOf);
  const close = ms(quote.regularCloseAt);
  const drop = extendedDropAt(quote);
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (at === null || close === null || drop === null || at <= close) return false;
  // A print stamped well ahead of now is a bad clock, not a quote.
  if (at > nowMs + 5 * 60_000 || nowMs >= drop) return false;
  const regular = ms(regularAt ?? null);
  return regular === null || regular < at;
}

/** "After hours", "Pre-market". */
export function sessionLabel(session: ExtendedSession): string {
  return session === "post" ? "After hours" : "Pre-market";
}

/** The same inside a sentence: "after hours", "pre-market". */
export function sessionWords(session: ExtendedSession): string {
  return session === "post" ? "after hours" : "pre-market";
}

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/**
 * "7:58 PM ET", or "7:58 PM ET yesterday" / "… on Friday" when it is not today in New York. `withDay: false` leaves the
 * day out, for a line that already says it ("Reported after the close yesterday; …").
 */
export function extendedTime(asOf: string, now: number | Date = Date.now(), withDay = true): string {
  const at = ms(asOf);
  if (at === null) return "";
  const day = withDay ? etDayOf(asOf) : null;
  const when = day ? onDayWords(day, etToday(now)) : "";
  return `${ET_TIME.format(new Date(at))} ET${when && when !== "today" ? ` ${when}` : ""}`;
}

/** "+7.6%", "−3.2%" (a real minus), one decimal. */
export function extendedPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}

/** "up 7.6%", "down 3.2%", "flat". */
export function extendedMoveWords(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "flat";
  return `${rounded > 0 ? "up" : "down"} ${Math.abs(rounded).toFixed(1)}%`;
}

/**
 * When the report the move reacts to came out: "after the close", "before the open", or "after the close yesterday"
 * when it was an earlier day than `today` (a pre-market move the morning after).
 */
export function reportedWhen(earnings: ExtendedEarnings, today?: string): string {
  const when = earnings.session === "amc" ? "after the close" : "before the open";
  if (!today || earnings.date === today) return when;
  const day = onDayWords(earnings.date, today);
  return day ? `${when} ${day}` : when;
}

/**
 * Whether the move is the agent's news: 3% or more after a report, 5% or more otherwise. Returns when it first got
 * there (the stored crossing, so a 15-minute refresh does not make it new again), or null.
 */
export function bigExtendedMove(quote: Pick<ExtendedQuote, "changePct" | "earnings" | "crossedAt" | "asOf">): { threshold: number; at: string } | null {
  const threshold = quote.earnings ? REPORTED_MOVE_PCT : BIG_MOVE_PCT;
  if (Math.abs(quote.changePct) < threshold) return null;
  const key = String(threshold) as "3" | "5";
  return { threshold, at: quote.crossedAt[key] ?? quote.asOf };
}

/** The release's lead words ("raised its outlook" out of "raised its outlook and revenue up 55% on a year ago"). */
export function shortReason(reason: string | null | undefined): string | null {
  const lead = (reason ?? "").split(/, | and /)[0]?.trim();
  return lead ? lead : null;
}

/**
 * One sentence for the agent's record and the inbox, with the print's price and time (the row shows no clock of its
 * own): "CBRS reported after the close yesterday: raised its outlook; up 18.3% after hours, $115.68 at 7:59 PM ET."
 * Without a report: "MOD rose 27.4% after hours, to $135.20 at 7:59 PM ET yesterday."
 */
export function extendedSentence(quote: ExtendedQuote, now: number | Date = Date.now()): string {
  const price = `$${quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const where = sessionWords(quote.session);
  if (quote.earnings) {
    const reason = shortReason(quote.earnings.reason);
    // The report's day is said once: the print's time leaves it out when it is the same day.
    const time = extendedTime(quote.asOf, now, etDayOf(quote.asOf) !== quote.earnings.date);
    return `${quote.ticker} reported ${reportedWhen(quote.earnings, etToday(now))}${reason ? `: ${reason}` : ""}; ${extendedMoveWords(quote.changePct)} ${where}, ${price} at ${time}.`;
  }
  const rounded = Math.round(quote.changePct * 10) / 10;
  return `${quote.ticker} ${rounded >= 0 ? "rose" : "fell"} ${Math.abs(rounded).toFixed(1)}% ${where}, to ${price} at ${extendedTime(quote.asOf, now)}.`;
}

/** The plain fields Ask and MCP hand the model, labelled so a thin print is never read as the close. */
export function extendedForModel(quote: ExtendedQuote | null, now: number | Date = Date.now(), regularAt?: string | null) {
  if (!quote || !isExtendedLive(quote, now, regularAt)) return null;
  return {
    session: quote.session === "post" ? "after_hours" : "pre_market",
    label: sessionLabel(quote.session),
    price: Math.round(quote.price * 100) / 100,
    change_pct_vs_close: Math.round(quote.changePct * 100) / 100,
    regular_close: Math.round(quote.regularClose * 100) / 100,
    regular_close_at: quote.regularCloseAt,
    as_of: quote.asOf,
    time_et: extendedTime(quote.asOf, now),
    reported: quote.earnings && reportFits(quote, quote.earnings) ? { date: quote.earnings.date, when: reportedWhen(quote.earnings, etToday(now)), reason: quote.earnings.reason } : null,
    source: quote.source,
    note: "Thin trading outside the regular session. Not the close and not today's change; say after hours or pre-market with the time.",
  };
}

export type ExtendedForModel = NonNullable<ReturnType<typeof extendedForModel>>;
