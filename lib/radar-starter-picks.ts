import type { InterestingStockRow } from "@/lib/interesting-stocks";
import { LANDING_HERO_BREW_TICKERS } from "@/lib/landing-hero-featured";

export type RadarStarterPick = {
  instrument_id: string;
  ticker: string;
  name: string;
  hint: string;
  market: "US";
};

const FALLBACK_TICKERS = [
  ...LANDING_HERO_BREW_TICKERS,
  "AAPL",
  "GOOGL",
  "META",
] as const;

const FALLBACK_HINTS: Record<string, string> = {
  NVDA: "AI leader · high momentum",
  MU: "Memory cycle · semis",
  MSFT: "Quality mega-cap",
  PLTR: "Defense & data software",
  AMZN: "E-commerce & cloud",
  AAPL: "Consumer tech bellwether",
  GOOGL: "Search & cloud",
  META: "Social & ads",
};

export function buildRadarStarterPicks(
  interestingRows: InterestingStockRow[] | null | undefined,
  labelsById: Map<string, { ticker?: string; name?: string }>,
): RadarStarterPick[] {
  const seen = new Set<string>();
  const out: RadarStarterPick[] = [];

  const push = (instrument_id: string, ticker: string, name: string, hint: string) => {
    const key = instrument_id.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ instrument_id, ticker: ticker.toUpperCase(), name, hint, market: "US" });
  };

  if (interestingRows?.length) {
    for (const row of interestingRows.slice(0, 8)) {
      const label = labelsById.get(row.instrument_id);
      push(
        row.instrument_id,
        row.ticker,
        label?.name ?? row.name ?? row.ticker,
        row.headline?.trim() || row.setup_type?.replace(/_/g, " ") || "Top pick today",
      );
      if (out.length >= 6) return out;
    }
  }

  for (const ticker of FALLBACK_TICKERS) {
    const instrument_id = `US_${ticker}`;
    const label = labelsById.get(instrument_id);
    push(
      instrument_id,
      label?.ticker ?? ticker,
      label?.name ?? ticker,
      FALLBACK_HINTS[ticker] ?? "Popular in Watchlists",
    );
    if (out.length >= 6) break;
  }

  return out;
}

export function starterPickInstrumentIds(): string[] {
  return FALLBACK_TICKERS.map((t) => `US_${t}`);
}
