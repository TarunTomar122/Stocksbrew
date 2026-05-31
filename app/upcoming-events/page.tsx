import type { Metadata } from "next";

import { UpcomingEarningsView } from "@/components/upcoming-earnings-view";
import { getCurrentMarket } from "@/lib/market";
import { getSessionUser } from "@/lib/auth-server";
import { getInstruments, getLatestPrices } from "@/lib/firestore";
import type { PreEarningsCardQuote } from "@/lib/pre-earnings-intel-shared";
import { listUpcomingPreEarningsIntel } from "@/lib/pre-earnings-intel";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Upcoming Earnings Setups | stocksbrew",
  description:
    "AI pre-earnings setups for stocks reporting in the next 7 days. Expected EPS, likely stock move, and what to do.",
  alternates: { canonical: "/upcoming-events" },
  openGraph: {
    title: "Upcoming Earnings Setups · stocksbrew",
    description: "AI-researched pre-earnings setups for stocks reporting soon.",
    url: "https://www.stocksbrew.online/upcoming-events",
  },
};

export default async function UpcomingEventsPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const upcoming = await listUpcomingPreEarningsIntel(market, 7).catch(() => []);

  const instrumentIds = [...new Set(upcoming.map((d) => d.instrument_id).filter(Boolean))];
  const [instruments, prices] = await Promise.all([
    instrumentIds.length ? getInstruments(instrumentIds) : Promise.resolve(new Map()),
    instrumentIds.length ? getLatestPrices(instrumentIds) : Promise.resolve(new Map()),
  ]);

  const namesByTicker = new Map<string, string>();
  const quoteByInstrumentId = new Map<string, PreEarningsCardQuote>();
  for (const id of instrumentIds) {
    const instrument = instruments.get(id);
    const latest = prices.get(id);
    const ticker = String(instrument?.ticker || id.split("_").slice(1).join("_")).toUpperCase();
    namesByTicker.set(ticker, String(instrument?.name || ticker));
    const sector =
      String(instrument?.sector || instrument?.industry || "").trim() || undefined;
    const price = latest?.quote?.current;
    const dayChangePct = latest?.quote?.day_change_pct;
    quoteByInstrumentId.set(id, {
      sector,
      ...(typeof price === "number" && Number.isFinite(price) ? { price } : {}),
      ...(typeof dayChangePct === "number" && Number.isFinite(dayChangePct)
        ? { dayChangePct }
        : {}),
    });
  }

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <UpcomingEarningsView
          upcoming={upcoming}
          namesByTicker={namesByTicker}
          quoteByInstrumentId={quoteByInstrumentId}
          isSubscribed={isSubscribed}
        />
      </div>
    </main>
  );
}
