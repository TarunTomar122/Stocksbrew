import { adminFirestore } from "@/lib/firebase-admin";

export interface EarningsEvent {
  ticker: string;
  company: string;
  event_date: string;
  fiscal_date_ending?: string;
  eps_estimate: number | null;
  time: "bmo" | "amc" | "during";
  market: string;
  captured_at: string;
}

export async function getEarnings(
  market = "US",
  startDate?: string,
  endDate?: string,
): Promise<EarningsEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const from = startDate || today;
  const to = endDate || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const snap = await adminFirestore
    .collection("tm_earnings_events")
    .where("market", "==", market)
    .where("event_date", ">=", from)
    .where("event_date", "<=", to)
    .orderBy("event_date")
    .get();

  return snap.docs.map((d) => d.data() as EarningsEvent);
}

/** Next scheduled earnings print for a single ticker (from tm_earnings_events). */
export async function getNextEarningsCalendarEvent(
  market = "US",
  ticker: string,
): Promise<EarningsEvent | null> {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return null;

  const events = await getEarnings(market);
  return events.find((e) => e.ticker?.toUpperCase() === upper) ?? null;
}
