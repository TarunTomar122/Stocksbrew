import type { PriceChartZone } from "@/components/price-chart";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { StockReturns } from "@/lib/chart-range";
import {
  buildDirectiveChartZones,
  directiveZonePrice,
  filterChartZones,
  normalizeDirectiveForUi,
  resolvePriceAwareCall,
  setupStateLabel,
} from "@/lib/directive-ui";
import type { LandingHeroMetrics } from "@/lib/landing-hero-metrics";
import { formatRiskRewardRatio } from "@/lib/risk-reward";
import type { Directive, StockIntelligenceDoc } from "@/lib/stock";

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const STANCE_ACCENT: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  watch: "var(--accent-terminal)",
  avoid: "var(--signal-bearish)",
  hold: "var(--on-surface-variant)",
};

export type LandingHeroCallData = {
  stance: string;
  accent: string;
  confidence: string | null;
  setup_chip: string | null;
  call_headline: string;
  call_body: string | null;
  call_levels: string | null;
  returns: StockReturns | null;
  chart_zones: PriceChartZone[];
  zone_hint: { label: string; color: string } | null;
  call_metrics: Array<{
    label: string;
    value: string;
    hint?: string;
    hintTone?: "bullish" | "bearish" | "neutral";
  }>;
  chart_line_color: string;
};

function fallbackChartZones(
  price: number,
  metrics: LandingHeroMetrics,
  analystTarget: number | null,
  formatMoney: (v: number) => string,
): PriceChartZone[] {
  const zones: PriceChartZone[] = [];
  if (n(metrics.accumulate_below)) {
    zones.push({
      price: metrics.accumulate_below,
      mode: "band",
      bandExtend: "below",
      color: "var(--signal-bullish)",
      label: `Buy below ${formatMoney(metrics.accumulate_below)}`,
      dashed: false,
    });
  }
  if (n(analystTarget)) {
    zones.push({
      price: analystTarget,
      mode: "line",
      color: "var(--landing-brand)",
      label: "Analyst target",
      dashed: true,
      strokeOpacity: 0.38,
    });
  }
  return zones;
}

function buildCallMetrics(
  directive: Directive | null,
  price: number,
  metrics: LandingHeroMetrics,
  analystTarget: number | null,
  formatMoney: (v: number) => string,
): LandingHeroCallData["call_metrics"] {
  const trimPrice = directive ? directiveZonePrice(directive.trim_on) : null;
  const breakPrice = directive ? directiveZonePrice(directive.breaks_if) : null;
  const profitTarget =
    n(trimPrice) && directive?.trim_on?.trigger_type === "price_above"
      ? trimPrice
      : n(analystTarget) && analystTarget > price
        ? analystTarget
        : n(metrics.trim_above)
          ? metrics.trim_above
          : null;

  const profitTargetPct =
    n(profitTarget) && price > 0 ? ((profitTarget - price) / price) * 100 : null;

  const riskAnchor =
    n(breakPrice) && directive?.breaks_if?.trigger_type === "price_below" && breakPrice < price
      ? breakPrice
      : n(metrics.accumulate_below) && metrics.accumulate_below < price
        ? metrics.accumulate_below
        : null;

  const breakRiskPct =
    n(riskAnchor) && price > 0 ? ((price - riskAnchor) / price) * 100 : null;

  const riskRewardRatio = metrics.risk_reward_ratio;
  const out: LandingHeroCallData["call_metrics"] = [];

  if (n(profitTarget)) {
    out.push({
      label: "Target",
      value: formatMoney(profitTarget),
      hint: n(profitTargetPct)
        ? `${profitTargetPct >= 0 ? "+" : ""}${profitTargetPct.toFixed(1)}% upside`
        : undefined,
      hintTone: n(profitTargetPct) && profitTargetPct >= 0 ? "bullish" : "bearish",
    });
  } else if (n(metrics.accumulate_below)) {
    const abovePct =
      price > metrics.accumulate_below
        ? ((price - metrics.accumulate_below) / price) * 100
        : null;
    out.push({
      label: "Accumulate below",
      value: formatMoney(metrics.accumulate_below),
      hint:
        abovePct != null
          ? `${abovePct.toFixed(1)}% above entry zone`
          : "In accumulate zone",
      hintTone: "bullish",
    });
  }

  if (n(breakPrice) && directive?.breaks_if?.trigger_type === "price_below") {
    out.push({
      label: "Exit below",
      value: formatMoney(breakPrice),
      hint: n(breakRiskPct) ? `-${breakRiskPct.toFixed(1)}% risk` : undefined,
      hintTone: "bearish",
    });
  }

  if (n(riskRewardRatio)) {
    out.push({
      label: "Reward / risk",
      value: formatRiskRewardRatio(riskRewardRatio),
      hint: metrics.risk_reward_hint ?? undefined,
      hintTone:
        metrics.risk_reward_hint === "Favorable"
          ? "bullish"
          : metrics.risk_reward_hint === "Tight"
            ? "bearish"
            : "neutral",
    });
  }

  return out;
}

export function buildLandingHeroCallData(
  featured: AnomalyItem,
  intelligence: StockIntelligenceDoc | null,
  metrics: LandingHeroMetrics,
  analystTarget: number | null,
  moveHeadline: string | null,
  returns: StockReturns | null,
): LandingHeroCallData {
  const formatMoney = (v: number) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const directive = normalizeDirectiveForUi(intelligence?.directive_v2 ?? null);
  const stance = (directive?.stance ?? "watch").toLowerCase();
  const accent = STANCE_ACCENT[stance] ?? STANCE_ACCENT.watch;
  const priceAwareCall = directive ? resolvePriceAwareCall(directive, featured.price, formatMoney) : null;

  let chartZones = directive
    ? filterChartZones(
        buildDirectiveChartZones(directive, formatMoney),
        priceAwareCall?.chartZoneKeys ?? [],
      )
    : fallbackChartZones(featured.price, metrics, analystTarget, formatMoney);

  const zoneHint =
    chartZones[0] != null ? { label: chartZones[0].label, color: chartZones[0].color } : null;

  const stanceLabel = stance.charAt(0).toUpperCase() + stance.slice(1);
  const callHeadline = priceAwareCall?.headline || stanceLabel;
  const callBody =
    priceAwareCall?.body?.trim() ||
    moveHeadline?.trim() ||
    intelligence?.today_brief?.trim() ||
    featured.headline?.trim() ||
    null;

  const up = featured.day_change_pct >= 0;
  const chartLineColor =
    directive != null ? accent : up ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return {
    stance,
    accent,
    confidence: directive?.confidence?.trim() || null,
    setup_chip: setupStateLabel(intelligence?.setup_state, stance),
    call_headline: callHeadline,
    call_body: callBody,
    call_levels: priceAwareCall?.levels ?? null,
    returns,
    chart_zones: chartZones,
    zone_hint: zoneHint,
    call_metrics: buildCallMetrics(directive, featured.price, metrics, analystTarget, formatMoney),
    chart_line_color: chartLineColor,
  };
}
