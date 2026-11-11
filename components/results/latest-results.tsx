import { todayET } from "@/lib/calendar-shared";
import { shortCompanyName } from "@/lib/plain-copy";
import { latestResultFor } from "@/lib/results/server";

import { ResultsBlock } from "./results-block";

/**
 * "Latest results" on the stock page, for RESULTS_DAYS days after a report. Streams in its own Suspense: the shared
 * cached list of recent reports, then (only for a stock that reported) one cached read. Renders nothing otherwise,
 * so the page is unchanged for most stocks.
 */
export async function LatestResults({ ticker, name, call }: { ticker: string; name: string; call: string | null }) {
  const today = todayET();
  const read = await latestResultFor(ticker, today).catch((error) => {
    console.warn(`[results] ${ticker} latest read failed:`, error instanceof Error ? error.message : error);
    return null;
  });
  if (!read) return null;
  return <ResultsBlock read={read} name={shortCompanyName(name) || read.ticker} call={call} today={today} />;
}
