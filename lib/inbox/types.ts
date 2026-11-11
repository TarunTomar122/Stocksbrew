/**
 * The inbox: one list of what happened for a person while they were away,
 * merged from the stores that already record it (agent runs, call changes,
 * fired price alerts, reason checks, filings by investors they follow, insider
 * buys in their stocks, strategy rebalances, the weekly memo). Nothing here is
 * stored as an inbox item: every item is derived from a real record on each
 * read, so its id is built from that record and stays the same between reads.
 *
 * Pure types and constants, no server imports: the bell, the page and the
 * route all read this file.
 */

export const INBOX_KINDS = ["agent", "call", "results", "alert", "reason", "follow", "insider", "strategy", "memo"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export type InboxTone = "up" | "down" | "flat";

export type InboxItem = {
  /** Stable: built from the record it came from ("call:NVDA:2026-11-09"), so read state and React keys hold between reads. */
  id: string;
  kind: InboxKind;
  /** When it happened, ISO. A record that only has a day gets that day's US close (4 PM ET). */
  at: string;
  /** The New York day of `at`, YYYY-MM-DD, for grouping. */
  day: string;
  /** `at` is a real time of day. False when the record only had a day, so no clock time is shown for it. */
  exact: boolean;
  /** The stocks it is about, first one leads (its logo shows). */
  tickers: string[];
  /** One full sentence: what happened and why it matters to this person. */
  text: string;
  /** An optional second line: the reason given with the record, in its own words. */
  detail: string | null;
  /** Where the evidence is: the stock page, the agent's run log, the filing. */
  href: string;
  /** `href` leaves the site (an SEC filing). */
  external: boolean;
  /** Who reported it, short: "Your agent", "Our call", "SEC Form 4". */
  source: string;
  tone: InboxTone;
  /** A check that found nothing: listed, but never counted as unread. */
  quiet: boolean;
  /** Pro-only detail was left out (a rebalance's names on Free): the row shows the plan's lock mark beside it. */
  locked: boolean;
  /**
   * Two items with the same key within DEDUPE_WINDOW_MS are one event reported twice (a call change in the call's
   * history and in the call-change event log): only the one with the higher `weight` is kept.
   */
  dedupeKey: string;
  weight: number;
  /** Items on the same thread (one stock's call) keep only the newest: an older change was replaced by a newer one. */
  thread: string | null;
};

/** What the bell and the popover need: the unread count and the newest few, without the evidence detail. */
export type InboxSummary = {
  signedIn: boolean;
  /** Signed out: the example portfolio's inbox. */
  example: boolean;
  unread: number;
  seenAt: string | null;
  items: InboxItem[];
  /** False when a source could not be read, so an empty list is not presented as "nothing happened". */
  complete: boolean;
};

/** Sent on window when "Mark all read" saved, so the bell clears its count at once. */
export const INBOX_SEEN_EVENT = "stocksbrew:inbox-seen";

/** How far back the inbox reaches. */
export const INBOX_DAYS = 14;
/** Most items kept after merging. */
export const MAX_ITEMS = 120;
/** How many the bell's popover shows. */
export const POPOVER_ITEMS = 6;
/**
 * Two reports of one event can be days apart: the call is written one evening and the change event logged at the
 * next watchlist rebuild, which after a Friday change is Monday.
 */
export const DEDUPE_WINDOW_MS = 96 * 3600 * 1000;
/** Someone who has never opened the inbox starts with the last three days unread, not two weeks of it. */
export const FIRST_SEEN_DAYS = 3;

export const KIND_LABEL: Record<InboxKind, string> = {
  agent: "Agents",
  call: "Calls",
  results: "Results",
  alert: "Price alerts",
  reason: "Reasons",
  follow: "Investors",
  insider: "Insiders",
  strategy: "Strategies",
  memo: "Memo",
};
