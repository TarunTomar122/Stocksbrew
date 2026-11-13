/**
 * The covered stocks' data-quality counts, for the owner's System tab.
 *
 * backend/agentdata/data_quality.py (meant as the last step of the after-close group, backend/agentdata/schedule.py)
 * writes `tm_data_quality/latest` (and a copy per day): for every covered US stock, the figures its page and the briefing show held to each other (sales growth
 * against the fiscal years, amounts in another currency, margins, P/E against price over EPS, the past year's range,
 * market value against price times shares, dividends, EPS against the forecast, dates, freshness), with a count and
 * the worst offenders per rule, and what the facts job withheld or corrected. Offender rows carry tickers and
 * figures only. This module reads that doc and checks its shape; `parseDataQuality` is pure, for tests and pages
 * that already hold the doc. Admin only: call it after verifying the admin cookie.
 */

export type DataQualitySeverity = "error" | "warn";

export type DataQualityOffender = {
  ticker: string;
  /** The field the rule looked at ("financials.revenue_growth_yoy_pct", "pe", "hi_52w"). */
  field: string;
  /** The figure as stored or shown. */
  value: number | string | null;
  /** What it should be near, when the rule can say ("expected": price over EPS for a P/E). */
  expected?: number | null;
  /** The rule's own words on why, for us (never for a stock page). */
  note?: string;
  /** Anything else the rule kept beside the figure (the fiscal year's growth, the price, the report day). */
  context?: Record<string, number | string>;
};

export type DataQualityRule = {
  id: string;
  label: string;
  severity: DataQualitySeverity;
  /** Stocks the rule flags. */
  count: number;
  /** Up to ten, worst first. */
  worst: DataQualityOffender[];
};

export type DataQuality = {
  /** When the check ran (ISO). */
  asOf: string;
  /** Covered stocks checked. */
  stocks: number;
  /** Stocks flagged per severity, summed over the rules (a stock can count under several). */
  totals: { error: number; warn: number };
  rules: DataQualityRule[];
  /** What the facts job held back or corrected, by "rule:action" ("ttm_growth_vs_quarters:withheld"). */
  withheld: Record<string, number>;
};

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function offender(raw: unknown): DataQualityOffender | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const ticker = text(row.ticker);
  if (!ticker) return null;
  const value = fin(row.value) || typeof row.value === "string" ? (row.value as number | string) : null;
  const context: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(row)) {
    if (["ticker", "field", "value", "expected", "note"].includes(key)) continue;
    if (fin(item) || (typeof item === "string" && item)) context[key] = item as number | string;
  }
  return {
    ticker,
    field: text(row.field),
    value,
    ...(fin(row.expected) ? { expected: row.expected } : {}),
    ...(text(row.note) ? { note: text(row.note) } : {}),
    ...(Object.keys(context).length ? { context } : {}),
  };
}

/** The stored doc in a known shape, or null when it is not one. Pure. */
export function parseDataQuality(raw: unknown): DataQuality | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  const asOf = text(doc.as_of);
  if (!asOf || !Array.isArray(doc.rules)) return null;
  const rules: DataQualityRule[] = [];
  for (const item of doc.rules) {
    if (!item || typeof item !== "object") continue;
    const rule = item as Record<string, unknown>;
    const id = text(rule.id);
    if (!id || !fin(rule.count)) continue;
    rules.push({
      id,
      label: text(rule.label) || id,
      severity: rule.severity === "error" ? "error" : "warn",
      count: rule.count,
      worst: Array.isArray(rule.worst) ? rule.worst.map(offender).filter((row): row is DataQualityOffender => row !== null) : [],
    });
  }
  const totals = (doc.totals ?? {}) as Record<string, unknown>;
  const withheld: Record<string, number> = {};
  for (const [key, value] of Object.entries((doc.withheld ?? {}) as Record<string, unknown>)) if (fin(value)) withheld[key] = value;
  return {
    asOf,
    stocks: fin(doc.stocks) ? doc.stocks : 0,
    totals: { error: fin(totals.error) ? totals.error : 0, warn: fin(totals.warn) ? totals.warn : 0 },
    rules,
    withheld,
  };
}

/** The latest run, or null when there is none yet (or it cannot be read). */
export async function loadDataQuality(): Promise<DataQuality | null> {
  const { adminFirestore } = await import("@/lib/firebase-admin");
  try {
    const snap = await adminFirestore.collection("tm_data_quality").doc("latest").get();
    return snap.exists ? parseDataQuality(snap.data()) : null;
  } catch {
    return null;
  }
}
