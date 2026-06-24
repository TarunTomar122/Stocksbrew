import { Suspense } from "react";
import type { Metadata } from "next";

import { FreeToolPageFrame } from "@/components/marketing/free-tool-chrome";
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
    description: "What Trump said and what it could move — distilled for traders, not a post reader.",
    url: "https://www.stocksbrew.online/trump-logic",
  },
};

function TrumpLogicFallback() {
  return (
    <div className="flex max-w-2xl animate-pulse flex-col gap-4">
      <div className="h-10 w-64 rounded-lg bg-surface-container" />
      <div className="h-4 max-w-lg rounded bg-surface-container" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-48 rounded-[20px] border border-outline-variant bg-surface" />
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
  return <TrumpLogicView data={data} hideHeader />;
}

export default function TrumpLogicPage() {
  return (
    <main className="flex-grow">
      <FreeToolPageFrame toolHref="/trump-logic">
        <Suspense fallback={<TrumpLogicFallback />}>
          <TrumpLogicContent />
        </Suspense>
        <footer className="max-w-3xl text-[11px] text-on-surface-variant">
          Briefs are AI-distilled from Truth Social. Source links on each card. Not investment advice.
        </footer>
      </FreeToolPageFrame>
    </main>
  );
}
