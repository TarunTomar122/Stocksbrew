import { NextRequest, NextResponse } from "next/server";
import {
  getStockSummary,
  getStockIntelPro,
  normalizeStockSymbolParam,
} from "@/lib/stock";
import { getLatestTechnicals } from "@/lib/technicals";
import type { StockIntelPro } from "@/lib/types";
import type { VerdictApiResponse } from "@/lib/should-i-buy-types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Verdict computation (mirrors app/should-i-buy/[ticker]/page.tsx)
// ---------------------------------------------------------------------------

type VerdictLevel =
  | "Strong buy signal"
  | "Buy signal"
  | "Hold / watch"
  | "Cautious"
  | "Avoid for now";

function countWeakPillars(intel: StockIntelPro): number {
  const { valuation, growth, quality, momentum } = intel.pillars;
  return [valuation, growth, quality, momentum].filter(
    (p) => p.verdict === "weak",
  ).length;
}

function buildReasons(intel: StockIntelPro, rsi?: number | null): string[] {
  const { valuation, growth, quality, momentum } = intel.pillars;
  const lines: Array<{ text: string; priority: number }> = [];

  if (momentum.score >= 65 && (momentum.verdict === "solid" || momentum.verdict === "strong")) {
    lines.push({ text: "Price trend is strong and momentum is building", priority: 1 });
  } else if (momentum.score < 45) {
    lines.push({ text: "Price trend is weak - momentum has stalled", priority: 1 });
  } else {
    lines.push({ text: "Momentum is mixed with no clear directional trend", priority: 3 });
  }

  if (valuation.score >= 60) {
    lines.push({ text: "Stock appears reasonably priced relative to its fundamentals", priority: 2 });
  } else if (valuation.score < 30) {
    lines.push({ text: "Stock is priced for perfection - leaves little room for error", priority: 1 });
  } else {
    lines.push({ text: "Valuation is in the middle - neither cheap nor expensive", priority: 3 });
  }

  if (growth.score >= 60) {
    lines.push({ text: "Revenue and earnings trajectory looks solid", priority: 2 });
  } else if (growth.score < 35) {
    lines.push({ text: "Growth outlook is under pressure", priority: 1 });
  } else {
    lines.push({ text: "Growth is modest but not alarming", priority: 3 });
  }

  if (quality.score >= 60) {
    lines.push({ text: "Balance sheet is healthy with strong financial quality", priority: 2 });
  } else if (quality.score < 40) {
    lines.push({ text: "Some concerns around balance sheet and financial quality", priority: 1 });
  } else {
    lines.push({ text: "Financial quality is adequate", priority: 3 });
  }

  if (typeof rsi === "number") {
    if (rsi >= 72) lines.push({ text: "Technically overbought - a short-term pullback is possible", priority: 1 });
    else if (rsi <= 32) lines.push({ text: "Technically oversold - a bounce could be near", priority: 1 });
  }

  lines.sort((a, b) => a.priority - b.priority);
  return lines.slice(0, 3).map((l) => l.text);
}

function computeVerdict(intel: StockIntelPro, rsi?: number | null) {
  const score = intel.overall.score;
  const momentumVerdict = intel.pillars.momentum.verdict;
  const weakCount = countWeakPillars(intel);
  const isOverbought = typeof rsi === "number" && rsi >= 72;

  let level: VerdictLevel;
  if (score >= 72 && (momentumVerdict === "solid" || momentumVerdict === "strong") && !isOverbought) {
    level = "Strong buy signal";
  } else if (score >= 60 && weakCount <= 1) {
    level = "Buy signal";
  } else if ((score >= 45 && score < 60) || (score >= 60 && isOverbought)) {
    level = "Hold / watch";
  } else if (score >= 30 || weakCount === 2) {
    level = "Cautious";
  } else {
    level = "Avoid for now";
  }

  const headlines: Record<VerdictLevel, string> = {
    "Strong buy signal": "The data lines up - fundamentals, momentum, and price all point in the same direction.",
    "Buy signal": "More reasons to be in than out - the overall picture favours a position.",
    "Hold / watch": "Decent fundamentals but not the cleanest entry point right now.",
    "Cautious": "The data is mixed enough that waiting for a better setup makes sense.",
    "Avoid for now": "Too many signals are flashing red - the risk/reward does not look attractive.",
  };

  const colors: Record<VerdictLevel, { color: string; bg: string; textColor: string }> = {
    "Strong buy signal": { color: "#10b981", bg: "#ecfdf5", textColor: "#065f46" },
    "Buy signal":        { color: "#10b981", bg: "#ecfdf5", textColor: "#065f46" },
    "Hold / watch":      { color: "#f59e0b", bg: "#fef3c7", textColor: "#92400e" },
    "Cautious":          { color: "#f59e0b", bg: "#fef2f2", textColor: "#991b1b" },
    "Avoid for now":     { color: "#ef4444", bg: "#fef2f2", textColor: "#991b1b" },
  };

  return {
    level,
    headline: headlines[level],
    ...colors[level],
    reasons: buildReasons(intel, rsi),
  };
}

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
  const verdict = computeVerdict(intel, rsi);
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
