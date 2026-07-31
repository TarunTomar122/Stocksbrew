export type Direction = "bullish" | "bearish" | "neutral";

export type DecisionCard = {
  ticker: string;
  market: "US" | "IN";
  href: string;
  action: string; // short verb-led directive, e.g. "Add on dip" / "Trim into strength"
  direction: Direction;
  price: number | null;
  dayChangePct: number | null;
  currency: string; // symbol, e.g. "$" / "₹"
  score: number | null; // overall stocksbrew score, 0..100
  targetUpsidePct: number | null; // analyst target upside
  catalyst: string | null; // short structured chip, NOT a news headline
  driver?: string | null; // one supplied reason for the decision, never inferred
  nextTrigger: string | null; // the level / event to watch
  positionLabel: string | null; // "Holding" | "Watching"
  urgent: boolean;
};

export type BookFlagTone = "pos" | "neg" | "warn" | "info" | "earnings";

export type BookFlag = {
  label: string;
  tone: BookFlagTone;
  title?: string;
};

export type BookRow = {
  ticker: string;
  market: "US" | "IN";
  name: string | null;
  href: string;
  price: number | null;
  dayChangePct: number | null;
  currency: string; // symbol
  score: number | null; // overall stocksbrew score, 0..100
  flags: BookFlag[];
  stance: string | null;
  isHolding: boolean;
  /** Actionable today: trim/sell on a holding, or buy/accumulate on a watched name. */
  needsAttention: boolean;
  attentionDirection: Direction | null;
};

export type HealthPillar = {
  label: string;
  score: number; // 0..100
};

export type IdeaLens = "fits" | "top" | "unusual";

export type IdeaCard = {
  instrumentId: string;
  ticker: string;
  market: "US" | "IN";
  name: string | null;
  href: string;
  score: number | null; // overall stocksbrew score
  reason: string | null; // why it's suggested
  movePct: number | null; // for unusual-moves lens (anomaly move)
  tag: string | null; // short source tag, e.g. "Oversold quality"
  price: number | null; // live last price (enriched)
  currency: string | null; // e.g. "$" / "₹"
  dayChangePct: number | null; // today's move (enriched)
  targetUpsidePct: number | null; // analyst target runway (enriched)
};
