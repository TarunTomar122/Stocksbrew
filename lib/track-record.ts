import { unstable_cache } from "next/cache";
import { getMarketEvents } from "@/lib/market-events";
import { getPreEarningsIntelPastForInstruments } from "@/lib/pre-earnings-intel";

export type CorrectCall = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  call: string;
  dayChangePct: number | null;
  eventDate: string | null;
};

function callLabel(epsOutlook: string | undefined, move: string): string {
  if (move === "rally" && epsOutlook === "beat") return "Predicted the beat — stock rose";
  if (move === "fade" && epsOutlook === "miss") return "Predicted the miss — stock fell";
  if (move === "rally") return "Predicted the rally — correct";
  if (move === "fade") return "Predicted the drop — correct";
  return "The move matched our setup";
}

async function getRecentCorrectCallsUncached(
  market: "US" | "IN" = "US",
): Promise<CorrectCall[]> {
  const data = await getMarketEvents(market).catch(() => null);
  const events = data?.events ?? [];
  const ids = [...new Set(events.map((e) => e.instrument_id).filter(Boolean))];
  if (ids.length === 0) return [];

  const predictions = await getPreEarningsIntelPastForInstruments(market, ids).catch(() => []);
  const correct: CorrectCall[] = [];

  for (const pred of predictions) {
    const move = pred.report?.call?.post_print_move;
    if (!move || move === "unclear" || move === "chop") continue;
    const event = events.find(
      (e) => e.instrument_id === pred.instrument_id && e.event_date === pred.event_date,
    );
    if (!event) continue;
    const isCorrect =
      (move === "rally" && event.direction === "positive") ||
      (move === "fade" && event.direction === "negative");
    if (!isCorrect) continue;
    correct.push({
      ticker: event.ticker,
      name: event.name || event.ticker,
      logoUrl: event.logo_url ?? null,
      call: callLabel(pred.report?.call?.eps_outlook, move),
      dayChangePct: typeof event.day_change_pct === "number" ? event.day_change_pct : null,
      eventDate: event.event_date ?? null,
    });
  }

  // Strongest moves first so the proof bar leads with the most striking calls.
  correct.sort((a, b) => Math.abs(b.dayChangePct ?? 0) - Math.abs(a.dayChangePct ?? 0));
  return correct.slice(0, 8);
}

export const getRecentCorrectCalls = unstable_cache(
  getRecentCorrectCallsUncached,
  ["recent-correct-calls"],
  { revalidate: 300 },
);
