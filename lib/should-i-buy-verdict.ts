import { hasSufficientOverallData, hasSufficientPillarData } from "@/lib/fundamentals-coverage";
import type { StockIntelPro } from "@/lib/types";

/**
 * Shared verdict computation for the "Should I buy?" surfaces (the page, the
 * API route and the interactive panel). One vocabulary everywhere: the levels
 * mirror the directive stances users see on stock pages.
 */

export type ShouldIBuyVerdictLevel =
  | "Accumulate now"
  | "Accumulate on pullbacks"
  | "Hold / watch"
  | "Cautious"
  | "Avoid for now";

export const SHOULD_I_BUY_VERDICT_LEVELS: ShouldIBuyVerdictLevel[] = [
  "Accumulate now",
  "Accumulate on pullbacks",
  "Hold / watch",
  "Cautious",
  "Avoid for now",
];

export type ShouldIBuyVerdict = {
  level: ShouldIBuyVerdictLevel;
  headline: string;
  color: string;
  bg: string;
  textColor: string;
  reasons: string[];
};

function countWeakPillars(intel: StockIntelPro): number {
  const { valuation, growth, quality, momentum } = intel.pillars;
  return [valuation, growth, quality, momentum].filter((p) => p.verdict === "weak").length;
}

function buildReasons(intel: StockIntelPro, rsi?: number | null): string[] {
  const { valuation, growth, quality, momentum } = intel.pillars;
  const lines: Array<{ text: string; priority: number }> = [];

  if (!hasSufficientPillarData(momentum)) {
    lines.push({ text: "Not enough momentum data for a reliable score", priority: 2 });
  } else if (momentum.score >= 65 && (momentum.verdict === "solid" || momentum.verdict === "strong")) {
    lines.push({ text: "Price trend is strong and momentum is building", priority: 1 });
  } else if (momentum.score < 45) {
    lines.push({ text: "Price trend is weak - momentum has stalled", priority: 1 });
  } else {
    lines.push({ text: "Momentum is mixed with no clear directional trend", priority: 3 });
  }

  if (!hasSufficientPillarData(valuation)) {
    lines.push({ text: "Not enough valuation data to call the stock cheap or expensive", priority: 2 });
  } else if (valuation.score >= 60) {
    lines.push({ text: "Stock appears reasonably priced relative to its fundamentals", priority: 2 });
  } else if (valuation.score < 30) {
    lines.push({ text: "Stock is priced for perfection - leaves little room for error", priority: 1 });
  } else {
    lines.push({ text: "Valuation is in the middle - neither cheap nor expensive", priority: 3 });
  }

  if (!hasSufficientPillarData(growth)) {
    lines.push({ text: "Not enough growth data for a reliable score", priority: 2 });
  } else if (growth.score >= 60) {
    lines.push({ text: "Revenue and earnings trajectory looks solid", priority: 2 });
  } else if (growth.score < 35) {
    lines.push({ text: "Growth outlook is under pressure", priority: 1 });
  } else {
    lines.push({ text: "Growth is modest but not alarming", priority: 3 });
  }

  if (!hasSufficientPillarData(quality)) {
    lines.push({ text: "Not enough balance-sheet data for a reliable quality score", priority: 2 });
  } else if (quality.score >= 60) {
    lines.push({ text: "Balance sheet is healthy with strong financial quality", priority: 2 });
  } else if (quality.score < 40) {
    lines.push({ text: "Some concerns around balance sheet and financial quality", priority: 1 });
  } else {
    lines.push({ text: "Financial quality is adequate", priority: 3 });
  }

  if (typeof rsi === "number") {
    if (rsi >= 72) {
      lines.push({ text: "Technically overbought - a short-term pullback is possible", priority: 1 });
    } else if (rsi <= 32) {
      lines.push({ text: "Technically oversold - a bounce could be near", priority: 1 });
    }
  }

  lines.sort((a, b) => a.priority - b.priority);
  return lines.slice(0, 3).map((l) => l.text);
}

export function computeShouldIBuyVerdict(
  intel: StockIntelPro,
  rsi?: number | null,
): ShouldIBuyVerdict {
  const score = intel.overall.score;
  const momentumVerdict = intel.pillars.momentum.verdict;
  const weakCount = countWeakPillars(intel);
  const isOverbought = typeof rsi === "number" && rsi >= 72;

  let level: ShouldIBuyVerdictLevel;
  if (!hasSufficientOverallData(intel)) {
    level = "Hold / watch";
  } else if (score >= 72 && (momentumVerdict === "solid" || momentumVerdict === "strong") && !isOverbought) {
    level = "Accumulate now";
  } else if (score >= 60 && weakCount <= 1) {
    level = "Accumulate on pullbacks";
  } else if ((score >= 45 && score < 60) || (score >= 60 && isOverbought)) {
    level = "Hold / watch";
  } else if (score >= 30 || weakCount === 2) {
    level = "Cautious";
  } else {
    level = "Avoid for now";
  }

  const headlines: Record<ShouldIBuyVerdictLevel, string> = {
    "Accumulate now":
      "The data lines up -- fundamentals, momentum, and price all point in the same direction.",
    "Accumulate on pullbacks":
      "More reasons to be in than out -- the overall picture favours a position, and a pullback is the cleaner entry.",
    "Hold / watch": "Decent fundamentals but not the cleanest entry point right now.",
    "Cautious": "The data is mixed enough that waiting for a better setup makes sense.",
    "Avoid for now": "Too many signals are flashing red -- the risk/reward does not look attractive.",
  };

  const buyBg = "#ecfdf5";
  const buyText = "#065f46";
  const holdBg = "#fef3c7";
  const holdText = "#92400e";
  const avoidBg = "#fef2f2";
  const avoidText = "#991b1b";

  const colors: Record<ShouldIBuyVerdictLevel, { color: string; bg: string; textColor: string }> = {
    "Accumulate now": { color: "#10b981", bg: buyBg, textColor: buyText },
    "Accumulate on pullbacks": { color: "#10b981", bg: buyBg, textColor: buyText },
    "Hold / watch": { color: "#f59e0b", bg: holdBg, textColor: holdText },
    "Cautious": { color: "#f59e0b", bg: avoidBg, textColor: avoidText },
    "Avoid for now": { color: "#ef4444", bg: avoidBg, textColor: avoidText },
  };

  return {
    level,
    headline: headlines[level],
    ...colors[level],
    reasons: buildReasons(intel, rsi),
  };
}
