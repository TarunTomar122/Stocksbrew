/** The specs the share cards are drawn from. Built in `lib/og/data.ts`, drawn in `lib/og/cards.tsx`. */

export type OgTone = "up" | "down" | "flat";
export type OgCall = "Add" | "Hold" | "Trim";

/** One supporting sentence, with its number, and whether it is good or bad news. */
export type OgLine = { text: string; tone: OgTone };

export type OgStat = { label: string; value: string; tone?: OgTone; sub?: string; subTone?: OgTone };

type Base = {
  /** Uppercase mono label top right, e.g. "Signals · Nov 10". */
  eyebrow: string | null;
  /** Path on the site, shown in the footer. */
  path: string;
  /** Source and as-of line, bottom right. Null when there is nothing dated on the card. */
  footnote: string | null;
};

/** A page led by its read: the headline is the hero, one or two insights under it. */
export type OgReadCard = Base & { kind: "read"; headline: string; lines: OgLine[]; stats?: OgStat[] };

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
  call: OgCall | null;
  stats: OgStat[];
};

export type OgCompareCard = Base & { kind: "compare"; headline: string | null; columns: OgCompareColumn[] };

export type OgListRow = { label: string; value: string | null; tone: OgTone; note: string };

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

export type OgCard = OgReadCard | OgQuoteCard | OgLandingCard | OgCompareCard | OgListCard | OgRecordCard | OgTextCard;
