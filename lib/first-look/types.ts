/**
 * The agent's first look (/agent, right after a new person's stocks are in): one real pass over their stocks from the
 * loaders the app already has, ranked down to the few things that matter, ending in a decision, plus the standing
 * agents it would set up for them and one reason to give. Types only, safe on the client.
 */

export type FindingKind = "call" | "report" | "move" | "filing" | "insider" | "level" | "results";

export type FindingTone = "up" | "down" | "flat";

/** One thing the first look found on one stock: a card with its logo, one figure and one line. */
export type Finding = {
  /** Stable for one stock and one event ("call:NVDA:2026-11-10"). */
  id: string;
  kind: FindingKind;
  ticker: string;
  /** The figure the card shows big: "Sell some", "−9.2%", "3 days", "+2 risks". */
  figure: string;
  /** What the figure is, in a word or two, for screen readers and the hover title. */
  figureLabel: string;
  tone: FindingTone;
  /** One line, at most FINDING_WORDS words. */
  text: string;
  /** The shortest form, for the decision ("our call moved to Sell some"). */
  lead: string;
  /** The day it happened or happens, YYYY-MM-DD (New York). */
  day: string | null;
  /** Who says so: "Our call", "Earnings calendar", "SEC 10-Q", "SEC Form 4", "Daily closes". Shown on hover. */
  source: string;
  href: string;
  /** Other stocks the same card is about (several at their buy-more price), after `ticker`. */
  also?: string[];
  /** Ranking score: higher first. URGENT and up asks for the person's attention now. */
  score: number;
  /** The stock is one of their holdings (not only watched). */
  held: boolean;
};

/** The stock's price on the card (owner rule 4: every stock card shows its price beside its move). */
export type FindingQuote = { price: number; dayPct: number | null };

export type CallMix = { buyMore: number; keep: number; sellSome: number };

/** What the run decided. Every run ends in one, "nothing urgent" included. */
export type FirstLookDecision = {
  urgent: boolean;
  /** "2 need a look", "All quiet". */
  figure: string;
  /** One line, at most FINDING_WORDS words. */
  text: string;
};

export type FirstLookRun = {
  /** How many of their stocks were looked at. */
  stocks: number;
  findings: Finding[];
  decision: FirstLookDecision;
  quotes: Record<string, FindingQuote>;
  /** Our call across their stocks, for the decision card's bar. Null when no call could be read. */
  calls: CallMix | null;
  /** Every source answered in time. False: the decision says it is a partial look when it found nothing. */
  complete: boolean;
  /** Sources left out (slow or failed), for logs and tests. */
  missing: string[];
  /** How long the run took, for logs. */
  ms: number;
  /** New York day of the run. */
  today: string;
  /** Every finding the run backed, best first, as kind and stock: what each offered agent would have caught. */
  caught: Array<Pick<Finding, "kind" | "ticker">>;
  /** Company names from the screener, for the reason sheet. */
  names: Record<string, string>;
};

/** A standing agent the first look offers to set up, from an existing template, watching the person's stocks. */
export type AgentOffer = {
  template: string;
  /** Short card title. */
  title: string;
  /** What it does, one line. */
  does: string;
  /** The job the tap creates (POST /api/agent-jobs). Scope is always the person's own stocks. */
  draft: { template: string; name: string; trigger: Record<string, unknown>; scope: { kind: "watchlist" } };
  /** Up to three of their stocks it would have something on now, for the card's logos. */
  tickers: string[];
  /** A few words beside those logos ("report soon"). */
  hint: string;
  /** The agent this offer already made (since their first look started), with whether it is on; null when not made yet. */
  job: { id: string; enabled: boolean } | null;
};

export type AgentOffers = {
  offers: AgentOffer[];
  /** Said once beside the heading when the plan's limit left fewer offers than we would make; else null. */
  limitNote: string | null;
};

/** The stock to ask "Why do you own X?" about first, then the rest in size order (the tile skips ones with a reason). */
export type ReasonAsk = { instrument_id: string; ticker: string; name: string | null };

/** What is stored on the person's own user doc (`first_look`), additive. */
export type FirstLookState = {
  started_at: string;
  dismissed_at?: string | null;
  source?: "onboarding" | "agent" | "landing";
};

/** What /agent shows: the panel, the one-time offer to open it (an existing person), or nothing. */
export type FirstLookView = { show: "panel"; preview: boolean } | { show: "offer" } | { show: "none" };

/** Most words in a finding's line and the decision (owner rule 8). */
export const FINDING_WORDS = 15;
/** A score at or above this asks for attention now. */
export const URGENT = 80;
/** Below this a finding is not worth a card. */
export const MATTERS = 45;
/** How long the panel stays for a person who never dismisses it and has no agent run yet. */
export const FIRST_LOOK_DAYS = 7;
