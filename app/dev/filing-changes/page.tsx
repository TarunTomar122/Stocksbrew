import { notFound } from "next/navigation";
import { Suspense } from "react";

import { interTight } from "@/components/oa/font";
import { FilingChanges } from "@/components/stock-report/filing-changes";

export const dynamic = "force-dynamic";

const DEFAULT_TICKERS = ["AMD", "LLY", "ASTS", "APP"];

/**
 * Local preview of the stock page's filing changes section for a few stocks, each in its own Suspense boundary as it
 * will sit on the stock page. ?tickers=AMD,NVDA picks the stocks. Not built in production (app/dev/layout.tsx).
 */
export default async function FilingChangesPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const tickers = (params.tickers ?? "")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker));
  return (
    <main className={`oa-landing ${interTight.variable} min-h-screen min-w-0 bg-oa-page`}>
      <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-6 px-4 py-6 sm:px-6">
        {(tickers.length > 0 ? tickers : DEFAULT_TICKERS).map((ticker) => (
          <section key={ticker} className="flex flex-col gap-2">
            <p className="oa-caption">{ticker}</p>
            <Suspense fallback={null}>
              <FilingChanges ticker={ticker} />
            </Suspense>
          </section>
        ))}
      </div>
    </main>
  );
}
