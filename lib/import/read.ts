import { getLatestPriceQuotes, type LatestPriceQuote } from "@/lib/firestore";
import { getSnapshotFacts, type SnapshotFacts } from "@/lib/insight-data";
import type { Directory } from "@/lib/import/resolve";
import { firstSentence, type ReadCall, type ReadFacts, type ReadStock } from "@/lib/import/read-shared";
import { levelFree } from "@/lib/og/format";
import { plainCallReason } from "@/lib/plain-copy";
import { loadNextEarnings, newYorkToday } from "@/lib/portfolio-data";
import { getScreenerRows } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import type { EarningsDate } from "@/lib/portfolio-shared";

/**
 * Facts for the portfolio read, from data the pipeline already writes for
 * everyone: the screener snapshot (call, reason, sector, earnings), the
 * latest quotes (today's move) and the earnings calendar. Read-only; it writes
 * nothing and knows nothing about who is asking. Price zones and the levels
 * inside a reason are never copied out, so the result is safe to send to a
 * signed-out browser.
 */

export const MAX_READ_STOCKS = 40;

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function asCall(value: unknown): ReadCall | null {
  return value === "Add" || value === "Hold" || value === "Trim" ? value : null;
}

/** `ids` are instrument ids already checked against `directory`. */
export async function loadReadFacts(ids: string[], directory: Directory, now: Date = new Date()): Promise<ReadFacts> {
  const entries = [...directory.byTicker.values()];
  const byId = new Map(entries.map((entry) => [entry.instrument_id, entry]));
  const wanted = [...new Set(ids)].filter((id) => byId.has(id)).slice(0, MAX_READ_STOCKS);
  const tickers = wanted.map((id) => byId.get(id)!.ticker);
  const today = newYorkToday(now);
  const [rows, quotes, earnings, facts] = await Promise.all([
    getScreenerRows(tickers).catch(() => new Map<string, ScreenerRow>()),
    getLatestPriceQuotes(wanted).catch(() => new Map<string, LatestPriceQuote>()),
    loadNextEarnings(today).catch(() => new Map<string, EarningsDate>()),
    getSnapshotFacts(tickers).catch((): SnapshotFacts => ({ sectorOf: {}, spSectorWeights: {}, priceDay: null })),
  ]);
  const stocks: ReadStock[] = wanted.map((id) => {
    const entry = byId.get(id)!;
    const row = rows.get(entry.ticker);
    const quote = quotes.get(id)?.quote;
    const live = quotes.get(id);
    const price = fin(quote?.current) ? quote!.current : fin(row?.price) ? row!.price! : null;
    const dayPct = fin(quote?.day_change_pct) ? quote!.day_change_pct! : fin(row?.day_pct) ? row!.day_pct! : null;
    const next = earnings.get(entry.ticker);
    const earningsDate = next?.date ?? (typeof row?.earnings_date === "string" ? row.earnings_date.slice(0, 10) : null);
    const time = next?.time ?? row?.earnings_time;
    return {
      instrument_id: id,
      ticker: entry.ticker,
      name: row?.name || entry.name || entry.ticker,
      sector: row?.sector ?? facts.sectorOf[entry.ticker] ?? null,
      price,
      day_pct: dayPct,
      price_at: (fin(quote?.current) ? live?.captured_at : row?.price_at) ?? null,
      call: asCall(row?.call),
      call_at: typeof row?.call_at === "string" ? row.call_at.slice(0, 10) : null,
      // The thesis line first, then the action summary; a sentence that names a price level is dropped.
      reason: asCall(row?.call) ? firstSentence(levelFree(plainCallReason(row?.thesis)) ?? levelFree(plainCallReason(row?.call_reason))) : null,
      earnings_date: earningsDate && earningsDate >= today ? earningsDate : null,
      earnings_time: time === "bmo" || time === "amc" ? time : null,
    };
  });
  return {
    stocks,
    today,
    as_of: now.toISOString(),
  };
}
