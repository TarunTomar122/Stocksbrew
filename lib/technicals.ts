import { adminFirestore } from "@/lib/firebase-admin";

export type RsiSignal = {
  value?: number;
  state?: "overbought" | "oversold" | "neutral" | "insufficient_data" | string;
};

export type MovingAverages = {
  sma_20?: number | null;
  sma_50?: number | null;
  sma_200?: number | null;
  ema_20?: number | null;
  ema_20_slope_state?: "rising" | "falling" | "flat" | "insufficient_data" | string;
  price_vs_sma_20?: "above" | "below" | "insufficient_data" | string;
  price_vs_sma_50?: "above" | "below" | "insufficient_data" | string;
  price_vs_sma_200?: "above" | "below" | "insufficient_data" | string;
};

export type DistanceSignals = {
  from_52w_high_pct?: number | null;
  from_52w_low_pct?: number | null;
};

export type StockTechnicals = {
  instrument_id: string;
  ticker?: string;
  as_of_date?: string;
  generated_at?: string;
  rsi_14?: RsiSignal;
  moving_averages?: MovingAverages;
  distance?: DistanceSignals;
};

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getLatestTechnicals(
  instrumentId: string,
  lookbackDays: number = 7,
): Promise<StockTechnicals | null> {
  const now = new Date();
  const ids: string[] = [];
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    ids.push(`${instrumentId}_${formatDate(d)}`);
  }
  const docs = await Promise.all(
    ids.map((id) => adminFirestore.collection("tm_stock_technicals").doc(id).get()),
  );
  for (const doc of docs) {
    if (doc.exists) return doc.data() as StockTechnicals;
  }
  return null;
}
