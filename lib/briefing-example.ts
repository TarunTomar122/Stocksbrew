import { buildBriefing, marketDay, type Briefing, type BriefingNews, type BriefingPosition } from "@/lib/briefing";
import { loadMarketInputs, marketBriefing, type BriefingPageData } from "@/lib/briefing-data";
import { earningsReportFromDoc, newsFromArticle } from "@/lib/briefing-inputs";
import { getLatestEarningsIntelForInstruments } from "@/lib/earnings-intel";
import { getMarketsData } from "@/lib/markets";
import { FUND_TOPIC, SECTOR_IDS } from "@/lib/markets-insights";
import { getNewsFeed } from "@/lib/news";
import { loadDatedPrices, loadExamplePortfolio } from "@/lib/portfolio-data";
import { callsFrom } from "@/lib/portfolio-home/stocks-server";
import { onOneDay } from "@/lib/portfolio-prices";
import { etDayOfStamp, oldestStamp } from "@/lib/quote-time";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";

/**
 * The signed-out /briefing: the example portfolio's own briefing (owner, Nov 11), so a visitor sees what a member's
 * morning read looks like before signing up. The same made-up portfolio of real stocks as the signed-out My stocks
 * and the home page (lib/portfolio-data.ts), priced on the same dated quotes, with the calls anyone can see and no
 * levels, built by the same builder as a member's briefing (lib/briefing.ts, mode "personal").
 *
 * Left out on purpose: the example account's agent runs (a run from this morning about yesterday's close reads as
 * news beside today's prices; the agent's day is in the rail instead), call changes (signed out, how a call changed
 * is the plan's), price levels and pre-earnings reads (plan content). Never calls a model and never writes.
 */

/** "Market today: S&P 500 +1.31%, tech led": the market in one line, from the same quotes /explore reads. */
export type ExampleMarketLine = {
  /** The S&P 500's move on the example's price day, percent. */
  pct: number;
  /** That price day (New York, YYYY-MM-DD): before the open or on a weekend it is an earlier session's. */
  day: string;
  /** The sector that led the index's way, when one did: "tech", "energy". */
  leader: string | null;
};

export type ExampleBriefingExtras = {
  market: ExampleMarketLine | null;
  /** When the example's prices were taken: the oldest quote time on its price day (lib/quote-time.ts), or null. */
  pricedAt: string | null;
};

/** `example` is null when there is no example to show: the page is then the market's view, marked degraded. */
export type ExampleBriefingPage = BriefingPageData & { example: ExampleBriefingExtras | null };

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The S&P 500 and the sector that led it, only when both are from the example's price day, so the line never puts
 * yesterday's market next to today's stocks. Pure, so it can be tested.
 */
export function exampleMarketLine(
  assets: ReadonlyArray<{ id: string; change: { d1?: number | null }; as_of?: string | null }>,
  pricesDay: string | null,
): ExampleMarketLine | null {
  if (!pricesDay) return null;
  const sp500 = assets.find((asset) => asset.id === "sp500");
  const pct = sp500?.change.d1;
  if (!sp500 || !fin(pct) || etDayOfStamp(sp500.as_of ?? null) !== pricesDay) return null;
  const sectors = SECTOR_IDS.map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset) && fin(asset!.change.d1) && etDayOfStamp(asset!.as_of ?? null) === pricesDay)
    .sort((a, b) => (b.change.d1 as number) - (a.change.d1 as number));
  // The sector that moved most the index's way; none when the index barely moved or no sector went its way.
  const top = pct >= 0 ? sectors[0] : sectors[sectors.length - 1];
  const led = sectors.length >= 4 && Math.abs(pct) >= 0.05 && top && Math.sign(top.change.d1 as number) === Math.sign(pct) ? top : null;
  const name = led ? FUND_TOPIC[led.id] ?? null : null;
  return { pct, day: pricesDay, leader: name ? name.charAt(0).toLowerCase() + name.slice(1) : null };
}

/**
 * Headlines that say nothing about the company: SEO filler ("Some facts worth knowing", "Surpasses market returns"),
 * a rumour column ("Market Chatter:"), or a question ("Can Caterpillar Stock Hit $820?").
 */
const FILLER_TITLE = /\bmarket chatter:|\?\s*$|\b(?:facts? worth knowing|surpasses (?:the )?market returns|outpaces (?:the )?stock market|what you should know|here'?s why|should you buy|is it time to buy|key facts|beats? (?:the )?market:)\b/i;
/** A feed's footer standing in for a summary ("For questions about this article … email help@…"). */
const BOILERPLATE_SUMMARY = /^\s*(?:for questions about|\(updates? )|\S+@\S+\.\w+/i;
/** A headline that says the stock fell, or rose: checked against the stock's own move on the day. */
const SAYS_DOWN = /\b(?:sinks?|sank|falls?|fell|drops?|dropped|dives?|dived|plunges?|plunged|slides?|slid|tumbles?|tumbled|slumps?|slumped|crash(?:es|ed)?)\b/i;
const SAYS_UP = /\b(?:soars?|soared|jumps?|jumped|surges?|surged|rall(?:y|ies|ied)|climbs?|climbed|rises?|rose|spikes?|spiked|pops?|popped)\b/i;

/**
 * The news the example's cards may lead with. It is the first thing a visitor reads about our briefings, so a story
 * is left out when it has no summary to show (the card would only say "read it"), when its headline is filler or a
 * rumour column, and off a stock that went the other way that day by more than 1% ("stock sinks" on NVDA's +2.9%
 * day; per stock, so the same story can stay on another). Pure.
 */
export function exampleNews(news: BriefingNews[], dayMove: ReadonlyMap<string, number | null>): BriefingNews[] {
  return news
    .filter((article) => article.summary.trim().length >= 40 && !BOILERPLATE_SUMMARY.test(article.summary) && !FILLER_TITLE.test(article.title.trim()))
    .map((article) => ({
      ...article,
      tickers: article.tickers.filter((ticker) => {
        const move = dayMove.get(ticker.toUpperCase());
        if (move == null || !Number.isFinite(move) || Math.abs(move) < 1) return true;
        return move > 0 ? !(SAYS_DOWN.test(article.title) && !SAYS_UP.test(article.title)) : !(SAYS_UP.test(article.title) && !SAYS_DOWN.test(article.title));
      }),
    }))
    .filter((article) => article.tickers.length > 0);
}

/** The example's briefing for `now`, with the reads that failed named in `degraded` (the page then is not kept long). */
export async function loadExampleBriefing(now: Date = new Date()): Promise<ExampleBriefingPage> {
  const today = marketDay(now);
  const degraded: string[] = [];
  const guard = <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
    promise.catch(() => {
      degraded.push(label);
      return fallback;
    });

  const example = await guard("prices", loadExamplePortfolio(), null);
  if (!example || example.portfolio.positions.length === 0) {
    // No example (too few priced holdings): the market's view rather than a hollow briefing, kept for seconds only.
    const fallback = await marketBriefing(now);
    return { briefing: fallback.briefing, viewer: { kind: "signed_out" }, state: {}, days: [], archived: false, degraded: [...new Set([...fallback.degraded, "prices"])], example: null };
  }
  const holdings = example.portfolio.positions;
  const watching = example.portfolio.watching;
  const all = [...holdings, ...watching];
  const tickers = all.map((position) => position.ticker);
  const ids = all.map((position) => position.instrument_id);

  const [market, dated, rows, reports, news, markets] = await Promise.all([
    loadMarketInputs(),
    // The quotes again, for their times (the cached example keeps only the numbers): every number on the page then
    // carries the time it was taken, and the header says that one clock.
    guard("prices", loadDatedPrices(tickers), new Map()),
    guard("calls", getScreenerRows(tickers), new Map<string, ScreenerRow>()),
    guard("earnings reports", getLatestEarningsIntelForInstruments("US", ids), []),
    guard("news", getNewsFeed("US"), []),
    // Not a degraded source: without it the market line is left out.
    getMarketsData().catch(() => null),
  ]);
  degraded.push(...market.degraded);
  // Both loaders swallow their own errors: an empty answer for stocks that are always priced and called is a failed read.
  if (dated.size === 0) degraded.push("prices");
  if (rows.size === 0) degraded.push("calls");

  const { day: pricesDay, prices } = onOneDay(dated);
  // Signed out, no stock shows its levels (lib/entitlements: levels are the plan's).
  const calls = callsFrom(rows, () => false, today);
  const positions: BriefingPosition[] = all.map((position) => {
    const quote = prices.get(position.ticker);
    const call = calls[position.ticker];
    const price = quote?.price ?? position.price;
    const shares = position.kind === "holding" && fin(position.shares) && position.shares > 0 ? position.shares : null;
    return {
      instrument_id: position.instrument_id,
      ticker: position.ticker,
      name: position.name,
      relation: position.kind === "holding" ? "holding" : "watching",
      price: fin(price) ? price : null,
      day_change_pct: quote ? quote.dayPct : position.dayPct,
      price_as_of: quote?.at ?? null,
      stance: call ? call.call.toLowerCase() : null,
      call_summary: call?.reason ?? null,
      watch_out: null,
      add_below: null,
      breakout_above: null,
      trim_above: null,
      earnings_date: position.nextEarnings?.date ?? null,
      earnings_time: position.nextEarnings?.time ?? null,
      pre_earnings_headline: null,
      quantity: shares,
      market_value: shares != null && fin(price) ? shares * price : null,
    };
  });

  const { degraded: _marketDegraded, ...inputs } = market;
  void _marketDegraded;
  const briefing: Briefing = buildBriefing({
    ...inputs,
    date: today,
    now: now.toISOString(),
    mode: "personal",
    positions,
    earnings_reports: reports.map(earningsReportFromDoc).filter((report): report is NonNullable<typeof report> => report !== null),
    news: exampleNews(news.map(newsFromArticle), new Map(positions.map((position) => [position.ticker, position.day_change_pct]))),
    alerts: [],
    call_changes: [],
    attention: [],
  });

  const stamps = positions.map((position) => position.price_as_of);
  const pricedAt = pricesDay ? oldestStamp(stamps.filter((stamp) => etDayOfStamp(stamp) === pricesDay)) : null;

  return {
    briefing,
    viewer: { kind: "signed_out" },
    state: {},
    days: [],
    archived: false,
    degraded: [...new Set(degraded)],
    example: { market: exampleMarketLine(markets?.assets ?? [], pricesDay), pricedAt },
  };
}
