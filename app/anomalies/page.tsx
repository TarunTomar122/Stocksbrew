import type { Metadata } from "next";

import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getCurrentMarket } from "@/lib/market";
import { AnomaliesPageView } from "@/components/anomalies-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Today's Big Moves - Surging and Dropping Stocks",
  description:
    "Stocks with the biggest price moves today. Top gainers, top losers, and a short read on each.",
  alternates: { canonical: "/anomalies" },
  openGraph: {
    title: "Today's big moves · stocksbrew",
    description: "Top gainers, top losers, and what's behind today's biggest stock moves.",
    url: "https://www.stocksbrew.online/anomalies",
  },
  twitter: {
    title: "Today's big moves · stocksbrew",
    description: "Top gainers, top losers, and what's behind today's biggest stock moves.",
  },
};

export default async function AnomaliesPage() {
  const market = getCurrentMarket();
  const [data, session] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getSessionUser(),
  ]);
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const isEmpty = !data || data.anomalies.length === 0;

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">

        {isEmpty ? (
          <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
            <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#111111]">Quiet day</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280] max-w-md mx-auto">
              No significant price moves detected yet. Check back during market hours.
            </p>
          </div>
        ) : (
          <AnomaliesPageView
            anomalies={data.anomalies}
            generatedAt={data.enriched_at || data.generated_at}
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
