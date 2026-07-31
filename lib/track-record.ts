import { unstable_cache } from "next/cache";
import { getLatestEarningsIntelForInstruments } from "@/lib/earnings-intel";
import { getLatestPrices } from "@/lib/firestore";
import { getMarketEvents } from "@/lib/market-events";
import { getPreEarningsIntelPastForInstruments } from "@/lib/pre-earnings-intel";
import type { LatestPrice } from "@/lib/types";

export type CorrectCall = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  call: string;
  dayChangePct: number | null;
  eventDate: string | null;
};

type CandidateCall = CorrectCall & {
  expectedMove: "rally" | "fade";
};

type PriceHistoryPoint = {
  captured_at?: string;
  quote?: {
    day_change_pct?: number;
    change_pct?: number;
  };
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function eventDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.trim().split("T", 1)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function callLabel(epsOutlook: string | undefined, move: string): string {
  if (move === "rally" && epsOutlook === "beat") {
    return "Called an EPS beat and a rally. Both happened.";
  }
  if (move === "fade" && epsOutlook === "miss") {
    return "Called an EPS miss and a selloff. Both happened.";
  }
  if (move === "rally") {
    return "Called a post-earnings rally. Stock rose that day.";
  }
  if (move === "fade") {
    return "Called a post-earnings fade. Stock fell that day.";
  }
  return "The earnings-day move matched our setup.";
}

function eventDayPctFromIntel(
  doc: { event_date?: string; inputs?: { price_reaction_window?: { event_day_pct?: number } } } | undefined,
  eventDate: string | null,
): number | null {
  if (!doc || !eventDate) return null;
  if (eventDateKey(doc.event_date) !== eventDate) return null;
  const pct = doc.inputs?.price_reaction_window?.event_day_pct;
  return finiteNumber(pct);
}

function eventDayPctFromHistory(
  priceDoc: (LatestPrice & { history_window?: PriceHistoryPoint[] }) | undefined,
  eventDate: string | null,
): number | null {
  if (!priceDoc || !eventDate) return null;
  const latestRow: PriceHistoryPoint = {
    captured_at: priceDoc.captured_at,
    quote: priceDoc.quote,
  };
  const historyRows = priceDoc.history_window ?? [];
  const latestDay = eventDateKey(latestRow.captured_at);
  const newestHistoryDay = historyRows.reduce<string | null>((newest, row) => {
    const day = eventDateKey(row.captured_at);
    return day && (!newest || day > newest) ? day : newest;
  }, null);
  const rows = (
    latestDay && (!newestHistoryDay || latestDay >= newestHistoryDay)
      ? [latestRow, ...historyRows]
      : historyRows
  );
  for (const row of rows) {
    const day = eventDateKey(row.captured_at);
    if (day !== eventDate) continue;
    const quote = row.quote ?? {};
    const pct =
      typeof quote.day_change_pct === "number"
        ? quote.day_change_pct
        : typeof quote.change_pct === "number"
          ? quote.change_pct
          : null;
    const finitePct = finiteNumber(pct);
    if (finitePct != null) return finitePct;
  }
  return null;
}

async function getRecentCorrectCallsUncached(
  market: "US" | "IN" = "US",
): Promise<CorrectCall[]> {
  const data = await getMarketEvents(market).catch(() => null);
  const events = data?.events ?? [];
  const ids = [...new Set(events.map((e) => e.instrument_id).filter(Boolean))];
  if (ids.length === 0) return [];

  const predictions = await getPreEarningsIntelPastForInstruments(market, ids).catch(() => []);
  const candidates: CandidateCall[] = [];

  for (const pred of predictions) {
    const move = pred.report?.call?.post_print_move;
    if (!move || move === "unclear" || move === "chop") continue;
    const event = events.find(
      (e) => e.instrument_id === pred.instrument_id && e.event_date === pred.event_date,
    );
    if (!event) continue;
    candidates.push({
      ticker: event.ticker,
      name: event.name || event.ticker,
      logoUrl: event.logo_url ?? null,
      call: callLabel(pred.report?.call?.eps_outlook, move),
      dayChangePct: null,
      eventDate: eventDateKey(event.event_date),
      expectedMove: move,
    });
  }

  if (candidates.length === 0) return [];

  const instrumentIds = [
    ...new Set(
      candidates
        .map((call) => {
          const event = events.find((e) => e.ticker === call.ticker && eventDateKey(e.event_date) === call.eventDate);
          return event?.instrument_id;
        })
        .filter(Boolean),
    ),
  ] as string[];

  const [intelDocs, prices] = await Promise.all([
    getLatestEarningsIntelForInstruments(market, instrumentIds).catch(() => []),
    getLatestPrices(instrumentIds).catch(() => new Map()),
  ]);

  const intelByInstrument = new Map(intelDocs.map((doc) => [doc.instrument_id, doc]));

  const correct: CorrectCall[] = [];

  for (const call of candidates) {
    const event = events.find(
      (e) => e.ticker === call.ticker && eventDateKey(e.event_date) === call.eventDate,
    );
    if (!event) continue;
    const intel = intelByInstrument.get(event.instrument_id);
    const priceDoc = prices.get(event.instrument_id);
    const eventDayPct =
      eventDayPctFromIntel(intel, call.eventDate) ??
      eventDayPctFromHistory(priceDoc, call.eventDate);
    if (eventDayPct == null) continue;
    const move = eventDayPct > 0 ? "rally" : eventDayPct < 0 ? "fade" : "flat";
    if (call.expectedMove !== move) {
      continue;
    }
    call.dayChangePct = eventDayPct;
    correct.push({
      ticker: call.ticker,
      name: call.name,
      logoUrl: call.logoUrl,
      call: call.call,
      dayChangePct: call.dayChangePct,
      eventDate: call.eventDate,
    });
  }
  correct.sort(
    (a, b) => Math.abs(b.dayChangePct ?? 0) - Math.abs(a.dayChangePct ?? 0),
  );
  return correct.slice(0, 8);
}

export const getRecentCorrectCalls = unstable_cache(
  getRecentCorrectCallsUncached,
  ["recent-correct-calls", "event-day-move"],
  { revalidate: 300 },
);
