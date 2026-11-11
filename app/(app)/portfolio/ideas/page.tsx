import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppPage, PageHead, SourceLine, fmtDay } from "@/components/oa/kit";
import { IdeasGhost } from "@/components/portfolio-ideas/ghost";
import { IdeasView } from "@/components/portfolio-ideas/ideas-view";
import { XraySignIn } from "@/components/xray/xray-sign-in";
import { getSessionUser } from "@/lib/auth-server";
import { loadExampleIdeas, loadUserIdeas } from "@/lib/portfolio-ideas/server";
import { parseRates } from "@/lib/portfolio-ideas/tax";
import type { TaxRates } from "@/lib/portfolio-ideas/types";
import { getUserDoc } from "@/lib/watchlist";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/ideas");

const LEDE = "Where to sell some or buy more in a lopsided portfolio, the tax on each sale, and losses you could sell to save tax.";

type Search = Record<string, string | string[] | undefined>;

export default async function IdeasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const rates = parseRates(await searchParams);
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/ideas")} />
      <PageHead
        title="Rebalancing and tax-loss ideas"
        crumb={
          <Link href="/watchlist" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        lede={LEDE}
        meta={<SourceLine source="Prices, our calls and fund holdings from SEC filings" />}
      />
      <Suspense fallback={<IdeasGhost />}>
        <IdeasBody rates={rates} />
      </Suspense>
    </AppPage>
  );
}

async function IdeasBody({ rates }: { rates: TaxRates }) {
  const session = await getSessionUser();
  let readFailed = false;
  const userDoc = session
    ? await getUserDoc(session.uid).catch((error) => {
        console.warn("[ideas] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const mine = userDoc
    ? await loadUserIdeas(userDoc, rates).catch((error) => {
        console.warn("[ideas] user ideas failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  if (mine && mine.plan.total > 0) return <IdeasView view={mine} />;

  const example = await loadExampleIdeas(rates).catch((error) => {
    console.warn("[ideas] example failed:", error);
    return null;
  });
  const markedHoldings = (userDoc?.tracked_stocks ?? []).filter((id) => userDoc?.watchlist_positions?.[id] === "holding").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="px-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>
        ) : session && markedHoldings > 0 ? (
          <>
            None of your holdings is a US stock or fund with a share count and a price we can use yet, so this is the example portfolio.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Add share counts in Portfolio
            </Link>{" "}
            to see ideas for yours.
          </>
        ) : session ? (
          <>
            You have no holdings marked yet, so this is the example portfolio.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Mark the stocks you own in Portfolio
            </Link>{" "}
            to see ideas for yours.
          </>
        ) : (
          <>
            This is an example portfolio{example?.pricesAsOf ? ` at the ${fmtDay(example.pricesAsOf)} close` : ""}: the shares and buy days are made up, the prices and our calls are real.{" "}
            <XraySignIn>Sign in to see ideas for yours.</XraySignIn>
          </>
        )}
      </p>
      {example ? (
        <IdeasView view={example} />
      ) : (
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example portfolio could not be loaded right now.</p>
      )}
    </div>
  );
}
