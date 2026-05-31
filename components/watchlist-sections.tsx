import Link from "next/link";
import type { WatchlistBrief, WatchlistRow, WatchlistPulse } from "@/lib/watchlist-view";
import type { Directive } from "@/lib/stock";
import { StockLogo } from "@/components/stock-logo";
import { StrategicDirective } from "@/components/strategic-directive";
import { RadarLedger } from "@/components/radar-ledger";
import { BookEventsPanel, TodayMarketEvents } from "@/components/radar-activity";
import type { RadarActivityEvent } from "@/lib/activity-events";
import { WatchlistTabs } from "@/components/watchlist-tabs";
import { TrackButton } from "@/components/track-button";
import { YourBookLayout } from "@/components/your-book-layout";
import { DiagnosisSectorChart, DiagnosisFactorRadar } from "@/components/diagnosis-charts";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { RadarEarningsReadyBanner } from "@/components/radar-earnings-ready-banner";
import { BuildingStateRefresher } from "@/components/building-state-refresher";
import { scrubLegacyBrand } from "@/lib/brand";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { PortfolioExposure, PortfolioScenario } from "@/lib/portfolio-scenarios";

// =============================================================================
// TYPES
// =============================================================================

export type Dict = Record<string, unknown>;

export type PillarAverages = {
  overall: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
};

export type FlatAlert = {
  ticker: string;
  kind: string;
  message: string;
  tone: "bull" | "bear" | "neutral";
};

export type ActivityEvent = {
  title: string;
  body: string;
  sentence: string;
  event_type: string;
  scope: string;
  direction: string;
  symbol: string;
  urgency: number;
  evidence: string[];
};

export type TapeItem = {
  ticker: string;
  body: string;
  tone: "bull" | "bear" | "neutral";
};

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

export function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

export function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Dict => !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function todayMasthead(): string {
  const d = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

export function scoreToneText(score: number | null): string {
  if (score === null) return "text-[#9ca3af]";
  if (score >= 80) return "text-[#10b981]";
  if (score >= 60) return "text-[#111111]";
  if (score >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

export function scoreToneFill(score: number | null): string {
  if (score === null) return "bg-[#e5e7eb]";
  if (score >= 80) return "bg-[#10b981]";
  if (score >= 60) return "bg-[#0052ff]";
  if (score >= 40) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

export function verdictLabel(score: number | null): string {
  if (score === null) return "Awaiting data";
  if (score >= 80) return "Strong tilt";
  if (score >= 60) return "Solid tilt";
  if (score >= 40) return "Mixed";
  return "Weak tilt";
}

export function severityTone(severity: string): {
  bg: string; fg: string; bar: string; chipBg: string; chipFg: string;
} {
  if (severity === "high")
    return { bg: "#fef2f2", fg: "#7f1d1d", bar: "#dc2626", chipBg: "#dc2626", chipFg: "#ffffff" };
  if (severity === "medium" || severity === "med")
    return { bg: "#fffbeb", fg: "#78350f", bar: "#d97706", chipBg: "#b45309", chipFg: "#ffffff" };
  if (severity === "low")
    return { bg: "#f0fdf4", fg: "#14532d", bar: "#16a34a", chipBg: "#15803d", chipFg: "#ffffff" };
  return { bg: "#f3f4f6", fg: "#374151", bar: "#9ca3af", chipBg: "#6b7280", chipFg: "#ffffff" };
}

// =============================================================================
// DATA HELPERS
// =============================================================================

export function computePillarAverages(rows: WatchlistRow[]): PillarAverages {
  const keys = ["overall", "valuation", "growth", "quality", "momentum"] as const;
  const out: PillarAverages = { overall: null, valuation: null, growth: null, quality: null, momentum: null };
  const holdingRows = rows.filter((r) => r.position_type === "holding");
  const positionAware =
    holdingRows.length > 0 &&
    holdingRows.every(
      (r) => typeof r.holding?.portfolio_weight_pct === "number" && (r.holding.portfolio_weight_pct as number) > 0,
    );
  for (const key of keys) {
    if (positionAware) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const r of holdingRows) {
        const score = r.scores?.[key];
        const w = r.holding!.portfolio_weight_pct as number;
        if (typeof score === "number" && Number.isFinite(score) && w > 0) {
          weightedSum += score * w;
          totalWeight += w;
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

export function rowDirective(row: WatchlistRow): Directive | null {
  const d = row.ai_directive;
  if (!d) return null;
  const textVal = (d.text || row.ai_directive_text || "").trim();
  if (!textVal) return null;
  return {
    text: textVal,
    stance: (d.stance ?? "watch") as Directive["stance"],
    trigger_type: (d.trigger_type ?? "none") as Directive["trigger_type"],
    trigger_value: d.trigger_value,
    rationale: (d.rationale || row.ai_directive_rationale || "").trim() || undefined,
    confidence: d.confidence as Directive["confidence"],
  };
}

const STANCE_WEIGHT: Record<string, number> = { accumulate: 3, trim: 3, avoid: 3, watch: 2, hold: 1 };
const CONFIDENCE_WEIGHT: Record<string, number> = { high: 3, med: 2, low: 1 };

export function directiveUrgency(row: WatchlistRow, directive: Directive): number {
  const stance = STANCE_WEIGHT[directive.stance ?? "hold"] ?? 1;
  const conf = CONFIDENCE_WEIGHT[directive.confidence ?? "low"] ?? 1;
  const move = Math.abs(row.day_change_pct ?? 0);
  const score = typeof row.scores?.overall === "number" ? Math.abs(row.scores.overall - 50) / 10 : 0;
  const positionBoost = row.position_type === "holding" ? 0.5 : 0;
  return stance * 10 + conf * 5 + Math.min(move, 10) + score + positionBoost;
}

export function radarSignalCount(row: WatchlistRow): number {
  let n = 0;
  const tech = row.technicals as Dict | undefined;
  const rsiBlock = (tech?.rsi_14 as Dict | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  if ((rsi !== null && (rsi >= 70 || rsi <= 30)) || rsiBlock.state) n++;
  for (const c of (row.catalysts ?? []).slice(0, 2)) {
    const cat = c as Dict;
    if (text(cat.title ?? cat.kind)) n++;
  }
  n += row.alerts.length;
  return n;
}

export function byAttention(a: WatchlistRow, b: WatchlistRow): number {
  const d = radarSignalCount(b) - radarSignalCount(a);
  if (d !== 0) return d;
  return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
}

export function flattenAlerts(rows: WatchlistRow[]): FlatAlert[] {
  const flat: FlatAlert[] = [];
  for (const row of rows) {
    for (const flag of row.alerts) {
      const kind = typeof flag?.kind === "string" ? flag.kind : typeof flag?.type === "string" ? flag.type : "info";
      const message = typeof flag?.message === "string" ? flag.message : typeof flag?.label === "string" ? flag.label : kind;
      const tone: FlatAlert["tone"] =
        kind.includes("bearish") || kind.includes("overbought") || kind.includes("52w_low") ? "bear"
        : kind.includes("bullish") || kind.includes("oversold") ? "bull" : "neutral";
      flat.push({ ticker: row.ticker, kind, message, tone });
    }
  }
  return flat;
}

export function buildTapeItems(rows: WatchlistRow[], flatAlerts: FlatAlert[]): TapeItem[] {
  const items: TapeItem[] = [];
  const sortedRows = [...rows].filter((r) => typeof r.day_change_pct === "number")
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0)).slice(0, 6);
  for (const r of sortedRows) {
    const pct = r.day_change_pct ?? 0;
    if (Math.abs(pct) < 1.5) continue;
    items.push({ ticker: r.ticker, body: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, tone: pct >= 0 ? "bull" : "bear" });
  }
  const seen = new Set(items.map((i) => i.ticker));
  for (const f of flatAlerts.slice(0, 8)) {
    if (seen.has(f.ticker)) continue;
    items.push({ ticker: f.ticker, body: f.message, tone: f.tone });
    seen.add(f.ticker);
  }
  return items.slice(0, 14);
}

export function buildActivityEvents(eventRadar: Dict[], brief: WatchlistBrief | null): ActivityEvent[] {
  const priorityKinds = new Set(["conviction_delta", "target_delta", "technical_extreme", "large_move", "portfolio_risk", "upcoming_event", "analyst_runway", "new_tracking"]);
  const rawFeed = eventRadar.length > 0
    ? eventRadar.filter((event) => {
        const kind = text(event.kind).toLowerCase();
        const urgency = num(event.urgency) ?? 0;
        if (priorityKinds.has(kind)) return true;
        if (kind === "news_velocity") return urgency >= 78;
        return false;
      }).sort((a, b) => (num(b.urgency) ?? 0) - (num(a.urgency) ?? 0)).slice(0, 12)
    : [];
  if (rawFeed.length > 0) {
    return rawFeed.map((event) => {
      const title = text(event.title);
      const body = text(event.body);
      const sentence = [title, body].filter(Boolean).join(" · ") || "Tracked-stock update.";
      const scopeGuess = text(event.scope) || (text(event.ticker) ? "stock" : "market");
      return {
        title: title || sentence,
        body,
        sentence,
        event_type: text(event.kind) || "event",
        direction: text(event.tone) || text(event.direction) || "neutral",
        symbol: text(event.ticker) || text(event.symbol),
        scope: scopeGuess,
        urgency: num(event.urgency) ?? 0,
        evidence: (Array.isArray(event.evidence) ? event.evidence : []).map((e) => text(e)).filter(Boolean).slice(0, 3),
      };
    });
  }
  return (brief?.essential_events ?? []).slice(0, 12).map((item) => ({
    title: item.sentence,
    body: "",
    sentence: item.sentence,
    event_type: item.event_type,
    direction: item.direction,
    symbol: item.symbol,
    scope: item.scope,
    urgency: 50,
    evidence: [],
  }));
}

export function buildChangesData(changes: Dict) {
  const hasPrevious = Boolean(changes.has_previous);
  const changedCount = num(changes.changed_count) ?? 0;
  const scoreChanges = asArray(changes.score_changes).map((item) => ({
    ticker: text(item.ticker), sentence: text(item.sentence), delta: num(item.delta),
  }));
  const newTickers = Array.isArray(changes.new_tickers)
    ? changes.new_tickers.map((item) => String(item)).filter(Boolean) : [];
  return { summary: text(changes.summary), hasPrevious, changedCount, scoreChanges, newTickers };
}

export function extractRunwayPct(item: Dict, headline: string): number | null {
  const direct = num(item.target_runway_pct ?? item.runway_pct ?? item.upside_pct);
  if (direct !== null) return direct;
  const match = headline.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (match) { const v = Number(match[1]); return Number.isFinite(v) ? v : null; }
  return null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const STANCE_META: Record<string, { label: string; bg: string; fg: string; chipBg: string; chipFg: string }> = {
  accumulate: { label: "Accumulate", bg: "#ecfdf5", fg: "#065f46", chipBg: "#10b981", chipFg: "#ffffff" },
  trim: { label: "Trim", bg: "#fef3c7", fg: "#92400e", chipBg: "#f59e0b", chipFg: "#ffffff" },
  watch: { label: "Watch", bg: "#eff6ff", fg: "#1e3a8a", chipBg: "#0052ff", chipFg: "#ffffff" },
  avoid: { label: "Avoid", bg: "#fef2f2", fg: "#991b1b", chipBg: "#ef4444", chipFg: "#ffffff" },
  hold: { label: "Hold", bg: "#f3f4f6", fg: "#374151", chipBg: "#374151", chipFg: "#ffffff" },
};

export const CLUSTER_COLORS = ["#0052ff", "#10b981", "#b45309", "#7c3aed", "#ef4444"];

export const tapeStyles = `
@keyframes radar-tape-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.radar-tape {
  animation: radar-tape-scroll 50s linear infinite;
  width: max-content;
}
.radar-tape:hover {
  animation-play-state: paused;
}
`;

export const FALLBACK_EXPLORE_SUGGESTIONS: Dict[] = [
  { ticker: "NVDA", sector: "Semiconductors", why: "AI infra leader · top stocksbrew score", score: 90, market: "US" },
  { ticker: "MSFT", sector: "Software", why: "Quality compounder · steady earnings", score: 82, market: "US" },
  { ticker: "META", sector: "Comm. Services", why: "Analyst runway +33% · momentum", score: 78, market: "US" },
  { ticker: "AAPL", sector: "Consumer Electronics", why: "Most-watched · durable free cash flow", score: 74, market: "US" },
];

// =============================================================================
// SECTION OPENER
// =============================================================================

export function SectionOpener({ number, title, meta, refreshing }: {
  number: string; title: string; meta?: string; refreshing?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#ececea] pt-8">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af] tabular-nums">
          § {number}
        </span>
        <h2 className="text-[22px] md:text-[24px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
          {title}
        </h2>
        {refreshing && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fcd34d] bg-[#fffbeb] px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase text-[#92400e] shadow-[0_0_0_3px_rgba(251,191,36,0.15)]">
            <span aria-hidden className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f59e0b]" />
            </span>
            Updating
          </span>
        )}
      </div>
      {meta && <span className="text-[12px] font-medium text-[#6b7280]">{meta}</span>}
    </div>
  );
}

// =============================================================================
// POSITION PILL
// =============================================================================

export function PositionPill({ type }: { type?: string }) {
  const isHolding = type === "holding";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${
      isHolding ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#f3f4f6] text-[#6b7280]"
    }`}>
      <span aria-hidden className={`h-1 w-1 rounded-full ${isHolding ? "bg-[#10b981]" : "bg-[#9ca3af]"}`} />
      {isHolding ? "Holding" : "Watching"}
    </span>
  );
}

// =============================================================================
// LIVE TAPE
// =============================================================================

export function LiveTape({ items }: { items: TapeItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-[#ececea] bg-[#fafaf7] py-2">
      <div className="radar-tape flex shrink-0 items-center gap-8 whitespace-nowrap">
        {doubled.map((item, i) => {
          const color = item.tone === "bull" ? "#047857" : item.tone === "bear" ? "#b91c1c" : "#6b7280";
          return (
            <Link key={`tape-${i}-${item.ticker}`} href={`/stock/${encodeURIComponent(item.ticker)}`}
              className="inline-flex items-center gap-2 text-[12px] font-medium tabular-nums hover:underline">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              <span className="font-semibold text-[#0a0a0a]">{item.ticker}</span>
              <span style={{ color }}>{item.body}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// HEADER STRIP
// =============================================================================

export function HeaderStrip({ rows, builtAt, pulse, tapeItems, isSubscribed, trackedCount, watchlistPositions }: {
  rows: WatchlistRow[]; builtAt?: string; pulse: WatchlistPulse | null;
  tapeItems: TapeItem[]; isSubscribed: boolean; trackedCount: number;
  watchlistPositions: Record<string, "holding" | "watchlist">;
}) {
  const atLimit = !isSubscribed && rows.length >= 3;
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#9ca3af]">
            stocksbrew · {todayMasthead()}
          </span>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] text-[#0a0a0a] leading-none">Radar</h1>
            {!isSubscribed && (
              <Link href="/subscribe"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 text-[11px] font-semibold text-[#92400e] hover:border-[#f59e0b] transition-colors">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                  <path d="M4.5 0L5.6 3.2H9L6.2 5.1L7.3 8.3L4.5 6.4L1.7 8.3L2.8 5.1L0 3.2H3.4L4.5 0Z" fill="#b45309" />
                </svg>
                Free · {trackedCount}/3 stocks
              </Link>
            )}
          </div>
          <p className="text-[12.5px] text-[#6b7280]">
            {rows.length} {rows.length === 1 ? "ticker" : "tickers"} on Radar · refreshed{" "}
            {builtAt ? formatRelative(builtAt) : "never"}
            {pulse?.subtitle ? ` · ${pulse.subtitle}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start mt-2">
          {atLimit ? (
            <Link href="/subscribe"
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#111111] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black transition-colors">
              Upgrade to track more →
            </Link>
          ) : (
            <RadarBatchEditModal
              isSubscribed={isSubscribed}
              initialItems={rows.map((r) => ({
                instrument_id: r.instrument_id, ticker: r.ticker,
                name: r.ticker,
                position_type: watchlistPositions[r.instrument_id] === "holding" ? "holding" : "watchlist",
                holding: r.holding ? {
                  quantity: r.holding.quantity ?? null, market_value: r.holding.market_value ?? null,
                  average_cost: r.holding.average_cost ?? null,
                } : undefined,
              }))}
              ctaLabel="Add a stock" enableImageUpload
            />
          )}
        </div>
      </div>
      {tapeItems.length > 0 && <LiveTape items={tapeItems} />}
    </header>
  );
}

// =============================================================================
// § 02 · TODAY
// =============================================================================

export function TodaySection({ brief, topDirective, secondaryDirectives, suggestions, marketEvents = [], refreshing, trackedIds = new Set() }: {
  brief: WatchlistBrief | null;
  topDirective: { row: WatchlistRow; directive: Directive } | null;
  secondaryDirectives: Array<{ row: WatchlistRow; directive: Directive }>;
  suggestions: Dict[];
  marketEvents?: RadarActivityEvent[];
  refreshing?: boolean;
  trackedIds?: Set<string>;
}) {
  if (
    !topDirective &&
    (!brief?.narrative || !brief.narrative.trim()) &&
    marketEvents.length === 0
  ) {
    return null;
  }
  const fillCount = Math.max(0, 4 - secondaryDirectives.length);
  const exploreSuggestions = (suggestions.length > 0 ? suggestions : FALLBACK_EXPLORE_SUGGESTIONS).slice(0, fillCount);
  return (
    <section className="flex flex-col gap-6">
      <SectionOpener number="02" title="Today" refreshing={refreshing} />
      <TodayMarketEvents events={marketEvents} />
      {brief?.narrative && (
        <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">{brief.narrative}</p>
      )}
      {brief?.blind_spot_title && (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-[#fde68a] bg-[#fffbeb] px-4 py-3">
          <span aria-hidden className="mt-0.5 text-[16px]">👁️</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#92400e]">Blind spot</span>
            <p className="text-[13px] text-[#78350f] leading-snug">{brief.blind_spot_title}</p>
          </div>
        </div>
      )}
      {topDirective && (
        <div className="flex flex-col gap-3">
          <PrimaryDirectiveHeader row={topDirective.row} />
          <StrategicDirective ticker={topDirective.row.ticker} directive={topDirective.directive} instrumentId={topDirective.row.instrument_id} />
        </div>
      )}
      {(secondaryDirectives.length > 0 || exploreSuggestions.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {secondaryDirectives.map(({ row, directive }) => (
            <SecondaryDirectiveCard key={row.instrument_id} row={row} directive={directive} />
          ))}
          {exploreSuggestions.map((s) => {
            const market = String(s.market ?? "US") === "IN" ? "IN" : "US";
            const instrumentId = `${market}_${String(s.ticker)}`;
            return <ExploreDirectiveCard key={String(s.ticker)} suggestion={s} isTracked={trackedIds.has(instrumentId)} />;
          })}
        </div>
      )}
    </section>
  );
}

function PrimaryDirectiveHeader({ row }: { row: WatchlistRow }) {
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const symbol = row.currency === "INR" ? "₹" : "$";
  const upside = row.target_upside_pct;
  const attention = row.attention_score;
  const attentionKind = row.attention_kind;
  const attentionColor =
    attentionKind === "move" ? "bg-[#fef3c7] text-[#92400e]"
    : attentionKind === "risk" ? "bg-[#fef2f2] text-[#991b1b]"
    : attentionKind === "opportunity" ? "bg-[#ecfdf5] text-[#065f46]"
    : attentionKind === "news" ? "bg-[#eff6ff] text-[#1e3a8a]"
    : "bg-[#f3f4f6] text-[#6b7280]";
  const priceStr = typeof row.price === "number"
    ? `${symbol}${row.price.toLocaleString(undefined, {
        minimumFractionDigits: row.price >= 1000 ? 0 : 2, maximumFractionDigits: row.price >= 1000 ? 0 : 2,
      })}` : "—";
  return (
    <div className="flex items-center gap-2 self-start">
      <Link href={`/stock/${encodeURIComponent(row.ticker)}`} className="group inline-flex items-center gap-3">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col gap-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-semibold tracking-[-0.01em] text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">{row.ticker}</span>
            {attention !== undefined && attention !== null && (
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${attentionColor}`}>
                <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />{attention}
              </span>
            )}
            <span className="text-[12px] text-[#9ca3af] truncate max-w-[260px]">{row.sector_label || ""}</span>
            {upside !== null && upside !== undefined ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase bg-[#ecfdf5] text-[#047857]">
                <span aria-hidden className="h-1 w-1 rounded-full bg-[#10b981]" />+{upside.toFixed(0)}% upside
              </span>
            ) : (
              <PositionPill type={row.position_type} />
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold tabular-nums text-[#0a0a0a]">{priceStr}</span>
            {typeof row.day_change_pct === "number" && (
              <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#047857]" : "text-[#b91c1c]"}`}>
                {positive ? "+" : ""}{dayChange.toFixed(2)}%
              </span>
            )}
            <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">Today&apos;s top directive</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function SecondaryDirectiveCard({ row, directive }: { row: WatchlistRow; directive: Directive }) {
  const meta = STANCE_META[directive.stance ?? "hold"] ?? STANCE_META.hold;
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const upside = row.target_upside_pct;
  const attention = row.attention_score;
  const attentionKind = row.attention_kind;
  const attentionColor =
    attentionKind === "move" ? "bg-[#fef3c7] text-[#92400e]"
    : attentionKind === "risk" ? "bg-[#fef2f2] text-[#991b1b]"
    : attentionKind === "opportunity" ? "bg-[#ecfdf5] text-[#065f46]"
    : attentionKind === "news" ? "bg-[#eff6ff] text-[#1e3a8a]"
    : "bg-[#f3f4f6] text-[#6b7280]";
  return (
    <Link href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
          style={{ background: meta.chipBg, color: meta.chipFg }}>{meta.label}</span>
        <div className="flex items-center gap-2">
          {attention !== undefined && attention !== null && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${attentionColor}`}>
              <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />{attention}
            </span>
          )}
          {typeof row.day_change_pct === "number" && (
            <span className={`text-[11px] font-semibold tabular-nums ${positive ? "text-[#047857]" : "text-[#b91c1c]"}`}>
              {positive ? "+" : ""}{dayChange.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={32} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">{row.ticker}</span>
            {upside !== null && upside !== undefined ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase bg-[#ecfdf5] text-[#047857]">
                <span aria-hidden className="h-1 w-1 rounded-full bg-[#10b981]" />+{upside.toFixed(0)}% upside
              </span>
            ) : (
              <PositionPill type={row.position_type} />
            )}
          </div>
          <div className="flex items-baseline gap-1.5">
            {typeof row.price === "number" && (
              <span className="text-[12px] font-semibold tabular-nums text-[#374151]">
                {row.currency === "INR" ? "₹" : "$"}{row.price.toLocaleString(undefined, {
                  minimumFractionDigits: row.price >= 1000 ? 0 : 2, maximumFractionDigits: row.price >= 1000 ? 0 : 2,
                })}
              </span>
            )}
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[120px]">{row.sector_label || "—"}</span>
          </div>
        </div>
      </div>
      <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug line-clamp-2 mt-auto">{directive.text}</p>
      {directive.rationale && (
        <p className="text-[11.5px] text-[#6b7280] leading-snug line-clamp-2">{directive.rationale}</p>
      )}
    </Link>
  );
}

function ExploreDirectiveCard({ suggestion, isTracked = false }: { suggestion: Dict; isTracked?: boolean }) {
  const ticker = String(suggestion.ticker ?? "");
  const market = String(suggestion.market ?? "US") === "IN" ? "IN" : "US";
  const instrumentId = `${market}_${ticker}`;
  const sector = String(suggestion.sector ?? suggestion.name ?? "");
  const why = String(suggestion.why ?? suggestion.reason ?? "");
  const score = typeof suggestion.score === "number" ? suggestion.score : null;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafaf7] p-4 transition-all hover:border-[#111111] hover:bg-white hover:shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase bg-[#f3f4f6] text-[#6b7280]">Explore</span>
        {score !== null && (
          <span className={`text-[11px] font-semibold tabular-nums ${score >= 80 ? "text-[#10b981]" : score >= 60 ? "text-[#374151]" : "text-[#9ca3af]"}`}>
            {Math.round(score)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <Link href={`/stock/${encodeURIComponent(ticker)}`} className="flex items-center gap-2.5 min-w-0 flex-1">
          <StockLogo ticker={ticker} market={market} size={32} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">{ticker}</span>
            {sector && <span className="text-[11px] text-[#9ca3af] truncate max-w-[130px]">{sector}</span>}
          </div>
        </Link>
        <TrackButton ticker={ticker} instrumentId={instrumentId} isTracked={isTracked} variant="icon" />
      </div>
      <Link href={`/stock/${encodeURIComponent(ticker)}`} className="flex flex-col gap-2 flex-1">
        {why && <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-2">{why}</p>}
        <span className="text-[11px] font-semibold text-[#9ca3af] group-hover:text-[#0052ff] transition-colors mt-auto">View analysis →</span>
      </Link>
    </div>
  );
}

// =============================================================================
// § 01 · YOUR BOOK
// =============================================================================

export function YourBookSection({ holdings, watching, earningsReadyThisWeek, bookEvents, suggestions, isSubscribed, trackedCount, refreshing, portfolio }: {
  holdings: WatchlistRow[]; watching: WatchlistRow[];
  earningsReadyThisWeek: EarningsIntelDoc[]; bookEvents: RadarActivityEvent[]; suggestions: Dict[];
  isSubscribed: boolean; trackedCount: number; refreshing?: boolean; portfolio?: Dict;
}) {
  const suggestionList = suggestions.slice(0, 6).map((item) => ({
    ticker: text(item.ticker), name: text(item.name), sector: text(item.sector),
    reason: text(item.reason), why: text(item.why), score: num(item.score ?? item.match_score),
    market: text(item.market) || "US",
  }));
  const visibleCount = holdings.length + watching.length;
  const atLimit = !isSubscribed && visibleCount >= 3;
  const showAddMoreNudge = !atLimit && visibleCount > 0 && (isSubscribed ? visibleCount < 5 : visibleCount < 3);
  const nudge = showAddMoreNudge
    ? visibleCount === 1
      ? { headline: "Add 1 more stock to unlock comparisons", body: "With 2+ stocks stocksbrew can compare scores, cluster your book, and surface which one deserves attention today." }
      : visibleCount === 2
      ? { headline: "One more stock and your Radar really kicks in", body: "Portfolio diagnosis, concentration risks, and daily directives all light up once you have 3 stocks tracked." }
      : { headline: "Pro tip: 5+ stocks makes everything smarter", body: "The more you track, the better stocksbrew clusters your book, spots risks, and prioritises what to act on today." }
    : null;
  return (
    <section className="flex flex-col gap-6">
      <SectionOpener number="01" title="Your book" meta={`${holdings.length} held · ${watching.length} watching`} refreshing={refreshing} />
      <PositionAwareState holdings={holdings} portfolio={portfolio} />
      <div className="min-w-0 w-full">
      <YourBookLayout
        holdings={holdings} watching={watching} suggestions={suggestionList}
        earningsReadySlot={earningsReadyThisWeek.length > 0 ? <RadarEarningsReadyBanner docs={earningsReadyThisWeek} /> : null}
        bookEventsSlot={<BookEventsPanel events={bookEvents} layout="full" />}
        belowLedgerSlot={atLimit ? (
          <div className="relative overflow-hidden rounded-2xl bg-[#1e1b4b] px-5 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(129,140,248,0.25)_0%,transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.15)_0%,transparent_55%)]" />
            <div className="relative flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-white/60">Free · {visibleCount}/3 stocks</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7]/15 border border-[#fcd34d]/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase text-[#fcd34d]">🚀 Launch pricing</span>
              </div>
              <p className="text-[15px] font-semibold text-white leading-snug">You&apos;ve hit the limit. Unlock your full Radar.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { icon: "trending_up", text: "Unlimited stocks" },
                  { icon: "notifications", text: "RSI & breakout alerts" },
                  { icon: "psychology", text: "AI verdict per stock" },
                  { icon: "analytics", text: "Portfolio diagnosis" },
                ].map(({ icon, text }) => (
                  <span key={text} className="inline-flex items-center gap-1 text-[11px] text-white/55">
                    <span className="material-symbols-outlined text-white/40" style={{ fontSize: 13, fontVariationSettings: "'wght' 500" }}>{icon}</span>
                    {text}
                  </span>
                ))}
              </div>
            </div>
            <Link href="/subscribe"
              className="relative shrink-0 inline-flex items-center justify-center h-[40px] rounded-full bg-white px-5 text-[13px] font-semibold text-[#1e1b4b] hover:-translate-y-[1px] active:translate-y-0 transition-transform whitespace-nowrap shadow-[0_4px_20px_rgba(129,140,248,0.3)]">
              Unlock Pro · $9/mo →
            </Link>
          </div>
        ) : undefined}
      />
      </div>
    </section>
  );
}

function PositionAwareState({ holdings, portfolio }: { holdings: WatchlistRow[]; portfolio?: Dict }) {
  if (!portfolio) return null;
  const totalHoldings = holdings.length;
  if (totalHoldings === 0) return null;
  const holdingsWithPosition = holdings.filter((r) => r.holding && (r.holding.quantity != null || r.holding.market_value != null));
  const enteredCount = holdingsWithPosition.length;
  const state: "none" | "partial" | "full" = enteredCount === 0 ? "none" : enteredCount < totalHoldings ? "partial" : "full";
  const positionAware = Boolean(portfolio.position_aware);
  const totalEntered = num(portfolio.total_entered_value);
  const concentration = asDict(portfolio.concentration);
  const positionRisks = asArray(portfolio.position_risks);
  const top1Pct = num(concentration.top1_pct);
  const riskLabel = text(concentration.risk_label);
  if (state === "none") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3">
        <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--outline)]" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] font-semibold text-[var(--on-surface)]">Add share counts to unlock position-weighted analysis</p>
          <p className="text-[11px] text-[var(--on-surface-variant)] leading-snug">Without size, Radar ranks by signal strength — not by how much each holding actually moves your portfolio.</p>
        </div>
      </div>
    );
  }
  if (state === "partial") {
    return (
      <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] font-semibold text-[#92400e]">{enteredCount} of {totalHoldings} holdings have shares entered</p>
          <p className="text-[11px] text-[#b45309] leading-snug">Fill in all holdings to enable dollar-weighted scores, sector allocation, and position-aware risk flags.</p>
        </div>
      </div>
    );
  }
  const riskColor = riskLabel === "high" ? "text-[#dc2626]" : riskLabel === "medium" ? "text-[#b45309]" : "text-[#047857]";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-[#10b981] shrink-0" />
          <span className="text-[11px] font-semibold tracking-[0.07em] uppercase text-[#047857]">Position-aware</span>
        </div>
        {totalEntered !== null && totalEntered > 0 && (
          <span className="text-[12px] font-semibold tabular-nums text-[var(--on-surface)]">${totalEntered.toLocaleString(undefined, { maximumFractionDigits: 0 })} tracked</span>
        )}
        {top1Pct !== null && (
          <span className="text-[12px] tabular-nums text-[var(--on-surface-variant)]">
            Largest position <span className="font-semibold text-[var(--on-surface)]">{top1Pct.toFixed(1)}%</span>
            {riskLabel && <span className={`ml-1 font-medium ${riskColor}`}>· {riskLabel} concentration</span>}
          </span>
        )}
      </div>
      {positionAware && (
        <p className="text-[11px] text-[#047857] leading-snug">Scores, sector allocation, and risk flags now reflect your actual dollar weights — not just stock count.</p>
      )}
      {positionRisks.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-[#bbf7d0]">
          {positionRisks.slice(0, 2).map((risk, i) => (
            <div key={`pos-risk-${i}`} className="flex items-start gap-2.5">
              <span aria-hidden className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${text(risk.severity) === "high" ? "bg-[#ef4444]" : text(risk.severity) === "medium" ? "bg-[#f59e0b]" : "bg-[#9ca3af]"}`} />
              <div className="min-w-0">
                <span className="text-[12px] font-semibold text-[var(--on-surface)]">{text(risk.headline)}</span>
                {text(risk.body) && <p className="text-[11px] text-[var(--on-surface-variant)] leading-snug">{text(risk.body)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// § 03 · DIAGNOSIS
// =============================================================================

export function DiagnosisSection({ portfolio, pillarAverages, factorTilt, suggestions, tracked, isSubscribed, refreshing }: {
  portfolio: Dict; pillarAverages: PillarAverages; factorTilt: Dict;
  suggestions: Dict[]; tracked: string[]; isSubscribed: boolean; refreshing?: boolean;
}) {
  const clusters = asArray(portfolio.clusters).slice(0, 5);
  const risks = asArray(portfolio.risk_flags).slice(0, 4);
  const opportunities = asArray(portfolio.opportunities).slice(0, 3);
  const summary = scrubLegacyBrand(text(portfolio.summary));
  const concentration = asDict(portfolio.concentration);
  const positionRisks = asArray(portfolio.position_risks).slice(0, 4);
  const overall = num(factorTilt.overall) ?? pillarAverages.overall;
  const valuation = num(factorTilt.valuation) ?? pillarAverages.valuation;
  const growth = num(factorTilt.growth) ?? pillarAverages.growth;
  const quality = num(factorTilt.quality) ?? pillarAverages.quality;
  const momentum = num(factorTilt.momentum) ?? pillarAverages.momentum;
  const fallbackSuggestions = asArray(portfolio.suggestions);
  const checkOuts = suggestions.length > 0 ? suggestions : fallbackSuggestions;
  return (
    <section className="flex flex-col gap-8">
      <SectionOpener number="03" title="Diagnosis" refreshing={refreshing} />
      {summary && <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">{summary}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(240px,_300px)_1fr] gap-6 md:gap-10 items-start">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#1e3a8a]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#0052ff]" />Your whole book
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af] mt-1">Portfolio score</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-[52px] md:text-[64px] font-semibold leading-none tabular-nums ${scoreToneText(overall)}`}>
              {overall === null ? "—" : Math.round(overall)}
            </span>
            <span className="text-[20px] font-medium text-[#9ca3af]">/ 100</span>
          </div>
          <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#6b7280]">{verdictLabel(overall)}</span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <PortfolioPillarCard name="Valuation" emoji="🏷️" iconBg="#fef3c7" score={valuation} />
          <PortfolioPillarCard name="Growth" emoji="🌱" iconBg="#ecfdf5" score={growth} />
          <PortfolioPillarCard name="Quality" emoji="🏛️" iconBg="#f3f4f6" score={quality} />
          <PortfolioPillarCard name="Momentum" emoji="🚀" iconBg="#eff6ff" score={momentum} />
        </div>
      </div>
      {clusters.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <DiagnosisSectorChart sectors={clusters.map((c) => ({
            sector: (c.sector as string) || "Unknown", weight_pct: (c.weight_pct as number) ?? 0, count: (c.count as number) ?? 0,
          }))} />
          <DiagnosisFactorRadar factors={{ valuation, growth, quality, momentum }} />
        </div>
      )}
      <RiskFlagsBlock risks={risks} />
      <OpportunitiesGrid items={opportunities} />
      <StocksToCheckOut suggestions={checkOuts} tracked={tracked} isSubscribed={isSubscribed} />
    </section>
  );
}

function PortfolioPillarCard({ name, emoji, iconBg, score }: { name: string; emoji: string; iconBg: string; score: number | null }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]" style={{ background: iconBg }}>{emoji}</span>
        <span className={`text-[24px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}>
          {score === null ? "—" : Math.round(score)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#111111]">{name}</span>
        <div className="relative h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
          <div className={`absolute inset-y-0 left-0 rounded-full ${scoreToneFill(score)}`}
            style={{ width: `${score === null ? 0 : Math.max(0, Math.min(100, score))}%` }} />
        </div>
        <span className="text-[11px] text-[#6b7280]">{verdictLabel(score)}</span>
      </div>
    </div>
  );
}

function RiskFlagsBlock({ risks }: { risks: Dict[] }) {
  const isClear = risks.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[14px] ${isClear ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fef2f2]"}`}>
          {isClear ? "✓" : "⚠️"}
        </span>
        <span className={`text-[11px] font-semibold tracking-[0.1em] uppercase ${isClear ? "text-[#047857]" : "text-[#b91c1c]"}`}>Risk flags</span>
        {!isClear && <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">{risks.length}</span>}
      </div>
      {isClear ? (
        <div className="rounded-2xl border border-[#d1fae5] bg-[#f0fdf4] px-4 py-4 flex items-start gap-3">
          <span aria-hidden className="text-[18px] leading-none mt-0.5">😌</span>
          <div className="flex flex-col gap-1">
            <p className="text-[14px] font-semibold text-[#065f46] tracking-[-0.01em]">All clear</p>
            <p className="text-[13px] text-[#047857] leading-relaxed">Nothing major flagged in your book right now. We&apos;ll surface concentration, stretched technicals, and weak spots here when they show up.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {risks.map((risk, i) => {
            const severity = text(risk.severity).toLowerCase();
            const tone = severityTone(severity);
            const headline = text(risk.headline);
            const body = text(risk.body);
            const ticker = text(risk.ticker);
            const kindLabel = text(risk.kind).replaceAll("_", " ");
            const title = ticker || kindLabel || "Risk";
            return (
              <div key={`risk-${i}`} className="flex h-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-[#0a0a0a] tracking-[-0.01em] min-w-0 truncate">
                    {ticker ? <Link href={`/stock/${encodeURIComponent(ticker)}`} className="hover:text-[#0052ff] transition-colors">{ticker}</Link> : title}
                    {ticker && kindLabel && <span className="ml-2 text-[11px] font-medium text-[#9ca3af] tracking-[0.04em] uppercase">{kindLabel}</span>}
                  </span>
                  {severity && (
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase shrink-0"
                      style={{ background: tone.chipBg, color: tone.chipFg }}>
                      <span aria-hidden className="h-1 w-1 rounded-full bg-white/80" />{severity}
                    </span>
                  )}
                </div>
                {headline && <p className="text-[14px] font-semibold text-[#111111] leading-snug">{headline}</p>}
                {body && <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-4 mt-auto">{body}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpportunitiesGrid({ items }: { items: Dict[] }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#ecfdf5] text-[14px]">✨</span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#047857]">Opportunities</span>
          <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">{items.length}</span>
        </div>
        {items.length > 0 && (
          <p className="text-[13px] text-[#6b7280] leading-relaxed max-w-[720px]">Watch list names with strong analyst runway. Consider adding at good entry points.</p>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-[#6b7280] italic">No watch list names with strong analyst runway right now.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {items.map((item, i) => {
            const ticker = text(item.ticker);
            const kind = text(item.kind).replaceAll("_", " ");
            const headline = text(item.headline);
            const body = text(item.body);
            const market = item.market === "IN" ? "IN" : "US";
            const runway = extractRunwayPct(item, headline);
            return (
              <Link key={`opp-${i}`} href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                className="group flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    {ticker && <StockLogo ticker={ticker} market={market} size={28} />}
                    <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">{ticker || "Opportunity"}</span>
                  </div>
                  {kind && <span className="inline-flex items-center rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase text-[#065f46] shrink-0">{kind}</span>}
                </div>
                {runway !== null ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[32px] md:text-[36px] font-semibold tabular-nums leading-none text-[#047857]">+{runway.toFixed(1)}%</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">runway</span>
                  </div>
                ) : headline ? <p className="text-[14px] font-semibold text-[#111111] leading-snug">{headline}</p> : null}
                {body && <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-3 mt-auto">{body}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StocksToCheckOut({ suggestions, tracked, isSubscribed }: {
  suggestions: Dict[]; tracked: string[]; isSubscribed: boolean;
}) {
  const list = suggestions.slice(0, 6);
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[14px]">🔍</span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#1e3a8a]">Stocks to check out</span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-[13px] text-[#6b7280] italic">No suggestions yet.</p>
      ) : (
        <ul className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
          {list.map((item, i) => {
            const ticker = text(item.ticker);
            const reason = text(item.reason);
            const why = text(item.why);
            const score = num(item.score ?? item.match_score);
            const market = item.market === "IN" ? "IN" : "US";
            const instrumentId = ticker ? `${market}_${ticker}` : "";
            const isTracked = instrumentId ? tracked.includes(instrumentId) : false;
            return (
              <li key={`sug-${i}`} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-[#f3f4f6]" : ""} hover:bg-[#fafafa] transition-colors`}>
                <Link href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"} className="flex items-center gap-3 flex-1 min-w-0 group">
                  {ticker && <StockLogo ticker={ticker} market={market} size={32} />}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">{ticker || "Suggestion"}</span>
                    {reason && <span className="text-[11.5px] text-[#4b5563] truncate">{reason}</span>}
                    {why && <span className="text-[11.5px] text-[#6b7280] truncate mt-0.5">{why}</span>}
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  {score !== null && (
                    <div className="flex flex-col items-center justify-center w-12 h-12 shrink-0 rounded-full border-2"
                      style={{ borderColor: score >= 80 ? "#10b981" : score >= 60 ? "#0052ff" : score >= 40 ? "#f59e0b" : "#ef4444" }}>
                      <span className={`text-[14px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}>{Math.round(score)}</span>
                      <span className="text-[8px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af] mt-0.5">Score</span>
                    </div>
                  )}
                  {ticker && instrumentId && (
                    <TrackButton ticker={ticker} instrumentId={instrumentId} isTracked={isTracked} isSubscribed={isSubscribed} variant="icon" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
