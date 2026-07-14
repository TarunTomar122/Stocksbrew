import type {
  RadarUserView,
  WatchlistRow,
  HoldingsDiagnosis,
  RadarStockStateDoc,
} from "@/lib/watchlist-view";
import { resolveBookCallHint } from "@/lib/radar-hub-data";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import type { Directive } from "@/lib/stock";
import type {
  BookFlag,
  BookRow,
  DecisionCard,
  Direction,
  HealthPillar,
  IdeaCard,
} from "@/components/radar-next/types";

type DirectiveV2 = NonNullable<WatchlistRow["ai_directive"]>;

function getNormalizedDirective(row: WatchlistRow): Directive | null {
  const raw: DirectiveV2 | undefined = row.ai_directive ?? row.directive_v2;
  return normalizeDirectiveForUi(raw);
}

/** @deprecated Use getNormalizedDirective for price-zone logic. */
function getDirective(row: WatchlistRow): DirectiveV2 | null {
  return row.ai_directive ?? row.directive_v2 ?? null;
}

function directionFromCallKind(callKind: "buy_dip" | "entry" | "trim" | "exit"): Direction {
  if (callKind === "trim" || callKind === "exit") return "bearish";
  return "bullish";
}

/** Highlight only when live price is inside an AI buy-below or trim-above zone. */
function isPriceZoneHit(row: WatchlistRow): {
  hit: boolean;
  action: string | null;
  direction: Direction | null;
} {
  const directive = getNormalizedDirective(row);
  if (!directive) return { hit: false, action: null, direction: null };
  const call = resolveBookCallHint(row, directive);
  if (!call?.urgent) return { hit: false, action: null, direction: null };
  return {
    hit: true,
    action: call.hint,
    direction: directionFromCallKind(call.callKind),
  };
}

const BUY_STANCES = new Set(["accumulate", "buy", "add"]);
const SELL_STANCES = new Set(["trim", "sell", "reduce", "exit"]);

function directionForStance(stance: string | undefined): Direction {
  const s = (stance || "").toLowerCase();
  if (BUY_STANCES.has(s)) return "bullish";
  if (SELL_STANCES.has(s) || s === "avoid") return "bearish";
  return "neutral";
}

/**
 * A stock "needs a decision" today only when it's genuinely actionable:
 *  - you HOLD it and the call is to trim/sell (reduce exposure), or
 *  - you're WATCHING it and the call is to buy/accumulate (open a position).
 * Everything else (hold, avoid, add-to-a-holding) is not an action — it lives
 * in the book, not the decision deck.
 */
function isDecision(isHolding: boolean, stance: string | undefined): boolean {
  const s = (stance || "").toLowerCase();
  return isHolding ? SELL_STANCES.has(s) : BUY_STANCES.has(s);
}

/** Count names trading inside an AI price zone right now. */
export function countAttentionRows(rows: WatchlistRow[]): number {
  return rows.filter((row) => isPriceZoneHit(row).hit).length;
}

function money(value: number | null | undefined, currency: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const sym = currency === "INR" ? "₹" : "$";
  return `${sym}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function triggerFromZones(directive: DirectiveV2 | null, currency: string): string | null {
  if (!directive?.zones) return null;
  const z = directive.zones;
  if (typeof z.accumulate_below === "number") return `dips below ${money(z.accumulate_below, currency)}`;
  if (typeof z.breakout_above === "number") return `breaks above ${money(z.breakout_above, currency)}`;
  if (typeof z.trim_above === "number") return `pushes above ${money(z.trim_above, currency)}`;
  if (typeof z.near_term_resistance === "number") return `tests ${money(z.near_term_resistance, currency)}`;
  return null;
}

function actionLabel(directive: DirectiveV2 | null, direction: Direction, isHolding: boolean): string {
  const fromDirective = directive?.action?.label?.trim();
  if (fromDirective) return fromDirective;
  const stance = (directive?.stance || "").toLowerCase();
  if (stance === "accumulate") return isHolding ? "Add to position" : "Start a position on weakness";
  if (stance === "trim") return "Trim into strength";
  if (stance === "avoid") return "Stand aside";
  if (stance === "watch") return "Watch the level";
  if (stance === "hold") return "Hold steady";
  if (direction === "bullish") return isHolding ? "Let it run" : "Add on strength";
  if (direction === "bearish") return isHolding ? "Tighten your stop" : "Wait for a reset";
  return "Review the setup";
}

function hasOpenTrigger(directive: DirectiveV2 | null): boolean {
  if (!directive) return false;
  if (directive.trigger) return true;
  const z = directive.zones;
  return Boolean(
    z &&
      (typeof z.accumulate_below === "number" ||
        typeof z.breakout_above === "number" ||
        typeof z.trim_above === "number"),
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A short, structured catalyst chip — never a raw news headline. */
function catalystChip(row: WatchlistRow): string | null {
  const catalyst = row.catalysts?.[0] as Record<string, unknown> | undefined;
  if (!catalyst) return null;
  const kind = String(catalyst.kind || "").toLowerCase();
  const when = String(catalyst.date || catalyst.when || catalyst.expected_at || "").trim();
  const dateLabel = /^\d{4}-\d{2}-\d{2}/.test(when)
    ? `${MONTHS[Number(when.slice(5, 7)) - 1]} ${Number(when.slice(8, 10))}`
    : null;
  if (kind === "earnings") return dateLabel ? `Earnings · ${dateLabel}` : "Earnings soon";
  if (kind && dateLabel) return `${kind[0].toUpperCase()}${kind.slice(1)} · ${dateLabel}`;
  // Only fall back to a label if it's short enough to be a chip, not a sentence.
  const label = String(catalyst.label || catalyst.title || "").trim();
  if (label && label.length <= 22 && !/\s\s/.test(label)) return label;
  if (kind) return `${kind[0].toUpperCase()}${kind.slice(1)}`;
  return null;
}

/**
 * Today deck — only genuinely actionable calls: trim/sell on a holding, or
 * buy/accumulate on a watched name. Ordered by real urgency (news driver first,
 * then attention score, then size of today's move).
 */
export function buildDecisionCards(
  rows: WatchlistRow[],
  radarUserView: RadarUserView | null,
  max = 6,
): DecisionCard[] {
  const newsIds = new Set(
    (radarUserView?.attention_items ?? []).map((item) => item.instrument_id.toUpperCase()),
  );

  const toCard = (row: WatchlistRow): DecisionCard => {
    const directive = getDirective(row);
    const isHolding = row.position_type === "holding";
    const direction = directionForStance(directive?.stance);
    const nextTrigger = triggerFromZones(directive, row.currency);
    // Only surface the analyst target when it *supports* the call — upside on a
    // buy, downside on a trim. A contradicting consensus target (e.g. accumulate
    // with negative analyst upside) is confusing, so we leave it off the card.
    const rawTarget = typeof row.target_upside_pct === "number" ? row.target_upside_pct : null;
    const targetUpsidePct =
      rawTarget === null
        ? null
        : (direction === "bullish" && rawTarget > 0) || (direction === "bearish" && rawTarget < 0)
          ? rawTarget
          : null;
    return {
      ticker: row.ticker,
      market: row.market === "IN" ? "IN" : "US",
      href: `/stock/${row.ticker}`,
      action: actionLabel(directive, direction, isHolding),
      direction,
      price: row.price,
      dayChangePct: row.day_change_pct,
      currency: row.currency === "INR" ? "₹" : "$",
      score: row.scores?.overall ?? null,
      targetUpsidePct,
      catalyst: catalystChip(row),
      nextTrigger,
      positionLabel: isHolding ? "Holding" : "Watching",
      // Selling a holding is the most time-sensitive; news-driven ones too.
      urgent: isHolding || newsIds.has(row.instrument_id.toUpperCase()),
    };
  };

  const rank = (row: WatchlistRow): number => {
    let score = 0;
    if (newsIds.has(row.instrument_id.toUpperCase())) score += 1000;
    if (row.position_type === "holding") score += 500; // trims on holdings surface first
    score += row.attention_score ?? 0;
    score += Math.abs(row.day_change_pct ?? 0);
    return score;
  };

  return rows
    .filter((row) => isDecision(row.position_type === "holding", getDirective(row)?.stance))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, max)
    .map(toCard);
}

function daysUntil(iso: string): number | null {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function rowRsi(row: WatchlistRow): { value: number | null; state: string } {
  const tech = row.technicals?.rsi_14 as { value?: unknown; state?: unknown } | undefined;
  const value = typeof tech?.value === "number" ? tech.value : null;
  const state = String(tech?.state ?? "").toLowerCase();
  return { value, state };
}

function earningsFromCatalysts(row: WatchlistRow): string | null {
  for (const c of row.catalysts ?? []) {
    const cat = c as Record<string, unknown>;
    if (String(cat.kind || "").toLowerCase() !== "earnings") continue;
    const when = String(cat.date || cat.when || cat.expected_at || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(when)) return when;
  }
  return null;
}

/** Compact, high-signal chips for the book table. Capped so rows stay tight. */
export function buildBookFlags(
  row: WatchlistRow,
  state: RadarStockStateDoc | undefined,
  hasNews: boolean,
): BookFlag[] {
  const flags: BookFlag[] = [];

  if (hasNews) flags.push({ label: "News", tone: "info", title: "A news driver is moving this name" });

  // Earnings within the next few weeks (state first, catalysts as fallback).
  const earnDate =
    (String(state?.earnings_status || "").toLowerCase() === "upcoming" && state?.earnings_date) ||
    earningsFromCatalysts(row);
  if (earnDate) {
    const d = daysUntil(earnDate);
    if (d !== null && d >= 0 && d <= 21) {
      const label =
        d === 0 ? "Earnings today" : d === 1 ? "Earnings 1d" : d <= 7 ? `Earnings ${d}d` : `Earnings ${shortDate(earnDate)}`;
      flags.push({ label, tone: "earnings", title: `Earnings ${shortDate(earnDate)}` });
    }
  }

  const guidance = String(state?.guidance_direction || "").toLowerCase();
  if (guidance === "raised") flags.push({ label: "Guidance ↑", tone: "pos", title: "Guidance raised" });
  else if (guidance === "lowered") flags.push({ label: "Guidance ↓", tone: "neg", title: "Guidance lowered" });

  const rsiValue = typeof state?.rsi_14 === "number" ? state.rsi_14 : rowRsi(row).value;
  const rsiState = (String(state?.rsi_state || "") || rowRsi(row).state).toLowerCase();
  const overbought = rsiState === "overbought" || (rsiValue !== null && rsiValue >= 70);
  const oversold = rsiState === "oversold" || (rsiValue !== null && rsiValue <= 30);
  if (overbought) flags.push({ label: "Overbought", tone: "warn", title: `RSI ${rsiValue?.toFixed(0) ?? "high"}` });
  else if (oversold) flags.push({ label: "Oversold", tone: "info", title: `RSI ${rsiValue?.toFixed(0) ?? "low"}` });

  if (state?.last_filing_kind) {
    flags.push({ label: String(state.last_filing_kind).toUpperCase(), tone: "info", title: "New SEC filing" });
  }

  if (typeof row.target_upside_pct === "number" && row.target_upside_pct >= 25) {
    flags.push({
      label: `+${Math.round(row.target_upside_pct)}% target`,
      tone: "pos",
      title: "Analyst target upside",
    });
  }

  return flags.slice(0, 2);
}

export function buildBookRows(
  rows: WatchlistRow[],
  options: {
    states?: Record<string, RadarStockStateDoc>;
    newsInstrumentIds?: Set<string>;
  } = {},
): { holdings: BookRow[]; watching: BookRow[] } {
  const states = options.states ?? {};
  const newsIds = options.newsInstrumentIds ?? new Set<string>();
  const map = (row: WatchlistRow): BookRow => {
    const id = row.instrument_id.toUpperCase();
    const zone = isPriceZoneHit(row);
    const needsAttention = zone.hit;
    const currency = row.currency === "INR" ? "₹" : "$";
    const attentionAction = zone.action;
    const baseFlags = buildBookFlags(row, states[id], newsIds.has(id));
    const flags = baseFlags;

    return {
      ticker: row.ticker,
      market: row.market === "IN" ? "IN" : "US",
      name: row.instrument_name ?? null,
      href: `/stock/${row.ticker}`,
      price: row.price,
      dayChangePct: row.day_change_pct,
      currency,
      score: row.scores?.overall ?? null,
      flags,
      isHolding: row.position_type === "holding",
      needsAttention,
      attentionAction,
      attentionDirection: zone.direction,
    };
  };

  const sortBook = (list: BookRow[]) =>
    [...list].sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));

  const holdings = sortBook(rows.filter((r) => r.position_type === "holding").map(map));
  const watching = sortBook(rows.filter((r) => r.position_type !== "holding").map(map));
  return { holdings, watching };
}

export function countOpenLoops(rows: WatchlistRow[]): number {
  return rows.filter((r) => hasOpenTrigger(getDirective(r))).length;
}

const SOURCE_TAGS: Record<string, string> = {
  quality_compounders: "Quality compounder",
  cheap_growth: "Cheap growth",
  oversold_quality: "Oversold quality",
  momentum_leaders: "Momentum leader",
  smart_money: "Smart money",
  tikrr_top: "Top rated",
  anomaly: "Unusual move",
  heat: "Heating up",
  reddit: "Reddit buzz",
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ideaFromCandidate(c: Record<string, unknown>): IdeaCard | null {
  const instrumentId = String(c.instrument_id || "").trim();
  const ticker = String(c.ticker || "").trim().toUpperCase();
  if (!instrumentId || !ticker) return null;
  const reasons = Array.isArray(c.personalization_reasons)
    ? (c.personalization_reasons as unknown[]).map((r) => String(r)).filter(Boolean)
    : [];
  const reason =
    reasons[0] ||
    String(c.reason || c.why || c.anomaly_headline || c.heat_reason || "").trim() ||
    null;
  const sources = Array.isArray(c.sources) ? (c.sources as unknown[]).map((s) => String(s)) : [];
  const tag = sources.map((s) => SOURCE_TAGS[s]).find(Boolean) ?? null;
  return {
    instrumentId,
    ticker,
    market: instrumentId.toUpperCase().startsWith("IN_") ? "IN" : "US",
    name: String(c.name || "").trim() || null,
    href: `/stock/${ticker}`,
    score: num(c.overall_score) ?? num(c.score),
    reason: reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : null,
    movePct: num(c.anomaly_move_pct),
    tag,
    // Enriched server-side from live prices + analyst facts (see enrichIdeas).
    price: num(c.price),
    currency: null,
    dayChangePct: num(c.day_change_pct),
    targetUpsidePct: null,
  };
}

/**
 * Ideas to buy — three lenses over the already-materialized suggestion pool:
 * what fits your book, the top-rated names, and unusual movers. All exclude
 * stocks you already track (the pool is pre-filtered upstream).
 */
export function buildIdeas(
  suggestions: Array<Record<string, unknown>> | undefined,
  perLens = 6,
): { fits: IdeaCard[]; top: IdeaCard[]; unusual: IdeaCard[] } {
  const pool = (suggestions ?? [])
    .map((c) => ({ raw: c, card: ideaFromCandidate(c) }))
    .filter((x): x is { raw: Record<string, unknown>; card: IdeaCard } => x.card !== null);

  const fits = [...pool]
    .sort((a, b) => (num(b.raw.personalization_score) ?? 0) - (num(a.raw.personalization_score) ?? 0))
    .slice(0, perLens)
    .map((x) => x.card);

  const top = [...pool]
    .filter((x) => x.card.score !== null)
    .sort((a, b) => (b.card.score ?? 0) - (a.card.score ?? 0))
    .slice(0, perLens)
    .map((x) => x.card);

  const unusual = [...pool]
    .filter((x) => x.card.movePct !== null)
    .sort((a, b) => Math.abs(b.card.movePct ?? 0) - Math.abs(a.card.movePct ?? 0))
    .slice(0, perLens)
    .map((x) => x.card);

  return { fits, top, unusual };
}

export type IdeaMarketData = {
  price: number | null;
  currency: string | null;
  dayChangePct: number | null;
  targetUpsidePct: number | null;
};

/** Unique instrument ids across all idea lenses, for a single batched fetch. */
export function collectIdeaInstrumentIds(ideas: {
  fits: IdeaCard[];
  top: IdeaCard[];
  unusual: IdeaCard[];
}): string[] {
  const ids = new Set<string>();
  for (const c of [...ideas.fits, ...ideas.top, ...ideas.unusual]) {
    if (c.instrumentId) ids.add(c.instrumentId);
  }
  return [...ids];
}

/** Merge live price / movement / target data into the idea cards. */
export function enrichIdeas(
  ideas: { fits: IdeaCard[]; top: IdeaCard[]; unusual: IdeaCard[] },
  marketById: Map<string, IdeaMarketData>,
): { fits: IdeaCard[]; top: IdeaCard[]; unusual: IdeaCard[] } {
  const apply = (c: IdeaCard): IdeaCard => {
    const m = marketById.get(c.instrumentId);
    if (!m) return c;
    return {
      ...c,
      price: m.price ?? c.price,
      currency: m.currency ?? c.currency,
      dayChangePct: m.dayChangePct ?? c.dayChangePct,
      targetUpsidePct: m.targetUpsidePct ?? c.targetUpsidePct,
    };
  };
  return {
    fits: ideas.fits.map(apply),
    top: ideas.top.map(apply),
    unusual: ideas.unusual.map(apply),
  };
}

function gradeLetter(pct: number): string {
  if (pct >= 85) return "A";
  if (pct >= 75) return "B";
  if (pct >= 65) return "C";
  if (pct >= 50) return "D";
  return "F";
}

export type HealthProps = {
  grade: string;
  gradePct: number;
  headline: string;
  body: string;
  fixes: string[];
  pillars: HealthPillar[];
};

export function buildHealthProps(
  diagnosis: HoldingsDiagnosis,
  holdingsCount: number,
): HealthProps {
  const tilt = diagnosis.factor_tilt;
  const pillars: HealthPillar[] = [
    { label: "valuation", score: tilt.valuation ?? 0 },
    { label: "growth", score: tilt.growth ?? 0 },
    { label: "quality", score: tilt.quality ?? 0 },
    { label: "momentum", score: tilt.momentum ?? 0 },
  ].filter((p) => p.score > 0);

  if (holdingsCount === 0 || tilt.overall === null) {
    return {
      grade: "-",
      gradePct: 0,
      headline: "Mark your holdings to grade your book",
      body: "Once you flag which tracked names you actually own, Radar grades your book on valuation, growth, quality, and momentum, and flags what to fix.",
      fixes: [],
      pillars: [],
    };
  }

  const pct = Math.round(tilt.overall);
  const grade = gradeLetter(pct);
  const headline =
    pct >= 75
      ? "Your book is in good shape."
      : pct >= 60
        ? "Solid book with a few soft spots."
        : "Your book needs some attention.";
  const fixes = diagnosis.risk_flags
    .map((flag) => String((flag as Record<string, unknown>).headline || "").trim())
    .filter(Boolean);

  return {
    grade,
    gradePct: pct,
    headline,
    body: diagnosis.summary,
    fixes,
    pillars,
  };
}
