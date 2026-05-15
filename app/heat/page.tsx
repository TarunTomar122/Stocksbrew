import { Suspense } from "react";
import { getCurrentMarket } from "@/lib/market";
import { getHeatList, type HeatList } from "@/lib/heat";
import { getDivergenceList, type DivergenceList } from "@/lib/divergence";
import { HeatListView } from "@/components/heat-list";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market Heat",
  description:
    "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving, and track names in Radar.",
  alternates: { canonical: "/heat" },
  openGraph: {
    title: "Market Heat — Daily Ranked Stock Setups · Tikrr",
    description: "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving.",
    url: "https://www.tikrr.online/heat",
  },
  twitter: {
    title: "Market Heat — Daily Ranked Stock Setups · Tikrr",
    description: "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving.",
  },
};

function HeatContentFallback() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-40 rounded-[18px] border border-[#e5e7eb] bg-white" />
      ))}
    </div>
  );
}

async function HeatContentStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds: string[] = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];

  let data: HeatList | null = null;
  let divergence: DivergenceList | null = null;
  try {
    [data, divergence] = await Promise.all([
      getHeatList(market),
      getDivergenceList(market),
    ]);
  } catch (err) {
    console.error("[heat] load failed:", err);
  }

  return (
    <HeatListView
      data={data}
      divergence={divergence}
      trackedIds={trackedIds}
      isSubscribed={isSubscribed}
    />
  );
}

export default function HeatPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <Suspense fallback={<HeatContentFallback />}>
          <HeatContentStream />
        </Suspense>

        <footer className="text-[11px] text-[#9ca3af]">
          Heat score 0-100 · not investment advice.
        </footer>
      </div>
    </main>
  );
}
