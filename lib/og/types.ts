/** The specs the share cards are drawn from. Built in `lib/og/data.ts`, drawn in `lib/og/cards.tsx`. */

export type OgTone = "up" | "down" | "flat";
export type OgCall = "Add" | "Hold" | "Trim";

/** One supporting sentence, with its number, and whether it is good or bad news. */
export type OgLine = { text: string; tone: OgTone };

/** A bar on a shared scale across a compare card's stocks (lib/og/rules.ts compareBars), in fractions of its track. */
export type OgStatBar = { start: number; end: number; zero: number; best: boolean; signed: boolean };

export type OgStat = { label: string; value: string; tone?: OgTone; sub?: string; subTone?: OgTone; bar?: OgStatBar | null };

type Base = {
  /** Uppercase mono label top right, e.g. "Signals · Nov 10". */
  eyebrow: string | null;
  /** Path on the site, shown in the footer. */
  path: string;
  /** Source and as-of line, bottom right. Null when there is nothing dated on the card. */
  footnote: string | null;
  /** A words-only stand-in for data that was not in time: cached briefly so the real card replaces it soon. */
  transient?: boolean;
};

/** The one big number a card leads with: "+0.9%" over "S&P 500 futures before the open". */
export type OgFigure = { value: string; label: string; tone: OgTone };

/** A stock and its move, drawn as a logo chip. `logo` is a data URI (lib/og/logos.ts) or null for the lettered tile. */
export type OgChip = { ticker: string; logo: string | null; display: string; tone: OgTone };

/** Mine (or the example's) against the S&P 500 over the same days, percent from the first point. */
export type OgCurve = { title: string; mine: number[]; market: number[] | null; labels: string[] | null; mineLabel: string };

/**
 * A page led by its read: the headline is the hero, one or two insights under it. With a `figure` the card is
 * drawn as a poster instead: the big number and the headline, the curve beside them, the stocks as logo chips.
 */
export type OgReadCard = Base & {
  kind: "read";
  headline: string;
  lines: OgLine[];
  stats?: OgStat[];
  figure?: OgFigure | null;
  curve?: OgCurve | null;
  chips?: OgChip[] | null;
};

export type OgQuote = {
  level: string | null;
  change: string | null;
  dayPct: number | null;
  changeLabel: string | null;
  spark: number[] | null;
  sparkLabel: string | null;
  sparkPct: number | null;
};

/** A stock or a market asset: symbol, name, the insight, the quote and a sparkline. */
export type OgQuoteCard = Base & {
  kind: "quote";
  symbol: string;
  name: string | null;
  logo: string | null;
  showLogo: boolean;
  headline: string | null;
  call: OgCall | null;
  /** One line beside the call: the reason for it, or what the asset is. */
  note: string | null;
  quote: OgQuote;
};

export type OgLandingRow = {
  ticker: string;
  logo: string | null;
  price: string | null;
  dayPct: number | null;
  call: OgCall | null;
  reason: string;
};

export type OgLandingCard = Omit<Base, "path"> & { kind: "landing"; headline: string; sub: string; row: OgLandingRow | null };

export type OgCompareColumn = {
  ticker: string;
  name: string | null;
  logo: string | null;
  price: string | null;
  dayPct: number | null;
  /** The price's own day ("Nov 11"), set only when the prices on the card are from different days. */
  priceDay?: string | null;
  call: OgCall | null;
  stats: OgStat[];
};

export type OgCompareCard = Base & { kind: "compare"; headline: string | null; columns: OgCompareColumn[] };

/** A small figure with its label under a stock tile's move: "340" stories, "65%" negative. */
export type OgFact = { value: string; label: string; tone?: OgTone };

/**
 * One row; with a `ticker` the row is a stock and is drawn as a card with its logo. `price` sits beside the ticker,
 * `valueLabel` beside the move ("today", "on Nov 11"), and `facts` replace the note with figures.
 */
export type OgListRow = {
  label: string;
  value: string | null;
  tone: OgTone;
  note: string;
  ticker?: string | null;
  logo?: string | null;
  price?: string | null;
  valueLabel?: string | null;
  facts?: OgFact[] | null;
};

export type OgListCard = Base & { kind: "list"; headline: string; rows: OgListRow[] };

export type OgRecord = {
  title: string;
  rows: Array<{ label: string; value: string; tone?: OgTone; big?: boolean }>;
  spark: number[] | null;
  benchmark: number[] | null;
  sparkTone: OgTone;
  /** What the numbers cover, e.g. "Backtest Jan 2005 to Oct 2026 · live since Nov 1". */
  period: string | null;
};

/** A fund, lawmaker, strategy or theme: who or what, the read, what it holds, its record. */
export type OgRecordCard = Base & {
  kind: "record";
  title: string;
  subtitle: string | null;
  headline: string | null;
  chips: string[];
  chipsLabel: string | null;
  record: OgRecord | null;
};

export type OgTextCard = Base & { kind: "text"; title: string; sub: string | null; chips?: string[]; stats?: OgStat[] };

/** One holding: logo, ticker, price, today's move and our call. */
/** `day` is set only when this holding's price is from another day than the rest ("Nov 11"). */
export type OgHoldingRow = { ticker: string; logo: string | null; price: string | null; dayPct: number | null; call: OgCall | null; day?: string | null };

/** A portfolio's holdings: its title, the total value with today's change, and its biggest positions as rows. */
export type OgHoldingsCard = Base & {
  kind: "holdings";
  title: string;
  /** `label` is the day the change is from ("today", "on Nov 11"), or null when that day is unknown. */
  total: { value: string; change: string | null; dayPct: number | null; label: string | null } | null;
  /** In place of the total when some holdings are not priced: "6 of 9 holdings priced". */
  coverage?: string | null;
  rows: OgHoldingRow[];
};

export type OgCard = OgHoldingsCard | OgReadCard | OgQuoteCard | OgLandingCard | OgCompareCard | OgListCard | OgRecordCard | OgTextCard;
