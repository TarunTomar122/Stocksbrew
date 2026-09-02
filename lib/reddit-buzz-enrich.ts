import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { RedditTicker } from "@/lib/reddit-cues-shared";
import type { SnapshotRow } from "@/lib/types";

type SnapshotQuote = {
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
};

export function buildRedditMarketLookups(anomalies: AnomalyItem[], snapshotRows: SnapshotRow[]) {
  const anomalyBy = new Map<string, { price?: number; changePct?: number }>();
  for (const a of anomalies) {
    if (!a.ticker) continue;
    anomalyBy.set(a.ticker.toUpperCase(), {
      price: typeof a.price === "number" ? a.price : undefined,
      changePct: typeof a.day_change_pct === "number" ? a.day_change_pct : undefined,
    });
  }

  const snapshotBy = new Map<string, SnapshotQuote>();
  for (const row of snapshotRows) {
    const ticker = row.symbol?.toUpperCase();
    if (!ticker) continue;
    snapshotBy.set(ticker, {
      company: row.name,
      price: typeof row.price?.current === "number" ? row.price.current : undefined,
      changePct: typeof row.price?.changePct === "number" ? row.price.changePct : undefined,
      volume: typeof row.price?.volume === "number" ? row.price.volume : undefined,
    });
  }

  return { anomalyBy, snapshotBy };
}

export function enrichRedditTickersWithQuotes(
  items: RedditTicker[],
  anomalies: AnomalyItem[],
  quoteByTicker: Map<string, SnapshotQuote>,
): RedditTicker[] {
  const anomalyBy = new Map<string, { price?: number; changePct?: number }>();
  for (const a of anomalies) {
    if (!a.ticker) continue;
    anomalyBy.set(a.ticker.toUpperCase(), {
      price: typeof a.price === "number" ? a.price : undefined,
      changePct: typeof a.day_change_pct === "number" ? a.day_change_pct : undefined,
    });
  }
  return items.map((item) => enrichRedditTicker(item, anomalyBy, quoteByTicker));
}

export function enrichRedditTicker(
  item: RedditTicker,
  anomalyBy: Map<string, { price?: number; changePct?: number }>,
  snapshotBy: Map<string, SnapshotQuote>,
): RedditTicker {
  const upper = item.ticker.toUpperCase();
  const anomaly = anomalyBy.get(upper);
  const snapshot = snapshotBy.get(upper);
  if (!anomaly && !snapshot) return item;

  return {
    ...item,
    company: snapshot?.company ?? item.company_name ?? item.company,
    price: anomaly?.price ?? snapshot?.price,
    changePct: anomaly?.changePct ?? snapshot?.changePct,
    volume: snapshot?.volume,
  };
}

export function enrichRedditTickers(
  items: RedditTicker[],
  anomalies: AnomalyItem[],
  snapshotRows: SnapshotRow[],
): RedditTicker[] {
  const { anomalyBy, snapshotBy } = buildRedditMarketLookups(anomalies, snapshotRows);
  return items.map((item) => enrichRedditTicker(item, anomalyBy, snapshotBy));
}
