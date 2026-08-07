import type { ReactNode } from "react";

import { StockLogo } from "@/components/stock-logo";
import { VerdictCallChart } from "@/components/verdict-call-chart";
import { PriceChart, type PriceChartZone } from "@/components/price-chart";
import {
  CallMetricsStrip,
  ConvictionDotsInline,
} from "@/components/verdict-call-ui";
import { LockedVerdictCall } from "@/components/locked-verdict-call";
import { FundamentalsBreakdown } from "@/components/fundamentals-breakdown";
import { StockAnalystDepth, StockFinancialDepth, StockOperatingRecord } from "@/components/stock-financial-depth";
import { StockSmartAlertsRail } from "@/components/stock-smart-alerts-rail";
import { TrackButton } from "@/components/track-button";
import { StockShareCard } from "@/components/stock-share-card";
import { StockPageAnalytics } from "@/components/stock-page-analytics";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import Link from "next/link";
import type {
  Directive,
  StockFacts,
  VisualCards,
  SentimentBreakdown,
  TimelineEvent,
  RelatedTicker,
} from "@/lib/stock";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import {
  EPS_OUTCOME_LINES,
  STOCK_OUTCOME_LINES,
  daysUntilEventDate,
  normalizeEpsOutlook,
  normalizePostPrintMove,
} from "@/lib/pre-earnings-intel-shared";
import type { EarningsEvent } from "@/lib/earnings";
import type { EarningsIntelDoc, EarningsIntelScenario } from "@/lib/earnings-intel";
import { mergeIntelScenarios } from "@/lib/earnings-scenario-weights";
import {
  buildDirectiveChartZones,
  buildDirectiveSmartAlerts,
  directiveZonePrice,
  filterChartZones,
  prepareChartZonesForDisplay,
  resolvePriceAwareCall,
} from "@/lib/directive-ui";
import { hasRedditBuzzData, StockRedditBuzzRailCard } from "@/components/stock-social-proof-card";
import { StockNewsRailCard } from "@/components/stock-news-rail-card";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import type { NewsArticle } from "@/lib/news";
import type { LivePremarketQuote } from "@/lib/premarket-shared";
import type { StockIntelPro } from "@/lib/types";
import type { StockTechnicalLevels } from "@/lib/technicals";

type RedditCtx = { sentiment?: string; summary?: string; mention_count?: number; catalysts?: string[] } | null;

// ---- shapes we read (kept structural to avoid coupling) -------------------
type Stock = {
  name: string;
  ticker: string;
  exchange?: string;
  sector?: string;
  industry?: string;
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
  setupState?: string | null;
  visual?: { what_changed?: string; why_it_matters?: string; what_to_watch?: string } | null;
  overview?: string;
  overviewHeadline?: string;
  facts?: StockFacts | null;
  intelPro?: StockIntelPro | null;
  analyst?: Analyst;
  fundamentals?: Fundamentals;
  rsi?: number | null;
  rsiState?: string;
  technicalLevels?: StockTechnicalLevels | null;
  priceHistory?: { date: string; close: number }[];
  sma50?: number;
  sma200?: number;
  earnings?: EarningsIntelDoc | null;
  cards?: VisualCards | null;
  sentiment?: SentimentBreakdown | null;
  preEarnings?: PreEarningsIntelDoc | null;
  /** Pre-earnings doc without the 7-day window filter, used for upcoming rail date only. */
  preEarningsDoc?: PreEarningsIntelDoc | null;
  calendarEarnings?: EarningsEvent | null;
  overviewConfidence?: string;
  timeline?: TimelineEvent[] | null;
  peers?: RelatedTicker[] | null;
  betterPeers?: { instrument_id: string; ticker: string; score: number; verdict: string }[];
  sectorPeers?: {
    instrument_id: string;
    ticker: string;
    name: string;
    score: number | null;
    verdict: string;
    day_change_pct?: number;
    price?: number;
    market_cap?: number;
    pe_ttm?: number;
    revenue_growth_yoy_pct?: number;
  }[];
  sectorLabel?: string;
  reddit?: RedditCtx;
  recentNews?: NewsArticle[];
  subscribed: boolean;
  isTracked: boolean;
  tier: "ai_launch" | "ai_personal" | "free";
  premarketQuote?: LivePremarketQuote | null;
  updatedLabel?: string;
  researchPulse?: { text?: string; generatedAt?: string; status?: string | null } | null;
  lockedCall: ReactNode;
};

const STANCE_ACCENT: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  watch: "var(--accent-terminal)",
  avoid: "var(--signal-bearish)",
  hold: "var(--on-surface-variant)",
};

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
function capTier(v?: number | null): string | null {
  if (!n(v)) return null;
  if (v >= 200e9) return "Mega Cap";
  if (v >= 10e9) return "Large Cap";
  if (v >= 2e9) return "Mid Cap";
  if (v >= 300e6) return "Small Cap";
  return "Micro Cap";
}

// ---- stock page layout primitives -----------------------------------------
const RAIL_KICKER = "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant";
const TIER = "font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--signal-bullish)]";
const CHIP = "rounded-lg bg-surface-container-low";
const STOCK_SECTION = "border-t border-outline-variant bg-transparent";

function CrowdRing({ score }: { score: number; label?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 60 ? "var(--signal-bullish)" : score >= 40 ? "var(--accent-terminal)" : "var(--signal-bearish)";
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: 64, height: 64 }}>
      <svg width="64" height="64" className="-rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-container-high)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <span className="absolute text-[16px] font-extrabold tabular-nums text-on-surface">{score}</span>
    </div>
  );
}

function formatEventDate(iso: string): string {
  const d = new Date(`${iso.trim().split("T", 1)[0]}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatEarningsWhen(eventDate: string, time?: string): string {
  const d = formatEventDate(eventDate);
  if (time === "bmo") return `${d} BMO`;
  if (time === "amc") return `${d} AMC`;
  return d;
}

function scoreToneColor(score: number | null): string {
  if (score == null) return "var(--on-surface-variant)";
  if (score >= 80) return "var(--signal-bullish)";
  if (score >= 60) return "var(--signal-neutral)";
  return "var(--signal-bearish)";
}

const SCENARIO_META: Record<EarningsIntelScenario["case"], { label: string; color: string }> = {
  bull: { label: "Bull", color: "var(--signal-bullish)" },
  base: { label: "Base", color: "var(--on-surface-variant)" },
  bear: { label: "Bear", color: "var(--signal-bearish)" },
};

/** Condensed bull/base/bear odds for the earnings summary — no facts, holders/watchers, or CTA. */
function EarningsScenarioOdds({ doc, dayChangePct }: { doc: EarningsIntelDoc; dayChangePct?: number | null }) {
  const scenarios = mergeIntelScenarios(doc, dayChangePct);
  if (!scenarios.length) return null;
  const lead = [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0];
  const totalPct = scenarios.reduce((sum, s) => sum + Math.max(0, s.probability_pct), 0) || 1;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-on-surface-variant">Scenario odds · next 30–90 days</p>
        {lead ? (
          <span
            className="rounded-full px-2.5 py-0.5 text-[12px] font-medium capitalize"
            style={{ background: `color-mix(in srgb, ${SCENARIO_META[lead.case].color} 14%, var(--surface))`, color: SCENARIO_META[lead.case].color }}
          >
            {SCENARIO_META[lead.case].label} case leads · {Math.round(lead.probability_pct)}%
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
        {scenarios.map((s) => (
          <div
            key={s.case}
            className="h-full"
            style={{
              width: `${(Math.max(0, s.probability_pct) / totalPct) * 100}%`,
              background: lead?.case === s.case ? SCENARIO_META[s.case].color : "var(--outline-variant)",
            }}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {scenarios.map((s) => {
          const meta = SCENARIO_META[s.case];
          const isLead = lead?.case === s.case;
          return (
            <div
              key={s.case}
              className="rounded-xl p-4"
              style={{
                background: isLead ? `color-mix(in srgb, ${meta.color} 8%, var(--surface))` : "var(--surface)",
                border: `1px solid ${isLead ? `color-mix(in srgb, ${meta.color} 35%, var(--outline-variant))` : "var(--outline-variant)"}`,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium uppercase tracking-wide" style={{ color: isLead ? meta.color : "var(--on-surface-variant)" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: isLead ? meta.color : "var(--outline-variant)" }} />
                  {meta.label}
                </span>
                <span className="text-[16px] font-medium tabular-nums text-on-surface">{Math.round(s.probability_pct)}%</span>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-on-surface-variant">{s.thesis}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LongTailResearchCard({
  ticker,
  instrumentId,
  currentPrice,
  currency,
  isSubscribed,
  isTracked,
  hist,
  dayPct,
  dayAbs,
  up,
}: {
  ticker: string;
  instrumentId: string;
  currentPrice: number;
  currency: string;
  isSubscribed: boolean;
  isTracked: boolean;
  hist: Array<{ date: string; close: number }>;
  dayPct: number;
  dayAbs: number;
  up: boolean;
}) {
  const hasChart = hist.length >= 5;
  const moveColor = up ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const money = (v: number) =>
    `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="relative flex min-h-[18rem] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low/70">
        <div aria-hidden className="pointer-events-none select-none space-y-4 p-6 blur-[7px] sm:p-7">
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-medium tabular-nums text-on-surface">{money(currentPrice)}</span>
            <span className="text-[14px] font-medium tabular-nums" style={{ color: moveColor }}>
              {dayAbs >= 0 ? "+" : "−"}
              {money(Math.abs(dayAbs))} ({up ? "+" : ""}
              {dayPct.toFixed(2)}%)
            </span>
          </div>
          {hasChart ? (
            <PriceChart data={hist} currency={currency} zones={[]} lineColor={moveColor} embedded currentPrice={currentPrice} height={200} />
          ) : (
            <div className="h-[200px] rounded-xl bg-surface-container-high" />
          )}
        </div>
        <div className="relative z-10 flex w-full flex-1 items-center bg-surface/88 px-6 py-8 backdrop-blur-[3px] sm:px-8 lg:px-10">
          <div className="w-full">
            <p className="text-[20px] font-medium tracking-tight text-on-surface">Get the AI take on {ticker}</p>
            <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-on-surface-variant">
              Track it to unlock the price chart, verdict and what could change it.
            </p>
            <ul className="mt-4 grid gap-2 text-[13.5px] text-on-surface/85">
              {["Live price chart", "A clear accumulate, trim or avoid call"].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[var(--signal-bullish)]">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 inline-block">
              <TrackButton
                ticker={ticker}
                instrumentId={instrumentId}
                tier="free"
                isSubscribed={isSubscribed}
                isTracked={isTracked}
                untrackedLabel="Generate analysis"
                signedOutLabel="Sign in to generate"
                variant="pill"
                accent
              />
            </div>
            <p className="mt-2 text-[12px] text-on-surface-variant">Free to track. No card required.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockDetail(props: Props) {
  const { stock, market, currency, directive, setupState, visual, overview, overviewHeadline, overviewConfidence, facts, intelPro, analyst, fundamentals, rsi, rsiState, technicalLevels, priceHistory, sma50, sma200, earnings, preEarnings, preEarningsDoc, calendarEarnings, cards, sentiment, timeline, peers, betterPeers, sectorPeers, sectorLabel, reddit, recentNews, subscribed, isTracked, tier, premarketQuote, researchPulse, lockedCall } = props;

  const money = (v: number) => `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const levelMoney = (v: number) => `${currency}${Math.round(v).toLocaleString()}`;
  const dayPct = stock.day_change_pct ?? 0;
  const dayAbs = stock.day_change_abs ?? 0;
  const up = dayPct >= 0;

  const target = analyst?.target_price;
  const targetGapPct = n(target) && stock.price > 0 ? ((target! - stock.price) / stock.price) * 100 : null;
  const aboveTarget = n(target) && stock.price > target!;

  const pe = facts?.quick_stats?.pe_ttm ?? fundamentals?.pe_ttm;
  const marketCap = facts?.quick_stats?.market_cap ?? fundamentals?.market_cap;
  const hasPe = n(pe) && pe! > 0;
  const rev = facts?.financials?.revenue_growth_yoy_pct;

  // ---- analyst ratings ----------------------------------------------------
  const buy = analyst?.buy ?? 0, hold = analyst?.hold ?? 0, sell = analyst?.sell ?? 0;
  const ratingTotal = buy + hold + sell;
  const buyPct = ratingTotal ? Math.round((buy / ratingTotal) * 100) : 0;
  const showAnalyst = n(target) || ratingTotal > 0;

  // ---- scores -------------------------------------------------------------
  const pillars = intelPro?.pillars;
  const overallCoverage =
    typeof intelPro?.overall?.coverage === "number" && Number.isFinite(intelPro.overall.coverage)
      ? Math.max(0, Math.min(1, intelPro.overall.coverage))
      : null;
  const hasReliableOverall = overallCoverage == null || overallCoverage >= 0.5;

  // ---- the call (subscribed) ---------------------------------------------
  const stance = (directive?.stance ?? "watch").toLowerCase();
  const accent = STANCE_ACCENT[stance] ?? STANCE_ACCENT.watch;
  const priceAwareCall = directive ? resolvePriceAwareCall(directive, stock.price, money, levelMoney) : null;
  const directiveSmartAlerts = directive ? buildDirectiveSmartAlerts(directive, levelMoney) : [];

  const hasAnomalyMove = Boolean(overview || overviewHeadline);

  const moveNarrative = overview;

  const whyLikeIt = visual?.why_it_matters || cards?.drivers?.[0]?.detail || priceAwareCall?.rationale;
  const whatFlips = visual?.what_to_watch || cards?.risk_cards?.[0]?.detail || cards?.risk_cards?.[0]?.risk || null;

  const trimPrice = directive ? directiveZonePrice(directive.trim_on) : null;
  const isTrimLikeCall = stance === "trim" || stance === "avoid";
  const profitTarget =
    n(trimPrice) && directive?.trim_on?.trigger_type === "price_above"
      ? trimPrice
      : n(target)
        ? target
        : null;
  // Accumulate calls highlight the target price on the chart directly, instead of the trim/add/break bands.
  const targetZone: PriceChartZone | null =
    stance === "accumulate" && n(profitTarget)
      ? {
          price: profitTarget!,
          mode: "line",
          color: "var(--signal-bullish)",
          label: `Target ${levelMoney(profitTarget!)}`,
          dashed: true,
          strokeOpacity: 0.9,
        }
      : null;
  const directiveChartZones = targetZone
    ? [targetZone]
    : directive
      ? filterChartZones(buildDirectiveChartZones(directive, levelMoney), priceAwareCall?.chartZoneKeys ?? [])
      : [];
  const whyBullets = (cards?.drivers ?? [])
    .slice(0, 3)
    .map((d) => d.detail?.trim() || d.label)
    .filter((text): text is string => Boolean(text));
  if (whyBullets.length === 0 && whyLikeIt) whyBullets.push(whyLikeIt);

  const flipBullets = (cards?.risk_cards ?? [])
    .slice(0, 3)
    .map((r) => r.detail?.trim() || r.risk || r.label)
    .filter((text): text is string => Boolean(text));
  if (flipBullets.length === 0 && whatFlips) flipBullets.push(whatFlips);
  // Avoid/trim calls lead with why it's risky; everything else leads with why it's attractive.
  const headlineBullets = isTrimLikeCall ? flipBullets : whyBullets;

  const stanceLabel = stance.charAt(0).toUpperCase() + stance.slice(1);

  const hist = (priceHistory ?? []).filter((p) => n(p.close));
  const hasChart = hist.length >= 5;
  const showLongTailResearch = !subscribed && tier === "free";
  const showLockedVerdict = !subscribed && !showLongTailResearch;
  const showVerdict = Boolean(
    (subscribed && (directive?.text || lockedCall)) || showLockedVerdict || showLongTailResearch,
  );

  const hasOperatingRecord = Boolean(
    (facts?.financial_history?.length ?? 0) > 1 ||
      facts?.business_segments?.items?.length ||
      facts?.geographic_mix?.items?.length,
  );
  const hasFinancialDepth = Boolean(
    Object.values(facts?.balance ?? {}).some(n) ||
      Object.values(facts?.valuation ?? {}).some(n) ||
      Object.values(facts?.quality ?? {}).some(n),
  );
  const hasExtendedAnalyst = Boolean(
    facts?.analyst_trend?.recommendation_trend?.length || facts?.analyst_trend?.target?.average,
  );
  const showBasicAnalyst = showAnalyst && !hasExtendedAnalyst;

  const hasRedditBuzz = hasRedditBuzzData(reddit);

  const week52High = fundamentals?.week_52_high;
  const week52Low = fundamentals?.week_52_low;
  const has52WeekRange =
    n(week52High) && n(week52Low) && week52High! > week52Low!;
  const hasRsiSlider = n(rsi);
  const hasTechnicalLevels = Boolean(
    technicalLevels?.source &&
      technicalLevels?.as_of &&
      (n(technicalLevels.support) || n(technicalLevels.resistance)),
  );
  const verifiedTechnicalLevels = hasTechnicalLevels ? technicalLevels : null;
  const showWhereItSits = has52WeekRange || hasRsiSlider;
  const pricePositionItemCount = Number(has52WeekRange) + Number(hasRsiSlider);

  const crowdScore = n(sentiment?.overall_score)
    ? Math.round(sentiment!.overall_score!)
    : reddit?.sentiment === "bullish"
      ? 73
      : reddit?.sentiment === "bearish"
        ? 35
        : 50;
  const crowdLabel =
    sentiment?.overall_label ||
    (reddit?.sentiment ? reddit.sentiment.charAt(0).toUpperCase() + reddit.sentiment.slice(1) : "Mixed");
  const crowdColor =
    crowdScore >= 60 ? "var(--signal-bullish)" : crowdScore >= 40 ? "var(--accent-terminal)" : "var(--signal-bearish)";
  const hasCrowdSignal = Boolean(reddit || n(sentiment?.overall_score));
  const hasMarketReddit = Boolean(hasRedditBuzz && reddit);

  const analystBarPct =
    n(target) && target! > 0
      ? aboveTarget
        ? 100
        : Math.min(95, Math.max(8, (stock.price / target!) * 100))
      : 50;

  const epsOutlook = preEarnings ? normalizeEpsOutlook(preEarnings.report?.call?.eps_outlook) : null;
  const postMove = preEarnings ? normalizePostPrintMove(preEarnings.report?.call?.post_print_move) : null;
  const earningsDays = preEarnings ? daysUntilEventDate(preEarnings.event_date) : null;
  const preEarningsPrediction =
    epsOutlook && postMove
      ? `${EPS_OUTCOME_LINES[epsOutlook]} → ${STOCK_OUTCOME_LINES[postMove]}`
      : preEarnings?.report?.headline ?? null;

  type EarningsCandidate = { event_date: string; time?: string; priority: number };
  const earningsCandidates: EarningsCandidate[] = [];
  const addEarningsCandidate = (eventDate?: string, time?: string, priority = 9) => {
    if (!eventDate) return;
    const days = daysUntilEventDate(eventDate);
    if (days === null || days < 0) return;
    earningsCandidates.push({ event_date: eventDate, time, priority });
  };

  addEarningsCandidate(preEarnings?.event_date, undefined, 1);
  addEarningsCandidate(preEarningsDoc?.event_date, undefined, 2);
  addEarningsCandidate(calendarEarnings?.event_date, calendarEarnings?.time, 3);
  addEarningsCandidate(earnings?.event_date, undefined, 4);

  let earningsSmartAlertRail: { eventDate: string; dateLabel: string } | null = null;
  if (earningsCandidates.length) {
    earningsCandidates.sort((a, b) => {
      const da = daysUntilEventDate(a.event_date) ?? 999;
      const db = daysUntilEventDate(b.event_date) ?? 999;
      return da - db || a.priority - b.priority;
    });
    const best = earningsCandidates[0]!;
    earningsSmartAlertRail = {
      eventDate: best.event_date,
      dateLabel: formatEarningsWhen(best.event_date, best.time),
    };
  }

  const peerScoreMap = new Map((betterPeers ?? []).map((p) => [p.ticker, Math.round(p.score)]));
  const currentPeerRow = {
    ticker: stock.ticker,
    name: stock.name,
    marketCap: cap(marketCap) ?? "-",
    pe: hasPe ? pe!.toFixed(1) : "-",
    revGrowth: n(rev) ? sign(rev!) : "-",
    price: stock.price > 0 ? money(stock.price) : "-",
    score: hasReliableOverall && intelPro?.overall?.score != null ? Math.round(intelPro.overall.score) : null,
    isCurrent: true,
    href: `/stock/${stock.ticker}`,
  };
  const peerRows: {
    ticker: string;
    name: string;
    marketCap: string;
    pe: string;
    revGrowth: string;
    price: string;
    score: number | null;
    isCurrent: boolean;
    href: string;
  }[] = [currentPeerRow];

  if (sectorPeers && sectorPeers.length > 0) {
    for (const p of sectorPeers.slice(0, 4)) {
      peerRows.push({
        ticker: p.ticker.toUpperCase(),
        name: p.name,
        marketCap: cap(p.market_cap) ?? "-",
        pe: n(p.pe_ttm) ? p.pe_ttm!.toFixed(1) : "-",
        revGrowth: n(p.revenue_growth_yoy_pct) ? sign(p.revenue_growth_yoy_pct!) : "-",
        price: n(p.price) && p.price! > 0 ? money(p.price!) : "-",
        score: n(p.score) ? Math.round(p.score) : null,
        isCurrent: false,
        href: `/stock/${encodeURIComponent(p.ticker)}`,
      });
    }
  } else {
    for (const p of peers ?? []) {
      if (p.ticker === stock.ticker || peerRows.some((r) => r.ticker === p.ticker)) continue;
      peerRows.push({
        ticker: p.ticker,
        name: p.name,
        marketCap: "-",
        pe: "-",
        revGrowth: "-",
        price: "-",
        score: peerScoreMap.get(p.ticker) ?? null,
        isCurrent: false,
        href: `/stock/${p.ticker}`,
      });
    }
    for (const bp of betterPeers ?? []) {
      if (peerRows.some((r) => r.ticker === bp.ticker)) continue;
      peerRows.push({
        ticker: bp.ticker,
        name: bp.verdict,
        marketCap: "-",
        pe: "-",
        revGrowth: "-",
        price: "-",
        score: Math.round(bp.score),
        isCurrent: false,
        href: `/stock/${bp.ticker}`,
      });
    }
  }

  // Revenue growth is only useful when the peer set has at least one reported value.
  // Fall back to the current quote instead of rendering an empty column.
  const showPeerRevenueGrowth = peerRows.some((peer) => peer.revGrowth !== "-");

  const identifierLine = [
    capTier(marketCap),
    stock.sector,
    stock.industry ?? intelPro?.industry_label,
  ]
    .filter(Boolean)
    .join(" · ");

  const trackButtonProps = {
    ticker: stock.ticker,
    instrumentId: stock.instrument_id,
    tier,
    isSubscribed: subscribed,
    isTracked,
    variant: "compact" as const,
    trackedAsBadge: true,
  };
  const hasEarningsSection = Boolean(
    preEarnings ||
      (earnings?.report && (earnings.report.headline || earnings.report.summary)) ||
      earningsSmartAlertRail,
  );
  const hasDecisionSection = showVerdict;
  const hasEvidenceSection = Boolean(
    showWhereItSits ||
      pillars ||
      hasOperatingRecord ||
      hasFinancialDepth ||
      hasEarningsSection ||
      peerRows.length > 1 ||
      showAnalyst ||
      hasExtendedAnalyst ||
      hasCrowdSignal,
  );
  const hasSmartAlerts = Boolean(earningsSmartAlertRail);
  const hasActivitySection = Boolean(recentNews?.length);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 pb-4 pt-8 sm:px-6 sm:pb-7 sm:pt-14">
      <StockPageAnalytics
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
        hasAiBrief={Boolean(directive?.text)}
        hasCrowdSignal={hasCrowdSignal}
      />
      {/* HEADER */}
      <header className="border-b border-outline-variant pb-5 sm:pb-6">
        <div className="flex items-start justify-between gap-2.5 sm:hidden">
          <div className="flex min-w-0 items-start gap-2.5">
            <StockLogo
              ticker={stock.ticker}
              logoUrl={stock.logo_url}
              market={market}
              size={34}
              className="shrink-0 rounded-full"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-[19px] font-medium leading-tight tracking-tight text-on-surface">{stock.name}</h1>
                <TrackButton {...trackButtonProps} variant="icon" hideWhenUntracked />
              </div>
              <p className="mt-0.5 font-mono text-[12px] leading-none text-on-surface-variant">{identifierLine}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <TrackButton {...trackButtonProps} variant="compact" hideWhenTracked />
            <StockShareCard ticker={stock.ticker} market={market} />
          </div>
        </div>
        <div className="mt-3 sm:hidden">
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-medium leading-none tabular-nums text-on-surface">{money(stock.price)}</span>
            <span className="font-mono text-[14px] font-medium tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
              {dayAbs >= 0 ? "+" : "−"}
              {money(Math.abs(dayAbs))} ({sign(dayPct, 2)})
            </span>
          </div>
          {hasAnomalyMove ? (
            <a
              href="#stock-todays-move"
              className="mt-2 inline-flex w-fit shrink-0 items-center rounded-md border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-80"
              style={{
                color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
                borderColor: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 28%, var(--outline-variant))`,
                background: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 8%, var(--surface))`,
              }}
            >
              today&apos;s anomaly
            </a>
          ) : null}
          {premarketQuote ? (
            <div className="mt-2">
              <StockPremarketQuote currency={currency} market={market} quote={premarketQuote} />
            </div>
          ) : null}
        </div>

        <div className="hidden w-full items-start justify-between gap-4 sm:flex">
          <div className="flex min-w-0 items-start gap-3.5">
            <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={44} className="rounded-full" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[28px] font-medium leading-none tracking-tight text-on-surface">{stock.name}</h1>
                <TrackButton {...trackButtonProps} variant="icon" hideWhenUntracked />
              </div>
              <p className="mt-1.5 font-mono text-[13px] text-on-surface-variant">{identifierLine}</p>
              <div className="mt-2.5 flex items-baseline gap-2.5">
                <span className="text-[30px] font-medium tracking-tight tabular-nums text-on-surface">{money(stock.price)}</span>
                <span className="font-mono text-[15px] font-medium tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                  {dayAbs >= 0 ? "+" : "−"}
                  {money(Math.abs(dayAbs))} ({sign(dayPct, 2)})
                </span>
                {hasAnomalyMove && (
                  <a
                    href="#stock-todays-move"
                    className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-80"
                    style={{
                      color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
                      borderColor: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 28%, var(--outline-variant))`,
                      background: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 8%, var(--surface))`,
                    }}
                  >
                    today&apos;s anomaly
                  </a>
                )}
              </div>
              {premarketQuote ? (
                <div className="mt-1">
                  <StockPremarketQuote currency={currency} market={market} quote={premarketQuote} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <TrackButton {...trackButtonProps} variant="compact" hideWhenTracked />
            <StockShareCard ticker={stock.ticker} market={market} />
          </div>
        </div>
      </header>

      {/* TIER 1: VERDICT */}
      {showVerdict && (
        <section id="stock-decision" className="scroll-mt-24 border-b border-outline-variant py-6 sm:py-8">
          <h2 className="mb-5 font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Stock analysis</h2>
          {directive?.text ? (
            <div>
              <VerdictCallChart
                hist={hist}
                returns={facts?.returns}
                currency={currency}
                zones={directiveChartZones}
                lineColor={accent}
                currentPrice={stock.price}
                technicalLevels={verifiedTechnicalLevels}
                zoneHint={null}
                footerSlot={
                  directiveSmartAlerts.length > 0 ? (
                    <div className="mt-8">
                      <p className="text-[13px] font-medium text-on-surface">Set alerts</p>
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
                        <StockSmartAlertsRail
                          ticker={stock.ticker}
                          instrumentId={stock.instrument_id}
                          alerts={directiveSmartAlerts}
                          earningsAlert={null}
                          isSubscribed={subscribed}
                          neutralColor
                        />
                      </div>
                    </div>
                  ) : null
                }
                callSlot={
                  <>
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                      <h2 className="text-[1.65rem] font-medium leading-[1.05] tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-none" style={{ color: accent }}>
                        {stanceLabel}
                      </h2>
                      {directive.confidence && <ConvictionDotsInline confidence={directive.confidence} />}
                    </div>

                    {hasAnomalyMove ? (
                      <div id="stock-todays-move" className="mt-6 scroll-mt-24">
                        {overviewHeadline ? (
                          <p className="text-[17px] font-medium leading-snug text-on-surface">{overviewHeadline}</p>
                        ) : null}
                        {moveNarrative ? (
                          <p className={`text-[15px] leading-relaxed text-on-surface-variant ${overviewHeadline ? "mt-2.5" : ""}`}>
                            {moveNarrative}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      headlineBullets.length > 0 && (
                        <ul className="mt-6 space-y-3">
                          {headlineBullets.slice(0, 2).map((reason, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-on-surface">
                              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </>
                }
              />

              {hasSmartAlerts && (
                <div className="mt-7 border-t border-outline-variant/50 pt-5">
                  <CallMetricsStrip
                    metrics={[]}
                    mobileColumns={2}
                    actions={
                      hasSmartAlerts ? (
                        <StockSmartAlertsRail
                          ticker={stock.ticker}
                          instrumentId={stock.instrument_id}
                          alerts={[]}
                          earningsAlert={earningsSmartAlertRail}
                          isSubscribed={subscribed}
                        />
                      ) : null
                    }
                  />
                </div>
              )}

            </div>
          ) : showLongTailResearch ? (
            <LongTailResearchCard
              ticker={stock.ticker}
              instrumentId={stock.instrument_id}
              currentPrice={stock.price}
              currency={currency}
              isSubscribed={subscribed}
              isTracked={isTracked}
              hist={hist}
              dayPct={dayPct}
              dayAbs={dayAbs}
              up={up}
            />
          ) : showLockedVerdict ? (
            <div>
              <LockedVerdictCall
                ticker={stock.ticker}
                hist={hist}
                returns={facts?.returns}
                currency={currency}
                currentPrice={stock.price}
                technicalLevels={verifiedTechnicalLevels}
                overviewHeadline={overviewHeadline}
                fundamentalsScore={hasReliableOverall ? (intelPro?.overall?.score ?? null) : null}
                preEarningsDays={earningsDays}
                market={market}
              />
            </div>
          ) : (
            <div>{lockedCall}</div>
          )}

        </section>
      )}

      {/* EVIDENCE */}
      {hasEvidenceSection && (
        <section id="stock-evidence" className="scroll-mt-24">
        {(showWhereItSits || pillars) && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <h2 className="mb-5 text-[22px] font-semibold tracking-tight text-on-surface">
              Stock Fundamentals &amp; Key Indicators
            </h2>

            {showWhereItSits && (
              <div
                className={`grid gap-8 ${pricePositionItemCount === 2 ? "md:grid-cols-2 md:gap-12" : ""}`}
              >
                {has52WeekRange && (
                  <RangeBar
                    label="52-week range"
                    low={week52Low!}
                    high={week52High!}
                    current={stock.price}
                    format={money}
                  />
                )}
                {hasRsiSlider && <RsiStrength value={rsi!} state={rsiState} />}
              </div>
            )}

            {pillars && (
              <div className={showWhereItSits ? "mt-10" : ""}>
                <FundamentalsBreakdown
                  pillars={pillars}
                  isSubscribed={subscribed}
                  overallScore={hasReliableOverall ? (intelPro?.overall?.score ?? null) : null}
                  overallCoverage={overallCoverage}
                />
              </div>
            )}
          </section>
        )}

        {(showAnalyst || hasExtendedAnalyst || hasCrowdSignal) && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <h2 className="mb-5 text-[22px] font-semibold tracking-tight text-on-surface">
              Analyst Rating and Sentiment
            </h2>

            {hasExtendedAnalyst ? (
              <div className="mb-9">
                <StockAnalystDepth facts={facts ?? null} currentPrice={stock.price} currency={currency} />
              </div>
            ) : null}

            <div
              className={`grid gap-7 ${
                showBasicAnalyst && (hasMarketReddit || hasCrowdSignal)
                  ? "lg:grid-cols-2 lg:divide-x lg:divide-outline-variant/60"
                  : ""
              }`}
            >
              {showBasicAnalyst && (
                <div className="min-w-0 lg:pr-8">
                  <p className={`${RAIL_KICKER} mb-3`}>analyst consensus</p>
                  {ratingTotal > 0 && (
                    <p className="text-[13px] text-on-surface-variant">
                      {analyst?.analyst_count ?? ratingTotal} analysts ·{" "}
                      <b style={{ color: "var(--signal-bullish)" }}>{buyPct}% Buy</b>
                    </p>
                  )}
                  {n(target) && (
                    <>
                      <div className="mt-3 flex items-end gap-3">
                        <div>
                          <p className="font-mono text-[10px] text-on-surface-variant">now</p>
                          <p className="text-[18px] font-extrabold tabular-nums text-on-surface">{money(stock.price)}</p>
                        </div>
                        <div className="flex-1 pb-1">
                          <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${analystBarPct}%`,
                                background: aboveTarget
                                  ? "linear-gradient(90deg, color-mix(in srgb, var(--signal-bearish) 30%, transparent), var(--signal-bearish))"
                                  : "linear-gradient(90deg, color-mix(in srgb, var(--signal-bullish) 30%, transparent), var(--signal-bullish))",
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[10px] text-on-surface-variant">target</p>
                          <p
                            className="text-[18px] font-extrabold tabular-nums"
                            style={{ color: aboveTarget ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                          >
                            {levelMoney(target!)}
                          </p>
                        </div>
                      </div>
                      {n(targetGapPct) && (
                        <p
                          className="mt-2 text-right text-[13px] font-semibold"
                          style={{ color: aboveTarget ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                        >
                          {aboveTarget
                            ? `${Math.abs(targetGapPct).toFixed(1)}% above target`
                            : `${sign(targetGapPct)} upside`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {hasCrowdSignal && !hasMarketReddit && (
                <div className={`min-w-0 ${showBasicAnalyst ? "lg:pl-8" : ""}`}>
                  <p className="text-[16px] font-medium text-on-surface">Crowd signal</p>
                  <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-4">
                    <div
                      className="grid h-20 w-20 shrink-0 place-items-center rounded-full text-center"
                      style={{ background: crowdColor }}
                    >
                      <span className="text-[24px] font-bold tabular-nums text-white">{crowdScore}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="w-14 shrink-0 text-[12px] font-medium" style={{ color: "var(--signal-bullish)" }}>Bullish</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                          <div className="h-full rounded-full" style={{ width: `${crowdScore}%`, background: "var(--signal-bullish)" }} />
                        </div>
                        <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-on-surface-variant">
                          {crowdScore}%
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="w-14 shrink-0 text-[12px] font-medium" style={{ color: "var(--signal-bearish)" }}>Bearish</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                          <div className="h-full rounded-full" style={{ width: `${100 - crowdScore}%`, background: "var(--signal-bearish)" }} />
                        </div>
                        <span className="w-12 shrink-0 text-right text-[12px] font-medium tabular-nums text-on-surface-variant">
                          {100 - crowdScore}%
                        </span>
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
                        Crowd sentiment leans <span className="font-medium capitalize" style={{ color: crowdColor }}>{crowdLabel}</span>, with a score of {crowdScore}/100.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {hasMarketReddit && reddit ? (
                <div className={`min-w-0 ${showBasicAnalyst ? "lg:pl-8" : ""}`}>
                  <StockRedditBuzzRailCard
                    ticker={stock.ticker}
                    reddit={reddit}
                    isSubscribed={subscribed}
                    crowdScore={hasCrowdSignal ? crowdScore : null}
                    crowdLabel={hasCrowdSignal ? crowdLabel : null}
                    crowdColor={crowdColor}
                  />
                </div>
              ) : null}
            </div>
          </section>
        )}

        {hasOperatingRecord && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <h2 className="mb-5 text-[22px] font-semibold tracking-tight text-on-surface">
              Operating Record
            </h2>
            <StockOperatingRecord facts={facts ?? null} currency={currency} />
          </section>
        )}

        {hasFinancialDepth && (
          <StockFinancialDepth
            facts={facts ?? null}
            currentPrice={stock.price}
            currency={currency}
            intelPro={intelPro}
            ticker={stock.ticker}
          />
        )}

        {/* EARNINGS */}
        {preEarnings ? (
          <section id="stock-earnings" className={`${STOCK_SECTION} scroll-mt-24 py-7 sm:py-9`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <span className={TIER}>earnings · our setup</span>
              <span className={`${CHIP} px-2.5 py-1 font-mono text-[11px] text-on-surface-variant`}>
                {earningsDays != null && earningsDays > 0 ? `in ${earningsDays} days · ` : ""}
                {formatEventDate(preEarnings.event_date)}
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              {preEarningsPrediction && (
                <div className="border-l-2 py-1 pl-4" style={{ borderColor: "var(--signal-bullish)" }}>
                  <p className={RAIL_KICKER} style={{ color: "var(--signal-bullish)" }}>
                    our prediction
                  </p>
                  <p className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: "var(--signal-bullish)" }}>
                    {preEarningsPrediction}
                  </p>
                </div>
              )}
              <div>
                {preEarnings.report?.summary && (
                  <p className="text-[14px] leading-relaxed text-on-surface/85">
                    {preEarnings.report.summary}
                    {preEarnings.report.confidence?.score_0_100 != null && (
                      <>
                        {" "}
                        <span className="font-mono text-[11px] text-[var(--signal-neutral)]">
                          confidence:{" "}
                          {preEarnings.report.confidence.score_0_100 >= 70
                            ? "high"
                            : preEarnings.report.confidence.score_0_100 >= 40
                              ? "med"
                              : "low"}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {(preEarnings.report?.decision_guide?.key_monitor_list?.length ?? 0) > 0 && (
                  <div className="mt-4 border-t border-outline-variant pt-4">
                    <p className={`${RAIL_KICKER} mb-2`}>what to watch</p>
                    <div className="flex flex-wrap gap-1.5">
                      {preEarnings.report!.decision_guide!.key_monitor_list!.map((item) => (
                        <span key={item} className={`${CHIP} px-2.5 py-1 text-[12px] text-on-surface`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : earnings?.report && (earnings.report.headline || earnings.report.summary) ? (
          <section id="stock-earnings" className={`${STOCK_SECTION} scroll-mt-24 py-7 sm:py-9`}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">
                Earnings
                {earnings.event_date && (
                  <span className="ml-2 font-normal text-on-surface-variant">· {formatEventDate(earnings.event_date)}</span>
                )}
              </h2>
              <a
                href={`/earnings-intel/${stock.ticker}`}
                className="shrink-0 text-[13px] font-medium text-primary hover:underline"
              >
                Full report →
              </a>
            </div>
            {earnings.report.headline && (
              <p className="text-[20px] font-medium leading-snug tracking-tight text-on-surface">{earnings.report.headline}</p>
            )}
            <EarningsScenarioOdds doc={earnings} dayChangePct={dayPct} />
          </section>
        ) : earningsSmartAlertRail ? (
          <section id="stock-earnings" className={`${STOCK_SECTION} scroll-mt-24 py-7 sm:py-9`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className={TIER}>upcoming earnings</span>
                <p className="mt-2 text-[22px] font-extrabold tracking-tight text-on-surface">
                  {earningsSmartAlertRail.dateLabel}
                </p>
                <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
                  {n(calendarEarnings?.eps_estimate)
                    ? `Wall Street EPS estimate: ${calendarEarnings!.eps_estimate!.toFixed(2)}.`
                    : "The next scheduled report is on the calendar."}{" "}
                  Add {stock.ticker} to Watchlist for the next earnings report and important changes.
                </p>
              </div>
              <Link
                href="/earnings"
                className="font-mono text-[11px] font-semibold text-accent-terminal hover:underline"
              >
                earnings calendar →
              </Link>
            </div>
          </section>
        ) : null}

        {peerRows.length > 1 && (
          <section className={`${STOCK_SECTION} min-w-0 py-7 sm:py-9`}>
            <h2 className="mb-5 text-[22px] font-semibold tracking-tight text-on-surface">
              Peer Comparison
            </h2>
            <div className="min-w-0 overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full min-w-[560px] table-fixed text-[14px] lg:min-w-[660px]">
                <colgroup>
                  <col className="w-[24%] lg:w-[44%]" />
                  <col className="w-[22%] lg:w-[18%]" />
                  <col className="w-[16%] lg:w-[12%]" />
                  <col className="w-[24%] lg:w-[16%]" />
                  <col className="w-[14%] lg:w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low text-left text-[12px] font-medium text-on-surface-variant">
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 text-right font-medium">Mkt cap</th>
                    <th className="px-4 py-3 text-right font-medium">P/E</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {showPeerRevenueGrowth ? "Rev growth" : "Price"}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {peerRows.map((peer) => {
                    const comparisonValue = showPeerRevenueGrowth ? peer.revGrowth : peer.price;
                    const revUp = showPeerRevenueGrowth && comparisonValue.startsWith("+");
                    const revDown = showPeerRevenueGrowth && comparisonValue.startsWith("-");
                    return (
                      <tr
                        key={peer.ticker}
                        className={`border-b border-outline-variant last:border-0 ${peer.isCurrent ? "font-medium" : ""}`}
                        style={peer.isCurrent ? { background: "color-mix(in srgb, var(--signal-bullish) 6%, var(--surface))" } : undefined}
                      >
                        <td className="max-w-0 px-4 py-4">
                          <Link
                            href={peer.href}
                            className={`flex min-w-0 items-center gap-3 hover:text-accent-terminal ${peer.isCurrent ? "text-[var(--signal-bullish)]" : "text-on-surface"}`}
                          >
                            <StockLogo ticker={peer.ticker} market={market} size={26} className="flex-none shrink-0" />
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="block whitespace-nowrap font-mono text-[14px] font-medium">{peer.ticker}</span>
                              <span className="hidden truncate text-[12.5px] font-normal text-on-surface-variant lg:block" title={peer.name}>
                                {peer.name}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums">{peer.marketCap}</td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums text-on-surface-variant">{peer.pe}</td>
                        <td
                          className="px-4 py-4 text-right font-mono tabular-nums"
                          style={{ color: revUp ? "var(--signal-bullish)" : revDown ? "var(--signal-bearish)" : "var(--on-surface-variant)" }}
                        >
                          {comparisonValue}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {peer.score != null ? (
                            <span className="font-mono font-medium tabular-nums" style={{ color: scoreToneColor(peer.score) }}>
                              {peer.score}
                            </span>
                          ) : (
                            <span className="text-on-surface-variant">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        </section>
      )}

      {/* ACTIVITY */}
      {hasActivitySection && (
        <section id="stock-activity" className={`${STOCK_SECTION} scroll-mt-24 py-7 sm:py-9`}>
          <h2 className="mb-5 text-[22px] font-semibold tracking-tight text-on-surface">
            What is moving {stock.ticker}
          </h2>

          {(recentNews?.length ?? 0) > 0 && (
            <div className="mt-5">
              <StockNewsRailCard ticker={stock.ticker} articles={recentNews!} fullWidth />
            </div>
          )}

        </section>
      )}
    </div>
  );
}
