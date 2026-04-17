import { NextRequest, NextResponse } from "next/server";

import {
  assertTikrrApiKey,
  normalizeMarket,
  normalizeRunType,
  normalizeSymbol,
  saveStockLatestAndHistory,
} from "@/lib/tikrr-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      apiKey?: string;
      market?: string;
      symbol?: string;
      data?: Record<string, unknown>;
    };

    assertTikrrApiKey(body.apiKey);
    const market = normalizeMarket(body.market);
    const symbol = normalizeSymbol(body.symbol);
    const data = body.data || {};
    const runType = normalizeRunType(data.runType);

    const docId = await saveStockLatestAndHistory({
      market,
      symbol,
      runType,
      data,
    });

    return NextResponse.json({ success: true, symbol, docId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = message === "Invalid apiKey" ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
