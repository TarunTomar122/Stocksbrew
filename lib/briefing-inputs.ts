/**
 * Converters from the shapes the store already holds into the plain inputs
 * `buildBriefing` takes. Pure: no store, no clock.
 */

import { etDayOf } from "@/lib/benchmark-day";
import { redactLevels } from "@/lib/entitlements";
import { plainRuleChange } from "@/lib/rule-copy";

import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { HeroIndex } from "@/lib/hero-indices";
import type { NewsArticle } from "@/lib/news";
import type { PowerTrade } from "@/lib/power-trades";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import type { RedditSnapshot } from "@/lib/reddit-cues-shared";
import type { RadarAttentionItem, RadarStockStateDoc, WatchlistRow } from "@/lib/watchlist-view";
import type {
  BriefingAttention,
  BriefingCallChange,
  BriefingCongressTrade,
  BriefingDiscussion,
  BriefingEarningsReport,
  BriefingIndex,
  BriefingNews,
  BriefingPosition,
  BriefingTriggeredAlert,
} from "@/lib/briefing";

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A positive price level, or null. A zero zone is missing data, not a level. */
function priceLevel(value: unknown): number | null {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

export type PositionExtras = {
  state?: RadarStockStateDoc | null;
  quote?: { price: number | null; day_change_pct: number | null; as_of: string | null } | null;
  label?: { ticker?: string; name?: string } | null;
  earnings_time?: BriefingPosition["earnings_time"];
  pre_earnings?: PreEarningsIntelDoc | null;
  /** The size the person entered for this holding, from their own user doc. */
  holding?: { quantity?: number | null; market_value?: number | null } | null;
};

export function positionFromRow(row: WatchlistRow, extras: PositionExtras = {}): BriefingPosition {
  const directive = row.directive_v2 ?? row.ai_directive ?? null;
  const zones = directive?.zones ?? {};
  const quote = extras.quote ?? null;
  const summary =
    text(directive?.action?.summary) ??
    text(directive?.rationale) ??
    text(row.ai_directive_rationale) ??
    text(directive?.action?.label) ??
    text(row.ai_directive_text);
  return {
    instrument_id: row.instrument_id,
    ticker: (text(extras.label?.ticker) ?? row.ticker).toUpperCase(),
    name: text(extras.label?.name) ?? text(row.instrument_name) ?? row.ticker,
    relation: row.position_type === "holding" ? "holding" : "watching",
    price: quote?.price ?? finite(row.price),
    day_change_pct: quote?.day_change_pct ?? finite(row.day_change_pct),
    price_as_of: quote?.as_of ?? null,
    stance: text(directive?.stance)?.toLowerCase() ?? null,
    call_summary: summary,
    // Without the steady call's mechanics ("We plan to keep this call until at least…"): lib/rule-copy.ts.
    watch_out: text(plainRuleChange(text(directive?.invalidation) ?? text(directive?.watch_out) ?? "")),
    add_below: priceLevel(zones.accumulate_below),
    breakout_above: priceLevel(zones.breakout_above),
    trim_above: priceLevel(zones.trim_above),
    earnings_date: text(extras.state?.earnings_date)?.slice(0, 10) ?? null,
    earnings_time: extras.earnings_time ?? null,
    pre_earnings_headline: text(extras.pre_earnings?.report?.headline),
    quantity: positive(extras.holding?.quantity) ?? positive(row.holding?.quantity),
    market_value:
      positive(extras.holding?.market_value) ??
      positive(row.holding?.market_value) ??
      positive(row.holding?.computed_market_value),
  };
}

/**
 * The same position for a stock the agent does not cover on this account:
 * price, move, the call word and earnings date stay (they are free on every
 * stock); the levels, what would change the call and the pre-earnings read
 * go, and any price level is cut out of the call's one line.
 */
export function uncoveredPosition(position: BriefingPosition): BriefingPosition {
  return {
    ...position,
    call_summary: redactLevels(position.call_summary),
    watch_out: null,
    add_below: null,
    breakout_above: null,
    trim_above: null,
    pre_earnings_headline: null,
    covered: false,
  };
}

function positive(value: unknown): number | null {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

export function earningsReportFromDoc(doc: EarningsIntelDoc): BriefingEarningsReport | null {
  const ticker = text(doc.ticker)?.toUpperCase();
  const eventDate = text(doc.event_date)?.slice(0, 10);
  if (!ticker || !eventDate) return null;
  return {
    ticker,
    instrument_id: doc.instrument_id,
    event_date: eventDate,
    generated_at: text(doc.generated_at) ?? "",
    headline: text(doc.report?.headline) ?? "",
    summary: text(doc.report?.summary) ?? "",
    for_holders: text(doc.report?.decision_guide?.for_holders),
    for_watchers: text(doc.report?.decision_guide?.for_watchers),
    monitor: text(doc.report?.decision_guide?.key_monitor_list?.[0]),
  };
}

export function congressTradeFromDoc(trade: PowerTrade): BriefingCongressTrade | null {
  const ticker = text(trade.ticker)?.toUpperCase();
  const disclosed = text(trade.disclosure_date)?.slice(0, 10);
  if (!ticker || !disclosed || !text(trade.person_name)) return null;
  return {
    trade_id: text(trade.trade_id) ?? `${ticker}-${disclosed}-${trade.person_id}`,
    person_name: trade.person_name,
    chamber: trade.chamber ?? "",
    party: trade.party ?? "",
    state: trade.state ?? "",
    ticker,
    company: trade.company ?? "",
    tx_type: trade.tx_type ?? "",
    amount_low: finite(trade.amount_low),
    amount_high: finite(trade.amount_high),
    transaction_date: text(trade.transaction_date)?.slice(0, 10) ?? "",
    disclosure_date: disclosed,
    lag_days: finite(trade.lag_days),
    source_url: trade.source_url ?? "",
  };
}

export function newsFromArticle(article: NewsArticle): BriefingNews {
  return {
    id: article.id,
    title: article.title,
    url: article.url,
    source_name: article.source_name,
    published_at: article.published_at,
    summary: article.summary,
    tickers: article.tickers,
  };
}

export function discussionFromSnapshot(
  snapshot: RedditSnapshot | null | undefined,
  hasBrief: (ticker: RedditSnapshot["tickers"][number]) => boolean,
): BriefingDiscussion | null {
  if (!snapshot || !text(snapshot.generated_at)) return null;
  return {
    generated_at: snapshot.generated_at,
    window_hours: finite(snapshot.window_hours) ?? 120,
    tickers: snapshot.tickers.filter(hasBrief).map((entry) => ({
      ticker: entry.ticker.toUpperCase(),
      company_name: text(entry.company_name),
      mention_count: finite(entry.mention_count) ?? 0,
      sentiment: entry.sentiment ?? "neutral",
      summary: entry.summary ?? "",
      latest_post_at: text(entry.latest_post_at),
    })),
  };
}

export function attentionFromRadar(item: RadarAttentionItem): BriefingAttention {
  return {
    item_id: item.item_id,
    instrument_id: item.instrument_id,
    ticker: (item.ticker ?? "").toUpperCase(),
    event_type: item.event_type ?? "",
    direction: item.direction ?? "neutral",
    headline: item.headline ?? "",
    what_changed: item.what_changed ?? "",
    why_it_matters: item.why_it_matters ?? "",
    next_trigger: text(item.next_trigger),
    occurred_at: item.occurred_at ?? "",
    citations: Array.isArray(item.citations) ? item.citations : [],
  };
}

const INDEX_NAMES: Record<string, string> = {
  SPX: "S&P 500",
  "^GSPC": "S&P 500",
  NDX: "Nasdaq 100",
  "^NDX": "Nasdaq 100",
  VIX: "VIX",
  "^VIX": "VIX",
};

export function indexFromHero(index: HeroIndex): BriefingIndex | null {
  const price = finite(index.price);
  const change = finite(index.changePct);
  if (price == null || price <= 0 || change == null) return null;
  const raw = text(index.name) ?? text(index.ticker) ?? "";
  if (!raw) return null;
  return { name: INDEX_NAMES[raw.toUpperCase()] ?? raw, price, change_pct: change };
}

const MARKET_ASSET_FOR_INDEX: Record<string, string> = { "S&P 500": "sp500", "Nasdaq 100": "nasdaq100" };

/**
 * One figure per index across the site: the markets feed's S&P 500 and Nasdaq 100 (what Market today and the
 * sector strip read) replace the home snapshot's when the feed has them, so the briefing never says −0.37%
 * beside Market today's −0.38%. An index the feed lacks keeps the snapshot's figure.
 */
export function withMarketIndexFigures(
  indices: BriefingIndex[],
  assets: ReadonlyArray<{ id: string; price: number; change: { d1: number | null }; as_of?: string | null }>,
  day: string | null = null,
): BriefingIndex[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return indices.map((index) => {
    const asset = byId.get(MARKET_ASSET_FOR_INDEX[index.name] ?? "");
    const price = finite(asset?.price);
    const change = finite(asset?.change.d1);
    // With a session day, only a figure from that same New York day replaces the snapshot's (a stale feed never wins).
    if (day && etDayOf(asset?.as_of ?? null) !== day) return index;
    return asset && price != null && price > 0 && change != null ? { ...index, price, change_pct: change, as_of: asset.as_of ?? null } : index;
  });
}

export function triggeredAlertFromDoc(
  id: string,
  doc: Record<string, unknown>,
): BriefingTriggeredAlert | null {
  if (doc.triggered !== true) return null;
  const ticker = text(doc.ticker)?.toUpperCase();
  const triggeredAt = text(doc.triggered_at);
  if (!ticker || !triggeredAt) return null;
  const condition = doc.condition === "above" ? "above" : doc.condition === "below" ? "below" : null;
  return {
    id,
    ticker,
    instrument_id: text(doc.instrument_id) ?? "",
    condition,
    target_price: priceLevel(doc.target_price),
    triggered_at: triggeredAt,
    directive_text: text(doc.directive_text),
  };
}

export function callChangeFromEvent(doc: Record<string, unknown>): BriefingCallChange | null {
  if (doc.type !== "directive_change") return null;
  const payload = (doc.payload ?? {}) as Record<string, unknown>;
  const ticker = text(payload.ticker)?.toUpperCase();
  const prev = text(payload.prev_stance);
  const next = text(payload.new_stance);
  const at = text(doc.created_at);
  if (!ticker || !prev || !next || !at) return null;
  return {
    ticker,
    instrument_id: text(payload.instrument_id) ?? "",
    prev_stance: prev,
    new_stance: next,
    at,
    text: text(payload.directive_text),
  };
}

/**
 * Calls that differ from the last briefing this person opened. The pipeline
 * only records call-change events for some accounts, so the briefing keeps its
 * own memory: yesterday's stance against today's.
 */
export function callChangesSince(
  positions: BriefingPosition[],
  previousCalls: Record<string, string> | null | undefined,
  previousDay: string | null,
  now: string,
  alreadyReported: BriefingCallChange[],
): BriefingCallChange[] {
  if (!previousCalls || !previousDay) return [];
  const reported = new Set(alreadyReported.map((change) => change.instrument_id));
  const out: BriefingCallChange[] = [];
  for (const position of positions) {
    const before = text(previousCalls[position.instrument_id])?.toLowerCase();
    const after = position.stance;
    if (!before || !after || before === after || reported.has(position.instrument_id)) continue;
    out.push({
      ticker: position.ticker,
      instrument_id: position.instrument_id,
      prev_stance: before,
      new_stance: after,
      at: now,
      text: position.call_summary,
    });
  }
  return out;
}

export function callsOf(positions: BriefingPosition[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const position of positions) if (position.stance) out[position.instrument_id] = position.stance;
  return out;
}
