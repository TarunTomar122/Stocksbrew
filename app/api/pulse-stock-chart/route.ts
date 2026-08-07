import { NextRequest, NextResponse } from "next/server";

import { getLatestTechnicals } from "@/lib/technicals";
import { getStockFundamentals, getStockPriceHistory } from "@/lib/stock";

export async function GET(req: NextRequest) {
  const instrumentId = req.nextUrl.searchParams.get("instrument_id")?.trim();
  if (!instrumentId) return NextResponse.json({ error: "instrument_id is required" }, { status: 400 });

  const [data, fundamentals, technicals] = await Promise.all([
    getStockPriceHistory(instrumentId).catch(() => []),
    getStockFundamentals(instrumentId).catch(() => null),
    getLatestTechnicals(instrumentId).catch(() => null),
  ]);

  return NextResponse.json({
    data,
    week52High: fundamentals?.week_52_high ?? null,
    week52Low: fundamentals?.week_52_low ?? null,
    rsi14: technicals?.rsi_14?.value ?? null,
    rsiState: technicals?.rsi_14?.state ?? null,
  });
}
