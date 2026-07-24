import type { RadarAttentionItem } from "@/lib/watchlist-view";

const MEANINGFUL_EVENT_TYPES = new Set([
  "rsi_oversold_cross",
  "rsi_overbought_cross",
  "earnings_upcoming",
  "abnormal_price_move",
  "portfolio_risk_transition",
]);

export function radarAttentionItems(
  items: RadarAttentionItem[],
  now = Date.now(),
  max = 3,
): RadarAttentionItem[] {
  const recentCutoff = now - 36 * 60 * 60 * 1000;
  return items
    .filter((item) => {
      if (!MEANINGFUL_EVENT_TYPES.has(item.event_type)) return false;
      if (item.event_type === "abnormal_price_move" && item.citations.length === 0) return false;
      const occurred = Date.parse(item.occurred_at);
      return !Number.isFinite(occurred) || occurred >= recentCutoff;
    })
    .sort((left, right) => {
      const heldDelta =
        Number(right.position_type === "holding") - Number(left.position_type === "holding");
      if (heldDelta) return heldDelta;
      return right.priority_score - left.priority_score;
    })
    .slice(0, max);
}

export function radarEventLabel(eventType: string): string {
  if (eventType === "rsi_oversold_cross") return "Newly oversold";
  if (eventType === "rsi_overbought_cross") return "Newly overbought";
  if (eventType === "earnings_upcoming") return "Earnings soon";
  if (eventType === "abnormal_price_move") return "Abnormal move";
  if (eventType === "portfolio_risk_transition") return "Book risk";
  return "Update";
}
