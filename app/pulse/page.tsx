import type { Metadata } from "next";

import { PulseHub, type SectorCard } from "@/components/pulse-hub";
import { getCurrentMarket } from "@/lib/market";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getRedditCues } from "@/lib/reddit-cues";
import { getMarketSnapshot } from "@/lib/firestore";
import { getEarnings } from "@/lib/earnings";
import { getUpcomingPreEarnings } from "@/lib/pre-earnings-intel";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Market today — movers, Reddit buzz, sector heat",
  description:
    "The market right now: today's biggest movers and why, what the crowd is debating on Reddit, and how the sectors are leaning. One live view.",
  alternates: { canonical: "/pulse" },
};

const SECTORS: { label: string; tickers: string[] }[] = [
  { label: "Tech", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "ADBE", "CRM"] },
  { label: "Semis", tickers: ["NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "ARM", "SMCI", "MRVL"] },
  { label: "Industrials", tickers: ["CAT", "GE", "HON", "RTX", "BA", "MMM", "ETN", "DE"] },
  { label: "Finance", tickers: ["JPM", "BAC", "GS", "MS", "WFC", "V", "MA", "AXP"] },
];

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export default async function PulsePage() {
  const market = getCurrentMarket();
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [anomaliesData, redditData, snapshotRows, earningsEvents, preEarnings] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getRedditCues(market).catch(() => null),
    getMarketSnapshot(market).catch(() => []),
    getEarnings(market, undefined, weekOut).catch(() => []),
    getUpcomingPreEarnings(market).catch(() => []),
  ]);

  // our prediction per ticker (EPS call + likely reaction)
  const predBy = new Map<string, { epsOutlook?: string; reaction?: string }>();
  for (const p of preEarnings) {
    if (p.ticker) predBy.set(p.ticker.toUpperCase(), { epsOutlook: p.report?.call?.eps_outlook, reaction: p.report?.call?.post_print_move });
  }

  // our covered universe = tickers in the market snapshot
  const universe = new Set<string>();
  for (const row of snapshotRows) if (row.symbol) universe.add(row.symbol.toUpperCase());

  // upcoming earnings — our universe only (tickers we actually cover), deduped, overlay prediction
  const seenEarn = new Set<string>();
  const earnings = earningsEvents
    .filter((e) => {
      const k = e.ticker?.toUpperCase();
      if (!k || seenEarn.has(k) || !universe.has(k)) return false;
      seenEarn.add(k);
      return true;
    })
    .slice(0, 24)
    .map((e) => ({
      ticker: e.ticker,
      company: e.company,
      eventDate: e.event_date,
      time: e.time,
      epsEstimate: e.eps_estimate,
      ...predBy.get(e.ticker?.toUpperCase() ?? ""),
    }));

  const anomalies = anomaliesData?.anomalies ?? [];
  const redditTickers = redditData?.tickers ?? [];

  // reddit sentiment lookup for the cross-reference chip
  const buzzBy = new Map<string, string>();
  for (const r of redditTickers) if (r.ticker) buzzBy.set(r.ticker.toUpperCase(), r.sentiment);

  const items = anomalies.map((a) => {
    const tag = (a.catalyst || a.move_explanation?.headline || a.visual_summary?.what_changed || "").trim();
    const fallbackWhy =
      (a.today_brief || a.visual_summary?.why_it_matters || a.thesis || "").trim();
    return {
      ticker: a.ticker,
      price: a.price,
      changePct: a.day_change_pct,
      tag,
      buzz: buzzBy.get(a.ticker.toUpperCase()),
      headline: a.move_explanation?.headline || tag || undefined,
      whyItMatters: a.move_explanation?.why_it_matters || fallbackWhy || undefined,
      confidence: a.move_explanation?.confidence,
    };
  });

  const reddit = redditTickers
    .filter((r) => r.summary?.trim())
    .slice(0, 9)
    .map((r) => ({ ticker: r.ticker, sentiment: r.sentiment, summary: r.summary, mention_count: r.mention_count }));

  // sector heat from the market snapshot
  const bySym = new Map<string, { changePct?: number }>();
  for (const row of snapshotRows) if (row.symbol) bySym.set(row.symbol.toUpperCase(), { changePct: row.price?.changePct });
  const sectors: SectorCard[] = SECTORS.map(({ label, tickers }) => {
    const stocks = tickers
      .map((t) => ({ ticker: t, changePct: bySym.get(t)?.changePct }))
      .filter((s): s is { ticker: string; changePct: number } => n(s.changePct))
      .sort((a, b) => b.changePct - a.changePct);
    const avg = stocks.length ? stocks.reduce((s, x) => s + x.changePct, 0) / stocks.length : 0;
    return { label, avg, stocks: stocks.slice(0, 8) };
  }).filter((c) => c.stocks.length > 0);

  // synthesized top-line
  const gainers = anomalies.filter((a) => a.day_change_pct >= 0).length;
  const losers = anomalies.length - gainers;
  const sortedSectors = [...sectors].sort((a, b) => b.avg - a.avg);
  const lead = sortedSectors[0] ? { label: sortedSectors[0].label, avg: sortedSectors[0].avg } : null;
  const lag = sortedSectors.length > 1 ? { label: sortedSectors[sortedSectors.length - 1].label, avg: sortedSectors[sortedSectors.length - 1].avg } : null;
  const bull = redditTickers.filter((r) => r.sentiment === "bullish").length;
  const bear = redditTickers.filter((r) => r.sentiment === "bearish").length;
  const crowd = redditTickers.length === 0 ? null : bull > bear ? "bullish" : bear > bull ? "bearish" : "mixed";

  return (
    <main className="flex-grow">
      <PulseHub items={items} reddit={reddit} sectors={sectors} earnings={earnings} topline={{ gainers, losers, lead, lag, crowd }} />
    </main>
  );
}
