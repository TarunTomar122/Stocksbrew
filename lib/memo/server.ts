import { unstable_cache } from "next/cache";

import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { BENCHMARK_SYMBOL } from "@/lib/portfolio-data";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { checkReasons } from "@/lib/thesis-watch/server";
import type { UserDoc } from "@/lib/watchlist";

import { buildMemo } from "./build";
import {
  currentWeek,
  exampleHoldings,
  loadShapeFacts,
  loadSpanEvents,
  previousWeek,
  spanOf,
  userHoldings,
  type HoldingSource,
  type ShapeFacts,
  type SpanEvents,
} from "./data";
import { memoModelReader } from "./model";
import { historyRow, listMemos, readMemo, saveMemo, type MemoHistoryRow, type StoredMemo } from "./store";
import type { DailySeries, Memo, MemoInputs, MemoReason } from "./types";
import type { MemoWeek } from "./week";
import { applyWording, wordingPayload } from "./word";

/**
 * Memos for the page. The example portfolio's are built on demand and cached
 * for the day (this week plus three before it). A signed-in person's are
 * stored per week (lib/memo/store.ts): the current week is written once a day
 * while it runs, and the week before is filled in once if they had none, so
 * there is history to open from the first visit.
 */

const EXAMPLE_WEEKS = 4;

const NO_SHAPE: ShapeFacts = { exposure: null, dividends: [], stress: null };

async function writeMemo(
  source: HoldingSource,
  week: MemoWeek,
  today: string,
  series: Map<string, DailySeries>,
  events: SpanEvents,
  shape: ShapeFacts,
  now: Date,
  worded = true,
): Promise<Memo> {
  const inputs: MemoInputs = {
    week,
    today,
    subject: source.subject,
    holdings: source.holdings,
    series,
    benchmark: series.get(BENCHMARK_SYMBOL) ?? null,
    ...events,
    ...shape,
  };
  const built = buildMemo(inputs, now);
  const reader = worded ? memoModelReader() : null;
  if (!reader) return built.memo;
  try {
    const wording = await reader(wordingPayload(built));
    const { memo, dropped } = applyWording(built, wording);
    if (dropped.length > 0) console.info("[memo] model sentences dropped:", dropped.map((row) => `${row.id}: ${row.why}`).join("; "));
    return memo;
  } catch (error) {
    console.warn("[memo] wording failed, rules stand:", error instanceof Error ? error.message : error);
    return built.memo;
  }
}

/* ── the example ────────────────────────────────────────────────────────── */

/** `day` keys the cache to the New York day. Throws rather than return nothing, so a failed read is not cached for hours. */
async function exampleMemosUncached(_day: string, worded = true): Promise<Memo[]> {
  // The example is the same for every visitor, so it shows the reasons a visitor may see: the showcase stocks'.
  const source = await exampleHoldings((ticker) => isFeaturedStockTicker(ticker));
  if (!source) throw new Error("memo_example_holdings_unavailable");
  const now = new Date();
  const current = await currentWeek(source.holdings.map((holding) => holding.ticker), now);
  if (!current) throw new Error("memo_example_prices_unavailable");
  const weeks: MemoWeek[] = [current.week];
  for (let i = 1; i < EXAMPLE_WEEKS; i++) weeks.push(previousWeek(weeks[i - 1]!, current.series.get(BENCHMARK_SYMBOL)));
  const [events, shape] = await Promise.all([
    loadSpanEvents(source.holdings, spanOf(weeks, current.today)),
    loadShapeFacts(source, current.series).catch(() => NO_SHAPE),
  ]);
  return Promise.all(weeks.map((week, index) => writeMemo(source, week, current.today, current.series, events, index === 0 ? shape : NO_SHAPE, now, worded)));
}

const exampleMemosCached = unstable_cache((day: string) => exampleMemosUncached(day), ["portfolio-memo-example-v14"], { revalidate: 6 * 3600 });
/** The same example from the memo's rules only, never the model: for pages that must not start a model call on load. */
const exampleMemosRulesCached = unstable_cache((day: string) => exampleMemosUncached(day, false), ["portfolio-memo-example-rules-v7"], { revalidate: 6 * 3600 });

export type MemoPageData = {
  mode: "mine" | "example";
  memo: Memo;
  history: MemoHistoryRow[];
  /** The week asked for in the address was not found, so the latest is shown. */
  missingWeek: boolean;
};

function historyOf(memos: Memo[]): MemoHistoryRow[] {
  return memos.map(historyRow);
}

/** The example portfolio's memo for `weekKey` (latest when null), with its other weeks. */
export async function loadExampleMemo(today: string, weekKey: string | null, options: { worded?: boolean } = {}): Promise<MemoPageData | null> {
  const memos = await (options.worded === false ? exampleMemosRulesCached : exampleMemosCached)(today).catch((error) => {
    console.warn("[memo] example unavailable:", error instanceof Error ? error.message : error);
    return [] as Memo[];
  });
  if (memos.length === 0) return null;
  const asked = weekKey ? memos.find((memo) => memo.weekKey === weekKey) : null;
  return { mode: "example", memo: asked ?? memos[0]!, history: historyOf(memos), missingWeek: Boolean(weekKey && !asked) };
}

/* ── a signed-in person ─────────────────────────────────────────────────── */

/** The person's reasons on these holdings that the watcher found weaker or broken, worst first. Never throws. */
async function memoReasons(viewer: Viewer, userDoc: UserDoc | null, tickers: string[]): Promise<MemoReason[]> {
  const held = new Set(tickers);
  const result = await checkReasons(viewer, userDoc).catch(() => null);
  return Object.values(result?.checks ?? {})
    .filter((check) => held.has(check.ticker) && (check.verdict === "weaker" || check.verdict === "broken") && check.signals[0])
    .sort((a, b) => (a.verdict === b.verdict ? a.ticker.localeCompare(b.ticker) : a.verdict === "broken" ? -1 : 1))
    .map((check) => {
      const signal = check.signals[0]!;
      return { ticker: check.ticker, verdict: check.verdict as MemoReason["verdict"], finding: signal.text, source: signal.source, asOf: signal.asOf, data: signal.data };
    });
}

/**
 * Whether a stored memo for the current week can be shown as it is: same
 * holdings and coverage, same last close (a new close, including a late
 * Friday one, rewrites it), and written today while the week runs.
 */
export function isFresh(stored: StoredMemo | null, week: MemoWeek, today: string, signature: string): boolean {
  if (!stored) return false;
  if (stored.signature !== signature) return false;
  // Written before the page went visual: the current week is written again once, with its charts.
  if (!stored.memo.view) return false;
  // Written before the line's weights were kept: a running week is written again once, so its chart can carry on before the open.
  if (!week.complete && !stored.memo.view.weights) return false;
  if (stored.memo.complete !== week.complete) return false;
  if ((stored.memo.endDay ?? null) !== (week.endDay ?? null)) return false;
  return week.complete || stored.day === today;
}

/**
 * The person's memo for `weekKey` (latest when null), writing this week's
 * (and last week's, the first time) when needed. Null when they hold no US
 * stock, so the page shows the example instead.
 */
export async function loadUserMemo(viewer: Viewer, userDoc: UserDoc | null, weekKey: string | null, now: Date = new Date()): Promise<MemoPageData | null> {
  if (!viewer.uid) return null;
  const uid = viewer.uid;
  // GATE: the memo follows `briefing_personal` for now (reasons on covered stocks only, every holding's facts otherwise).
  // A `portfolio_memo` feature id (anon: example only, free: covered, pro: open) would let /pricing name it.
  const source = await userHoldings(userDoc, (instrumentId) => canSeeLevels(viewer, instrumentId));
  if (!source) return null;
  const current = await currentWeek(source.holdings.map((holding) => holding.ticker), now);
  if (!current) return null;
  const { week, series, today } = current;
  // Reasons that weakened or broke go under "What could hurt"; a changed verdict rewrites the week.
  const reasons = await memoReasons(viewer, userDoc, source.holdings.map((holding) => holding.ticker));
  const signature = reasons.length > 0 ? `${source.signature}|${reasons.map((reason) => `${reason.ticker}:${reason.verdict}`).join(",")}` : source.signature;
  const prev = previousWeek(week, series.get("SPY"));

  const [stored, storedPrev] = await Promise.all([
    readMemo(uid, week.key).catch(() => null),
    readMemo(uid, prev.key).catch(() => null),
  ]);

  let latest = stored?.memo ?? null;
  const writes: Promise<void>[] = [];
  // Last week needs writing when there is none, or when the one on file was saved before the week ended.
  const prevNeeded = !storedPrev || !storedPrev.memo.complete;
  if (!isFresh(stored, week, today, signature)) {
    const weeks = prevNeeded ? [prev, week] : [week];
    const [events, shape] = await Promise.all([
      loadSpanEvents(source.holdings, spanOf(weeks, today)),
      loadShapeFacts(source, series)
        .catch(() => NO_SHAPE)
        .then((facts) => ({ ...facts, reasons })),
    ]);
    // Last week has no portfolio-shape lines: those are about today's holdings.
    const [current, backfill] = await Promise.all([
      writeMemo(source, week, today, series, events, shape, now),
      prevNeeded ? writeMemo(source, prev, today, series, events, NO_SHAPE, now) : Promise.resolve(null),
    ]);
    latest = current;
    writes.push(saveMemo(uid, { memo: current, day: today, signature }));
    if (backfill) writes.push(saveMemo(uid, { memo: backfill, day: today, signature }));
  }
  const saved = await Promise.allSettled(writes);
  for (const result of saved) if (result.status === "rejected") console.warn("[memo] save failed:", result.reason);

  const history = await listMemos(uid).catch(() => [] as MemoHistoryRow[]);
  // A save that failed (or has not shown up in the list yet) still lists the week on screen.
  if (latest && !history.some((row) => row.weekKey === latest!.weekKey)) {
    history.unshift(historyRow(latest));
    history.sort((a, b) => b.monday.localeCompare(a.monday));
  }
  if (!latest) return null;

  if (weekKey && weekKey !== latest.weekKey) {
    const asked = await readMemo(uid, weekKey).catch(() => null);
    if (asked) return { mode: "mine", memo: asked.memo, history, missingWeek: false };
    return { mode: "mine", memo: latest, history, missingWeek: true };
  }
  return { mode: "mine", memo: latest, history, missingWeek: false };
}
