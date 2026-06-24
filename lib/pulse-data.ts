import type { ScannerItem } from "@/components/movers-scanner";
import type { EarningsPick, PulseTopline, RedditPick, SectorCard } from "@/components/pulse-hub";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { buildLandingSectorCards } from "@/lib/landing-sector-data";
import type { PremarketMovers } from "@/lib/premarket";
import type { SnapshotRow } from "@/lib/types";

export type PulsePageData = {
  items: ScannerItem[];
  reddit: RedditPick[];
  sectors: SectorCard[];
  earnings: EarningsPick[];
  topline: PulseTopline;
  premarketItems: ScannerItem[];
};

function mapScannerItems(anomalies: AnomalyItem[], buzzBy: Map<string, string>): ScannerItem[] {
  return anomalies.map((a) => {
    const tag = (a.catalyst || a.move_explanation?.headline || a.visual_summary?.what_changed || "").trim();
    const fallbackWhy = (a.today_brief || a.visual_summary?.why_it_matters || a.thesis || "").trim();
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
  anomalies: AnomalyItem[];
  redditTickers: Array<{
    ticker: string;
    sentiment: string;
    summary: string;
    mention_count?: number;
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
  premarketDoc?: PremarketMovers | null;
}): PulsePageData {
  const { anomalies, redditTickers, snapshotRows, earningsEvents, predBy, premarketDoc } = input;

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
  const earnings: EarningsPick[] = earningsEvents
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
    topline: { gainers, losers, lead, lag, crowd },
    premarketItems: premarketDoc ? mapPremarketScannerItems(premarketDoc) : [],
  };
}
