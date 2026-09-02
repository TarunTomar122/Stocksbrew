import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";
import { EARNINGS_RECENT_MAX_DAYS, isEventDateWithinRecentWindow } from "@/lib/earnings-intel";
import { getLatestPriceQuotes } from "@/lib/firestore";
import {
  sortEventsByReportDate,
  type MarketEvent,
  type MarketEventKind,
} from "@/lib/market-events-shared";

export type { MarketEvent, MarketEventKind };
export {
  formatReportSectionLabel,
  groupEventsByReportDate,
  sortEventsByReportDate,
} from "@/lib/market-events-shared";

// Reader for the earnings-only feed written by `build_market_events.py` to
// `tm_market_events/{MARKET}__latest`. Moves and Reddit buzz live elsewhere
// (homepage anomalies / reddit sections, /anomalies).

export type MarketEventsDoc = {
  market: "US" | "IN";
  generated_at: string;
  date: string;
  event_count: number;
  up_count: number;
  down_count: number;
  summary: string;
  events: MarketEvent[];
  counts_by_kind: Record<string, number>;
};

async function attachQuotes(events: MarketEvent[]): Promise<MarketEvent[]> {
  const ids = [...new Set(events.map((e) => e.instrument_id).filter(Boolean))];
  if (ids.length === 0) return events;
  const prices = await getLatestPriceQuotes(ids);
  return events.map((event) => {
    const latest = prices.get(event.instrument_id);
    const quote = latest?.quote;
    if (!quote) return event;
    const price = typeof quote.current === "number" ? quote.current : event.price;
    const dayChange =
      typeof quote.day_change_pct === "number" ? quote.day_change_pct : event.day_change_pct;
    return {
      ...event,
      ...(price != null ? { price } : {}),
      ...(dayChange != null ? { day_change_pct: dayChange } : {}),
    };
  });
}

function earningsOnly(doc: MarketEventsDoc): MarketEventsDoc {
  const events = doc.events.filter(
    (e) =>
      e.kind === "earnings" &&
      Boolean(e.event_date) &&
      isEventDateWithinRecentWindow(String(e.event_date), EARNINGS_RECENT_MAX_DAYS),
  );
  const up = events.filter((e) => e.direction === "positive").length;
  const down = events.filter((e) => e.direction === "negative").length;
  return {
    ...doc,
    events,
    event_count: events.length,
    up_count: up,
    down_count: down,
    counts_by_kind: {
      large_move: 0,
      reddit_buzz: 0,
      earnings: events.length,
    },
    summary:
      events.length > 0
        ? `${events.length} earnings report${events.length === 1 ? "" : "s"} from the last ${EARNINGS_RECENT_MAX_DAYS} days (${up} positive tone, ${down} negative tone).`
        : "No earnings reports from the last 2 weeks right now.",
  };
}

async function getMarketEventsUncached(
  market: "US" | "IN" = "US",
): Promise<MarketEventsDoc | null> {
  const doc = await adminFirestore
    .collection("tm_market_events")
    .doc(`${market}__latest`)
    .get();
  if (!doc.exists) return null;
  const filtered = earningsOnly(doc.data() as MarketEventsDoc);
  const quoted = await attachQuotes(filtered.events);
  const events = sortEventsByReportDate(quoted);
  return { ...filtered, events };
}

export const getMarketEvents = unstable_cache(
  getMarketEventsUncached,
  ["market-events"],
  { revalidate: 120 },
);
