import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
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

type Search = Record<string, string | string[] | undefined>;

export default async function IdeasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const rates = parseRates(await searchParams);
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/ideas")} />
      <PageHead
        title="Rebalancing and tax-loss ideas"
        crumb={
          <Link href="/portfolio" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
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
    <div className="flex flex-col gap-4">
      {/* One line, at most 15 words: why this is the example, and the way to your own. */}
      <p className="px-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>Your holdings did not load, so this is the example. Try again in a minute.</>
        ) : session && markedHoldings > 0 ? (
          <>
            The example portfolio, until your holdings have share counts.{" "}
            <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
              Add share counts
            </Link>
          </>
        ) : session ? (
          <>
            The example portfolio, until you mark what you own.{" "}
            <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
              Mark your stocks
            </Link>
          </>
        ) : (
          <>
            An example portfolio: made-up shares, real prices and calls.{" "}
            <XraySignIn>See ideas for your own stocks.</XraySignIn>
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
