import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { batchGetRefs, getLatestPriceQuotes } from "@/lib/firestore";

export type MacroTick = {
  instrument_id: string;
  ticker: string;
  name: string;
  price?: number | null;
  day_change_pct?: number | null;
  from_52w_high_pct?: number | null;
};

const MACRO_TICKERS: Record<
  "US" | "IN",
  Array<{ id: string; display: string; name: string }>
> = {
  US: [
    { id: "US_IDX_SPX", display: "S&P 500", name: "Broad market" },
    { id: "US_IDX_NDX", display: "Nasdaq 100", name: "Big tech" },
    { id: "US_MAC_GOLD", display: "Gold", name: "Gold futures" },
    { id: "US_MAC_SILVER", display: "Silver", name: "Silver futures" },
    { id: "US_MAC_OIL", display: "Crude Oil", name: "WTI crude futures" },
    { id: "US_MAC_VIX", display: "VIX", name: "Volatility index" },
  ],
  IN: [
    { id: "IN_IDX_NIFTY50", display: "Nifty 50", name: "Broad market" },
    { id: "IN_IDX_BANKNIFTY", display: "Bank Nifty", name: "Banks" },
  ],
};

async function getMacroStripUncached(
  market: "US" | "IN" = "US",
): Promise<MacroTick[]> {
  const cfg = MACRO_TICKERS[market] ?? [];
  if (cfg.length === 0) return [];
  const byId = await getLatestPriceQuotes(cfg.map((c) => c.id));

  const technicalRefs = cfg.map((c) =>
    adminFirestore.collection("tm_stock_technicals_latest").doc(c.id),
  );
  const technicals = await batchGetRefs<{ distance?: { from_52w_high_pct?: number } }>(
    technicalRefs,
  ).catch(() => new Map<string, { distance?: { from_52w_high_pct?: number } }>());

  const out: MacroTick[] = [];
  for (const c of cfg) {
    const doc = byId.get(c.id);
    const quote = doc?.quote;
    out.push({
      instrument_id: c.id,
      ticker: c.display,
      name: c.name,
      price: typeof quote?.current === "number" ? quote.current : null,
      day_change_pct:
        typeof quote?.day_change_pct === "number" ? quote.day_change_pct : null,
      from_52w_high_pct:
        typeof technicals.get(c.id)?.distance?.from_52w_high_pct === "number"
          ? technicals.get(c.id)!.distance!.from_52w_high_pct
          : null,
    });
  }
  return out;
}

const getMacroStripCached = unstable_cache(
  getMacroStripUncached,
  ["macro-strip"],
  { revalidate: 60 },
);

export async function getMacroStrip(
  market: "US" | "IN" = "US",
): Promise<MacroTick[]> {
  return getMacroStripCached(market);
}
