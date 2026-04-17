import { NextRequest, NextResponse } from "next/server";

import { fetchChart, type YahooRange } from "@/lib/yahoo-finance";

const VALID_RANGES: YahooRange[] = ["1D", "1W", "1M", "1Y", "5Y", "MAX"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const marketRaw = (searchParams.get("market") || "us").toLowerCase();
  const rangeRaw = (searchParams.get("range") || "1Y").toUpperCase() as YahooRange;

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!VALID_RANGES.includes(rangeRaw)) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }
  const market = marketRaw === "india" ? "india" : "us";

  const chart = await fetchChart(symbol, market, rangeRaw);
  if (!chart) {
    return NextResponse.json(null, { status: 200 });
  }
  return NextResponse.json(chart, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
