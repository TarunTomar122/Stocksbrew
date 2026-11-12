/**
 * Shareable portfolio cards: one read from a signed-in page, saved as a
 * snapshot at `tm_portfolio_shares/{shareId}` and shown at `/s/{shareId}`.
 *
 * A card is words and percentages only. It is built on the server from the
 * page's own loader output (lib/share/facts.ts), worded by the pure rules in
 * lib/share/cards.ts, and never taken from the browser. Pure types: safe on
 * both sides.
 */

export const SHARE_KINDS = ["portfolio", "xray", "dividends", "stress", "memo"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export function isShareKind(value: unknown): value is ShareKind {
  return typeof value === "string" && (SHARE_KINDS as readonly string[]).includes(value);
}

export type ShareTone = "up" | "down" | "flat";

export type ShareLine = { text: string; tone: ShareTone };

/**
 * One bar. `value` sets the length (a share 0 to 100, or a signed change); `display` is what is printed beside it.
 * `ticker` draws the company's logo beside the label; it is left out when names are hidden. `benchmark` marks the
 * S&P 500's share on the same scale.
 */
export type ShareBarRow = {
  label: string;
  value: number;
  display: string | null;
  tone: ShareTone;
  highlight?: boolean;
  ticker?: string | null;
  benchmark?: number | null;
};

/**
 * "share": horizontal bars of a whole (companies, sectors, raises).
 * "versus": two signed bars, mine against the S&P 500.
 * "months": twelve columns, the year's dividends by month.
 * "signed": bars either side of zero, each holding's part of a move.
 */
export const SHARE_BAR_STYLES = ["share", "versus", "months", "signed"] as const;
export type ShareBars = { title: string; style: (typeof SHARE_BAR_STYLES)[number]; rows: ShareBarRow[] };

/** The one big number a card leads with: "+3.5%" over "my holdings this week". */
export type ShareFigure = { value: string; label: string; tone: ShareTone };

/**
 * Two lines over the same days, in percent from the first point (which is 0):
 * mine against the S&P 500. `days` are YYYY-MM-DD, one per point.
 */
export type ShareCurve = { title: string; days: string[]; mine: number[]; market: number[] | null };

/** A stock and its move: the logo comes from `ticker`, which is null when names are hidden. */
export type ShareChip = { ticker: string | null; label: string; display: string; tone: ShareTone };

export type ShareCard = {
  v: 1;
  kind: ShareKind;
  /** The candidate this card was made from ("top", "sector", "rates-2022"), stable for a kind. */
  cardId: string;
  /** Short topic above the headline: "What I really own". */
  topic: string;
  /** One or two sentences in the first person, with the number in them. */
  headline: string;
  /** Up to two supporting lines. */
  lines: ShareLine[];
  bars: ShareBars | null;
  /** The big number. Missing on cards made before the cards had pictures; those draw the words-only layout. */
  figure?: ShareFigure | null;
  /** The week's line against the S&P 500 (memo cards). */
  curve?: ShareCurve | null;
  /** Up to six stocks as logo chips with their move, best first (memo cards). */
  chips?: ShareChip[] | null;
  /** Where the numbers come from and when, in words. */
  footnote: string;
  /** New York day the snapshot was taken, YYYY-MM-DD. */
  asOf: string;
};

export type ShareOptions = {
  /** Replace company and fund names with plain descriptions. */
  hideNames: boolean;
  /** Allow dollar amounts (only dividend cards have any). Off by default. */
  showAmounts: boolean;
};

export const DEFAULT_SHARE_OPTIONS: ShareOptions = { hideNames: false, showAmounts: false };

/** One read the person can pick, with every variant of it already built. */
export type ShareCandidate = {
  cardId: string;
  /** Short name for the picker: "Biggest company", "2022 rate-hike slide". */
  label: string;
  /** The card has names that can be hidden. */
  hasNames: boolean;
  /** The card names companies, but no version without them passed the privacy check, so names cannot be hidden. */
  namesLocked?: boolean;
  /** The card has a version with dollar amounts. */
  hasAmounts: boolean;
  /** Keyed by `variantKey(options)`. */
  variants: Record<string, { card: ShareCard; hash: string }>;
};

export function variantKey(options: ShareOptions): string {
  return `${options.hideNames ? "anon" : "named"}-${options.showAmounts ? "amounts" : "pct"}`;
}

/** The variant for a choice, falling back off options the card does not have. Here, not in cards.ts, so the client button stays small. */
export function pickVariant(candidate: ShareCandidate, options: ShareOptions): { card: ShareCard; hash: string; options: ShareOptions } | null {
  const effective: ShareOptions = {
    hideNames: options.hideNames && candidate.hasNames,
    showAmounts: options.showAmounts && candidate.hasAmounts,
  };
  const found = candidate.variants[variantKey(effective)];
  return found ? { ...found, options: effective } : null;
}

/** Where "See this for your own stocks" goes: the page the read came from (signed out, it shows the example). */
export const SHARE_CTA: Record<ShareKind, { href: string; page: string }> = {
  portfolio: { href: "/portfolio", page: "My stocks" },
  xray: { href: "/portfolio/xray", page: "Analysis" },
  dividends: { href: "/portfolio/dividends", page: "Dividends" },
  stress: { href: "/portfolio/xray#crashes", page: "Past crashes" },
  memo: { href: "/portfolio/memo", page: "Weekly memo" },
};

/** Share ids: 12 characters of a-z, A-Z and 0-9 (about 71 bits), so links cannot be guessed. */
export const SHARE_ID = /^[A-Za-z0-9]{12}$/;

export function isShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_ID.test(value);
}

export const SHARE_COLLECTION = "tm_portfolio_shares";
/** Live shares one person can keep; past that, they delete an old one first. */
export const MAX_SHARES_PER_USER = 50;
