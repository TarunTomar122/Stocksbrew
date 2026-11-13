/**
 * The reader half of the stock facts checks (backend/facts_quality.py is the writer's, and the same rules).
 *
 * The page shows nothing rather than a wrong number. The facts job now checks each figure against the source's
 * own other tables before storing it, and keeps anything it held back in the doc's `withheld` list, which is for
 * us and is removed here so it never reaches a page. A doc written before those checks (no
 * `financials.revenue_growth_basis`) gets the two that need nothing but the doc itself:
 *
 * - four-quarter sales growth that cannot fit the fiscal years beside it. Growth g on TTM sales R puts the four
 *   quarters a year earlier at R / (1 + g); those quarters end between the last two fiscal years' ends, so their
 *   sales sit between those years' sales, give or take lumpy quarters (Honeywell, Nov 2026: +80% on $37.7B puts
 *   them at $21.0B, against $34.7B and $37.4B for fiscal 2024 and 2025).
 * - money amounts in another currency: sales several times larger than the source's own price-to-sales ratio
 *   allows (TSMC's Taiwan-dollar sales printed as "$4.9T"). Growth and margins are unit-free and stay.
 *
 * Pure.
 */

import type { StockFacts } from "@/lib/stock";

/** How far outside the two fiscal years the year-earlier quarters may sit (backend BRACKET_TOLERANCE). */
export const BRACKET_TOLERANCE = 0.15;
/** Stored sales this many times what the source's price-to-sales allows are in another currency. */
export const FOREIGN_RATIO_FACTOR = 4;

const MONEY_KEYS = ["revenue", "gross_profit", "operating_income", "net_income", "free_cash_flow", "eps_diluted"] as const;
const BALANCE_KEYS = ["cash_and_investments", "total_debt", "net_cash"] as const;

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Revenue per fiscal year ("FY 2025") with a positive figure. */
function fiscalYears(history: StockFacts["financial_history"]): Map<number, number> {
  const years = new Map<number, number>();
  for (const row of history ?? []) {
    const match = /^FY\s*(\d{4})$/i.exec(String(row?.period ?? "").trim());
    if (match && fin(row.revenue) && row.revenue > 0) years.set(Number(match[1]), row.revenue);
  }
  return years;
}

/** True when a four-quarter growth figure cannot be right given the doc's own fiscal years. */
export function growthOutsideFiscalYears(
  revenue: number | null | undefined,
  growthPct: number | null | undefined,
  history: StockFacts["financial_history"],
): boolean {
  if (!fin(revenue) || !fin(growthPct) || revenue <= 0 || growthPct <= -100) return false;
  const years = fiscalYears(history);
  if (!years.size) return false;
  const latest = Math.max(...years.keys());
  const last = years.get(latest);
  const before = years.get(latest - 1);
  if (last === undefined || before === undefined) return false;
  const prior = revenue / (1 + growthPct / 100);
  const low = Math.min(last, before);
  const high = Math.max(last, before);
  return prior < low * (1 - BRACKET_TOLERANCE) || prior > high * (1 + BRACKET_TOLERANCE);
}

/** True when the stored money amounts look like another currency's (see the file comment). */
export function amountsInOtherCurrency(facts: Pick<StockFacts, "financials" | "quick_stats" | "valuation">): boolean {
  const revenue = facts.financials?.revenue;
  const cap = facts.quick_stats?.market_cap;
  const ratio = facts.valuation?.price_to_sales;
  if (!fin(revenue) || !fin(cap) || !fin(ratio) || revenue <= 0 || cap <= 0 || ratio <= 0) return false;
  return (cap / revenue) * FOREIGN_RATIO_FACTOR < ratio;
}

function withoutKeys<T extends object>(row: T, keys: readonly string[]): T {
  const out = { ...row } as Record<string, unknown>;
  for (const key of keys) if (key in out) out[key] = null;
  return out as T;
}

/**
 * The facts as a page may use them: never the `withheld` list, and on a doc the writer did not check, no growth or
 * amounts that fail the checks above. Returns the input unchanged when there is nothing to take out.
 */
export function guardFacts<T extends StockFacts | null | undefined>(facts: T): T {
  if (!facts || typeof facts !== "object") return facts;
  let out = facts as StockFacts;
  if ("withheld" in out) {
    const { withheld: _withheld, ...rest } = out;
    out = rest as StockFacts;
  }
  const financials = out.financials;
  // Checked by the writer (the key is there, even when null): trust what it stored.
  if (!financials || "revenue_growth_basis" in financials) return out as T;
  if (growthOutsideFiscalYears(financials.revenue, financials.revenue_growth_yoy_pct, out.financial_history)) {
    out = { ...out, financials: { ...financials, revenue_growth_yoy_pct: null } };
  }
  if (amountsInOtherCurrency(out)) {
    out = {
      ...out,
      financials: out.financials ? withoutKeys(out.financials, MONEY_KEYS) : out.financials,
      financial_history: out.financial_history?.map((row) => withoutKeys(row, MONEY_KEYS)),
      balance: out.balance ? withoutKeys(out.balance, BALANCE_KEYS) : out.balance,
    };
  }
  return out as T;
}
