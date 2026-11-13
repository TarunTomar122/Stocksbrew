/**
 * Plain-English agents: a person types what they want watched, and we turn it
 * into the agent jobs that already exist (lib/agent-jobs.ts), read back in
 * plain sentences before anything is saved.
 *
 * Two readers share one builder:
 * - fixed rules for the common shapes ("NVDA drops below 150", "anything I
 *   own moves 5%", "before Apple reports"), which cost nothing;
 * - a language model for the rest (lib/agents-plain/model.ts), which may only
 *   pick from the same list of watch kinds and copy stock names as written.
 *
 * Whatever either reader returns goes through `buildSpec`: stocks are
 * resolved against our catalogue, numbers are range-checked, and every watch
 * is validated by `parseJobDraft`, the same check the agents API runs. Every
 * sentence a person reads is written here, never by the model. A part of the
 * request we cannot watch comes back as "I can't watch that yet" with the
 * reason, never dropped and never stretched into something else.
 */

import { cleanFilingFilter, filingFilterAllowsAnyStock, filingWhen, type FilingFilter } from "@/lib/agent-events-filings";
import { cleanNewsWatch, newsWatchPhrase, type NewsWatch } from "@/lib/agent-events-news";
import {
  CALL_WORDS,
  MAX_SCOPE_TICKERS,
  hiddenTemplateIds,
  parseJobDraft,
  type AgentCall,
  type AgentJobDraft,
  type AgentScope,
} from "@/lib/agent-jobs";
import type { FilingGroup } from "@/lib/filings-shared";

import { findStocks, listStockNames, resolveStock, type PlainStock, type StockCatalog } from "./stocks";

/* ── types ──────────────────────────────────────────────────────────────── */

export const MAX_REQUEST_CHARS = 300;
/** More than this many agents from one sentence is a list, not a request. */
export const MAX_WATCHES = 6;

export const WATCH_KINDS = [
  "price_below",
  "price_above",
  "daily_move",
  "earnings_before",
  "earnings_out",
  "fund_13f",
  "congress_trade",
  "insider_trade",
  "movers_list",
  "buy_zone",
  /** "Tell me when to sell X": a close at our sell-some price, or our call turning to Sell some. A signal, never a trade. */
  "sell_zone",
  /** "Tell me when your call on X changes", optionally to one call (`to`). */
  "call_change",
  "daily_check",
  "weekly_review",
  "sec_filing",
  "news_change",
] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export const CANNOT_CODES = [
  "news",
  "intraday",
  "chart_signals",
  "fundamentals",
  "analyst_ratings",
  "call_change",
  "dividends",
  "trading",
  "cost_basis",
  "multi_day_move",
  "not_a_us_stock",
  "weekend",
  "no_stock",
  "no_direction",
  "earnings_out_off",
  "out_of_range",
  "too_many",
  "unclear",
  "other",
] as const;
export type CannotCode = (typeof CANNOT_CODES)[number];

/** One thing to watch, as either reader understood it. Not validated yet. */
export type Intent = {
  kind: WatchKind;
  stocks: PlainStock[];
  /** "anything I own", "my stocks". */
  mine?: boolean;
  /** "any stock", "anyone": filings and disclosures across the market. */
  every?: boolean;
  level?: number | null;
  pct?: number | null;
  direction?: "up" | "down" | "both" | null;
  days?: number | null;
  weekday?: number | null;
  /** They asked about one side of a trade ("a fund sells it"). */
  side?: "buy" | "sell" | null;
  /** They named one person ("Pelosi"). */
  person?: string | null;
  /** They asked to hear the moment it happens. */
  intraday?: boolean;
  /** Read "the S&P 500" as SPY, say. */
  stand_in?: { said: string; ticker: string } | null;
  /** No stock named and no "my stocks": the rules filled in the default subject. */
  implicit?: boolean;
  /** Other move sizes asked for on the same stocks, folded into this one ("up 5% or down 3%"). */
  folded_pcts?: number[];
  /** sec_filing: which forms and 8-K items, or "something big". */
  filings?: FilingFilter | null;
  /** sec_filing: they named a shelf offering (S-3), which we do not collect. */
  shelf?: boolean;
  /** news_change: heavier than usual, a tone, or either. */
  news?: NewsWatch | null;
  /** news_change: they named one kind of story ("an FDA decision"), which agents can't pick out. */
  topic?: boolean;
  /** call_change: only a change to this call ("turns to Sell some"). */
  to?: AgentCall | null;
  /** Our calls from the build context, set by buildIntent so the read-back can name a real price. */
  calls?: Record<string, PlainCall>;
};

export type PlainCannot = {
  code: CannotCode;
  /** The words from the request this is about, when we can quote them. */
  what: string | null;
  /** One full sentence a person reads. */
  line: string;
  /** A request that would work instead, offered as one tap. */
  suggest?: string | null;
};

export type PlainWatch = {
  /** Validated by parseJobDraft; saved through the agents API unchanged. */
  draft: AgentJobDraft;
  /** "when it closes below $150", for a list under a shared subject. */
  line: string;
  /** "when NVIDIA closes below $150", when the watches have different subjects. */
  full: string;
  /** What to expect that the person may not, in one or two sentences. */
  note: string | null;
};

export type PlainSpec = {
  input: string;
  via: "rules" | "model";
  /** "I'll watch NVIDIA and tell you:" or a whole sentence when there is one watch. */
  lead: string;
  /** The preview as one paragraph, for tests and for screen readers. */
  sentence: string;
  watches: PlainWatch[];
  cannot: PlainCannot[];
  /** Every stock the agents will watch by name. */
  stocks: PlainStock[];
  /** Whether any watch follows the stocks the person tracks. */
  uses_watchlist: boolean;
};

/**
 * Our call on a stock as the person may see it, for the read-back of a buy or sell watch. `call` null: no call yet.
 * The levels are null where the plan does not cover the stock (`locked`).
 */
export type PlainCall = { call: AgentCall | null; add_below: number | null; trim_above: number | null; locked?: boolean };

export type BuildContext = {
  /** Template ids switched off on the server (hiddenTemplateIds). */
  hidden?: string[];
  /**
   * Our call on the stocks a buy or sell watch names, by ticker (lib/agents-plain/server.ts plainCallLookup). A
   * ticker left out was not looked up, and the read-back says the price without a figure.
   */
  calls?: Record<string, PlainCall>;
};

/* ── copy ───────────────────────────────────────────────────────────────── */

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function money(value: number): string {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

function pctText(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(/\.0$/, "")}%`;
}

function quote(text: string): string {
  return `“${text}”`;
}

const REASONS: Record<CannotCode, string> = {
  news: "agents can't pick out one kind of story, like an FDA decision or a lawsuit. They can tell you when the news about a stock gets much heavier than usual or turns clearly negative or positive.",
  intraday: "agents read each day's closing price, so they can't catch a price during the day.",
  chart_signals: "agents don't track chart signals like moving averages, volume or 52-week highs. A price level works, like “NVDA closes below 150”.",
  fundamentals: "agents don't track valuation numbers like the P/E ratio or market value.",
  analyst_ratings: "agents don't follow analyst ratings or price targets.",
  call_change: "agents can tell you when our call on a stock changes, like “tell me when your call on NVDA changes”.",
  dividends: "agents don't watch dividend announcements.",
  trading: "agents never buy or sell for you. I can tell you when a stock reaches our buy-more or sell-some price instead.",
  cost_basis: "agents measure a move from one day's close to the next, not from the price you paid.",
  multi_day_move: "agents measure a move from one day's close to the next. A weekly review lists moves of 5% or more over five days.",
  not_a_us_stock: "agents only watch the US stocks and funds we cover.",
  weekend: "agents check on market days, Monday to Friday.",
  no_stock: "a price level needs a stock to watch, like “NVDA closes below 150”.",
  no_direction: "say whether you mean above or below, like “closes above 200”.",
  earnings_out_off: "the report straight after earnings isn't switched on yet. I can tell you a few days before a company reports instead.",
  out_of_range: "that number is outside what agents can watch.",
  too_many: `one request can set up at most ${MAX_WATCHES} agents.`,
  unclear: "",
  other: "it isn't something agents check.",
};

/** The full line for something we cannot watch. */
export function cannotLine(code: CannotCode, what: string | null, detail?: string): string {
  if (code === "unclear") {
    return what
      ? `I didn't follow ${quote(what)}. Name a stock and what should happen, like “tell me if NVDA closes below 150”.`
      : "I couldn't tell what to watch. Name a stock and what should happen, like “tell me if NVDA closes below 150”.";
  }
  if (code === "not_a_us_stock" && what && !detail) {
    return `I can't watch that yet: I couldn't find ${quote(what)} among the US stocks and funds we cover.`;
  }
  return `I can't watch that yet: ${detail ?? REASONS[code]}`;
}

function cannot(code: CannotCode, what: string | null, options: { detail?: string; suggest?: string | null; line?: string } = {}): PlainCannot {
  return { code, what, line: options.line ?? cannotLine(code, what, options.detail), suggest: options.suggest ?? null };
}

/**
 * A request to place a trade ("sell my ORCL"), refused in one friendly line that offers the watch we can do, with
 * that watch as one tap: "I can't place trades. I can tell you when Oracle reaches our sell-some price. Want that?"
 */
export function tradeCannot(what: string | null, stocks: PlainStock[], side: "buy" | "sell"): PlainCannot {
  const who = stocks.length ? listStockNames(stocks.slice(0, 3), "or") : null;
  // "When our call says to sell some", never "its sell-some price": a Keep call has none (owner rule 8).
  const offer =
    side === "sell"
      ? `our call says to sell some ${who ?? "of your stocks"}`
      : `${who ?? "one of your stocks"} drops to our buy-more price`;
  const suggest = who
    ? `Tell me when to ${side} ${listStockNames(stocks.slice(0, 3), "and")}`
    : side === "sell"
      ? "Tell me when anything I own hits a sell price"
      : "Tell me when to buy more of my stocks";
  return cannot("trading", what, { line: `I can't place trades. I can tell you when ${offer}. Want that?`, suggest });
}

/** "Sell some", "trim", "avoid" are Trim; "keep", "hold" are Hold; "buy more", "add" are Add. */
function callOfWord(word: string | undefined): AgentCall | null {
  const key = (word ?? "").toLowerCase();
  if (/^(?:buy|add|accumulate)/.test(key)) return "Add";
  if (/^(?:keep|hold)/.test(key)) return "Hold";
  if (/^(?:sell|trim|reduce|avoid)/.test(key)) return "Trim";
  return null;
}

/** Which side a trade request is on: "sell my ORCL", "short it", "dump it" and a stop-loss sell; anything else buys. */
function tradeSide(text: string): "buy" | "sell" {
  return /\b(?:sell|sold|short|dump|trim|exit|unload|get out|stop[- ]loss)\b/i.test(text) ? "sell" : "buy";
}

/* ── turning an intent into agent drafts ────────────────────────────────── */

type Subject = { kind: AgentScope["kind"]; stocks: PlainStock[] };

function scopeOf(subject: Subject): AgentScope {
  if (subject.kind === "tickers") return { kind: "tickers", tickers: subject.stocks.map((stock) => stock.ticker) };
  return subject.kind === "any" ? { kind: "any" } : { kind: "watchlist" };
}

/** Who a sentence is about, in full: "NVIDIA", "Apple or Microsoft", "any of the stocks you track". */
function whoFull(subject: Subject): string {
  if (subject.kind === "tickers") return subject.stocks.length === 1 ? subject.stocks[0].name : listStockNames(subject.stocks, "or");
  return subject.kind === "any" ? "any stock" : "any of the stocks you track";
}

/** The same, once the subject has been named: "it", "any of them". */
function whoShort(subject: Subject): string {
  return subject.kind === "tickers" && subject.stocks.length === 1 ? "it" : "any of them";
}

/** The thing a trade is in: "NVIDIA", "Apple or Microsoft", "the stocks you track", "any stock". */
function inWhat(subject: Subject, short: boolean): string {
  if (subject.kind === "any") return "any stock";
  if (subject.kind === "watchlist") return short ? "any of them" : "the stocks you track";
  if (short) return subject.stocks.length === 1 ? "it" : "any of them";
  return listStockNames(subject.stocks, "or");
}

/** The subject that leads a sentence about prices: "NVIDIA", "Apple or Microsoft", "any of the stocks you track". */
function priceWho(subject: Subject, short: boolean): string {
  return short ? whoShort(subject) : whoFull(subject);
}

function tickerLabel(subject: Subject): string {
  if (subject.kind !== "tickers") return "";
  const tickers = subject.stocks.map((stock) => stock.ticker);
  return tickers.length <= 3 ? tickers.join(", ") : `${tickers.slice(0, 3).join(", ")} +${tickers.length - 3}`;
}

function jobName(kind: WatchKind, subject: Subject, intent: Intent): string {
  const label = tickerLabel(subject);
  const mine = subject.kind === "watchlist";
  const prefix = label ? `${label}: ` : mine ? "My names: " : "";
  switch (kind) {
    case "price_below":
      return `${label} below ${money(intent.level ?? 0)}`;
    case "price_above":
      return `${label} above ${money(intent.level ?? 0)}`;
    case "daily_move":
      return `${prefix}moves of ${pctText(intent.pct ?? 5)} in a day`;
    case "earnings_before":
      return `${prefix}${intent.days === 1 ? "the day" : `${intent.days ?? 3} days`} before earnings`;
    case "earnings_out":
      return `${prefix}earnings reports`;
    case "fund_13f":
      return subject.kind === "any" ? "New 13F filings" : `${prefix}new 13F filings`;
    case "congress_trade":
      return subject.kind === "any" ? "Trades by members of Congress" : `${prefix}trades by Congress`;
    case "insider_trade":
      return subject.kind === "any" ? "Insider trades" : `${prefix}insider trades`;
    case "movers_list":
      return `${prefix}on the movers list`;
    case "buy_zone":
      return `${prefix}reaches our buy price`;
    case "sell_zone":
      return `${prefix}${prefix ? "when" : "When"} to sell some`;
    case "call_change":
      return `${prefix}${prefix ? "our" : "Our"} call ${intent.to ? `turns to ${CALL_WORDS[intent.to]}` : "changes"}`;
    case "daily_check":
      return label ? `Morning check on ${label}` : "Morning check on my names";
    case "weekly_review":
      return label ? `Weekly review of ${label}` : "Weekly review of my names";
    case "sec_filing":
      return `${prefix}${filingName(intent.filings ?? null, !prefix)}`;
    case "news_change":
      return `${prefix}${newsName(intent.news ?? "any", !prefix)}`;
  }
}

const ITEM_NAMES: Record<string, string> = {
  "1.01": "deals",
  "1.02": "deals ending",
  "1.03": "bankruptcy",
  "1.05": "cyber incidents",
  "2.01": "acquisitions",
  "2.02": "results",
  "2.03": "new debt",
  "2.05": "restructuring",
  "2.06": "impairments",
  "3.01": "delisting notices",
  "4.01": "auditor changes",
  "4.02": "restatements",
  "5.01": "changes in control",
  "5.02": "executive changes",
  "5.07": "shareholder votes",
};

/** "new 8-Ks on executive changes", "big SEC filings", "New SEC filings" (capitalised when it starts the name). */
function filingName(filter: FilingFilter | null, lead: boolean): string {
  const forms = filter?.forms ?? [];
  const items = (filter?.items ?? []).map((item) => ITEM_NAMES[item] ?? `item ${item}`);
  const text = filter?.major
    ? "big SEC filings"
    : forms.length === 0
      ? "new SEC filings"
      : `new ${forms.map((form) => (form === "13D/G" ? "13D or 13G" : form)).join(" or ")} filings${items.length ? ` on ${items.join(" or ")}` : ""}`;
  return lead ? capitalise(text) : text;
}

function newsName(watch: NewsWatch, lead: boolean): string {
  const text =
    watch === "busy" ? "much more news than usual" : watch === "negative" ? "news turns negative" : watch === "positive" ? "news turns positive" : watch === "tone" ? "news turns one way" : "news gets heavier or one-sided";
  return lead ? capitalise(text) : text;
}

/** The "when …" line for one watch, short (after the subject is named) or full. */
function watchLine(kind: WatchKind, subject: Subject, intent: Intent, short: boolean): string {
  const who = priceWho(subject, short);
  switch (kind) {
    case "price_below":
      return `when ${who} closes below ${money(intent.level ?? 0)}`;
    case "price_above":
      return `when ${who} closes above ${money(intent.level ?? 0)}`;
    case "daily_move":
      return `when ${who} moves ${pctText(intent.pct ?? 5)} or more in a day, up or down`;
    case "earnings_before": {
      const days = intent.days ?? 3;
      const span = days === 1 ? "a day" : days === 7 ? "a week" : `${days} days`;
      return `when ${who} is ${span} away from reporting earnings`;
    }
    case "earnings_out":
      return `when ${who} reports earnings, with the numbers against what was expected and how the stock reacted`;
    case "movers_list":
      return `when ${who} lands on the day's list of biggest movers`;
    case "buy_zone": {
      const level = oneLevel(subject, intent, "buy");
      return level != null
        ? `when ${who} drops to our buy-more price (${money(level)})`
        : `when ${who} drops to the price where our research says we'd buy more`;
    }
    case "sell_zone": {
      const level = oneLevel(subject, intent, "sell");
      const subjectWords = subject.kind === "watchlist" && !short ? "a stock you track" : who;
      // A sell-some price exists only under a Sell some call, so the call has nothing left to turn to.
      if (level != null) return `when ${subjectWords} reaches our sell-some price (${money(level)})`;
      return noSellPrice(subject, intent) ? `if our call on ${who} turns to Sell some` : `when ${subjectWords} reaches our sell-some price or our call turns to Sell some`;
    }
    case "call_change":
      return intent.to ? `when our call on ${inWhat(subject, short)} turns to ${CALL_WORDS[intent.to]}` : `when our call on ${inWhat(subject, short)} changes`;
    case "fund_13f":
      if (subject.kind === "any") return "when a fund we track files a new 13F";
      return subject.kind === "watchlist"
        ? `when a fund we track files a new 13F, and whether any of ${short ? "them" : "the stocks you track"} are among its biggest changes`
        : `when a fund we track files a new 13F, and whether ${listStockNames(subject.stocks, "or")} ${subject.stocks.length === 1 ? "is" : "are"} among its biggest changes`;
    case "congress_trade":
      return `when a member of Congress discloses a trade in ${inWhat(subject, short)}`;
    case "insider_trade":
      return `when an executive or board member reports a trade in ${inWhat(subject, short)}`;
    case "daily_check": {
      const target = subject.kind === "tickers" ? listStockNames(subject.stocks) : "the stocks you track";
      return `every market day, a check on ${target}: moves of 3% or more, earnings within a week and trades by members of Congress`;
    }
    case "weekly_review": {
      const target = subject.kind === "tickers" ? listStockNames(subject.stocks) : "the stocks you track";
      return `every ${WEEKDAY_NAMES[intent.weekday ?? 1]}, a review of ${target}: moves of 5% or more over five sessions, earnings in the week ahead and trades by members of Congress`;
    }
    case "sec_filing":
      return `when ${filingWhen(intent.filings ?? undefined, who, subject.kind === "any")}`;
    case "news_change":
      return `when ${newsWatchPhrase(intent.news ?? "any", subject.kind === "tickers" && subject.stocks.length === 1 && !short ? subject.stocks[0].name : who)}`;
  }
}

/**
 * The one price a buy or sell watch can name (owner rule 8: a call shows only its own level): the sell-some price of
 * a Sell some call, the buy-more price of a Buy more call, for one stock the plan covers. Null otherwise.
 */
function oneLevel(subject: Subject, intent: Intent, side: "buy" | "sell"): number | null {
  if (subject.kind !== "tickers" || subject.stocks.length !== 1) return null;
  const call = intent.calls?.[subject.stocks[0].ticker];
  if (!call || call.locked) return null;
  const level = side === "sell" ? (call.call === "Trim" ? call.trim_above : null) : call.call === "Add" ? call.add_below : null;
  return level != null && Number.isFinite(level) && level > 0 ? level : null;
}

/**
 * A sell watch on one stock whose call is already Sell some but has no price it can watch (none set, or not on this
 * plan): there is nothing left to wait for but a change of the call, so that is what is watched and said.
 */
function alreadySelling(intent: Intent): boolean {
  if (intent.kind !== "sell_zone" || intent.stocks.length !== 1) return false;
  const call = intent.calls?.[intent.stocks[0].ticker];
  return call?.call === "Trim" && (call.locked || !(call.trim_above != null && call.trim_above > 0));
}

/** One stock we looked up whose call has no sell-some price today: Keep, Buy more, no call yet, or not on this plan. */
function noSellPrice(subject: Subject, intent: Intent): boolean {
  if (subject.kind !== "tickers" || subject.stocks.length !== 1) return false;
  const call = intent.calls?.[subject.stocks[0].ticker];
  return Boolean(call) && oneLevel(subject, intent, "sell") == null;
}

/**
 * The read-back for one stock whose call we looked up, at most 20 words: "Oracle has no sell-some price right now;
 * I'll tell you if our call turns to Sell some." When the call is already Sell some, it says so first.
 */
function sellLead(subject: Subject, intent: Intent): string | null {
  if (subject.kind !== "tickers" || subject.stocks.length !== 1) return null;
  const stock = subject.stocks[0];
  const call = intent.calls?.[stock.ticker];
  if (!call) return null;
  const level = oneLevel(subject, intent, "sell");
  if (call.call === "Trim" && level != null) return `Our call on ${stock.name} is already Sell some; I'll tell you when it reaches our sell-some price (${money(level)}).`;
  return `${stock.name} has no sell-some price right now; I'll tell you if our call turns to Sell some.`;
}

function noteFor(kind: WatchKind, subject: Subject, intent: Intent): string | null {
  const notes: string[] = [];
  const single = subject.kind === "tickers" && subject.stocks.length === 1 ? subject.stocks[0] : null;
  if (intent.stand_in) {
    notes.push(`I'll watch ${intent.stand_in.ticker}, the fund that tracks ${intent.stand_in.said}, since agents watch stocks and funds rather than the index itself.`);
  }
  if (kind === "price_below" || kind === "price_above") {
    const level = intent.level ?? 0;
    const price = single?.price ?? null;
    if (price != null && (level > price * 3 || level < price / 3)) {
      notes.push(`That's far from where ${single!.name} trades now, so check the number.`);
    } else if (price != null && kind === "price_below" && price < level) {
      notes.push(`${single!.name} is already below ${money(level)}, so you'll hear only after it climbs back above and closes below again.`);
    } else if (price != null && kind === "price_above" && price > level) {
      notes.push(`${single!.name} is already above ${money(level)}, so you'll hear only after it falls back below and closes above again.`);
    }
  }
  if (kind === "daily_move") {
    if (intent.folded_pcts?.length) {
      notes.push(`You asked about moves of ${[...intent.folded_pcts, intent.pct ?? 5].sort((a, b) => b - a).map(pctText).join(" and ")}, so one agent at ${pctText(intent.pct ?? 5)} covers them all.`);
    }
    if (intent.pct == null) notes.push("You didn't say how big a move, so I picked 5%. Type a number to change it.");
    if (intent.direction === "down" && !intent.folded_pcts?.length) notes.push("You asked about drops. Agents count a move either way, so you'll hear about rises that big too.");
    if (intent.direction === "up" && !intent.folded_pcts?.length) notes.push("You asked about rises. Agents count a move either way, so you'll hear about drops that big too.");
  }
  if ((kind === "price_below" || kind === "price_above" || kind === "daily_move") && intent.intraday) {
    notes.push("Agents read each day's closing price, so you'll hear after the market closes, not the moment it happens.");
  }
  if (kind === "fund_13f") {
    if (intent.person) notes.push(`This one covers every fund we track. To follow only ${intent.person}, use “Tell me when they trade” on its page.`);
    if (intent.side) {
      notes.push("13F filings list each fund's biggest changes, but agents can't yet tell a sale from a purchase, so you'll hear about every new filing from a fund we track.");
    }
    notes.push("Funds file these four times a year, up to 45 days after each quarter ends.");
  }
  if (kind === "congress_trade" && intent.person) {
    notes.push(`This one covers every member of Congress. To follow only ${intent.person}, use “Tell me when they trade” on their page.`);
  }
  // Purchases alone are watched (the trigger's `side`); sales alone are not, so a sale watch reports both.
  if ((kind === "congress_trade" || kind === "insider_trade") && intent.side === "sell") {
    notes.push("You asked about sales. Agents can watch purchases alone or every trade, so you'll hear about both.");
  }
  if (kind === "congress_trade") {
    notes.push("Members have up to 45 days to disclose a trade, so you'll hear when it's disclosed, not when it happened.");
  }
  if (kind === "buy_zone" && oneLevel(subject, intent, "buy") == null) notes.push("Only stocks with a research call have a buy price.");
  if (kind === "sell_zone") {
    const level = oneLevel(subject, intent, "sell");
    const price = single?.price ?? null;
    if (level != null && price != null && price >= level) {
      notes.push(`${single!.name} is already above ${money(level)}, so you'll hear only after it dips back below and closes above again.`);
    }
  }
  if (kind === "sec_filing") {
    const filter = intent.filings ?? null;
    if (intent.shelf) notes.push("Shelf offerings on form S-3 aren't collected yet, so this watches S-1 offerings only.");
    if (filter?.items?.includes("5.02")) notes.push("Executive changes on an 8-K include routine board seats and pay plans, so some will be minor.");
    if (filter?.major) notes.push("Results, routine 8-Ks and executive changes are left out, so for most companies this is a few times a year.");
    else if (!filter?.forms?.length) notes.push("That covers 8-Ks, 10-Qs, 10-Ks, share offerings and activist stakes, about one or two a month for a big company. Funds' routine passive-stake reports (13G) are left out.");
    notes.push("You'll hear after the close on the day it's filed, with a link to the filing on the SEC's site.");
  }
  if (kind === "news_change") {
    if (intent.topic) notes.push("Agents can't pick out one kind of story, so you'll hear when the news gets much heavier or turns one way, whatever it's about.");
    notes.push("You'll hear after the close, with the biggest story to read.");
  }
  return notes.length ? notes.join(" ") : null;
}

/** `alone`: the whole read-back when this is the only watch, for the ones that read better said their own way. */
type BuiltWatch = PlainWatch & { subject: Subject; alone?: string | null };

const TEMPLATE_OF: Record<WatchKind, string> = {
  price_below: "price-level",
  price_above: "price-level",
  daily_move: "big-move",
  earnings_before: "earnings-ahead",
  earnings_out: "earnings-out",
  fund_13f: "fund-filing",
  congress_trade: "congress-trade",
  insider_trade: "insider-trade",
  movers_list: "mover",
  buy_zone: "buy-zone",
  sell_zone: "sell-zone",
  call_change: "call-change",
  daily_check: "morning-check",
  weekly_review: "weekly-review",
  sec_filing: "sec-filing",
  news_change: "news",
};

function subjectFor(intent: Intent): Subject {
  if (intent.stocks.length > 0) return { kind: "tickers", stocks: intent.stocks.slice(0, MAX_SCOPE_TICKERS) };
  if (intent.mine) return { kind: "watchlist", stocks: [] };
  const filings = intent.kind === "fund_13f" || intent.kind === "congress_trade" || intent.kind === "insider_trade";
  // "Tell me when a fund files a 13F" with no stock named means any filing; insiders default to your names (any is every company).
  if (filings && (intent.every || intent.kind !== "insider_trade")) return { kind: "any", stocks: [] };
  // "Tell me when any company files an S-1": market-wide only for offerings and big stakes, which are rare.
  if (intent.kind === "sec_filing" && intent.every && filingFilterAllowsAnyStock(intent.filings ?? undefined)) return { kind: "any", stocks: [] };
  return { kind: "watchlist", stocks: [] };
}

/** One intent to zero or more validated watches, or the reason it can't be watched. */
function buildIntent(intent: Intent, ctx: BuildContext): { watches: BuiltWatch[]; cannot: PlainCannot[] } {
  const hidden = ctx.hidden ?? hiddenTemplateIds();
  const out: { watches: BuiltWatch[]; cannot: PlainCannot[] } = { watches: [], cannot: [] };

  if (intent.kind === "earnings_out" && hidden.includes("earnings-out")) {
    const who = intent.stocks.length ? listStockNames(intent.stocks) : null;
    const verb = intent.stocks.length === 1 ? "reports" : "report";
    out.cannot.push(cannot("earnings_out_off", null, { suggest: who ? `Tell me 3 days before ${who} ${verb} earnings` : "Tell me 3 days before my stocks report earnings" }));
    return out;
  }
  if (intent.kind === "price_below" || intent.kind === "price_above") {
    const level = intent.level;
    if (level == null || !Number.isFinite(level) || level <= 0 || level > 1_000_000) {
      out.cannot.push(cannot("out_of_range", null, { detail: "enter the price to watch as a number, like 150." }));
      return out;
    }
    if (intent.stocks.length === 0) {
      out.cannot.push(cannot("no_stock", null));
      return out;
    }
    if (intent.stand_in && intent.stocks.length === 1 && intent.stocks[0].ticker === intent.stand_in.ticker) {
      const { said, ticker } = intent.stand_in;
      out.cannot.push(
        cannot("other", null, {
          detail: `agents watch ${ticker}, the fund that tracks ${said}, and its price is not the index level. A move works instead, like “${said} drops 2%”.`,
          suggest: `Tell me when ${said} drops 2%`,
        }),
      );
      return out;
    }
  }
  if (intent.kind === "daily_move" && intent.pct != null && (intent.pct < 1 || intent.pct > 50)) {
    out.cannot.push(cannot("out_of_range", `${pctText(intent.pct)} in a day`, { detail: "agents watch daily moves between 1% and 50%." }));
    return out;
  }
  if (intent.kind === "earnings_before" && intent.days != null && (intent.days < 1 || intent.days > 14)) {
    out.cannot.push(cannot("out_of_range", null, { detail: "agents can tell you between 1 and 14 days before earnings." }));
    return out;
  }

  // A price level is one stock per agent; everything else watches the list together.
  const subjects: Subject[] =
    intent.kind === "price_below" || intent.kind === "price_above"
      ? intent.stocks.map((stock) => ({ kind: "tickers" as const, stocks: [stock] }))
      : [subjectFor(intent)];

  // "When to sell Oracle" when our call on Oracle is already Sell some, with no price to watch: watch the call instead.
  const selling = alreadySelling({ ...intent, calls: ctx.calls });
  if (selling) intent = { ...intent, kind: "call_change", to: null };

  for (const subject of subjects) {
    const settled: Intent = { ...intent, pct: intent.pct ?? 5, days: intent.days ?? 3, weekday: intent.weekday ?? 1, calls: ctx.calls };
    const trigger: Record<string, unknown> = {
      rule: intent.kind === "price_above" ? "crosses_above" : "crosses_below",
      level: settled.level,
      pct: settled.pct,
      days_before: settled.days,
      weekday: settled.weekday,
      filings: intent.filings ?? undefined,
      news: intent.news ?? undefined,
      to: intent.to ?? undefined,
      // "When insiders buy NVDA": only purchases (Congress and Form 4 only; a 13F filing is one report either way).
      side: (intent.kind === "congress_trade" || intent.kind === "insider_trade") && intent.side === "buy" ? "buy" : undefined,
    };
    const parsed = parseJobDraft(
      { template: TEMPLATE_OF[intent.kind], name: jobName(intent.kind, subject, settled), scope: scopeOf(subject), trigger },
      { hidden },
    );
    if (!parsed.ok) {
      out.cannot.push(cannot("other", null, { detail: parsed.error.charAt(0).toLowerCase() + parsed.error.slice(1) }));
      continue;
    }
    // Tell the person what the job will actually do, which parseJobDraft may have narrowed.
    const effective: Subject =
      parsed.draft.scope.kind === "tickers" ? subject : { kind: parsed.draft.scope.kind, stocks: [] };
    const full = watchLine(intent.kind, effective, settled, false);
    out.watches.push({
      draft: parsed.draft,
      line: watchLine(intent.kind, effective, settled, true),
      full,
      // The intent as read (a size left out is noted as picked), with our calls for the price it names.
      note: noteFor(intent.kind, effective, { ...intent, calls: ctx.calls }),
      subject: effective,
      // "I'll tell you when Oracle reaches our sell-some price ($250) or our call turns to Sell some."
      alone: selling
        ? `Our call on ${intent.stocks[0].name} is already Sell some; I'll tell you when it changes.`
        : intent.kind === "sell_zone"
          ? sellLead(effective, settled) ?? `I'll tell you ${full}.`
          : intent.kind === "buy_zone" && oneLevel(effective, settled, "buy") != null
            ? `I'll tell you ${full}.`
            : null,
    });
  }
  return out;
}

function draftKey(draft: AgentJobDraft): string {
  return JSON.stringify({ template: draft.template, trigger: draft.trigger, scope: draft.scope });
}

function sameSubject(a: Subject, b: Subject): boolean {
  return a.kind === b.kind && a.stocks.map((s) => s.ticker).join(",") === b.stocks.map((s) => s.ticker).join(",");
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Validate what a reader understood and write the preview. */
export function buildSpec(input: string, intents: Intent[], cannots: PlainCannot[], via: PlainSpec["via"], ctx: BuildContext = {}): PlainSpec {
  const watches: BuiltWatch[] = [];
  const blocked: PlainCannot[] = [...cannots];
  const seen = new Set<string>();
  for (const intent of intents) {
    const built = buildIntent(intent, ctx);
    blocked.push(...built.cannot);
    for (const watch of built.watches) {
      const key = draftKey(watch.draft);
      if (seen.has(key)) continue;
      seen.add(key);
      watches.push(watch);
    }
  }
  if (watches.length > MAX_WATCHES) {
    watches.length = MAX_WATCHES;
    blocked.push(cannot("too_many", null));
  }
  // The same reason twice reads like a stutter.
  const lines = new Set<string>();
  const cannot_ = blocked.filter((entry) => (lines.has(entry.line) ? false : (lines.add(entry.line), true)));
  // "I couldn't find XYZ" already explains why a price level had no stock.
  if (cannot_.some((entry) => entry.code === "not_a_us_stock")) {
    for (let i = cannot_.length - 1; i >= 0; i -= 1) if (cannot_[i].code === "no_stock") cannot_.splice(i, 1);
  }
  if (watches.length === 0 && cannot_.length === 0) cannot_.push(cannot("unclear", null));

  const first = watches[0]?.subject;
  const shared = first && first.kind !== "any" && watches.every((watch) => sameSubject(watch.subject, first)) ? first : null;
  const subjectName = shared
    ? shared.kind === "tickers"
      ? shared.stocks.length === 1
        ? `${shared.stocks[0].name}${shared.stocks[0].name !== shared.stocks[0].ticker ? ` (${shared.stocks[0].ticker})` : ""}`
        : listStockNames(shared.stocks)
      : "the stocks you track"
    : null;
  const schedulesOnly = watches.length > 0 && watches.every((watch) => watch.draft.trigger.type === "schedule");

  let lead = "";
  let sentence = "";
  if (watches.length === 1) {
    const only = watches[0];
    if (schedulesOnly) {
      // "every Monday, a review of …" becomes "Every Monday, I'll send you a review of …".
      lead = `${capitalise(only.full.replace(/^(every [^,]+), (.*)$/, "$1, I'll send you $2"))}.`;
    } else if (only.alone) {
      lead = only.alone;
    } else if (shared) {
      lead = `I'll watch ${subjectName} and tell you ${only.line}.`;
    } else {
      lead = `I'll tell you ${only.full}.`;
    }
    sentence = lead;
  } else if (watches.length > 1) {
    const items = watches.map((watch) => (shared && watch.draft.trigger.type !== "schedule" ? watch.line : watch.full));
    lead = shared && !schedulesOnly ? `I'll watch ${subjectName} and tell you:` : "I'll tell you:";
    sentence = `${lead.replace(/:$/, "")} ${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}.`;
  }

  const stocks: PlainStock[] = [];
  for (const watch of watches) for (const stock of watch.subject.stocks) if (!stocks.some((s) => s.ticker === stock.ticker)) stocks.push(stock);

  return {
    input,
    via,
    lead,
    sentence,
    watches: watches.map(({ subject: _subject, alone: _alone, ...watch }) => ({
      ...watch,
      // In a list under a shared subject the short form reads right; otherwise the full one.
      line: shared && watch.draft.trigger.type !== "schedule" ? watch.line : watch.full,
    })),
    cannot: cannot_,
    stocks,
    uses_watchlist: watches.some((watch) => watch.draft.scope.kind === "watchlist"),
  };
}

/* ── the rules ──────────────────────────────────────────────────────────── */

type Span = { start: number; end: number };

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
// A number followed by these is not a price.
const NOT_PRICE = String.raw`(?![\d,.]*\s*(?:%|percent\b|per\s*cent\b|pct\b|days?\b|weeks?\b|months?\b|years?\b|x\b|times\b|sessions?\b|trading days?\b))`;

const LEVEL_PREP_RE = new RegExp(
  String.raw`\b(?:(drops?|dropped|dipp?(?:ed|s)?|falls?|fell|sinks?|slides?|slips?|tanks?|declines?|goes|gets|is|trades?|closes?|moves?|rises?|climbs?|jumps?|breaks?|stays?|ends?)\s+)?(below|under|beneath|lower than|less than|sub|south of|above|over|past|higher than|more than|beyond|north of)\s+\$?\s?${NUM}${NOT_PRICE}`,
  "gi",
);
// "falls to 150" is a level, "falls $5" is a move in dollars (which agents don't watch): a direction needs "to".
const LEVEL_VERB_RE = new RegExp(
  String.raw`\b(drops?|dropped|dips?|dipped|falls?|fell|sinks?|slides?|slips?|tanks?|declines?|rises?|rose|climbs?|jumps?|rall(?:y|ies)|gets|goes|gets back|goes back)\s+(?:back\s+)?(?:to|at)\s+\$?\s?${NUM}${NOT_PRICE}|\b(tops?|hits?|reach(?:es)?|touch(?:es)?|cross(?:es)?|breaks?|trades? at|is at)\s+(?:back\s+)?(?:to\s+|at\s+)?\$?\s?${NUM}${NOT_PRICE}`,
  "gi",
);
const LEVEL_SIGN_RE = new RegExp(String.raw`(<|>)=?\s*\$?\s?${NUM}${NOT_PRICE}`, "g");
const BARE_NUMBER_RE = new RegExp(String.raw`^\s*(?:to\s+|at\s+)?\$?\s?${NUM}\s*(?:dollars?|bucks)?\s*$`, "i");
const STARTER_RE = /\b(?:tell|let|ping|alert|notify|warn|remind|text|email|message|before|after|when|if|whenever|once)\b/i;
const PCT_RE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s*cent\b|pct\b)/gi;
const BIG_MOVE_RE =
  /\b(?:big|large|huge|major|sharp|wild|massive)\s+(?:moves?|swings?|drops?|jumps?|falls?|rises?|days?|declines?)\b|\bmoves? (?:a lot|sharply|big)\b|\bswings? (?:a lot|hard)\b|\b(?:tanks?|tanked|crash(?:es|ed)?|plunges?|plunged|soars?|soared|spikes?|spiked|craters?|cratered)\b/gi;
const DOWN_RE = /\b(?:drops?|dropped|falls?|fell|down|loses?|lost|sinks?|tanks?|tanked|crash(?:es|ed)?|plunges?|plunged|declines?|dips?|slides?|slumps?|tumbles?|craters?)\b/i;
const UP_RE = /\b(?:rises?|rose|jumps?|jumped|up|gains?|surges?|rall(?:y|ies)|soars?|soared|pops?|climbs?|spikes?|spiked)\b/i;
const EITHER_RE = /\beither way\b|\bboth ways\b|\bany direction\b|\bmoves?\b|\bswings?\b|\bchanges?\b/i;
const MULTI_DAY_RE = /\b(?:in|over|within|across)\s+(?:a|one|the|\d+|two|three|four|five)\s+(?:weeks?|months?|years?|sessions)\b|\bthis (?:week|month|year)\b|\bweek over week\b|\bmonth over month\b|\bfrom (?:last|a) (?:week|month|year)\b|\bweekly\b/gi;
const COST_RE = /\bwhat i paid\b|\bmy (?:cost(?: basis)?|entry(?: price)?|buy(?:ing)? price|purchase price|average(?: cost| price)?|avg)\b|\bsince i bought\b|\bfrom (?:my )?cost\b|\bbreak[- ]?even\b|\bmy gains?\b|\bmy loss(?:es)?\b/gi;

const EARNINGS_RE = /\bearnings?\b|\bquarterly (?:results|report|numbers)\b|\b(?:its|their) (?:results|numbers|quarter)\b|\bresults\b|\bq[1-4]\b/gi;
const REPORTS_RE = /\breports?\b|\breporting\b/gi;
const AHEAD_RE = /\bbefore\b|\bahead\b|\bcoming up\b|\bupcoming\b|\bsoon\b|\bprior to\b|\bheads[- ]up\b|\bapproach\w*\b|\bin advance\b|\bdays? (?:out|early)\b|\bremind\b/i;
const DAYS_AHEAD_RE =
  /\b(\d{1,2}|a|an|one|two|three|four|five|six|seven|a few|few|a couple of|couple of|a couple)\s+(days?|weeks?|business days?|trading days?|market days?)\s+(?:before|ahead|early|prior|in advance|out)\b|\b(the day|the week|the night)\s+before\b/i;
const OUT_RE = /\bafter\b|\bonce\b|\bas soon as\b|\breported\b|\bcomes? out\b|\bare out\b|\bbeats?\b|\bmiss(?:es)?\b|\bresults\b|\bwhen\b/i;

const FUND_RE =
  /\b(?:hedge\s+)?funds?\b|\b13-?f\b|\binstitution(?:s|al)?(?:\s+investors?)?\b|\bbig money\b|\bsmart money\b|\bwhales?\b|\bmoney managers?\b|\bsuperinvestors?\b|\bguru(?:s)?\b/gi;
const CONGRESS_RE =
  /\bcongress(?:ional)?\b|\bcongressm[ae]n\b|\bcongresswom[ae]n\b|\bsenators?\b|\bsenate\b|\bpoliticians?\b|\blawmakers?\b|\bhouse members?\b|\bmembers? of (?:congress|the house)\b|\bnancy pelosi\b|\bpelosi\b/gi;
const PERSON_RE = /\b(?:[Ss]enator|[Ss]en\.|[Rr]ep\.|[Rr]epresentative|[Cc]ongress(?:wo)?man)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
const KNOWN_MEMBERS: Array<[RegExp, string]> = [[/\b(?:nancy\s+)?pelosi\b/i, "Nancy Pelosi"]];
const INSIDER_RE =
  /\binsiders?\b|\bexecutives?\b|\bexecs?\b|\bceo\b|\bcfo\b|\bcoo\b|\bfounders?\b|\bdirectors?\b|\bboard members?\b|\bthe board\b|\bmanagement\b|\bform\s*4\b/gi;
const SELL_RE = /\b(?:sells?|sold|selling|dumps?|dumped|dumping|exits?|exited|cuts?|trims?|trimmed|reduces?|unloads?|offloads?)\b/i;
const BUY_RE = /\b(?:buys?|bought|buying|adds? to|added|loads? up|accumulates?|takes? a (?:stake|position)|opens? a position)\b/i;
const TRADE_WORD_RE = /\b(?:sells?|sold|selling|dumps?|dumped|dumping|exits?|exited|cuts?|trims?|trimmed|reduces?|unloads?|buys?|bought|buying|adds?|added|trades?|traded|trading|loads? up|accumulates?|takes? a (?:stake|position)|discloses?|disclosed|moves? on|touch(?:es)?)\b/gi;

const MOVERS_RE = /\bmovers?(?: list)?\b|\btop (?:gainers|losers)\b|\bbiggest (?:gainers|losers)\b/gi;
const BUY_ZONE_RE =
  /\bbuy(?:ing)?[- ](?:zone|range|level|point)\b|\b(?:your|our|the) buy price\b|\badd(?:ing)?[- ](?:zone|level|price)\b|\b(?:good|great|right|fair|cheap) (?:price|time|moment|level|point) to (?:buy|add)\b|\bworth buying\b|\bgets? cheap\b|\bon sale\b/gi;

const DAILY_RE =
  /\bevery (?:morning|day|market day|weekday|trading day|evening|night)\b|\beach (?:morning|day|market day|trading day)\b|\bdaily (?:summary|digest|check|update|recap|brief|report|email|rundown)\b|\bmorning (?:summary|digest|check|update|recap|brief|report|email|rundown)\b|\bonce a day\b|\bsum(?:marise|marize| up) (?:my|each|every) day\b/gi;
const WEEKLY_RE =
  /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)\b|\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)s\b|\bonce a week\b|\bend of (?:the |each |every )?week\b|\bweekly (?:summary|recap|review|digest|update|check|email|rundown)\b|\bsum(?:marise|marize| up) (?:my|the|each|every) week\b|\bweek in review\b/gi;
const SUMMARY_RE = /\b(?:summary|summarise|summarize|sum up|recap|digest|rundown|round[- ]?up)\b/i;

// One kind of story, which agents can't pick out. The news as a whole is NEWS_WORD_RE.
const NEWS_RE =
  /\bpress releases?\b|\btweets?\b|\btweeted\b|\breddit\b|\bposts? about\b|\bmentions?(?:ed)?\b|\brumou?rs?\b|\bannounce(?:s|d|ment|ments)?\b|\bfda\b|\bapprovals?\b|\bmergers?\b|\bacquisitions?\b|\bacquires?\b|\bbuyouts?\b|\blawsuits?\b|\blayoffs?\b|\bguidance\b|\bstock splits?\b|\bbuybacks?\b|\bbankrupt\w*\b|\brecalls?\b|\bceo (?:leaves|quits|resigns|steps down)\b/gi;
const NEWS_WORD_RE = /\bnews\b|\bheadlines?\b|\barticles?\b|\bstories\b|\bstory\b|\bcoverage\b|\bmedia\b|\bpress\b|\btalked about\b|\bbuzz(?:ing)?\b/gi;
const NEWS_NEGATIVE_RE = /\bnegative\w*|\bbad\b|\bbearish\b|\bsour(?:s|ed)?\b|\bugly\b|\bworse\b|\bgloomy\b|\bturns? (?:on|against)\b/gi;
const NEWS_POSITIVE_RE = /\bpositive\w*|\bgood\b|\bbullish\b|\bgreat\b|\bupbeat\b|\bbetter\b/gi;
const NEWS_BUSY_RE =
  /\bheav(?:y|ier)\b|\bmore than usual\b|\bmore than normal\b|\bunusual(?:ly)?\b|\bspikes?\b|\bsurges?\b|\ba lot\b|\blots\b|\bbusy\b|\bblows? up\b|\bexplodes?\b|\ball over\b|\bpicks? up\b|\btrending\b|\bflood(?:ed|s)?\b/gi;
const NEWS_TURN_RE = /\bturns?\b|\bturned\b|\bgets?\b|\bgoes\b|\bis\b|\bthere'?s\b|\bthere is\b|\babout\b|\bon\b|\bclearly\b|\breally\b|\bsuddenly\b|\bthan usual\b|\bthe\b/gi;

// SEC filings. A form named outright ("8-K", "10-K") is always a filing watch; "files" alone is one unless a
// fund, an insider or Congress is doing the filing (those are their own agents).
const FORM_TOKEN_RE = /\b8-?k\b|\b10-?k\b|\b10-?q\b|\bs-?1\b|\bs-?3\b|\b13-?d\b|\b13-?g\b|\bschedule 13[dg]?\b/gi;
const FILE_RE = /\bfil(?:es|ed|ing|ings|e)\b|\bwith the sec\b|\bsec\b|\bedgar\b/gi;
const FORM_WORDS: Array<[RegExp, FilingGroup]> = [
  [/\b8-?k\b|\bcurrent reports?\b/gi, "8-K"],
  [/\b10-?k\b|\bannual (?:reports?|filings?)\b/gi, "10-K"],
  [/\b10-?q\b|\bquarterly (?:reports?|filings?)\b/gi, "10-Q"],
  [/\bs-?1\b|\bs-?3\b|\b(?:share |stock |secondary )?offerings?\b|\bsells? (?:new )?shares\b|\bdilut\w*|\bregistration\b/gi, "S-1"],
  [/\b13-?d\b|\b13-?g\b|\bschedule 13[dg]?\b|\bactivists?\b|\b(?:5%|five percent|big|large) stakes?\b|\bstakes? (?:of|above|over) (?:more than )?5%/gi, "13D/G"],
];
const FILING_ITEMS: Array<[RegExp, string]> = [
  [/\bdeals?\b|\bagreements?\b|\bcontracts?\b|\bpartnerships?\b/gi, "1.01"],
  [/\bbankrupt\w*|\bchapter 11\b|\breceivership\b/gi, "1.03"],
  [/\bcyber\w*|\bhack(?:s|ed)?\b|\b(?:data )?breach(?:es)?\b/gi, "1.05"],
  [/\bacqui(?:res?|red|ring|sitions?)\b|\bmergers?\b|\bbuys? (?:a|another) company\b|\bsells? (?:a|its) (?:unit|division|business)\b/gi, "2.01"],
  [/\bresults\b|\bearnings?\b/gi, "2.02"],
  [/\bdebt\b|\bborrow\w*|\bloans?\b|\bbonds?\b/gi, "2.03"],
  [/\brestructur\w*|\blayoffs?\b|\bjob cuts\b/gi, "2.05"],
  [/\bimpairments?\b|\bwrite-?(?:downs?|offs?)\b/gi, "2.06"],
  [/\bdelist\w*/gi, "3.01"],
  [/\bauditors?\b/gi, "4.01"],
  [/\brestat\w*/gi, "4.02"],
  [/\bchange (?:in|of) control\b|\btakeover\b/gi, "5.01"],
  [
    /\b(?:officers?|executives?|execs?|directors?|ceo|cfo|coo|board|management|leadership)(?: (?:changes?|change-ups?|shake-?ups?|departures?|leaves|quits|resigns|steps down|appointments?))?\b|\bresign(?:s|ation)?\b|\bsteps? down\b/gi,
    "5.02",
  ],
  [/\bshareholder (?:votes?|meetings?)\b|\bvote results\b/gi, "5.07"],
];
const MAJOR_RE = /\b(?:something|anything)\s+(?:big|major|important|material|significant|serious)\b|\b(?:big|major|important|material|significant)\s+(?:filings?|forms?|news from the sec)\b/gi;
const FILING_GLUE_RE = /\bnew\b|\ba\b|\ban\b|\bits\b|\btheir\b|\babout\b|\bon\b|\bwith\b|\bform\b|\bforms\b|\bsomething\b|\banything\b|\breports?\b|\bthe sec\b|\bchanges?\b|\bfor\b/gi;
const INTRADAY_RE =
  /\bintra-?day\b|\bduring the day\b|\breal[- ]?time\b|\bthe (?:moment|second|minute|instant)\b|\bimmediately\b|\bright away\b|\binstantly\b|\bpre-?market\b|\bafter[- ]hours\b|\bevery (?:minute|hour)\b|\bhourly\b|\blive\b/gi;
const CHART_RE =
  /\bmoving averages?\b|\b\d+[- ]?day (?:ma|sma|ema|average|moving average)\b|\b(?:50|100|200)[- ]?(?:dma|sma|ema)\b|\brsi\b|\bmacd\b|\bbollinger\b|\bvolume\b|\b(?:all[- ]time|52[- ]week|yearly|annual|record)\s+(?:highs?|lows?)\b|\bnew (?:highs?|lows?)\b|\bgolden cross\b|\bdeath cross\b|\boversold\b|\boverbought\b|\bsupport\b|\bresistance\b|\bvolatility\b|\bvix\b|\bshort interest\b|\bunusual options\b|\boptions? (?:flow|activity|volume)\b|\bimplied volatility\b|\bgaps? (?:up|down)\b/gi;
const FUNDAMENTALS_RE = /\bp\/?e(?: ratio)?\b|\bvaluation\b|\bmarket (?:cap|value)\b|\bprice to (?:earnings|sales|book)\b|\bdebt\b|\bmargins?\b|\brevenue\b|\bcash flow\b/gi;
const ANALYST_RE = /\banalysts?\b|\bupgrade[sd]?\b|\bdowngrade[sd]?\b|\bprice targets?\b|\b(?:buy|sell|hold) ratings?\b|\bratings?\b|\bwall street\b/gi;
// Our call on a stock changing ("tell me when your call on NVDA changes"), which is a watch, not a refusal.
const CALL_RE =
  /\b(?:your|our|the|its|stocksbrew'?s?) (?:call|rating|verdict|recommendation|stance)s?\b(?!\s+(?:options?|spreads?|premiums?|volume|sweeps?))|\bcalls? chang\w*\b|\bchanges? (?:the|its|your|our) call\b|\bflips? to (?:add|trim|hold|buy|sell|keep)\b/gi;
// "…turns to Sell some": the call it should change to.
const CALL_TO_RE =
  /\b(?:(?:turns?|turned|flips?|flipped|changes?|changed|moves?|moved|goes|went|switch(?:es|ed)?|gets?)\s+(?:to|into)|(?:is|becomes?|says)(?:\s+(?:to|a))?)\s+(buy more|buy|add|accumulate|keep|hold|sell some|sell|trim|reduce|avoid)\b/gi;
// "What's your call on Oracle?" is a question; a watch needs the call to change.
const CHANGE_WORD_RE = /\bchang\w*|\bflip\w*|\bturns?\b|\bturned\b|\bswitch\w*|\bmoves?\b|\bmoved\b|\bupdat\w*|\bdifferent\b|\bgoes\b|\bbecomes?\b|\bis (?:a )?(?:buy|sell|keep|hold|trim|add)/i;
const CALL_GLUE_RE = /\b(?:on|for|changes?|changed|changing|turns?|turned|flips?|flipped|moves?|moved|goes|switch(?:es|ed)?|updates?|updated|different)\b/gi;

// Asking WHEN to sell or buy is a request for a signal, never a trade: "tell me when to sell ORCL", "when should I
// sell oracle", "let me know when it's time to sell NVDA", "when to trim AMD", "anything I own hits a sell price".
const ASK_LEAD = String.raw`(?:when|if|once)\s+(?:(?:i|we)\s+should|should\s+(?:i|we)|(?:i|we)\s+(?:need|ought|have)\s+to|(?:it'?s|it\s+is|is\s+it|its)\s+(?:a\s+good\s+|the\s+right\s+|the\s+best\s+|the\s+)?time\s+to|(?:it'?s|it\s+is)\s+(?:a\s+good\s+(?:idea|moment)|smart|worth\s+it)\s+to|(?:is\s+)?(?:a\s+)?good\s+(?:time\s+)?to|to)\s+`;
const SELL_VERBS = String.raw`(?:sell|trim|take\s+(?:some\s+)?profits?|cash\s+out|exit|get\s+out|dump|unload|lighten\s+up|reduce)`;
const BUY_VERBS = String.raw`(?:buy|add|get\s+in|load\s+up|accumulate|pick\s+up)`;
const BOTH_VERBS = String.raw`(?:buy_(?:or|and)_sell|sell_(?:or|and)_buy|buy\/sell|sell\/buy)`;
const ASK_TAIL = String.raw`(?:\s+(?:some|a\s+bit|part|half|more))?(?:\s+(?:of|on|to|into))?(?:\s+(?:my|it|them|some|more))?\b`;
const SELL_ASK_RE = new RegExp(
  String.raw`\b${ASK_LEAD}(?:${SELL_VERBS}|${BOTH_VERBS})${ASK_TAIL}|\b(?:good|right|best)\s+(?:time|moment|point|price)\s+to\s+${SELL_VERBS}\b|\btime\s+to\s+${SELL_VERBS}${ASK_TAIL}|(?<!\bmy\s)\bsell(?:[- ]some)?\s+(?:signals?|zones?|prices?|levels?|points?|targets?)\b|\bshould\s+(?:i|we)\s+${SELL_VERBS}${ASK_TAIL}|\b(?:worth|time)\s+selling\b`,
  "gi",
);
const BUY_ASK_RE = new RegExp(
  String.raw`\b${ASK_LEAD}(?:${BUY_VERBS}|${BOTH_VERBS})${ASK_TAIL}|\btime\s+to\s+${BUY_VERBS}${ASK_TAIL}|(?<!\bmy\s)\bbuy(?:[- ]more)?\s+(?:signals?|prices?)\b|\bshould\s+(?:i|we)\s+${BUY_VERBS}${ASK_TAIL}|\b(?:is|gets?|looks?|goes)\s+cheap\b|\bcheap\s+enough\b`,
  "gi",
);
// A clause that does something to a stock ("add NVDA to my watchlist", "buy NVDA now") rather than naming more of them.
const ACTION_RE = /^\s*(?:please\s+)?(?:add|put|remove|delete|drop|buy|sell|short|purchase|dump)\b/i;
// After "tell me when to sell ORCL", "…and buy NVDA" is the same kind of ask, not an order. Not "…and add NVDA to my
// watchlist", and not an order in so many words ("buy NVDA now", "buy it for me").
const FOLLOW_ASK_RE = new RegExp(String.raw`^\s*(?:(sell|trim)|(buy(?:\s+more)?))${ASK_TAIL}(?!.*\b(?:now|today|right away|for me|immediately)\b)`, "i");
const DIVIDEND_RE = /\bdividends?\b|\bpayouts?\b|\bex-?div\w*\b|\byield\b/gi;
const TRADING_RE =
  /\b(?:buy|sell|short|trade|purchase)\b[^.,;]{0,25}\bfor me\b|\b(?:automatically|auto)[- ]?(?:buy|sell|trade)\w*\b|\bplace (?:an? )?(?:order|trade)\b|\bstop[- ]loss\b|\blimit orders?\b|\bexecute\b|^(?:please\s+)?(?:then\s+)?(?:sell|buy|short)\b(?:\s+(?:it|them|all|some|more|my|the|shares?|everything|out))*/gi;
const CRYPTO_RE = /\b(?:bitcoin|btc|ethereum|ether|crypto(?:currenc(?:y|ies))?|dogecoin|doge|solana|xrp|forex|eur\/?usd|gbp\/?usd|futures|gold price|oil price)\b/gi;
const MARKET_RE: Array<[RegExp, string, string]> = [
  [/\b(?:the\s+)?s&p(?:\s*500)?\b|\bspx\b|\bthe (?:stock )?market\b/gi, "SPY", "the S&P 500"],
  [/\b(?:the\s+)?nasdaq(?:\s*100)?\b|\bndx\b/gi, "QQQ", "the Nasdaq 100"],
  [/\bthe dow(?: jones)?\b|\bdow jones\b|\bdjia\b/gi, "DIA", "the Dow"],
];

const MINE_RE =
  /\b(?:anything|something|any(?:\s+of\s+(?:the|my))?\s+(?:stocks?|names?|shares?|holdings?|positions?)|stocks?|names?|shares?|holdings?|positions?|companies|what)\s+(?:that\s+)?i(?:'ve|\s+have)?\s+(?:own|hold|have|track|follow|watch|bought|got)\b|\bmy\s+(?:stocks?|names?|holdings?|portfolio|watch\s?list|positions?|shares?|companies|picks?)\b|\bany of mine\b|\banything (?:in|on) my (?:list|portfolio|watchlist)\b|\bmy (?:list|book)\b/gi;
const EVERY_RE = /\bany (?:stock|company|ticker|name)\b|\banything\b|\banyone\b|\banybody\b|\bwhatever\b|\bany fund\b|\bany trades?\b/i;

const FILLER = new Set(
  (
    "tell me let know ping alert notify warn message email text send give heads up when whenever if once soon as the a an it its it's they them " +
    "their this that these those of to in on at for by from with my mine i i'm i've you your please can could would will should want wanna " +
    "need like just any anything something everything every all each stock stocks share shares name names company companies price prices " +
    "day days time one more than about also really ever get gets got goes go is are be been being was were has have had do does did own " +
    "hold track follow watch portfolio watchlist holdings positions position ticker tickers us our out up down now today tomorrow happen " +
    "happens there what which who how important close closes closing closed or and but so then plus well hey hi hello thanks thank keep eye " +
    "eyes look see make sure right away let's lmk asap yo ok okay again back too very much some ones list someone somebody else fine kinda " +
    "big lot trade trades sells sold sell buys buy bought selling buying here there way new value still actually maybe kind sort before after ahead " +
    "until while whenever possible ever"
  ).split(" "),
);

function collect(source: RegExp, text: string): Array<{ match: RegExpExecArray; span: Span }> {
  const out: Array<{ match: RegExpExecArray; span: Span }> = [];
  // exec on a regex without the g flag never moves on.
  const re = source.global ? source : new RegExp(source.source, `${source.flags}g`);
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    out.push({ match, span: { start: match.index, end: match.index + match[0].length } });
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

function numberOf(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const SMALL_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, "a few": 3, few: 3, "a couple of": 2, "couple of": 2, "a couple": 2 };

function daysAhead(text: string): number | null {
  const match = DAYS_AHEAD_RE.exec(text);
  if (!match) return null;
  if (match[3]) return match[3] === "the week" ? 7 : 1;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : SMALL_NUMBERS[match[1].toLowerCase()] ?? 3;
  return /^week/i.test(match[2]) ? count * 7 : count;
}

const WEEKDAY_INDEX: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };

type Clause = { text: string; start: number };

/** Split on "or", "and", commas and full stops, keeping each piece's offset. */
function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  // A comma inside a number ("1,200") is not a break.
  const re = /\s*(?:(?<!\d),|,(?!\d{3}(?:\D|$))|;|\.(?=\s|$)|\bor\b|\band\b|\balso\b|\bplus\b|\bas well as\b|\bthen\b)\s*/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), start: last });
    last = match.index + match[0].length;
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (last < text.length) out.push({ text: text.slice(last), start: last });
  return out.filter((clause) => clause.text.trim());
}

/** Words that stop "up or down" and "buys or sells" from being split into two requests. */
function prepare(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REQUEST_CHARS)
    // "when to buy or sell NVDA" asks for both signals on NVDA: kept as one piece, before "buy or sell" becomes "trades".
    .replace(/\b(?:when (?:to|should (?:i|we)|(?:i|we) should)|time to|should (?:i|we)) (?:buy|sell) (?:or|and) (?:buy|sell)\b/gi, (m) =>
      m.replace(/ (or|and) (\w+)$/i, "_$1_$2"),
    )
    .replace(/\bup (?:or|and|\/) down\b|\bdown (?:or|and|\/) up\b/gi, (m) => "either way".padEnd(m.length, " "))
    .replace(/\b(buys?|buying|bought) (?:or|and|\/) (sells?|selling|sold)\b|\b(sells?|selling|sold) (?:or|and|\/) (buys?|buying|bought)\b/gi, (m) =>
      "trades".padEnd(m.length, " "),
    )
    .replace(/\babove (?:or|and) below\b|\bbelow (?:or|and) above\b/gi, (m) => "past".padEnd(m.length, " "))
    .replace(/\bbig (?:or|and) small\b/gi, (m) => "any".padEnd(m.length, " "));
}

export type RuleResult = {
  spec: PlainSpec;
  /** What the rules read, kept so the no-model fallback can rebuild without guesses. */
  intents: Intent[];
  cannots: PlainCannot[];
  /** True when every part of the request was understood (or knowingly refused). */
  confident: boolean;
  /** Words nothing explained, as written. */
  leftover: string[];
};

/** Read a request with fixed rules. Pure. */
export function parseByRules(raw: string, catalog: StockCatalog, ctx: BuildContext = {}): RuleResult {
  const text = prepare(raw);
  const lower = text.toLowerCase();
  const intents: Intent[] = [];
  const cannots: PlainCannot[] = [];
  const spans: Span[] = [];

  // Index words first, so "S&P 500" is the fund that tracks it, not a stock that happens to share the words.
  const marketSpans: Array<{ span: Span; ticker: string; said: string }> = [];
  for (const [re, ticker, said] of MARKET_RE) for (const { span } of collect(re, text)) marketSpans.push({ span, ticker, said });
  const formSpans = collect(FORM_TOKEN_RE, text).map((hit) => ({ span: hit.span }));
  const masked = [...marketSpans, ...formSpans].reduce((acc, { span }) => acc.slice(0, span.start) + " ".repeat(span.end - span.start) + acc.slice(span.end), text);
  const found = findStocks(masked, catalog);
  spans.push(...found.spans);
  for (const word of found.unknown) {
    spans.push(word);
    cannots.push(cannot("not_a_us_stock", word.text));
  }

  // Index words become the fund that tracks them, when we cover it.
  const standIns: Array<{ stock: PlainStock; said: string; span: Span }> = [];
  for (const { span, ticker, said } of marketSpans) {
    const stock = catalog.byTicker.get(ticker);
    spans.push(span);
    if (stock) standIns.push({ stock, said, span });
    else cannots.push(cannot("not_a_us_stock", text.slice(span.start, span.end), { detail: `agents watch stocks and funds, and we don't cover a fund that tracks ${said}.` }));
  }

  const intraday = collect(INTRADAY_RE, text);
  spans.push(...intraday.map((entry) => entry.span));
  const anyAhead = AHEAD_RE.test(lower);
  const aheadDays = daysAhead(lower);

  const stocksIn = (span: Span): PlainStock[] => {
    const inside = found.hits.filter((hit) => hit.start >= span.start && hit.end <= span.end);
    const standing = standIns.filter((entry) => entry.span.start >= span.start && entry.span.end <= span.end).map((entry) => entry.stock);
    const all = [...inside, ...standing];
    return all.filter((stock, index) => all.findIndex((s) => s.ticker === stock.ticker) === index);
  };

  // A stock we could not find, in this clause or the one it leans on: its intents are not moved onto anything else.
  const unresolvedIn = (span: Span) =>
    found.unknown.some((word) => word.start >= span.start && word.end <= span.end) ||
    marketSpans.some((entry) => !catalog.byTicker.has(entry.ticker) && entry.span.start >= span.start && entry.span.end <= span.end);
  let pendingUnresolved = false;
  let pending: PlainStock[] = [];
  let last: PlainStock[] = [];
  let lastMine = false;
  // The intents of the last clause that had a trigger, for "…or 140" and "…AMD too".
  let previous: Intent[] = [];
  // The last clause with a trigger asked when to buy or sell, so "…and buy NVDA" asks the same.
  let askBefore = false;
  let lastEnd = 0;
  const restricted: Array<{ intent: Intent; what: string }> = [];
  const pieces = clauses(text);

  // A filing watch and a news watch read their details from the whole request, since "files an 8-K about a deal
  // or an executive change" and "news about AAPL and MSFT turns negative" are split into clauses.
  const lowerAll = text;
  const filingWanted = collect(FORM_TOKEN_RE, lowerAll).length > 0 || (collect(FILE_RE, lowerAll).length > 0 && !collect(FUND_RE, lowerAll).length && !collect(INSIDER_RE, lowerAll).some((hit) => /form\s*4|insider/i.test(hit.match[0])) && !collect(CONGRESS_RE, lowerAll).length);
  let filingFilter: FilingFilter | null = null;
  let shelf = false;
  if (filingWanted) {
    const markAll = (re: RegExp) => {
      const hits = collect(re, text);
      for (const hit of hits) spans.push(hit.span);
      return hits;
    };
    const major = markAll(MAJOR_RE).length > 0;
    const forms: FilingGroup[] = [];
    for (const [re, form] of FORM_WORDS) if (markAll(re).length > 0 && !forms.includes(form)) forms.push(form);
    shelf = /\bs-?3\b/i.test(text);
    const items: string[] = [];
    for (const [re, item] of FILING_ITEMS) if (markAll(re).length > 0 && !items.includes(item)) items.push(item);
    filingFilter = major ? { major: true } : forms.length || items.length ? { ...(forms.length || items.length ? { forms: items.length && !forms.includes("8-K") ? (["8-K", ...forms] as FilingGroup[]) : forms } : {}), ...(items.length ? { items: items.sort() } : {}) } : null;
  }
  const newsWanted = collect(NEWS_WORD_RE, text).length > 0 && !filingWanted;
  let newsWatch: NewsWatch = "any";
  if (newsWanted) {
    const markAll = (re: RegExp) => {
      const hits = collect(re, text);
      for (const hit of hits) spans.push(hit.span);
      return hits.length > 0;
    };
    const negative = markAll(NEWS_NEGATIVE_RE);
    const positive = markAll(NEWS_POSITIVE_RE);
    const busy = markAll(NEWS_BUSY_RE);
    markAll(NEWS_TURN_RE);
    newsWatch = busy && (negative || positive) ? "any" : busy ? "busy" : negative && positive ? "tone" : negative ? "negative" : positive ? "positive" : "any";
  }
  const itemOnly = (local: string) => FILING_ITEMS.some(([re]) => {
    re.lastIndex = 0;
    return re.test(local);
  });

  for (const piece of pieces) {
    const range = { start: piece.start, end: piece.start + piece.text.length };
    const local = piece.text;
    const at = (span: Span): Span => ({ start: span.start + piece.start, end: span.end + piece.start });
    const mark = (re: RegExp) => {
      const hits = collect(re, local);
      for (const hit of hits) spans.push(at(hit.span));
      return hits;
    };
    const has = (re: RegExp) => {
      re.lastIndex = 0;
      return re.test(local);
    };

    let named = stocksIn(range);

    // "…below 150 or 140": another level on the same stocks.
    const bare = BARE_NUMBER_RE.exec(local);
    const priceBefore = previous.filter((intent) => intent.kind === "price_below" || intent.kind === "price_above");
    if (bare && priceBefore.length > 0) {
      spans.push(range);
      for (const intent of priceBefore) intents.push({ ...intent, level: numberOf(bare[1]) });
      continue;
    }

    // "…files an 8-K about a deal or an executive change": the second clause only adds to the filing watch.
    const filingBefore = previous.some((intent) => intent.kind === "sec_filing");
    if (filingWanted && filingBefore && named.length === 0 && !has(FILE_RE) && !has(FORM_TOKEN_RE) && itemOnly(local)) {
      mark(FILING_GLUE_RE);
      continue;
    }
    const secClause = filingWanted && (has(FILE_RE) || has(FORM_TOKEN_RE) || has(MAJOR_RE));
    const newsClause = newsWanted && has(NEWS_WORD_RE);

    const mineHits = mark(MINE_RE);
    const mine = mineHits.length > 0;
    const every = EVERY_RE.test(local) && !mine;
    const clauseIntents: Intent[] = [];
    const clauseCannots: PlainCannot[] = [];

    // Asking when to sell or buy is a signal to watch, never an order ("tell me when to sell oracle").
    const sellAsk = has(SELL_ASK_RE);
    const buyAsk = has(BUY_ASK_RE);
    // A full stop between them ends the ask: "…when to sell oracle. Buy NVDA" is an order.
    const follow = !sellAsk && !buyAsk && askBefore && !/[.;!?]/.test(text.slice(lastEnd, piece.start)) ? FOLLOW_ASK_RE.exec(local) : null;
    const asks = sellAsk || buyAsk || follow !== null;
    const callAsk = has(CALL_RE);

    // Refusals first: a stop-loss is not a price alert, and a dividend is not earnings. Beside an ask, only an
    // order in so many words ("place an order", "a stop-loss") is a trade: "when to sell it for me" is still an ask.
    const trades = collect(TRADING_RE, local).filter((hit) => !asks || !/\bfor me\b|^(?:please\s+)?(?:then\s+)?(?:sell|buy|short)\b/i.test(hit.match[0]));
    if (trades.length > 0 && !has(FUND_RE) && !has(INSIDER_RE) && !has(CONGRESS_RE)) {
      for (const hit of trades) spans.push(at(hit.span));
      // Quote only the trade ("sell NVDA for me"), not the price alert beside it that we did take. A bare "sell my"
      // runs on through the stock it names, so the quote is "sell my oracle", not "sell my".
      const first = trades[0];
      const stockEnd = found.hits.find((hit) => hit.start >= at(first.span).end && hit.start - at(first.span).end <= 2)?.end ?? null;
      const trade = (stockEnd != null ? text.slice(at(first.span).start, stockEnd) : first.match[0]).trim() || local.trim();
      const about = named.length > 0 ? named : pending.length > 0 ? pending : last;
      clauseCannots.push(tradeCannot(trade, about, tradeSide(trade)));
    }
    if (has(COST_RE)) {
      mark(COST_RE);
      clauseCannots.push(cannot("cost_basis", local.trim()));
    }
    if (has(CRYPTO_RE)) {
      mark(CRYPTO_RE);
      clauseCannots.push(cannot("not_a_us_stock", local.trim(), { detail: REASONS.not_a_us_stock }));
    }
    if (has(CHART_RE)) {
      mark(CHART_RE);
      clauseCannots.push(cannot("chart_signals", local.trim()));
    }
    if (has(FUNDAMENTALS_RE) && !has(EARNINGS_RE)) {
      mark(FUNDAMENTALS_RE);
      clauseCannots.push(cannot("fundamentals", local.trim()));
    }
    // "your rating on NVDA" is our call; analysts' ratings are something else.
    if (has(ANALYST_RE) && !(callAsk && collect(ANALYST_RE, local).every((hit) => /^ratings?$/i.test(hit.match[0])))) {
      mark(ANALYST_RE);
      clauseCannots.push(cannot("analyst_ratings", local.trim()));
    }
    if (callAsk && CHANGE_WORD_RE.test(local)) {
      mark(CALL_RE);
      const toHit = mark(CALL_TO_RE)[0];
      mark(CALL_GLUE_RE);
      const to = toHit ? callOfWord(toHit.match[1]) : null;
      // "…says it's time to sell NVDA" is the sell watch, which already covers the call turning to Sell some.
      if (!(sellAsk && to === "Trim")) clauseIntents.push({ kind: "call_change", stocks: [], to });
    }
    if (has(DIVIDEND_RE)) {
      mark(DIVIDEND_RE);
      clauseCannots.push(cannot("dividends", local.trim()));
    }
    const earningsWord = has(EARNINGS_RE) && !secClause;
    const topic = has(NEWS_RE);
    if (topic && !earningsWord && !secClause && !newsClause) {
      mark(NEWS_RE);
      const who = named[0]?.ticker ?? (pending[0]?.ticker || last[0]?.ticker) ?? null;
      const executive = /\bceo (?:leaves|quits|resigns|steps down)\b/i.test(local);
      clauseCannots.push(
        cannot("news", local.trim(), {
          suggest: executive
            ? `Tell me when ${who ?? "my stocks"} ${who ? "files" : "file"} an 8-K about an executive change`
            : `Tell me when the news about ${who ?? "my stocks"} turns negative`,
        }),
      );
    }
    if (secClause) {
      mark(FILE_RE);
      mark(FORM_TOKEN_RE);
      mark(FILING_GLUE_RE);
      clauseIntents.push({ kind: "sec_filing", stocks: [], every, filings: filingFilter, shelf });
    } else if (newsClause) {
      mark(NEWS_WORD_RE);
      mark(NEWS_TURN_RE);
      if (topic) mark(NEWS_RE);
      clauseIntents.push({ kind: "news_change", stocks: [], news: newsWatch, topic });
    }

    // A stop-loss is still a price worth hearing about. A P/E below 30, a price target, a dividend yield,
    // a move from what you paid or a bitcoin crash is not a price level on the stock, so nothing is read from it.
    const BLOCKING: CannotCode[] = ["cost_basis", "chart_signals", "fundamentals", "analyst_ratings", "dividends", "not_a_us_stock"];
    const blocked = clauseCannots.some((entry) => BLOCKING.includes(entry.code)) || secClause || newsClause;

    // Prices.
    const pctHits = blocked ? [] : mark(PCT_RE);
    const moveWithoutPct = !blocked && pctHits.length === 0 && /\bmoves?\s+(?:more than|over|at least|by)\s+(\d+(?:\.\d+)?)\b(?!\s*\$)/i.exec(local);
    if (!blocked) {
      for (const { match } of collect(LEVEL_PREP_RE, local)) {
        const prep = match[2].toLowerCase();
        const below = /below|under|beneath|lower|less|sub|south/.test(prep);
        // "moves more than 5" is a percent with the sign left off.
        if (/^moves?$/i.test(match[1] ?? "") && /more than|over/.test(prep)) continue;
        spans.push(at({ start: match.index, end: match.index + match[0].length }));
        clauseIntents.push({ kind: below ? "price_below" : "price_above", stocks: [], level: numberOf(match[3]) });
      }
      for (const { match, span } of collect(LEVEL_SIGN_RE, local)) {
        spans.push(at(span));
        clauseIntents.push({ kind: match[1] === "<" ? "price_below" : "price_above", stocks: [], level: numberOf(match[2]) });
      }
      for (const { match } of collect(LEVEL_VERB_RE, local)) {
        const spanned = at({ start: match.index, end: match.index + match[0].length });
        // Already read as "below 150" or a percent: not a second level.
        if (spans.some((s) => spanned.start < s.end && spanned.end > s.start && !found.spans.includes(s))) continue;
        const verb = (match[1] ?? match[3] ?? "").toLowerCase();
        const level = numberOf(match[2] ?? match[4] ?? "0");
        spans.push(spanned);
        const down = /^(?:drop|dip|fall|fell|sink|slide|slip|tank|decline)/.test(verb);
        const up = /^(?:rise|rose|climb|jump|rall|top)/.test(verb);
        clauseIntents.push({ kind: down ? "price_below" : up ? "price_above" : "price_below", stocks: [], level, direction: down || up ? null : "both" });
      }
    }
    if (!blocked) {
      const pcts = pctHits.map((hit) => Number(hit.match[1]));
      if (moveWithoutPct) {
        pcts.push(Number(moveWithoutPct[1]));
        spans.push(at({ start: moveWithoutPct.index, end: moveWithoutPct.index + moveWithoutPct[0].length }));
      }
      const bigMove = pcts.length === 0 ? mark(BIG_MOVE_RE) : [];
      if (pcts.length > 0 || bigMove.length > 0) {
        const multiDay = mark(MULTI_DAY_RE);
        if (multiDay.length > 0) {
          clauseCannots.push(cannot("multi_day_move", local.trim(), { suggest: "Every Monday, sum up my week" }));
        } else {
          const down = DOWN_RE.test(local);
          // "heads up" and "shows up" are not a direction.
          const up = UP_RE.test(local.replace(/\bheads[- ]up\b|\bshows? up\b|\bpops? up\b/gi, ""));
          const either = /either way/i.test(local) || (down && up) || (!down && !up && EITHER_RE.test(local));
          for (const pct of pcts.length ? pcts : [null]) {
            clauseIntents.push({ kind: "daily_move", stocks: [], pct, direction: either ? "both" : down ? "down" : up ? "up" : "both" });
          }
        }
        for (const word of ["moves?", "moved", "moving", "swings?", "changes?", "drops?", "dropped", "falls?", "fell", "rises?", "rose", "jumps?", "jumped", "gains?", "loses?", "lost", "in a day", "in one day", "a day", "daily", "today", "on the day", "in a session", "either way"]) {
          mark(new RegExp(`\\b${word}\\b`, "gi"));
        }
      }
    }

    // Earnings.
    const filingWords = has(FUND_RE) || has(INSIDER_RE) || has(CONGRESS_RE);
    const reportsAsEarnings = !secClause && !newsClause && !earningsWord && !filingWords && has(REPORTS_RE) && (named.length > 0 || mine || pending.length > 0 || last.length > 0);
    if (earningsWord || reportsAsEarnings) {
      mark(EARNINGS_RE);
      mark(REPORTS_RE);
      mark(/\bbefore\b|\bahead(?: of)?\b|\bcoming up\b|\bupcoming\b|\bsoon\b|\bprior to\b|\bafter\b|\bcomes? out\b|\bare out\b|\breported\b|\bremind(?: me)?\b|\bin advance\b|\bdate\b|\bdays?\b|\bweeks?\b|\bnight\b|\bthe day\b|\bthe week\b|\bfew\b|\bcouple\b|\bthree\b|\btwo\b|\bfive\b|\bseven\b|\b\d{1,2}\b/gi);
      const ahead = AHEAD_RE.test(local) || (anyAhead && !OUT_RE.test(local.replace(/\bwhen\b/gi, "")));
      if (ahead) clauseIntents.push({ kind: "earnings_before", stocks: [], days: aheadDays ?? 3 });
      else clauseIntents.push({ kind: "earnings_out", stocks: [] });
    }

    // Filings and disclosures.
    const side: Intent["side"] = SELL_RE.test(local) && !BUY_RE.test(local) && !/\btrades?\b/i.test(local) ? "sell" : BUY_RE.test(local) && !SELL_RE.test(local) && !/\btrades?\b/i.test(local) ? "buy" : null;
    // "Berkshire files its 13F" is the fund, not the BRK.B shares.
    const berkshire = named.find((stock) => /^BRK[.-]B$/.test(stock.ticker));
    let fundPerson: string | null = null;
    if (!secClause && berkshire && /\b13-?f\b|\bfiles?\b|\bfiled\b|\bfiling\b|\bportfolio\b|\bbuys?\b|\bsells?\b/i.test(local) && (has(FUND_RE) || /\b13-?f\b|\bfil(?:es?|ed|ing)\b|\bportfolio\b/i.test(local))) {
      named = named.filter((stock) => stock !== berkshire);
      fundPerson = "Berkshire Hathaway";
      FUND_RE.lastIndex = 0;
    }
    if ((has(FUND_RE) && !secClause) || fundPerson) {
      mark(FUND_RE);
      mark(TRADE_WORD_RE);
      mark(/\bfiles?\b|\bfiled\b|\bfiling\b|\breports?\b|\bnew\b|\bquarterly\b|\bwe track\b|\bposition\b|\bstake\b|\bholdings?\b|\bmanager\b|\bbig\b/gi);
      clauseIntents.push({ kind: "fund_13f", stocks: [], side, every, person: fundPerson });
    }
    if (has(CONGRESS_RE)) {
      mark(CONGRESS_RE);
      mark(TRADE_WORD_RE);
      let person: string | null = null;
      for (const { match, span } of collect(PERSON_RE, local)) {
        person = match[1];
        spans.push(at(span));
      }
      for (const [re, name] of KNOWN_MEMBERS) if (re.test(local)) person = name;
      mark(/\b(?:nancy|any|member|members|house|discloses?|disclosed|disclosure|reports?)\b/gi);
      clauseIntents.push({ kind: "congress_trade", stocks: [], side, every, person });
    } else {
      const named_ = collect(PERSON_RE, local);
      if (named_.length > 0) {
        for (const { span } of named_) spans.push(at(span));
        clauseIntents.push({ kind: "congress_trade", stocks: [], side, every, person: named_[0].match[1] });
      }
    }
    // "Tesla's CEO leaves" is not a trade: it gets the 8-K suggestion above, not an insider agent.
    if (has(INSIDER_RE) && !secClause && !/\bceo (?:leaves|quits|resigns|steps down)\b/i.test(local)) {
      mark(INSIDER_RE);
      mark(TRADE_WORD_RE);
      mark(/\b(?:files?|filed|reports?|form)\b/gi);
      clauseIntents.push({ kind: "insider_trade", stocks: [], side, every });
    }

    if (has(MOVERS_RE)) {
      mark(MOVERS_RE);
      mark(/\b(?:lands?|shows? up|appears?|makes?|is|gets?) (?:on|in)\b|\bbiggest\b|\btop\b/gi);
      clauseIntents.push({ kind: "movers_list", stocks: [] });
    }
    if (sellAsk || follow?.[1]) {
      mark(SELL_ASK_RE);
      if (follow) spans.push(at({ start: follow.index, end: follow.index + follow[0].length }));
      mark(/\b(?:reach(?:es)?|hits?|gets? to|rises? to|climbs? to|enters?|is in|is at)\b/gi);
      clauseIntents.push({ kind: "sell_zone", stocks: [] });
    }
    if (has(BUY_ZONE_RE) || buyAsk || follow?.[2]) {
      mark(BUY_ZONE_RE);
      mark(BUY_ASK_RE);
      if (follow) spans.push(at({ start: follow.index, end: follow.index + follow[0].length }));
      mark(/\b(?:reach(?:es)?|hits?|gets? to|drops? to|falls? to|enters?|is in)\b/gi);
      clauseIntents.push({ kind: "buy_zone", stocks: [] });
    }

    // Schedules. "Daily" next to a move is "in a day", not a digest.
    if (!clauseIntents.some((intent) => intent.kind === "daily_move")) {
      const weekly = mark(WEEKLY_RE);
      if (weekly.length > 0) {
        const named = weekly.map((hit) => (hit.match[1] ?? hit.match[2] ?? "").toLowerCase()).find(Boolean);
        const end = weekly.some((hit) => /end of/i.test(hit.match[0]));
        const weekday = named && named !== "week" ? (named === "weekend" ? 6 : WEEKDAY_INDEX[named]) : end ? 5 : 1;
        // "…but only on Fridays" is a condition on another agent, not a request for a weekly review.
        const onlyDays = weekly.every((hit) => /^on /i.test(hit.match[0])) && !has(SUMMARY_RE);
        if (weekday === 0 || weekday === 6) clauseCannots.push(cannot("weekend", local.trim(), { suggest: "Every Friday, sum up my week" }));
        else {
          const intent: Intent = { kind: "weekly_review", stocks: [], weekday };
          clauseIntents.push(intent);
          if (onlyDays) restricted.push({ intent, what: local.trim() });
        }
        mark(SUMMARY_RE);
      } else {
        const daily = mark(DAILY_RE);
        if (daily.length > 0 || (has(SUMMARY_RE) && clauseIntents.length === 0)) {
          mark(SUMMARY_RE);
          clauseIntents.push({ kind: "daily_check", stocks: [] });
        }
      }
    }

    // Intraday words alone have nothing to attach to.
    const intradayHere = intraday.some((entry) => entry.span.start >= range.start && entry.span.end <= range.end);
    if (intradayHere && clauseIntents.length === 0 && clauseCannots.length === 0) clauseCannots.push(cannot("intraday", local.trim()));

    // Who each intent is about: named here, else carried from the clause before ("…or a fund sells it").
    const unresolved = unresolvedIn(range) || pendingUnresolved;
    if (clauseIntents.length > 0 && unresolved && named.length === 0 && pending.length === 0) {
      // "the Dow falls 3%" with no fund for the Dow: say so, and don't watch your whole list instead.
      pendingUnresolved = false;
      cannots.push(...clauseCannots);
      continue;
    }
    if (clauseIntents.length > 0) {
      pendingUnresolved = false;
      askBefore = clauseIntents.some((intent) => intent.kind === "sell_zone" || intent.kind === "buy_zone");
      const stocks = named.length > 0 ? [...pending.filter((p) => !named.some((n) => n.ticker === p.ticker)), ...named] : mine ? [] : pending.length > 0 ? pending : lastMine ? [] : last;
      const useMine: boolean = mine || (named.length === 0 && pending.length === 0 && last.length === 0 && lastMine);
      for (const intent of clauseIntents) {
        intent.stocks = stocks;
        intent.implicit = stocks.length === 0 && !useMine && !intent.every;
        intent.mine = useMine || (stocks.length === 0 && !intent.every && intent.kind !== "fund_13f" && intent.kind !== "congress_trade");
        if (intent.kind === "insider_trade" && stocks.length === 0 && !intent.every) intent.mine = true;
        if (intraday.length > 0) intent.intraday = true;
        const standIn = standIns.find((entry) => stocks.some((stock) => stock.ticker === entry.stock.ticker));
        if (standIn) intent.stand_in = { said: standIn.said, ticker: standIn.stock.ticker };
      }
      intents.push(...clauseIntents);
      last = stocks;
      lastMine = useMine;
      pending = [];
      previous = clauseIntents;
    } else if (named.length > 0 && ACTION_RE.test(local)) {
      // "…and add NVDA to my watchlist", "…. Buy NVDA now": a stock someone wants to act on is not more stocks for
      // the agents just read. An order was refused above; anything else is said, never dropped.
      if (clauseCannots.length === 0) {
        clauseCannots.push(cannot("other", local.trim(), { line: `I can't change your list from here. Track ${listStockNames(named)} from ${named.length === 1 ? "its" : "their"} stock page.` }));
      }
    } else if (named.length > 0 && previous.length > 0 && !STARTER_RE.test(local) && !unresolvedIn(range)) {
      // "…insiders buy NVDA or AMD", "…drops below 150, AMD too": more stocks for the agents just read.
      for (const intent of previous) {
        intent.stocks = [...intent.stocks, ...named.filter((stock) => !intent.stocks.some((s) => s.ticker === stock.ticker))];
        intent.mine = false;
        intent.implicit = false;
      }
      last = previous[0].stocks;
    } else if (named.length > 0 || unresolvedIn(range)) {
      pending = [...pending, ...named.filter((stock) => !pending.some((p) => p.ticker === stock.ticker))];
      if (unresolvedIn(range)) pendingUnresolved = true;
    } else if (mine) {
      lastMine = true;
    }
    cannots.push(...clauseCannots);
    lastEnd = range.end;
  }

  // "when to sell, trim or hold NVDA": the same watch read twice, once with no stock. The one on NVDA stands.
  for (const kind of ["sell_zone", "buy_zone"] as const) {
    if (!intents.some((intent) => intent.kind === kind && intent.stocks.length > 0)) continue;
    for (let i = intents.length - 1; i >= 0; i -= 1) if (intents[i].kind === kind && intents[i].stocks.length === 0 && intents[i].implicit) intents.splice(i, 1);
  }

  // Stocks left at the end ("tell me if it drops below 150: NVDA or AMD") belong to the agents read just before them.
  if (pending.length > 0 && !pendingUnresolved) {
    const orphaned = intents.filter((intent) => intent.stocks.length === 0 && intent.kind !== "daily_check" && intent.kind !== "weekly_review");
    for (const intent of orphaned.length > 0 ? orphaned : previous) {
      intent.stocks = [...intent.stocks, ...pending.filter((stock) => !intent.stocks.some((s) => s.ticker === stock.ticker))];
      intent.mine = false;
      intent.implicit = false;
    }
  }

  // A weekly condition beside another agent is something we can't do; on its own it is a weekly review.
  if (restricted.length > 0 && intents.some((intent) => intent.kind !== "weekly_review" && intent.kind !== "daily_check")) {
    for (const { intent, what } of restricted) {
      intents.splice(intents.indexOf(intent), 1);
      cannots.push(cannot("other", what, { detail: "agents check every market day, so they can't be limited to some days of the week." }));
    }
  }

  // "up 5% or down 3%" on the same stocks is one agent at the smaller size, not two.
  const moves = new Map<string, Intent>();
  for (const intent of [...intents]) {
    if (intent.kind !== "daily_move") continue;
    const key = intent.stocks.length ? intent.stocks.map((s) => s.ticker).sort().join(",") : intent.mine ? "mine" : "implicit";
    const kept = moves.get(key);
    if (!kept) {
      moves.set(key, intent);
      continue;
    }
    const small = Math.min(kept.pct ?? 5, intent.pct ?? 5);
    const big = Math.max(kept.pct ?? 5, intent.pct ?? 5);
    kept.folded_pcts = [...(kept.folded_pcts ?? []), big].filter((value) => value !== small);
    kept.pct = small;
    kept.direction = "both";
    intents.splice(intents.indexOf(intent), 1);
  }

  // "hits 200": above or below depends on where the stock is now.
  const settled: Intent[] = [];
  for (const intent of intents) {
    if ((intent.kind === "price_below" || intent.kind === "price_above") && intent.direction === "both") {
      if (intent.stocks.length === 0) {
        settled.push({ ...intent, direction: null });
        continue;
      }
      for (const stock of intent.stocks) {
        if (stock.price == null) {
          cannots.push(cannot("no_direction", null, { detail: `say whether you mean above or below ${money(intent.level ?? 0)}, like “${stock.ticker} closes above ${intent.level}”.` }));
          continue;
        }
        settled.push({ ...intent, kind: (intent.level ?? 0) >= stock.price ? "price_above" : "price_below", stocks: [stock], direction: null });
      }
      continue;
    }
    settled.push(intent);
  }

  // What nothing explained.
  const covered = new Array<boolean>(text.length).fill(false);
  for (const span of spans) for (let i = Math.max(0, span.start); i < Math.min(text.length, span.end); i += 1) covered[i] = true;
  let rest = "";
  for (let i = 0; i < text.length; i += 1) rest += covered[i] ? " " : text[i];
  const leftover = (rest.match(/[A-Za-z][A-Za-z'’]*/g) ?? []).filter((word) => word.length >= 3 && !FILLER.has(word.toLowerCase().replace(/[’]/g, "'")));
  const capitalised = leftover.filter((word, index) => /^[A-Z]/.test(word) && !(index === 0 && rest.trimStart().startsWith(word)));
  // A number nothing explained ("drops $5", a second price) means we missed something.
  const strayNumbers = rest.match(/\d[\d,.]*/g) ?? [];
  for (const number of strayNumbers) leftover.push(number);

  // "T drops below 20": T, F, A or ON written alone could be the stock or a word. Ask for the $.
  const stockless = settled.filter(
    (intent) => intent.stocks.length === 0 && intent.implicit && !["fund_13f", "congress_trade", "insider_trade", "daily_check", "weekly_review"].includes(intent.kind),
  );
  if (stockless.length > 0 && found.maybe.length > 0) {
    const ticker = found.maybe[0];
    for (const intent of stockless) settled.splice(settled.indexOf(intent), 1);
    cannots.push(cannot("no_stock", null, { detail: `if you mean the stock ${ticker}, write it as $${ticker}, like “$${ticker} closes below 20”, so I don't mistake it for a word.` }));
  }

  const spec = buildSpec(raw.trim().slice(0, MAX_REQUEST_CHARS), settled, cannots, "rules", ctx);
  const understood = settled.length > 0 || cannots.length > 0;
  // A stock we didn't recognise ("lucid drops 10%") leaves a word behind and a rule with no stock: never guess "your list".
  const guessed = settled.some((intent) => intent.implicit || ((intent.kind === "price_below" || intent.kind === "price_above") && intent.stocks.length === 0));
  return {
    spec,
    intents: settled,
    cannots,
    confident: understood && leftover.length < 2 && capitalised.length === 0 && strayNumbers.length === 0 && !(guessed && leftover.length > 0),
    leftover,
  };
}

/* ── the model's answer ─────────────────────────────────────────────────── */

/** What the model may return. Anything else is ignored. */
export type ModelWatch = {
  kind: WatchKind;
  /** As written in the request: tickers or company names. */
  stocks: string[];
  my_stocks: boolean;
  any_stock: boolean;
  level: number | null;
  pct: number | null;
  direction: "up" | "down" | "both" | null;
  days_before: number | null;
  weekday: number | null;
  side: "buy" | "sell" | null;
  person: string | null;
  /** sec_filing: forms asked for ("8-K", "10-K", "10-Q", "S-1", "13D/G"). Optional for older answers. */
  forms?: string[] | null;
  /** sec_filing: 8-K item codes asked for, like "5.02". */
  items?: string[] | null;
  /** sec_filing: "something big". */
  major?: boolean | null;
  /** news_change: which change. */
  news?: string | null;
  /** call_change: the call it should turn to. */
  call_to?: "buy_more" | "keep" | "sell_some" | null;
};

export type ModelCannot = { quote: string; reason: CannotCode };

export type ModelParse = { watches: ModelWatch[]; cannot: ModelCannot[] };

/** A model reader. Throws when it can't answer; the rules' reading is used then. */
export type ModelReader = (text: string) => Promise<ModelParse>;

function inRequest(quoteText: string | null | undefined, input: string): string | null {
  const value = (quoteText ?? "").replace(/^["“'‘]+|["”'’]+$/g, "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 120) return null;
  // Only quote whole words the person actually wrote ("e" inside "drops" is not a quote).
  if (value.replace(/[^A-Za-z0-9]/g, "").length < 2) return null;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").test(input.replace(/\s+/g, " ")) ? value : null;
}

/** The numbers written in the request, with "1,200" and "100k" read as numbers. */
function numbersIn(input: string): number[] {
  return (input.match(/\d[\d,]*(?:\.\d+)?\s*k?\b/gi) ?? []).map((raw) => {
    const thousand = /k$/i.test(raw.trim());
    const value = Number(raw.replace(/[,\sk]/gi, ""));
    return thousand ? value * 1000 : value;
  });
}

/** Turn the model's structured answer into a spec, trusting nothing in it. */
export function specFromModel(input: string, parsed: ModelParse, catalog: StockCatalog, ctx: BuildContext = {}): PlainSpec {
  const intents: Intent[] = [];
  const cannots: PlainCannot[] = [];
  const kinds = new Set<string>(WATCH_KINDS);
  const codes = new Set<string>(CANNOT_CODES);
  for (const watch of (parsed.watches ?? []).slice(0, MAX_WATCHES * 2)) {
    if (!watch || !kinds.has(watch.kind)) continue;
    const stocks: PlainStock[] = [];
    let missing = false;
    for (const written of (watch.stocks ?? []).slice(0, MAX_SCOPE_TICKERS)) {
      if (typeof written !== "string") continue;
      // A stock the person didn't write is the model guessing ("my favourite chip stock" is not NVDA).
      if (!inRequest(written.replace(/^\$/, ""), input)) continue;
      const stock = resolveStock(written, catalog);
      if (stock) {
        if (!stocks.some((s) => s.ticker === stock.ticker)) stocks.push(stock);
      } else {
        missing = true;
        cannots.push(cannot("not_a_us_stock", inRequest(written, input) ?? null, inRequest(written, input) ? {} : { detail: REASONS.not_a_us_stock }));
      }
    }
    // A watch on a stock we could not find is not quietly turned into a watch on everything.
    if (missing && stocks.length === 0) continue;
    const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    const weekday = finite(watch.weekday);
    if (watch.kind === "weekly_review" && weekday != null && (weekday === 0 || weekday === 6)) {
      cannots.push(cannot("weekend", null, { suggest: "Every Friday, sum up my week" }));
      continue;
    }
    if (watch.kind === "weekly_review" && weekday != null && (weekday < 0 || weekday > 6)) {
      cannots.push(cannot("unclear", null));
      continue;
    }
    // Prices and percents come from the request, never from the model.
    const written = numbersIn(input);
    const writtenNumber = (value: number | null) => value == null || written.some((n) => Math.abs(n - Math.abs(value)) < 0.005);
    if (!writtenNumber(finite(watch.level)) || !writtenNumber(finite(watch.pct))) {
      cannots.push(cannot("unclear", null));
      continue;
    }
    intents.push({
      kind: watch.kind,
      stocks,
      mine: Boolean(watch.my_stocks) && stocks.length === 0,
      every: Boolean(watch.any_stock) && stocks.length === 0,
      level: finite(watch.level),
      pct: finite(watch.pct) != null ? Math.abs(finite(watch.pct)!) : null,
      direction: watch.direction === "up" || watch.direction === "down" || watch.direction === "both" ? watch.direction : null,
      days: finite(watch.days_before) != null ? Math.round(finite(watch.days_before)!) : null,
      weekday: weekday != null ? Math.round(weekday) : null,
      side: watch.side === "buy" || watch.side === "sell" ? watch.side : null,
      person: typeof watch.person === "string" && inRequest(watch.person, input) ? inRequest(watch.person, input) : null,
      intraday: INTRADAY_RE.test(input) ? true : undefined,
      ...(watch.kind === "sec_filing" ? { filings: cleanFilingFilter({ forms: watch.forms ?? [], items: watch.items ?? [], major: watch.major === true }) ?? null, shelf: /\bs-?3\b/i.test(input) } : {}),
      ...(watch.kind === "news_change" ? { news: cleanNewsWatch(watch.news) } : {}),
      ...(watch.kind === "call_change" ? { to: watch.call_to === "buy_more" ? "Add" : watch.call_to === "keep" ? "Hold" : watch.call_to === "sell_some" ? "Trim" : null } : {}),
    });
    INTRADAY_RE.lastIndex = 0;
  }
  for (const entry of (parsed.cannot ?? []).slice(0, MAX_WATCHES * 2)) {
    if (!entry) continue;
    const code = (codes.has(entry.reason) ? entry.reason : "other") as CannotCode;
    const what = inRequest(entry.quote, input);
    if (code === "trading") {
      // Asking when to sell or buy is a signal, whatever the model called it ("tell me when to sell oracle").
      const named = findStocks(input, catalog).hits.filter((stock, index, all) => all.findIndex((s) => s.ticker === stock.ticker) === index);
      const sell = SELL_ASK_RE.test(input);
      SELL_ASK_RE.lastIndex = 0;
      const buy = BUY_ASK_RE.test(input);
      BUY_ASK_RE.lastIndex = 0;
      if (sell || buy) {
        const stocks = named.map(({ ticker, name, price }) => ({ ticker, name, price })).slice(0, MAX_SCOPE_TICKERS);
        const mine = stocks.length === 0;
        for (const kind of [...(sell ? (["sell_zone"] as const) : []), ...(buy ? (["buy_zone"] as const) : [])]) {
          if (!intents.some((intent) => intent.kind === kind)) intents.push({ kind, stocks, mine });
        }
        continue;
      }
      cannots.push(tradeCannot(what, named, tradeSide(what ?? input)));
      continue;
    }
    cannots.push(cannot(code, what, code === "not_a_us_stock" && !what ? { detail: REASONS.not_a_us_stock } : code === "multi_day_move" ? { suggest: "Every Monday, sum up my week" } : {}));
  }
  return buildSpec(input.trim().slice(0, MAX_REQUEST_CHARS), intents, cannots, "model", ctx);
}

/* ── the whole read ─────────────────────────────────────────────────────── */

export type PlainParseResult = PlainSpec & {
  /** The model was wanted but this person has used their reads for today. */
  limited?: boolean;
};

export class ModelLimitError extends Error {
  constructor() {
    super("model_limit");
  }
}

/**
 * Rules first. When they leave words unexplained and a model is available,
 * the model reads the whole request instead. If the model fails, the rules'
 * reading stands, with the unexplained part said out loud.
 */
/** Our call on these tickers for the person asking (lib/agents-plain/server.ts plainCallLookup). */
export type CallLookup = (tickers: string[]) => Promise<Record<string, PlainCall>>;

/** The stocks a buy or sell watch names one by one: the ones whose call the read-back can say. */
function zoneTickers(spec: PlainSpec): string[] {
  const out = new Set<string>();
  for (const watch of spec.watches) {
    if ((watch.draft.template === "sell-zone" || watch.draft.template === "buy-zone") && watch.draft.scope.kind === "tickers") {
      for (const ticker of watch.draft.scope.tickers) out.add(ticker);
    }
  }
  return [...out];
}

export async function parsePlainRequest(
  raw: string,
  catalog: StockCatalog,
  options: Omit<BuildContext, "calls"> & { model?: ModelReader | null; rules?: RuleResult; callLookup?: CallLookup | null } = {},
): Promise<PlainParseResult> {
  const input = raw.replace(/\s+/g, " ").trim().slice(0, MAX_REQUEST_CHARS);
  const { callLookup: lookup, model: _model, rules: _rules, ...base } = options as typeof options & BuildContext;
  const rules = options.rules ?? parseByRules(input, catalog, base);
  // Read again with our calls when a buy or sell watch names a stock, so the read-back can say the real price.
  const withCalls = async <T extends PlainSpec>(spec: T, again: (ctx: BuildContext) => T): Promise<T> => {
    const tickers = lookup ? zoneTickers(spec) : [];
    if (!lookup || tickers.length === 0) return spec;
    const calls = await lookup(tickers).catch(() => null);
    return calls && Object.keys(calls).length ? again({ ...base, calls }) : spec;
  };
  const fromRules = (ctx: BuildContext) => withLeftover(input, ctx === base ? rules : parseByRules(input, catalog, ctx), ctx);
  if (rules.confident || !options.model) return withCalls(fromRules(base), fromRules);
  try {
    const parsed = await options.model(input);
    const spec = specFromModel(input, parsed, catalog, base);
    // A model that understood nothing is no better than the rules.
    if (spec.watches.length === 0 && rules.spec.watches.length > 0) return withCalls(fromRules(base), fromRules);
    return withCalls(spec, (ctx) => specFromModel(input, parsed, catalog, ctx));
  } catch (error) {
    const result = await withCalls(fromRules(base), fromRules);
    return error instanceof ModelLimitError ? { ...result, limited: true } : result;
  }
}

/**
 * The rules' reading when nobody could check it: keep what was read for
 * certain, drop anything whose stock was only assumed (a word we didn't
 * recognise is more likely a company than "your list"), and say which words
 * we didn't follow.
 */
export function withLeftover(input: string, rules: RuleResult, ctx: BuildContext = {}): PlainSpec {
  if (rules.confident || rules.leftover.length === 0) return rules.spec;
  const words = rules.leftover.filter((word) => /[A-Za-z]/.test(word));
  const what = (words.length ? words : rules.leftover).join(" ");
  const unclear = cannot("unclear", what);
  const sure = rules.intents.filter((intent) => !intent.implicit && !((intent.kind === "price_below" || intent.kind === "price_above") && intent.stocks.length === 0));
  return buildSpec(input, sure, [...rules.cannots.filter((entry) => entry.code !== "unclear"), unclear], "rules", ctx);
}
