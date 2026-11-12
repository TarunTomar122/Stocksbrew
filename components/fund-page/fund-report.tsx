import { Suspense, type ReactNode } from "react";

import { MarketStatusInline } from "@/components/market-status";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { PricePanel } from "@/components/stock-report/price-panel";
import { NUM, Panel, TONE_COLOR } from "@/components/stock-report/primitives";
import { compactMoney, fmtDate, moneyFormatter, priceStamp, signedPct } from "@/components/stock-report/format";
import { AppLink } from "@/components/oa/app-link";
import { dayPossessive } from "@/lib/day-words";
import { packChartRanges, type ChartRange } from "@/lib/stock-chart";
import type { FundPageData } from "@/lib/funds/page";
import { SectorIcon } from "@/components/oa/sector-icon";
import { costOn10k, fmtDollars, fmtRatio, type FundHoldingRow, type FundSectorRow } from "@/lib/funds/view";

/**
 * A fund's page at /stock/<FUND>: price and chart (the stock page's own price
 * panel), four figures, what it holds, its sectors beside the S&P 500 and, for
 * a signed-in reader, how much of it is stocks they already hold. No call: we
 * make none on funds, and the page says so once.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** About eight rows, then the list scrolls inside with no bar and hands the scroll back to the page at its end. */
const LIST_BOX = "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function sinceWords(iso: string | null): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return match ? `since ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : null;
}

function pctText(value: number): string {
  if (value >= 9.95) return `${Math.round(value)}%`;
  if (value >= 0.05) return `${value.toFixed(1)}%`;
  return value > 0 ? "<0.1%" : "0%";
}

function packed(ranges: ChartRange[]) {
  const pack = packChartRanges(ranges);
  return pack ? { packed: pack } : { ranges };
}

/** From md the figures share the row evenly, so three never leave an empty fourth slot. */
const MD_COLUMNS: Record<number, string> = { 1: "md:grid-cols-4", 2: "md:grid-cols-4", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

type Figure = { key: string; value: string; label: string; line?: ReactNode; tone?: "up" | "down"; title?: string };

function figuresOf(data: FundPageData): Figure[] {
  const { facts, year } = data;
  const out: Figure[] = [];
  const cost = costOn10k(facts?.expenseRatio);
  if (cost !== null && facts?.expenseRatio != null) {
    out.push({ key: "cost", value: `${fmtDollars(cost)} a year`, label: "Cost on $10,000", line: `${fmtRatio(facts.expenseRatio)} expense ratio` });
  }
  if (facts?.aumUsd) out.push({ key: "size", value: compactMoney(facts.aumUsd), label: "Fund size" });
  if (facts?.dividendYield != null) out.push({ key: "yield", value: `${(facts.dividendYield * 100).toFixed(2)}%`, label: "Dividend yield" });
  if (year) {
    out.push({
      key: "year",
      value: signedPct(year.fundPct, 1),
      label: "Past year",
      line: `S&P 500 ${signedPct(year.sp500Pct, 1)}`,
      tone: year.fundPct >= 0 ? "up" : "down",
      title: `Total return with dividends, ${fmtDate(year.from)} to ${fmtDate(year.to)}`,
    });
  }
  return out;
}

function HoldingRows({ rows }: { rows: FundHoldingRow[] }) {
  return (
    <ul role="list" className="divide-y divide-oa-border">
      {rows.map((row) => (
        <li key={row.ticker}>
          <AppLink
            href={`/stock/${encodeURIComponent(row.ticker)}`}
            className="flex min-h-11 items-center gap-3 px-3.5 py-2 transition-colors hover:bg-oa-accent sm:px-4"
          >
            <StockLogo ticker={row.ticker} size={24} circle eager />
            <span className="oa-mono w-14 shrink-0 text-[14px] font-semibold text-oa-fg">{row.ticker}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-oa-muted-fg">{row.name}</span>
            <span className={`${NUM} shrink-0 text-[14px] font-medium text-oa-fg`}>{pctText(row.weightPct)}</span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

function SectorBars({ rows, ticker }: { rows: FundSectorRow[]; ticker: string }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.pct, row.benchmarkPct ?? 0]));
  return (
    <ul role="list" className="flex flex-col gap-2.5 px-3.5 py-3 sm:px-4">
      {rows.map((row) => (
        <li key={row.sector} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-x-3 text-[13px] leading-4 max-sm:grid-cols-1 max-sm:gap-y-1">
          <span className="flex min-w-0 items-center gap-2 text-oa-fg">
            <SectorIcon id={row.sector} size={15} />
            <span className="truncate">{row.sector}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2" title={`${ticker}: ${pctText(row.pct)}`}>
              <span className="h-2 rounded-full bg-oa-primary" style={{ width: `${(row.pct / max) * 82}%`, minWidth: row.pct > 0 ? 2 : 0 }} />
              <span className={`${NUM} shrink-0 text-oa-fg`}>{pctText(row.pct)}</span>
            </span>
            {row.benchmarkPct !== null ? (
              <span className="flex items-center gap-2" title={`S&P 500: ${pctText(row.benchmarkPct)}`}>
                <span className="h-2 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]" style={{ width: `${(row.benchmarkPct / max) * 82}%`, minWidth: row.benchmarkPct > 0 ? 2 : 0 }} />
                <span className={`${NUM} shrink-0 text-oa-muted-fg`}>{pctText(row.benchmarkPct)}</span>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SectorKey({ ticker }: { ticker: string }) {
  return (
    <span className="flex items-center gap-3 font-sans text-[12px] normal-case tracking-normal">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-oa-primary" />
        {ticker}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_22%,transparent)]" />
        S&amp;P 500
      </span>
    </span>
  );
}

export function FundReport({
  data,
  nowIso,
  isTracked,
  subscribed,
  overlap,
}: {
  data: FundPageData;
  nowIso: string;
  isTracked: boolean;
  subscribed: boolean;
  /** "Overlap with your stocks", streamed in for a signed-in reader. */
  overlap?: ReactNode;
}) {
  const { ticker, quote, facts } = data;
  const money = moneyFormatter("$");
  const tone = quote?.changePct == null ? "flat" : quote.changePct >= 0 ? "up" : "down";
  const subline = [facts?.family, facts?.category, sinceWords(facts?.inceptionDate ?? null)].filter(Boolean).join(" · ");
  const figures = figuresOf(data);
  const { inside, doc } = data.holdings;
  const stamp = quote?.capturedAt ? priceStamp(quote.capturedAt) : quote?.closeDate ? `${dayPossessive(quote.closeDate)} close`.replace(/^./, (c) => c.toUpperCase()) : "";
  const both = inside.top.length > 0 && Boolean(inside.sectors);

  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pb-[72px] pt-3 sm:px-6 sm:pt-6 lg:pb-10">
      <div className="grid grid-cols-1 gap-4">
        <Panel>
          <header className="px-3.5 pb-3 pt-3 sm:px-4 sm:pt-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <StockLogo ticker={ticker} market="US" size={36} eager />
              <div className="min-w-0 flex-1">
                <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[20px] font-semibold leading-7 tracking-tight text-oa-fg sm:text-[24px] sm:leading-8">
                  <span className="min-w-0">{data.name}</span>
                  <span className="oa-mono text-[14px] font-semibold text-oa-muted-fg">{ticker}</span>
                </h1>
                {subline ? <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg">{subline}</p> : null}
              </div>
              <div className="oa-track-outline hidden shrink-0 sm:block">
                <TrackButton
                  ticker={ticker}
                  instrumentId={data.instrumentId}
                  isSubscribed={subscribed}
                  isTracked={isTracked}
                  untrackedLabel={`+ Follow ${ticker}`}
                  signedOutLabel={`+ Follow ${ticker}`}
                />
              </div>
            </div>

            <div className="mt-3">
              {quote ? (
                <p className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className={`${NUM} text-[36px] font-semibold leading-[44px] text-oa-fg sm:text-[42px] sm:leading-[48px]`}>{money(quote.price)}</span>
                  {quote.changePct != null ? (
                    <span className={`${NUM} text-[16px] font-medium`} style={{ color: TONE_COLOR[tone] }}>
                      {quote.changeAbs != null ? `${quote.changeAbs >= 0 ? "+" : "−"}${Math.abs(quote.changeAbs).toFixed(2)} ` : ""}({signedPct(quote.changePct, 2)})
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-[15px] leading-6 text-oa-muted-fg">We don&apos;t have a price for {ticker} yet.</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {stamp ? <p className="text-[12px] leading-4 text-oa-muted-fg">{stamp}</p> : null}
                {data.dailyPriced ? (
                  <p className="text-[12px] leading-4 text-oa-muted-fg">Priced once a day</p>
                ) : (
                  <MarketStatusInline nowIso={nowIso} surface="stock" />
                )}
                <p className="text-[12px] leading-4 text-oa-muted-fg">No call on funds</p>
              </div>
            </div>
            <div className="oa-track-outline mt-3 sm:hidden [&_button]:w-full">
              <TrackButton
                ticker={ticker}
                instrumentId={data.instrumentId}
                isSubscribed={subscribed}
                isTracked={isTracked}
                untrackedLabel={`+ Follow ${ticker}`}
                signedOutLabel={`+ Follow ${ticker}`}
              />
            </div>
          </header>

          {figures.length ? (
            <div className={`grid grid-cols-2 border-t border-oa-border ${MD_COLUMNS[figures.length] ?? "md:grid-cols-4"}`}>
              {figures.map((figure, index) => (
                <div
                  key={figure.key}
                  title={figure.title}
                  className={`min-w-0 px-3.5 py-3 sm:px-4 ${index % 2 === 1 ? "border-l border-oa-border" : ""} ${index >= 2 ? "max-md:border-t max-md:border-oa-border" : ""} ${index > 0 ? "md:border-l md:border-oa-border" : ""}`}
                >
                  <p className={`${NUM} text-[22px] font-semibold leading-7 sm:text-[24px] sm:leading-8`} style={{ color: figure.tone ? TONE_COLOR[figure.tone] : "var(--oa-fg)" }}>
                    {figure.value}
                  </p>
                  <p className="text-[13px] leading-5 text-oa-fg">{figure.label}</p>
                  {figure.line ? <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">{figure.line}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {data.chart ? (
            <div className="border-t border-oa-border">
              <PricePanel
                ticker={ticker}
                {...packed(data.chart.ranges)}
                events={[]}
                currency="$"
                defaultRange={data.chart.ranges.some((range) => range.key === "1Y") ? "1Y" : "6M"}
              />
            </div>
          ) : null}
        </Panel>

        {inside.top.length || inside.sectors ? (
          <div className={`grid grid-cols-1 gap-4 ${both ? "lg:grid-cols-2" : ""}`}>
            {inside.top.length ? (
              <Panel label="Top 10 holdings" meta={inside.companyCount > 10 ? `of ${inside.companyCount.toLocaleString("en-US")} companies` : undefined}>
                <div className={`${LIST_BOX} max-h-[22rem] ${both ? "lg:h-[24rem] lg:max-h-none" : ""}`}>
                  <HoldingRows rows={inside.top} />
                </div>
              </Panel>
            ) : null}
            {inside.sectors ? (
              <Panel label="Sectors against the S&P 500" meta={<SectorKey ticker={ticker} />}>
                <div className={`${LIST_BOX} max-h-[24rem] ${both ? "lg:h-[24rem] lg:max-h-none" : ""}`}>
                  <SectorBars rows={inside.sectors} ticker={ticker} />
                </div>
              </Panel>
            ) : null}
          </div>
        ) : null}

        {overlap ? <Suspense fallback={null}>{overlap}</Suspense> : null}

        {doc?.asOf ? (
          <p className="px-1 text-[12.5px] leading-[18px] text-oa-muted-fg" title="SEC Form N-PORT">
            Holdings as of {fmtDate(doc.asOf)}
            {doc.filedAt ? `, filed ${fmtDate(doc.filedAt)}` : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** How much of the fund is stocks the reader already holds directly, and which. Not shown when none are. */
export function FundOverlapPanel({ ticker, overlap }: { ticker: string; overlap: { pct: number; stocks: FundHoldingRow[] } | null }) {
  if (!overlap || overlap.pct <= 0) return null;
  return (
    <Panel label="Overlap with your stocks">
      <div className="flex flex-col gap-3 px-3.5 py-3 sm:px-4">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={`${NUM} text-[24px] font-semibold leading-8 text-oa-fg`}>{pctText(overlap.pct)}</span>
          <span className="text-[14px] leading-5 text-oa-muted-fg">
            of {ticker} is in {overlap.stocks.length === 1 ? "a stock" : `${overlap.stocks.length} stocks`} you already hold
          </span>
        </p>
        <ul role="list" className="flex flex-wrap gap-2">
          {overlap.stocks.map((row) => (
            <li key={row.ticker}>
              <AppLink
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                title={row.name}
                className="flex items-center gap-2 rounded-full border border-oa-border px-2.5 py-1 text-[13px] transition-colors hover:bg-oa-accent"
              >
                <StockLogo ticker={row.ticker} size={18} circle eager />
                <span className="oa-mono font-semibold text-oa-fg">{row.ticker}</span>
                <span className={`${NUM} text-oa-muted-fg`}>{pctText(row.weightPct)}</span>
              </AppLink>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
