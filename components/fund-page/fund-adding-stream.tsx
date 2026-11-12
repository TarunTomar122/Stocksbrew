import { FundAdding } from "@/components/fund-page/fund-adding";
import { getSessionUser } from "@/lib/auth-server";
import { readFundRequestState } from "@/lib/funds/on-demand";
import { fundInstrumentId, type FundKind } from "@/lib/funds/tickers";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/** The adding state for a fund we do not cover yet, with where its request stands and whether the reader follows it. */
export async function FundAddingStream({ ticker, kind }: { ticker: string; kind: FundKind }) {
  const [initial, userDoc] = await Promise.all([
    readFundRequestState(ticker),
    getSessionUser()
      .catch(() => null)
      .then((session) => (session ? getUserDoc(session.uid).catch(() => null) : null)),
  ]);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks : [];
  return (
    <FundAdding
      ticker={ticker}
      kind={kind}
      initial={initial}
      isTracked={tracked.includes(fundInstrumentId(ticker))}
      subscribed={resolveIsSubscribed(userDoc)}
    />
  );
}
