import type { Metadata } from "next";

import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
import { NoFundsNote, ExampleNote, XrayEmpty, XrayView } from "@/components/xray/xray-view";
import { ShareButton } from "@/components/share/share-button";
import { getSessionUser } from "@/lib/auth-server";
import { pricesWords } from "@/lib/portfolio-prices";
import { getUserDoc } from "@/lib/watchlist";
import { xrayFootnote } from "@/lib/xray";
import { loadExampleXray, loadUserXray, type XrayView as XrayData } from "@/lib/xray-data";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/xray");

function Source({ view }: { view: XrayData }) {
  return (
    <SourceLine
      source={xrayFootnote(view.xray)}
      note={view.mode === "example" && view.pricesAsOf ? `prices from ${pricesWords(view.pricesAsOf)}` : "latest prices"}
    />
  );
}

/** Why a signed-in person sees the example: no holdings, holdings without share counts, or no funds among them. */
function emptyReason(mine: XrayData | null): "no-holdings" | "no-funds" | "no-values" {
  if (!mine) return "no-holdings";
  if (mine.xray.total <= 0) return mine.xray.unvalued.length > 0 ? "no-values" : "no-holdings";
  return "no-funds";
}

export default async function XrayPage() {
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const mine = userDoc ? await loadUserXray(userDoc).catch(() => null) : null;
  const hasFunds = Boolean(mine && mine.xray.funds.length > 0 && mine.xray.total > 0);

  // Someone signed in with priced holdings sees their own page, funds or not: with no funds it still shows
  // their biggest companies and sectors against the S&P 500, and says plainly that nothing is hidden in funds.
  if (mine && mine.xray.total > 0) {
    return (
      <AppPage>
        <JsonLd data={toolPageLd("/portfolio/xray")} />
        <PageHead title="What you really own" meta={<Source view={mine} />} actions={hasFunds ? <ShareButton kind="xray" /> : undefined} />
        <div className="flex flex-col gap-3">
          {hasFunds ? null : <NoFundsNote coveredFunds={mine.coveredFunds ?? []} />}
          <XrayView xray={mine.xray} read={mine.read} example={false} />
        </div>
      </AppPage>
    );
  }

  const example = await loadExampleXray().catch(() => null);
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio/xray")} />
      <PageHead
        title="What you really own"
        lede="Your funds hold companies too. This adds them to the stocks you bought, from each fund's own SEC filing."
        meta={example ? <Source view={example} /> : undefined}
      />
      <div className="flex flex-col gap-3">
        {session ? <XrayEmpty reason={emptyReason(mine)} coveredFunds={(mine ?? example)?.coveredFunds ?? []} /> : null}
        {example ? (
          <>
            <ExampleNote pricesWords={pricesWords(example.pricesAsOf)} signedIn={Boolean(session)} />
            <XrayView xray={example.xray} read={example.read} example />
          </>
        ) : (
          <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">The example portfolio is not available right now.</p>
        )}
      </div>
    </AppPage>
  );
}
