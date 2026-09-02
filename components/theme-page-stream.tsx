import { getSessionUser } from "@/lib/auth-server";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getLiveInvestmentTheme } from "@/lib/research-themes";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  ThemePageView,
  type ThemeCandidateQuote,
} from "@/components/theme-page-view";

function quoteFor(
  ticker: string,
  bySymbol: Map<string, { current?: number; changePct?: number }>,
): Pick<ThemeCandidateQuote, "price" | "changePct"> {
  const snapshot = bySymbol.get(ticker.toUpperCase());
  return typeof snapshot?.current === "number"
    ? { price: snapshot.current, changePct: snapshot.changePct }
    : {};
}

export async function ThemePageStream({ slug }: { slug: string }) {
  const theme = await getLiveInvestmentTheme(slug);
  if (!theme) return null;

  const market = getCurrentMarket();
  const themeTickers = [...theme.candidates, ...theme.watchlist].map((row) => row.ticker);
  const instrumentIds = [...new Set(themeTickers.map((ticker) => `${market}_${ticker.toUpperCase()}`))];
  const session = await getSessionUser();
  const userDocPromise = session ? getUserDoc(session.uid) : Promise.resolve(null);
  const [prices, userDoc] = await Promise.all([
    getLatestPriceQuotes(instrumentIds).catch(() => new Map()),
    userDocPromise,
  ]);
  const trackedIds = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks
    : [];
  const bySymbol = new Map(
    [...prices.entries()].map(([id, row]) => [
      row.ticker?.toUpperCase() ?? id.split("_").slice(1).join("_"),
      { current: row.quote?.current, changePct: row.quote?.day_change_pct },
    ]),
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
