import type { CallWord } from "@/lib/stock-chart";

/**
 * A call shows only its own price level (owner rule 8): where we'd buy more on Buy more, where we'd sell some on
 * Sell some, and none on Keep. The stock page's call block draws the same rule from its zones
 * (components/stock-report/report.tsx); cards elsewhere (the landing's hero) ask here. Pure.
 */
export type CallLevel = { label: "We'd buy more below" | "We'd buy more above" | "We'd sell some above"; price: number };

const usable = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function ownCallLevel(
  call: CallWord | null | undefined,
  levels: { addBelow?: number | null; addAbove?: number | null; trimAbove?: number | null },
): CallLevel | null {
  if (call === "Add") {
    if (usable(levels.addBelow)) return { label: "We'd buy more below", price: levels.addBelow };
    if (usable(levels.addAbove)) return { label: "We'd buy more above", price: levels.addAbove };
    return null;
  }
  if (call === "Trim") return usable(levels.trimAbove) ? { label: "We'd sell some above", price: levels.trimAbove } : null;
  // Keep, or no call: no level, so a Keep never sits beside a price to buy or sell at.
  return null;
}
