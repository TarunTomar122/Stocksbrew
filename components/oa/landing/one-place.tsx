import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { plainAction, plainCallReason, wholeSentences } from "@/lib/plain-copy";
import { getScreenerRows } from "@/lib/screener";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { callWord } from "@/lib/stock-chart";
import { matchingCompanyReason } from "@/lib/stock-read";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getCurrentMarket } from "@/lib/market";
import { getStockIntelligenceDoc } from "@/lib/stock";
import { sharedCache } from "@/lib/shared-cache";

import { ChangeText, EmptyRow, fmtPrice } from "./shared";

/** An example book. Share counts are made up; prices and calls are live. */
const EXAMPLE_BOOK: { ticker: string; shares: number; held: boolean }[] = [
  { ticker: "NVDA", shares: 60, held: true },
  { ticker: "AAPL", shares: 35, held: true },
  { ticker: "MSFT", shares: 14, held: true },
  { ticker: "AMZN", shares: 30, held: true },
];

const STANCE: Record<string, { label: string; className: string }> = {
  accumulate: { label: "Buy more", className: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300" },
  hold: { label: "Keep", className: "bg-oa-accent text-oa-fg" },
  watch: { label: "Watch", className: "bg-oa-accent text-oa-fg" },
  trim: { label: "Sell some", className: "bg-amber-500/15 text-amber-900 dark:text-amber-300" },
  avoid: { label: "Avoid", className: "bg-red-600/10 text-red-800 dark:text-red-300" },
};

function fmtDollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

// The example book is the same for every visitor; reading a full research doc
// per name on every visit made this the slowest card on the page.
const loadExampleBook = sharedCache(
  async (market: string) => {
    const ids = EXAMPLE_BOOK.map((row) => `${market}_${row.ticker}`);
    const [quotes, intel, screener] = await Promise.all([
      getLatestPriceQuotes(ids).catch(() => new Map()),
      Promise.all(ids.map((id) => getStockIntelligenceDoc(id, market as ReturnType<typeof getCurrentMarket>).catch(() => null))),
      market === "US" ? getScreenerRows(EXAMPLE_BOOK.map((row) => row.ticker)).catch(() => new Map()) : Promise.resolve(new Map()),
    ]);
    const rows = EXAMPLE_BOOK.map((row, index) => {
      const quote = quotes.get(ids[index]!)?.quote;
      const price = typeof quote?.current === "number" && quote.current > 0 ? quote.current : null;
      const changePct = typeof quote?.day_change_pct === "number" ? quote.day_change_pct : null;
      const directive = normalizeDirectiveForUi(intel[index]?.directive_v2 ?? null);
      // The company's own reason (its numbers), first sentence only, when it was written for today's call. Reasons
      // are part of the full report, so only on the showcase stocks, the same rule as the hero card.
      const screenerRow = screener.get(row.ticker);
      const reason =
        isFeaturedStockTicker(row.ticker) && screenerRow?.call_reason
          ? matchingCompanyReason(
              { text: screenerRow.call_reason, call: screenerRow.call ?? null, source: screenerRow.call_reason_source ?? null },
              callWord(intel[index]?.directive_v2?.stance),
            )
          : null;
      return {
        ...row,
        price,
        changePct,
        value: price != null ? price * row.shares : 0,
        stance: directive?.stance ?? null,
        // The engine label in plain words ("Accumulate now" -> what we would do), as on the stock page.
        call: plainAction(directive?.text?.trim() || null, null) || null,
        reason: reason ? wholeSentences(plainCallReason(reason), 1) || null : null,
      };
    }).filter((row) => row.price != null);
    if (rows.length === 0) throw new Error("example_book_empty");
    return rows;
  },
  ["landing-example-book-v2"],
  { revalidate: 300 },
);

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

/**
 * Proof two: one call on each stock you own. An example list (made-up share
 * counts, live prices and calls), one row per holding with what we'd do and
 * why in a few words, and a sentence on how the list did today.
 */
export async function OnePlace() {
  const market = getCurrentMarket();
  const rows = await loadExampleBook(market).catch(() => []);

  const holdings = rows.filter((row) => row.held && row.value > 0).sort((a, b) => b.value - a.value);
  if (holdings.length === 0) {
    return (
      <SquircleCard title="Example list" seeAllHref="/watchlist">
        <EmptyRow>Prices are refreshing. Open your stocks to see your own list.</EmptyRow>
      </SquircleCard>
    );
  }

  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const dayChange = holdings.reduce(
    (sum, row) => sum + (row.changePct != null ? row.value - row.value / (1 + row.changePct / 100) : 0),
    0,
  );
  const dayChangePct = total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : 0;
  // "We'd buy more of two and keep two." Only the calls this list actually has, in a fixed order.
  const tally = ["accumulate", "hold", "trim"]
    .map((stance) => ({ stance, n: holdings.filter((row) => row.stance === stance).length }))
    .filter((item) => item.n > 0)
    .map(({ stance, n }) => `${stance === "accumulate" ? "buy more of" : stance === "hold" ? "keep" : "sell some of"} ${COUNT_WORDS[n] ?? n}`);
  const tallyLine = tally.length ? `We'd ${tally.length > 1 ? `${tally.slice(0, -1).join(", ")} and ${tally[tally.length - 1]}` : tally[0]}.` : "";

  return (
    <Reveal delay={60}>
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-oa-border px-4 py-3.5 sm:px-5">
          <p className="text-[15px] leading-6 text-oa-fg">
            {fmtDollars(total)} across {COUNT_WORDS[holdings.length] ?? holdings.length} {holdings.length === 1 ? "stock" : "stocks"},{" "}
            <ChangeText pct={dayChangePct} className="font-medium" /> today. {tallyLine}
          </p>
          <p className="text-[13px] leading-5 text-oa-muted-fg">Example list: made-up share counts, live prices.</p>
        </div>
        <ul className="divide-y divide-oa-border">
          {holdings.map((row) => {
            const stance = row.stance ? STANCE[row.stance] : null;
            return (
              <li key={row.ticker}>
                <a
                  href={`/stock/${row.ticker}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5"
                >
                  <StockLogo ticker={row.ticker} size={28} circle />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="oa-mono text-[15px] text-oa-fg">{row.ticker}</span>
                      <span className="text-[13px] text-oa-muted-fg">{row.shares} shares</span>
                      {stance ? (
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${stance.className}`}>{stance.label}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-pretty text-[15px] leading-6 text-oa-muted-fg">
                      {/* The chip already says the call; the line says why, in the company's own numbers when we have them. */}
                      {row.reason ?? (stance ? null : row.call ? `${row.call.replace(/[.!]+$/, "")}.` : "We're still researching this one.")}
                    </span>
                  </span>
                  <span className="flex flex-col items-end text-[15px] tabular-nums">
                    <span className="text-oa-fg">{fmtPrice(row.price ?? 0)}</span>
                    {row.changePct != null ? <ChangeText pct={row.changePct} /> : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </Reveal>
  );
}
