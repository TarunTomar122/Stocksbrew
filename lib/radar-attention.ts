import type { RadarAttentionItem } from "@/lib/watchlist-view";

const SOURCE_BACKED_EVENT_TYPES = new Set([
  "abnormal_price_move",
  "analyst_rating_change",
  "analyst_target_revision",
  "earnings_results",
  "earnings_guidance_change",
  "filing_catalyst",
]);

function hasSourceBackedExplanation(item: RadarAttentionItem): boolean {
  return (
    SOURCE_BACKED_EVENT_TYPES.has(item.event_type) &&
    item.citations.some((citation) => citation.title.trim() && citation.url.trim())
  );
}

export function radarAttentionItems(
  items: RadarAttentionItem[],
  now = Date.now(),
  max = 3,
): RadarAttentionItem[] {
  const recentCutoff = now - 36 * 60 * 60 * 1000;
  const ranked = items
    .filter((item) => {
      if (!hasSourceBackedExplanation(item)) return false;
      const occurred = Date.parse(item.occurred_at);
      return !Number.isFinite(occurred) || occurred >= recentCutoff;
    })
    .sort((left, right) => {
      const heldDelta =
        Number(right.position_type === "holding") - Number(left.position_type === "holding");
      if (heldDelta) return heldDelta;
      return right.priority_score - left.priority_score;
    });

  return ranked.slice(0, max);
}

export function radarEventLabel(eventType: string): string {
  if (eventType === "abnormal_price_move") return "Abnormal move";
  if (eventType === "analyst_rating_change") return "Rating change";
  if (eventType === "analyst_target_revision") return "Target revision";
  if (eventType === "earnings_results") return "Earnings result";
  if (eventType === "earnings_guidance_change") return "Guidance update";
  if (eventType === "filing_catalyst") return "Filing update";
  return "Update";
}
