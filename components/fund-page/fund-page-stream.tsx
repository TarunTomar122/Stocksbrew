import { FundOverlapPanel, FundReport } from "@/components/fund-page/fund-report";
import { StockViewTracker } from "@/components/stock-view-tracker";
import { getSessionUser } from "@/lib/auth-server";
import { directHoldings, loadFundOverlap, loadFundPage } from "@/lib/funds/page";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/** Signed in only: the overlap needs the reader's own holdings, so it streams in after the rest. */
async function OverlapStream({ ticker, direct }: { ticker: string; direct: string[] }) {
  const overlap = await loadFundOverlap(ticker, direct).catch(() => null);
  return <FundOverlapPanel ticker={ticker} overlap={overlap} />;
}

export async function FundPageStream({ ticker, name }: { ticker: string; name: string }) {
  const sessionPromise = getSessionUser().catch(() => null);
  const userDocPromise = sessionPromise.then((session) => (session ? getUserDoc(session.uid).catch(() => null) : null));
  const [data, userDoc] = await Promise.all([loadFundPage(ticker, name), userDocPromise]);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string") : [];
  const direct = directHoldings(userDoc).filter((held) => held !== data.ticker);
  return (
    <>
      <StockViewTracker ticker={data.ticker} instrumentId={data.instrumentId} market="US" />
      <FundReport
        data={data}
        nowIso={new Date().toISOString()}
        isTracked={tracked.includes(data.instrumentId)}
        subscribed={resolveIsSubscribed(userDoc)}
        overlap={direct.length && data.holdings.inside.top.length ? <OverlapStream ticker={data.ticker} direct={direct} /> : null}
      />
    </>
  );
}
