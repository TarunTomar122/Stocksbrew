/** Shared chart constants/types — safe for client and server imports. */

export const PRICE_HISTORY_CHART_MIN = 20;

export type PriceHistoryPoint = {
  date: string;
  close: number;
};
