import { adminFirestore } from "@/lib/firebase-admin";

export interface PowerTrade {
  trade_id: string;
  person_id: string;
  person_name: string;
  chamber: string;
  party: string;
  state: string;
  ticker: string;
  company: string;
  tx_type: string;
  amount_low: number | null;
  amount_high: number | null;
  transaction_date: string;
  disclosure_date: string;
  lag_days: number | null;
  perf_pct: number | null;
  source: string;
  source_url: string;
  captured_at: string;
}

export interface PowerTradesResult {
  days: number;
  count: number;
  summary: { total: number; buys: number; sells: number; people: number };
  trades: PowerTrade[];
}

export async function getPowerTrades(days = 30): Promise<PowerTradesResult> {
  const windowDays = Math.min(Math.max(Math.round(days) || 30, 1), 60);
  const from = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);

  const snap = await adminFirestore
    .collection("tm_power_trades")
    .where("transaction_date", ">=", from)
    .orderBy("transaction_date", "desc")
    .limit(500)
    .get();

  const trades = snap.docs.map((d) => d.data() as PowerTrade);
  const buys = trades.filter((t) => t.tx_type === "buy").length;
  const sells = trades.filter((t) => t.tx_type === "sell").length;

  return {
    days: windowDays,
    count: trades.length,
    summary: {
      total: trades.length,
      buys,
      sells,
      people: new Set(trades.map((t) => t.person_id)).size,
    },
    trades,
  };
}
