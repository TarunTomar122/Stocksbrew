export type ChartRangeKey = "3m" | "6m" | "1y";

type PricePoint = { date: string; close: number };

export type StockReturns = {
  one_month_pct?: number | null;
  three_month_pct?: number | null;
  six_month_pct?: number | null;
  one_year_pct?: number | null;
};

const RANGE_SESSIONS: Record<ChartRangeKey, number> = {
  "3m": 63,
  "6m": 126,
  "1y": 252,
};

export function sliceChartRange(data: PricePoint[], key: ChartRangeKey): PricePoint[] {
  if (data.length < 5) return data;
  const sessions = RANGE_SESSIONS[key];
  return data.length > sessions ? data.slice(-sessions) : data;
}
