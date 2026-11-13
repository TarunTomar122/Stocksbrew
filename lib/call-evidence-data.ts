import { adminFirestore } from "@/lib/firebase-admin";
import { buildCallEvidence, type CalendarReport, type CallEvidence, type CallEvidenceInput, type ResultsReport } from "@/lib/call-evidence";
import { todayET } from "@/lib/calendar-shared";
import { getScreenerSymbolContext } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { getDailySeries } from "@/lib/screener-series";
import { sharedCache } from "@/lib/shared-cache";
import { getStockFacts, type StockFacts } from "@/lib/stock";
import type { CallWord } from "@/lib/stock-chart";
import { getStockCallHistory, getStockEarningsDates } from "@/lib/stock-events";
import { callChanges } from "@/lib/stock-chart";

/**
 * Server loaders for lib/call-evidence.ts: the stock page passes what it already read, and Ask reads it all here.
 * Read-only.
 */

/** Results reports (8-K item 2.02) from `tm_earnings_history`, newest first. Releases only. */
export const getResultsReports = sharedCache(
  async (ticker: string): Promise<ResultsReport[]> => {
    const id = earningsHistoryDocId(ticker);
    if (!id) return [];
    // A read that fails throws, so it is never cached as "no reports".
    const snap = await adminFirestore.collection("tm_earnings_history").doc(id).get();
    if (!snap.exists) return [];
    return resultsReportsFromDoc(snap.data() as { reports?: unknown });
  },
  ["call-evidence-results-reports-v2"],
  { revalidate: 6 * 3600 },
);

/** The doc id in `tm_earnings_history` for a ticker. */
export function earningsHistoryDocId(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\//g, "-");
}

/** The releases in a `tm_earnings_history` doc, newest first. Pure: the stock page's serving doc runs it on its copy. */
export function resultsReportsFromDoc(data: { reports?: unknown } | undefined): ResultsReport[] {
  const reports = data?.reports;
  const out: ResultsReport[] = [];
  for (const raw of Array.isArray(reports) ? reports : []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const date = String(row.date ?? "").slice(0, 10);
    if (row.release === false || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const periodEnd = String(row.period_end ?? "").slice(0, 10);
    const form = typeof row.periodic_form === "string" && /^10-[QK]$/.test(row.periodic_form) ? row.periodic_form : null;
    // The results release on SEC EDGAR, linked beside a condition its numbers back (lib/call-evidence.ts).
    const url = typeof row.url === "string" && /^https:\/\/www\.sec\.gov\//.test(row.url) ? row.url : null;
    out.push({ date, periodEnd: /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : null, form, url });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

/** The input from data the stock page or Ask already holds. */
export function callEvidenceInput(parts: {
  ticker: string;
  call: CallWord | null;
  today: string;
  price: number | null;
  facts: StockFacts | null;
  reports: ResultsReport[];
  calendar: ReadonlyArray<CalendarReport>;
  series: Record<string, Array<{ date: string; close: number }>> | null;
  priceSource?: string | null;
  row: ScreenerRow | null;
  steady: CallEvidenceInput["steady"];
  /** The next report as the page already shows it; else the first calendar row from today on. */
  next?: { event_date: string; eps_estimate?: number | null } | null;
  /** Say recent days in words ("yesterday"); only for a page rendered at request time. */
  sayDays?: boolean;
}): CallEvidenceInput {
  const { facts, row } = parts;
  const ticker = parts.ticker.toUpperCase();
  const fromCalendar = parts.calendar
    .filter((event) => /^\d{4}-\d{2}-\d{2}/.test(event.event_date) && event.event_date.slice(0, 10) >= parts.today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  const upcoming = parts.next && parts.next.event_date.slice(0, 10) >= parts.today ? parts.next : fromCalendar;
  return {
    ticker,
    call: parts.call,
    today: parts.today,
    sales: facts?.financials
      ? {
          revenue: facts.financials.revenue ?? null,
          growthPct: facts.financials.revenue_growth_yoy_pct ?? null,
          history: (facts.financial_history ?? []).map((item) => ({ period: item.period, revenue: item.revenue ?? null })),
          capturedAt: facts.captured_at ?? null,
        }
      : null,
    reports: parts.reports,
    calendar: parts.calendar,
    nextReport: upcoming ? { date: upcoming.event_date.slice(0, 10), epsEstimate: typeof upcoming.eps_estimate === "number" ? upcoming.eps_estimate : null } : null,
    series: parts.series?.[ticker] ?? null,
    benchmark: parts.series?.SPY ?? null,
    priceSource: parts.priceSource ?? null,
    valuation: row
      ? { pe: row.pe ?? null, medianPe: row.pe_hist_median ?? null, from: row.pe_hist_from ?? null, to: row.pe_hist_to ?? null, days: row.pe_hist_days ?? null }
      : null,
    dividend: facts?.dividends
      ? { annual: facts.dividends.annual_dividend ?? null, price: parts.price, growthYears: facts.dividends.growth_years ?? null, capturedAt: facts.captured_at ?? null }
      : null,
    steady: parts.steady,
    sayDays: parts.sayDays ?? false,
  };
}

/** Everything for one US stock, for Ask. Any read that fails leaves its lines out. */
export async function loadCallEvidence(input: {
  ticker: string;
  instrumentId: string;
  call: CallWord | null;
  price: number | null;
  /** The steady call's own start day (the brief's `directive_v2.stability.since`), when calls are held steady. */
  steadySince?: string | null;
}): Promise<CallEvidence> {
  const ticker = input.ticker.trim().toUpperCase();
  const steadySince = input.steadySince && /^\d{4}-\d{2}-\d{2}$/.test(input.steadySince) ? input.steadySince : null;
  const [facts, reports, calendar, daily, context, history] = await Promise.all([
    getStockFacts(input.instrumentId).catch(() => null),
    getResultsReports(ticker).catch(() => [] as ResultsReport[]),
    getStockEarningsDates("US", ticker).catch(() => []),
    getDailySeries([ticker, "SPY"]).catch(() => null),
    getScreenerSymbolContext(ticker).catch(() => null),
    steadySince ? getStockCallHistory(input.instrumentId).catch(() => []) : Promise.resolve([]),
  ]);
  return buildCallEvidence(
    callEvidenceInput({
      ticker,
      call: input.call,
      today: todayET(),
      price: input.price,
      facts,
      reports,
      calendar: calendar as unknown as CalendarReport[],
      series: daily?.series ?? null,
      priceSource: daily?.source ?? null,
      row: context?.row ?? null,
      // The same hold the stock page works out: the steady call's day, and which way its change on that day went.
      steady: steadySince ? { since: steadySince, lastStep: lastStepOn(callChanges(history), steadySince) } : null,
    }),
  );
}

const RANK = { Trim: 0, Hold: 1, Add: 2 } as const;

/** +1 when the call moved up on `since`, -1 when it moved down, 0 when it did not change that day. */
export function lastStepOn(changes: ReadonlyArray<{ date: string; from: CallWord | null; to: CallWord }>, since: string): -1 | 0 | 1 {
  const change = [...changes].reverse().find((item) => item.from && item.date.slice(0, 10) === since);
  if (!change?.from || change.from === change.to) return 0;
  return RANK[change.to] > RANK[change.from] ? 1 : -1;
}
