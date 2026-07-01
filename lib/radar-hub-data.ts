import type { Directive } from "@/lib/stock";
import type { WatchlistBrief, WatchlistRow } from "@/lib/watchlist-view";
import type { PortfolioExposure } from "@/lib/portfolio-scenarios";
import type { BookAnomaly, BookBuzz, BookPremarket } from "@/components/radar-signals-on-book";
import { formatDirectiveTrigger, directiveZonePrice, normalizeDirectiveForUi, zoneTriggerMet } from "@/lib/directive-ui";
import type { DirectiveZone } from "@/lib/stock";
import {
  buildBookRead,
  humanizeDirectiveLine,
  humanizeRebalanceNote,
  isAiSummary,
  isGenericMoveLine,
  isPulseStatsLine,
} from "@/lib/radar-copy";

export type RadarTapeRow = {
  instrumentId: string;
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  price: number | null;
  changePct: number | null;
  weightPct: number | null;
  stance: string;
  actionLine?: string;
  trigger?: string;
  attentionReason?: string;
  attentionKind?: string;
  hasMaterialChange?: boolean;
  isNew?: boolean;
  covered: boolean;
  callHint?: string;
  callUrgent?: boolean;
  callKind?: RadarCallKind;
  flagTier?: "now" | "level" | "move";
};

export type RadarPriorityItem = {
  id: string;
  kind: "anomaly" | "premarket" | "buzz" | "change" | "directive";
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  tone: "up" | "down" | "neutral";
  headline: string;
  subline?: string;
  stance?: string;
};

export type RadarCallKind = "buy_dip" | "trim" | "entry" | "exit";

export type RadarActionCard = {
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  stance: string;
  callKind: RadarCallKind;
  price: number | null;
  weightPct: number | null;
  changePct: number | null;
  isHolding: boolean;
  actionLine: string;
  zoneLabel?: string;
  trigger?: string;
  changed?: boolean;
};

export type RadarRiskFlag = { headline: string; body?: string };

export type RadarSectorCluster = { sector: string; weightPct: number; count: number };

export type RadarWeightReco = {
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  directive?: string;
  minPct: number | null;
  maxPct: number | null;
  currentPct: number | null;
  note?: string;
};

export type RadarSuggestionItem = {
  ticker: string;
  name?: string;
  reason?: string;
  market: "US" | "IN";
};

export type RadarReceipt = {
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  call: string;
  dayChangePct: number | null;
  eventDate: string | null;
};

export type RadarBookStats = {
  totalCount: number;
  holdingsCount: number;
  watchingCount: number;
  flaggedCount: number;
  priorityCount: number;
  calmCount: number;
  avgDayChange: number | null;
  holdingsDayChange: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  leader?: { ticker: string; changePct: number };
  laggard?: { ticker: string; changePct: number };
};

export type RadarPillarScores = {
  overall: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
};

export type RadarHubModel = {
  stats: RadarBookStats;
  narrative?: string;
  tape: { holdings: RadarTapeRow[]; watching: RadarTapeRow[] };
  priority: RadarPriorityItem[];
  topCalls: RadarActionCard[];
  actions: {
    today: {
      holdings: { buyDip: RadarActionCard[]; trim: RadarActionCard[]; exit: RadarActionCard[] };
      watching: { entry: RadarActionCard[]; exit: RadarActionCard[] };
    };
    setups: {
      holdings: { buyDip: RadarActionCard[]; trim: RadarActionCard[] };
      watching: { entry: RadarActionCard[] };
    };
    holdCount: number;
  };
  diagnosis: {
    summary?: string;
    pillars: RadarPillarScores;
    riskFlags: RadarRiskFlag[];
    blindSpotTitle?: string;
    blindSpotBody?: string;
    clusters: RadarSectorCluster[];
    regime?: string;
  };
  rebalance: {
    concentration?: {
      top1Pct: number | null;
      top3Pct: number | null;
      riskLabel?: string;
    };
    headline?: string;
    recos: RadarWeightReco[];
  };
  suggestions: RadarSuggestionItem[];
  receipts: RadarReceipt[];
};

const ACTIONABLE = new Set(["accumulate", "trim", "avoid"]);
const STANCE_WEIGHT: Record<string, number> = {
  accumulate: 3,
  trim: 3,
  avoid: 3,
  watch: 2,
  hold: 1,
};
const CONFIDENCE_WEIGHT: Record<string, number> = { high: 3, med: 2, low: 1 };

const money = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function rowDirective(row: WatchlistRow): Directive | null {
  return normalizeDirectiveForUi(row.ai_directive);
}

function rowChanges(row: WatchlistRow): Record<string, unknown> {
  return ((row as WatchlistRow & { changes?: Record<string, unknown> }).changes ?? {}) as Record<
    string,
    unknown
  >;
}

function directiveUrgency(row: WatchlistRow, directive: Directive): number {
  const stance = STANCE_WEIGHT[directive.stance ?? "hold"] ?? 1;
  const conf = CONFIDENCE_WEIGHT[directive.confidence ?? "low"] ?? 1;
  const move = Math.abs(row.day_change_pct ?? 0);
  const score = typeof row.scores?.overall === "number" ? Math.abs(row.scores.overall - 50) / 10 : 0;
  const positionBoost = row.position_type === "holding" ? 0.5 : 0;
  return stance * 10 + conf * 5 + Math.min(move, 10) + score + positionBoost;
}

function byTapeSort(a: WatchlistRow, b: WatchlistRow): number {
  const attention = (b.attention_score ?? 0) - (a.attention_score ?? 0);
  if (attention !== 0) return attention;
  return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
}

function formatTrigger(directive: Directive): string | undefined {
  const trig = formatDirectiveTrigger(directive, money);
  if (!trig) return undefined;
  if (trig.condition === "below" && trig.price != null) return `below $${money(trig.price)}`;
  if (trig.condition === "above" && trig.price != null) return `above $${money(trig.price)}`;
  return trig.display;
}

function mapTapeRow(row: WatchlistRow): RadarTapeRow {
  const d = rowDirective(row);
  const changes = rowChanges(row);
  return {
    instrumentId: row.instrument_id,
    ticker: row.ticker,
    name: row.instrument_name,
    logoUrl: row.logo_url,
    market: row.market === "IN" ? "IN" : "US",
    price: row.price,
    changePct: row.day_change_pct,
    weightPct:
      typeof row.holding?.portfolio_weight_pct === "number"
        ? row.holding.portfolio_weight_pct
        : null,
    stance: d?.stance ?? "watch",
    actionLine: d?.text,
    trigger: d ? formatTrigger(d) : undefined,
    attentionReason: String(row.attention_reason ?? "").trim() || undefined,
    attentionKind: row.attention_kind,
    hasMaterialChange: Boolean(changes.has_material_change),
    isNew: Boolean(changes.is_new),
    covered: row.coverage_status === "ready" && Boolean(d),
  };
}

function avgChange(rows: WatchlistRow[]): number | null {
  const vals = rows
    .map((r) => r.day_change_pct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function weightedHoldingsChange(holdings: WatchlistRow[]): number | null {
  const weighted = holdings.filter(
    (r) =>
      typeof r.holding?.portfolio_weight_pct === "number" &&
      (r.holding.portfolio_weight_pct as number) > 0 &&
      typeof r.day_change_pct === "number",
  );
  if (weighted.length === 0) return avgChange(holdings);
  let sum = 0;
  let w = 0;
  for (const r of weighted) {
    const weight = r.holding!.portfolio_weight_pct as number;
    sum += (r.day_change_pct as number) * weight;
    w += weight;
  }
  return w > 0 ? sum / w : null;
}

export function computePillarAverages(rows: WatchlistRow[]): RadarPillarScores {
  const keys = ["overall", "valuation", "growth", "quality", "momentum"] as const;
  const out: RadarPillarScores = {
    overall: null,
    valuation: null,
    growth: null,
    quality: null,
    momentum: null,
  };
  const holdingRows = rows.filter((r) => r.position_type === "holding");
  const positionAware =
    holdingRows.length > 0 &&
    holdingRows.every(
      (r) =>
        typeof r.holding?.portfolio_weight_pct === "number" &&
        (r.holding.portfolio_weight_pct as number) > 0,
    );

  for (const key of keys) {
    if (positionAware) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const r of holdingRows) {
        const score = r.scores?.[key];
        const wt = r.holding!.portfolio_weight_pct as number;
        if (typeof score === "number" && Number.isFinite(score) && wt > 0) {
          weightedSum += score * wt;
          totalWeight += wt;
        }
      }
      out[key] = totalWeight > 0 ? weightedSum / totalWeight : null;
    } else {
      const values: number[] = [];
      for (const r of rows) {
        const v = r.scores?.[key];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
      out[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
  }
  return out;
}

function isGenericMoveHeadline(text: string): boolean {
  return isGenericMoveLine(text);
}

function buildPriorityItems(
  rows: WatchlistRow[],
  anomalies: BookAnomaly[],
  buzz: BookBuzz[],
  premarket: BookPremarket[],
): RadarPriorityItem[] {
  const items: Array<RadarPriorityItem & { weight: number }> = [];
  const seen = new Set<string>();

  for (const p of premarket) {
    const key = `premarket-${p.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const up = p.gapPct >= 0;
    items.push({
      id: key,
      kind: "premarket",
      ticker: p.ticker,
      name: p.name,
      logoUrl: p.logoUrl,
      market: p.market,
      tone: up ? "up" : "down",
      headline: `${up ? "▲" : "▼"} ${Math.abs(p.gapPct).toFixed(1)}% pre-market gap`,
      subline: "Before the open",
      weight: 90 + Math.min(10, Math.abs(p.gapPct)),
    });
  }

  for (const a of anomalies) {
    const key = `anomaly-${a.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const up = (a.dayChangePct ?? 0) >= 0;
    const headline = a.headline || `Unusual move ${up ? "up" : "down"} today`;
    if (isGenericMoveHeadline(headline)) continue;
    items.push({
      id: key,
      kind: "anomaly",
      ticker: a.ticker,
      name: a.name,
      logoUrl: a.logoUrl,
      market: a.market,
      tone: up ? "up" : "down",
      headline,
      subline:
        typeof a.dayChangePct === "number"
          ? `${up ? "▲" : "▼"} ${Math.abs(a.dayChangePct).toFixed(1)}%`
          : undefined,
      weight: 80 + Math.min(15, Math.abs(a.dayChangePct ?? 0)),
    });
  }

  for (const b of buzz.slice(0, 2)) {
    const key = `buzz-${b.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: key,
      kind: "buzz",
      ticker: b.ticker,
      market: b.market,
      tone: b.sentiment === "bullish" ? "up" : b.sentiment === "bearish" ? "down" : "neutral",
      headline: b.summary || "Getting buzz on Reddit",
      subline: `${b.mentions} mentions`,
      weight: 55 + Math.min(20, b.mentions),
    });
  }

  return items
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ weight: _w, ...item }) => item);
}

function formatSetupZoneLabel(
  zone: DirectiveZone | undefined,
  kind: "buy" | "trim" | "entry",
): string | undefined {
  return formatZoneLabel(zone, kind);
}

function hasPriceZone(zone?: DirectiveZone): boolean {
  return zone?.trigger_type === "price_below" || zone?.trigger_type === "price_above";
}

function isCallActionableNow(row: WatchlistRow, d: Directive, callKind: RadarCallKind): boolean {
  const price = row.price;
  if (typeof price !== "number" || !Number.isFinite(price)) return false;
  const stance = (d.stance ?? "hold").toLowerCase();

  switch (callKind) {
    case "buy_dip":
      if (hasPriceZone(d.add_on)) return zoneTriggerMet(d.add_on, price);
      return stance === "accumulate";
    case "trim":
      if (hasPriceZone(d.trim_on)) return zoneTriggerMet(d.trim_on, price);
      return false;
    case "entry":
      if (hasPriceZone(d.add_on)) return zoneTriggerMet(d.add_on, price);
      return stance === "accumulate";
    case "exit":
      if (hasPriceZone(d.breaks_if)) return zoneTriggerMet(d.breaks_if, price);
      return stance === "avoid";
  }
}

function isSetupCandidate(row: WatchlistRow, d: Directive, callKind: RadarCallKind): boolean {
  if (isCallActionableNow(row, d, callKind)) return false;
  switch (callKind) {
    case "buy_dip":
      return hasPriceZone(d.add_on);
    case "trim":
      return hasPriceZone(d.trim_on);
    case "entry":
      return hasPriceZone(d.add_on);
    case "exit":
      return hasPriceZone(d.breaks_if);
  }
}

function asSetupCard(row: WatchlistRow, d: Directive, card: RadarActionCard): RadarActionCard {
  let zoneLabel = card.zoneLabel;
  switch (card.callKind) {
    case "buy_dip":
      zoneLabel = formatSetupZoneLabel(d.add_on, "buy") ?? zoneLabel;
      break;
    case "trim":
      zoneLabel = formatSetupZoneLabel(d.trim_on, "trim") ?? zoneLabel;
      break;
    case "entry":
      zoneLabel = formatSetupZoneLabel(d.add_on, "entry") ?? zoneLabel;
      break;
    case "exit":
      zoneLabel = formatSetupZoneLabel(d.breaks_if, "trim") ?? zoneLabel;
      break;
  }
  return { ...card, zoneLabel };
}

function formatZoneLabel(
  zone: DirectiveZone | undefined,
  kind: "buy" | "trim" | "entry",
): string | undefined {
  const price = directiveZonePrice(zone);
  if (price == null || !zone?.trigger_type) return undefined;
  const p = `$${money(price)}`;
  if (zone.trigger_type === "price_below") {
    if (kind === "buy") return `Buy more below ${p}`;
    if (kind === "entry") return `Enter below ${p}`;
    if (kind === "trim") return `Trim below ${p}`;
  }
  if (zone.trigger_type === "price_above") {
    if (kind === "buy") return `Buy more above ${p}`;
    if (kind === "entry") return `Enter above ${p}`;
    if (kind === "trim") return `Trim above ${p}`;
  }
  return undefined;
}

function mapActionCard(row: WatchlistRow, callKind: RadarCallKind, zoneLabel?: string): RadarActionCard | null {
  const d = rowDirective(row);
  if (!d) return null;
  const changes = rowChanges(row);
  return {
    ticker: row.ticker,
    name: row.instrument_name,
    logoUrl: row.logo_url,
    market: row.market === "IN" ? "IN" : "US",
    stance: d.stance ?? "watch",
    callKind,
    price: typeof row.price === "number" && Number.isFinite(row.price) ? row.price : null,
    weightPct:
      typeof row.holding?.portfolio_weight_pct === "number"
        ? row.holding.portfolio_weight_pct
        : null,
    changePct: typeof row.day_change_pct === "number" ? row.day_change_pct : null,
    isHolding: row.position_type === "holding",
    actionLine: humanizeDirectiveLine(d.text),
    zoneLabel,
    trigger: zoneLabel ? undefined : formatTrigger(d),
    changed: Boolean(changes.has_material_change),
  };
}

function buildPositionActions(row: WatchlistRow): RadarActionCard[] {
  const d = rowDirective(row);
  if (!d) return [];
  const stance = (d.stance ?? "hold").toLowerCase();
  const isHolding = row.position_type === "holding";
  const out: RadarActionCard[] = [];

  if (isHolding) {
    if (stance === "accumulate" || d.add_on?.trigger_type === "price_below" || d.add_on?.trigger_type === "price_above") {
      const trig = formatTrigger(d);
      const zone =
        formatZoneLabel(d.add_on, "buy") ||
        (stance === "accumulate" && trig ? `Buy more ${trig}` : undefined);
      if (zone || stance === "accumulate") {
        const card = mapActionCard(row, "buy_dip", zone);
        if (card) out.push(card);
      }
    }
    if (stance === "trim" || d.trim_on?.trigger_type) {
      const trig = formatTrigger(d);
      const zone =
        formatZoneLabel(d.trim_on, "trim") ||
        (stance === "trim" && trig ? `Trim ${trig}` : undefined);
      if (zone || stance === "trim") {
        const card = mapActionCard(row, "trim", zone);
        if (card) out.push(card);
      }
    }
    if (stance === "avoid") {
      const zone = formatZoneLabel(d.breaks_if, "trim") || "Exit if thesis breaks";
      const card = mapActionCard(row, "exit", zone);
      if (card) out.push(card);
    }
    return out;
  }

  // watching — entry setups only
  if (stance === "accumulate" || stance === "watch") {
    const trig = formatTrigger(d);
    const zone =
      formatZoneLabel(d.add_on, "entry") ||
      formatZoneLabel(d.add_on, "buy") ||
      (trig ? `Enter ${trig}` : undefined);
    if (zone || stance === "accumulate" || stance === "watch") {
      const card = mapActionCard(row, "entry", zone);
      if (card) out.push(card);
    }
  }
  if (stance === "avoid") {
    const card = mapActionCard(row, "exit", "Not a buy right now");
    if (card) out.push(card);
  }
  return out;
}

function buildTapeHints(input: {
  todayTrim: RadarActionCard[];
  todayBuy: RadarActionCard[];
  todayEntry: RadarActionCard[];
  setupTrim: RadarActionCard[];
  setupBuy: RadarActionCard[];
  setupEntry: RadarActionCard[];
}): Map<string, { hint: string; urgent: boolean; callKind: RadarCallKind }> {
  const out = new Map<string, { hint: string; urgent: boolean; callKind: RadarCallKind }>();
  const tiers: [RadarActionCard[], boolean][] = [
    [input.todayTrim, true],
    [input.todayBuy, true],
    [input.todayEntry, true],
    [input.setupTrim, false],
    [input.setupBuy, false],
    [input.setupEntry, false],
  ];
  for (const [cards, urgent] of tiers) {
    for (const card of cards) {
      const key = card.ticker.toUpperCase();
      if (out.has(key)) continue;
      const hint = card.zoneLabel || card.actionLine;
      if (!hint) continue;
      out.set(key, { hint, urgent, callKind: card.callKind });
    }
  }
  return out;
}

function tapeFlagTier(row: RadarTapeRow): RadarTapeRow["flagTier"] {
  if (row.callUrgent) return "now";
  if (row.callHint) return "level";
  if (row.hasMaterialChange) return "move";
  return undefined;
}

function applyTapeHints(
  rows: RadarTapeRow[],
  hints: Map<string, { hint: string; urgent: boolean; callKind: RadarCallKind }>,
): RadarTapeRow[] {
  return rows.map((row) => {
    const hint = hints.get(row.ticker.toUpperCase());
    if (!hint) {
      const flagTier = tapeFlagTier(row);
      return flagTier ? { ...row, flagTier } : row;
    }
    const enriched: RadarTapeRow = {
      ...row,
      callHint: hint.hint,
      callUrgent: hint.urgent,
      callKind: hint.callKind,
    };
    return { ...enriched, flagTier: tapeFlagTier(enriched) };
  });
}

function sortActionCards(cards: RadarActionCard[]): RadarActionCard[] {
  return cards.sort((a, b) => {
    const aw = a.weightPct ?? 0;
    const bw = b.weightPct ?? 0;
    if (bw !== aw) return bw - aw;
    return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
  });
}

type BookActionBuckets = {
  todayHoldingsBuy: RadarActionCard[];
  todayHoldingsTrim: RadarActionCard[];
  todayHoldingsExit: RadarActionCard[];
  todayWatchingEntry: RadarActionCard[];
  todayWatchingExit: RadarActionCard[];
  setupHoldingsBuy: RadarActionCard[];
  setupHoldingsTrim: RadarActionCard[];
  setupWatchingEntry: RadarActionCard[];
  holdCount: number;
};

function collectBookActionBuckets(rows: WatchlistRow[]): BookActionBuckets {
  const todayHoldingsBuy: RadarActionCard[] = [];
  const todayHoldingsTrim: RadarActionCard[] = [];
  const todayHoldingsExit: RadarActionCard[] = [];
  const todayWatchingEntry: RadarActionCard[] = [];
  const todayWatchingExit: RadarActionCard[] = [];
  const setupHoldingsBuy: RadarActionCard[] = [];
  const setupHoldingsTrim: RadarActionCard[] = [];
  const setupWatchingEntry: RadarActionCard[] = [];
  let holdCount = 0;

  for (const row of rows) {
    const d = rowDirective(row);
    const stance = (d?.stance ?? "hold").toLowerCase();
    if (stance === "hold" || !d) {
      holdCount += 1;
      continue;
    }
    const cards = buildPositionActions(row);
    for (const card of cards) {
      if (isCallActionableNow(row, d, card.callKind)) {
        if (row.position_type === "holding") {
          if (card.callKind === "buy_dip") todayHoldingsBuy.push(card);
          else if (card.callKind === "trim") todayHoldingsTrim.push(card);
          else if (card.callKind === "exit") todayHoldingsExit.push(card);
        } else {
          if (card.callKind === "entry") todayWatchingEntry.push(card);
          else if (card.callKind === "exit") todayWatchingExit.push(card);
        }
      } else if (isSetupCandidate(row, d, card.callKind)) {
        const setup = asSetupCard(row, d, card);
        if (row.position_type === "holding") {
          if (card.callKind === "buy_dip") setupHoldingsBuy.push(setup);
          else if (card.callKind === "trim") setupHoldingsTrim.push(setup);
        } else if (card.callKind === "entry") {
          setupWatchingEntry.push(setup);
        }
      }
    }
  }

  return {
    todayHoldingsBuy,
    todayHoldingsTrim,
    todayHoldingsExit,
    todayWatchingEntry,
    todayWatchingExit,
    setupHoldingsBuy,
    setupHoldingsTrim,
    setupWatchingEntry,
    holdCount,
  };
}

function zoneDistanceToTrigger(price: number, zone?: DirectiveZone): number | null {
  const threshold = directiveZonePrice(zone);
  if (threshold == null || !zone?.trigger_type || zone.trigger_type === "none") return null;
  if (zone.trigger_type === "price_below") {
    return price <= threshold ? 0 : ((price - threshold) / price) * 100;
  }
  if (zone.trigger_type === "price_above") {
    return price >= threshold ? 0 : ((threshold - price) / price) * 100;
  }
  return null;
}

/** Pick the book call closest to today's price — buy-below beats trim-above when nearer the add zone. */
export function resolveBookCallHint(row: WatchlistRow, d: Directive): BookCallHint | null {
  const price = row.price;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  const isHolding = row.position_type === "holding";

  type Candidate = { hint: string; callKind: RadarCallKind; urgent: boolean; distance: number };
  const candidates: Candidate[] = [];

  if (d.add_on?.trigger_type) {
    const hint = formatZoneLabel(d.add_on, isHolding ? "buy" : "entry");
    const distance = zoneDistanceToTrigger(price, d.add_on);
    if (hint && distance != null) {
      candidates.push({
        hint,
        callKind: isHolding ? "buy_dip" : "entry",
        urgent: zoneTriggerMet(d.add_on, price),
        distance,
      });
    }
  }

  if (d.trim_on?.trigger_type) {
    const hint = formatZoneLabel(d.trim_on, "trim");
    const distance = zoneDistanceToTrigger(price, d.trim_on);
    if (hint && distance != null) {
      candidates.push({
        hint,
        callKind: "trim",
        urgent: zoneTriggerMet(d.trim_on, price),
        distance,
      });
    }
  }

  if (d.breaks_if?.trigger_type) {
    const hint = formatZoneLabel(d.breaks_if, "trim") || "Exit if thesis breaks";
    const distance = zoneDistanceToTrigger(price, d.breaks_if);
    if (distance != null) {
      candidates.push({
        hint,
        callKind: "exit",
        urgent: zoneTriggerMet(d.breaks_if, price),
        distance,
      });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return a.distance - b.distance;
    });
    const best = candidates[0];
    return { hint: best.hint, urgent: best.urgent, callKind: best.callKind };
  }

  const actionLine = humanizeDirectiveLine(d.text);
  if (!actionLine) return null;
  const stance = (d.stance ?? "hold").toLowerCase();
  if (stance === "trim") return { hint: actionLine, urgent: false, callKind: "trim" };
  if (stance === "avoid") return { hint: actionLine, urgent: false, callKind: "exit" };
  if (stance === "accumulate") {
    return { hint: actionLine, urgent: false, callKind: isHolding ? "buy_dip" : "entry" };
  }
  return { hint: actionLine, urgent: false, callKind: isHolding ? "buy_dip" : "entry" };
}

export type BookCallHint = {
  hint: string;
  urgent: boolean;
  callKind: RadarCallKind;
};

/** Best trim/buy/entry call per ticker — urgent when price is in trigger range today. */
export function buildBookCallHints(rows: WatchlistRow[]): Map<string, BookCallHint> {
  const out = new Map<string, BookCallHint>();
  for (const row of rows) {
    const directive = rowDirective(row);
    if (!directive) continue;
    const hint = resolveBookCallHint(row, directive);
    if (!hint) continue;
    out.set(row.ticker.toUpperCase(), hint);
  }
  return out;
}

function numVal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asPct(value: number | null): number | null {
  if (value === null) return null;
  if (value > 0 && value <= 1) return value * 100;
  return value;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

function asDict(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildRadarHubModel(input: {
  rows: WatchlistRow[];
  brief?: WatchlistBrief | null;
  portfolio?: Record<string, unknown>;
  factorTilt?: Record<string, unknown>;
  pillarAverages?: RadarPillarScores;
  suggestions?: Record<string, unknown>[];
  receipts?: RadarReceipt[];
  anomalies?: BookAnomaly[];
  buzz?: BookBuzz[];
  premarket?: BookPremarket[];
  exposure?: PortfolioExposure | null;
  regime?: string;
  trackedTickers?: Set<string>;
}): RadarHubModel {
  const {
    rows,
    brief,
    portfolio = {},
    factorTilt = {},
    suggestions = [],
    receipts = [],
    anomalies = [],
    buzz = [],
    premarket = [],
    exposure = null,
    regime,
    trackedTickers,
  } = input;

  const holdings = rows.filter((r) => r.position_type === "holding").sort(byTapeSort);
  const watching = rows.filter((r) => r.position_type !== "holding").sort(byTapeSort);
  const priority = buildPriorityItems(rows, anomalies, buzz, premarket);

  const actionableRows = rows
    .map((row) => ({ row, directive: rowDirective(row) }))
    .filter((item) => {
      const directive = item.directive;
      return directive != null && ACTIONABLE.has((directive.stance ?? "").toLowerCase());
    })
    .sort((a, b) => directiveUrgency(b.row, b.directive!) - directiveUrgency(a.row, a.directive!));

  const rowByTicker = new Map(rows.map((r) => [r.ticker.toUpperCase(), r]));
  const buckets = collectBookActionBuckets(rows);
  const sortedTodayBuy = sortActionCards(buckets.todayHoldingsBuy);
  const sortedTodayTrim = sortActionCards(buckets.todayHoldingsTrim);
  const sortedTodayExit = sortActionCards(buckets.todayHoldingsExit);
  const sortedTodayEntry = sortActionCards(buckets.todayWatchingEntry);
  const sortedTodayWatchingExit = sortActionCards(buckets.todayWatchingExit);
  const sortedSetupBuy = sortActionCards(buckets.setupHoldingsBuy);
  const sortedSetupTrim = sortActionCards(buckets.setupHoldingsTrim);
  const sortedSetupEntry = sortActionCards(buckets.setupWatchingEntry);
  const holdCount = buckets.holdCount;

  const tapeHints = buildTapeHints({
    todayTrim: sortedTodayTrim,
    todayBuy: sortedTodayBuy,
    todayEntry: sortedTodayEntry,
    setupTrim: sortedSetupTrim,
    setupBuy: sortedSetupBuy,
    setupEntry: sortedSetupEntry,
  });

  const topCalls = [
    ...sortedTodayTrim.slice(0, 1),
    ...sortedTodayBuy.slice(0, 1),
    ...sortedTodayEntry.slice(0, 1),
  ].slice(0, 3);

  const flaggedCount =
    buckets.todayHoldingsBuy.length +
    buckets.todayHoldingsTrim.length +
    buckets.todayHoldingsExit.length +
    buckets.todayWatchingEntry.length;
  const priorityCount = priority.length;
  const calmCount = Math.max(0, rows.length - new Set(priority.map((p) => p.ticker)).size);

  const priced = rows.filter((r) => typeof r.day_change_pct === "number");
  const upCount = priced.filter((r) => (r.day_change_pct as number) > 0.05).length;
  const downCount = priced.filter((r) => (r.day_change_pct as number) < -0.05).length;
  const flatCount = Math.max(0, priced.length - upCount - downCount);

  const leader = [...priced].sort(
    (a, b) => (b.day_change_pct as number) - (a.day_change_pct as number),
  )[0];
  const laggard = [...priced].sort(
    (a, b) => (a.day_change_pct as number) - (b.day_change_pct as number),
  )[0];

  const pillars = input.pillarAverages ?? computePillarAverages(rows);
  const ft = factorTilt;
  const mergedPillars: RadarPillarScores = {
    overall: numVal(ft.overall) ?? pillars.overall,
    valuation: numVal(ft.valuation) ?? pillars.valuation,
    growth: numVal(ft.growth) ?? pillars.growth,
    quality: numVal(ft.quality) ?? pillars.quality,
    momentum: numVal(ft.momentum) ?? pillars.momentum,
  };

  const riskFlags: RadarRiskFlag[] = asArray(portfolio.risk_flags)
    .slice(0, 5)
    .map((r) => ({
      headline: String(r.headline ?? r.title ?? "").trim(),
      body: String(r.body ?? "").trim() || undefined,
    }))
    .filter((r) => r.headline);

  const clusters: RadarSectorCluster[] = asArray(portfolio.clusters)
    .slice(0, 6)
    .map((c) => ({
      sector: String(c.sector ?? "Unknown"),
      weightPct: numVal(c.weight_pct) ?? 0,
      count: numVal(c.count) ?? 0,
    }));

  const exposureRecos = (exposure?.weight_recommendations ?? []).slice(0, 6);
  const portfolioRecos = asArray(portfolio.weight_recommendations).slice(0, 6);
  const recoSource = exposureRecos.length > 0 ? exposureRecos : portfolioRecos;

  const recos: RadarWeightReco[] = recoSource.map((r) => {
    const ticker = String(r.ticker ?? "").trim().toUpperCase();
    const row = rowByTicker.get(ticker);
    const rawNote = String(r.rebalance_note ?? "").trim();
    return {
      ticker,
      name: row?.instrument_name,
      logoUrl: row?.logo_url ?? null,
      market: (row?.market === "IN" ? "IN" : "US") as "US" | "IN",
      directive: String(r.directive ?? "").trim() || undefined,
      minPct: asPct(numVal((r.weight_target_range as Record<string, unknown> | undefined)?.min)),
      maxPct: asPct(numVal((r.weight_target_range as Record<string, unknown> | undefined)?.max)),
      currentPct: asPct(numVal(r.weight)),
      note: rawNote ? humanizeRebalanceNote(rawNote) : undefined,
    };
  }).filter((r) => r.ticker);

  const concentration = asDict(portfolio.concentration);
  const exposureConc = exposure?.concentration ?? {};

  const hubSuggestions: RadarSuggestionItem[] = suggestions
    .map((s) => ({
      ticker: String(s.ticker ?? "").trim().toUpperCase(),
      name: String(s.name ?? "").trim() || undefined,
      reason: String(s.why ?? s.reason ?? "").trim() || undefined,
      market: (String(s.market ?? "US") === "IN" ? "IN" : "US") as "US" | "IN",
    }))
    .filter((s) => s.ticker && (!trackedTickers || !trackedTickers.has(s.ticker)))
    .slice(0, 8);

  const rawNarrative = String(brief?.narrative ?? "").trim();
  const portfolioSummary = String(portfolio.summary ?? "").trim();
  const bookChangePct =
    holdings.length > 0 ? weightedHoldingsChange(holdings) : avgChange(rows);
  const narrative =
    (rawNarrative && !isAiSummary(rawNarrative) && !isPulseStatsLine(rawNarrative)
      ? rawNarrative
      : null) ||
    (portfolioSummary && !isAiSummary(portfolioSummary) ? portfolioSummary : null) ||
    buildBookRead({
      stats: {
        totalCount: rows.length,
        holdingsCount: holdings.length,
        watchingCount: watching.length,
        flaggedCount,
        priorityCount: priority.length,
        calmCount: 0,
        avgDayChange: avgChange(rows),
        holdingsDayChange: weightedHoldingsChange(holdings),
        upCount: 0,
        downCount: 0,
        flatCount: 0,
        leader:
          leader && typeof leader.day_change_pct === "number"
            ? { ticker: leader.ticker, changePct: leader.day_change_pct }
            : undefined,
        laggard:
          laggard && typeof laggard.day_change_pct === "number"
            ? { ticker: laggard.ticker, changePct: laggard.day_change_pct }
            : undefined,
      },
      pillars: mergedPillars,
      clusters,
      bookChangePct,
    }) ||
    (rows.length === 1
      ? `You're only tracking ${rows[0]!.ticker} — add more names and we'll map the whole book.`
      : undefined);

  return {
    stats: {
      totalCount: rows.length,
      holdingsCount: holdings.length,
      watchingCount: watching.length,
      flaggedCount,
      priorityCount,
      calmCount,
      avgDayChange: avgChange(rows),
      holdingsDayChange: weightedHoldingsChange(holdings),
      upCount,
      downCount,
      flatCount,
      leader:
        leader && typeof leader.day_change_pct === "number"
          ? { ticker: leader.ticker, changePct: leader.day_change_pct }
          : undefined,
      laggard:
        laggard && typeof laggard.day_change_pct === "number"
          ? { ticker: laggard.ticker, changePct: laggard.day_change_pct }
          : undefined,
    },
    narrative,
    tape: {
      holdings: applyTapeHints(holdings.map(mapTapeRow), tapeHints),
      watching: applyTapeHints(watching.map(mapTapeRow), tapeHints),
    },
    priority,
    topCalls,
    actions: {
      today: {
        holdings: {
          buyDip: sortedTodayBuy,
          trim: sortedTodayTrim,
          exit: sortedTodayExit,
        },
        watching: {
          entry: sortedTodayEntry,
          exit: sortedTodayWatchingExit,
        },
      },
      setups: {
        holdings: {
          buyDip: sortedSetupBuy,
          trim: sortedSetupTrim,
        },
        watching: {
          entry: sortedSetupEntry,
        },
      },
      holdCount,
    },
    diagnosis: {
      summary: String(portfolio.summary ?? "").trim() || undefined,
      pillars: mergedPillars,
      riskFlags,
      blindSpotTitle: String(brief?.blind_spot_title ?? "").trim() || undefined,
      blindSpotBody: String(brief?.blind_spot_body ?? "").trim() || undefined,
      clusters,
      regime,
    },
    rebalance: {
      concentration: {
        top1Pct: numVal(exposureConc.top1_pct) ?? numVal(concentration.top1_pct),
        top3Pct: numVal(exposureConc.top3_pct) ?? numVal(concentration.top3_pct),
        riskLabel: String(exposureConc.risk_label ?? concentration.risk_label ?? "").trim() || undefined,
      },
      headline: String(portfolio.rebalance_headline ?? "").trim() || undefined,
      recos,
    },
    suggestions: hubSuggestions,
    receipts,
  };
}
