import { getLatestPrices } from "@/lib/firestore";
import { buildPriceHistorySeries } from "@/lib/price-history-series";
import type { LatestPrice } from "@/lib/types";
import type {
  TrumpLogicMention,
  TrumpLogicSnapshot,
  TrumpLogicTickerMove,
} from "@/lib/trump-logic-types";

function mentionDay(iso?: string): string | null {
  if (!iso) return null;
  const day = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function changeSinceMention(
  doc: LatestPrice | undefined,
  publishedAt?: string,
): TrumpLogicTickerMove | null {
  if (!doc?.ticker) return null;
  const day = mentionDay(publishedAt);
  if (!day) {
    return {
      ticker: doc.ticker.toUpperCase(),
      change_since_pct: null,
      mention_price_date: null,
      current_price: typeof doc.quote?.current === "number" ? doc.quote.current : null,
    };
  }

  const series = buildPriceHistorySeries(doc);
  if (series.length === 0) {
    return {
      ticker: doc.ticker.toUpperCase(),
      change_since_pct: null,
      mention_price_date: null,
      current_price: typeof doc.quote?.current === "number" ? doc.quote.current : null,
    };
  }

  const exact = series.find((row) => row.date === day);
  const baseline = exact ?? series.find((row) => row.date >= day);
  const current = series[series.length - 1];

  if (!baseline || !current || baseline.close <= 0) {
    return {
      ticker: doc.ticker.toUpperCase(),
      change_since_pct: null,
      mention_price_date: baseline?.date ?? null,
      current_price: current?.close ?? null,
    };
  }

  const pct = ((current.close - baseline.close) / baseline.close) * 100;
  return {
    ticker: doc.ticker.toUpperCase(),
    change_since_pct: Math.round(pct * 100) / 100,
    mention_price_date: baseline.date,
    current_price: current.close,
  };
}

export async function attachSinceMentionMoves(
  snapshot: TrumpLogicSnapshot,
): Promise<TrumpLogicSnapshot> {
  const market = snapshot.market === "IN" ? "IN" : "US";
  const tickers = [...new Set(snapshot.tickers.map((row) => row.ticker.toUpperCase()))];
  if (tickers.length === 0) return snapshot;

  const instrumentIds = tickers.map((ticker) => `${market}_${ticker}`);
  const prices = await getLatestPrices(instrumentIds);

  const enrichMention = (mention: TrumpLogicMention, ticker: string): TrumpLogicMention => {
    const doc = prices.get(`${market}_${ticker}`);
    const move = changeSinceMention(doc, mention.published_at);
    return {
      ...mention,
      ticker_moves: move ? [move] : mention.ticker_moves,
    };
  };

  const tickerRows = snapshot.tickers.map((row) => {
    const mentions = row.mentions.map((mention) => enrichMention(mention, row.ticker));
    const latestMove = changeSinceMention(
      prices.get(`${market}_${row.ticker}`),
      row.latest_published_at,
    );
    return {
      ...row,
      mentions,
      latest_change_since_pct: latestMove?.change_since_pct ?? null,
    };
  });

  const mentions = snapshot.mentions.map((mention) => {
    const primary = mention.tickers[0];
    if (!primary) return mention;
    return enrichMention(mention, primary);
  });

  return { ...snapshot, tickers: tickerRows, mentions };
}
