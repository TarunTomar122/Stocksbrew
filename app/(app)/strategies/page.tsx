import type { Metadata } from "next";
import Link from "next/link";

import { longDay, ratio, signedPct, toneOf, yearsWords } from "@/components/backtest/format";
import { Sparkline } from "@/components/backtest/sparkline";
import { interTight } from "@/components/oa/font";
import { MarkSlot, PageHead, PageNote, ToneGlyph } from "@/components/oa/kit";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { TheRead } from "@/components/oa/insight";
import { LiveLine, PAGE_FRAME, SWINGS_TONE } from "@/components/strategies/shared";
import { getSessionUser } from "@/lib/auth-server";
import { can } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getScreenerRows } from "@/lib/screener";
import { listStrategies, readTrackedStrategies, type StrategySummary } from "@/lib/strategies";
import { buildStrategiesRead, type YtdMap } from "@/lib/strategies-insights";
import { markFor } from "@/lib/tone";
import { getUserDoc } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "strategies"], "Rule-based stock strategies with backtests", { daily: true });
  return {
    title: "Stock Strategies with Rules and Backtests",
    description:
      "Rule-based stock and fund strategies with the rules in plain words, a labelled backtest against the S&P 500 and a separate live record.",
    alternates: { canonical: "/strategies" },
    openGraph: { title: "Stock Strategies with Rules and Backtests · stocksbrew", description: "Rule-based stock and fund strategies with the rules in plain words, a labelled backtest against the S&P 500 and a separate live record.", url: "https://www.stocksbrew.online/strategies", images: [shareImage] },
    twitter: { card: "summary_large_image", title: "Stock Strategies with Rules and Backtests · stocksbrew", description: "Rule-based stock and fund strategies with the rules in plain words, a labelled backtest against the S&P 500 and a separate live record.", images: [shareImage] },
  };
}

export const dynamic = "force-dynamic";

const LEDE = "A short list of rules, applied at each month end, and how they did on past prices. Pro shows what each one holds now.";

/**
 * A figure in a right-aligned column. `mark` is the good-or-bad glyph after it; pass null (not undefined)
 * for a judged figure with no mark, so the slot stays and digits still line up down the column.
 */
function Num({ value, tone = "", mark }: { value: string; tone?: string; mark?: "up" | "down" | "flat" | null }) {
  return (
    <span className={`oa-mono inline-flex items-center justify-end gap-1 whitespace-nowrap text-[14px] tabular-nums ${tone || "text-oa-fg"}`}>
      {value}
      {mark !== undefined ? <MarkSlot tone={mark} /> : null}
    </span>
  );
}

/** The worst fall arrives as a fraction (−0.32); the shared thresholds judge its size in percent. */
function fallMark(fall: number | null | undefined) {
  return markFor("drawdown", fall == null ? null : fall * 100);
}

function FallGlyph({ fall }: { fall: number | null | undefined }) {
  const mark = fallMark(fall);
  return mark ? <ToneGlyph tone={mark} /> : null;
}

function holdsText(item: StrategySummary): string {
  const kind = item.universe.kind === "funds" ? (item.holdings === 1 ? "fund" : "funds") : item.holdings === 1 ? "stock" : "stocks";
  if (item.holdings === 0) return "Cash";
  return item.cash_weight > 0.005 ? `${item.holdings} ${kind} + cash` : `${item.holdings} ${kind}`;
}

/** The strategy's yearly return minus the S&P 500 fund's over the same window, in percentage points. */
function gapOf(item: StrategySummary): number | null {
  const test = item.backtest;
  if (!test) return null;
  const mine = test.strategy.annualized_return ?? test.strategy.total_return;
  const theirs = test.benchmark.annualized_return ?? test.benchmark.total_return;
  if (mine == null || theirs == null) return null;
  return mine - theirs;
}

function gapText(gap: number | null): string {
  if (gap === null) return "–";
  const sign = gap > 0 ? "+" : gap < 0 ? "−" : "";
  return `${sign}${Math.abs(gap * 100).toFixed(1)} pts`;
}

function spyTitle(item: StrategySummary): string | undefined {
  const test = item.backtest;
  if (!test) return undefined;
  return `S&P 500 fund over the same dates: ${signedPct(test.benchmark.annualized_return ?? test.benchmark.total_return)} ${
    test.benchmark.annualized_return === null ? "in total" : "a year"
  }, worst fall ${signedPct(test.benchmark.max_drawdown)}, Sharpe ${ratio(test.benchmark.sharpe)}`;
}

/** Smaller swings than the S&P 500 are steadier (up), bigger are riskier (down), market-like gets no mark. */
function Swings({ item }: { item: StrategySummary }) {
  if (item.risk.ratio === null) return <Num value="–" tone="text-oa-muted-fg" mark={null} />;
  return (
    <span title={`Backtested volatility was ${item.risk.ratio.toFixed(2)} times the S&P 500's`}>
      <Num value={`${item.risk.ratio.toFixed(2)}×`} mark={SWINGS_TONE[item.risk.level] ?? null} />
    </span>
  );
}

const TRACKING = "oa-mono rounded-sm bg-oa-secondary px-1.5 py-px text-[12.5px] uppercase tracking-[0.04em] text-oa-fg";

function DesktopRow({ item, tracked, showLive }: { item: StrategySummary; tracked: boolean; showLive: boolean }) {
  const test = item.backtest;
  const gap = gapOf(item);
  return (
    <tr className="group border-b border-oa-border last:border-0 hover:bg-oa-accent" title={spyTitle(item)}>
      <td className="w-full max-w-0 py-2 pl-4 pr-3">
        <Link href={`/strategies/${item.slug}`} className="block outline-none">
          <span className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-oa-fg group-hover:underline">{item.name}</span>
            {tracked ? <span className={TRACKING}>Tracking</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-oa-muted-fg">{item.tagline}</span>
        </Link>
      </td>
      <td className="px-3">
        {test ? <Sparkline strategy={test.spark.strategy} benchmark={test.spark.benchmark} /> : <span className="whitespace-nowrap text-[12.5px] text-oa-muted-fg">No backtest</span>}
      </td>
      <td className="px-3 text-right">
        {test ? (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className={`oa-mono whitespace-nowrap text-[15px] font-medium tabular-nums ${toneOf(test.strategy.annualized_return ?? test.strategy.total_return)}`}>
              {signedPct(test.strategy.annualized_return ?? test.strategy.total_return)}
            </span>
            {test.strategy.annualized_return === null ? (
              <span className="whitespace-nowrap text-[12.5px] text-oa-muted-fg">{yearsWords(test.period.years)} total</span>
            ) : null}
          </span>
        ) : (
          <Num value="–" />
        )}
      </td>
      <td className="px-3 text-right">
        <Num value={gapText(gap)} tone={toneOf(gap)} />
      </td>
      <td className="px-3 text-right">{test ? <Num value={signedPct(test.strategy.max_drawdown)} mark={fallMark(test.strategy.max_drawdown) ?? null} /> : <Num value="–" mark={null} />}</td>
      <td className="px-3 text-right">{test ? <Num value={ratio(test.strategy.sharpe)} mark={markFor("sharpe", test.strategy.sharpe) ?? null} /> : <Num value="–" mark={null} />}</td>
      <td className="px-3 text-right text-[14px]">
        <Swings item={item} />
      </td>
      <td className={`whitespace-nowrap py-2 pl-3 text-right text-[14px] text-oa-muted-fg ${showLive ? "pr-3" : "pr-4"}`}>{holdsText(item)}</td>
      {showLive ? (
        <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right text-[13px]">
          <LiveLine live={item.live} short />
        </td>
      ) : null}
    </tr>
  );
}

function MobileCard({ item, tracked, showLive }: { item: StrategySummary; tracked: boolean; showLive: boolean }) {
  const test = item.backtest;
  const gap = gapOf(item);
  return (
    <Link href={`/strategies/${item.slug}`} className="block border-b border-oa-border px-4 py-3 last:border-0 active:bg-oa-accent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium leading-5 text-oa-fg">
            {item.name}
            {tracked ? <span className={`${TRACKING} ml-2 align-middle`}>Tracking</span> : null}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-oa-muted-fg">{item.tagline}</p>
        </div>
        {test ? <Sparkline strategy={test.spark.strategy} benchmark={test.spark.benchmark} width={84} height={34} /> : null}
      </div>
      {test ? (
        <dl className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <dt className="oa-caption">{test.strategy.annualized_return === null ? `${yearsWords(test.period.years)} total` : "Per year"}</dt>
            <dd className={`oa-mono text-[15px] font-medium tabular-nums ${toneOf(test.strategy.annualized_return ?? test.strategy.total_return)}`}>
              {signedPct(test.strategy.annualized_return ?? test.strategy.total_return)}
            </dd>
          </div>
          <div>
            <dt className="oa-caption">vs S&amp;P 500</dt>
            <dd className={`oa-mono text-[15px] tabular-nums ${toneOf(gap)}`}>{gapText(gap)}</dd>
          </div>
          <div>
            <dt className="oa-caption">Worst fall</dt>
            <dd className="oa-mono flex items-center gap-1.5 text-[15px] tabular-nums text-oa-fg">
              {signedPct(test.strategy.max_drawdown)}
              <FallGlyph fall={test.strategy.max_drawdown} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">No backtest: these rules need past financials.</p>
      )}
      <p className="mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
        Holds {holdsText(item)}
        {item.risk.ratio !== null ? (
          <>
            {" · "}
            <span className="oa-mono tabular-nums">{item.risk.ratio.toFixed(2)}×</span> the S&amp;P&apos;s swings
          </>
        ) : null}
        {showLive ? (
          <>
            {" · Live: "}
            <LiveLine live={item.live} short />
          </>
        ) : null}
      </p>
    </Link>
  );
}

export default async function StrategiesPage() {
  const [items, session] = await Promise.all([listStrategies().catch(() => [] as StrategySummary[]), getSessionUser()]);
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const tracked = new Set(readTrackedStrategies(userDoc).map((entry) => entry.slug));
  const tested = items.filter((item) => item.backtest && item.backtest.period.years >= 3);
  const first = tested[0]?.backtest ?? null;
  const ahead = tested.filter((item) => (item.backtest?.strategy.annualized_return ?? 0) > (item.backtest?.benchmark.annualized_return ?? 0)).length;
  const liveSince = items[0]?.live.since ?? null;

  // The read names holdings only for plans that see what each strategy holds.
  const seesHoldings = can("strategy_holdings", (await getViewer()).plan);
  const ytd: YtdMap = {};
  if (seesHoldings) {
    const symbols = [...new Set(items.filter((item) => item.universe.kind === "stocks").flatMap((item) => item.top_holdings.map((holding) => holding.symbol)))];
    const rows = await getScreenerRows(symbols).catch(() => new Map());
    for (const [symbol, row] of rows) ytd[symbol] = row.ret_ytd;
  }
  const read = buildStrategiesRead(items, { seesHoldings, ytd });

  // The live record is one sentence until a session has closed; after that each row gets its own figure.
  const showLive = items.some((item) => item.live.sessions > 0 && item.live.strategy_return !== null);

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className={PAGE_FRAME}>
        <PageHead
          note={false}
          title="Strategies"
          lede={LEDE}
          actions={
            <>
              <Link href="/backtest" className="hidden h-9 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-oa-accent sm:inline-flex">
                Test your own mix
              </Link>
              <Link href="/practice" className="hidden h-9 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-oa-accent sm:inline-flex">
                Practice account
              </Link>
            </>
          }
        />

        {items.length === 0 ? (
          <div className="oa-surface border border-oa-border bg-oa-card px-4 py-8 text-center text-[15px] text-oa-muted-fg">
            No strategies yet. Check back after the next market close.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <TheRead read={read} />
            <section className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
                <span className="font-medium text-oa-fg">Backtested, not traded</span>
                {first ? (
                  <span className="oa-mono tabular-nums max-sm:hidden">
                    {longDay(first.period.start)} to {longDay(first.period.end)}
                  </span>
                ) : null}
                {tested.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ahead} of {tested.length} <span className="max-sm:hidden">long backtests </span>beat the S&amp;P 500<span className="max-sm:hidden"> fund</span>
                    </span>
                  </>
                ) : null}
                {showLive ? null : (
                  <>
                    <span aria-hidden="true" className="max-sm:hidden">·</span>
                    <span className="max-sm:hidden">live record {liveSince ? `since ${longDay(liveSince)}` : "not started"}, no sessions yet</span>
                  </>
                )}
                <a href="#how-to-read" className="ml-auto whitespace-nowrap text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2">
                  How to read<span className="max-sm:hidden"> these</span>
                </a>
              </p>
              <div className="hidden lg:block">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-oa-border bg-oa-bg text-left">
                      <th className="oa-caption py-2 pl-4 pr-3">{items.length} strategies</th>
                      <th className="oa-caption whitespace-nowrap px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-[#b85a1e] dark:bg-[#cf7a35]" />
                          Rules
                          <span aria-hidden="true" className="ml-1 w-3 border-t-2 border-dashed border-[#0e8199] dark:border-[#2f9db5]" />
                          S&amp;P
                        </span>
                      </th>
                      <th className="oa-caption whitespace-nowrap px-3 py-2 text-right">Per year</th>
                      <th className="oa-caption whitespace-nowrap px-3 py-2 text-right">vs S&amp;P 500</th>
                      <th className="oa-caption whitespace-nowrap px-3 py-2 text-right">Worst fall</th>
                      <th className="oa-caption px-3 py-2 text-right">Sharpe</th>
                      <th className="oa-caption px-3 py-2 text-right" title="Backtested volatility as a multiple of the S&P 500's">
                        Swings
                      </th>
                      <th className={`oa-caption py-2 pl-3 text-right ${showLive ? "pr-3" : "pr-4"}`}>Holds now</th>
                      {showLive ? <th className="oa-caption whitespace-nowrap py-2 pl-3 pr-4 text-right">Live</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <DesktopRow key={item.slug} item={item} tracked={tracked.has(item.slug)} showLive={showLive} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden">
                {items.map((item) => (
                  <MobileCard key={item.slug} item={item} tracked={tracked.has(item.slug)} showLive={showLive} />
                ))}
              </div>
            </section>

            <section id="how-to-read" className="scroll-mt-20 px-2 sm:px-0">
              <p className="max-w-[80ch] text-[14px] leading-[22px] text-oa-muted-fg">
                Backtested, not traded: the pool is today&apos;s list, so companies that failed are missing, and trades fill at the next close with 0.1% cost. Research, not advice.
              </p>
              <p className="mt-4 flex flex-wrap gap-2 sm:hidden">
                <Link href="/backtest" className="inline-flex h-10 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg">
                  Test your own mix
                </Link>
                <Link href="/practice" className="inline-flex h-10 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg">
                  Practice account
                </Link>
              </p>
            </section>
          </div>
        )}
        <PageNote lede={LEDE} />
      </div>
    </main>
  );
}
