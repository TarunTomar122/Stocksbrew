import { EarningsCalendar } from "@/components/earnings-calendar";
import { getCurrentMarket } from "@/lib/market";
import { getSearchIndex } from "@/lib/search";

export async function EarningsCalendarStream() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market).catch(() => []);
  const universeTickers = new Set(searchIndex.map((e) => e.ticker.toUpperCase()));

  return <EarningsCalendar universeTickers={universeTickers} />;
}
