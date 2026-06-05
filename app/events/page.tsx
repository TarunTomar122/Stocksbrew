import type { Metadata } from "next";

import { UpcomingEarningsCallout } from "@/components/upcoming-earnings-callout";
import { getMarketEvents } from "@/lib/market-events";
import { getCurrentMarket } from "@/lib/market";
import { getSessionUser } from "@/lib/auth-server";
import {
  listUpcomingPreEarningsIntel,
  getPreEarningsIntelPastForInstruments,
} from "@/lib/pre-earnings-intel";
import { MarketEventsView } from "@/components/market-events-view";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getPremarketMovers, isPremarketLive } from "@/lib/premarket";
import { getSectorRegimes } from "@/lib/sector-regimes";
import { PremarketSection } from "@/components/premarket-section";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Earnings Reports - Fresh Post-Earnings Analysis",
  description:
    "Fresh post-earnings analysis from stocks that recently reported. See upcoming AI setups on the dedicated page.",
  alternates: { canonical: "/events" },
  openGraph: {
    title: "Earnings Reports · stocksbrew",
    description: "Fresh post-earnings analysis from recently reporting stocks.",
    url: "https://www.stocksbrew.online/events",
  },
  twitter: {
    title: "Earnings Reports · stocksbrew",
    description: "Fresh post-earnings analysis from recently reporting stocks.",
  },
};

export default async function EventsPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session
    ? await getUserDoc(session.uid).catch(() => null)
    : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const [data, upcoming, premarketDoc, regimes] = await Promise.all([
    getMarketEvents(market).catch(() => null),
    listUpcomingPreEarningsIntel(market, 7).catch(() => []),
    getPremarketMovers(market).catch(() => null),
    getSectorRegimes(market).catch(() => ({ sectors: new Map(), macro: null })),
  ]);
  const showPremarket = isPremarketLive(premarketDoc);

  // For events that already reported, check if we had a pre-earnings prediction
  // and whether it was correct, so we can show a "Predicted ✓" badge.
  const reportedEvents = data?.events ?? [];
  const reportedIds = [...new Set(reportedEvents.map((e) => e.instrument_id).filter(Boolean))];
  const pastPredictions = reportedIds.length
    ? await getPreEarningsIntelPastForInstruments(market, reportedIds).catch(() => [])
    : [];

  const predictionHits = new Set<string>();
  for (const pred of pastPredictions) {
    const move = pred.report?.call?.post_print_move;
    if (!move || move === "unclear" || move === "chop") continue;
    const event = reportedEvents.find(
      (e) => e.instrument_id === pred.instrument_id && e.event_date === pred.event_date,
    );
    if (!event) continue;
    const correct =
      (move === "rally" && event.direction === "positive") ||
      (move === "fade" && event.direction === "negative");
    if (correct) predictionHits.add(pred.instrument_id);
  }
  const hasReported = (data?.events.length ?? 0) > 0;
  const isEmpty = !hasReported && upcoming.length === 0;

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        {showPremarket && premarketDoc && (
          <PremarketSection
            movers={premarketDoc}
            marketPhase={regimes.macro?.market_phase}
            marketRisk={regimes.macro?.risk_appetite}
          />
        )}
        {isEmpty ? (
          <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
            <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#111111]">
              Quiet right now
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6b7280]">
              No fresh earnings reports yet. Check back after the next reporting
              wave.
            </p>
          </div>
        ) : hasReported ? (
          <MarketEventsView
            events={data?.events ?? []}
            summary={data?.summary ?? ""}
            generatedAt={data?.generated_at ?? new Date().toISOString()}
            predictionHits={predictionHits}
            afterHeader={
              <UpcomingEarningsCallout
                setupCount={upcoming.length}
                isSubscribed={isSubscribed}
              />
            }
          />
        ) : (
          <UpcomingEarningsCallout
            setupCount={upcoming.length}
            isSubscribed={isSubscribed}
          />
        )}

        <footer className="text-[11px] text-[#9ca3af]">
          Not investment advice.
        </footer>
      </div>
    </main>
  );
}
