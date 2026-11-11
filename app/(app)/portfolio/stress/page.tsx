import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AppPage, PageHead, SourceLine, fmtDay } from "@/components/oa/kit";
import { StressGhost } from "@/components/stress/ghost";
import { StressView } from "@/components/stress/stress-view";
import { getSessionUser } from "@/lib/auth-server";
import { loadExampleStress, loadUserStress, type StressView as StressData } from "@/lib/stress-test-data";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stress test your portfolio",
  description:
    "How your stocks would have done in real market shocks: the Covid crash, the 2022 rate-hike slide, the 2023 bank scare, the 2025 tariff shock and more, each against the S&P 500.",
  alternates: { canonical: "/portfolio/stress" },
};

const LEDE =
  "What today's holdings did in real market shocks of the last decade, from their own daily closes, next to the S&P 500. It is history, not a forecast.";

export default function StressPage() {
  return (
    <AppPage>
      <PageHead
        title="Stress test"
        crumb={
          <Link href="/watchlist" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        lede={LEDE}
        meta={<SourceLine source="Daily closes with dividends, from Yahoo Finance" />}
      />
      <Suspense fallback={<StressGhost />}>
        <StressBody />
      </Suspense>
    </AppPage>
  );
}

function View({ view }: { view: StressData }) {
  return (
    <StressView result={view.result} read={view.read} example={view.mode === "example"} historyFirst={view.history.first} />
  );
}

async function StressBody() {
  const session = await getSessionUser();
  let readFailed = false;
  const userDoc = session
    ? await getUserDoc(session.uid).catch((error) => {
        console.warn("[stress] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const mine = userDoc
    ? await loadUserStress(userDoc).catch((error) => {
        console.warn("[stress] user stress failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  if (mine) return <View view={mine} />;

  const example = await loadExampleStress().catch((error) => {
    console.warn("[stress] example failed:", error);
    return null;
  });
  const markedHoldings = (userDoc?.tracked_stocks ?? []).filter((id) => userDoc?.watchlist_positions?.[id] === "holding").length;
  return (
    <div className="flex flex-col gap-3">
      <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
        {session && readFailed ? (
          <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>
        ) : session && markedHoldings > 0 ? (
          <>The stress test covers US stocks and funds, and none of your holdings is one yet, so this is the example portfolio.</>
        ) : session ? (
          <>
            You have no holdings marked yet, so this is the example portfolio.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Mark the stocks you own in Portfolio
            </Link>{" "}
            to test your own.
          </>
        ) : (
          <>
            This is an example portfolio{example?.pricesAsOf ? `, weighted at the ${fmtDay(example.pricesAsOf)} close` : ""}.{" "}
            <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
              Sign in and add your holdings
            </Link>{" "}
            to stress test your own.
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
