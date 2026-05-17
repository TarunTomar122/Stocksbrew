import { NextRequest, NextResponse } from "next/server";
import { analyzePortfolio } from "@/lib/portfolio-analyzer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = Array.isArray(body.tickers) ? body.tickers : [];
    const tickers = raw
      .map((t: unknown) => String(t).trim().toUpperCase())
      .filter((t: string) => t.length > 0 && t.length <= 16);

    if (tickers.length < 1) {
      return NextResponse.json(
        { error: "At least one ticker is required." },
        { status: 400 },
      );
    }

    if (tickers.length > 30) {
      return NextResponse.json(
        { error: "Max 30 tickers per analysis." },
        { status: 400 },
      );
    }

    const result = await analyzePortfolio(tickers);
    return NextResponse.json(result);
  } catch (err) {
    console.error("portfolio-analyzer error:", err);
    return NextResponse.json(
      { error: "Failed to analyze portfolio." },
      { status: 500 },
    );
  }
}
