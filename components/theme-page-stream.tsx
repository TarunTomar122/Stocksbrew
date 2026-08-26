import { getSessionUser } from "@/lib/auth-server";
import { getMarketSnapshot } from "@/lib/firestore";
import { getLiveInvestmentTheme } from "@/lib/research-themes";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  ThemePageView,
  type ThemeCandidateQuote,
} from "@/components/theme-page-view";

function quoteFor(
  ticker: string,
  bySymbol: Map<string, { price: { current: number; changePct?: number } }>,
): Pick<ThemeCandidateQuote, "price" | "changePct"> {
  const snapshot = bySymbol.get(ticker.toUpperCase());
  if (!snapshot) return {};
  return { price: snapshot.price.current, changePct: snapshot.price.changePct };
}

export async function ThemePageStream({ slug }: { slug: string }) {
  const theme = await getLiveInvestmentTheme(slug);
  if (!theme) return null;

  const market = getCurrentMarket();
  const [session, snapshotRows] = await Promise.all([
    getSessionUser(),
    getMarketSnapshot(market).catch(() => []),
  ]);
  const userDoc = session ? await getUserDoc(session.uid) : null;
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks
    : [];
  const bySymbol = new Map(
    snapshotRows.map((row) => [row.symbol.toUpperCase(), row]),
  );
  const withQuotes = (rows: typeof theme.candidates): ThemeCandidateQuote[] =>
    rows.map((candidate) => ({
      ...candidate,
      ...quoteFor(candidate.ticker, bySymbol),
    }));

  return (
    <ThemePageView
      theme={theme}
      candidates={withQuotes(theme.candidates)}
      watchlist={withQuotes(theme.watchlist)}
      isSubscribed={resolveIsSubscribed(userDoc)}
      trackedIds={trackedIds}
      trackedCount={trackedIds.length}
    />
  );
}
