/* ─── Dashboard — delta feed types ─── */

export type DeltaCardPriority = "high" | "medium" | "low";

export type DeltaCardEntityKind = "stock" | "sector" | "market" | "portfolio";

export type DeltaCardEntity = {
  kind: DeltaCardEntityKind;
  /** Canonical id: `US_NVDA`, `us-tech`, `US`, `portfolio`. */
  id: string;
  /** Short label shown in the card header. */
  label: string;
  market?: "us" | "india";
};

export type DeltaCardSource = {
  label: string;
  url?: string;
  excerpt?: string;
};

export type DeltaCardKind =
  | "catalyst_shift"
  | "price_move"
  | "earnings"
  | "technical"
  | "news_sentiment"
  | "blind_spot"
  | "thesis_update"
  | "portfolio_narrative";

export type DeltaCard = {
  id: string;
  entity: DeltaCardEntity;
  priority: DeltaCardPriority;
  kind: DeltaCardKind;
  title: string;
  body: string;
  sources?: DeltaCardSource[];
  generatedAt: string;
  /** Navigation target when the card is clicked. Portfolio-level cards have no href. */
  href?: string;
};
