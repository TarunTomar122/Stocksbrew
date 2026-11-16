import { interTight } from "@/components/oa/font";
import { PricePanel } from "@/components/stock-report/price-panel";
import { getStockEarningsDates, getStockLongSeries } from "@/lib/stock-events";
import { buildChartRanges, foldMovesIntoEarnings, stretchChange, unusualMoves, type ChartEvent } from "@/lib/stock-chart";

/**
 * Preview of "big move" marks on the stock chart (owner ask, Nov 16): the days a stock moved far more than it usually
 * does, after the market, on news about the company. Real closes and real earnings dates; the reason on each mark was
 * picked by hand from that day's Finnhub headlines, standing in for the model that will pick it in the real feature.
 */
type Pick = { start: string; end?: string; title: string; source: string };

const PICKS: Record<string, Pick[]> = {
  NVDA: [
    { start: "2026-02-26", end: "2026-02-27", title: "A record quarter didn't calm AI-bubble fears", source: "Yahoo Finance" },
    { start: "2026-06-01", title: "Jensen Huang's Computex keynote", source: "Yahoo Finance" },
    { start: "2026-07-14", title: "China to let its top AI firms buy H200 chips", source: "The Information" },
    { start: "2026-08-27", title: "Results beat; Trump praised the 'incredible numbers'", source: "Benzinga" },
    { start: "2026-11-09", end: "2026-11-12", title: "Board probe into Jensen Huang, then he resigned", source: "Yahoo Finance" },
  ],
  TSLA: [
    { start: "2026-04-02", title: "First-quarter deliveries missed estimates", source: "Yahoo Finance" },
    { start: "2026-04-15", title: "Full Self-Driving approved in Europe", source: "Yahoo Finance" },
    { start: "2026-07-02", title: "Fell even though second-quarter deliveries beat", source: "Yahoo Finance" },
    { start: "2026-07-23", title: "weak profit and cash flow", source: "Benzinga" },
    { start: "2026-08-21", title: "Nevada approved its robotaxi permit", source: "Yahoo Finance" },
    { start: "2026-09-04", title: "Cybercab launch drew a federal probe", source: "Yahoo Finance" },
  ],
  AMD: [
    { start: "2026-02-04", title: "Softer outlook despite record AI sales", source: "Yahoo Finance" },
    { start: "2026-04-24", title: "Intel's strong results lifted chip stocks", source: "Yahoo Finance" },
    { start: "2026-05-06", title: "First-quarter beat and a strong data-center outlook", source: "Yahoo Finance" },
    { start: "2026-11-09", title: "Oppenheimer upgrade; Google Cloud picked its chips", source: "Yahoo Finance" },
  ],
  AAPL: [
    { start: "2026-02-02", title: "Record first-quarter revenue", source: "Yahoo Finance" },
    { start: "2026-05-01", title: "Record quarter and a $100 billion buyback", source: "Yahoo Finance" },
    { start: "2026-06-25", title: "Raised iPad and MacBook prices on chip costs", source: "Yahoo Finance" },
    { start: "2026-07-31", title: "supply problems expected into 2027", source: "UBS via Yahoo Finance" },
    { start: "2026-09-10", title: "Launched a $1,999 foldable iPhone", source: "Yahoo Finance" },
  ],
};

export default async function MoveMarksPage() {
  const spy = await getStockLongSeries("SPY");
  const stocks = await Promise.all(
    Object.entries(PICKS).map(async ([ticker, picks]) => {
      const [series, earnings] = await Promise.all([getStockLongSeries(ticker), getStockEarningsDates("US", ticker)]);
      if (!series) return null;
      const lastDay = series.lastDate;
      const moves: ChartEvent[] = picks.flatMap((pick) => {
        const pct = stretchChange(series.closes, pick.start, pick.end);
        if (pct === null) return [];
        const days = pick.end ? series.closes.filter((point) => point.date >= pick.start && point.date <= pick.end!).length : 1;
        return [
          {
            date: pick.start,
            endDate: pick.end,
            kind: "move" as const,
            title: pick.title.charAt(0).toUpperCase() + pick.title.slice(1),
            detail: days > 1 ? `Over ${days} trading days · ${pick.source}` : pick.source,
            pct,
            tone: pct >= 0 ? ("up" as const) : ("down" as const),
          },
        ];
      });
      const earningsEvents: ChartEvent[] = earnings
        .filter((event) => event.event_date.slice(0, 10) <= lastDay)
        .map((event) => ({
          date: event.event_date.slice(0, 10),
          kind: "earnings" as const,
          title: `${ticker} reported earnings`,
          detail: event.time === "bmo" ? "Before the market opened" : event.time === "amc" ? "After the close" : undefined,
        }));
      const events = foldMovesIntoEarnings([...earningsEvents, ...moves], series.closes);
      const rule = spy ? unusualMoves(series.closes, spy.closes) : null;
      // The move days stay on the thinned line, so each mark sits on its own day and price.
      const ranges = buildChartRanges(series.closes, 200, moves.flatMap((move) => (move.endDate ? [move.date, move.endDate] : [move.date])));
      return { ticker, series: { ...series, ranges }, events, rule };
    }),
  );

  return (
    <main className={`oa-landing ${interTight.variable} min-h-screen min-w-0 bg-oa-page px-4 py-8 sm:px-8`}>
      <div className="mx-auto flex max-w-[64rem] flex-col gap-8">
        <header>
          <h1 className="text-[24px] font-medium tracking-tight text-oa-fg">Big moves on the chart</h1>
          <p className="mt-1 text-[14px] leading-6 text-oa-muted-fg">
            Preview: real closes, reasons picked from that day&apos;s headlines.
          </p>
        </header>
        {stocks.map((stock) =>
          stock ? (
            <section key={stock.ticker} aria-label={stock.ticker} className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
              <div className="flex items-baseline justify-between gap-3 border-b border-oa-border px-4 py-3">
                <h2 className="text-[17px] font-medium text-oa-fg">{stock.ticker}</h2>
                {stock.rule ? (
                  <p className="oa-mono text-[12px] text-oa-muted-fg">
                    marks a day from {(2.5 * stock.rule.spread).toFixed(1)}% beyond the market (news: {(1.5 * stock.rule.spread).toFixed(1)}%)
                  </p>
                ) : null}
              </div>
              <PricePanel ticker={stock.ticker} ranges={stock.series.ranges} events={stock.events} currency="$" defaultRange="1Y" />
            </section>
          ) : null,
        )}
      </div>
    </main>
  );
}
