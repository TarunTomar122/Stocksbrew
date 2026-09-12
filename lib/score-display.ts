/**
 * Canonical display rules for the stocksbrew score (0-100).
 *
 * The backend bands live in `backend/stock_scoring.py::_verdict_from_score`
 * (strong >= 75, solid >= 55, mixed >= 35, weak < 35). The UI collapses those
 * into three tones so the same score never appears green on one page and red
 * on another.
 */

export const SCORE_BULLISH_MIN = 75;
export const SCORE_NEUTRAL_MIN = 45;
export const SCORE_LABEL = "Stocksbrew score";
export const SCORE_SCALE_HINT = "0-100 quality blend of valuation, growth, quality and momentum";

export type ScoreTone = "bullish" | "neutral" | "bearish";

export function scoreTone(score?: number | null): ScoreTone | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= SCORE_BULLISH_MIN) return "bullish";
  if (score < SCORE_NEUTRAL_MIN) return "bearish";
  return "neutral";
}

export function scoreColorVar(score?: number | null, options?: { insufficient?: boolean }): string {
  if (options?.insufficient) return "var(--outline)";
  const tone = scoreTone(score);
  if (tone === "bullish") return "var(--signal-bullish)";
  if (tone === "bearish") return "var(--signal-bearish)";
  if (tone === "neutral") return "var(--signal-neutral)";
  return "var(--oa-muted-fg)";
}

