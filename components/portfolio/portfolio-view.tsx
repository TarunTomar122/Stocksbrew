"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { PositionFilterBar } from "@/components/portfolio/position-filters";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { MY_STOCKS_SELECT_EVENT, MyStocksTabs, type MyStocksTab } from "@/components/portfolio/my-stocks-tabs";
import { ImportButton } from "@/components/import/import-button";
import { MORE_ITEM, MoreActions } from "@/components/portfolio/more-actions";
import { ReasonsStrip } from "@/components/thesis/reasons-sheet";
import { ShareButton } from "@/components/share/share-button";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { StockLogo } from "@/components/stock-logo";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import type { IdeaCard } from "@/components/radar-next/types";
import type { HealthProps } from "@/lib/radar-next-data";
import { capitalize, daysFromToday, dayWords } from "@/lib/day-words";
import {
  fmtDay,
  fmtMoney,
  fmtSignedMoney,
  fmtSignedPct,
  type Portfolio,
  type PortfolioPosition,
  type PortfolioTab,
} from "@/lib/portfolio-shared";
import {
  activeCount,
  applyFilters,
  filterOptions,
  NO_FILTERS,
  parseFilters,
  readableQuery,
  usableFilters,
  writeFilters,
  type PositionFilters,
} from "@/lib/portfolio-filters";
import { signInWithGoogle } from "@/lib/sign-in";

/** The header's day-change label when the prices are not today's: "Yesterday", "Monday" within the week, else null. */
function changeLabel(pricesAsOf: string, today: string): string | null {
  const gap = daysFromToday(pricesAsOf, today);
  return gap !== null && gap < 0 && gap >= -6 ? capitalize(dayWords(pricesAsOf, today)) : null;
}

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
  /** Shown under the tabs, before the summary: the example's line on how to start. */
  lead?: React.ReactNode;
  /** Live mode: the list version the page was read at, so Add or edit stocks never overwrites a newer list. */
  listVersion?: number | null;
};

const BTN = `inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded border px-3 text-[12.5px] font-medium transition-colors ${FOCUS}`;
const BTN_PRIMARY = `${BTN} border-oa-primary bg-oa-primary text-oa-primary-fg hover:brightness-110`;

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
          <StockLogo ticker={position.ticker} size={16} circle />
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
  lead = null,
  listVersion = null,
}: PortfolioViewProps) {
  const router = useRouter();
  const example = mode === "example";
  // Analytics is no longer a tab of its own: it sits under the holdings (an old ?tab=analytics lands there).
  const [tab, setTab] = useState<PortfolioTab>(initialTab === "analytics" ? "positions" : initialTab);
  const { totals, positions, watching } = portfolio;
  const everything = [...positions, ...watching];

  // Each list keeps its own filters while the tabs switch; the URL holds the open tab's (?sector=…&call=…), so a link
  // shares them and a reload keeps them (lib/portfolio-filters).
  const searchParams = useSearchParams();
  const [filterState, setFilterState] = useState<{ positions: PositionFilters; watching: PositionFilters }>(() => {
    // Choices a link names that these rows do not offer are dropped here, so they cannot switch back on later.
    const fromUrl = parseFilters(searchParams);
    return {
      positions: initialTab === "positions" || initialTab === "analytics" ? usableFilters(fromUrl, filterOptions(positions, today)) : NO_FILTERS,
      watching: initialTab === "watching" ? usableFilters(fromUrl, filterOptions(watching, today)) : NO_FILTERS,
    };
  });
  const holdingOptions = useMemo(() => filterOptions(positions, today), [positions, today]);
  const watchOptions = useMemo(() => filterOptions(watching, today), [watching, today]);
  const holdingFilters = usableFilters(filterState.positions, holdingOptions);
  const watchFilters = usableFilters(filterState.watching, watchOptions);

  /** Writes the URL without a server round trip; the filters' commas stay readable (?sector=energy,technology). */
  function writeUrl(edit: (params: URLSearchParams) => void) {
    const url = new URL(window.location.href);
    edit(url.searchParams);
    window.history.replaceState(window.history.state, "", `${url.pathname}${readableQuery(url.search)}${url.hash}`);
  }

  function setListFilters(list: "positions" | "watching", next: PositionFilters) {
    setFilterState((current) => ({ ...current, [list]: next }));
    writeUrl((params) => writeFilters(params, next));
  }

  function choose(next: PortfolioTab) {
    setTab(next);
    // Keep the tab in the URL without a server round trip (/portfolio alone is the holdings).
    writeUrl((params) => {
      if (next === "positions") params.delete("tab");
      else params.set("tab", next);
      params.delete("reasons");
      writeFilters(params, next === "positions" ? holdingFilters : next === "watching" ? watchFilters : NO_FILTERS);
    });
  }

  // The app router puts back the URL it knows whenever the page data refreshes (a save in the editor), which would drop
  // the tab and filters written above; so they are written again after every refresh, and on first load.
  const syncUrl = useRef(() => {});
  syncUrl.current = () =>
    writeUrl((params) => {
      if (tab === "positions") params.delete("tab");
      else params.set("tab", tab);
      writeFilters(params, tab === "positions" ? holdingFilters : tab === "watching" ? watchFilters : NO_FILTERS);
    });
  useEffect(() => {
    syncUrl.current();
  }, [portfolio]);

  // My stocks' own tabs: Holdings, Watching and Alerts switch here, in the browser; Taxes is a link.
  const pageTab: MyStocksTab = tab === "watching" ? "watching" : tab === "alerts" ? "alerts" : "holdings";
  function selectPageTab(next: MyStocksTab): boolean {
    if (next === "holdings") choose("positions");
    else if (next === "watching" || next === "alerts") choose(next);
    else return false;
    return true;
  }
  // The phone strip's tab pills (components/oa/place-nav.tsx) switch the view here too.
  const selectRef = useRef(selectPageTab);
  selectRef.current = selectPageTab;
  useEffect(() => {
    const onSelect = (event: Event) => {
      const next = (event as CustomEvent<MyStocksTab>).detail;
      if (next && selectRef.current(next)) event.preventDefault();
    };
    window.addEventListener(MY_STOCKS_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(MY_STOCKS_SELECT_EVENT, onSelect);
  }, []);

  // Tracking is unlimited on every plan and these are the person's own stocks, so every row shows that the filters keep.
  const shownPositions = applyFilters(positions, holdingFilters, today);
  const shownWatching = applyFilters(watching, watchFilters, today);
  const holdingsFiltered = activeCount(holdingFilters) > 0;

  const missingShares = totals.holdings - totals.valued;
  return (
    <div className="flex flex-col gap-3">
      <MyStocksTabs
        current={pageTab}
        counts={{ holdings: totals.holdings, watching: totals.watching, ...(example ? {} : { alerts: alerts.length }) }}
        onSelect={selectPageTab}
        className="!mb-0"
      />
      {lead}
      {/* header: what it is worth, what it did today, what it has made */}
      <section
        // Not clipped: the actions' menu drops out of this card (./more-actions.tsx).
        className={`${CARD} !overflow-visible`}
        aria-label={example ? "Example portfolio summary" : "Portfolio summary"}
      >
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            {/* The page's own title (My stocks) is above the tabs, so only the example says what it is. */}
            {example ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* The badge says "example" once (owner rule 1); the heading stays for screen readers. */}
                <h2 className="sr-only">Example portfolio</h2>
                <span className="inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 text-[12.5px] font-medium text-oa-primary">
                  Example, not real money
                </span>
              </div>
            ) : null}
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
                      : "Add your shares in Add or edit stocks to see what it is worth"
                    : `Total value · ${totals.valued} holding${totals.valued === 1 ? "" : "s"}${missingShares > 0 ? `, ${missingShares} more without shares` : ""}`}
                </span>
              </div>
              {/* Today and total gain wrap as one group, so they never split across rows. */}
              <div className="col-span-2 flex gap-x-8">
                <HeaderFigure
                  label={pricesAsOf && pricesAsOf !== today ? changeLabel(pricesAsOf, today) || `Change on ${fmtDay(pricesAsOf)}` : "Today"}
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
              // One button, with the other actions behind its chevron (owner, Nov 12: "do we need 5 buttons at once???").
              <div className="flex items-center">
                <RadarBatchEditModal
                  initialItems={manageItems(portfolio)}
                  isSubscribed={isSubscribed}
                  freeLimit={freeLimit}
                  ctaLabel="Add or edit stocks"
                  baseVersion={listVersion}
                  triggerClassName={`${BTN_PRIMARY} rounded-r-none`}
                />
                <MoreActions className={`${BTN_PRIMARY} rounded-l-none border-l-[color-mix(in_srgb,var(--oa-primary-fg)_35%,transparent)] !px-2`}>
                  <ImportButton className={MORE_ITEM} positions={everything} />
                  <ShareButton kind="portfolio" className={MORE_ITEM} />
                  <WatchlistAiPromptButton className={MORE_ITEM} />
                </MoreActions>
              </div>
            )}
            <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg lg:text-right">
              {example
                ? `Prices from ${pricesWords ?? "the latest quotes"}.`
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

      <div
        id="portfolio-panel"
        aria-label={tab === "watching" ? "Watching" : tab === "alerts" ? "Alerts" : "Holdings"}
        className="flex flex-col gap-3"
      >
        {tab === "positions" ? (
          <div className="flex flex-col gap-2">
          <PositionFilterBar
            filters={holdingFilters}
            options={holdingOptions}
            onChange={(next) => setListFilters("positions", next)}
            shown={shownPositions.length}
            total={positions.length}
            noun="holdings"
          />
          <section className={CARD}>
            {positions.length === 0 ? (
              <EmptyNote title="Nothing marked as a holding yet">
                {watching.length > 0
                  ? "Open Add or edit stocks and switch the ones you own to Hold."
                  : "Add the stocks you own and the ones you are watching."}
              </EmptyNote>
            ) : (
              <>
              {/* Why you own each holding, and what the reason watcher found (components/thesis). */}
              {example ? null : (
                <ReasonsStrip stocks={positions.map((position) => ({ instrument_id: position.instrument_id, ticker: position.ticker, name: position.name }))} />
              )}
              <PositionsTable
                positions={shownPositions}
                // The bar above has Clear all, so the note only says what happened. The table stays mounted, so its
                // sort survives a filter that leaves nothing.
                empty={<EmptyNote title="Nothing matches these filters" />}
                columnsFrom={positions}
                kind="holding"
                today={today}
                defaultSort={
                  totals.valued > 0
                    ? { key: "value", direction: "desc" }
                    : { key: "ticker", direction: "asc" }
                }
                // The total covers every holding, so it waits while a filter hides some.
                totals={holdingsFiltered ? undefined : totals}
              />
              </>
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
          </div>
        ) : null}

        {tab === "watching" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
            <PositionFilterBar
              filters={watchFilters}
              options={watchOptions}
              onChange={(next) => setListFilters("watching", next)}
              shown={shownWatching.length}
              total={watching.length}
              noun="stocks"
            />
            <section className={CARD}>
              {watching.length === 0 ? (
                <EmptyNote title="Nothing on the watch side yet">
                  Add a stock you do not own but want to keep an eye on. It gets
                  the same call, price zone and earnings date.
                </EmptyNote>
              ) : (
                <PositionsTable
                  positions={shownWatching}
                  empty={<EmptyNote title="Nothing matches these filters" />}
                  columnsFrom={watching}
                  kind="watchlist"
                  today={today}
                  defaultSort={{ key: "dayPct", direction: "desc" }}
                />
              )}
            </section>
            </div>
            <IdeasList ideas={ideas} />
          </div>
        ) : null}

        {/* How the money is spread sits under the holdings it is about: the table first, then the evidence. */}
        {tab === "positions" && positions.length > 0 ? (
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
            today={today}
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
}: {
  signedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <section
      aria-labelledby="portfolio-intro"
      className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
    >
      <div className="min-w-0">
        <h2 id="portfolio-intro" className="text-balance text-[20px] font-semibold leading-[27px] tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
          {signedIn ? "Your portfolio is empty" : "Keep the stocks you own and watch in one place"}
        </h2>
        {/* Signed out, the title and the example under it say it all (owner rule 8): no paragraph under the title. */}
        {signedIn ? <p className="mt-1 max-w-[44rem] text-pretty text-[15px] leading-[22px] text-oa-muted-fg">Add your first stocks and this page fills in around them.</p> : null}
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
          href="/import"
          className={`inline-flex h-10 items-center text-[14px] text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg sm:h-9 ${FOCUS}`}
        >
          Check a list of stocks without signing in
        </Link>
      </div>
    </section>
  );
}
