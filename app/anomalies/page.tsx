import type { Metadata } from "next";

import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { getRedditCues } from "@/lib/reddit-cues";
import { getCurrentMarket } from "@/lib/market";
import { AnomaliesPageView } from "@/components/anomalies-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Market Anomalies - Unusual Stock Moves Today",
  description:
    "Stocks with the biggest unusual price moves today. See what's surging, what's dropping, and why.",
  alternates: { canonical: "/anomalies" },
  openGraph: {
    title: "Market Anomalies · tikrr",
    description: "Stocks with unusual price moves today - what's surging, what's dropping, and why.",
    url: "https://www.tikrr.online/anomalies",
  },
  twitter: {
    title: "Market Anomalies · tikrr",
    description: "Stocks with unusual price moves today - what's surging, what's dropping, and why.",
  },
};

export default async function AnomaliesPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [data, reddit, userDoc] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getRedditCues(market).catch(() => null),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds = new Set<string>(Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks : []);

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
            anomalies={[...data.anomalies].sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))}
            summary={data.summary}
            generatedAt={data.enriched_at || data.generated_at}
            reddit={reddit}
            isSubscribed={isSubscribed}
            trackedIds={trackedIds}
          />
        )}

        <footer className="text-[11px] text-[#9ca3af]">
          Not investment advice.
        </footer>
      </div>
    </main>
  );
}
