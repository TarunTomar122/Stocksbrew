import type { Metadata } from "next";
import Link from "next/link";

import { BacktestWorkbench, type Preset } from "@/components/backtest/backtest-workbench";
import { interTight } from "@/components/oa/font";
import { PageHead, PageNote } from "@/components/oa/kit";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PAGE_FRAME } from "@/components/strategies/shared";
import { getSessionUser } from "@/lib/auth-server";
import { loadPriceSeries } from "@/lib/backtest";
import { earliestBacktestStart, runGatedBacktest, type GatedBacktestResponse } from "@/lib/backtest/gated";
import { can } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { parseSetup, type BacktestSetup } from "@/lib/backtest/setup";
import { getStrategy, listStrategies } from "@/lib/strategies";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "backtest"], "Portfolio backtester for US stocks and funds");

export const metadata: Metadata = {
  title: "Portfolio Backtester for US Stocks and Funds",
  description:
    "Test a mix of US stocks and funds on past prices: growth against a benchmark, worst fall, a year-by-year table and the biases that flatter the result.",
  alternates: { canonical: "/backtest" },
  openGraph: { title: "Portfolio Backtester for US Stocks and Funds · stocksbrew", url: "https://www.stocksbrew.online/backtest", images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

function watchlistHoldings(userDoc: UserDoc | null): { symbol: string; weight: number }[] {
  const tracked = (userDoc?.tracked_stocks ?? []).filter((id) => typeof id === "string" && id.startsWith("US_")).slice(0, 30);
  if (tracked.length === 0) return [];
  const values = tracked.map((id) => Number(userDoc?.watchlist_holdings?.[id]?.market_value) || 0);
  // Use position sizes only when every name has one. Otherwise equal weights, and the page says which.
  const sized = values.every((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return tracked.map((id, index) => ({
    symbol: id.slice(3).replace(/_/g, "."),
    weight: sized ? Math.round((values[index] / total) * 1000) / 10 : Math.round(1000 / tracked.length) / 10,
  }));
}

export default async function BacktestPage({ searchParams }: { searchParams: Query }) {
  const session = await getSessionUser();
  const [strategies, userDoc, spy] = await Promise.all([
    listStrategies().catch(() => []),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
    loadPriceSeries(["SPY"]).catch(() => ({} as Awaited<ReturnType<typeof loadPriceSeries>>)),
  ]);

  let setup: BacktestSetup = parseSetup(searchParams);
  let notice: string | null = null;
  let activePreset = "";
  const strategySlug = typeof searchParams.strategy === "string" ? searchParams.strategy : "";
  const fromWatchlist = searchParams.watchlist === "1";
  const mine = watchlistHoldings(userDoc);

  if (setup.holdings.length === 0 && strategySlug) {
    const strategy = await getStrategy(strategySlug).catch(() => null);
    // Loading a strategy's basket shows what it holds now, which is part of Pro.
    const seesHoldings = can("strategy_holdings", (await getViewer()).plan);
    if (strategy && !seesHoldings) {
      notice = `What ${strategy.name} holds now is part of Pro. Its own backtest is on the strategy page, free.`;
    } else if (strategy && strategy.basket.holdings.length > 0) {
      setup = {
        ...setup,
        holdings: strategy.basket.holdings.map((holding) => ({ symbol: holding.symbol, weight: Math.round(holding.weight * 1000) / 10 })),
        benchmark: strategy.benchmark,
        cost_bps: strategy.cost_bps,
      };
      activePreset = `/backtest?strategy=${strategy.slug}`;
      notice = `This is the basket ${strategy.name} holds today, tested as a fixed mix. It is not the strategy's own backtest: these names were picked with today's data, so running them over the past mostly shows that today's picks did well before they were picked.`;
    } else if (strategy) {
      notice = `${strategy.name} holds cash right now, so there is no basket to load.`;
    }
  } else if (setup.holdings.length === 0 && fromWatchlist) {
    if (mine.length > 0) {
      setup = { ...setup, holdings: mine };
      activePreset = "/backtest?watchlist=1";
      const sized = mine.some((item) => item.weight !== mine[0].weight);
      notice = `Loaded ${mine.length} US stocks from your watchlist${sized ? ", weighted by the position sizes you saved" : " in equal weights"}. You chose these knowing how they have done, so treat the result as a description of the past.`;
    } else {
      notice = session ? "Your watchlist has no US stocks yet." : "Sign in to load your watchlist.";
    }
  }

  const response: GatedBacktestResponse | null = setup.holdings.length > 0 ? await runGatedBacktest(setup) : null;

  const presets: Preset[] = [];
  if (mine.length > 0) presets.push({ href: "/backtest?watchlist=1", label: `My watchlist (${mine.length} stocks)`, group: "Yours" });
  // Today's baskets are part of Pro, so below Pro they are not offered as presets.
  const presetBaskets = can("strategy_holdings", (await getViewer()).plan);
  for (const item of presetBaskets ? strategies : []) {
    if (item.holdings > 0) presets.push({ href: `/backtest?strategy=${item.slug}`, label: `${item.name} (${item.holdings})`, group: "Today's strategy baskets" });
  }

  const dates = spy.SPY?.dates ?? [];
  // The form says how far back it can go; on a limited plan that is the plan's lookback, not ours.
  const earliest = earliestBacktestStart((await getViewer()).plan);
  const firstDate = dates[0] ? (earliest && earliest > dates[0] ? earliest : dates[0]) : null;

  const lede = (
    <>
      Pick tickers and weights, a period and how often to rebalance. The test runs on stored daily closes and comes back with the caveats
      attached. The link in your address bar carries the whole setup, so you can share a run. Looking for rules instead of a fixed mix? See{" "}
      <Link href="/strategies" className="text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary">
        strategies
      </Link>
      .
    </>
  );

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className={PAGE_FRAME}>
        <PageHead note={false} title="Backtest a mix" lede={lede} />
        <BacktestWorkbench
          key={JSON.stringify(setup)}
          initialSetup={setup}
          initialResponse={response}
          presets={presets}
          notice={notice}
          activePreset={activePreset}
          firstDate={firstDate}
          lastDate={dates[dates.length - 1] ?? null}
        />
        <PageNote lede={lede} />
      </div>
    </main>
  );
}
