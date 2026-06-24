import type { ReactNode } from "react";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { PriceChart } from "@/components/price-chart";
import { PositionStrip, RsiZoneLabels, RSI_TRACK_BG } from "@/components/range-bar";
import { TodaysMoveCard, SocialConversationCard } from "@/components/stock-social-proof-card";
import { FundamentalsBreakdown } from "@/components/fundamentals-breakdown";
import { AlertButton } from "@/components/alert-button";
import type {
  Directive,
  StockFacts,
  VisualCards,
  SentimentBreakdown,
  ComparativeContext,
  TimelineEvent,
  RelatedTicker,
} from "@/lib/stock";
import type { StockIntelPro } from "@/lib/types";

type RedditCtx = { sentiment?: string; summary?: string; mention_count?: number; catalysts?: string[] } | null;

// ---- shapes we read (kept structural to avoid coupling) -------------------
type Stock = {
  name: string;
  ticker: string;
  exchange?: string;
  sector?: string;
  price: number;
  day_change_pct?: number;
  day_change_abs?: number;
  logo_url?: string | null;
  instrument_id: string;
  index_memberships?: string[];
};
type Analyst = {
  label?: string;
  target_price?: number | null;
  buy?: number;
  hold?: number;
  sell?: number;
  analyst_count?: number;
} | null;
type Fundamentals = {
  market_cap?: number;
  pe_ttm?: number;
  dividend_yield?: number;
  week_52_high?: number;
  week_52_low?: number;
  beta?: number;
} | null;

type Props = {
  stock: Stock;
  market: "US" | "IN";
  currency: string;
  directive?: Directive | null;
  visual?: { what_changed?: string; why_it_matters?: string; what_to_watch?: string } | null;
  overview?: string;
  overviewHeadline?: string;
  facts?: StockFacts | null;
  intelPro?: StockIntelPro | null;
  analyst?: Analyst;
  fundamentals?: Fundamentals;
  rsi?: number | null;
  rsiState?: string;
  priceHistory?: { date: string; close: number }[];
  sma50?: number;
  sma200?: number;
  earnings?: {
    event_date?: string;
    report?: {
      headline?: string;
      summary?: string;
      facts?: { reported_vs_expected?: string; guidance_signal?: string; price_reaction?: string };
      decision_guide?: { for_holders?: string; for_watchers?: string };
    };
  } | null;
  cards?: VisualCards | null;
  sentiment?: SentimentBreakdown | null;
  comparative?: ComparativeContext | null;
  timeline?: TimelineEvent[] | null;
  peers?: RelatedTicker[] | null;
  betterPeers?: { instrument_id: string; ticker: string; score: number; verdict: string }[];
  sectorLabel?: string;
  reddit?: RedditCtx;
  subscribed: boolean;
  isTracked: boolean;
  tier: "ai_launch" | "ai_personal" | "free";
  updatedLabel?: string;
  lockedCall: ReactNode;
};

const STANCE_ACCENT: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  watch: "var(--accent-terminal)",
  avoid: "var(--signal-bearish)",
  hold: "var(--on-surface-variant)",
};
const PILLAR_EMOJI: Record<string, string> = { growth: "🌱", momentum: "🚀", valuation: "🏷️", quality: "🏛️" };

// ---- formatting -----------------------------------------------------------
const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sign = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
function cap(v?: number | null): string | null {
  if (!n(v)) return null;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString()}`;
}

/** Strip leading stance word from directive text ("Accumulate on dips…" → "on dips…"). */
function directiveDetail(stance: string, text: string): string | null {
  const s = stance.toLowerCase().trim();
  const t = text.trim();
  if (!t) return null;
  const tLower = t.toLowerCase();
  if (tLower === s) return null;
  const rest = t.replace(new RegExp(`^${s}\\b[,\\s:.-]*`, "i"), "").trim();
  if (!rest || rest.toLowerCase() === tLower) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Drop rationale clauses that repeat the action line or price trigger already on chart/alert. */
function rationaleLines(
  rationale: string,
  text: string,
  hasTriggerUi: boolean,
  triggerPrice: number | null,
): string[] {
  const textLower = text.toLowerCase();
  return rationale
    .split(/;\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((clause) => {
      const cLower = clause.toLowerCase();
      if (textLower.length > 12 && (cLower.includes(textLower) || textLower.includes(cLower))) return false;
      if (!hasTriggerUi || triggerPrice == null) return true;
      const hasPrice = [triggerPrice.toFixed(0), triggerPrice.toFixed(2)].some((p) => clause.includes(p));
      if (hasPrice && (cLower.includes("below") || cLower.includes("above") || cLower.includes("dip"))) return false;
      return true;
    });
}

// ---- premium primitives ---------------------------------------------------
const KICKER = "font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant";

function SectionLabel({ children, dot, className = "" }: { children: ReactNode; dot?: string; className?: string }) {
  return (
    <div className={`mb-3 flex items-center gap-2 ${className}`}>
      {dot && <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      <span className={KICKER}>{children}</span>
    </div>
  );
}

function MetaPill({ label, value }: { label?: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant"
      style={{ boxShadow: "inset 0 0 0 1px var(--outline-variant)" }}
    >
      {label && <span>{label}</span>}
      <span className="font-semibold text-on-surface">{value}</span>
    </span>
  );
}

function BarsGlyph({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={color} aria-hidden>
      <rect x="1" y="8.5" width="3" height="5.5" rx="1" />
      <rect x="6.5" y="4.5" width="3" height="9.5" rx="1" />
      <rect x="12" y="1.5" width="3" height="12.5" rx="1" />
    </svg>
  );
}

function convictionDots(confidence: string) {
  const level = confidence.toLowerCase();
  if (level === "high") return { filled: 3, color: "var(--signal-bullish)", label: "High" };
  if (level === "med" || level === "medium") return { filled: 2, color: "var(--accent-terminal)", label: "Med" };
  return { filled: 1, color: "var(--on-surface-variant)", label: "Low" };
}

function ConvictionDots({ confidence }: { confidence: string }) {
  const { filled, color, label } = convictionDots(confidence);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span className={KICKER}>conviction</span>
      <div
        className="flex items-center gap-1.5"
        role="img"
        aria-label={`Conviction ${label}`}
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: i <= filled ? color : "transparent",
              boxShadow: i <= filled ? undefined : "inset 0 0 0 1px var(--outline-variant)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RedditGlyph() {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "#FF4500" }} aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24">
        <line x1="13" y1="13" x2="17.8" y2="6.4" stroke="#fff" strokeWidth="1.4" />
        <circle cx="18.2" cy="5.6" r="1.9" fill="#fff" />
        <circle cx="12" cy="13.4" r="6.4" fill="#fff" />
        <circle cx="9.5" cy="13" r="1.1" fill="#FF4500" />
        <circle cx="14.5" cy="13" r="1.1" fill="#FF4500" />
        <path d="M9.1 16c1.6 1.2 4.2 1.2 5.8 0" stroke="#FF4500" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function StockDetail(props: Props) {
  const { stock, market, currency, directive, visual, overview, overviewHeadline, facts, intelPro, analyst, fundamentals, rsi, rsiState, priceHistory, sma50, sma200, earnings, cards, sentiment, comparative, timeline, peers, betterPeers, sectorLabel, reddit, subscribed, isTracked, tier, updatedLabel, lockedCall } = props;

  const money = (v: number) => `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dayPct = stock.day_change_pct ?? 0;
  const dayAbs = stock.day_change_abs ?? 0;
  const up = dayPct >= 0;
  const marketCapStr = cap(fundamentals?.market_cap);

  const target = analyst?.target_price;
  const upside = n(target) && stock.price > 0 ? (target! / stock.price - 1) * 100 : null;

  // ---- signals (free) -----------------------------------------------------
  const signals: { emoji: string; label: string; value: string; sub?: string; tone: "up" | "down" | "ink" }[] = [];
  if (n(upside)) signals.push({ emoji: "🎯", label: "Analyst target", value: sign(upside!), sub: [n(target) && money(target!), analyst?.analyst_count && `${analyst.analyst_count} analysts`].filter(Boolean).join(" · "), tone: upside! >= 0 ? "up" : "down" });
  if (n(facts?.returns?.one_year_pct)) {
    const r = facts!.returns!;
    signals.push({ emoji: "📈", label: "Past 1Y", value: sign(r.one_year_pct!), sub: [n(r.one_month_pct) && `1M ${sign(r.one_month_pct!)}`, n(r.three_month_pct) && `3M ${sign(r.three_month_pct!)}`].filter(Boolean).join(" · "), tone: r.one_year_pct! >= 0 ? "up" : "down" });
  }
  if (intelPro?.pillars?.growth) signals.push({ emoji: "🌱", label: "Growth score", value: `${intelPro.pillars.growth.score}`, sub: intelPro.pillars.growth.verdict, tone: "up" });
  if (n(facts?.financials?.revenue_growth_yoy_pct)) signals.push({ emoji: "💰", label: "Revenue YoY", value: sign(facts!.financials!.revenue_growth_yoy_pct!), sub: "year-over-year top line", tone: facts!.financials!.revenue_growth_yoy_pct! >= 0 ? "up" : "down" });
  if (n(facts?.quick_stats?.institutional_ownership_pct)) signals.push({ emoji: "🏛️", label: "Institutional", value: `${facts!.quick_stats!.institutional_ownership_pct!.toFixed(1)}%`, sub: "of total float", tone: "ink" });
  const topSignals = signals.slice(0, 5);

  // ---- key stats with a plain-English verdict per metric ------------------
  type Tone = "good" | "bad" | "warn" | "neutral";
  type Stat = { k: string; v: string; tone: Tone; note?: string };
  const stats: Stat[] = [];
  const stat = (k: string, v: string | null, tone: Tone = "neutral", note?: string) => { if (v) stats.push({ k, v, tone, note }); };

  const pe = fundamentals?.pe_ttm;
  const hasPe = n(pe) && pe! > 0; // 0 / negative => no or negative earnings, not a real P/E
  if (hasPe) stat("P/E (TTM)", pe!.toFixed(1), pe! > 120 ? "bad" : pe! > 50 ? "warn" : "neutral", pe! > 120 ? "very expensive" : pe! > 50 ? "rich valuation" : "reasonable");
  else if (n(pe) && pe! <= 0) stat("P/E (TTM)", "n/a", "warn", "no net earnings");
  const epsG = facts?.quick_stats?.eps_next_year_growth_pct;
  stat("EPS next Y", n(epsG) ? sign(epsG!) : null, n(epsG) ? (epsG! > 0 ? "good" : "bad") : "neutral", n(epsG) ? (epsG! > 15 ? "strong growth" : epsG! > 0 ? "growing" : "shrinking") : undefined);
  const reco = facts?.quick_stats?.recommendation_score;
  stat("Analyst reco", n(reco) ? reco!.toFixed(2) : null, !n(reco) ? "neutral" : reco! <= 2 ? "good" : reco! <= 3 ? "warn" : "bad", !n(reco) ? undefined : reco! <= 2 ? "buy-rated" : reco! <= 3 ? "hold-rated" : "sell-rated");
  stat("Implied upside", n(upside) ? sign(upside!) : null, n(upside) ? (upside! >= 0 ? "good" : "bad") : "neutral", n(upside) ? (upside! >= 0 ? "below avg target" : "above avg target") : undefined);
  const rev = facts?.financials?.revenue_growth_yoy_pct;
  stat("Revenue growth", n(rev) ? sign(rev!) : null, n(rev) ? (rev! > 0 ? "good" : "bad") : "neutral", n(rev) ? (rev! > 20 ? "fast-growing" : rev! > 0 ? "growing" : "declining") : undefined);
  stat("RSI (14)", n(rsi) ? rsi!.toFixed(0) : null, !n(rsi) ? "neutral" : rsi! >= 70 ? "warn" : rsi! <= 30 ? "good" : rsi! >= 60 ? "warn" : "neutral", !n(rsi) ? undefined : rsi! >= 70 ? "overbought" : rsi! <= 30 ? "oversold" : rsi! >= 60 ? "running hot" : "neutral");
  const beta = fundamentals?.beta;
  stat("Beta", n(beta) ? beta!.toFixed(2) : null, !n(beta) ? "neutral" : beta! > 1.5 ? "warn" : "neutral", !n(beta) ? undefined : beta! > 2 ? "very volatile" : beta! > 1.5 ? "high volatility" : beta! < 0.8 ? "steady" : "market-like");
  const dy = fundamentals?.dividend_yield;
  const dyPct = n(dy) ? dy! * (dy! < 1 ? 100 : 1) : null;
  stat("Div yield", n(dyPct) ? `${dyPct!.toFixed(1)}%` : null, "neutral", n(dyPct) ? (dyPct! <= 0 ? "no dividend" : "pays income") : undefined);
  stat("Market cap", cap(fundamentals?.market_cap), "neutral");
  stat("Revenue", cap(facts?.financials?.revenue), "neutral");
  const toneColor: Record<Tone, string> = { good: "var(--signal-bullish)", bad: "var(--signal-bearish)", warn: "var(--signal-neutral)", neutral: "var(--on-surface)" };

  // ---- analyst ratings ----------------------------------------------------
  const buy = analyst?.buy ?? 0, hold = analyst?.hold ?? 0, sell = analyst?.sell ?? 0;
  const ratingTotal = buy + hold + sell;
  const buyPct = ratingTotal ? Math.round((buy / ratingTotal) * 100) : 0;
  const showAnalyst = n(target) || ratingTotal > 0;

  // ---- scores -------------------------------------------------------------
  const pillars = intelPro?.pillars;
  const scoreColor = (v: number) => (v >= 85 ? "var(--signal-bullish)" : v >= 60 ? "var(--signal-neutral)" : "var(--signal-bearish)");

  // ---- the call (subscribed) ---------------------------------------------
  const stance = (directive?.stance ?? "watch").toLowerCase();
  const accent = STANCE_ACCENT[stance] ?? STANCE_ACCENT.watch;
  const showAlert = directive && (directive.trigger_type === "price_below" || directive.trigger_type === "price_above") && typeof directive.trigger_value === "string" && directive.trigger_value.trim() !== "" && !Number.isNaN(Number(directive.trigger_value));
  const triggerPrice = showAlert ? Number(directive!.trigger_value) : null;
  const chartZoneBelow = stance === "accumulate" && directive?.trigger_type === "price_below" && triggerPrice != null ? triggerPrice : undefined;
  const chartZoneAbove = stance === "trim" && directive?.trigger_type === "price_above" && triggerPrice != null ? triggerPrice : undefined;
  const chartZoneLabel = chartZoneBelow != null
    ? `accumulate below ${money(triggerPrice!)}`
    : chartZoneAbove != null
      ? `trim above ${money(triggerPrice!)}`
      : undefined;
  const hasTriggerUi = showAlert || chartZoneBelow != null || chartZoneAbove != null;
  const callDetail = directive?.text ? directiveDetail(stance, directive.text) : null;
  const callDetailIsTrigger =
    callDetail != null && hasTriggerUi && /^(on\s+)?dips?\s+(below|above)\b/i.test(callDetail);
  const callRationale = directive?.rationale
    ? rationaleLines(directive.rationale, directive.text ?? "", hasTriggerUi, triggerPrice)
    : [];

  const hasWhy = Boolean(overview || visual?.what_changed || visual?.why_it_matters || visual?.what_to_watch);

  const hist = (priceHistory ?? []).filter((p) => n(p.close));
  const w52 = n(fundamentals?.week_52_high) && n(fundamentals?.week_52_low) && fundamentals!.week_52_high! > fundamentals!.week_52_low!
    ? { low: fundamentals!.week_52_low!, high: fundamentals!.week_52_high! } : null;
  const hasChart = hist.length >= 5;
  const showHero = hasChart || w52 || n(rsi) || directive?.text || lockedCall;
  const last = hist.length ? hist[hist.length - 1].close : stock.price;
  const maRead = n(sma50) ? (last >= sma50! ? "above its 50-day average, uptrend intact" : "below its 50-day average, momentum cooling") : null;
  const rangePct = w52 ? Math.max(0, Math.min(100, ((stock.price - w52.low) / (w52.high - w52.low)) * 100)) : null;
  const rangeNote = rangePct == null ? null : rangePct > 85 ? "near 52-week high" : rangePct < 15 ? "near 52-week low" : "mid-range";
  const rsiLabel = !n(rsi) ? null : rsi! >= 70 ? "overbought" : rsi! <= 30 ? "oversold" : "healthy";
  const rsiTone = !n(rsi) ? "var(--on-surface-variant)" : rsi! >= 70 || rsi! <= 30 ? "var(--signal-neutral)" : "var(--signal-bullish)";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-5 sm:py-9">
      {/* HEADER — stacks on mobile, two columns on sm+ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={56} />
          <div className="min-w-0">
            <h1 className="font-headline text-[22px] font-bold leading-tight tracking-[-0.02em] text-on-surface sm:text-[26px]">{stock.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-on-surface-variant sm:text-[13px]">
              <span className="font-semibold text-on-surface">{stock.ticker}</span>
              {stock.exchange && (<><span aria-hidden>•</span><span>{stock.exchange}</span></>)}
              {stock.sector && (<><span aria-hidden>•</span><span>{stock.sector}</span></>)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <div className="sm:text-right">
            <p className="font-mono text-[26px] font-bold leading-none tabular-nums text-on-surface sm:text-[30px]">{money(stock.price)}</p>
            <p className="mt-1.5 font-mono text-[15px] font-semibold tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
              {up ? "▲" : "▼"} {sign(dayPct, 2)}{dayAbs ? `  ${dayAbs >= 0 ? "+" : "−"}${money(Math.abs(dayAbs))} today` : ""}
            </p>
          </div>
          <TrackButton ticker={stock.ticker} instrumentId={stock.instrument_id} tier={tier} isSubscribed={subscribed} isTracked={isTracked} variant="icon" />
        </div>
      </header>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {marketCapStr && <MetaPill label="Market Cap" value={marketCapStr} />}
        {(stock.index_memberships ?? []).slice(0, 3).map((m) => <MetaPill key={m} value={m} />)}
        {updatedLabel && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--signal-bullish)" }} />
            {updatedLabel}
          </span>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {/* HERO — the call + price chart + range / RSI */}
        {showHero && (
          <section className="panel p-6 md:p-7">
            {directive?.text ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
                      <BarsGlyph color={accent} />
                    </span>
                    <span className="font-headline text-[22px] font-bold leading-none tracking-tight md:text-[26px]" style={{ color: accent }}>{stance.toUpperCase()}</span>
                  </div>
                  <div className="flex flex-col items-end gap-2.5">
                    {showAlert && (
                      <AlertButton ticker={stock.ticker} instrumentId={stock.instrument_id} condition={directive!.trigger_type === "price_below" ? "below" : "above"} targetPrice={Number(directive!.trigger_value)} directiveText={directive!.text} />
                    )}
                    {directive.confidence && <ConvictionDots confidence={directive.confidence} />}
                  </div>
                </div>
                {callDetail && !callDetailIsTrigger && (
                  <p className="mt-4 max-w-[680px] text-[15px] leading-relaxed text-on-surface">{callDetail}</p>
                )}
                {callRationale.length > 0 && (
                  <p className="mt-2 max-w-[680px] text-[14px] leading-[1.6] text-on-surface-variant">{callRationale.join(" ")}</p>
                )}
              </div>
            ) : (
              <div>{lockedCall}</div>
            )}

            {hasChart && (
              <div className="mt-6">
                <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-on-surface-variant">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-4 rounded-full" style={{ background: accent }} /> Price</span>
                  {n(sma50) && <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--on-surface-variant)" }} /> 50-day MA <span className="font-mono font-semibold tabular-nums text-on-surface">{money(sma50!)}</span></span>}
                  {n(sma200) && <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dotted" style={{ borderColor: "var(--on-surface-variant)" }} /> 200-day MA <span className="font-mono font-semibold tabular-nums text-on-surface">{money(sma200!)}</span></span>}
                  {(chartZoneBelow != null || chartZoneAbove != null) && (
                    <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: `color-mix(in srgb, ${accent} 22%, transparent)` }} /> {chartZoneBelow != null ? "Accumulate Zone" : "Trim Zone"}</span>
                  )}
                </div>
                <PriceChart
                  data={hist}
                  sma50={sma50}
                  sma200={sma200}
                  currency={currency}
                  zoneBelow={chartZoneBelow}
                  zoneAbove={chartZoneAbove}
                  zoneColor={accent}
                  zoneLabel={chartZoneLabel?.toUpperCase()}
                  lineColor={accent}
                />
                {maRead && <p className="mt-2.5 text-[13px] text-on-surface-variant">Trading <b className="text-on-surface">{maRead}</b>.</p>}
              </div>
            )}

            {(w52 || n(rsi)) && (
              <div className="mt-7 grid gap-6 border-t pt-6 sm:grid-cols-2" style={{ borderColor: "var(--outline-variant)" }}>
                {w52 && (
                  <div>
                    <div className="mb-2.5 flex items-baseline justify-between">
                      <span className={KICKER}>52-week range</span>
                      {rangeNote && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: rangePct! > 85 ? "var(--signal-bullish)" : rangePct! < 15 ? "var(--signal-bearish)" : "var(--on-surface-variant)" }}>
                          {rangeNote}
                        </span>
                      )}
                    </div>
                    <PositionStrip
                      pct={rangePct!}
                      trackBackground="var(--surface-container-high)"
                      fillPct={rangePct!}
                      fillBackground="linear-gradient(90deg, color-mix(in srgb, var(--signal-bullish) 38%, var(--surface-container-high)), color-mix(in srgb, var(--signal-bullish) 12%, var(--surface-container-high)))"
                    />
                    <div className="mt-3 flex items-baseline justify-between gap-2 font-mono text-[12px] tabular-nums">
                      <span className="text-on-surface-variant">{money(w52.low)}</span>
                      <span><span className="text-on-surface-variant">NOW </span><span className="font-semibold text-on-surface">{money(stock.price)}</span></span>
                      <span className="text-on-surface-variant">{money(w52.high)}</span>
                    </div>
                  </div>
                )}
                {n(rsi) && (
                  <div>
                    <div className="mb-2.5 flex items-baseline justify-between">
                      <span className={KICKER}>RSI (14)</span>
                      <span className="text-[11px] font-semibold" style={{ color: rsiTone }}>
                        <span className="font-mono tabular-nums">{rsi!.toFixed(0)}</span>, {rsiLabel && rsiLabel.charAt(0).toUpperCase() + rsiLabel.slice(1)}
                      </span>
                    </div>
                    <PositionStrip pct={rsi!} trackBackground={RSI_TRACK_BG} />
                    <RsiZoneLabels />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* TODAY'S MOVE + REDDIT SOCIAL CONVERSATION — side by side */}
        {(hasWhy || reddit?.summary) && (
          <section className={hasWhy && reddit?.summary ? "grid items-stretch gap-5 lg:grid-cols-2" : undefined}>
            {hasWhy && (
              <TodaysMoveCard dayPct={dayPct} up={up} overview={overview} overviewHeadline={overviewHeadline} visual={visual} />
            )}
            {reddit?.summary && (
              <SocialConversationCard
                ticker={stock.ticker}
                reddit={{ summary: reddit.summary, sentiment: reddit.sentiment, mention_count: reddit.mention_count, catalysts: reddit.catalysts }}
              />
            )}
          </section>
        )}

        {/* WHY CARE — SIGNALS */}
        {topSignals.length > 0 && (
          <section>
            <SectionLabel dot="var(--signal-bullish)">why care today</SectionLabel>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {topSignals.map((s) => (
                <div key={s.label} className="inset p-3.5">
                  <div className="text-[15px]">{s.emoji}</div>
                  <p className="mt-1 text-[11px] text-on-surface-variant">{s.label}</p>
                  <p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums" style={{ color: s.tone === "up" ? "var(--signal-bullish)" : s.tone === "down" ? "var(--signal-bearish)" : "var(--on-surface)" }}>{s.value}</p>
                  {s.sub && <p className="mt-0.5 text-[11px] leading-tight text-on-surface-variant">{s.sub}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* KEY STATS + ANALYST */}
        <section className="grid gap-5 lg:grid-cols-2">
          {stats.length > 0 && (
            <div className="panel p-6">
              <SectionLabel>key stats · read</SectionLabel>
              <div className="text-[12px]">
                {stats.map((s) => (
                  <div key={s.k} className="flex items-baseline justify-between gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--outline-variant)" }}>
                    <span className="text-on-surface-variant">{s.k}</span>
                    <span className="flex items-baseline gap-2 text-right">
                      {s.note && <span className="text-[10px]" style={{ color: s.tone === "neutral" ? "var(--on-surface-variant)" : toneColor[s.tone] }}>{s.note}</span>}
                      <span className="font-mono font-bold tabular-nums" style={{ color: toneColor[s.tone] }}>{s.v}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(showAnalyst || (sentiment && ((sentiment.lanes?.length ?? 0) > 0 || n(sentiment.overall_score)))) && (
            <div className="panel flex flex-col gap-5 p-6">
              {showAnalyst && (
                <div>
                  <SectionLabel className="mb-2">analyst ratings</SectionLabel>
                  {ratingTotal > 0 && <p className="mb-3 text-[13px] text-on-surface-variant">Based on {ratingTotal} analysts — <b style={{ color: "var(--signal-bullish)" }}>{buyPct}% rate it Buy</b></p>}
                  {n(target) && (
                    <div className="mb-4 flex items-end gap-2">
                      <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: "var(--signal-bullish)" }}>{money(target!)}</span>
                      {n(upside) && <span className="mb-1 font-mono text-[12px]" style={{ color: upside! >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{sign(upside!)} upside</span>}
                    </div>
                  )}
                  {ratingTotal > 0 && (
                    <div className="space-y-2 font-mono text-[11px]">
                      {([["Buy", buy, "var(--signal-bullish)"], ["Hold", hold, "var(--on-surface-variant)"], ["Sell", sell, "var(--signal-bearish)"]] as const).map(([lab, val, col]) => (
                        <div key={lab} className="flex items-center gap-2">
                          <span className="w-14 text-on-surface-variant">{lab} {val}</span>
                          <div className="h-2 flex-1 rounded" style={{ background: "var(--surface-container-high)" }}>
                            <div className="h-2 rounded" style={{ width: `${ratingTotal ? (val / ratingTotal) * 100 : 0}%`, background: col }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {showAnalyst && sentiment && ((sentiment.lanes?.length ?? 0) > 0 || n(sentiment.overall_score)) && (
                <div className="border-t" style={{ borderColor: "var(--outline-variant)" }} />
              )}
              {sentiment && ((sentiment.lanes?.length ?? 0) > 0 || n(sentiment.overall_score)) && (
                <div>
                  <div className="mb-3 flex items-baseline gap-2">
                    <p className="font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">sentiment</p>
                    {n(sentiment.overall_score) && <span className="ml-auto font-mono text-2xl font-bold tabular-nums text-on-surface">{Math.round(sentiment.overall_score!)}</span>}
                    {sentiment.overall_label && <span className="font-mono text-[11px] uppercase text-on-surface-variant">{sentiment.overall_label}</span>}
                  </div>
                  {(sentiment.lanes?.length ?? 0) > 0 && (
                    <div className="space-y-2.5">
                      {sentiment.lanes!.map((l, i) => (
                        <div key={i}>
                          <div className="mb-1 flex justify-between font-mono text-[11px]"><span className="text-on-surface-variant">{l.label}</span><span className="tabular-nums text-on-surface">{Math.round(l.positive_pct)}%</span></div>
                          <div className="h-2 rounded" style={{ background: "var(--surface-container-high)" }}><div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, l.positive_pct))}%`, background: "var(--signal-bullish)" }} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* FUNDAMENTALS SCORES */}
        {pillars && (
          <section className="panel p-6">
            <SectionLabel className="mb-4">fundamentals · <span className="font-mono text-on-surface">{intelPro!.overall?.score ?? "–"}/100</span> vs sector peers</SectionLabel>
            <FundamentalsBreakdown pillars={pillars} />
          </section>
        )}

        {/* STRONGER IN THE SECTOR */}
        {(betterPeers?.length ?? 0) > 0 && (
          <section>
            <p className="mb-3 font-mono text-[12px] text-on-surface-variant">
              <span style={{ color: "var(--signal-bullish)" }}>$</span> stronger fundamentals{sectorLabel ? ` in ${sectorLabel}` : " in this sector"}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {betterPeers!.map((s) => (
                <a key={s.instrument_id} href={`/stock/${s.ticker}`} className="inset p-3.5 transition-opacity hover:opacity-80">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[13px] font-bold text-on-surface">{s.ticker}</span>
                    <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color: "var(--signal-bullish)" }}>{Math.round(s.score)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] capitalize text-on-surface-variant">{s.verdict}</p>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* CATALYSTS · DRIVERS · RISKS */}
        {cards && ((cards.catalyst_cards?.length ?? 0) > 0 || (cards.drivers?.length ?? 0) > 0 || (cards.risk_cards?.length ?? 0) > 0) && (
          <section className="panel p-6 md:p-7">
            <p className="mb-4 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">the read · catalysts, drivers, risks</p>
            <div className="grid gap-6 md:grid-cols-3">
              {(cards.catalyst_cards?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[11px]" style={{ color: "var(--signal-bullish)" }}>catalysts</p>
                  <div className="space-y-2">
                    {cards.catalyst_cards!.map((c, i) => (
                      <div key={i} className="inset p-3">
                        <p className="text-[13px] font-medium text-on-surface">{c.event}</p>
                        {c.detail && <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{c.detail}</p>}
                        {(c.window || c.priced_in) && <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">{[c.window, c.priced_in && `priced-in: ${c.priced_in}`].filter(Boolean).join(" · ")}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(cards.drivers?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[11px] text-on-surface-variant">drivers</p>
                  <div className="space-y-2">
                    {cards.drivers!.map((d, i) => (
                      <div key={i} className="inset p-3">
                        <p className="flex items-center gap-1.5 text-[13px] font-medium text-on-surface">
                          <span style={{ color: d.direction === "down" ? "var(--signal-bearish)" : d.direction === "up" ? "var(--signal-bullish)" : "var(--on-surface-variant)" }}>{d.direction === "down" ? "▼" : d.direction === "up" ? "▲" : "•"}</span>
                          {d.label}
                        </p>
                        {d.detail && <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{d.detail}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(cards.risk_cards?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[11px]" style={{ color: "var(--signal-bearish)" }}>risks</p>
                  <div className="space-y-2">
                    {cards.risk_cards!.map((r, i) => (
                      <div key={i} className="inset p-3">
                        <p className="text-[13px] font-medium text-on-surface">{r.risk || r.label}</p>
                        {r.detail && <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">{r.detail}</p>}
                        {r.trigger && <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">trigger: {r.trigger}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* COMPARATIVE CONTEXT */}
        {comparative && (n(comparative.vs_market_day_change_pct) || n(comparative.vs_sector_day_change_pct) || n(comparative.market_percentile)) && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {n(comparative.vs_market_day_change_pct) && (
              <div className="inset p-3.5"><p className="font-mono text-[11px] text-on-surface-variant">vs market today</p><p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums" style={{ color: comparative.vs_market_day_change_pct! >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{sign(comparative.vs_market_day_change_pct!)}</p></div>
            )}
            {n(comparative.vs_sector_day_change_pct) && (
              <div className="inset p-3.5"><p className="font-mono text-[11px] text-on-surface-variant">vs sector today</p><p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums" style={{ color: comparative.vs_sector_day_change_pct! >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{sign(comparative.vs_sector_day_change_pct!)}</p></div>
            )}
            {n(comparative.market_percentile) && (
              <div className="inset p-3.5"><p className="font-mono text-[11px] text-on-surface-variant">market percentile</p><p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums text-on-surface">{Math.round(comparative.market_percentile!)}th</p></div>
            )}
          </section>
        )}

        {/* FINANCIALS */}
        {facts?.financials && (cap(facts.financials.revenue) || n(facts.financials.eps_diluted)) && (
          <section className="panel p-6">
            <p className="mb-4 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">financials{facts.financials.fiscal_year ? ` · ${facts.financials.fiscal_year}` : ""}</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {([["Revenue", cap(facts.financials.revenue)], ["Operating inc.", cap(facts.financials.operating_income)], ["Net income", cap(facts.financials.net_income)], ["EPS (diluted)", n(facts.financials.eps_diluted) ? money(facts.financials.eps_diluted!) : null], ["Rev growth", n(facts.financials.revenue_growth_yoy_pct) ? sign(facts.financials.revenue_growth_yoy_pct!) : null], ["Gross profit", cap(facts.financials.gross_profit)]] as const)
                .filter(([, v]) => v)
                .map(([k, v]) => <div key={k} className="inset p-3.5"><p className="font-mono text-[11px] text-on-surface-variant">{k}</p><p className="mt-0.5 font-mono text-[15px] font-bold tabular-nums text-on-surface">{v}</p></div>)}
            </div>
          </section>
        )}

        {/* WHO OWNS IT — insight, not a table */}
        {(() => {
          const inst = facts?.institutions;
          const holders = inst?.top_holders;
          if (!holders || holders.length === 0) return null;
          const parsePct = (s?: string) => {
            if (!s) return null;
            const m = String(s).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
            return m ? Number(m[0]) : null;
          };
          const adders = holders.filter((h) => (parsePct(h.change_pct) ?? 0) > 0).length;
          const trimmers = holders.filter((h) => (parsePct(h.change_pct) ?? 0) < 0).length;
          const net = adders > trimmers ? "net buyers" : trimmers > adders ? "net sellers" : "holding steady";
          const netTone = adders > trimmers ? "var(--signal-bullish)" : trimmers > adders ? "var(--signal-bearish)" : "var(--on-surface-variant)";
          const own = inst?.ownership_pct ?? facts?.quick_stats?.institutional_ownership_pct;
          const ownStr = n(own) ? `${own!.toFixed(0)}%` : null;
          const largest = holders[0]?.name;
          return (
            <section className="panel p-6">
              <p className="mb-3 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">who owns it</p>
              <p className="text-[14px] leading-relaxed text-on-surface-variant">
                {ownStr && (<>Institutions hold <b className="text-on-surface">{ownStr}</b> of the float{n(own) && own! >= 65 ? " — heavily institutionally owned" : ""}. </>)}
                {largest && (<>Largest holder is <b className="text-on-surface">{largest}</b>. </>)}
                Of the top {holders.length} holders, <b style={{ color: "var(--signal-bullish)" }}>{adders} added</b> and <b style={{ color: "var(--signal-bearish)" }}>{trimmers} trimmed</b> last filing — big money is <b style={{ color: netTone }}>{net}</b>.
              </p>
              {inst?.total_holders && <p className="mt-2 font-mono text-[11px] text-on-surface-variant">{inst.total_holders} reporting holders</p>}
            </section>
          );
        })()}

        {/* RECENT EVENTS */}
        {(timeline?.length ?? 0) > 0 && (
          <section className="panel p-6">
            <p className="mb-4 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">recent events</p>
            <div className="space-y-1">
              {timeline!.slice(0, 6).map((e, i) => {
                const href = e.article_url?.trim();
                const hasLink = Boolean(href);
                const row = (
                  <>
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full" style={{ background: e.sentiment_label === "bearish" ? "var(--signal-bearish)" : e.sentiment_label === "bullish" ? "var(--signal-bullish)" : "var(--on-surface-variant)" }} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium leading-snug text-on-surface ${hasLink ? "group-hover:text-accent-terminal" : ""}`}>{e.title}</p>
                      {(e.source_name || e.event_type) && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">{[e.source_name, e.event_type].filter(Boolean).join(" · ")}</p>}
                    </div>
                    {hasLink && <span className="mt-0.5 shrink-0 font-mono text-[11px] text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>↗</span>}
                  </>
                );
                return hasLink ? (
                  <a
                    key={e.event_id ?? i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-container"
                  >
                    {row}
                  </a>
                ) : (
                  <div key={e.event_id ?? i} className="flex gap-3 px-2 py-2">
                    {row}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* PEERS */}
        {(peers?.length ?? 0) > 0 && (
          <section>
            <p className="mb-3 font-mono text-[12px] text-on-surface-variant"><span style={{ color: "var(--signal-bullish)" }}>$</span> peers</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {peers!.slice(0, 5).map((p) => (
                <a key={p.instrument_id} href={`/stock/${p.ticker}`} className="inset p-3.5 transition-opacity hover:opacity-80">
                  <p className="font-mono text-[13px] font-bold text-on-surface">{p.ticker}</p>
                  <p className="truncate text-[11px] text-on-surface-variant">{p.name}</p>
                  {n(p.day_change_pct) && <p className="mt-1 font-mono text-[12px] tabular-nums" style={{ color: p.day_change_pct! >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{sign(p.day_change_pct!, 2)}</p>}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* EARNINGS */}
        {earnings?.report && (earnings.report.headline || earnings.report.summary) && (
          <section className="panel p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                📊 earnings{earnings.event_date ? ` · ${earnings.event_date}` : ""}
              </p>
              <a href={`/earnings-intel/${stock.ticker}`} className="font-mono text-[11px] hover:underline" style={{ color: "var(--signal-bullish)" }}>full report →</a>
            </div>
            {earnings.report.headline && <p className="text-[15px] font-semibold text-on-surface">{earnings.report.headline}</p>}
            {earnings.report.summary && <p className="mt-1.5 text-[14px] leading-relaxed text-on-surface-variant">{earnings.report.summary}</p>}
            {earnings.report.facts && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {([["reported vs expected", earnings.report.facts.reported_vs_expected], ["guidance", earnings.report.facts.guidance_signal], ["price reaction", earnings.report.facts.price_reaction]] as const)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="inset p-3">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">{k}</p>
                      <p className="mt-1 text-[13px] leading-snug text-on-surface">{v}</p>
                    </div>
                  ))}
              </div>
            )}
            {earnings.report.decision_guide?.for_holders && (
              <p className="mt-4 text-[13px] leading-relaxed text-on-surface-variant"><span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: "var(--signal-bullish)" }}>if you hold it · </span>{earnings.report.decision_guide.for_holders}</p>
            )}
          </section>
        )}

        {/* RADAR CTA */}
        {!isTracked && (
          <section className="panel flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center" style={{ background: "var(--surface-container)" }}>
            <div>
              <p className="text-[15px] font-semibold text-on-surface">Track {stock.ticker} on your Radar</p>
              <p className="mt-0.5 text-[13px] text-on-surface-variant">Get the brew when it moves 4%+. Free for 3 stocks.</p>
            </div>
            <TrackButton ticker={stock.ticker} instrumentId={stock.instrument_id} tier={tier} isSubscribed={subscribed} isTracked={isTracked} />
          </section>
        )}
      </div>
    </div>
  );
}
