import { Suspense } from "react";
import type { Metadata } from "next";

import { TrumpLogicView } from "@/components/trump-logic-view";
import { getCurrentMarket } from "@/lib/market";
import { getTrumpLogic, type TrumpLogicSnapshot } from "@/lib/trump-logic";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trump Logic",
  description:
    "Ticker index of Trump's Truth Social mentions — which stocks he talked about, sentiment, and move since.",
  alternates: { canonical: "/trump-logic" },
  openGraph: {
    title: "Trump Logic · market briefs",
    description:
      "What Trump said and what it could move — distilled for traders, not a post reader.",
    url: "https://www.stocksbrew.online/trump-logic",
  },
};

function TrumpLogicFallback() {
  return (
    <div className="flex flex-col gap-4 max-w-2xl animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-[#f3f4f6]" />
      <div className="h-4 w-full max-w-lg rounded bg-[#f3f4f6]" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-48 rounded-[20px] border border-[#e5e7eb] bg-white" />
      ))}
    </div>
  );
}

async function TrumpLogicContent() {
  const market = getCurrentMarket();
  let data: TrumpLogicSnapshot | null = null;
  try {
    data = await getTrumpLogic(market);
    if (!data) {
      console.warn("[trump-logic] no snapshot for market", market);
    } else if (data.tickers.length === 0) {
      console.warn("[trump-logic] snapshot loaded but ticker index is empty", {
        scanned: data.posts_scanned,
        mentions: data.posts_with_mentions,
      });
    }
  } catch (err) {
    console.error("[trump-logic] load failed:", err);
  }
  return <TrumpLogicView data={data} />;
}

export default function TrumpLogicPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <Suspense fallback={<TrumpLogicFallback />}>
          <TrumpLogicContent />
        </Suspense>
        <footer className="text-[11px] text-[#9ca3af] max-w-3xl">
          Briefs are AI-distilled from Truth Social. Source links on each card. Not investment advice.
        </footer>
      </div>
    </main>
  );
}
