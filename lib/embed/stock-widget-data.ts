/**
 * What the embeddable stock card shows (lib/embed/stock-widget.ts), read from the same stores as the stock page's
 * share card (lib/og/data.ts stockCard): the live quote, the screener row's call and reason, and three months of
 * closes. Server only. Each read has its own time budget, so one slow store leaves a part out instead of stalling
 * the card; nothing is made up to fill a gap.
 *
 * Anonymous and public: no session is read, and the reason passes through levelFree, so no price level or zone
 * (paid on most stocks, lib/entitlements-server.ts) ever reaches another site.
 */

import { unstable_cache } from "next/cache";

import { onDayWords, etDayOf, etToday } from "@/lib/day-words";
import { ogPrice, ogWindow } from "@/lib/og/format";
import { shortCompanyName } from "@/lib/plain-copy";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";
import { getDailySeries } from "@/lib/screener-series";
import { redactLevels } from "@/lib/entitlements";
import { getSeoStockPage } from "@/lib/seo/stock-pages";
import { getStockSummary } from "@/lib/stock";
import { logoSrc } from "@/lib/stock-logo-sources";
import { widgetReason, type WidgetCall, type WidgetStock } from "@/lib/embed/stock-widget";

const getQuoteCached = unstable_cache((symbol: string) => getStockSummary(symbol, "US"), ["embed-stock-summary-v1"], { revalidate: 300 });

/** A read with a time budget: `ok` false when it threw or ran past `ms`, so "no such stock" and "the store is slow"
 * stay apart (a read that answers null has answered). */
async function settle<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });
  try {
    return await Promise.race([promise.then((value) => ({ ok: true as const, value }), () => ({ ok: false as const })), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asCall(value: unknown): WidgetCall | null {
  return value === "Add" || value === "Hold" || value === "Trim" ? value : null;
}

/**
 * What the route answers with:
 * - "ok": the card. `partial` when a read failed or timed out, so the card is missing a part it would normally have;
 *   the route caches that for seconds, not minutes.
 * - "missing": every read answered and none knows the ticker (404).
 * - "unavailable": a read failed and nothing else knows the ticker. That is our outage, not a bad ticker: the route
 *   answers 503 so Varnish keeps serving the last good card (stale-if-error) instead of "we don't have NVDA".
 */
export type WidgetLoad = { kind: "ok"; stock: WidgetStock; partial: boolean } | { kind: "missing" } | { kind: "unavailable" };

/** A full trading quarter of closes, below which the line is drawn without claiming "3 months". */
const QUARTER_SESSIONS = 60;

/**
 * Whether we know this ticker, checked without making a cache entry for it. The per-symbol reads below are each
 * cached under the symbol (unstable_cache), and iframe loads skip the per-visitor page limit, so a made-up ticker
 * must never reach them: /embed/stock/<anything> would grow the cache without bound. The same order as the stock
 * page (app/(app)/stock/[symbol]/page.tsx): the checked-in catalogue, then the screener snapshot (cached per shard,
 * shared by every page), then one uncached summary read for a long-tail stock the store holds.
 */
export async function resolveWidgetTicker(symbol: string): Promise<"known" | "missing" | "unavailable"> {
  if (getSeoStockPage(symbol)) return "known";
  const snapshot = await settle(getScreenerSnapshot(), 2500);
  if (snapshot.ok && snapshot.value && [...snapshot.value.rows, ...snapshot.value.extras].some((row) => row.symbol === symbol)) return "known";
  const summary = await settle(getStockSummary(symbol, "US"), 2000);
  if (!summary.ok) return "unavailable";
  if (summary.value && summary.value.source !== "none") return "known";
  // The snapshot could not be read either: we cannot tell an unknown ticker from a covered one we failed to check.
  return snapshot.ok && snapshot.value ? "missing" : "unavailable";
}

export async function loadWidgetStock(symbol: string): Promise<WidgetLoad> {
  const known = await resolveWidgetTicker(symbol);
  if (known !== "known") return { kind: known };
  const [rowsRead, summaryRead, seriesRead] = await Promise.all([
    settle(getScreenerRows([symbol]), 2500),
    settle(getQuoteCached(symbol), 1500),
    settle(getDailySeries([symbol]), 2000),
  ]);
  const failed = !rowsRead.ok || !summaryRead.ok || !seriesRead.ok;
  const rows = rowsRead.ok ? rowsRead.value : null;
  const summary = summaryRead.ok ? summaryRead.value : null;
  const seriesSet = seriesRead.ok ? seriesRead.value : null;
  const row = rows?.get(symbol) ?? null;
  const live = summary && summary.source !== "none" && finite(summary.price) && summary.price > 0 ? summary : null;
  if (!row && !live) return !rowsRead.ok || !summaryRead.ok ? { kind: "unavailable" } : { kind: "missing" };

  // Price, move and the day they are from come from one source, so the move never sits beside another day's label.
  // Live quote with its move first; else the screener row's price and move; else the live price alone.
  const rowQuote = row && finite(row.price) && row.price > 0 ? { price: row.price, pct: finite(row.day_pct) ? row.day_pct : null, at: row.price_at ?? null } : null;
  const quote =
    live && finite(live.day_change_pct)
      ? { price: live.price, pct: live.day_change_pct, at: live.captured_at ?? null }
      : rowQuote ?? (live ? { price: live.price, pct: null, at: live.captured_at ?? null } : null);
  const price = quote?.price ?? null;
  const dayPct = quote?.pct ?? null;
  const priceAt = quote?.at ?? null;
  const quoteDay = etDayOf(priceAt);
  const today = etToday();

  const call = asCall(row?.call);
  // Two filters: levelFree (inside widgetReason) and the paywall's own redactLevels, which also catches a level
  // written without a dollar sign ("adding near 178.60"). Levels are paid on most stocks; this card is public.
  const reason = call ? widgetReason(redactLevels(row?.thesis), redactLevels(row?.call_reason)) : null;

  // The line ends on the day the price is from, so its last point is the price on the card.
  const history = (seriesSet?.series[symbol] ?? []).filter((point) => !quoteDay || point.date.slice(0, 10) <= quoteDay);
  const closes = history.map((point) => point.close);
  const lastDay = history.length ? history[history.length - 1]!.date.slice(0, 10) : null;
  if (price !== null && quoteDay && lastDay && lastDay < quoteDay) closes.push(price);
  const window = ogWindow(closes, 63);
  const fullQuarter = window.values.length >= QUARTER_SESSIONS;

  const rawName = live?.name ?? row?.name ?? null;
  const name = rawName ? shortCompanyName(rawName) || null : null;
  return {
    kind: "ok",
    partial: failed,
    stock: {
      symbol,
      name,
      price: ogPrice(price),
      dayPct,
      dayLabel: quoteDay ? onDayWords(quoteDay, today) : "",
      call,
      reason,
      spark: window.values.length > 1 ? window.values : null,
      sparkLabel: fullQuarter ? "3 months" : null,
      sparkPct: fullQuarter ? window.pct : null,
      logo: logoSrc(symbol),
    },
  };
}
