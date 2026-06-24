import { Suspense } from "react";
import type { Metadata } from "next";

import { HeatListView } from "@/components/heat-list";
import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
import { getSessionUser } from "@/lib/auth-server";
import { getDivergenceList, type DivergenceList } from "@/lib/divergence";
import { getHeatList, type HeatList } from "@/lib/heat";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market Heat",
  description:
    "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving, and track names in Radar.",
  alternates: { canonical: "/heat" },
  openGraph: {
    title: "Market Heat - Daily Ranked Stock Setups · stocksbrew",
    description:
      "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving.",
    url: "https://www.stocksbrew.online/heat",
  },
  twitter: {
    title: "Market Heat - Daily Ranked Stock Setups · stocksbrew",
    description:
      "Daily ranked list of stocks getting unusual attention. Scan top setups, understand why they are moving.",
  },
};

function HeatContentFallback() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-40 rounded-[18px] border border-outline-variant bg-surface" />
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
    const [rawHeat, divergenceDoc] = await Promise.all([getHeatList(market), getDivergenceList(market)]);
    data = rawHeat;
    divergence = divergenceDoc;
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
      <FreeToolPageFrame toolHref="/heat">
        <Suspense fallback={<HeatContentFallback />}>
          <HeatContentStream />
        </Suspense>
        <footer className="text-[11px] text-on-surface-variant">Heat score 0-100 · not investment advice.</footer>
      </FreeToolPageFrame>
    </main>
  );
}
