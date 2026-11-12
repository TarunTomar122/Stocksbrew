/**
 * The ready-made mixes the backtester offers. Pure, so the client form and the
 * server page read the same list. The first is the one /backtest opens on.
 */

export type ExampleMix = {
  /** Short name for a menu. */
  label: string;
  holdings: { symbol: string; weight: number }[];
};

export const EXAMPLE_MIXES: ExampleMix[] = [
  { label: "60% stocks, 40% bonds", holdings: [{ symbol: "SPY", weight: 60 }, { symbol: "TLT", weight: 40 }] },
  {
    label: "Five big tech names",
    holdings: [
      { symbol: "AAPL", weight: 20 },
      { symbol: "MSFT", weight: 20 },
      { symbol: "NVDA", weight: 20 },
      { symbol: "AMZN", weight: 20 },
      { symbol: "GOOGL", weight: 20 },
    ],
  },
  { label: "Stocks, bonds and gold", holdings: [{ symbol: "SPY", weight: 50 }, { symbol: "IEF", weight: 30 }, { symbol: "GLD", weight: 20 }] },
];
