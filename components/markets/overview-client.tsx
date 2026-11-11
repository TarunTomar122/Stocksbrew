"use client";

import { useEffect, useMemo, useState } from "react";

import { setMarketsClock, type MarketsOverview } from "@/lib/markets-shared";

import { unpackMarkets, type PackedMarkets } from "./compact";
import {
  CommoditiesCurrenciesCryptoSection,
  MarketsMovedSection,
  OptionsSection,
  PredictionsSection,
  RatesAndVolatilitySection,
  StocksAndFundsSection,
} from "./overview-sections";
import { MarketTickerStrip } from "./widgets";

/**
 * The cards of /markets under its read, drawn from the data. As server
 * markup every row's classes went to the browser twice (once as HTML, once
 * in the data React reads it from), most of the page's weight; here the
 * data goes once, cut down to what the cards draw (compact.ts), and the
 * markup only as HTML.
 *
 * The page as sent stops after Stocks and funds, the cards in the first
 * screen or two. Rates, commodities, options and the prediction markets
 * are drawn from the same data the moment the browser is idle after load,
 * so they are in place before anyone scrolls to them.
 */
export function MarketsOverviewBody({ packed, overview, builtAt }: { packed: PackedMarkets; overview: MarketsOverview; builtAt: string }) {
  // In the browser only: the as-of words match the cached HTML however long after it was built the page opens.
  if (typeof window !== "undefined") setMarketsClock(builtAt);
  const data = useMemo(() => unpackMarkets(packed), [packed]);
  const [rest, setRest] = useState(false);
  useEffect(() => {
    const draw = () => setRest(true);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(draw, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(draw, 200);
    return () => window.clearTimeout(handle);
  }, []);
  return (
    <>
      <MarketTickerStrip tiles={overview.tiles} />
      <MarketsMovedSection data={data} overview={overview} />
      <StocksAndFundsSection data={data} />
      {rest ? (
        <>
          <RatesAndVolatilitySection data={data} />
          <CommoditiesCurrenciesCryptoSection data={data} />
          <OptionsSection data={data} />
          <PredictionsSection data={data} />
        </>
      ) : null}
    </>
  );
}
