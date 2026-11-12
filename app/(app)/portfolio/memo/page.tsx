import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MemoGhost } from "@/components/memo/ghost";
import { MemoHistory } from "@/components/memo/memo-history";
import { MemoLetter } from "@/components/memo/memo-letter";
import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
import { ShareButton } from "@/components/share/share-button";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";
import { loadExampleMemo, loadUserMemo, type MemoPageData } from "@/lib/memo/server";
import { mondayOfKey } from "@/lib/memo/week";
import { newYorkToday } from "@/lib/portfolio-data";
import { getUserDoc } from "@/lib/watchlist";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/memo");

type Search = Record<string, string | string[] | undefined>;

function weekParam(search: Search): string | null {
  const raw = Array.isArray(search.week) ? search.week[0] : search.week;
  return raw && mondayOfKey(raw) ? raw : null;
}

export default async function MemoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const week = weekParam(search);
  const session = await getSessionUser();
  return (
    <AppPage width="dash">
      <JsonLd data={toolPageLd("/portfolio/memo")} />
      <PageHead
        title="Weekly memo"
        crumb={
          <Link href="/portfolio" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Portfolio
          </Link>
        }
        meta={<SourceLine source="Prices, calls, filings and earnings" />}
        actions={session ? <ShareButton kind="memo" week={week} /> : null}
      />
      <Suspense key={week ?? "latest"} fallback={<MemoGhost />}>
        <MemoBody week={week} />
      </Suspense>
    </AppPage>
  );
}

function Layout({ data, plan, note }: { data: MemoPageData; plan: Parameters<typeof MemoLetter>[0]["plan"]; note?: React.ReactNode }) {
  const latestKey = data.history[0]?.weekKey ?? data.memo.weekKey;
  return (
    <div className="flex flex-col gap-3">
      {note}
      {data.missingWeek ? (
        <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">There is no memo for that week, so this is the latest one.</p>
      ) : null}
      <MemoLetter
        memo={data.memo}
        example={data.mode === "example"}
        plan={plan}
        rail={<MemoHistory rows={data.history} current={data.memo.weekKey} latestKey={latestKey} example={data.mode === "example"} />}
      />
    </div>
  );
}

async function MemoBody({ week }: { week: string | null }) {
  const viewer = await getViewer();
  let readFailed = false;
  const userDoc = viewer.uid
    ? await getUserDoc(viewer.uid).catch((error) => {
        console.warn("[memo] user read failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  const mine = userDoc
    ? await loadUserMemo(viewer, userDoc, week).catch((error) => {
        console.warn("[memo] user memo failed:", error);
        readFailed = true;
        return null;
      })
    : null;
  if (mine) return <Layout data={mine} plan={viewer.plan} />;

  const example = await loadExampleMemo(newYorkToday(), week).catch((error) => {
    console.warn("[memo] example failed:", error);
    return null;
  });
  const markedHoldings = (userDoc?.tracked_stocks ?? []).filter((id) => userDoc?.watchlist_positions?.[id] === "holding").length;
  const note = (
    <p className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
      {viewer.signedIn && readFailed ? (
        <>We could not write your memo just now, so this is the example portfolio&apos;s. Try again in a minute.</>
      ) : viewer.signedIn && markedHoldings > 0 ? (
        <>The memo covers US stocks and funds, and none of your holdings is one yet, so this is the example portfolio&apos;s memo.</>
      ) : viewer.signedIn ? (
        <>
          You have no holdings marked yet, so this is the example portfolio&apos;s memo.{" "}
          <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
            Mark the stocks you own in Portfolio
          </Link>{" "}
          and the memo is about yours.
        </>
      ) : (
        <>
          This is the memo for an example portfolio of real stocks and funds with made-up share counts.{" "}
          <Link href="/portfolio" className="font-medium text-oa-primary hover:underline">
            Sign in and add your holdings
          </Link>{" "}
          to get one on yours every week.
        </>
      )}
    </p>
  );
  if (!example) {
    return (
      <div className="flex flex-col gap-3">
        {note}
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example memo could not be written right now.</p>
      </div>
    );
  }
  return <Layout data={example} plan={viewer.plan} note={note} />;
}
