import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { GoalGhost } from "@/components/goal/ghost";
import { GoalPlanner } from "@/components/goal/planner";
import { AppPage, PageHead, SourceLine, fmtDay } from "@/components/oa/kit";
import { getSessionUser } from "@/lib/auth-server";
import { loadExampleGoal, loadUserGoal, type GoalData } from "@/lib/goal/data";
import { readInputs } from "@/lib/goal/inputs";
import { getUserDoc } from "@/lib/watchlist";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/goal");

const LEDE = "Thousands of replays of past returns since 2014.";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function GoalPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/goal")} />
      <PageHead
        title="Goal planner"
        crumb={
          <Link href="/portfolio" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        lede={LEDE}
        meta={<SourceLine source="Daily closes with dividends, from Yahoo Finance" />}
      />
      <Suspense fallback={<GoalGhost />}>
        <GoalBody searchParams={searchParams} />
      </Suspense>
    </AppPage>
  );
}

/** The start the planner offers: the holdings' value to the nearest $100, or $0 when we cannot value them. */
function startOf(data: GoalData): number {
  return data.portfolioValue !== null ? Math.round(data.portfolioValue / 100) * 100 : 0;
}

function Planner({ data, searchParams }: { data: GoalData; searchParams: SearchParams }) {
  const start = startOf(data);
  const haveOwn = data.mixes.some((mix) => mix.id === "own");
  const initial = readInputs(searchParams, start, haveOwn);
  return <GoalPlanner data={data} initial={initial} portfolioStart={start} thisYear={new Date().getFullYear()} />;
}

async function GoalBody({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSessionUser();
  let readFailed = false;
  const userDoc = session
    ? await getUserDoc(session.uid).catch((error) => {
        console.warn("[goal] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const mine = userDoc
    ? await loadUserGoal(userDoc).catch((error) => {
        console.warn("[goal] user plan failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  if (mine && mine.mixes.some((mix) => mix.id === "own")) return <Planner data={mine} searchParams={searchParams} />;

  const example = await loadExampleGoal().catch((error) => {
    console.warn("[goal] example failed:", error);
    return null;
  });
  const markedHoldings = (userDoc?.tracked_stocks ?? []).filter((id) => userDoc?.watchlist_positions?.[id] === "holding").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>
        ) : session && markedHoldings > 0 ? (
          <>The planner needs stored prices for US stocks and funds, and we have none for your holdings, so this is the example portfolio.</>
        ) : session ? (
          <>
            You have no holdings marked yet, so this is the example portfolio.{" "}
            <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
              Mark the stocks you own in Portfolio
            </Link>{" "}
            to plan with your own.
          </>
        ) : (
          <>
            This is an example portfolio with made-up share counts{example?.pricesAsOf ? `, valued at prices from ${fmtDay(example.pricesAsOf)}` : ""}.{" "}
            <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
              Sign in and add your holdings
            </Link>{" "}
            to plan with your own.
          </>
        )}
      </p>
      {example ? (
        <Planner data={example} searchParams={searchParams} />
      ) : (
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example portfolio could not be loaded right now.</p>
      )}
    </div>
  );
}
