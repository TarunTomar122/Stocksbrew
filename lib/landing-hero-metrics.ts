import { directiveZonePrice } from "@/lib/directive-ui";
import type { Directive } from "@/lib/stock";

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type LandingHeroMetrics = {
  accumulate_below: number | null;
  trim_above: number | null;
  risk_reward_ratio: number | null;
  risk_reward_hint: "Favorable" | "Balanced" | "Tight" | null;
};

export function buildLandingHeroMetrics(
  directive: Directive | null,
  price: number,
  analystTarget: number | null,
): LandingHeroMetrics {
  const accumulateBelow =
    directive?.add_on?.trigger_type === "price_below" ? directiveZonePrice(directive.add_on) : null;
  const trimAbove =
    directive?.trim_on?.trigger_type === "price_above" ? directiveZonePrice(directive.trim_on) : null;

  const profitTarget =
    n(trimAbove) ? trimAbove : n(analystTarget) && analystTarget > price ? analystTarget : null;

  const breakPrice = directiveZonePrice(directive?.breaks_if);
  const riskAnchor =
    n(breakPrice) && directive?.breaks_if?.trigger_type === "price_below" && breakPrice < price
      ? breakPrice
      : n(accumulateBelow) && accumulateBelow < price
        ? accumulateBelow
        : null;

  const profitTargetPct =
    n(profitTarget) && price > 0 ? ((profitTarget - price) / price) * 100 : null;
  const breakRiskPct =
    n(riskAnchor) && price > 0 ? ((price - riskAnchor) / price) * 100 : null;

  const riskRewardRatio =
    n(profitTargetPct) && n(breakRiskPct) && breakRiskPct > 0 && profitTargetPct > 0
      ? profitTargetPct / breakRiskPct
      : null;

  let riskRewardHint: LandingHeroMetrics["risk_reward_hint"] = null;
  if (n(riskRewardRatio)) {
    if (riskRewardRatio >= 1.5) riskRewardHint = "Favorable";
    else if (riskRewardRatio >= 1) riskRewardHint = "Balanced";
    else riskRewardHint = "Tight";
  }

  return {
    accumulate_below: accumulateBelow,
    trim_above: trimAbove,
    risk_reward_ratio: riskRewardRatio,
    risk_reward_hint: riskRewardHint,
  };
}
