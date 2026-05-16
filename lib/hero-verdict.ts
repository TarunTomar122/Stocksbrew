import { cache } from "react";

import { getStockIntelPro, getStockSummary } from "@/lib/stock";
import { getLatestTechnicals } from "@/lib/technicals";
import type { StockIntelPro } from "@/lib/types";

export type HeroVerdict = {
  ticker: string;
  name: string;
  logoUrl?: string;
  price: number;
  changePct: number | null;
  level: "Strong buy signal" | "Buy signal" | "Hold / watch" | "Cautious" | "Avoid for now";
  shortLabel: "BUY" | "HOLD" | "WATCH" | "AVOID";
  color: string;
  bg: string;
  textColor: string;
  overall: number;
  oneLiner: string;
};

function countWeakPillars(intel: StockIntelPro): number {
  const { valuation, growth, quality, momentum } = intel.pillars;
  return [valuation, growth, quality, momentum].filter((p) => p.verdict === "weak").length;
}

function computeLevel(intel: StockIntelPro, rsi: number | null): HeroVerdict["level"] {
  const score = intel.overall.score;
  const momentumVerdict = intel.pillars.momentum.verdict;
  const weakCount = countWeakPillars(intel);
  const isOverbought = typeof rsi === "number" && rsi >= 72;

  if (score >= 72 && (momentumVerdict === "solid" || momentumVerdict === "strong") && !isOverbought) {
    return "Strong buy signal";
  }
  if (score >= 60 && weakCount <= 1) return "Buy signal";
  if ((score >= 45 && score < 60) || (score >= 60 && isOverbought)) return "Hold / watch";
  if (score >= 30 || weakCount === 2) return "Cautious";
  return "Avoid for now";
}

function shortLabelFor(level: HeroVerdict["level"]): HeroVerdict["shortLabel"] {
  if (level === "Strong buy signal" || level === "Buy signal") return "BUY";
  if (level === "Hold / watch") return "HOLD";
  if (level === "Cautious") return "WATCH";
  return "AVOID";
}

function colorsFor(level: HeroVerdict["level"]): {
  color: string;
  bg: string;
  textColor: string;
} {
  if (level === "Strong buy signal" || level === "Buy signal") {
    return { color: "#10b981", bg: "#ecfdf5", textColor: "#065f46" };
  }
  if (level === "Hold / watch") {
    return { color: "#f59e0b", bg: "#fef3c7", textColor: "#92400e" };
  }
  if (level === "Cautious") {
    return { color: "#f59e0b", bg: "#fef2f2", textColor: "#991b1b" };
  }
  return { color: "#ef4444", bg: "#fef2f2", textColor: "#991b1b" };
}

function buildOneLiner(
  intel: StockIntelPro,
  rsi: number | null,
  changePct: number | null,
): string {
  const { valuation, growth, momentum } = intel.pillars;
  const bits: string[] = [];

  if (typeof changePct === "number") {
    const sign = changePct >= 0 ? "Up" : "Down";
    bits.push(`${sign} ${Math.abs(changePct).toFixed(1)}% today`);
  }

  if (momentum.score >= 65) bits.push("momentum strong");
  else if (momentum.score < 45) bits.push("momentum stalled");

  if (typeof rsi === "number" && rsi >= 72) bits.push("RSI overbought");
  else if (typeof rsi === "number" && rsi <= 30) bits.push("RSI oversold");
  else if (valuation.score >= 60) bits.push("valuation reasonable");
  else if (valuation.score < 30) bits.push("priced for perfection");
  else if (growth.score >= 60) bits.push("growth solid");

  if (bits.length === 0) return "Mixed signals across the four pillars.";
  return bits.join(" · ") + ".";
}

export const getHeroVerdict = cache(
  async (ticker: string): Promise<HeroVerdict | null> => {
    const stock = await getStockSummary(ticker, "US").catch(() => null);
    if (!stock) return null;

    const [intel, technicals] = await Promise.all([
      getStockIntelPro(stock.instrument_id, "US").catch(() => null),
      getLatestTechnicals(stock.instrument_id).catch(() => null),
    ]);
    if (!intel) return null;

    const rsi = technicals?.rsi_14?.value ?? null;
    const level = computeLevel(intel, rsi);
    const colors = colorsFor(level);
    const changePct =
      typeof stock.day_change_pct === "number" ? stock.day_change_pct : null;

    return {
      ticker: stock.ticker,
      name: stock.name,
      logoUrl: stock.logo_url,
      price: stock.price,
      changePct,
      level,
      shortLabel: shortLabelFor(level),
      color: colors.color,
      bg: colors.bg,
      textColor: colors.textColor,
      overall: intel.overall.score,
      oneLiner: buildOneLiner(intel, rsi, changePct),
    };
  },
);
