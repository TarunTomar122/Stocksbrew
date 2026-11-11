import type { Metadata } from "next";
import { closeWords } from "@/lib/benchmark-day";
import Link from "next/link";
import { Suspense } from "react";

import { DividendsGhost } from "@/components/dividends/ghost";
import { DividendIdeasSection } from "@/components/dividends/ideas";
import { MonthChart } from "@/components/dividends/month-chart";
import { StockList } from "@/components/dividends/stock-list";
import { AppPage, PageHead, SourceLine, fmtDay, fmtStampET } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { ShareButton } from "@/components/share/share-button";
import { getSessionUser } from "@/lib/auth-server";
import { buildDividendRead } from "@/lib/dividend-plan";
import { exampleSeeds, holdingSeeds, loadDividendPlan, type HoldingSeed } from "@/lib/dividend-plan-data";
import { getUserDoc } from "@/lib/watchlist";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/dividends");

const LEDE = "What your holdings should pay over the next twelve months, with announced dividends kept apart from estimates.";

export default async function DividendsPage() {
  const session = await getSessionUser();
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/dividends")} />
      <PageHead
        title="Dividends"
        crumb={
          <Link href="/portfolio?tab=holdings" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        lede={LEDE}
        meta={<SourceLine source="Yahoo Finance and Nasdaq" />}
        actions={session ? <ShareButton kind="dividends" /> : null}
      />
      <Suspense fallback={<DividendsGhost />}>
        <Planner />
      </Suspense>
    </AppPage>
  );
}

async function Planner() {
  const session = await getSessionUser();
  let readFailed = false;
  const userDoc = session
    ? await getUserDoc(session.uid).catch((error) => {
        console.warn("[dividends] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const own = userDoc ? holdingSeeds(userDoc) : [];
  // Holdings outside the US are marked but have no dividend records here.
  const markedHoldings = (userDoc?.tracked_stocks ?? []).filter((id) => userDoc?.watchlist_positions?.[id] === "holding").length;

  if (own.length > 0) return <Plan seeds={own} example={false} />;

  const example = await exampleSeeds();
  return (
    <div className="flex flex-col gap-3">
      <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>
        ) : session && markedHoldings > 0 ? (
          <>The dividend planner covers US stocks, and none of your holdings is one yet, so this is an example portfolio.</>
        ) : session ? (
          <>
            You have no holdings marked yet, so this is an example portfolio.{" "}
            <Link href="/portfolio?tab=holdings" className="font-medium text-oa-primary hover:underline">
              Mark the stocks you own in Portfolio
            </Link>{" "}
            and add your share counts to plan your own dividends.
          </>
        ) : (
          <>
            This is an example portfolio with made-up share counts and real dividends.{" "}
            <Link href="/portfolio?tab=holdings" className="font-medium text-oa-primary hover:underline">
              Sign in and add your holdings
            </Link>{" "}
            to see what yours will pay.
          </>
        )}
      </p>
      {example && example.length > 0 ? (
        <Plan seeds={example} example />
      ) : (
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example portfolio could not be loaded right now.</p>
      )}
    </div>
  );
}

async function Plan({ seeds, example }: { seeds: HoldingSeed[]; example: boolean }) {
  const { plan, pricesAsOf, calendarOk } = await loadDividendPlan(seeds);
  const read = buildDividendRead(plan, { example, editHref: "/portfolio?tab=holdings" });
  const asOf = [plan.asOf ? `dividends as of ${fmtStampET(plan.asOf)}` : null, pricesAsOf ? `prices from ${closeWords(pricesAsOf, fmtDay(pricesAsOf))}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-3">
      <TheRead read={read ? { ...read, source: asOf || undefined } : null} label={example ? "The example's dividends" : "Your dividends"} askContext={example ? "ex.portfolio" : "portfolio"} />
      {!calendarOk ? (
        <p className="px-2 text-[13px] text-signal-bearish sm:px-0">
          The dividend calendar could not be read just now, so announced payments may be shown as estimates.
        </p>
      ) : null}
      {plan.total > 0 ? <MonthChart months={plan.months} /> : null}
      <Suspense fallback={null}>
        <DividendIdeasSection plan={plan} example={example} />
      </Suspense>
      <StockList stocks={plan.stocks} example={example} />
    </div>
  );
}
