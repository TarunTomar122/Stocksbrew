import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EquityChart } from "@/components/backtest/equity-chart";
import { longDay, plainPct, signedPct, toneOf, yearsWords } from "@/components/backtest/format";
import { CaveatLine, Panel, ResultLead, StatGrid, YearTable } from "@/components/backtest/results";
import { TheRead } from "@/components/oa/insight";
import { interTight } from "@/components/oa/font";
import { PageHead, PageNote } from "@/components/oa/kit";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { StockLogo } from "@/components/stock-logo";
import { PAGE_FRAME, RiskTag } from "@/components/strategies/shared";
import { TrackStrategyButton } from "@/components/strategies/track-button";
import { LockCard } from "@/components/oa/gate";
import { getSessionUser } from "@/lib/auth-server";
import { setupHref } from "@/lib/backtest/setup";
import { can } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getScreenerRows } from "@/lib/screener";
import { getStrategy, readTrackedStrategies } from "@/lib/strategies";
import { buildStrategyRead, type YtdMap } from "@/lib/strategies-insights";
import { getUserDoc } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const strategy = await getStrategy(params.slug).catch(() => null);
  if (!strategy) return { title: "Strategy not found" };
  const title = `${strategy.name}: rules and backtest`;
  const description = `${strategy.tagline} The rules in plain words and a labelled backtest against the S&P 500.`;
  // The card: the rule, then the backtest and the live record, each with its period.
  const shareImage = ogImage(["strategy", strategy.slug], `${strategy.name}: the rule, the backtest and the live record`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: `/strategies/${strategy.slug}` },
    openGraph: { title: `${title} · stocksbrew`, description, url: `https://www.stocksbrew.online/strategies/${strategy.slug}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function StrategyPage({ params }: { params: { slug: string } }) {
  const [strategy, session] = await Promise.all([getStrategy(params.slug).catch(() => null), getSessionUser()]);
  if (!strategy) notFound();
  const [userDoc, viewer] = await Promise.all([session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null), getViewer()]);
  const isTracked = readTrackedStrategies(userDoc).some((entry) => entry.slug === strategy.slug);
  // What the rules hold now is the part worth paying for: anyone could copy it. The rules, the backtest and
  // rebalances older than six months stay open. Locked names are never rendered, so they never reach the browser.
  const seesHoldings = can("strategy_holdings", viewer.plan);
  const recentCutoff = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);

  const test = strategy.backtest;
  const basket = strategy.basket;
  const live = strategy.live;
  const stocks = strategy.universe.kind === "stocks";
  const backtesterHref =
    seesHoldings && basket.holdings.length > 0
      ? setupHref({
          holdings: basket.holdings.map((holding) => ({ symbol: holding.symbol, weight: Math.round(holding.weight * 1000) / 10 })),
          start: null,
          end: null,
          rebalance: "monthly",
          benchmark: strategy.benchmark,
          cost_bps: strategy.cost_bps,
        })
      : "/backtest";

  // This year's returns of today's holdings name what is carrying the basket; only for plans that see the names.
  const ytd: YtdMap = {};
  if (seesHoldings && stocks && basket.holdings.length > 0) {
    const rows = await getScreenerRows(basket.holdings.map((holding) => holding.symbol)).catch(() => new Map());
    for (const [symbol, row] of rows) ytd[symbol] = row.ret_ytd;
  }
  const read = buildStrategyRead(strategy, { seesHoldings: seesHoldings && stocks, ytd });

  const headlineReturn = test ? test.strategy.annualized_return ?? test.strategy.total_return : null;
  const benchReturn = test ? test.benchmark.annualized_return ?? test.benchmark.total_return : null;

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className={PAGE_FRAME}>
        <PageHead
          note={false}
          crumb={<Link href="/strategies">Strategies</Link>}
          title={strategy.name}
          lede={strategy.tagline}
          actions={
            <>
              <span className="max-sm:hidden">
                <TrackStrategyButton slug={strategy.slug} initialTracked={isTracked} canFollow={can("followed_strategies", viewer.plan)} />
              </span>
              <Link
                href={backtesterHref}
                className="hidden h-9 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-oa-accent sm:inline-flex"
              >
                Open in backtester
              </Link>
            </>
          }
        />

        <TheRead read={read} className="mb-4" />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {test ? (
              <>
                {/* The lead: three numbers, then the curve they come from. */}
                <ResultLead
                  perYear={test.strategy.annualized_return !== null}
                  years={yearsWords(test.period.years)}
                  ret={headlineReturn}
                  benchRet={benchReturn}
                  benchmarkLabel="S&P 500"
                  worstFall={test.strategy.max_drawdown}
                  start={test.period.start}
                  end={test.period.end}
                >
                  <div className="border-t border-oa-border px-4 py-3">
                    <EquityChart curve={test.curve} strategyLabel={strategy.name} benchmarkLabel="S&P 500 fund (SPY)" />
                  </div>
                  {/* Phone: the actions sit under the result, so the numbers come first. */}
                  <div className="flex flex-wrap items-start gap-2 border-t border-oa-border px-4 py-3 sm:hidden">
                    <TrackStrategyButton slug={strategy.slug} initialTracked={isTracked} canFollow={can("followed_strategies", viewer.plan)} />
                    <Link href={backtesterHref} className="inline-flex h-10 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg">
                      Open in backtester
                    </Link>
                  </div>
                </ResultLead>
                <StatGrid
                  headline={false}
                  strategy={test.strategy}
                  benchmark={test.benchmark}
                  benchmarkLabel="SPY"
                  worstYear={test.worst_year}
                  bestYear={test.best_year}
                  hitRate={test.hit_rate}
                  turnover={test.turnover.annual}
                />
              </>
            ) : (
              <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4">
                <h2 className="oa-label">No backtest</h2>
                <p className="mt-1 max-w-[70ch] text-[14px] leading-[22px] text-oa-muted-fg">
                  These rules read company financials. We only hold today&apos;s figures, so running the rules over the past would use numbers nobody
                  had at the time. We would rather show nothing than a test that cheats.
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-2 sm:hidden">
                  <TrackStrategyButton slug={strategy.slug} initialTracked={isTracked} canFollow={can("followed_strategies", viewer.plan)} />
                  <Link href={backtesterHref} className="inline-flex h-10 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg">
                    Open in backtester
                  </Link>
                </div>
              </section>
            )}

            <Panel
              id="basket"
              title={`Basket held now · ${basket.holdings.length} ${stocks ? "stocks" : basket.holdings.length === 1 ? "fund" : "funds"}`}
              aside={`chosen at the close on ${longDay(basket.as_of)}`}
            >
              {!seesHoldings ? (
                <div className="p-3">
                  <LockCard feature="strategy_holdings" plan={viewer.plan} trialEligible={viewer.trialEligible} />
                </div>
              ) : null}
              {seesHoldings && basket.note ? <p className="border-b border-oa-border bg-oa-bg px-3.5 py-2.5 text-[13.5px] leading-5 text-oa-fg">{basket.note}</p> : null}
              {!seesHoldings ? null : basket.holdings.length > 0 ? (
                <ul className="divide-y divide-oa-border">
                  {basket.holdings.map((holding) => (
                    <li key={holding.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3.5 py-2 hover:bg-oa-accent sm:grid-cols-[5.25rem_minmax(0,10rem)_minmax(0,1fr)_3rem] sm:items-baseline">
                      <span className="oa-mono text-[14px] font-medium text-oa-fg sm:order-1">
                        {stocks ? (
                          <Link href={`/stock/${holding.symbol}`} className="inline-flex items-center gap-1.5 align-middle hover:text-oa-primary">
                            <StockLogo ticker={holding.symbol} size={18} />
                            {holding.symbol}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <StockLogo ticker={holding.symbol} size={18} />
                            {holding.symbol}
                          </span>
                        )}
                        <span className="ml-2 font-sans text-[13px] font-normal text-oa-muted-fg sm:hidden">{holding.name}</span>
                      </span>
                      <span className="oa-mono text-right text-[14px] tabular-nums text-oa-fg sm:order-4">{plainPct(holding.weight)}</span>
                      <span className="hidden min-w-0 truncate text-[13.5px] text-oa-fg sm:order-2 sm:block">
                        {holding.name}
                      </span>
                      <span className="col-span-2 text-[13px] leading-[1.5] text-oa-muted-fg sm:order-3 sm:col-span-1">{holding.reason}</span>
                    </li>
                  ))}
                  {basket.cash_weight > 0.0005 ? (
                    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3.5 py-2 sm:grid-cols-[5.25rem_minmax(0,10rem)_minmax(0,1fr)_3rem] sm:items-baseline">
                      <span className="oa-mono text-[14px] font-medium text-oa-fg sm:order-1">CASH</span>
                      <span className="oa-mono text-right text-[14px] tabular-nums text-oa-fg sm:order-4">{plainPct(basket.cash_weight)}</span>
                      <span className="hidden sm:order-2 sm:block" />
                      <span className="col-span-2 text-[13px] leading-[1.5] text-oa-muted-fg sm:order-3 sm:col-span-1">
                        Slots the rules could not fill. Earns nothing in this test.
                      </span>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="px-3.5 py-4 text-[14px] text-oa-muted-fg">The rules hold cash right now.</p>
              )}
              {seesHoldings ? (
              <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-5 text-oa-muted-fg">
                {basket.eligible} of {basket.candidates} candidates passed the rules.
              </p>
              ) : null}
            </Panel>

            {test ? (
              <Panel id="years" title="Year by year" aside="Backtested">
                <YearTable years={test.years} benchmarkLabel="SPY" />
              </Panel>
            ) : null}

            {test && test.recent_rebalances.length > 0 ? (
              <Panel title="Rebalance history" aside={`last ${test.recent_rebalances.length} of ${test.turnover.rebalances}, backtested`}>
                <ul className="divide-y divide-oa-border">
                  {test.recent_rebalances.map((item) => (
                    <li key={item.trade_date} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] gap-x-3 px-3.5 py-2 text-[13px] hover:bg-oa-accent">
                      <span className="oa-mono tabular-nums text-oa-fg">{longDay(item.trade_date)}</span>
                      <span className="min-w-0 leading-5">
                        {!seesHoldings && item.trade_date >= recentCutoff ? (
                          <span className="text-oa-muted-fg">Names on Pro</span>
                        ) : !item.market_ok ? (
                          <span className="text-oa-fg">Market below its average: moved to cash.</span>
                        ) : item.added.length === 0 && item.dropped.length === 0 ? (
                          <span className="text-oa-muted-fg">No names changed. Weights reset.</span>
                        ) : (
                          <>
                            {item.added.length > 0 ? (
                              <span className="mr-2 inline-block">
                                <span className="text-signal-bullish">In</span>{" "}
                                <span className="oa-mono text-oa-fg">{item.added.slice(0, 8).join(" ")}</span>
                                {item.added.length > 8 ? <span className="text-oa-muted-fg"> +{item.added.length - 8}</span> : null}
                              </span>
                            ) : null}
                            {item.dropped.length > 0 ? (
                              <span className="inline-block">
                                <span className="text-signal-bearish">Out</span>{" "}
                                <span className="oa-mono text-oa-fg">{item.dropped.slice(0, 8).join(" ")}</span>
                                {item.dropped.length > 8 ? <span className="text-oa-muted-fg"> +{item.dropped.length - 8}</span> : null}
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                      <span className="oa-mono whitespace-nowrap text-right tabular-nums text-oa-muted-fg" title="Share of the portfolio replaced">
                        {plainPct(item.turnover, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel title="The rules">
              <p className="border-b border-oa-border px-3.5 py-3 text-[14px] leading-[22px] text-oa-fg">{strategy.summary}</p>
              <ol className="divide-y divide-oa-border">
                {strategy.rules.map((rule, index) => (
                  <li key={rule} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 px-3.5 py-2.5">
                    <span className="oa-mono pt-px text-[12px] tabular-nums text-oa-primary">{index + 1}</span>
                    <span className="text-[13.5px] leading-[1.5] text-oa-fg">{rule}</span>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel title="Live record" aside={`since ${longDay(live.since)}`} bodyClassName="px-3.5 py-3">
              {live.sessions > 0 && live.strategy_return !== null ? (
                <p className="text-[14px] leading-[22px] text-oa-fg">
                  <span className={`oa-mono tabular-nums ${toneOf(live.strategy_return)}`}>{signedPct(live.strategy_return, 2)}</span> over{" "}
                  {live.sessions} session{live.sessions === 1 ? "" : "s"} since the first fill on {longDay(live.first_fill_date)}, against{" "}
                  <span className="oa-mono tabular-nums">{signedPct(live.benchmark_return, 2)}</span> for the S&amp;P 500 fund. Far too short to mean
                  anything yet.
                </p>
              ) : (
                <p className="text-[14px] leading-[22px] text-oa-muted-fg">
                  Nothing to show yet. The live record starts at the first close after {longDay(live.since)}, and past entries are never revised.
                </p>
              )}
            </Panel>
            <Panel title="Where it goes wrong" bodyClassName="px-3.5 py-3">
              <p className="text-[13.5px] leading-[1.55] text-oa-fg">{strategy.watch_out}</p>
            </Panel>
            <Panel title="Setup and schedule">
              <dl className="divide-y divide-oa-border text-[13px]">
                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <dt className="shrink-0 text-oa-muted-fg">Style</dt>
                  <dd className="text-right text-oa-fg">{strategy.style}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <dt className="shrink-0 text-oa-muted-fg">Pool</dt>
                  <dd className="text-right text-oa-fg">{strategy.universe.description}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Swings</dt>
                  <dd>
                    <RiskTag level={strategy.risk.level} ratio={strategy.risk.ratio} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Rebalanced</dt>
                  <dd className="text-oa-fg">Monthly</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Last rebalance</dt>
                  <dd className="oa-mono tabular-nums text-oa-fg">
                    {strategy.last_rebalance ? longDay(strategy.last_rebalance.trade_date ?? strategy.last_rebalance.signal_date) : "–"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Next picks made</dt>
                  <dd className="oa-mono tabular-nums text-oa-fg">{longDay(strategy.next_rebalance.signal_date)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Next trades fill</dt>
                  <dd className="oa-mono tabular-nums text-oa-fg">{longDay(strategy.next_rebalance.trade_date)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Cost per trade</dt>
                  <dd className="oa-mono tabular-nums text-oa-fg">{(strategy.cost_bps / 100).toFixed(2)}% of the amount</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <dt className="text-oa-muted-fg">Prices through</dt>
                  <dd className="oa-mono tabular-nums text-oa-fg">{longDay(strategy.price_as_of)}</dd>
                </div>
              </dl>
              <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-5 text-oa-muted-fg">Source: {strategy.source}.</p>
            </Panel>
          </aside>
        </div>

        <CaveatLine caveats={strategy.caveats} className="mt-4 max-w-[90ch]" />
        <p className="mt-1 text-[12.5px] leading-5 text-oa-muted-fg">Research, not advice.</p>
        {/* The head clips the tagline to one line (and drops it on a phone), so it is printed in full here. */}
        <PageNote lede={strategy.tagline} ledeInHead />
      </div>
    </main>
  );
}
