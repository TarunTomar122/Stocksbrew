import type { PriceChartZone } from "@/components/price-chart";
import type { Directive, DirectiveZone } from "@/lib/stock";
import { plainRuleChange } from "@/lib/rule-copy";

export const SETUP_STATE_LABELS: Record<string, string> = {
  accumulation: "Pullback",
  breakout: "Breakout",
  trend: "Trend",
  rotation: "Rotation",
  exhaustion: "Extended",
  unclear: "Setup",
};

/** One wording for the directive confidence scale everywhere in the UI. */
export const CONFIDENCE_LABELS: Record<"high" | "med" | "low", string> = {
  high: "High confidence",
  med: "Medium confidence",
  low: "Low confidence",
};

export const CONFIDENCE_HINTS: Record<"high" | "med" | "low", string> = {
  high: "Strong evidence and a clean setup.",
  med: "Constructive, with some uncertainty.",
  low: "Weak or incomplete evidence.",
};

export function normalizeConfidence(value?: string | null): "high" | "med" | "low" | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "high") return "high";
  if (raw === "medium" || raw === "med") return "med";
  if (raw === "low") return "low";
  return null;
}

export function confidenceLabel(value?: string | null): string | null {
  const level = normalizeConfidence(value);
  return level ? CONFIDENCE_LABELS[level] : null;
}

function normalizeCallPhrase(value: string): string {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** True when two directive phrases repeat the same call (e.g. "Accumulate" vs "Accumulate now"). */
export function callPhrasesOverlap(a: string, b: string): boolean {
  const left = normalizeCallPhrase(a);
  const right = normalizeCallPhrase(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  const leftStem = left.split(" ")[0] ?? "";
  const rightStem = right.split(" ")[0] ?? "";
  return leftStem.length > 2 && leftStem === rightStem;
}

export function resolveCallHeadline(directive: Directive): string {
  const text = directive.text?.trim() ?? "";
  const stance =
    directive.stance?.trim()
      ? directive.stance.charAt(0).toUpperCase() + directive.stance.slice(1)
      : "Watch";
  if (text && !callPhrasesOverlap(text, stance)) return text;
  if (text.length > stance.length) return text;
  return text || stance;
}

type DirectiveV2Like = {
  stance?: string | null;
  confidence?: string | null;
  action?: { label?: string | null; summary?: string | null } | null;
  zones?: {
    accumulate_below?: number | null;
    breakout_above?: number | null;
    trim_above?: number | null;
  } | null;
  watch_out?: string | null;
};

function zoneText(prefix: string, price: number): string {
  return `${prefix} $${price.toFixed(price >= 100 ? 0 : 2)}`;
}

function zoneFromPrice(
  price: number | null | undefined,
  triggerType: DirectiveZone["trigger_type"],
  prefix: string,
): DirectiveZone | undefined {
  if (typeof price !== "number" || !Number.isFinite(price)) return undefined;
  return {
    text: zoneText(prefix, price),
    trigger_type: triggerType,
    trigger_value: String(price),
  };
}

export function normalizeDirectiveForUi(
  raw: DirectiveV2Like | null | undefined,
): Directive | null {
  if (!raw) return null;
  const text = (raw.action?.label ?? "").trim();
  if (!text) return null;
  const stance = ((raw.stance ?? "watch").trim().toLowerCase() || "watch") as Directive["stance"];
  const confidenceRaw = (raw.confidence ?? "").trim().toLowerCase();
  const confidence: Directive["confidence"] =
    confidenceRaw === "high"
      ? "high"
      : confidenceRaw === "medium" || confidenceRaw === "med"
        ? "med"
        : confidenceRaw === "low"
          ? "low"
          : undefined;
  const zones = raw.zones ?? {};
  const add_on =
    zoneFromPrice(zones.accumulate_below, "price_below", "Add below") ??
    zoneFromPrice(zones.breakout_above, "price_above", "Add above");
  const trim_on = zoneFromPrice(zones.trim_above, "price_above", "Trim above");
  const primary =
    (stance === "trim" || stance === "avoid") ? trim_on :
    (stance === "accumulate" || stance === "watch" || stance === "hold") ? add_on :
    undefined;
  return {
    text,
    action_now: (raw.action?.summary ?? plainRuleChange(raw.watch_out ?? "")).trim() || undefined,
    stance,
    trigger_type: primary?.trigger_type ?? "none",
    trigger_value: primary?.trigger_value,
    add_on,
    trim_on,
    rationale: (raw.action?.summary ?? plainRuleChange(raw.watch_out ?? "")).trim() || undefined,
    confidence,
  };
}

export function setupStateLabel(raw?: string | null, stance?: string | null): string | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key || key === "unclear") return null;
  const stanceKey = (stance ?? "").trim().toLowerCase();
  if (key === "accumulation" && stanceKey === "accumulate") return null;
  if (key === "exhaustion" && stanceKey === "trim") return null;
  if (key === "breakout" && (stanceKey === "watch" || stanceKey === "accumulate")) return null;
  return SETUP_STATE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function directiveZonePrice(zone?: DirectiveZone): number | null {
  if (!zone || (zone.trigger_type !== "price_below" && zone.trigger_type !== "price_above")) return null;
  const value = Number(zone.trigger_value);
  return Number.isFinite(value) ? value : null;
}

/** True when the live quote satisfies a price trigger zone. */
export function zoneTriggerMet(zone: DirectiveZone | undefined, currentPrice: number): boolean {
  if (!zone?.trigger_type || zone.trigger_type === "none") return false;
  if (!Number.isFinite(currentPrice)) return false;
  const threshold = directiveZonePrice(zone);
  if (threshold == null) return false;
  if (zone.trigger_type === "price_below") return currentPrice <= threshold;
  if (zone.trigger_type === "price_above") return currentPrice >= threshold;
  return false;
}

export function zoneIsPrimary(zone: DirectiveZone | undefined, directive: Directive): boolean {
  if (!zone?.trigger_type || zone.trigger_type === "none") return false;
  return (
    zone.trigger_type === directive.trigger_type &&
    String(zone.trigger_value ?? "").trim() === String(directive.trigger_value ?? "").trim()
  );
}

export type DirectiveZoneKey = "add" | "trim" | "break";

export function primaryZoneKey(directive: Directive): DirectiveZoneKey | null {
  if (zoneIsPrimary(directive.add_on, directive)) return "add";
  if (zoneIsPrimary(directive.trim_on, directive)) return "trim";
  if (zoneIsPrimary(directive.breaks_if, directive)) return "break";
  return null;
}

export function zoneTriggerKicker(zoneKey: DirectiveZoneKey): string {
  if (zoneKey === "add") return "add zone";
  if (zoneKey === "trim") return "trim zone";
  return "invalidation";
}

function formatIsoDate(iso: string): string {
  const d = new Date(`${iso.trim().split("T", 1)[0]}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDirectiveTrigger(
  directive: Directive,
  formatMoney: (value: number) => string,
): { kicker: string; display: string; alertable: boolean; condition?: "below" | "above"; price?: number } | null {
  const type = directive.trigger_type;
  const raw = String(directive.trigger_value ?? "").trim();
  if (!type || type === "none" || !raw) return null;

  if (type === "price_below" || type === "price_above") {
    const price = Number(raw);
    if (!Number.isFinite(price)) return null;
    return {
      kicker: type === "price_below" ? "if it dips to" : "if it rises to",
      display: formatMoney(price),
      alertable: true,
      condition: type === "price_below" ? "below" : "above",
      price,
    };
  }
  if (type === "date") {
    return { kicker: "watch date", display: formatIsoDate(raw), alertable: false };
  }
  if (type === "sentiment_flip") {
    return { kicker: "sentiment trigger", display: "Sentiment flips", alertable: false };
  }
  if (type === "new_catalyst") {
    return { kicker: "catalyst trigger", display: "New catalyst", alertable: false };
  }
  return null;
}

export function zoneTriggerBadge(
  zone: DirectiveZone,
  formatMoney: (value: number) => string,
): string | null {
  const type = zone.trigger_type;
  const raw = String(zone.trigger_value ?? "").trim();
  if (!type || type === "none") return null;
  if (type === "price_below" || type === "price_above") {
    const price = Number(raw);
    if (!Number.isFinite(price)) return null;
    return type === "price_below" ? `≤ ${formatMoney(price)}` : `≥ ${formatMoney(price)}`;
  }
  if (type === "date" && raw) return formatIsoDate(raw);
  if (type === "sentiment_flip") return "sentiment";
  if (type === "new_catalyst") return "catalyst";
  return null;
}

export type ChartZoneKey = "add" | "trim" | "break";

export function buildDirectiveChartZones(
  directive: Directive | null | undefined,
  formatMoney: (value: number) => string,
): PriceChartZone[] {
  if (!directive) return [];

  const zones: PriceChartZone[] = [];
  const addPrice = directiveZonePrice(directive.add_on);
  const trimPrice = directiveZonePrice(directive.trim_on);
  const breakPrice = directiveZonePrice(directive.breaks_if);
  const addBelow = directive.add_on?.trigger_type === "price_below";
  const breakBelow = directive.breaks_if?.trigger_type === "price_below";
  const trimAbove = directive.trim_on?.trigger_type === "price_above";

  if (addPrice != null && breakPrice != null && addBelow && breakBelow && breakPrice < addPrice) {
    zones.push({
      zoneKey: "add",
      price: addPrice,
      priceTo: breakPrice,
      mode: "band",
      color: "var(--signal-bullish)",
      label: `Buy zone · ${formatMoney(breakPrice)}–${formatMoney(addPrice)}`,
      dashed: false,
    });
  } else if (addPrice != null && addBelow) {
    zones.push({
      zoneKey: "add",
      price: addPrice,
      mode: "band",
      bandExtend: "below",
      color: "var(--signal-bullish)",
      label: `Buy below ${formatMoney(addPrice)}`,
      dashed: false,
    });
  } else if (addPrice != null && directive.add_on?.trigger_type === "price_above") {
    zones.push({
      zoneKey: "add",
      price: addPrice,
      mode: "band",
      bandExtend: "above",
      color: "var(--signal-bullish)",
      label: `Buy above ${formatMoney(addPrice)}`,
      dashed: false,
    });
  }

  if (trimPrice != null && trimAbove) {
    zones.push({
      zoneKey: "trim",
      price: trimPrice,
      mode: "band",
      bandExtend: "above",
      color: "var(--signal-neutral)",
      label: `Take profit above ${formatMoney(trimPrice)}`,
      dashed: false,
    });
  } else if (trimPrice != null && directive.trim_on?.trigger_type === "price_below") {
    zones.push({
      zoneKey: "trim",
      price: trimPrice,
      mode: "band",
      bandExtend: "below",
      color: "var(--signal-neutral)",
      label: `Take profit below ${formatMoney(trimPrice)}`,
      dashed: true,
    });
  }

  if (breakPrice != null) {
    const below = directive.breaks_if?.trigger_type === "price_below";
    zones.push({
      zoneKey: "break",
      price: breakPrice,
      mode: "line",
      color: "var(--signal-bearish)",
      label: below ? `Exit below ${formatMoney(breakPrice)}` : `Exit above ${formatMoney(breakPrice)}`,
      dashed: true,
    });
  }

  return zones;
}

function zoneProximityDistance(
  key: ChartZoneKey,
  directive: Directive,
  currentPrice: number,
): number | null {
  const addPrice = directiveZonePrice(directive.add_on);
  const trimPrice = directiveZonePrice(directive.trim_on);
  const breakPrice = directiveZonePrice(directive.breaks_if);

  if (key === "add" && addPrice != null) {
    if (directive.add_on?.trigger_type === "price_below") {
      return currentPrice > addPrice ? currentPrice - addPrice : 0;
    }
    if (directive.add_on?.trigger_type === "price_above") {
      return currentPrice < addPrice ? addPrice - currentPrice : 0;
    }
  }
  if (key === "trim" && trimPrice != null) {
    if (directive.trim_on?.trigger_type === "price_above") {
      return currentPrice < trimPrice ? trimPrice - currentPrice : 0;
    }
    if (directive.trim_on?.trigger_type === "price_below") {
      return currentPrice > trimPrice ? currentPrice - trimPrice : 0;
    }
  }
  if (key === "break" && breakPrice != null) {
    if (directive.breaks_if?.trigger_type === "price_below") {
      return currentPrice > breakPrice ? currentPrice - breakPrice : 0;
    }
    if (directive.breaks_if?.trigger_type === "price_above") {
      return currentPrice < breakPrice ? breakPrice - currentPrice : 0;
    }
  }
  return null;
}

/** Show the single zone visual closest to the live quote. */
export function pickVisibleChartZoneKeys(directive: Directive, currentPrice: number): ChartZoneKey[] {
  const stance = (directive.stance ?? "").trim().toLowerCase();
  const trimPrice = directiveZonePrice(directive.trim_on);
  if ((stance === "trim" || stance === "avoid") && trimPrice != null) {
    return ["trim"];
  }

  const breakPrice = directiveZonePrice(directive.breaks_if);
  if (
    breakPrice != null &&
    directive.breaks_if?.trigger_type === "price_below" &&
    currentPrice <= breakPrice
  ) {
    return ["break"];
  }

  // Never surface a buy/accumulate zone for a stance that's telling the user to sell or stay away.
  const bearishStance = stance === "trim" || stance === "avoid";
  const candidateKeys = bearishStance ? (["trim", "break"] as const) : (["add", "trim", "break"] as const);

  const ranked = candidateKeys
    .map((key) => ({ key, distance: zoneProximityDistance(key, directive, currentPrice) }))
    .filter((row): row is { key: ChartZoneKey; distance: number } => row.distance != null)
    .sort((a, b) => a.distance - b.distance);

  if (!ranked.length) return [];
  return [ranked[0]!.key];
}

export function filterChartZones(
  zones: PriceChartZone[],
  visibleKeys: ChartZoneKey[],
): PriceChartZone[] {
  const visible = new Set(visibleKeys);
  return zones.filter((zone) => zone.zoneKey && visible.has(zone.zoneKey));
}

/** Hero chart: real buy bands stay shaded; single-price triggers become one line. */
export function prepareChartZonesForDisplay(zones: PriceChartZone[]): PriceChartZone[] {
  return zones.map((zone) => {
    if (zone.mode === "band" && zone.bandExtend) {
      return { ...zone, mode: "line" as const, dashed: true };
    }
    return zone;
  });
}

function formatLevelsLine(
  directive: Directive,
  formatMoney: (value: number) => string,
  omitKeys: Set<ChartZoneKey> = new Set(),
): string | undefined {
  const parts: string[] = [];
  const trimPrice = directiveZonePrice(directive.trim_on);
  const breakPrice = directiveZonePrice(directive.breaks_if);

  if (!omitKeys.has("trim") && trimPrice != null && directive.trim_on?.trigger_type === "price_above") {
    parts.push(`Take profit above ${formatMoney(trimPrice)}`);
  }
  if (!omitKeys.has("break") && breakPrice != null && directive.breaks_if?.trigger_type === "price_below") {
    parts.push(`Exit if it drops below ${formatMoney(breakPrice)}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

export type PriceAwareCallCopy = {
  headline: string;
  body: string;
  levels?: string;
  rationale?: string;
  chartZoneKeys: ChartZoneKey[];
};

/** One editorial call block + which chart zones to show near the live quote. */
export function resolvePriceAwareCall(
  directive: Directive,
  currentPrice: number,
  formatMoney: (value: number) => string,
  formatLevel: (value: number) => string = formatMoney,
): PriceAwareCallCopy {
  const stance = (directive.stance ?? "watch").toLowerCase();
  const addPrice = directiveZonePrice(directive.add_on);
  const trimPrice = directiveZonePrice(directive.trim_on);
  const breakPrice = directiveZonePrice(directive.breaks_if);
  const rationale = directiveRationaleDistinct(directive) ?? undefined;
  const priceLabel = formatMoney(currentPrice);
  const chartZoneKeys = pickVisibleChartZoneKeys(directive, currentPrice);
  const visible = new Set(chartZoneKeys);

  let headline = resolveCallHeadline(directive);
  let body = directive.action_now?.trim() || directive.rationale?.trim() || directive.text?.trim() || "";

  if (
    breakPrice != null &&
    directive.breaks_if?.trigger_type === "price_below" &&
    currentPrice <= breakPrice
  ) {
    headline = stance === "avoid" ? "Avoid" : "Reassess";
    body =
      directive.breaks_if?.text?.trim() ||
      `Below ${formatLevel(breakPrice)} the setup is broken. Wait for reclaim or cut risk.`;
    return { headline, body, rationale, chartZoneKeys };
  }

  if ((stance === "accumulate" || stance === "hold") && addPrice != null) {
    if (directive.add_on?.trigger_type === "price_below") {
      if (currentPrice > addPrice) {
        headline = "Accumulate";
        body = `Buy here for upside. Add more below ${formatLevel(addPrice)} if it dips.`;
      } else {
        headline = "Accumulate now";
        body = `In the buy zone at ${priceLabel}. Good place to add.`;
      }
    } else if (directive.add_on?.trigger_type === "price_above") {
      if (currentPrice < addPrice) {
        headline = "Watch";
        body = `Hold at ${priceLabel} until price reclaims ${formatLevel(addPrice)}.`;
      } else {
        headline = "Accumulate now";
        body = `Breakout held at ${priceLabel}. Add here.`;
      }
    }
  } else if (stance === "trim" && trimPrice != null && directive.trim_on?.trigger_type === "price_above") {
    if (currentPrice >= trimPrice) {
      headline = "Trim";
      body = `At ${priceLabel} you're in the trim zone. Take profits into strength.`;
    } else if (!directive.text?.trim()) {
      headline = "Trim into strength";
      body = `Hold at ${priceLabel}; trim above ${formatLevel(trimPrice)} if it extends.`;
    }
  }

  const levels = formatLevelsLine(directive, formatLevel, visible);
  return { headline, body, levels, rationale, chartZoneKeys };
}

export function directiveRationaleDistinct(directive: Directive): string | null {
  const rationale = directive.rationale?.trim();
  const actionNow = directive.action_now?.trim();
  if (!rationale) return null;
  if (actionNow && (rationale === actionNow || actionNow.includes(rationale))) return null;
  return rationale;
}

export type DirectiveSmartAlertTone = "bullish" | "bearish" | "warn" | "neutral";

export type DirectiveSmartAlert = {
  id: string;
  title: string;
  detail?: string;
  condition?: "below" | "above";
  price?: number;
  directiveText: string;
  alertable: boolean;
  tone: DirectiveSmartAlertTone;
};

function smartAlertTone(id: string): DirectiveSmartAlertTone {
  if (id === "add") return "bullish";
  if (id === "trim") return "warn";
  return "neutral";
}

export function smartAlertToneColors(tone: DirectiveSmartAlertTone): { title: string } {
  switch (tone) {
    case "bullish":
      return { title: "var(--signal-bullish)" };
    case "bearish":
      return { title: "var(--signal-bearish)" };
    case "warn":
      return { title: "var(--signal-neutral)" };
    default:
      return { title: "var(--on-surface)" };
  }
}

/** Price rows for the right-rail smart alerts card (add + trim zones only). */
export function buildDirectiveSmartAlerts(
  directive: Directive | null | undefined,
  formatMoney: (value: number) => string,
): DirectiveSmartAlert[] {
  if (!directive) return [];

  const rows: DirectiveSmartAlert[] = [];
  const seen = new Set<string>();
  const stance = (directive.stance ?? "").trim().toLowerCase();
  const suppressAddZone = stance === "trim" || stance === "avoid";
  // Avoid calls aren't telling you to trim a position — no zone alert applies at all, just earnings.
  const suppressTrimZone = stance === "avoid";

  const pushPriceZone = (
    id: string,
    zoneTitle: string,
    zone: DirectiveZone | undefined,
  ) => {
    if (!zone?.text?.trim()) return;
    const price = directiveZonePrice(zone);
    if (price == null) return;
    const condition: "below" | "above" = zone.trigger_type === "price_above" ? "above" : "below";
    const key = `${condition}:${price.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id,
      title: zoneTitle,
      detail: `${condition} ${formatMoney(price)}`,
      condition,
      price,
      directiveText: zone.text.trim(),
      alertable: true,
      tone: smartAlertTone(id),
    });
  };

  if (!suppressAddZone) {
    pushPriceZone("add", "Add zone", directive.add_on);
  }
  if (!suppressTrimZone) {
    pushPriceZone("trim", "Trim zone", directive.trim_on);
  }

  return rows;
}
