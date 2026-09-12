import { NextRequest, NextResponse } from "next/server";
import {
  getStockSummary,
  getStockIntelPro,
  normalizeStockSymbolParam,
} from "@/lib/stock";
import { getLatestTechnicals } from "@/lib/technicals";
import type { VerdictApiResponse } from "@/lib/should-i-buy-types";
import { computeShouldIBuyVerdict } from "@/lib/should-i-buy-verdict";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const upper = normalizeStockSymbolParam(params.ticker);
  if (!upper) {
    return NextResponse.json({ state: "no_coverage" } satisfies VerdictApiResponse, { status: 400 });
  }

  const stock = await getStockSummary(upper, "US").catch(() => null);
  if (!stock) {
    return NextResponse.json({ state: "no_coverage" } satisfies VerdictApiResponse, { status: 404 });
  }

  const [intel, technicals] = await Promise.all([
    getStockIntelPro(stock.instrument_id, "US").catch(() => null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
  ]);

  const fmtPrice = (p: number) =>
    `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtChange = (p?: number) =>
    typeof p === "number" ? `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : null;

  if (!intel) {
    return NextResponse.json({
      state: "price_only",
      ticker: upper,
      name: stock.name,
      priceStr: fmtPrice(stock.price),
      priceChangeStr: fmtChange(stock.day_change_pct),
      logo_url: stock.logo_url,
    } satisfies VerdictApiResponse);
  }

  const rsi = technicals?.rsi_14?.value ?? null;
  const verdict = computeShouldIBuyVerdict(intel, rsi);
  const { valuation, growth, quality, momentum } = intel.pillars;

  return NextResponse.json({
    state: "full",
    ticker: upper,
    stock: {
      name: stock.name,
      priceStr: fmtPrice(stock.price),
      priceChangeStr: fmtChange(stock.day_change_pct),
      priceChange: stock.day_change_pct ?? null,
      logo_url: stock.logo_url,
      sector: stock.sector,
    },
    verdict: {
      level: verdict.level,
      headline: verdict.headline,
      color: verdict.color,
      bg: verdict.bg,
      textColor: verdict.textColor,
      reasons: verdict.reasons,
    },
    pillars: {
      valuation: { score: valuation.score, verdict: valuation.verdict },
      growth:    { score: growth.score,    verdict: growth.verdict },
      quality:   { score: quality.score,   verdict: quality.verdict },
      momentum:  { score: momentum.score,  verdict: momentum.verdict },
    },
    rsi,
    overall: { score: intel.overall.score },
  } satisfies VerdictApiResponse);
}
