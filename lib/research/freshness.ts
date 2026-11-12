import { etDayOf } from "@/lib/day-words";

/**
 * When a long research report someone already paid for can be handed to the
 * next person who asks for the same stock, instead of writing a new one.
 *
 * The owner first said two months, then "actually 2 months might be too
 * much". Everything is measured from when the run started reading its
 * evidence (the report's created_at), not when it finished: a filing that
 * lands while a run is still writing is not in that report. The rule, all
 * four at once:
 * - the run started at most SHARED_REPORT_MAX_AGE_DAYS ago;
 * - it started after the stock's latest earnings report (a later calendar
 *   day in New York: a run on the earnings day itself may predate the
 *   release, so it does not count);
 * - no 10-Q, 10-K or 8-K has been filed since it started;
 * - our call on the stock has not changed on or after the day it started.
 *
 * A signal we could not read is not a pass: a failed read, or any record with
 * a date we cannot read, makes the copy stale and a new report is written. A
 * signal that simply does not exist (a stock with no earnings on file) does
 * not block reuse.
 */

export const SHARED_REPORT_MAX_AGE_DAYS = 14;
const DAY_MS = 86_400_000;

/** The forms that mean the company told the market something new. */
export const FRESHNESS_FORMS = ["10-Q", "10-K", "8-K"] as const;

export type FreshnessSignals = {
  /** The latest earnings day on or before today, "YYYY-MM-DD" (New York). */
  latestEarningsDay: string | null;
  /**
   * When each of the stock's 10-Q, 10-K and 8-K filings was filed: an ISO time, or a plain New York day. Every one
   * is checked, never a single "latest": a plain day and a time cannot be ordered against each other safely.
   */
  filingsAt: string[];
  /** The day of the latest change to our call, "YYYY-MM-DD". */
  latestCallChangeDay: string | null;
  /** Some earnings, filing or call record had a date we could not read, so nothing can be ruled out. */
  unreadable?: boolean;
};

const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A stored date read strictly: a real calendar day ("2026-11-05") or a full ISO time with its zone. Anything else,
 * "2026-02-30", "Nov 5 2026" or "2026-11-05 10:00", which Date.parse would quietly accept or roll over, is null.
 */
export function strictTime(value: unknown): { day: string; ms: number; plain: boolean } | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (PLAIN_DAY.test(text)) return etDayOf(text) === text ? { day: text, ms: Date.parse(`${text}T00:00:00Z`), plain: true } : null;
  const match = INSTANT.exec(text);
  if (!match || etDayOf(match[1]) !== match[1]) return null;
  const ms = Date.parse(text);
  // The day of an instant is its New York day, never its literal date: "2026-11-06T02:00:00Z" is Nov 5 in New York,
  // so an evening report stored in UTC still counts on the day it came out (council, Nov 12).
  const day = Number.isFinite(ms) ? etDayOf(text) : null;
  return day ? { day, ms, plain: false } : null;
}

export type FreshnessVerdict =
  | { fresh: true; reason: "fresh" }
  | { fresh: false; reason: "bad_date" | "future" | "too_old" | "unreadable" | "earnings" | "filing" | "call" };

/** `evidenceAt`: when the run started reading its evidence, the report's created_at. */
export function sharedReportFreshness(evidenceAt: string, signals: FreshnessSignals, now: Date): FreshnessVerdict {
  // Read strictly, like every signal: "2026-11-31T12:00:00Z" must not roll forward into a fresh-looking date.
  const startedAt = strictTime(evidenceAt);
  if (!startedAt || startedAt.plain) return { fresh: false, reason: "bad_date" };
  const started = startedAt.ms;
  const startedDay = startedAt.day;
  // A clock a little ahead is fine; a run "started" well in the future is a bad record.
  if (started - now.getTime() > 5 * 60_000) return { fresh: false, reason: "future" };
  if (now.getTime() - started > SHARED_REPORT_MAX_AGE_DAYS * DAY_MS) return { fresh: false, reason: "too_old" };
  if (signals.unreadable) return { fresh: false, reason: "unreadable" };

  if (signals.latestEarningsDay !== null) {
    const earningsDay = etDayOf(signals.latestEarningsDay);
    if (!earningsDay) return { fresh: false, reason: "unreadable" };
    if (startedDay <= earningsDay) return { fresh: false, reason: "earnings" };
  }

  for (const value of signals.filingsAt) {
    const filed = strictTime(value);
    if (!filed) return { fresh: false, reason: "unreadable" };
    // A plain day is that New York day, and may have come after the run started that day, so it counts as newer.
    // A time is exact: newer when it is after the run started.
    if (filed.plain ? filed.day >= startedDay : filed.ms > started) return { fresh: false, reason: "filing" };
  }

  if (signals.latestCallChangeDay !== null) {
    const callDay = etDayOf(signals.latestCallChangeDay);
    if (!callDay) return { fresh: false, reason: "unreadable" };
    // Call changes are kept by day; one on the day the run started may have come after it.
    if (callDay >= startedDay) return { fresh: false, reason: "call" };
  }

  return { fresh: true, reason: "fresh" };
}

export function isSharedReportFresh(evidenceAt: string, signals: FreshnessSignals, now: Date): boolean {
  return sharedReportFreshness(evidenceAt, signals, now).fresh;
}

/* ── which report a request gets ────────────────────────────────────────── */

export type HeldReport = { key: string; ticker: string; status: string; created_at: string };
export type SharedChoice = { kind: "theirs"; key: string } | { kind: "handover" } | { kind: "run" };

/**
 * What a request for a report on `ticker` gets, given the stock's shared copy when it passed the freshness rule
 * (null otherwise) and the reports the person already holds. A handed-over copy keeps the original run's
 * created_at, so (ticker, created_at) names one report across people.
 * - First ask: the report they already hold if it is the shared one, else the shared copy, else a new run.
 * - "Run it again" (`forceFresh`): the shared copy only when it is newer than every report on this stock they hold;
 *   otherwise a new run. Holding the shared copy itself means nothing fresher exists, so it runs anew.
 */
export function chooseSharedPath(input: { ticker: string; forceFresh: boolean; shared: { created_at: string } | null; held: HeldReport[] }): SharedChoice {
  const shared = input.shared;
  if (!shared) return { kind: "run" };
  const mine = input.held.filter((item) => item.ticker === input.ticker && item.status === "ready");
  const same = mine.find((item) => item.created_at === shared.created_at);
  if (!input.forceFresh) return same ? { kind: "theirs", key: same.key } : { kind: "handover" };
  if (same) return { kind: "run" };
  const sharedAt = Date.parse(shared.created_at);
  if (!Number.isFinite(sharedAt)) return { kind: "run" };
  const newer = mine.every((item) => {
    const at = Date.parse(item.created_at);
    return !Number.isFinite(at) || at < sharedAt;
  });
  return newer ? { kind: "handover" } : { kind: "run" };
}
