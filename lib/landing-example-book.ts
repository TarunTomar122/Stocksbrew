import { FUNDS_SECTOR } from "@/lib/portfolio-shared";
import { bookLead, labelWhen, monthWords, signedPct, stockCards, type BookFacts, type BookSource, type PlainCall, type StockFact } from "@/lib/portfolio-home/stocks";

/**
 * The home page's example portfolio block, built from the same book as My stocks (lib/portfolio-home/stocks-server.ts
 * `loadExampleBook`: the example portfolio in lib/portfolio-data.ts, priced on the same quotes) and the same cards
 * (`stockCards`), so the holdings, their value, the day's move and each stock's line agree with /portfolio. Pure, so
 * it can be tested.
 */

export type ExampleBookRow = {
  ticker: string;
  shares: number | null;
  price: number | null;
  dayPct: number | null;
  call: PlainCall | null;
  /**
   * The one thing that matters for it now, the same line its card on /portfolio shows, less its past month against
   * the S&P 500: the card's bar shows that (owner rules 1 and 4), so "Down 1.6% over the past month, 4.0 points
   * behind the S&P 500" is not written out on half the cards. Null when the month was its only fact.
   */
  line: string | null;
  /** Its own move over the past month, for the card's bar; null without a close that far back. */
  monthPct: number | null;
};

export type ExampleBookView = {
  /** "$129,990": the holdings' value, as /portfolio adds it up. */
  value: string;
  /** "nine holdings" */
  count: string;
  /** The day's move of the whole example, rounded as /portfolio shows it ("+1.3%"). */
  day: { pct: number; text: string; when: string } | null;
  /** "We'd buy more of five and keep two." Empty when no holding has a call. */
  calls: string;
  /** Stocks (not funds) with no call yet, said once rather than on each row. */
  pending: string;
  /** "It also watches AMD, LLY and CAT.": the same watched names as My stocks and the briefing. Empty with none. */
  watching: string;
  /** The day its prices are from, YYYY-MM-DD, or null. */
  pricesDay: string | null;
  /** The S&P 500 over the same past month, the tick on every card's bar; null when no holding has it. */
  marketMonthPct: number | null;
  rows: ExampleBookRow[];
};

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

function countWords(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function joinList(items: readonly string[]): string {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** "We'd buy more below $330." for a call with its level, else "21% of the example, its biggest holding."; null with neither. */
function ownFact(card: { call: PlainCall | null; level: string | null; weight: number | null }, biggest: boolean): string | null {
  if (card.call && card.call !== "Keep" && card.level) return `We'd ${card.call === "Buy more" ? "buy more" : "sell some"} ${card.level}.`;
  if (!fin(card.weight) || card.weight <= 0) return null;
  const pct = card.weight >= 9.5 ? `${Math.round(card.weight)}%` : `${card.weight.toFixed(1).replace(/\.0$/, "")}%`;
  return biggest ? `${pct} of the example, its biggest holding.` : `${pct} of the example's money.`;
}

/**
 * A card's line with its month against the S&P 500 taken out, since the bar draws it: null for a card whose one fact
 * was its month, and "Next report Dec 10." for one whose report had its month added ("Next report Dec 10; up 11.4%
 * over the past month."). Any other fact is kept whole.
 */
function lineBesideBar(fact: StockFact | null, month: { pct: number; marketPct: number | null } | null): string | null {
  if (!fact) return null;
  if (fact.kind === "month" && month) return null;
  if (fact.kind === "next-report" && month) {
    const cut = fact.text.indexOf("; ");
    const rest = cut >= 0 ? fact.text.slice(cut + 2).toLowerCase() : "";
    if (cut >= 0 && (rest.startsWith(monthWords(month).toLowerCase()) || rest.startsWith(monthWords({ ...month, marketPct: null }).toLowerCase()))) {
      return `${fact.text.slice(0, cut)}.`;
    }
  }
  return fact.text;
}

/** Null when the book has no holding with a value, so the page shows its plain line instead. */
export function exampleBookView(source: BookSource, extra: Pick<BookFacts, "reasons" | "ideas"> = { reasons: [], ideas: [] }): ExampleBookView | null {
  const { positions, totals } = source.portfolio;
  if (positions.length === 0 || !fin(totals.value) || totals.value <= 0) return null;
  const byTicker = new Map(positions.map((position) => [position.ticker, position]));
  // The cards' own order: the ones that need a look first, then by size, as on /portfolio.
  const cards = stockCards(source, extra);
  const sized = cards.filter((card) => fin(card.weight) && card.weight > 0);
  const biggest = sized.reduce<(typeof cards)[number] | null>((top, card) => (!top || card.weight! > top.weight! ? card : top), null);
  const ordered = cards.map((card): ExampleBookRow => {
    const position = byTicker.get(card.ticker);
    const month = source.month?.[card.ticker] ?? null;
    const monthPct = month && fin(month.pct) ? month.pct : null;
    const line = lineBesideBar(card.fact, monthPct === null ? null : month);
    return {
      ticker: card.ticker,
      shares: position && fin(position.shares) ? position.shares : null,
      price: position && fin(position.price) ? position.price : null,
      dayPct: card.dayPct,
      call: card.call,
      // A card whose only fact was its month (now the bar) still says one thing of its own (judges, j92): the price
      // at which we'd act on it, or else its share of the example.
      line: line ?? (monthPct !== null ? ownFact(card, sized.length > 1 && card === biggest) : null),
      monthPct,
    };
  });
  // The cards with a line first, then the ones that are only their bar, each in /portfolio's order, so a short card
  // shares its row with other short ones instead of sitting with a blank band beside a two-line card (owner rule 4).
  // Anything that needs a look has a line, so it still leads.
  const rows = [...ordered.filter((row) => row.line !== null), ...ordered.filter((row) => row.line === null)];

  const lead = bookLead(source);
  const day = lead?.today
    ? { pct: lead.today.pct, text: signedPct(lead.today.pct), when: labelWhen(lead.today.label) }
    : null;

  const tally = (["Buy more", "Keep", "Sell some"] as const)
    .map((call) => ({ call, n: rows.filter((row) => row.call === call).length }))
    .filter((item) => item.n > 0)
    .map(({ call, n }) => `${call === "Buy more" ? "buy more of" : call === "Keep" ? "keep" : "sell some of"} ${countWords(n)}`);
  const calls = tally.length > 0 ? `We'd ${joinList(tally)}.` : "";

  // Funds carry no call of ours; a stock without one is said once here, not as a line on its row (owner rule 1).
  const waiting = rows.filter((row) => row.call === null && byTicker.get(row.ticker)?.sector !== FUNDS_SECTOR).map((row) => row.ticker);
  const pending = waiting.length > 0 ? `We have no call on ${joinList(waiting)} yet.` : "";

  const marketMonthPct = Object.values(source.month ?? {}).map((month) => month.marketPct).find((value): value is number => fin(value)) ?? null;
  const watched = (source.portfolio.watching ?? []).map((position) => position.ticker).filter(Boolean);
  return {
    watching: watched.length > 0 ? `It also watches ${joinList(watched)}.` : "",
    pricesDay: source.pricesDay ?? null,
    // Only with a bar to put it on.
    marketMonthPct: rows.some((row) => row.monthPct !== null) ? marketMonthPct : null,
    value: `$${Math.round(totals.value).toLocaleString("en-US")}`,
    count: `${countWords(positions.length)} ${positions.length === 1 ? "holding" : "holdings"}`,
    day,
    calls,
    pending,
    rows,
  };
}
