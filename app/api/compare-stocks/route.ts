import { NextRequest, NextResponse } from "next/server";
import { compareStocks, MAX_COMPARE_TICKERS } from "@/lib/compare-stocks";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = Array.isArray(body.tickers) ? body.tickers : [];
    const tickers = raw
      .map((t: unknown) => String(t).trim().toUpperCase())
      .filter((t: string) => t.length > 0 && t.length <= 16);

    if (tickers.length < 2) {
      return NextResponse.json(
        { error: "Add at least 2 tickers to compare." },
        { status: 400 },
      );
    }

    if (tickers.length > MAX_COMPARE_TICKERS) {
      return NextResponse.json(
        { error: `Max ${MAX_COMPARE_TICKERS} tickers at a time.` },
        { status: 400 },
      );
    }

    const result = await compareStocks(tickers);
    return NextResponse.json(result);
  } catch (err) {
    console.error("compare-stocks error:", err);
    return NextResponse.json(
      { error: "Failed to compare stocks." },
      { status: 500 },
    );
  }
}
