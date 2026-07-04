import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { StockIntelligenceDoc } from "@/lib/stock";

export function pickLandingHeroDriverRisk(
  featured: AnomalyItem,
  intelligence: StockIntelligenceDoc | null,
): { driver: string | null; risk: string | null } {
  const cards = intelligence?.visual_cards;
  const visual = intelligence?.visual_summary ?? featured.visual_summary;

  const cardDriver = cards?.drivers?.[0];
  const cardRisk = cards?.risk_cards?.[0];

  const driver =
    cardDriver?.detail?.trim() ||
    cardDriver?.label?.trim() ||
    visual?.why_it_matters?.trim() ||
    featured.move_explanation?.why_it_matters?.trim() ||
    intelligence?.thesis?.trim() ||
    featured.thesis?.trim() ||
    featured.key_points?.[0]?.trim() ||
    null;

  const risk =
    cardRisk?.detail?.trim() ||
    cardRisk?.risk?.trim() ||
    cardRisk?.label?.trim() ||
    visual?.what_to_watch?.trim() ||
    intelligence?.risk?.trim() ||
    featured.risk?.trim() ||
    null;

  return { driver, risk };
}
