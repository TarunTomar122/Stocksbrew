import type { ReactNode } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { VerdictCallChart } from "@/components/verdict-call-chart";
import { PriceChart, type PriceChartZone } from "@/components/price-chart";
import { ConvictionDotsInline } from "@/components/verdict-call-ui";
import { LockedVerdictCall } from "@/components/locked-verdict-call";
import { FundamentalsBreakdown } from "@/components/fundamentals-breakdown";
import { SquircleSurface } from "@/components/oa/squircle";
import { StockAnalystDepth, StockFinancialDepth, StockOperatingRecord } from "@/components/stock-financial-depth";
import { StockSmartAlertsRail } from "@/components/stock-smart-alerts-rail";
import { TrackButton } from "@/components/track-button";
import { StockShareCard } from "@/components/stock-share-card";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import { StockPageAnalytics } from "@/components/stock-page-analytics";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import type {
  Directive,
  StockFacts,
  VisualCards,
  SentimentBreakdown,
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
import { StockPowerTradesCard } from "@/components/stock-power-trades-card";
import type { PowerTrade } from "@/lib/power-trades";
import { StockNewsRailCard } from "@/components/stock-news-rail-card";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import type { NewsArticle } from "@/lib/news";
import type { LivePremarketQuote } from "@/lib/premarket-shared";
import type { StockIntelPro } from "@/lib/types";
import type { StockTechnicalLevels } from "@/lib/technicals";
import type { StockBusinessQuestionsDoc } from "@/lib/stock";

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
  earnings?: EarningsIntelDoc | null;
  cards?: VisualCards | null;
  sentiment?: SentimentBreakdown | null;
  preEarnings?: PreEarningsIntelDoc | null;
  /** Pre-earnings doc without the 7-day window filter, used for upcoming rail date only. */
  preEarningsDoc?: PreEarningsIntelDoc | null;
  calendarEarnings?: EarningsEvent | null;
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
  reddit?: RedditCtx;
  powerTrades?: PowerTrade[] | null;
  recentNews?: NewsArticle[];
  subscribed: boolean;
  isTracked: boolean;
  tier: "ai_launch" | "ai_personal" | "free";
  premarketQuote?: LivePremarketQuote | null;
  updatedLabel?: string;
  businessQuestions?: StockBusinessQuestionsDoc | null;
  lockedCall: ReactNode;
};

const STANCE_ACCENT: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  watch: "var(--oa-primary)",
  avoid: "var(--signal-bearish)",
  hold: "var(--oa-muted-fg)",
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
const FRAME = "mx-auto w-full min-w-0 max-w-[76rem] px-4 sm:px-6";
const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H2 =
  "text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight";
const SUB = "mt-2 text-lg leading-7 text-oa-muted-fg";
const PILL_RING =
  "focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] outline-none";
const SECONDARY_PILL = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg transition-all hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))] active:translate-y-px active:scale-[0.98] ${PILL_RING}`;

/** The pulse plate: outer squircle frame + inner stage. Every major block on
 *  the page sits in one of these so the page reads as physical objects. */
function Plate({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <SquircleSurface className={`border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${className}`}>
      <SquircleSurface className="overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
        {children}
      </SquircleSurface>
    </SquircleSurface>
  );
}

/** H2 + one-line outcome subtitle, optionally with a right-aligned action. */
function SectionHead({ title, sub, right }: { title: ReactNode; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        <h2 className={H2}>{title}</h2>
        {sub ? <p className={SUB}>{sub}</p> : null}
      </div>
      {right}
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
  if (score == null) return "var(--oa-muted-fg)";
  if (score >= 80) return "var(--signal-bullish)";
  if (score >= 60) return "var(--signal-neutral)";
  return "var(--signal-bearish)";
}

const SCENARIO_META: Record<EarningsIntelScenario["case"], { label: string; color: string }> = {
  bull: { label: "Bull", color: "var(--signal-bullish)" },
  base: { label: "Base", color: "var(--oa-muted-fg)" },
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
        <p className="text-sm font-medium text-oa-fg/80">Scenario odds · next 30–90 days</p>
        {lead ? (
          <span
            className="rounded-full border border-oa-border bg-oa-card px-2.5 py-0.5 text-[13px] font-medium capitalize leading-5"
            style={{ color: SCENARIO_META[lead.case].color }}
          >
            {SCENARIO_META[lead.case].label} case leads · {Math.round(lead.probability_pct)}%
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-oa-secondary">
        {scenarios.map((s) => (
          <div
            key={s.case}
            className="h-full"
            style={{
              width: `${(Math.max(0, s.probability_pct) / totalPct) * 100}%`,
              background: lead?.case === s.case ? SCENARIO_META[s.case].color : "var(--oa-border)",
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
              className="rounded-2xl border p-4"
              style={{
                borderColor: isLead
                  ? `color-mix(in srgb, ${meta.color} 35%, var(--oa-border))`
                  : "var(--oa-border)",
                background: isLead
                  ? `color-mix(in srgb, ${meta.color} 6%, var(--oa-card))`
                  : "var(--oa-card)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide"
                  style={{ color: isLead ? meta.color : "var(--oa-muted-fg)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: isLead ? meta.color : "var(--oa-border)" }}
                  />
                  {meta.label}
                </span>
                <span className="text-base font-medium tabular-nums text-oa-fg">{Math.round(s.probability_pct)}%</span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-oa-muted-fg">{s.thesis}</p>
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
    <Plate>
      <div className="relative min-h-[20rem]">
        <div aria-hidden className="pointer-events-none select-none space-y-4 p-6 opacity-70 blur-[6px] sm:p-8">
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-medium tabular-nums text-oa-fg">{money(currentPrice)}</span>
            <span className="text-sm font-medium tabular-nums" style={{ color: moveColor }}>
              {dayAbs >= 0 ? "+" : "−"}
              {money(Math.abs(dayAbs))} ({up ? "+" : ""}
              {dayPct.toFixed(2)}%)
            </span>
          </div>
          {hasChart ? (
            <PriceChart data={hist} currency={currency} zones={[]} lineColor={moveColor} embedded currentPrice={currentPrice} height={220} />
          ) : (
            <div className="h-[220px] rounded-2xl bg-oa-secondary" />
          )}
        </div>
        <div className="absolute inset-0 z-10 flex w-full items-center bg-[color-mix(in_srgb,var(--oa-bg)_72%,transparent)] px-6 py-8 backdrop-blur-[3px] sm:px-10">
          <div className="w-full max-w-xl">
            <p className={EYEBROW} style={{ color: "var(--oa-primary)" }}>Free research brief</p>
            <h2 className={H2}>Get the full brief on {ticker}</h2>
            <div className="mt-6 inline-block">
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
            <p className="mt-3 text-xs text-oa-muted-fg">Free to track. No card required.</p>
          </div>
        </div>
      </div>
    </Plate>
  );
}

export function StockDetail(props: Props) {
  const { stock, market, currency, directive, visual, overview, overviewHeadline, facts, intelPro, analyst, fundamentals, rsi, rsiState, technicalLevels, priceHistory, earnings, preEarnings, preEarningsDoc, calendarEarnings, cards, sentiment, peers, betterPeers, sectorPeers, reddit, powerTrades, recentNews, subscribed, isTracked, tier, premarketQuote, updatedLabel, businessQuestions, lockedCall } = props;

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

  const hasAnomalyMove = Boolean(overview?.trim());
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
  const targetUpsidePct = n(profitTarget) && stock.price > 0 ? ((profitTarget! - stock.price) / stock.price) * 100 : null;
  const targetZone: PriceChartZone | null =
    stance === "accumulate" && n(profitTarget)
      ? {
          price: profitTarget!,
          mode: "line",
          color: "var(--signal-bullish)",
          label: `Target ${levelMoney(profitTarget!)}${n(targetUpsidePct) ? ` (${targetUpsidePct! >= 0 ? "+" : ""}${targetUpsidePct!.toFixed(1)}%)` : ""}`,
          dashed: true,
          strokeOpacity: 0.9,
        }
      : null;
  const directiveChartZones = targetZone
    ? [targetZone]
    : directive
      ? filterChartZones(prepareChartZonesForDisplay(buildDirectiveChartZones(directive, levelMoney)), priceAwareCall?.chartZoneKeys ?? [])
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
  const crowdColor = crowdScore >= 50 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const hasCrowdSignal = Boolean(reddit || n(sentiment?.overall_score));
  const hasMarketReddit = Boolean(hasRedditBuzz && reddit);
  const hasPowerTrades = market === "US" && !!powerTrades?.length;

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
    stock.exchange,
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
  const hasSmartAlerts = Boolean(earningsSmartAlertRail);
  const hasActivitySection = Boolean(recentNews?.length);

  return (
    <div className={`${FRAME} flex flex-col gap-12 py-8 sm:gap-16 sm:py-12`}>
      <StockPageAnalytics
        ticker={stock.ticker}
        instrumentId={stock.instrument_id}
        isSubscribed={subscribed}
        isTracked={isTracked}
        hasAiBrief={Boolean(directive?.text)}
        hasCrowdSignal={hasCrowdSignal}
      />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={44} circle />
            <div className="min-w-0">
              <h1 className="truncate text-[26px] font-medium leading-tight tracking-tight text-oa-fg sm:text-[32px]">
                {stock.name}
              </h1>
              <p className="oa-mono mt-0.5 truncate text-xs text-oa-muted-fg">
                {stock.ticker}
                {identifierLine ? ` · ${identifierLine}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-medium tabular-nums tracking-tight text-oa-fg sm:text-4xl">
              {money(stock.price)}
            </span>
            <span
              className="oa-mono text-[15px] font-medium tabular-nums"
              style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
            >
              {dayAbs >= 0 ? "+" : "−"}
              {money(Math.abs(dayAbs))} ({sign(dayPct, 2)})
            </span>
            {hasAnomalyMove ? (
              <a
                href="#stock-todays-move"
                className="rounded-full border border-oa-border bg-oa-card px-2.5 py-1 text-xs font-medium leading-5 transition-colors hover:bg-oa-accent"
                style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
              >
                Today&apos;s move explained
              </a>
            ) : null}
          </div>
          {premarketQuote ? (
            <div className="mt-3">
              <StockPremarketQuote currency={currency} market={market} quote={premarketQuote} />
            </div>
          ) : null}
          {updatedLabel ? (
            <p className="oa-mono mt-3 text-[11px] uppercase tracking-[0.08em] text-oa-muted-fg">{updatedLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <TrackButton {...trackButtonProps} />
          <WatchlistAiPromptButton ticker={stock.ticker} className={SECONDARY_PILL} />
          <StockShareCard ticker={stock.ticker} market={market} />
        </div>
      </header>

      {/* ── THE CALL ───────────────────────────────────────────────────────── */}
      {showVerdict && (
        <section id="stock-decision" className="scroll-mt-24">
          {directive?.text ? (
            <Plate>
              <div className="p-5 sm:p-8">
                <p className={EYEBROW} style={{ color: accent }}>
                  Our call on {stock.ticker}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <h2
                    className="font-medium leading-none tracking-tight text-[2.75rem] sm:text-[4rem]"
                    style={{ color: accent }}
                  >
                    {stanceLabel}
                  </h2>
                  {directive.confidence && <ConvictionDotsInline confidence={directive.confidence} />}
                </div>

                <div className="mt-8">
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
                        <div className="mt-8 border-t border-oa-border pt-5">
                          <p className="text-sm font-medium text-oa-fg/80">Never miss the level that matters</p>
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
                      hasAnomalyMove ? (
                        <div id="stock-todays-move" className="scroll-mt-24">
                          {overviewHeadline ? (
                            <p className="text-[17px] font-medium leading-snug text-oa-fg">{overviewHeadline}</p>
                          ) : null}
                          {moveNarrative ? (
                            <p className={`text-[15px] leading-7 text-oa-fg/80 ${overviewHeadline ? "mt-2.5" : ""}`}>
                              {moveNarrative}
                            </p>
                          ) : null}
                        </div>
                      ) : headlineBullets.length > 0 ? (
                        <ul className="space-y-3">
                          {headlineBullets.slice(0, 2).map((reason, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-7 text-oa-fg/90">
                              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null
                    }
                  />
                </div>
              </div>

              {hasSmartAlerts && (
                <div className="border-t border-oa-border bg-oa-card px-5 py-4 sm:px-8">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm font-medium text-oa-fg/80">Never miss the next report</p>
                    <StockSmartAlertsRail
                      ticker={stock.ticker}
                      instrumentId={stock.instrument_id}
                      alerts={[]}
                      earningsAlert={earningsSmartAlertRail}
                      isSubscribed={subscribed}
                    />
                  </div>
                </div>
              )}
            </Plate>
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
          ) : (
            <div>{lockedCall}</div>
          )}
        </section>
      )}

      {/* ── UNDERSTAND THE BUSINESS ────────────────────────────────────────── */}
      {businessQuestions?.questions?.length ? (
        <section>
          <SectionHead
            title={<>Understand {stock.ticker} in plain English</>}
            sub="Plain-English answers to the questions that actually matter before you put money in."
          />
          <div>
            {businessQuestions.questions.map(({ question, answer }, index) => (
              <details
                name={`${stock.instrument_id}-business-questions`}
                key={question}
                open={index === 0}
                className="group border-b border-oa-border last:border-b-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 marker:content-none">
                  <span className="flex items-baseline gap-3 text-[18px] font-medium leading-snug text-oa-fg">
                    <span className="oa-mono tabular-nums text-base text-oa-muted-fg">{String(index + 1).padStart(2, "0")}</span>
                    {question}
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-lg text-oa-muted-fg transition-transform duration-200 ease-out group-hover:text-oa-fg group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-3xl pb-6 pr-8 text-[17px] leading-8 text-oa-muted-fg group-open:block">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── WHERE IT SITS TODAY ────────────────────────────────────────────── */}
      {(showWhereItSits || pillars) && (
        <section>
          <SectionHead
            title={<>Where {stock.ticker} sits today</>}
            sub="Price, momentum, and the numbers behind the story."
          />
          {showWhereItSits && (
            <Plate className="mb-6">
              <div className={`grid gap-10 p-6 sm:p-8 ${pricePositionItemCount === 2 ? "md:grid-cols-2 md:gap-12" : ""}`}>
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
            </Plate>
          )}

          {pillars && (
            <FundamentalsBreakdown
              pillars={pillars}
              isSubscribed={subscribed}
              overallScore={hasReliableOverall ? (intelPro?.overall?.score ?? null) : null}
              overallCoverage={overallCoverage}
            />
          )}
        </section>
      )}

      {/* ── WHAT WALL STREET THINKS ────────────────────────────────────────── */}
      {(showAnalyst || hasExtendedAnalyst || hasCrowdSignal || hasPowerTrades) && (
        <section>
          <SectionHead
            title="What Wall Street thinks"
            sub="Where the analysts and the crowd stand, and what it's worth to know first."
          />
          <Plate>
            <div className="p-6 sm:p-8">
              {hasExtendedAnalyst ? (
                <StockAnalystDepth facts={facts ?? null} currentPrice={stock.price} currency={currency} />
              ) : null}

              <div
                className={`grid gap-10 ${
                  showBasicAnalyst && (hasMarketReddit || hasCrowdSignal || hasPowerTrades) ? "lg:grid-cols-2 lg:gap-12" : ""
                }`}
              >
            {showBasicAnalyst && (
              <div className="min-w-0">
                <p className={`${EYEBROW} mb-3`}>Analyst consensus</p>
                {ratingTotal > 0 && (
                  <p className="text-sm text-oa-muted-fg">
                    {analyst?.analyst_count ?? ratingTotal} analysts ·{" "}
                    <span className="font-medium" style={{ color: "var(--signal-bullish)" }}>
                      {buyPct}% Buy
                    </span>
                  </p>
                )}
                {n(target) && (
                  <>
                    <div className="mt-4 flex items-end gap-3">
                      <div>
                        <p className="oa-mono text-[10px] uppercase tracking-[0.08em] text-oa-muted-fg">Now</p>
                        <p className="text-lg font-medium tabular-nums text-oa-fg">{money(stock.price)}</p>
                      </div>
                      <div className="flex-1 pb-1.5">
                        <div className="h-2 overflow-hidden rounded-full bg-oa-secondary">
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
                        <p className="oa-mono text-[10px] uppercase tracking-[0.08em] text-oa-muted-fg">Target</p>
                        <p
                          className="text-lg font-medium tabular-nums"
                          style={{ color: aboveTarget ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                        >
                          {levelMoney(target!)}
                        </p>
                      </div>
                    </div>
                    {n(targetGapPct) && (
                      <p
                        className="mt-2 text-right text-sm font-medium"
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
              <div className="mt-8 min-w-0">
                <p className="text-base font-medium text-oa-fg">What investors are saying</p>
                <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-4">
                  <div
                    className="grid size-20 shrink-0 place-items-center rounded-full text-center"
                    style={{ background: `color-mix(in srgb, ${crowdColor} 12%, var(--oa-card))`, color: crowdColor }}
                  >
                    <span className="text-2xl font-medium tabular-nums">{crowdScore}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs font-medium" style={{ color: "var(--signal-bullish)" }}>
                        Bullish
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-oa-secondary">
                        <div className="h-full rounded-full" style={{ width: `${crowdScore}%`, background: "var(--signal-bullish)" }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-oa-muted-fg">
                        {crowdScore}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs font-medium" style={{ color: "var(--signal-bearish)" }}>
                        Bearish
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-oa-secondary">
                        <div className="h-full rounded-full" style={{ width: `${100 - crowdScore}%`, background: "var(--signal-bearish)" }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-oa-muted-fg">
                        {100 - crowdScore}%
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-oa-muted-fg">
                      Crowd sentiment leans{" "}
                      <span className="font-medium capitalize" style={{ color: crowdColor }}>
                        {crowdLabel.toLowerCase()}
                      </span>
                      , scoring {crowdScore}/100.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {hasMarketReddit && reddit ? (
              <div className="min-w-0">
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
            {hasPowerTrades ? (
              <div className="min-w-0">
                <StockPowerTradesCard ticker={stock.ticker} trades={powerTrades!} />
              </div>
            ) : null}
              </div>
            </div>
          </Plate>
        </section>
      )}

      {/* ── THE NUMBERS ────────────────────────────────────────────────────── */}
      {(hasOperatingRecord || hasFinancialDepth) && (
        <section>
          <SectionHead
            title="The business, by the numbers"
            sub="What it earns and where it earns it, what you're paying for the stock, and the risk sitting on the balance sheet."
          />
          <Plate>
            <div className="p-6 sm:p-8">
              {hasOperatingRecord && (
                <StockOperatingRecord facts={facts ?? null} currency={currency} />
              )}
              {hasOperatingRecord && hasFinancialDepth && (
                <div aria-hidden className="mb-10 mt-10 h-px w-full bg-oa-border sm:mb-12 sm:mt-12" />
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
            </div>
          </Plate>
        </section>
      )}

      {/* ── EARNINGS ───────────────────────────────────────────────────────── */}
      {preEarnings ? (
        <section id="stock-earnings" className="scroll-mt-24">
          <SectionHead
            title="Earnings · our setup"
            sub="Our read before the print, and what would change it."
            right={
              <span className="oa-mono rounded-full border border-oa-border bg-oa-card px-3 py-1 text-xs tabular-nums text-oa-muted-fg">
                {earningsDays != null && earningsDays > 0 ? `in ${earningsDays} days · ` : ""}
                {formatEventDate(preEarnings.event_date)}
              </span>
            }
          />
          <Plate>
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            {preEarningsPrediction && (
              <div className="border-l-2 py-1 pl-4" style={{ borderColor: "var(--signal-bullish)" }}>
                <p className={EYEBROW} style={{ color: "var(--signal-bullish)" }}>
                  Our prediction
                </p>
                <p className="mt-1.5 text-xl font-medium tracking-tight" style={{ color: "var(--signal-bullish)" }}>
                  {preEarningsPrediction}
                </p>
              </div>
            )}
            <div>
              {preEarnings.report?.summary && (
                <p className="text-[15px] leading-7 text-oa-fg/90">
                  {preEarnings.report.summary}
                  {preEarnings.report.confidence?.score_0_100 != null && (
                    <>
                      {" "}
                      <span className="oa-mono text-xs text-oa-muted-fg">
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
                <div className="mt-5 border-t border-oa-border pt-5">
                  <p className={`${EYEBROW} mb-2.5`}>What to watch</p>
                  <div className="flex flex-wrap gap-1.5">
                    {preEarnings.report!.decision_guide!.key_monitor_list!.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-oa-border bg-oa-card px-3 py-1 text-[13px] font-medium leading-5 text-oa-fg"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </Plate>
        </section>
      ) : earnings?.report && (earnings.report.headline || earnings.report.summary) ? (
        <section id="stock-earnings" className="scroll-mt-24">
          <SectionHead
            title={<>Last earnings{earnings.event_date ? <span className="font-normal text-oa-muted-fg"> · {formatEventDate(earnings.event_date)}</span> : null}</>}
            sub="What the last report changed, and the odds from here."
            right={
              <Link
                href={`/earnings-intel/${stock.ticker}`}
                className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              >
                Full report
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                  ›
                </span>
              </Link>
            }
          />
          <Plate>
            <div className="p-6 sm:p-8">
              {earnings.report.headline && (
                <p className="max-w-3xl text-xl font-medium leading-snug tracking-tight text-oa-fg">
                  {earnings.report.headline}
                </p>
              )}
              <EarningsScenarioOdds doc={earnings} dayChangePct={dayPct} />
            </div>
          </Plate>
        </section>
      ) : earningsSmartAlertRail ? (
        <section id="stock-earnings" className="scroll-mt-24">
          <SectionHead
            title={earningsSmartAlertRail.dateLabel}
            sub="The next scheduled report, and what it could change."
            right={
              <Link
                href="/earnings"
                className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              >
                Earnings calendar
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                  ›
                </span>
              </Link>
            }
          />
          <Plate>
            <p className="max-w-3xl p-6 text-[15px] leading-7 text-oa-muted-fg sm:p-8">
              {n(calendarEarnings?.eps_estimate)
                ? `Wall Street expects $${calendarEarnings!.eps_estimate!.toFixed(2)} per share. `
                : "The next scheduled report is on the calendar. "}
              Track {stock.ticker} and we email you before it reports.
            </p>
          </Plate>
        </section>
      ) : null}

      {/* ── PEERS ──────────────────────────────────────────────────────────── */}
      {peerRows.length > 1 && (
        <section className="min-w-0">
          <SectionHead
            title="How it stacks up against its peers"
            sub={`${stock.ticker} against the names it's actually compared to.`}
          />
          <Plate className="min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] table-fixed text-sm lg:min-w-[660px]">
                <colgroup>
                  <col className="w-[24%] lg:w-[44%]" />
                  <col className="w-[22%] lg:w-[18%]" />
                  <col className="w-[16%] lg:w-[12%]" />
                  <col className="w-[24%] lg:w-[16%]" />
                  <col className="w-[14%] lg:w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-oa-border text-left text-xs font-medium text-oa-muted-fg">
                    <th className="px-4 py-3 font-medium sm:px-6">Company</th>
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
                        className={`border-b border-oa-border last:border-0 ${peer.isCurrent ? "bg-oa-accent/60 font-medium" : ""}`}
                      >
                        <td className="max-w-0 px-4 py-3.5 sm:px-6">
                          <Link
                            href={peer.href}
                            className={`flex min-w-0 items-center gap-3 outline-none transition-colors ${
                              peer.isCurrent ? "text-oa-fg" : "text-oa-fg/90 hover:text-oa-fg"
                            }`}
                          >
                            <StockLogo ticker={peer.ticker} market={market} size={26} circle className="shrink-0" />
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="oa-mono block whitespace-nowrap text-sm font-medium">{peer.ticker}</span>
                              <span className="hidden truncate text-xs font-normal text-oa-muted-fg lg:block" title={peer.name}>
                                {peer.name}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="oa-mono px-4 py-3.5 text-right tabular-nums">{peer.marketCap}</td>
                        <td className="oa-mono px-4 py-3.5 text-right tabular-nums text-oa-muted-fg">{peer.pe}</td>
                        <td
                          className="oa-mono px-4 py-3.5 text-right tabular-nums"
                          style={{
                            color:
                              revUp
                                ? "var(--signal-bullish)"
                                : revDown
                                  ? "var(--signal-bearish)"
                                  : "var(--oa-muted-fg)",
                          }}
                        >
                          {comparisonValue}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {peer.score != null ? (
                            <span className="oa-mono font-medium tabular-nums" style={{ color: scoreToneColor(peer.score) }}>
                              {peer.score}
                            </span>
                          ) : (
                            <span className="text-oa-muted-fg">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Plate>
        </section>
      )}

      {/* ── ACTIVITY ───────────────────────────────────────────────────────── */}
      {hasActivitySection && (
        <section id="stock-activity" className="scroll-mt-24">
          <SectionHead
            title={<>What is moving {stock.ticker}</>}
            sub="Every story that touched the stock this week, newest first."
          />
          <StockNewsRailCard ticker={stock.ticker} articles={recentNews!} fullWidth />
        </section>
      )}
    </div>
  );
}
