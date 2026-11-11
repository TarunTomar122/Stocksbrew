import { adminFirestore } from "@/lib/firebase-admin";
import { loadCallEvidence } from "@/lib/call-evidence-data";
import { redactLevels } from "@/lib/entitlements";
import { plainCallReason, wholeSentences } from "@/lib/plain-copy";
import { getScreenerSymbolContext } from "@/lib/screener";
import { sharedCache } from "@/lib/shared-cache";
import { getStockIntelligenceDoc, getStockSummary } from "@/lib/stock";
import { buildStockRead, readLooksBroken } from "@/lib/stock-read";
import type { TasteCard } from "@/lib/landing-taste-shared";

/**
 * The landing page's taste: for a ticker someone types, the same call the stock page shows, today's move with its
 * time, and the call's first reason with its source. Read from the stored brief, the price doc and the screener
 * snapshot, the way components/stock-page-stream.tsx reads them. No model call, no levels: the reason goes through
 * `redactLevels`, and only the evidence line or the reason's first sentence is sent.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 10" from a YYYY-MM-DD day, or "" when it is not one. */
function shortDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${Number(match[3])}` : "";
}

async function loadTasteCard(ticker: string): Promise<TasteCard | null> {
  // A failed read throws (sharedCache must never keep a failure as "no stock"); a ticker we do not have is null.
  const stock = await getStockSummary(ticker, "US");
  if (!stock) return null;
  const [intelligence, context] = await Promise.all([
    getStockIntelligenceDoc(stock.instrument_id, "US"),
    getScreenerSymbolContext(stock.ticker).catch(() => null),
  ]);
  const row = context ? context.row ?? context.extra : null;
  const companyReason = row?.call_reason
    ? { text: row.call_reason, call: row.call ?? null, source: row.call_reason_source ?? null, asOf: context?.priceHistoryTo ?? null }
    : null;
  const built = buildStockRead(intelligence, { companyReason });
  // A brief written from a bot wall says nothing about the company; the stock page holds it back too.
  const read = built && !readLooksBroken(built) ? built : null;
  const call = read?.call ?? null;
  const price = typeof stock.price === "number" && Number.isFinite(stock.price) && stock.price > 0 ? stock.price : null;

  const lines: TasteCard["lines"] = [];
  if (read && call) {
    // The stock page's "Why" lines, each with its own source and date.
    const evidence = await loadCallEvidence({ ticker: stock.ticker, instrumentId: stock.instrument_id, call, price }).catch(() => null);
    for (const item of evidence?.evidence ?? []) lines.push({ id: item.id, text: item.text, source: item.source });
    if (lines.length === 0) {
      // Else the reason under the call, one sentence, with the day its figures are from.
      const text = wholeSentences(plainCallReason(redactLevels(read.actionSummary)), 1);
      const day = shortDay(read.reasonAsOf) || shortDay(read.writtenAt);
      if (text && day) lines.push({ id: "reason", text, source: read.reasonAsOf ? `Company figures as of ${day}` : `Our brief of ${day}` });
    }
  }

  return {
    ticker: stock.ticker,
    instrumentId: stock.instrument_id,
    name: stock.name || stock.ticker,
    call,
    dayPct: typeof stock.day_change_pct === "number" && Number.isFinite(stock.day_change_pct) ? stock.day_change_pct : null,
    priceAt: stock.captured_at ?? null,
    lines,
  };
}

/** One card per ticker, the same for every visitor, kept two minutes so the move stays close to live. */
export const getTasteCard = sharedCache(loadTasteCard, ["landing-taste-card-v4"], { revalidate: 120 });

/**
 * How many US stocks carry our call today: the screener job's own count of rows with a call
 * (`tm_screener_snapshot/US` meta `coverage.call`). Throws when it cannot be read, so a failure is never cached.
 */
export const getCallCount = sharedCache(
  async (): Promise<number> => {
    const doc = await adminFirestore.collection("tm_screener_snapshot").doc("US").get();
    const coverage = doc.exists ? (doc.data() as { coverage?: Record<string, unknown> }).coverage : undefined;
    const count = coverage?.call;
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) throw new Error("call_count_unavailable");
    return count;
  },
  ["landing-call-count-v1"],
  { revalidate: 3600 },
);
