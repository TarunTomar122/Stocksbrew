import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SeasonGhost } from "@/components/earnings-season/ghost";
import { SeasonView } from "@/components/earnings-season/season-view";
import { AppPage, PageHead, SourceLine, fmtDay, fmtStampET } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { loadExampleSeason, loadUserSeason, type SeasonView as SeasonData } from "@/lib/earnings-season-data";
import { getUserDoc } from "@/lib/watchlist";
import { resultSummaries } from "@/lib/results/server";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/earnings");

const LEDE = "Reports coming for your stocks in the next six weeks, and how each moved after past reports. Past moves are history, not a forecast.";
const SOURCE = "Nasdaq earnings calendar, SEC 8-K filings, daily closes";

export default function EarningsSeasonPage() {
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/earnings")} />
      <PageHead
        title="Earnings season"
        crumb={
          <Link href="/watchlist" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        lede={LEDE}
        meta={<SourceLine source={SOURCE} />}
      />
      <Suspense fallback={<SeasonGhost />}>
        <Planner />
      </Suspense>
    </AppPage>
  );
}

function sourceFor(view: SeasonData): string {
  return [
    view.asOf ? `Calendar as of ${fmtStampET(view.asOf)}` : null,
    view.mode === "example" && view.pricesAsOf ? `weights at the ${fmtDay(view.pricesAsOf)} close` : null,
    view.usOnly ? "shares are of your US holdings" : null,
    view.clipped > 0 ? `${view.clipped} more ${view.clipped === 1 ? "stock" : "stocks"} on your list ${view.clipped === 1 ? "is" : "are"} not shown` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function View({ view }: { view: SeasonData }) {
  // Stocks that reported in the last ten days show what they reported (lib/results): cached reads, none on failure.
  const tickers = [...view.season.reporting, ...view.season.later].filter((stock) => !stock.fund).map((stock) => stock.ticker);
  const results = await resultSummaries(tickers, { today: view.season.today }).catch((error) => {
    console.warn("[earnings-season] results read failed:", error instanceof Error ? error.message : error);
    return {};
  });
  return <SeasonView season={view.season} read={view.read} example={view.mode === "example"} source={sourceFor(view)} missing={view.missing} results={results} />;
}

async function Planner() {
  const session = await getSessionUser();
  let readFailed = false;
  const userDoc = session
    ? await getUserDoc(session.uid).catch((error) => {
        console.warn("[earnings-season] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const mine = userDoc
    ? await loadUserSeason(userDoc).catch((error) => {
        console.warn("[earnings-season] user season failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  if (mine) return <View view={mine} />;

  const example = await loadExampleSeason().catch((error) => {
    console.warn("[earnings-season] example failed:", error);
    return null;
  });
  const tracked = (userDoc?.tracked_stocks ?? []).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>We could not load your stocks just now, so this is the example portfolio. Try again in a minute.</>
        ) : session && tracked > 0 ? (
          <>The planner covers US stocks and you do not track any yet, so this is the example portfolio.</>
        ) : session ? (
          <>
            You are not tracking any stocks yet, so this is the example portfolio.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Add the stocks you own or watch in Portfolio
            </Link>{" "}
            to plan your own earnings season.
          </>
        ) : (
          <>
            This is an example portfolio with made-up share counts and real report dates.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Sign in and add your stocks
            </Link>{" "}
            to see the reports coming for yours.
          </>
        )}
      </p>
      {example ? (
        <View view={example} />
      ) : (
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example portfolio could not be loaded right now.</p>
      )}
    </div>
  );
}
