import { NextResponse } from "next/server";

import { getCurrentMarket } from "@/lib/market";
import { getHomeView } from "@/lib/home-view";
import { getMarketSnapshot } from "@/lib/firestore";
import type { SnapshotRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const MARKET_CUE_ORDER: Record<"US" | "IN", string[]> = {
  US: ["US_IDX_SPX", "US_IDX_NDX", "US_MAC_VIX", "US_MAC_GOLD", "US_MAC_OIL"],
  IN: ["IN_IDX_NIFTY50", "IN_IDX_BANKNIFTY", "IN_IDX_VIX", "IN_MAC_GOLD", "IN_MAC_OIL"],
};

type HeroIndex = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

function fromRows(rows: SnapshotRow[], market: "US" | "IN"): HeroIndex[] {
  const byId = new Map(
    rows
      .map((r) => [String((r as unknown as { instrumentId?: string; instrument_id?: string }).instrumentId || (r as unknown as { instrument_id?: string }).instrument_id || ""), r] as const)
      .filter(([id]) => Boolean(id)),
  );
  return MARKET_CUE_ORDER[market]
    .map((id) => byId.get(id))
    .filter((row): row is SnapshotRow => Boolean(row))
    .map((row) => ({
      ticker: row.symbol || row.instrumentId,
      name: row.name || row.symbol || row.instrumentId,
      price: row.price?.current ?? 0,
      changePct: row.price?.changePct ?? 0,
    }));
}

export async function GET() {
  try {
    const market = getCurrentMarket();
    const view = await getHomeView(market).catch(() => null);
    let rows = view?.market_snapshot_rows ?? [];
    let indices = fromRows(rows, market);
    if (!rows.length || indices.length === 0) {
      rows = await getMarketSnapshot(market).catch(() => []);
      indices = fromRows(rows, market);
    }
    return NextResponse.json({ market, indices });
  } catch {
    return NextResponse.json({ market: "US", indices: [] });
  }
}
