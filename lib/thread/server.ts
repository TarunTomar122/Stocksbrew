import { withoutCircularReasons } from "@/components/briefing/real-reasons";
import { briefingSections } from "@/lib/briefing";
import type { BriefingPageData } from "@/lib/briefing-data";
import type { ExampleBriefingPage } from "@/lib/briefing-example";
import { groupBriefingSections } from "@/lib/briefing-groups";
import { briefingRead, holdingsFirst } from "@/lib/briefing-read";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { listBaskets } from "@/lib/basket-agent/data";
import { filingSource } from "@/lib/filing-changes/server";
import { inboxStocks, loadExampleInbox, loadUserInbox, windowStart, type InboxResult } from "@/lib/inbox/server";
import type { InboxItem } from "@/lib/inbox/types";
import { etDay } from "@/lib/insight-format";
import { overnightStrip } from "@/lib/briefing-overnight";
import { getExtendedQuotes } from "@/lib/extended-quotes-server";
import type { ExtendedQuote } from "@/lib/extended-quotes";
import { BENCHMARK_SYMBOL, EXAMPLE_STOCK_TICKERS, loadDailySeries } from "@/lib/portfolio-data";
import { callsFrom } from "@/lib/portfolio-home/stocks-server";
import { PLAIN_CALL, callLevel } from "@/lib/portfolio-home/stocks";
import type { DailySeries } from "@/lib/portfolio-shared";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import type { UserDoc } from "@/lib/watchlist";

import { threadBiggest } from "./biggest";
import { basketsByTicker, buildThread, sessionMoves, THREAD_DAYS, type CallLine, type MorningRead } from "./build";
import type { Thread } from "./types";

/**
 * The thread's reads, all of them ones other pages already cache: the person's inbox (one minute per person), the
 * morning briefing (one build a minute), the screener's calls, each stock's daily closes, and the person's idea baskets
 * with the filing comparisons on the stocks only a basket holds. Each runs on its own
 * time limit; a slow or failed one leaves its notes out, never the page. Never calls a model and never writes.
 */

/** How long the morning briefing may take before the thread opens without it. */
export const BRIEFING_TIMEOUT_MS = 4000;
/** The other side reads. */
const SIDE_TIMEOUT_MS = 4000;

function within<T>(work: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[thread] ${label} took longer than ${ms}ms; left out`);
      resolve(fallback);
    }, ms);
  });
  const done = work.catch((error) => {
    console.warn(`[thread] ${label} failed; left out:`, error instanceof Error ? error.message : error);
    return fallback;
  });
  return Promise.race([done, late]).finally(() => clearTimeout(timer));
}

/** Our call on each stock in the thread's words, its level only where `levels` says the viewer may see it. */
export function callLines(rows: Map<string, ScreenerRow>, levels: (ticker: string) => boolean, today: string): Record<string, CallLine> {
  const calls = callsFrom(rows, levels, today);
  const out: Record<string, CallLine> = {};
  for (const [ticker, call] of Object.entries(calls)) {
    const price = rows.get(ticker)?.price ?? null;
    out[ticker] = { word: PLAIN_CALL[call.call], level: callLevel(call, typeof price === "number" ? price : null) };
  }
  return out;
}

/** Each stock's latest price from its screener row, for the notes that report no move of their own. */
export function pricesFrom(rows: Map<string, ScreenerRow>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ticker, row] of rows) if (typeof row.price === "number" && Number.isFinite(row.price) && row.price > 0) out[ticker] = row.price;
  return out;
}

/**
 * The morning read for the thread: the briefing's own read, with the holdings' move set against the S&P 500 when the
 * index is priced on the same session (the example's briefing already says it that way).
 */
export function morningFrom(data: BriefingPageData | ExampleBriefingPage | null, now: Date): MorningRead | null {
  if (!data || data.archived || data.briefing.mode !== "personal") return null;
  if (data.viewer.kind !== "member" && data.viewer.kind !== "signed_out") return null;
  const briefing = withoutCircularReasons(data.briefing);
  const grouped = holdingsFirst(groupBriefingSections(briefingSections(briefing, data.state), "personal"));
  const portfolio = briefing.portfolio ?? null;
  const sessionDay = etDay(portfolio?.as_of ?? null) ?? briefing.date;
  const example = "example" in data ? data.example : null;
  const sp500 = briefing.market.indices.find((index) => index.name === "S&P 500");
  const marketPct = example
    ? example.market && example.market.day === sessionDay
      ? example.market.pct
      : null
    : sp500 && etDay(sp500.as_of ?? null) === sessionDay
      ? sp500.change_pct
      : null;
  // `example: true` is the read's S&P 500 wording ("0.4 points better than the S&P 500"); it needs the index from
  // the same session, which is checked above for members as for the example.
  const read = briefingRead(briefing, grouped, null, now.getTime(), { example: marketPct !== null || Boolean(example), marketPct });
  if (!read) return null;
  return {
    headline: read.headline,
    sessionDay,
    pct: portfolio && Number.isFinite(portfolio.day_change_pct) ? portfolio.day_change_pct : null,
  };
}

type Common = {
  now: Date;
  today: string;
  tickers: string[];
  /** The stocks the day lines are about: holdings, or every stock when there are none. */
  group: { tickers: string[]; holdings: boolean };
  levels: (ticker: string) => boolean;
};

async function sideReads(common: Common): Promise<{ rows: Map<string, ScreenerRow>; series: Map<string, DailySeries>; quotes: Map<string, ExtendedQuote> }> {
  const [rows, series, quotes] = await Promise.all([
    within(getScreenerRows(common.tickers), SIDE_TIMEOUT_MS, new Map<string, ScreenerRow>(), "calls"),
    within(loadDailySeries([...common.group.tickers, BENCHMARK_SYMBOL]), SIDE_TIMEOUT_MS, new Map<string, DailySeries>(), "closes"),
    // The after-hours and pre-market prints for "Biggest things": the same shared cache entry (same stocks, same key,
    // a minute) the inbox's own extended source reads, so it is at most one small batched read a minute.
    within(getExtendedQuotes(common.tickers), SIDE_TIMEOUT_MS, new Map<string, ExtendedQuote>(), "extended quotes"),
  ]);
  return { rows, series, quotes };
}

function assemble(
  common: Common,
  input: {
    example: boolean;
    inbox: InboxResult | null;
    briefing: BriefingPageData | null;
    rows: Map<string, ScreenerRow>;
    series: Map<string, DailySeries>;
    quotes?: Map<string, ExtendedQuote>;
    /** Filing notes on stocks only the person's idea baskets hold (the inbox has the ones they track). */
    basketFilings?: InboxItem[];
    baskets?: Record<string, string[]>;
  },
): Thread {
  const morning = morningFrom(input.briefing, common.now);
  const sessions = sessionMoves({ series: input.series, tickers: common.group.tickers, benchmark: input.series.get(BENCHMARK_SYMBOL) ?? null, today: common.today, count: THREAD_DAYS });
  const nothing = !input.inbox && !morning && sessions.length === 0;
  const thread = buildThread({
    status: nothing ? "unavailable" : "ready",
    example: input.example,
    today: common.today,
    items: [...(input.inbox?.items ?? []), ...(input.basketFilings ?? [])],
    upcoming: input.inbox?.upcoming ?? [],
    morning,
    sessions,
    group: { total: common.group.tickers.length, holdings: common.group.holdings },
    calls: callLines(input.rows, common.levels, common.today),
    levels: common.levels,
    prices: pricesFrom(input.rows),
    baskets: input.baskets,
    stocks: common.tickers.length,
  });
  return { ...thread, biggest: biggestOf(common, input) };
}

/** "Biggest things" (lib/thread/biggest.ts) from the inbox's items and the after-hours and pre-market prints. */
function biggestOf(common: Common, input: { inbox: InboxResult | null; rows: Map<string, ScreenerRow>; quotes?: Map<string, ExtendedQuote> }) {
  const names: Record<string, string> = {};
  const dayPcts: Record<string, number> = {};
  for (const [ticker, row] of input.rows) {
    if (row.name) names[ticker] = row.name;
    if (typeof row.day_pct === "number" && Number.isFinite(row.day_pct)) dayPcts[ticker] = row.day_pct;
  }
  const holding = new Set(common.group.holdings ? common.group.tickers : []);
  const positions = common.tickers.map((ticker) => ({ ticker, name: names[ticker] ?? ticker, relation: holding.has(ticker) ? ("holding" as const) : ("watching" as const) }));
  const overnight = input.quotes && input.quotes.size > 0 ? overnightStrip(positions, input.quotes, common.now.getTime())?.cards ?? [] : [];
  return threadBiggest({ today: common.today, items: input.inbox?.items ?? [], holding, names, prices: pricesFrom(input.rows), dayPcts, levels: common.levels, overnight });
}

/**
 * The person's idea baskets, and the filing comparisons in the inbox window on the stocks only a basket holds (the
 * inbox already reads the ones they track). Either read failing or running late leaves its part out.
 */
async function basketReads(uid: string | null, tracked: readonly string[], now: Date): Promise<{ baskets: Record<string, string[]>; filings: InboxItem[] }> {
  if (!uid) return { baskets: {}, filings: [] };
  // Idea baskets only (basketsByTicker leaves theses over holdings out: they are not baskets to name in a note).
  const baskets = basketsByTicker(await within(listBaskets(uid), SIDE_TIMEOUT_MS, [], "baskets"));
  const own = new Set(tracked);
  const extra = Object.keys(baskets).filter((ticker) => !own.has(ticker));
  if (extra.length === 0) return { baskets, filings: [] };
  const filings = await within(filingSource(extra.map((ticker) => ({ ticker })), windowStart(now).sinceDay), SIDE_TIMEOUT_MS, [], "basket filings");
  return { baskets, filings };
}

/**
 * A signed-in person's thread. `doc` and `viewer` are theirs, already read for this request; `briefing` loads their
 * morning briefing (the page passes the briefing loader, which reads the same session).
 */
export async function loadMemberThread(input: {
  doc: UserDoc | null;
  viewer: Viewer;
  briefing: () => Promise<BriefingPageData | null>;
  now?: Date;
}): Promise<Thread> {
  const now = input.now ?? new Date();
  const { viewer, doc } = input;
  const stocks = inboxStocks(doc, viewer);
  const today = etDay(now.toISOString()) ?? now.toISOString().slice(0, 10);
  if (stocks.length === 0) return { status: "no-stocks", example: false, today, days: [], stocks: 0 };
  const tickers = stocks.map((stock) => stock.ticker);
  const held = stocks.filter((stock) => stock.position === "holding").map((stock) => stock.ticker);
  const common: Common = {
    now,
    today,
    tickers,
    group: held.length > 0 ? { tickers: held, holdings: true } : { tickers, holdings: false },
    levels: (ticker) => canSeeLevels(viewer, ticker),
  };
  const [inbox, briefing, side, basket] = await Promise.all([
    // The inbox has its own per-source limits; this one only keeps a stuck store from holding the page.
    within(loadUserInbox(viewer, doc, now), SIDE_TIMEOUT_MS + 1000, null, "inbox"),
    within(input.briefing(), BRIEFING_TIMEOUT_MS, null, "briefing"),
    sideReads(common),
    // Both basket reads together get no longer than the inbox does.
    within(basketReads(viewer.uid, tickers, now), SIDE_TIMEOUT_MS + 1000, { baskets: {}, filings: [] }, "baskets"),
  ]);
  // Research rows not built yet: the briefing says so, and the thread waits for them too.
  if (briefing?.viewer.kind === "pending" && (!inbox || inbox.items.length === 0)) {
    return { status: "pending", example: false, today, days: [], stocks: tickers.length };
  }
  return assemble(common, { example: false, inbox, briefing, ...side, basketFilings: basket.filings, baskets: basket.baskets });
}

/** The example portfolio's thread, the same for every visitor, from the example's cached briefing and inbox. */
export async function loadExampleThread(input: { briefing: () => Promise<ExampleBriefingPage | null>; now?: Date }): Promise<Thread> {
  const now = input.now ?? new Date();
  const today = etDay(now.toISOString()) ?? now.toISOString().slice(0, 10);
  const tickers = [...EXAMPLE_STOCK_TICKERS];
  // Signed out, no stock shows its levels (lib/entitlements: levels are the plan's), as on the example's briefing.
  const common: Common = { now, today, tickers, group: { tickers, holdings: true }, levels: () => false };
  const [inbox, briefing, side] = await Promise.all([
    within(loadExampleInbox(now), SIDE_TIMEOUT_MS + 1000, null, "example inbox"),
    within(input.briefing(), BRIEFING_TIMEOUT_MS, null, "example briefing"),
    sideReads(common),
  ]);
  return assemble(common, { example: true, inbox, briefing, ...side });
}
