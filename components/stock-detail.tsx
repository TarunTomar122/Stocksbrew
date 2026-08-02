import type { ReactNode } from "react";

import { StockLogo } from "@/components/stock-logo";
import { VerdictCallChart } from "@/components/verdict-call-chart";
import {
  CALL_KICK,
  CallInsightCard,
  CallMetricsStrip,
  ConvictionDotsInline,
  highlightCallText,
} from "@/components/verdict-call-ui";
import { LockedVerdictCall } from "@/components/locked-verdict-call";
import { FundamentalsBreakdown } from "@/components/fundamentals-breakdown";
import { StockAnalystDepth, StockFinancialDepth } from "@/components/stock-financial-depth";
import { StockSmartAlertsRail } from "@/components/stock-smart-alerts-rail";
import { TrackButton } from "@/components/track-button";
import { StockShareCard } from "@/components/stock-share-card";
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
import {
  buildDirectiveChartZones,
  buildDirectiveSmartAlerts,
  directiveZonePrice,
  filterChartZones,
  prepareChartZonesForDisplay,
  resolvePriceAwareCall,
  setupStateLabel,
} from "@/lib/directive-ui";
import { formatRiskRewardRatio } from "@/lib/risk-reward";
import { hasRedditBuzzData, StockRedditBuzzRailCard } from "@/components/stock-social-proof-card";
import { StockNewsRailCard } from "@/components/stock-news-rail-card";
import { StockTodaysMoveRailCard } from "@/components/stock-todays-move-rail-card";
import { StockPremarketQuote } from "@/components/stock-premarket-quote";
import type { NewsArticle } from "@/lib/news";
import type { LivePremarketQuote } from "@/lib/premarket-shared";
import type { StockIntelPro } from "@/lib/types";

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

// ---- stock page layout primitives -----------------------------------------
const KICK = CALL_KICK;
const RAIL_KICKER = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-on-surface-variant";
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

export function StockDetail(props: Props) {
  const { stock, market, currency, directive, setupState, visual, overview, overviewHeadline, overviewConfidence, facts, intelPro, analyst, fundamentals, rsi, rsiState, priceHistory, sma50, sma200, earnings, preEarnings, preEarningsDoc, calendarEarnings, cards, sentiment, timeline, peers, betterPeers, sectorPeers, sectorLabel, reddit, recentNews, subscribed, isTracked, tier, premarketQuote, updatedLabel, lockedCall } = props;

  const money = (v: number) => `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const levelMoney = (v: number) => `${currency}${Math.round(v).toLocaleString()}`;
  const dayPct = stock.day_change_pct ?? 0;
  const dayAbs = stock.day_change_abs ?? 0;
  const up = dayPct >= 0;

  const target = analyst?.target_price;
  const targetGapPct = n(target) && stock.price > 0 ? ((target! - stock.price) / stock.price) * 100 : null;
  const aboveTarget = n(target) && stock.price > target!;

  // ---- key stats with a plain-English verdict per metric ------------------
  type Tone = "good" | "bad" | "warn" | "neutral";
  type Stat = { k: string; v: string; tone: Tone; note?: string };
  const stats: Stat[] = [];
  const stat = (k: string, v: string | null, tone: Tone = "neutral", note?: string) => { if (v) stats.push({ k, v, tone, note }); };

  const pe = facts?.quick_stats?.pe_ttm ?? fundamentals?.pe_ttm;
  const marketCap = facts?.quick_stats?.market_cap ?? fundamentals?.market_cap;
  const hasPe = n(pe) && pe! > 0;
  const epsG = facts?.quick_stats?.eps_next_year_growth_pct;
  const rev = facts?.financials?.revenue_growth_yoy_pct;
  const beta = fundamentals?.beta;

  if (hasPe) stat("P/E (TTM)", pe!.toFixed(1), pe! > 120 ? "bad" : pe! > 50 ? "warn" : "neutral");
  else if (n(pe) && pe! <= 0) stat("P/E (TTM)", "n/a", "warn");
  stat("Revenue growth", n(rev) ? sign(rev!) : null, n(rev) ? (rev! > 0 ? "good" : "bad") : "neutral");
  stat("EPS next Y", n(epsG) ? sign(epsG!) : null, n(epsG) ? (epsG! > 0 ? "good" : "bad") : "neutral");
  stat("Beta", n(beta) ? beta!.toFixed(2) : null, !n(beta) ? "neutral" : beta! > 1.5 ? "warn" : "neutral");
  stat("Market cap", cap(marketCap), "neutral");
  stat("Revenue", cap(facts?.financials?.revenue), "neutral");
  const toneColor: Record<Tone, string> = { good: "var(--signal-bullish)", bad: "var(--signal-bearish)", warn: "var(--signal-neutral)", neutral: "var(--on-surface)" };

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
  const setupChip = setupStateLabel(setupState, stance);
  const priceAwareCall = directive ? resolvePriceAwareCall(directive, stock.price, money, levelMoney) : null;
  const directiveChartZones = directive
    ? filterChartZones(
        buildDirectiveChartZones(directive, levelMoney),
        priceAwareCall?.chartZoneKeys ?? [],
      )
    : [];
  const directiveSmartAlerts = directive ? buildDirectiveSmartAlerts(directive, levelMoney) : [];

  const hasAnomalyMove = Boolean(overview || overviewHeadline);
  const moveConfidenceLevel = overviewConfidence;

  const moveNarrative = overview;

  const whyLikeIt = visual?.why_it_matters || cards?.drivers?.[0]?.detail || priceAwareCall?.rationale;
  const whatFlips = visual?.what_to_watch || cards?.risk_cards?.[0]?.detail || cards?.risk_cards?.[0]?.risk || null;

  const trimPrice = directive ? directiveZonePrice(directive.trim_on) : null;
  const addPrice = directive ? directiveZonePrice(directive.add_on) : null;
  const breakPrice = directive ? directiveZonePrice(directive.breaks_if) : null;
  const isTrimLikeCall = stance === "trim" || stance === "avoid";
  const profitTarget =
    n(trimPrice) && directive?.trim_on?.trigger_type === "price_above"
      ? trimPrice
      : n(target)
        ? target
        : null;
  const profitTargetPct =
    n(profitTarget) && stock.price > 0 ? ((profitTarget! - stock.price) / stock.price) * 100 : null;
  const riskAnchor =
    n(breakPrice) && directive?.breaks_if?.trigger_type === "price_below"
      ? breakPrice
      : !isTrimLikeCall && n(addPrice) && directive?.add_on?.trigger_type === "price_below" && addPrice! < stock.price
        ? addPrice
        : null;
  const breakRiskPct =
    n(riskAnchor) && stock.price > 0
      ? ((stock.price - riskAnchor!) / stock.price) * 100
      : null;
  const riskRewardRatio =
    !isTrimLikeCall && n(profitTargetPct) && n(breakRiskPct) && breakRiskPct! > 0 && profitTargetPct! > 0
      ? profitTargetPct! / breakRiskPct!
      : null;

  const whyBullets = (cards?.drivers ?? [])
    .slice(0, 4)
    .map((d) => d.detail?.trim() || d.label)
    .filter((text): text is string => Boolean(text));
  if (whyBullets.length === 0 && whyLikeIt) whyBullets.push(whyLikeIt);

  const flipBullets = (cards?.risk_cards ?? [])
    .slice(0, 4)
    .map((r) => r.detail?.trim() || r.risk || r.label)
    .filter((text): text is string => Boolean(text));
  if (flipBullets.length === 0 && whatFlips) flipBullets.push(whatFlips);

  const showCallMetrics = n(profitTarget) || n(breakPrice);
  const showCallInsights = whyBullets.length > 0 || flipBullets.length > 0;
  const decisionContext = (
    [
      ["what changed", visual?.what_changed],
      ["why now", visual?.why_it_matters],
      ["next checkpoint", visual?.what_to_watch],
    ] as const
  ).filter(([, value]) => Boolean(value?.trim()));

  const callMetrics: Array<{
    label: string;
    value: string;
    hint?: string;
    hintTone?: "bullish" | "bearish" | "neutral";
  }> = [];
  if (n(profitTarget)) {
    callMetrics.push({
      label: isTrimLikeCall ? "Trim above" : "Target",
      value: levelMoney(profitTarget!),
      hint: n(profitTargetPct)
        ? isTrimLikeCall
          ? `${profitTargetPct! >= 0 ? "+" : ""}${profitTargetPct!.toFixed(1)}% to trim zone`
          : `${profitTargetPct! >= 0 ? "+" : ""}${profitTargetPct!.toFixed(1)}% upside`
        : undefined,
      hintTone: isTrimLikeCall ? "neutral" : n(profitTargetPct) && profitTargetPct! >= 0 ? "bullish" : "bearish",
    });
  }
  if (n(breakPrice) && directive?.breaks_if?.trigger_type === "price_below") {
    callMetrics.push({
      label: "Exit below",
      value: levelMoney(breakPrice!),
      hint: n(breakRiskPct) ? `-${breakRiskPct!.toFixed(1)}% risk` : undefined,
      hintTone: "bearish",
    });
  }
  if (n(riskRewardRatio)) {
    callMetrics.push({
      label: "Reward / risk",
      value: formatRiskRewardRatio(riskRewardRatio!),
      hint: riskRewardRatio! >= 1.5 ? "Favorable" : riskRewardRatio! >= 1 ? "Balanced" : "Tight",
      hintTone: riskRewardRatio! >= 1.5 ? "bullish" : "neutral",
    });
  }

  const stanceLabel = stance.charAt(0).toUpperCase() + stance.slice(1);

  const hist = (priceHistory ?? []).filter((p) => n(p.close));
  const hasChart = hist.length >= 5;
  const showLockedVerdict = !subscribed;
  const showVerdict = Boolean((subscribed && (directive?.text || lockedCall)) || showLockedVerdict);

  const finTiles = (
    [
      ["Revenue", cap(facts?.financials?.revenue)],
      ["Net income", cap(facts?.financials?.net_income)],
      ["EPS", n(facts?.financials?.eps_diluted) ? money(facts!.financials!.eps_diluted!) : null],
      ["Op. income", cap(facts?.financials?.operating_income)],
      ["Gross profit", cap(facts?.financials?.gross_profit)],
      ["Rev growth", n(facts?.financials?.revenue_growth_yoy_pct) ? sign(facts!.financials!.revenue_growth_yoy_pct!) : null],
    ] as const
  ).filter(([, v]) => v);
  const fundamentalStats = stats.filter(
    (item) => item.k !== "Revenue" && item.k !== "Revenue growth",
  );
  const hasFinancialDepth = Boolean(
    facts?.financial_history?.length ||
      Object.values(facts?.balance ?? {}).some(n) ||
      Object.values(facts?.valuation ?? {}).some(n) ||
      Object.values(facts?.quality ?? {}).some(n) ||
      facts?.business_segments?.items?.length ||
      facts?.geographic_mix?.items?.length,
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
  const showWhereItSits = has52WeekRange || hasRsiSlider || hasAnomalyMove;
  const pricePositionItemCount =
    Number(has52WeekRange) + Number(hasRsiSlider) + Number(hasAnomalyMove);

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
  const crowdPositive = (() => {
    const lanes = sentiment?.lanes ?? [];
    if (lanes.length) return Math.round(lanes.reduce((s, l) => s + l.positive_pct, 0) / lanes.length);
    if (reddit?.sentiment === "bullish") return 72;
    if (reddit?.sentiment === "bearish") return 28;
    return null;
  })();
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

  const metaLine = [stock.ticker, stock.exchange, stock.sector, stock.industry ?? intelPro?.industry_label].filter(Boolean).join(" · ");
  const metaShort = [stock.exchange, stock.sector, stock.industry ?? intelPro?.industry_label].filter(Boolean).join(" · ");

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
      fundamentalStats.length > 0 ||
      finTiles.length > 0 ||
      hasFinancialDepth ||
      peerRows.length > 1 ||
      (subscribed && (showAnalyst || hasExtendedAnalyst || hasCrowdSignal)),
  );
  const hasSmartAlerts = directiveSmartAlerts.length > 0 || Boolean(earningsSmartAlertRail);
  const hasActivitySection = Boolean(recentNews?.length);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 py-4 sm:px-6 sm:py-7">
      {/* HEADER */}
      <header className="border-b border-outline-variant pb-5 sm:pb-6">
        <div className="flex items-start gap-2.5 sm:hidden">
          <StockLogo
            ticker={stock.ticker}
            logoUrl={stock.logo_url}
            market={market}
            size={40}
            className="shrink-0 rounded-lg border border-outline-variant bg-surface p-1"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="font-mono text-[20px] font-extrabold leading-none tracking-tight text-on-surface">{stock.ticker}</h1>
                <p className="mt-0.5 min-w-0 text-[13px] font-medium leading-snug text-on-surface/75">{stock.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[20px] font-extrabold leading-none tabular-nums text-on-surface">{money(stock.price)}</p>
                <p
                  className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums"
                  style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                >
                  {up ? "▲" : "▼"} {sign(dayPct, 2)}
                </p>
                {dayAbs ? (
                  <p className="mt-px font-mono text-[10px] tabular-nums text-on-surface-variant">
                    {dayAbs >= 0 ? "+" : "−"}
                    {money(Math.abs(dayAbs))}
                  </p>
                ) : null}
              </div>
            </div>
            {(metaShort || hasAnomalyMove || updatedLabel) ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {metaShort ? (
                  <p className="font-mono text-[10px] leading-none text-on-surface-variant">{metaShort}</p>
                ) : null}
                {updatedLabel ? (
                  <p className="font-mono text-[10px] leading-none text-on-surface-variant">· price {updatedLabel}</p>
                ) : null}
                {hasAnomalyMove ? (
                  <a
                    href="#stock-todays-move"
                    className="inline-flex w-fit shrink-0 items-center rounded-md border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-80"
                    style={{
                      color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
                      borderColor: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 28%, var(--outline-variant))`,
                      background: `color-mix(in srgb, ${up ? "var(--signal-bullish)" : "var(--signal-bearish)"} 8%, var(--surface))`,
                    }}
                  >
                    today&apos;s anomaly
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <TrackButton {...trackButtonProps} variant="compact" />
              <StockShareCard ticker={stock.ticker} market={market} />
            </div>
            {premarketQuote ? (
              <div className="mt-2">
                <StockPremarketQuote
                  currency={currency}
                  market={market}
                  quote={premarketQuote}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden w-full items-start gap-3.5 sm:flex">
          <div className="flex min-w-0 items-start gap-3.5">
            <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} market={market} size={44} className="rounded-lg border border-outline-variant bg-surface p-1" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold leading-none tracking-tight text-on-surface">{stock.name}</h1>
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
              <p className="mt-1 font-mono text-[12px] text-on-surface-variant">
                {metaLine}
                {updatedLabel ? ` · price ${updatedLabel}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <TrackButton {...trackButtonProps} variant="compact" />
                <StockShareCard ticker={stock.ticker} market={market} />
              </div>
            </div>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums text-on-surface">{money(stock.price)}</p>
              <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                {up ? "▲" : "▼"} {sign(dayPct, 2)}
                {dayAbs ? ` · ${dayAbs >= 0 ? "+" : "−"}${money(Math.abs(dayAbs))} today` : ""}
              </p>
              {premarketQuote ? (
                <StockPremarketQuote
                  currency={currency}
                  market={market}
                  quote={premarketQuote}
                />
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="-mx-4 bg-surface sm:-mx-6">
        <nav
          aria-label="Stock research sections"
          className="flex min-w-0 gap-6 overflow-x-auto border-b border-outline-variant px-4 sm:px-6"
        >
          {hasDecisionSection ? (
            <a
              href="#stock-decision"
              className="shrink-0 border-b-2 border-transparent py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-on-surface transition-colors hover:border-primary"
            >
              Decision
            </a>
          ) : null}
          {hasEvidenceSection ? (
            <a
              href="#stock-evidence"
              className="shrink-0 border-b-2 border-transparent py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:text-on-surface"
            >
              Evidence
            </a>
          ) : null}
          {hasEarningsSection ? (
            <a
              href="#stock-earnings"
              className="shrink-0 border-b-2 border-transparent py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:text-on-surface"
            >
              Earnings
            </a>
          ) : null}
          {hasActivitySection ? (
            <a
              href="#stock-activity"
              className="shrink-0 border-b-2 border-transparent py-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant transition-colors hover:text-on-surface"
            >
              Activity
            </a>
          ) : null}
        </nav>
      </div>

      {/* TIER 1: VERDICT */}
      {showVerdict && (
        <section id="stock-decision" className="scroll-mt-24 border-b border-outline-variant py-6 sm:py-8">
          {directive?.text ? (
            <div>
              <VerdictCallChart
                hist={hist}
                returns={facts?.returns}
                currency={currency}
                zones={directiveChartZones}
                lineColor={accent}
                currentPrice={stock.price}
                zoneHint={
                  directiveChartZones[0]
                    ? { label: directiveChartZones[0].label, color: directiveChartZones[0].color }
                    : null
                }
                callSlot={
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={KICK} style={{ color: `color-mix(in srgb, ${accent} 55%, var(--on-surface-variant))` }}>
                        our call
                      </p>
                      {setupChip && (
                        <span
                          className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
                          style={{
                            color: accent,
                            borderColor: `color-mix(in srgb, ${accent} 22%, var(--outline-variant))`,
                            background: `color-mix(in srgb, ${accent} 5%, var(--surface))`,
                          }}
                        >
                          {setupChip}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-2">
                      <h2 className="text-[1.65rem] font-extrabold leading-[1.05] tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-none" style={{ color: accent }}>
                        {priceAwareCall?.headline || stanceLabel}
                      </h2>
                      {directive.confidence && <ConvictionDotsInline confidence={directive.confidence} />}
                    </div>

                    {priceAwareCall?.body && (
                      <div className="mt-5">
                        <p className="text-[15px] leading-[1.55] text-on-surface/85">{highlightCallText(priceAwareCall.body)}</p>
                        {priceAwareCall.levels && (
                          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
                            {highlightCallText(priceAwareCall.levels)}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                }
              />

              {(showCallMetrics || hasSmartAlerts) && (
                <div className="mt-6">
                  <CallMetricsStrip
                    metrics={callMetrics}
                    mobileColumns={2}
                    actions={
                      hasSmartAlerts ? (
                        <StockSmartAlertsRail
                          ticker={stock.ticker}
                          instrumentId={stock.instrument_id}
                          alerts={directiveSmartAlerts}
                          earningsAlert={earningsSmartAlertRail}
                          isSubscribed={subscribed}
                        />
                      ) : null
                    }
                  />
                </div>
              )}

              {showCallInsights && (
                <div className="mt-6 grid gap-6 border-t border-outline-variant/50 pt-6 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-outline-variant/40">
                  {whyBullets.length > 0 && (
                    <div className="sm:pr-6">
                      <CallInsightCard tone="bullish" title="drivers" bullets={whyBullets} />
                    </div>
                  )}
                  {flipBullets.length > 0 && (
                    <div className="sm:pl-6">
                      <CallInsightCard tone="bearish" title="risks" bullets={flipBullets} />
                    </div>
                  )}
                </div>
              )}

              {decisionContext.length > 0 && (
                <div className="mt-6 divide-y divide-outline-variant/50 border-t border-outline-variant/50 pt-2">
                  {decisionContext.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid gap-1.5 py-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)] sm:gap-8"
                    >
                      <p className={RAIL_KICKER}>{label}</p>
                      <p className="text-[13px] leading-relaxed text-on-surface/85">{value}</p>
                    </div>
                  ))}
                </div>
              )}

            </div>
          ) : showLockedVerdict ? (
            <div>
              <LockedVerdictCall
                ticker={stock.ticker}
                hist={hist}
                returns={facts?.returns}
                currency={currency}
                currentPrice={stock.price}
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
        {showWhereItSits && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <div className="mb-5">
              <span className={TIER}>price position</span>
              <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-on-surface">
                Where {stock.ticker} sits now
              </h2>
            </div>
            <div
              className={`grid gap-8 ${
                pricePositionItemCount >= 3
                  ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] md:gap-8"
                  : pricePositionItemCount === 2
                    ? "md:grid-cols-2 md:gap-12"
                    : ""
              }`}
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
              {hasAnomalyMove && (
                <StockTodaysMoveRailCard
                  dayPct={dayPct}
                  dayAbs={dayAbs}
                  up={up}
                  formatMoney={money}
                  headline={overviewHeadline}
                  body={moveNarrative}
                  confidence={moveConfidenceLevel}
                />
              )}
            </div>
          </section>
        )}

        {(pillars || fundamentalStats.length > 0 || finTiles.length > 0) && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <div className="mb-5">
              <div>
                <span className={TIER}>fundamentals</span>
                <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-on-surface">
                  Business quality and valuation
                </h2>
              </div>
            </div>

            <div
              className={`overflow-hidden rounded-2xl border border-outline-variant bg-surface ${
                pillars ? "lg:grid lg:grid-cols-[minmax(15rem,0.32fr)_minmax(0,0.68fr)]" : ""
              }`}
            >
              <aside className="bg-surface-container-low/65 p-5 sm:p-6 lg:border-r lg:border-outline-variant">
                {pillars && (
                  <div className="mb-7">
                    <p className={RAIL_KICKER}>overall score</p>
                    <p
                      className="mt-2 font-mono text-[30px] font-extrabold leading-none tabular-nums"
                      style={{ color: scoreToneColor(hasReliableOverall ? (intelPro?.overall?.score ?? null) : null) }}
                    >
                      {hasReliableOverall ? (intelPro!.overall?.score ?? "N/A") : "N/A"}
                      {hasReliableOverall && (
                        <span className="ml-1 text-[12px] font-normal text-on-surface-variant">/100</span>
                      )}
                    </p>
                    <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
                      {hasReliableOverall ? "Compared with sector peers" : "Insufficient data"}
                      {overallCoverage != null ? ` · ${Math.round(overallCoverage * 100)}% coverage` : ""}
                    </p>
                  </div>
                )}

                {(fundamentalStats.length > 0 || finTiles.length > 0) && (
                  <>
                  {fundamentalStats.length > 0 && (
                    <div>
                      <p className={`${RAIL_KICKER} mb-4`}>key figures</p>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                        {fundamentalStats.map((item) => (
                          <div key={item.k} className="min-w-0">
                            <span className="block text-[11px] leading-snug text-on-surface-variant">{item.k}</span>
                            <span
                              className="mt-1 block font-mono text-[13px] font-bold tabular-nums"
                              style={{ color: toneColor[item.tone] }}
                            >
                              {item.v}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {finTiles.length > 0 && (
                    <div className={fundamentalStats.length > 0 ? "mt-7" : ""}>
                      <p className={`${RAIL_KICKER} mb-4`}>ttm snapshot</p>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                        {finTiles.map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <p className="text-[11px] leading-snug text-on-surface-variant">{k}</p>
                            <p className="mt-1 font-mono text-[13px] font-bold tabular-nums text-on-surface">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </>
                )}
              </aside>

              {pillars && (
                <div className="min-w-0 p-5 sm:p-6 lg:p-7">
                  <FundamentalsBreakdown pillars={pillars} isSubscribed={subscribed} />
                </div>
              )}
            </div>
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

        {subscribed && (showAnalyst || hasExtendedAnalyst || hasCrowdSignal) && (
          <section className={`${STOCK_SECTION} py-7 sm:py-9`}>
            <div className="mb-5">
              <span className={TIER}>market view</span>
              <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-on-surface">
                Street expectations and crowd signal
              </h2>
            </div>

            {hasExtendedAnalyst ? (
              <div className="mb-9">
                <StockAnalystDepth facts={facts ?? null} currentPrice={stock.price} currency={currency} />
              </div>
            ) : null}

            <div
              className={`grid gap-7 ${
                hasCrowdSignal && hasMarketReddit
                  ? "lg:grid-cols-2 lg:divide-x lg:divide-outline-variant/60"
                  : showBasicAnalyst && hasCrowdSignal
                    ? "lg:grid-cols-2 lg:divide-x lg:divide-outline-variant/60"
                    : ""
              }`}
            >
              <div className={hasMarketReddit && showBasicAnalyst ? "flex min-w-0 flex-col divide-y divide-outline-variant/60" : hasMarketReddit ? "min-w-0 lg:pr-8" : "contents"}>
              {showBasicAnalyst && (
                <div className={`min-w-0 ${hasMarketReddit ? "pb-7" : "lg:pr-8"}`}>
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

              {hasCrowdSignal && (
                <div className={`min-w-0 ${hasMarketReddit && showBasicAnalyst ? "pt-7" : !hasMarketReddit && showBasicAnalyst ? "lg:pl-8" : ""}`}>
                  <p className={`${RAIL_KICKER} mb-3`}>crowd signal</p>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                    <CrowdRing score={crowdScore} />
                    <div>
                      <p className={RAIL_KICKER}>sentiment</p>
                      <p className="mt-1 text-[16px] font-bold capitalize" style={{ color: crowdColor }}>
                        {crowdLabel}
                      </p>
                    </div>
                    <div>
                      <p className={RAIL_KICKER}>conversation</p>
                      <p className="mt-1 font-mono text-[15px] font-bold tabular-nums text-on-surface">
                        {n(reddit?.mention_count) ? `${reddit!.mention_count} posts` : "Retail chatter"}
                      </p>
                    </div>
                    {crowdPositive != null && (
                      <div>
                        <p className={RAIL_KICKER}>positive</p>
                        <p className="mt-1 font-mono text-[15px] font-bold tabular-nums text-on-surface">
                          {crowdPositive}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
              {hasMarketReddit && reddit ? (
                <div className="min-w-0 lg:pl-8">
                  <p className={`${RAIL_KICKER} mb-3`}>reddit buzz</p>
                  <StockRedditBuzzRailCard ticker={stock.ticker} reddit={reddit} isSubscribed={subscribed} />
                </div>
              ) : null}
            </div>
          </section>
        )}

        {peerRows.length > 1 && (
          <section className={`${STOCK_SECTION} min-w-0 py-7 sm:py-9`}>
            <div className="mb-4">
              <span className={TIER}>peer comparison</span>
              <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-on-surface">
                How {stock.ticker} compares
              </h2>
            </div>
            <div className="-mx-1 min-w-0 overflow-x-auto px-1">
              <table className="w-full min-w-[540px] table-fixed text-[13px] lg:min-w-[640px]">
                <colgroup>
                  <col className="w-[24%] lg:w-[44%]" />
                  <col className="w-[22%] lg:w-[18%]" />
                  <col className="w-[16%] lg:w-[12%]" />
                  <col className="w-[24%] lg:w-[16%]" />
                  <col className="w-[14%] lg:w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-outline-variant text-left font-mono text-[10.5px] text-on-surface-variant">
                    <th className="px-2 pb-2 font-normal">company</th>
                    <th className="px-2 pb-2 text-right font-normal">mkt cap</th>
                    <th className="px-2 pb-2 text-right font-normal">P/E</th>
                    <th className="px-2 pb-2 text-right font-normal">
                      {showPeerRevenueGrowth ? "rev growth" : "price"}
                    </th>
                    <th className="px-2 pb-2 text-right font-normal">score</th>
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
                        className={`border-b border-outline-variant last:border-0 ${peer.isCurrent ? "font-bold" : ""}`}
                        style={peer.isCurrent ? { background: "color-mix(in srgb, var(--signal-bullish) 6%, var(--surface))" } : undefined}
                      >
                        <td className="max-w-0 px-2 py-3">
                          <Link
                            href={peer.href}
                            className={`flex min-w-0 items-center gap-2.5 hover:text-accent-terminal ${peer.isCurrent ? "text-[var(--signal-bullish)]" : "text-on-surface"}`}
                          >
                            <StockLogo ticker={peer.ticker} market={market} size={24} className="flex-none shrink-0" />
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="block whitespace-nowrap font-mono text-[13px] font-semibold">{peer.ticker}</span>
                              <span className="hidden truncate text-[12px] font-normal text-on-surface-variant lg:block" title={peer.name}>
                                {peer.name}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-2 py-3 text-right font-mono tabular-nums">{peer.marketCap}</td>
                        <td className="px-2 py-3 text-right font-mono tabular-nums text-on-surface-variant">{peer.pe}</td>
                        <td
                          className="px-2 py-3 text-right font-mono tabular-nums"
                          style={{ color: revUp ? "var(--signal-bullish)" : revDown ? "var(--signal-bearish)" : "var(--on-surface-variant)" }}
                        >
                          {comparisonValue}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {peer.score != null ? (
                            <span className="font-mono font-bold tabular-nums" style={{ color: scoreToneColor(peer.score) }}>
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className={TIER}>
              earnings{earnings.event_date ? ` · ${formatEventDate(earnings.event_date)}` : ""}
            </span>
            <a
              href={`/earnings-intel/${stock.ticker}`}
              className="font-mono text-[11px] hover:underline"
              style={{ color: "var(--signal-bullish)" }}
            >
              full report →
            </a>
          </div>
          {earnings.report.headline && (
            <p className="text-[18px] font-bold tracking-tight text-on-surface">{earnings.report.headline}</p>
          )}
          {earnings.report.summary && (
            <p className="mt-2 max-w-4xl text-[14px] leading-relaxed text-on-surface-variant">{earnings.report.summary}</p>
          )}
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
                Add {stock.ticker} to Radar so the earnings setup can bring you back when it matters.
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

      {/* ACTIVITY */}
      {hasActivitySection && (
        <section id="stock-activity" className={`${STOCK_SECTION} scroll-mt-24 py-7 sm:py-9`}>
          <div className="mb-5">
            <span className={TIER}>activity</span>
            <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-on-surface">
              What is moving {stock.ticker}
            </h2>
          </div>

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
