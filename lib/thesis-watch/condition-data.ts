import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

import { fiscalQuarter, type ConditionInputs, type MetricValue, type ReportRef } from "./conditions";
import { loadStockFacts, tickerFromId } from "./data";
import type { StockFacts } from "./facts";

/**
 * The stored figures a reason's measurable conditions are checked against, for one stock (lib/thesis-watch/conditions.ts):
 * - the newest quarterly report: the company's 8-K results filing in `tm_earnings_history` (SEC EDGAR, item 2.02),
 *   refreshed every weekday after the close, before the reason checks run;
 * - revenue growth and the margins over the last twelve months: `tm_stock_facts/{id}.financials`, with the time they
 *   were stored (reporters' figures are refreshed on the report evening, about 18:00 New York);
 * - EPS against the estimate for that report: `tm_earnings_events/{TICKER}_{date}`;
 * - the price, the dividend and the P/E: the watcher's own facts for the day (lib/thesis-watch/data.ts).
 *
 * Read-only. Not the results-night loaders (lib/results/server.ts), which answer empty unless RESULTS_NIGHT is set:
 * these collections are read directly, so conditions work whatever that flag says.
 */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RawFigures = {
  /** `tm_stock_facts` fields: financials and the time they were stored. */
  facts: Record<string, unknown> | null;
  /** `tm_earnings_history/{TICKER}.reports`. */
  reports: unknown[] | null;
  /** The `tm_earnings_events` row for the newest report, when one is stored. */
  event: Record<string, unknown> | null;
};

/** The newest results release on or before `today`, with its fiscal quarter when the year's 10-K places it. Pure. */
export function newestReport(reports: unknown[] | null, today: string): ReportRef | null {
  if (!Array.isArray(reports)) return null;
  const rows = reports
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .filter((row) => row.release !== false && DAY_RE.test(String(row.date ?? "")) && String(row.date) <= today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = rows[0];
  if (!latest) return null;
  return {
    date: String(latest.date),
    quarter: quarterOf(rows, 0),
    acceptedAt: str(latest.accepted_at),
    url: str(latest.url) ?? str(latest.index_url),
  };
}

/**
 * The fiscal quarter of the release at `index` (rows newest first): whole quarters since the newest 10-K period before
 * it. A release whose 10-Q or 10-K is not filed yet (no period end) is the quarter after the release before it.
 */
function quarterOf(rows: Array<Record<string, unknown>>, index: number): string | null {
  const row = rows[index];
  if (!row) return null;
  const periodEnd = str(row.period_end);
  if (!periodEnd) {
    const before = index + 1 < rows.length && index < 2 ? quarterOf(rows, index + 1) : null;
    return before ? `Q${(Number(before.slice(1)) % 4) + 1}` : null;
  }
  const yearEnd = rows.slice(index + 1).find((other) => other.periodic_form === "10-K" && str(other.period_end) && String(other.period_end) < periodEnd)?.period_end;
  return fiscalQuarter(periodEnd, str(yearEnd), str(row.periodic_form));
}

function pct(part: unknown, whole: unknown): number | null {
  return fin(part) && fin(whole) && whole > 0 ? (part / whole) * 100 : null;
}

/** The inputs a condition is judged on, from the raw reads and the day's facts. Pure. */
export function conditionInputsOf(ticker: string, raw: RawFigures, facts: StockFacts | null, today: string): ConditionInputs {
  const values: ConditionInputs["values"] = {};
  const report = newestReport(raw.reports, today);
  const stockHref = `/stock/${encodeURIComponent(ticker)}`;

  const doc = raw.facts;
  const financials = (doc?.financials ?? null) as Record<string, unknown> | null;
  const storedAt = str(doc?.financial_depth_updated_at) ?? str(doc?.captured_at) ?? str(doc?.updated_at);
  if (financials && storedAt) {
    const results = (value: number): MetricValue => ({ value, asOf: storedAt, source: "Company results, last 12 months", href: stockHref });
    if (fin(financials.revenue_growth_yoy_pct)) values.revenue_growth = results(financials.revenue_growth_yoy_pct);
    const gross = pct(financials.gross_profit, financials.revenue);
    if (gross !== null) values.gross_margin = results(gross);
    const operating = pct(financials.operating_income, financials.revenue);
    if (operating !== null) values.operating_margin = results(operating);
  }

  const event = raw.event;
  if (event && report) {
    const actual = event.reported_eps;
    const estimate = fin(event.estimated_eps) ? event.estimated_eps : event.eps_estimate;
    const surprise = fin(event.eps_surprise_pct) ? event.eps_surprise_pct : fin(actual) && fin(estimate) && estimate !== 0 ? ((actual - estimate) / Math.abs(estimate)) * 100 : null;
    const at = str(event.actuals_captured_at) ?? str(event.captured_at);
    if (fin(actual) && surprise !== null && at) {
      values.eps_surprise = {
        value: surprise,
        asOf: at,
        source: event.actuals_source === "nasdaq_calendar" || event.source === "nasdaq_calendar" ? "Nasdaq earnings calendar" : "Earnings calendar",
        href: stockHref,
        reportDate: report.date,
      };
    }
  }

  if (facts?.close) values.price = { value: facts.close.value, asOf: facts.close.day, source: "Daily closes", href: stockHref };
  if (facts?.lastDividend) {
    values.dividend = {
      value: facts.lastDividend.amount,
      asOf: facts.day,
      source: "Dividend history",
      href: "/portfolio/dividends",
      stoppedSince: facts.dividendStop ? facts.dividendStop.lastExDate : null,
    };
  }
  if (facts && fin(facts.pe)) values.pe = { value: facts.pe, asOf: facts.day, source: "Our daily screen", href: stockHref };
  return { ticker, report, values };
}

/** Days either side of the 8-K date the calendar may file the same report under. */
const EVENT_DAY_SLACK = [0, -1, 1];

function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const docKey = (ticker: string) => ticker.toUpperCase().replace(/\//g, "-");

async function readRaw(instrumentId: string, ticker: string, today: string): Promise<RawFigures> {
  const key = docKey(ticker);
  const [factsSnap, historySnap] = await adminFirestore.getAll(
    adminFirestore.collection("tm_stock_facts").doc(instrumentId),
    adminFirestore.collection("tm_earnings_history").doc(key),
    { fieldMask: ["financials", "financial_depth_updated_at", "captured_at", "updated_at", "reports"] },
  );
  const facts = factsSnap?.exists ? ((factsSnap.data() ?? null) as Record<string, unknown> | null) : null;
  const reports = historySnap?.exists ? ((historySnap.data() as Record<string, unknown> | undefined)?.reports as unknown[] | undefined) ?? null : null;
  const report = newestReport(reports, today);
  let event: Record<string, unknown> | null = null;
  if (report) {
    const snaps = await adminFirestore.getAll(...EVENT_DAY_SLACK.map((days) => adminFirestore.collection("tm_earnings_events").doc(`${key}_${shift(report.date, days)}`)));
    const found = snaps.find((snap) => snap.exists && fin((snap.data() as Record<string, unknown> | undefined)?.reported_eps));
    event = found ? ((found.data() ?? null) as Record<string, unknown> | null) : null;
  }
  return { facts, reports, event };
}

// Ten minutes: a report's figures land in the evening and the nightly run must see them; a page visit is cheap.
const readRawCached = unstable_cache(readRaw, ["thesis-condition-figures-v1"], { revalidate: 600 });

/** Inputs per instrument id for these stocks; a stock whose read fails is left out (its conditions are not judged). */
export async function loadConditionInputs(
  stocks: ReadonlyArray<{ instrumentId: string; ticker: string }>,
  facts: ReadonlyMap<string, StockFacts>,
  today: string,
): Promise<Map<string, ConditionInputs>> {
  const out = new Map<string, ConditionInputs>();
  await Promise.all(
    stocks.map(async (stock) => {
      const raw = await readRawCached(stock.instrumentId, stock.ticker, today).catch((error) => {
        console.warn("[thesis-conditions] figures read failed:", error instanceof Error ? error.message : "unknown error");
        return null;
      });
      if (raw) out.set(stock.instrumentId, conditionInputsOf(stock.ticker, raw, facts.get(stock.instrumentId) ?? null, today));
    }),
  );
  return out;
}

/** The inputs for these stocks on `today`, facts and all: the menu's current figures and the route's check. */
export async function conditionInputsFor(instrumentIds: readonly string[], today: string): Promise<Map<string, ConditionInputs>> {
  const stocks = instrumentIds.filter((id) => id.startsWith("US_")).map((id) => ({ instrumentId: id, ticker: tickerFromId(id) }));
  if (stocks.length === 0) return new Map();
  const facts = await loadStockFacts(stocks, today);
  return loadConditionInputs(stocks, facts, today);
}
