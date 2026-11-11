"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertsTab,
  type PortfolioAlert,
  type PortfolioSignal,
} from "@/components/portfolio/alerts-tab";
import { AnalyticsTab } from "@/components/portfolio/analytics-tab";
import {
  CoveragePanel,
  type PortfolioCoverage,
} from "@/components/portfolio/coverage-panel";
import {
  CARD,
  Dash,
  EarningsCell,
  EmptyNote,
  FOCUS,
  NUM,
  Pct,
  SectionTitle,
  signTone,
} from "@/components/portfolio/parts";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { StockLogo } from "@/components/stock-logo";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import type { IdeaCard } from "@/components/radar-next/types";
import type { HealthProps } from "@/lib/radar-next-data";
import {
  fmtDay,
  fmtMoney,
  fmtSignedMoney,
  fmtSignedPct,
  type Portfolio,
  type PortfolioPosition,
  type PortfolioTab,
} from "@/lib/portfolio-shared";
import { signInWithGoogle } from "@/lib/sign-in";
import type { PortfolioReads } from "@/lib/portfolio-insights";
import { TheRead } from "@/components/oa/insight";

export type PortfolioViewProps = {
  portfolio: Portfolio;
  /** "example": made-up positions on real prices, read-only. */
  mode: "live" | "example";
  today: string;
  initialTab?: PortfolioTab;
  isSubscribed?: boolean;
  freeLimit?: number;
  /** Free only: which tracked stocks are covered in full and what can change. Null on Pro and in the example. */
  coverage?: PortfolioCoverage | null;
  alerts?: PortfolioAlert[];
  signals?: PortfolioSignal[];
  health?: HealthProps | null;
  ideas?: IdeaCard[];
  emailPrefs?: { alerts: boolean; digest: boolean } | null;
  /** New York day the prices are from (the quotes' day). */
  pricesAsOf?: string | null;
  /** How to say that day: "the Nov 10 close", or "Nov 11, during trading" (lib/portfolio-prices). */
  pricesWords?: string | null;
  /** Live mode: when the page data was read. */
  asOf?: string | null;
  /** The read on each tab, computed on the server (lib/portfolio-insights). */
  reads?: PortfolioReads | null;
};

const BTN = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded border px-3 text-[12.5px] font-medium transition-colors ${FOCUS}`;
const BTN_PRIMARY = `${BTN} border-oa-primary bg-oa-primary text-oa-primary-fg hover:brightness-110`;
const BTN_PLAIN = `${BTN} border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30`;

function fmtClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: false })} ET`;
}

function HeaderFigure({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="oa-caption">{label}</span>
      <span className={`${NUM} text-[17px] font-medium leading-6`}>
        {children}
      </span>
      {/* The note line is always there, so figures with and without a note sit on the same rows. */}
      <span className="min-h-[18px] text-[13px] leading-[18px] text-oa-muted-fg">
        {note}
      </span>
    </div>
  );
}

function manageItems(portfolio: Portfolio) {
  return [...portfolio.positions, ...portfolio.watching].map((position) => ({
    instrument_id: position.instrument_id,
    ticker: position.ticker,
    name: position.name,
    position_type: position.kind,
    // Carry the saved numbers through, so saving the list never blanks them.
    holding:
      position.kind === "holding"
        ? {
            quantity: position.shares,
            average_cost: position.avgCost,
            market_value:
              position.valueSource === "entered" ? position.value : null,
          }
        : undefined,
  }));
}

function IdeasList({ ideas }: { ideas: IdeaCard[] }) {
  if (ideas.length === 0) return null;
  return (
    <section className={CARD} aria-label="Ideas">
      <SectionTitle>Names that fit what you hold</SectionTitle>
      <ul className="divide-y divide-oa-border">
        {ideas.map((idea) => (
          <li key={`${idea.market}-${idea.ticker}`}>
            <Link
              href={idea.href}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-1.5 hover:bg-oa-accent"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <StockLogo
                  ticker={idea.ticker}
                  market={idea.market}
                  size={24}
                  circle
                  className="shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="oa-mono text-[13px] font-medium text-oa-fg">
                      {idea.ticker}
                    </span>
                    {idea.tag ? (
                      <span className="truncate text-[11.5px] text-oa-muted-fg">
                        {idea.tag}
                      </span>
                    ) : null}
                  </span>
                  {idea.reason ? (
                    <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">
                      {idea.reason}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-right">
                <span
                  className={`${NUM} block text-[13px] leading-4 text-oa-fg`}
                >
                  {idea.price !== null ? fmtMoney(idea.price) : <Dash />}
                </span>
                <span className="block text-[12px] leading-4">
                  <Pct value={idea.dayChangePct} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tracked names that report in the next two weeks, soonest first. */
function ReportingStrip({
  positions,
  today,
}: {
  positions: PortfolioPosition[];
  today: string;
}) {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const soon = positions
    .filter(
      (position) =>
        position.nextEarnings && position.nextEarnings.date <= limit,
    )
    .sort((a, b) => a.nextEarnings!.date.localeCompare(b.nextEarnings!.date))
    .slice(0, 8);
  if (soon.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-t border-oa-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="oa-caption shrink-0">Reporting soon</span>
      {soon.map((position) => (
        <Link
          key={position.instrument_id}
          href={`/stock/${position.ticker}`}
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded border border-oa-border bg-oa-bg px-2 hover:border-oa-fg/30 ${FOCUS}`}
        >
          <span className="oa-mono text-[12px] font-medium text-oa-fg">
            {position.ticker}
          </span>
          <EarningsCell next={position.nextEarnings} today={today} />
        </Link>
      ))}
    </div>
  );
}

export function PortfolioView({
  portfolio,
  mode,
  today,
  initialTab = "positions",
  isSubscribed = false,
  freeLimit = Number.POSITIVE_INFINITY,
  coverage = null,
  alerts = [],
  signals = [],
  health = null,
  ideas = [],
  emailPrefs = null,
  pricesAsOf = null,
  pricesWords = null,
  asOf = null,
  reads = null,
}: PortfolioViewProps) {
  const router = useRouter();
  const example = mode === "example";
  const [tab, setTab] = useState<PortfolioTab>(initialTab);
  const { totals, positions, watching } = portfolio;
  const everything = [...positions, ...watching];

  function choose(next: PortfolioTab) {
    setTab(next);
    if (example) return;
    // Keep the tab in the URL without a server round trip.
    const url = new URL(window.location.href);
    if (next === "positions") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  // Tracking is unlimited on every plan and these are the person's own stocks, so every row shows.
  const shownPositions = positions;
  const shownWatching = watching;

  const missingShares = totals.holdings - totals.valued;
  const tabs: Array<{ key: PortfolioTab; label: string; count?: number }> = [
    { key: "positions", label: example ? "Holdings" : "You own", count: totals.holdings },
    { key: "watching", label: "Watching", count: totals.watching },
    { key: "analytics", label: "Analytics" },
    {
      key: "alerts",
      label: "Alerts",
      count: example ? undefined : alerts.length,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* header: what it is worth, what it did today, what it has made */}
      <section
        className={CARD}
        aria-label={example ? "Example portfolio summary" : "Portfolio summary"}
      >
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {example ? (
                <h2 className="text-[15px] font-semibold leading-5 text-oa-fg">Example portfolio</h2>
              ) : (
                <h1 className="text-[15px] font-semibold leading-5 text-oa-fg">Portfolio</h1>
              )}
              {example ? (
                <span className="inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 text-[12.5px] font-medium text-oa-primary">
                  Example, not real money
                </span>
              ) : null}
            </div>
            {/* Total value is the one hero number. Today and total gain share a row beside it (under it on a phone). */}
            <div className="grid grid-cols-2 items-start gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:items-end sm:gap-x-8">
              <div className="col-span-2 flex flex-col">
                {totals.value !== null ? (
                  <span
                    className={`${NUM} font-medium tracking-tight text-oa-fg ${example ? "text-[24px] leading-8" : "text-[30px] leading-9 sm:text-[34px] sm:leading-10"}`}
                  >
                    {fmtMoney(totals.value)}
                  </span>
                ) : (
                  <span className="text-[20px] font-medium leading-9 tracking-tight text-oa-fg">
                    {totals.holdings + totals.watching} stock
                    {totals.holdings + totals.watching === 1 ? "" : "s"}{" "}
                    tracked, no value yet
                  </span>
                )}
                <span className="min-h-[18px] text-[13px] leading-[18px] text-oa-muted-fg">
                  {totals.value === null
                    ? totals.holdings === 0
                      ? "No holdings yet"
                      : "Choose Edit on a holding and enter the shares to see what it is worth"
                    : `Total value · ${totals.valued} holding${totals.valued === 1 ? "" : "s"}${missingShares > 0 ? `, ${missingShares} more without shares` : ""}`}
                </span>
              </div>
              {/* Today and total gain wrap as one group, so they never split across rows. */}
              <div className="col-span-2 flex gap-x-8">
                <HeaderFigure
                  label={pricesAsOf && pricesAsOf !== today ? `Change on ${fmtDay(pricesAsOf)}` : "Today"}
                  note={
                    totals.dayPct !== null ? (
                      <Pct value={totals.dayPct} />
                    ) : undefined
                  }
                >
                  {totals.dayMove !== null ? (
                    <span className={signTone(totals.dayMove)}>
                      {fmtSignedMoney(totals.dayMove)}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </HeaderFigure>
                <HeaderFigure
                  label={example ? "Gain so far" : "Gain since you bought"}
                  note={
                    totals.gain !== null && totals.gainPct !== null ? (
                      <>
                        <span className={`${NUM} ${signTone(totals.gainPct)}`}>
                          {fmtSignedPct(totals.gainPct)}
                        </span>
                        {totals.withCost < totals.valued
                          ? ` on ${totals.withCost} of ${totals.valued} with a cost`
                          : ` on ${fmtMoney(totals.cost ?? 0, 0)} cost`}
                      </>
                    ) : totals.holdings > 0 ? (
                      "Add average cost to see it"
                    ) : undefined
                  }
                >
                  {totals.gain !== null ? (
                    <span className={signTone(totals.gain)}>
                      {fmtSignedMoney(totals.gain)}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </HeaderFigure>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            {example ? null : (
              <div className="flex flex-wrap items-center gap-2">
                <RadarBatchEditModal
                  initialItems={manageItems(portfolio)}
                  isSubscribed={isSubscribed}
                  freeLimit={freeLimit}
                  ctaLabel="Add or edit stocks"
                  triggerClassName={BTN_PRIMARY}
                />
                <Link href="/watchlist/classic" className={BTN_PLAIN}>
                  Chat about it
                </Link>
                <WatchlistAiPromptButton className={BTN_PLAIN} />
              </div>
            )}
            <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg lg:text-right">
              {example
                ? `Example shares and costs. Prices from ${pricesWords ?? "the latest quotes"}.`
                : pricesWords
                  ? `Prices from ${pricesWords}.`
                  : asOf
                  ? `Prices as of ${fmtClock(asOf)}.`
                  : "Prices are the latest quote."}
            </p>
          </div>
        </div>
      </section>

      {!example && coverage ? (
        <CoveragePanel
          coverage={coverage}
          stocks={everything.map((position) => ({
            instrument_id: position.instrument_id,
            ticker: position.ticker,
            name: position.name,
          }))}
        />
      ) : null}

      {/* tabs */}
      <div
        role="tablist"
        aria-label="Portfolio sections"
        className="-mx-2 flex gap-1 overflow-x-auto border-b border-oa-border px-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              id={`portfolio-tab-${item.key}`}
              aria-selected={active}
              aria-controls="portfolio-panel"
              onClick={() => choose(item.key)}
              className={`-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-[14px] transition-colors ${FOCUS} ${
                active
                  ? "border-oa-primary font-medium text-oa-fg"
                  : "border-transparent text-oa-muted-fg hover:text-oa-fg"
              }`}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className={`${NUM} text-[11px] text-oa-muted-fg`}>
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
        {/* Tax is its own route (/watchlist/tax), so it is a link, not a tab button. */}
        {example ? null : (
          <Link
            href="/watchlist/tax"
            className={`-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-[14px] text-oa-muted-fg transition-colors hover:text-oa-fg ${FOCUS}`}
          >
            Tax
          </Link>
        )}
      </div>

      <div
        id="portfolio-panel"
        role="tabpanel"
        aria-labelledby={`portfolio-tab-${tab}`}
        className="flex flex-col gap-3"
      >
        {/* Each tab leads with what its numbers mean; the table under it is the evidence. */}
        <TheRead
          key={tab}
          read={reads?.[tab] ?? null}
          label={
            tab === "positions"
              ? example
                ? "How these stocks did"
                : "How your stocks did"
              : tab === "watching"
                ? example
                  ? "The watched stocks"
                  : "What you are watching"
                : tab === "analytics"
                  ? example
                    ? "How the money is spread"
                    : "How your money is spread"
                  : "Your alerts"
          }
        />
        {tab === "positions" ? (
          <section className={CARD}>
            {positions.length === 0 ? (
              <EmptyNote title="Nothing marked as a holding yet">
                {watching.length > 0
                  ? "Open Watching, choose Edit on a stock you own, and mark it as a holding. Then enter the shares."
                  : "Add the stocks you own and the ones you are watching."}
              </EmptyNote>
            ) : (
              <PositionsTable
                positions={shownPositions}
                kind="holding"
                today={today}
                editable={!example}
                defaultSort={
                  totals.valued > 0
                    ? { key: "value", direction: "desc" }
                    : { key: "ticker", direction: "asc" }
                }
                totals={totals}
              />
            )}
            <ReportingStrip positions={everything} today={today} />
            {positions.some(
              (position) => position.valueSource === "entered",
            ) ? (
              <p className="border-t border-oa-border px-3 py-2 text-[12.5px] leading-4 text-oa-muted-fg">
                * A value you typed in.
              </p>
            ) : null}
          </section>
        ) : null}

        {tab === "watching" ? (
          <div className="flex flex-col gap-3">
            <section className={CARD}>
              {watching.length === 0 ? (
                <EmptyNote title="Nothing on the watch side yet">
                  Add a stock you do not own but want to keep an eye on. It gets
                  the same call, price zone and earnings date.
                </EmptyNote>
              ) : (
                <PositionsTable
                  positions={shownWatching}
                  kind="watchlist"
                  today={today}
                  editable={!example}
                  defaultSort={{ key: "dayPct", direction: "desc" }}
                />
              )}
            </section>
            <IdeasList ideas={ideas} />
          </div>
        ) : null}

        {tab === "analytics" ? (
          <AnalyticsTab
            portfolio={portfolio}
            health={health}
            example={example}
          />
        ) : null}

        {tab === "alerts" ? (
          <AlertsTab
            alerts={alerts}
            signals={signals}
            positions={everything}
            isSubscribed={isSubscribed}
            emailPrefs={emailPrefs}
            example={example}
          />
        ) : null}
      </div>

      {example ? null : (
        <p className="px-2 text-[12.5px] leading-4 text-oa-muted-fg sm:px-0">
          Our calls are a view, not advice.
          {!isSubscribed ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="font-medium text-oa-fg underline underline-offset-2"
              >
                See what Pro adds
              </button>
              .
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

/* ── visitors and empty accounts: say what it is, then show it working ───── */

export function PortfolioIntro({
  signedIn,
  freeLimit = 5,
}: {
  signedIn: boolean;
  /** Stocks a Free account covers in full. */ freeLimit?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <section
      aria-labelledby="portfolio-intro"
      className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
    >
      <div className="min-w-0">
        <h1 id="portfolio-intro" className="text-balance text-[20px] font-semibold leading-[27px] tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
          {signedIn ? "Your portfolio is empty" : "Keep the stocks you own and watch in one place"}
        </h1>
        <p className="mt-1 max-w-[44rem] text-pretty text-[15px] leading-[22px] text-oa-muted-fg">
          {signedIn
            ? "Add your first stocks and this page fills in around them."
            : `It's free, and there's no brokerage login. You'll see what each stock did today and why, and ${freeLimit} you choose get our full report.`}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:shrink-0">
        {signedIn ? (
          <RadarBatchEditModal
            initialItems={[]}
            isSubscribed={false}
            ctaLabel="Add your first stocks"
            triggerClassName={`${BTN_PRIMARY} !h-10 !px-4 !text-[14px] sm:!h-9`}
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signInWithGoogle({ surface: "radar_track" });
                router.refresh();
              } catch {
                // the sign-in sheet reports its own errors
              } finally {
                setBusy(false);
              }
            }}
            className={`${BTN_PRIMARY} !h-10 !px-4 !text-[14px] disabled:opacity-60 sm:!h-9`}
          >
            {busy ? "Signing in" : "Track your stocks free"}
          </button>
        )}
        <Link
          href="/portfolio"
          className={`inline-flex h-10 items-center text-[14px] text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg sm:h-9 ${FOCUS}`}
        >
          Check a list of stocks without signing in
        </Link>
      </div>
    </section>
  );
}

/** How Portfolio works, in three plain steps. It sits under the example, where it explains what was just seen. */
export function PortfolioHow() {
  const points: Array<[string, string]> = [
    [
      "Enter what you own",
      "Ticker, shares and what you paid. No brokerage login, nothing connected.",
    ],
    [
      "See it priced and explained",
      "Value, today's move and gain per position, with our call and the price where it changes.",
    ],
    [
      "Get told when it matters",
      "Earnings dates on every row, and alerts for price levels and call changes.",
    ],
  ];
  return (
    <ol
      aria-label="How Portfolio works"
      className="grid gap-x-8 gap-y-3 border-t border-oa-border px-2 pt-4 sm:grid-cols-3 sm:px-0"
    >
      {points.map(([title, body], index) => (
        <li key={title} className="flex gap-2.5">
          <span className={`${NUM} text-[12.5px] leading-5 text-oa-muted-fg`}>
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-5 text-oa-fg">
              {title}
            </span>
            <span className="mt-0.5 block max-w-[38ch] text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
              {body}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
