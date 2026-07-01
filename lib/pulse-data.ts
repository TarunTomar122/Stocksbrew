import type { ScannerItem } from "@/components/movers-scanner";
import { anomalyDetail, anomalyHeadline } from "@/components/daily-anomalies-shared";
import type { EarningsPick, PulseTopline, RecentEarningsPick, RedditPick, SectorCard } from "@/components/pulse-hub";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { buildLandingSectorCards } from "@/lib/landing-sector-data";
import type { PremarketMovers } from "@/lib/premarket";
import type { SnapshotRow } from "@/lib/types";

export type PulsePageData = {
  items: ScannerItem[];
  reddit: RedditPick[];
  sectors: SectorCard[];
  earnings: EarningsPick[];
  recentEarnings: RecentEarningsPick[];
  topline: PulseTopline;
  premarketItems: ScannerItem[];
};

function epsTagFromReported(reported?: string): string | undefined {
  const r = (reported ?? "").toLowerCase();
  if (/\bbeat\b/.test(r)) return "beat";
  if (/\bmiss\b/.test(r)) return "miss";
  if (/\b(in.?line|inline|met)\b/.test(r)) return "inline";
  return undefined;
}

function mapScannerItems(anomalies: AnomalyItem[], buzzBy: Map<string, string>): ScannerItem[] {
  return anomalies.map((a) => {
    const headline = anomalyHeadline(a);
    const tag = (a.catalyst || a.visual_summary?.what_changed || "").trim() || headline;
    const whyItMatters =
      a.move_explanation?.why_it_matters?.trim() ||
      anomalyDetail(a) ||
      (a.today_brief || a.visual_summary?.why_it_matters || a.thesis || "").trim() ||
      undefined;

    return {
      ticker: a.ticker,
      price: a.price,
      changePct: a.day_change_pct,
      tag,
      buzz: buzzBy.get(a.ticker.toUpperCase()),
      headline,
      whyItMatters,
      confidence: a.move_explanation?.confidence,
    };
  });
}

function mapSectors(snapshotRows: SnapshotRow[]): SectorCard[] {
  return buildLandingSectorCards(snapshotRows).map((s) => ({
    label: s.label,
    avg: s.avg,
    stocks: s.stocks.map((x) => ({ ticker: x.ticker, changePct: x.changePct })),
  }));
}

function mapPremarketScannerItems(doc: PremarketMovers): ScannerItem[] {
  const rows = [...(doc.gappers_up ?? []), ...(doc.gappers_down ?? [])].sort(
    (a, b) => Math.abs(b.pre_market_change_pct) - Math.abs(a.pre_market_change_pct),
  );
  return rows.map((r) => ({
    ticker: r.ticker,
    price: r.pre_market_price,
    changePct: r.pre_market_change_pct,
    tag: r.sector?.trim() || "pre-market",
    headline: `Gapping ${r.pre_market_change_pct >= 0 ? "up" : "down"} before the open`,
    whyItMatters: `Pre-market $${r.pre_market_price.toFixed(2)} vs prior close $${r.previous_close.toFixed(2)}.`,
  }));
}

export function buildPulsePageData(input: {
  market: "US" | "IN";
  anomalies: AnomalyItem[];
  redditTickers: Array<{
    ticker: string;
    sentiment: string;
    summary: string;
    mention_count?: number;
    catalysts?: string[];
  }>;
  snapshotRows: SnapshotRow[];
  earningsEvents: Array<{
    ticker: string;
    company: string;
    event_date: string;
    time: string;
    eps_estimate: number | null;
  }>;
  predBy: Map<string, { epsOutlook?: string; reaction?: string }>;
  recentIntelDocs: EarningsIntelDoc[];
  premarketDoc?: PremarketMovers | null;
}): PulsePageData {
  const { market, anomalies, redditTickers, snapshotRows, earningsEvents, predBy, recentIntelDocs, premarketDoc } = input;

  const buzzBy = new Map<string, string>();
  for (const r of redditTickers) if (r.ticker) buzzBy.set(r.ticker.toUpperCase(), r.sentiment);

  const anomalyBy = new Map<
    string,
    { price?: number; changePct?: number }
  >();
  for (const a of anomalies) {
    if (!a.ticker) continue;
    anomalyBy.set(a.ticker.toUpperCase(), {
      price: typeof a.price === "number" ? a.price : undefined,
      changePct:
        typeof a.day_change_pct === "number" ? a.day_change_pct : undefined,
    });
  }

  const snapshotBy = new Map<
    string,
    { company?: string; price?: number; changePct?: number; volume?: number }
  >();
  for (const row of snapshotRows) {
    const ticker = row.symbol?.toUpperCase();
    if (!ticker) continue;
    snapshotBy.set(ticker, {
      company: row.name,
      price:
        typeof row.price?.current === "number" ? row.price.current : undefined,
      changePct:
        typeof row.price?.changePct === "number"
          ? row.price.changePct
          : undefined,
      volume:
        typeof row.price?.volume === "number" ? row.price.volume : undefined,
    });
  }

  const universe = new Set<string>();
  for (const row of snapshotRows) if (row.symbol) universe.add(row.symbol.toUpperCase());

  const seenEarn = new Set<string>();
  const allEarnings: EarningsPick[] = earningsEvents
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

  const seenRecent = new Set<string>();
  const recentEarnings: RecentEarningsPick[] = recentIntelDocs
    .filter((doc) => {
      const k = doc.ticker?.toUpperCase();
      if (!k || seenRecent.has(k) || !universe.has(k) || doc.market !== market) return false;
      seenRecent.add(k);
      return Boolean(doc.report?.headline?.trim() || doc.report?.summary?.trim());
    })
    .slice(0, 16)
    .map((doc) => ({
      ticker: doc.ticker,
      company: snapshotBy.get(doc.ticker.toUpperCase())?.company ?? doc.ticker,
      eventDate: doc.event_date,
      headline: doc.report?.headline?.trim() || doc.report?.summary?.trim() || `${doc.ticker} earnings report`,
      epsTag: epsTagFromReported(doc.report?.facts?.reported_vs_expected),
    }));

  const recentTickers = new Set(recentEarnings.map((r) => r.ticker.toUpperCase()));
  const earnings = allEarnings.filter((e) => !recentTickers.has(e.ticker.toUpperCase()));

  const reddit: RedditPick[] = redditTickers
    .filter((r) => r.summary?.trim())
    .slice(0, 18)
    .map((r) => {
      const upper = r.ticker?.toUpperCase() ?? "";
      const anomaly = anomalyBy.get(upper);
      const snapshot = snapshotBy.get(upper);
      return {
        ticker: r.ticker,
        sentiment: r.sentiment,
        summary: r.summary,
        mention_count: r.mention_count,
        catalysts: r.catalysts ?? [],
        company: snapshot?.company,
        price: anomaly?.price ?? snapshot?.price,
        changePct: anomaly?.changePct ?? snapshot?.changePct,
        volume: snapshot?.volume,
      };
    });

  const sectors = mapSectors(snapshotRows);
  const items = mapScannerItems(anomalies, buzzBy);

  const gainers = anomalies.filter((a) => a.day_change_pct >= 0).length;
  const losers = anomalies.length - gainers;
  const sortedSectors = [...sectors].sort((a, b) => b.avg - a.avg);
  const lead = sortedSectors[0] ? { label: sortedSectors[0].label, avg: sortedSectors[0].avg } : null;
  const lag =
    sortedSectors.length > 1
      ? { label: sortedSectors[sortedSectors.length - 1].label, avg: sortedSectors[sortedSectors.length - 1].avg }
      : null;
  const bull = redditTickers.filter((r) => r.sentiment === "bullish").length;
  const bear = redditTickers.filter((r) => r.sentiment === "bearish").length;
  const crowd = redditTickers.length === 0 ? null : bull > bear ? "bullish" : bear > bull ? "bearish" : "mixed";

  return {
    items,
    reddit,
    sectors,
    earnings,
    recentEarnings,
    topline: { gainers, losers, lead, lag, crowd },
    premarketItems: premarketDoc ? mapPremarketScannerItems(premarketDoc) : [],
  };
}
