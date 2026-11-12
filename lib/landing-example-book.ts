import { FUNDS_SECTOR } from "@/lib/portfolio-shared";
import { bookLead, signedPct, stockCards, type BookFacts, type BookSource, type PlainCall } from "@/lib/portfolio-home/stocks";

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
  /** The one thing that matters for it now, the same line its card on /portfolio shows. */
  line: string | null;
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

/** Null when the book has no holding with a value, so the page shows its plain line instead. */
export function exampleBookView(source: BookSource, extra: Pick<BookFacts, "reasons" | "ideas"> = { reasons: [], ideas: [] }): ExampleBookView | null {
  const { positions, totals } = source.portfolio;
  if (positions.length === 0 || !fin(totals.value) || totals.value <= 0) return null;
  const byTicker = new Map(positions.map((position) => [position.ticker, position]));
  // The cards' own order: the ones that need a look first, then by size, as on /portfolio.
  const rows = stockCards(source, extra).map((card): ExampleBookRow => {
    const position = byTicker.get(card.ticker);
    return {
      ticker: card.ticker,
      shares: position && fin(position.shares) ? position.shares : null,
      price: position && fin(position.price) ? position.price : null,
      dayPct: card.dayPct,
      call: card.call,
      line: card.fact?.text ?? null,
    };
  });

  const lead = bookLead(source);
  const day = lead?.today
    ? { pct: lead.today.pct, text: signedPct(lead.today.pct), when: lead.today.label === "Today" ? "today" : `on ${lead.today.label}` }
    : null;

  const tally = (["Buy more", "Keep", "Sell some"] as const)
    .map((call) => ({ call, n: rows.filter((row) => row.call === call).length }))
    .filter((item) => item.n > 0)
    .map(({ call, n }) => `${call === "Buy more" ? "buy more of" : call === "Keep" ? "keep" : "sell some of"} ${countWords(n)}`);
  const calls = tally.length > 0 ? `We'd ${joinList(tally)}.` : "";

  // Funds carry no call of ours; a stock without one is said once here, not as a line on its row (owner rule 1).
  const waiting = rows.filter((row) => row.call === null && byTicker.get(row.ticker)?.sector !== FUNDS_SECTOR).map((row) => row.ticker);
  const pending = waiting.length > 0 ? `We have no call on ${joinList(waiting)} yet.` : "";

  const watched = (source.portfolio.watching ?? []).map((position) => position.ticker).filter(Boolean);
  return {
    watching: watched.length > 0 ? `It also watches ${joinList(watched)}.` : "",
    pricesDay: source.pricesDay ?? null,
    value: `$${Math.round(totals.value).toLocaleString("en-US")}`,
    count: `${countWords(positions.length)} ${positions.length === 1 ? "holding" : "holdings"}`,
    day,
    calls,
    pending,
    rows,
  };
}
