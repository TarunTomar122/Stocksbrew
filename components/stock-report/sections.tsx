import type { ReactNode } from "react";
import { todayET } from "@/lib/calendar-shared";

import { StockLogo } from "@/components/stock-logo";
import { multiplePercentile } from "@/lib/stock-chart";
import { parseMonthPeriod } from "@/lib/stock-timeline";
import { isBalanceSheetFinancial } from "@/lib/financial-company";
import {
  balanceReading,
  businessHeadline,
  cashFlowReading,
  chronologicalHistory,
  growthReading,
  overviewReadings,
  ownershipHeadline,
  rangeReading,
  rsiReading,
  trendReading,
  valuationHeadline,
  valuationRows,
  type Reading,
} from "@/lib/stock-readings";
import { historyJudged, markFor, moodWord, multipleVsHistory, multipleVsSector, netFlow, priceVsTarget, scoreVerdict, sentenceOutcome, type ToneWord } from "@/lib/tone";

import { CompareBars, MiniBars, MiniLines, RangeTrack, RatingColumns, ShareRows, Spark, type RangeMarker } from "./charts";
import {
  clipText,
  compactMoney,
  compactNumber,
  daysBetween,
  fin,
  fmtDate,
  fmtStamp,
  levelFormatter,
  moneyFormatter,
  multiple,
  perShare,
  plainPct,
  relativeDays,
  shortPeriod,
  signedPct,
  wholeGap,
} from "./format";
import { Details, MarkSlot, Missing, MoreLink, NUM, Panel, PROSE, ReportSection, Row, StatGrid, Tag, TONE_COLOR, ToneGlyph, Verdict, type SectionId, type Tone } from "./primitives";
import type { SectionData } from "./types";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

type SectionProps = { data: SectionData };

const READING_TONE: Record<Reading["tone"], Tone> = { good: "up", bad: "down", neutral: "flat" };

/** The header chip of the Multiples table is about the P/E row, so it says so: "P/E pricey vs sector". */
function peWord(word: ToneWord | null): ToneWord | null {
  return word ? { tone: word.tone, word: `P/E ${word.word.charAt(0).toLowerCase()}${word.word.slice(1)}` } : null;
}

/** A verdict chip from a lib/tone word, or nothing. */
function VerdictOf({ word, className = "" }: { word: ToneWord | null; className?: string }) {
  return word ? (
    <Verdict tone={word.tone} className={className}>
      {word.word}
    </Verdict>
  ) : null;
}

function Readings({ items }: { items: Array<Reading | null> }) {
  const rows = items.filter((item): item is Reading => Boolean(item));
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.statement}
          className="flex flex-col gap-1.5 border-b border-oa-border px-3.5 py-2.5 text-[14px] leading-5 text-oa-fg last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4"
        >
          {/* The chip says the tone in a word; no coloured edge as well (owner rule 6). */}
          <span className="min-w-0 text-pretty">{row.statement}</span>
          <Verdict tone={READING_TONE[row.tone]} className="self-start sm:mt-px">
            {row.verdict}
          </Verdict>
        </li>
      ))}
    </ul>
  );
}

/** The instruments job writes "X tracked in the US core universe." when it has no profile. That is not a description. */
function realDescription(text: string | null | undefined): boolean {
  const clean = String(text ?? "").trim();
  return clean.length >= 60 && !/tracked in the .* universe/i.test(clean);
}

/** Banks, insurers and lenders: free cash flow, net cash, debt and cash-flow multiples mislead for them. */
function balanceSheetBusiness(data: SectionData): boolean {
  return isBalanceSheetFinancial({ sector: data.stock.sector, industry: data.stock.industry, ticker: data.stock.ticker });
}

/** The multiples a reader can compare. Price to free cash flow and EV / EBITDA mean nothing for a bank. */
function multipleRows(data: SectionData) {
  const { facts, fundamentals } = data;
  const balanceSheet = balanceSheetBusiness(data);
  return valuationRows({
    pe: fundamentals?.pe_ttm ?? facts?.quick_stats?.pe_ttm,
    forwardPe: facts?.valuation?.forward_pe,
    priceToSales: facts?.valuation?.price_to_sales,
    priceToFcf: balanceSheet ? null : facts?.valuation?.price_to_fcf,
    evToEbitda: balanceSheet ? null : facts?.valuation?.ev_to_ebitda,
    sectorMetrics: data.intelPro?.pillars?.valuation?.metrics,
  });
}

function hasHistory(data: SectionData): boolean {
  return chronologicalHistory(data.facts?.financial_history).filter((row) => fin(row.revenue) || fin(row.eps_diluted)).length >= 2;
}

function scoredPillars(data: SectionData) {
  const pillars = data.intelPro?.pillars;
  if (!pillars) return [];
  return (["growth", "quality", "valuation", "momentum"] as const)
    .map((key) => ({ key, pillar: pillars[key] }))
    .filter(({ pillar }) => pillar && fin(pillar.score) && pillar.confidence !== "insufficient" && pillar.verdict !== "insufficient data");
}

/** Which sections have real content. Empty ones are dropped from the page and the rail. */
export function sectionAvailability(data: SectionData): Record<SectionId, boolean> {
  const { facts, technicals } = data;
  const hasValuation =
    multipleRows(data).length > 0 ||
    Boolean(data.multiple) ||
    fin(facts?.analyst?.target_price);
  const hasTechnicals =
    fin(technicals?.rsi_14?.value) ||
    fin(technicals?.moving_averages?.sma_50) ||
    fin(technicals?.moving_averages?.sma_200) ||
    fin(facts?.returns?.one_year_pct) ||
    Boolean(data.series?.longReturns.length);
  return {
    overview:
      realDescription(data.stock.description) ||
      Boolean(facts?.financials?.revenue) ||
      Boolean(facts?.business_segments?.items?.length) ||
      scoredPillars(data).length > 0,
    financials: hasHistory(data) || (!balanceSheetBusiness(data) && fin(facts?.balance?.cash_and_investments) && fin(facts?.balance?.total_debt)),
    valuation: hasValuation,
    earnings: Boolean(data.earnings.next || data.earnings.past.length || data.earnings.intel || data.earnings.pre),
    // US stocks always get the section: it says what we hold and what we do not.
    ownership: data.market === "US" || Boolean(facts?.institutions?.top_holders?.length),
    news: data.news.length > 0 || Boolean(data.reddit),
    technicals: hasTechnicals,
    peers: data.peers.length > 0,
  };
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function OverviewSection({ data }: SectionProps) {
  const { stock, facts, currency } = data;
  // The header's yield (annual dividend over today's price); the stored one was worked out at an older price.
  const yieldPct = data.fundamentals?.dividend_yield_pct ?? facts?.dividends?.yield_pct;
  const description = realDescription(stock.description) ? clipText(stock.description!, 460) : null;
  const fin0 = facts?.financials;
  const history = chronologicalHistory(facts?.financial_history);
  const latest = history[history.length - 1];
  const pillars = scoredPillars(data);
  const overall = data.intelPro?.overall;
  const segments = facts?.business_segments?.items ?? [];
  const regions = facts?.geographic_mix?.items ?? [];
  const balanceSheet = balanceSheetBusiness(data);
  const readings = overviewReadings(facts, currency, balanceSheet);

  const stats = [
    fin(fin0?.revenue) ? { label: `Revenue (${fin0?.fiscal_year || "TTM"})`, value: compactMoney(fin0.revenue, currency) } : null,
    fin(fin0?.revenue_growth_yoy_pct)
      ? { label: "Revenue growth, 1 year", value: signedPct(fin0.revenue_growth_yoy_pct), tone: markFor("revenueGrowth", fin0.revenue_growth_yoy_pct) }
      : null,
    fin(fin0?.net_income) ? { label: "Net income", value: compactMoney(fin0.net_income, currency), tone: fin0.net_income < 0 ? ("down" as Tone) : undefined } : null,
    fin(fin0?.eps_diluted) ? { label: "EPS (diluted)", value: perShare(fin0.eps_diluted, currency), tone: fin0.eps_diluted < 0 ? ("down" as Tone) : undefined } : null,
    fin(latest?.gross_margin_pct) ? { label: "Gross margin", value: plainPct(latest.gross_margin_pct), tone: markFor("grossMargin", latest.gross_margin_pct) } : null,
    fin(latest?.operating_margin_pct)
      ? { label: "Operating margin", value: plainPct(latest.operating_margin_pct), tone: markFor("operatingMargin", latest.operating_margin_pct) }
      : null,
    fin(facts?.quality?.roe_pct) ? { label: "Return on equity", value: plainPct(facts.quality.roe_pct), tone: markFor("roe", facts.quality.roe_pct) } : null,
    fin(facts?.quality?.roic_pct) ? { label: "Return on capital", value: plainPct(facts.quality.roic_pct), tone: markFor("roic", facts.quality.roic_pct) } : null,
    // A bank's debt to equity is the leverage it is built on, and it has no current ratio: both read as alarms that are not.
    !balanceSheet && fin(facts?.quality?.debt_to_equity)
      ? { label: "Debt / equity", value: facts.quality.debt_to_equity.toFixed(2), tone: markFor("debtToEquity", facts.quality.debt_to_equity) }
      : null,
    !balanceSheet && fin(facts?.quality?.current_ratio) ? { label: "Current ratio", value: facts.quality.current_ratio.toFixed(2), tone: markFor("currentRatio", facts.quality.current_ratio) } : null,
    fin(yieldPct) && yieldPct > 0 ? { label: "Dividend yield", value: plainPct(yieldPct, 2) } : null,
    balanceSheet && fin(facts?.dividends?.payout_ratio_pct) && facts.dividends.payout_ratio_pct > 0
      ? { label: "Payout ratio", value: plainPct(facts.dividends.payout_ratio_pct) }
      : null,
    fin(facts?.dividends?.buyback_yield_pct) ? { label: "Buyback yield", value: plainPct(facts.dividends.buyback_yield_pct, 2) } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <ReportSection id="overview" lede={businessHeadline(facts, balanceSheet)}>
      {description ? (
        <Panel label="What it does" meta={[stock.exchange, stock.country].filter(Boolean).join(" · ") || undefined}>
          <p className={`px-3.5 py-3 sm:px-4 ${PROSE}`}>{description}</p>
          <div className="border-t border-oa-border">
            <Readings items={readings} />
          </div>
        </Panel>
      ) : (
        <Panel label="In plain numbers">
          <Readings items={readings} />
        </Panel>
      )}

      {stats.length ? (
        <Panel label="Key figures">
          <StatGrid items={stats} />
        </Panel>
      ) : null}

      {segments.length || regions.length ? (
        <div className={`grid gap-3 ${segments.length && regions.length ? "md:grid-cols-2" : ""}`}>
          {segments.length ? (
            <Panel label="Revenue by business" meta={facts?.business_segments?.period ? `period ending ${facts.business_segments.period}` : undefined}>
              <ShareRows
                items={segments.slice(0, 6).map((item) => ({ name: item.name, sharePct: item.share_pct, value: item.value }))}
                formatValue={(value) => compactMoney(value, currency)}
              />
            </Panel>
          ) : null}
          {regions.length ? (
            <Panel label="Revenue by region" meta={facts?.geographic_mix?.period ? `period ending ${facts.geographic_mix.period}` : undefined}>
              <ShareRows
                items={regions.slice(0, 6).map((item) => ({ name: item.name, sharePct: item.share_pct, value: item.value }))}
                formatValue={(value) => compactMoney(value, currency)}
              />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {pillars.length ? (
        <Panel label="Fundamentals score" meta="vs sector peers">
          <div className="grid gap-px bg-oa-border sm:grid-cols-[11rem_minmax(0,1fr)]">
            {overall && fin(overall.score) && overall.confidence !== "insufficient" ? (
              <div className="bg-oa-card px-3.5 py-3 sm:px-4">
                <p className="text-[12px] leading-4 text-oa-muted-fg">Overall, out of 100</p>
                <p className={`${NUM} mt-0.5 text-[30px] font-medium leading-9 text-oa-fg`}>{Math.round(overall.score)}</p>
                <ScoreWord verdict={overall.verdict} className="mt-1" />
              </div>
            ) : null}
            <div className="bg-oa-card">
              {pillars.map(({ key, pillar }) => (
                // The score is the figure; no bar repeating it beside the number (owner rule 5).
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_2rem_4.75rem] items-center gap-x-3 border-b border-oa-border px-3.5 py-2 text-[14px] leading-5 last:border-b-0 sm:px-4">
                  <span className="capitalize text-oa-muted-fg">{key}</span>
                  <span className={`${NUM} text-right text-oa-fg`}>{Math.round(pillar.score)}</span>
                  <span className="flex justify-end">
                    <ScoreWord verdict={pillar.verdict} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}
    </ReportSection>
  );
}

/** The scoring model's own word (strong, solid, mixed, weak) as a chip in its tone. */
function ScoreWord({ verdict, className = "" }: { verdict: string | null | undefined; className?: string }) {
  const tone = scoreVerdict(verdict);
  const word = String(verdict ?? "").trim();
  if (!word) return null;
  if (!tone) return <span className={`text-[12px] capitalize text-oa-muted-fg ${className}`}>{word}</span>;
  return (
    <Verdict tone={tone} className={`capitalize ${className}`}>
      {word}
    </Verdict>
  );
}

// ─── Financials ──────────────────────────────────────────────────────────────

export function FinancialsSection({ data }: SectionProps) {
  const { facts, currency } = data;
  const rows = chronologicalHistory(facts?.financial_history).slice(-8);
  const label = (period: string) => shortPeriod(period);
  const money = (value: number) => compactMoney(value, "");
  // For a bank or insurer, free cash flow and cash against debt are not what they look like (lib/financial-company.ts).
  const balanceSheet = balanceSheetBusiness(data);
  const growth = growthReading(facts, currency);
  const cash = balanceSheet ? null : cashFlowReading(facts, currency);
  const lede = [growth?.statement, cash?.statement].filter(Boolean).join(" ") || null;

  const bars: Array<{ key: string; title: string; values: Array<number | null | undefined>; format: (value: number) => string; unit: string }> = [
    { key: "revenue", title: "Revenue", values: rows.map((row) => row.revenue), format: money, unit: currency },
    { key: "net", title: "Net income", values: rows.map((row) => row.net_income), format: money, unit: currency },
    { key: "eps", title: "EPS (diluted)", values: rows.map((row) => row.eps_diluted), format: (value: number) => value.toFixed(2), unit: `${currency} per share` },
    { key: "fcf", title: "Free cash flow", values: rows.map((row) => (balanceSheet ? null : row.free_cash_flow)), format: money, unit: currency },
  ].filter((chart) => chart.values.filter(fin).length >= 2);

  const hasMargins = rows.filter((row) => fin(row.gross_margin_pct) || fin(row.operating_margin_pct) || fin(row.profit_margin_pct)).length >= 2;
  const cashNow = balanceSheet ? null : facts?.balance?.cash_and_investments;
  const debtNow = balanceSheet ? null : facts?.balance?.total_debt;
  const balance = balanceSheet ? null : balanceReading(facts, currency);

  return (
    <ReportSection id="financials" lede={lede}>
      <div className="grid gap-3 sm:grid-cols-2">
        {bars.map((chart) => {
          const latest = [...chart.values].reverse().find(fin);
          return (
            <Panel key={chart.key} label={chart.title} meta={latest != null ? `${chart.unit} · latest ${chart.format(latest)}` : chart.unit}>
              <div className="px-3 pb-3 pt-3 sm:px-4">
                <MiniBars rows={rows.map((row, index) => ({ label: label(row.period), value: chart.values[index] }))} format={chart.format} />
              </div>
            </Panel>
          );
        })}
        {hasMargins ? (
          <Panel label="Margins" meta="% of revenue">
            <div className="px-3 pb-3 pt-3 sm:px-4">
              <MiniLines
                periods={rows.map((row) => label(row.period))}
                format={(value) => `${value.toFixed(0)}%`}
                series={[
                  { key: "gross", label: "Gross", color: "var(--oa-muted-fg)", values: rows.map((row) => row.gross_margin_pct) },
                  { key: "operating", label: "Operating", color: "var(--oa-primary)", values: rows.map((row) => row.operating_margin_pct) },
                  { key: "net", label: "Net", color: "var(--oa-fg)", values: rows.map((row) => row.profit_margin_pct) },
                ].filter((series) => series.values.filter(fin).length >= 2)}
              />
            </div>
          </Panel>
        ) : null}
        {fin(cashNow) && fin(debtNow) ? (
          <Panel label="Cash and debt" meta="latest balance sheet">
            <div className="px-3.5 py-3 sm:px-4">
              <CompareBars
                rows={[
                  { label: "Cash and investments", value: cashNow, color: "var(--oa-primary)" },
                  { label: "Total debt", value: debtNow, color: "var(--oa-muted-fg)" },
                ]}
                format={(value) => compactMoney(value, currency)}
              />
              {balance ? (
                <p className="mt-3 flex flex-col items-start gap-1.5 text-[13px] leading-5 text-oa-muted-fg sm:flex-row sm:justify-between sm:gap-4">
                  <span className="min-w-0 text-pretty">{balance.statement}</span>
                  <Verdict tone={READING_TONE[balance.tone]} className="sm:mt-px">
                    {balance.verdict}
                  </Verdict>
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>
    </ReportSection>
  );
}

// ─── Valuation ───────────────────────────────────────────────────────────────

export function ValuationSection({ data }: SectionProps) {
  const { stock, facts, fundamentals, currency, multiple: history } = data;
  const level = levelFormatter(currency);
  const rows = multipleRows(data);
  const peRow = rows.find((row) => row.key === "pe");
  const target = facts?.analyst_trend?.target;
  const analyst = facts?.analyst;
  const targetLow = target?.low ?? analyst?.target_low;
  const targetHigh = target?.high ?? analyst?.target_high;
  const targetMid = target?.median ?? analyst?.target_price ?? target?.average;
  const lede = valuationHeadline({
    ticker: stock.ticker,
    price: stock.price,
    pe: peRow?.value,
    forwardPe: facts?.valuation?.forward_pe,
    priceToSales: facts?.valuation?.price_to_sales,
    sectorPe: peRow?.sector,
    targetMid,
  });
  const anySector = rows.some((row) => row.sector != null);
  const peLive = fundamentals?.pe_ttm;
  const peNow = fin(peLive) && peLive > 0 ? peLive : null;
  const pePercentile = history && peNow != null ? multiplePercentile(history, peNow) : null;
  const historyGapDays = history ? daysBetween(history.lastDate, data.nowIso.slice(0, 10)) : null;
  // Cheap or pricey against its own past only says something over at least a year of data that is still current.
  const historyIsJudged = history ? historyJudged(history.firstDate, history.lastDate, data.nowIso.slice(0, 10)) : false;
  const trend = (facts?.analyst_trend?.recommendation_trend ?? [])
    .map((row) => ({
      at: parseMonthPeriod(row.period) ?? "",
      label: row.period.replace(/\s*'?\d{2,4}$/, ""),
      buy: (row.strong_buy ?? 0) + (row.buy ?? 0),
      hold: row.hold ?? 0,
      sell: (row.sell ?? 0) + (row.strong_sell ?? 0),
    }))
    .filter((row) => row.at)
    .sort((a, b) => a.at.localeCompare(b.at));

  const targetMarkers: RangeMarker[] = [];
  if (fin(targetMid)) targetMarkers.push({ key: "mid", value: targetMid, color: "var(--oa-primary)", shape: "tick", label: "Middle target" });
  targetMarkers.push({ key: "price", value: stock.price, color: "var(--oa-fg)", shape: "dot", label: "Price now" });
  const trackLow = fin(targetLow) ? Math.min(targetLow, stock.price) : null;
  const trackHigh = fin(targetHigh) ? Math.max(targetHigh, stock.price) : null;

  return (
    <ReportSection id="valuation" lede={lede}>
      {rows.length ? (
        <Panel label="Multiples" meta={peRow?.gapPct != null ? <VerdictOf word={peWord(multipleVsSector(peRow.gapPct))} className="font-sans" /> : undefined}>
          <div className={`grid ${anySector ? "grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem]" : "grid-cols-[minmax(0,1fr)_5rem]"} gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[11px] uppercase leading-4 tracking-[0.06em] text-oa-muted-fg sm:px-4`}>
            <span>Multiple</span>
            <span className="text-right">{stock.ticker}</span>
            {anySector ? <span className="text-right">Sector</span> : null}
            {anySector ? <span className="text-right">Gap</span> : null}
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className={`grid ${anySector ? "grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem]" : "grid-cols-[minmax(0,1fr)_5rem]"} min-h-9 items-center gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[14px] leading-5 last:border-b-0 sm:px-4`}
            >
              <span className="min-w-0 truncate text-oa-muted-fg">{row.label}</span>
              <span className={`${NUM} text-right text-oa-fg`}>{multiple(row.value)}</span>
              {anySector ? <span className={`${NUM} text-right text-oa-muted-fg`}>{row.sector != null ? multiple(row.sector) : ""}</span> : null}
              {anySector ? (
                <GapCell gapPct={row.gapPct} />
              ) : null}
            </div>
          ))}
        </Panel>
      ) : null}

      {history ? (
        <Panel
          label="P/E against its own history"
          meta={`${fmtDate(history.firstDate)} to ${fmtDate(history.lastDate)}`}
        >
          <div className="grid gap-x-6 gap-y-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:px-4">
            <div className="min-w-0">
              <Spark
                values={history.points.map((point) => point.value)}
                reference={history.median}
                label={`Trailing P/E from ${fmtDate(history.firstDate)} to ${fmtDate(history.lastDate)}: low ${history.low.toFixed(1)}, high ${history.high.toFixed(1)}, median ${history.median.toFixed(1)}`}
              />
              <div className="mt-2 flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-4">
              <p className="min-w-0 text-pretty text-[13px] leading-5 text-oa-muted-fg">
                {peNow != null ? (
                  <>
                    At {multiple(peNow)} earnings today, {stock.ticker} is{" "}
                    {pePercentile! >= 99.5
                      ? "above every day"
                      : pePercentile! <= 0.5
                        ? "below every day"
                        : `higher than on ${Math.round(pePercentile!)}% of the days`}{" "}
                    in this window.{" "}
                  </>
                ) : null}
                {historyGapDays != null && historyGapDays > 7 ? `Last reading ${fmtDate(history.lastDate)}.` : ""}
              </p>
              <VerdictOf word={historyIsJudged ? multipleVsHistory(pePercentile) : null} className="sm:mt-px" />
              </div>
            </div>
            <dl className="grid grid-cols-4 gap-x-3 sm:grid-cols-2 sm:gap-y-2">
              {[
                ...(peNow != null ? [["Today", peNow] as const] : []),
                ["Median", history.median] as const,
                ["Low", history.low] as const,
                ["High", history.high] as const,
              ].map(([name, value]) => (
                <div key={name}>
                  <dt className="text-[12px] leading-4 text-oa-muted-fg">{name}</dt>
                  <dd className={`${NUM} text-[15px] font-medium leading-6 text-oa-fg`}>{multiple(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      ) : null}

      {fin(targetMid) || trend.length >= 2 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {fin(targetMid) ? (
            <Panel label="Analyst price targets" meta={<VerdictOf word={priceVsTarget(((targetMid - stock.price) / stock.price) * 100)} className="font-sans" />}>
              <div className="px-3.5 py-3 sm:px-4">
                {trackLow != null && trackHigh != null && trackHigh > trackLow ? (
                  <RangeTrack low={trackLow} high={trackHigh} markers={targetMarkers} format={level} />
                ) : null}
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5 text-oa-muted-fg">
                  <span>
                    <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-oa-fg" />
                    Price <span className={`${NUM} text-oa-fg`}>{level(stock.price)}</span>
                  </span>
                  <span>
                    <span aria-hidden="true" className="mr-1.5 inline-block h-3 w-[3px] translate-y-0.5 rounded-full bg-oa-primary" />
                    Middle target <span className={`${NUM} text-oa-fg`}>{level(targetMid)}</span>{" "}
                    <span className={`${NUM} text-oa-muted-fg`}>({wholeGap(((targetMid - stock.price) / stock.price) * 100)})</span>
                  </span>
                </div>
                {fin(analyst?.analyst_count) && analyst.analyst_count > 0 ? (
                  <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">
                    {analyst.analyst_count} analysts{analyst.label ? `, consensus ${analyst.label.toLowerCase()}` : ""}.
                  </p>
                ) : null}
              </div>
            </Panel>
          ) : null}
          {trend.length >= 2 ? (
            <Panel label="Analyst ratings by month" meta="buy · hold · sell">
              <div className="px-3 pb-3 pt-3 sm:px-4">
                <RatingColumns months={trend.slice(-6)} />
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </ReportSection>
  );
}

/**
 * How far a multiple sits from its sector, in normal ink with a mark: a higher
 * multiple is pricier, so a red "+40%" would read as good news. The mark says
 * cheap or pricey; within 10% gets none.
 */
function GapCell({ gapPct }: { gapPct: number | null }) {
  if (gapPct == null) return <span />;
  const word = multipleVsSector(gapPct);
  return (
    <span className={`${NUM} inline-flex items-center justify-end gap-1.5 text-right text-oa-fg`} title={word?.word}>
      {wholeGap(gapPct)}
      <MarkSlot tone={word?.tone} />
    </span>
  );
}

// ─── Earnings ────────────────────────────────────────────────────────────────

const OUTLOOK_WORDS: Record<string, string> = { beat: "a beat", inline: "in line", miss: "a miss" };
const MOVE_WORDS: Record<string, string> = { rally: "a rally", fade: "a selloff", chop: "a choppy reaction" };

export function EarningsSection({ data }: SectionProps) {
  const { stock, earnings, currency } = data;
  const today = todayET(Number.isFinite(Date.parse(data.nowIso)) ? Date.parse(data.nowIso) : Date.now());
  const next = earnings.next;
  const nextIn = next ? daysBetween(today, next.event_date) : null;
  const report = earnings.intel?.report;
  const pre = earnings.pre?.report;
  const past = earnings.past.filter((event) => event.event_date < today).slice(-6).reverse();
  const lastReported = [past[0]?.event_date, earnings.intel?.event_date]
    .filter((day): day is string => Boolean(day) && day! <= today)
    .sort()
    .pop();
  const lede =
    next && nextIn != null && nextIn >= 0
      ? `${stock.ticker} reports ${relativeDays(nextIn)}, on ${fmtDate(next.event_date)}${next.time === "bmo" ? " before the market opens" : next.time === "amc" ? " after the close" : ""}.`
      : lastReported
        ? `${stock.ticker} last reported on ${fmtDate(lastReported)}. We do not have the next date yet.`
        : null;

  return (
    <ReportSection id="earnings" lede={lede}>
      {next && nextIn != null && nextIn >= 0 ? (
        <Panel label="Next report">
          <StatGrid
            items={[
              { label: "Date", value: fmtDate(next.event_date), sub: relativeDays(nextIn) },
              { label: "When", value: next.time === "bmo" ? "Before the market opens" : next.time === "amc" ? "After the market closes" : "During market hours" },
              ...(fin(next.eps_estimate) ? [{ label: "EPS estimate", value: perShare(next.eps_estimate, currency) }] : []),
              ...(next.fiscal_date_ending ? [{ label: "Quarter ending", value: fmtDate(next.fiscal_date_ending) }] : []),
            ]}
          />
        </Panel>
      ) : null}

      {pre ? (
        <Panel label="Going in">
          <div className="px-3.5 py-3 sm:px-4">
            <h3 className="text-[16px] font-medium leading-6 text-oa-fg">{pre.headline}</h3>
            <p className={`mt-1 ${PROSE}`}>{pre.summary}</p>
            {pre.call?.eps_outlook && OUTLOOK_WORDS[pre.call.eps_outlook] ? (
              <p className="mt-2 text-[14px] leading-5 text-oa-muted-fg">
                Our lean: {OUTLOOK_WORDS[pre.call.eps_outlook]} on EPS
                {pre.call.post_print_move && MOVE_WORDS[pre.call.post_print_move] ? `, then ${MOVE_WORDS[pre.call.post_print_move]}` : ""}. It can be wrong.
              </p>
            ) : null}
          </div>
          {pre.setup?.key_bull_case?.length || pre.setup?.key_bear_case?.length ? (
            <div className="grid border-t border-oa-border md:grid-cols-2">
              {pre.setup?.key_bull_case?.length ? (
                <div className="border-b border-oa-border px-3.5 py-3 sm:px-4 md:border-b-0 md:border-r">
                  <h4 className="oa-label">What could go right</h4>
                  <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[14px] leading-5 text-oa-fg marker:text-oa-muted-fg">
                    {pre.setup.key_bull_case.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pre.setup?.key_bear_case?.length ? (
                <div className="px-3.5 py-3 sm:px-4">
                  <h4 className="oa-label">What could go wrong</h4>
                  <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[14px] leading-5 text-oa-fg marker:text-oa-muted-fg">
                    {pre.setup.key_bear_case.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {earnings.intel && report ? (
        <Panel label={`Our write-up · ${fmtDate(earnings.intel.event_date)} report`}>
          {earnings.intelLocked ? (
            <p className="px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg sm:px-4">
              {stock.ticker} reported on {fmtDate(earnings.intel.event_date)}. Our write-up of the results, guidance and the reaction is part of Pro.{" "}
              <MoreLink href="/pricing">See Pro</MoreLink>
            </p>
          ) : (
            <>
              <div className="px-3.5 py-3 sm:px-4">
                <h3 className="text-[16px] font-medium leading-6 text-oa-fg">{report.headline}</h3>
                {report.summary ? <p className={`mt-1 ${PROSE}`}>{clipText(report.summary, 420)}</p> : null}
              </div>
              <div className="border-t border-oa-border">
                {report.facts?.reported_vs_expected ? (
                  <FactRow label="Results vs expectations" text={report.facts.reported_vs_expected} word={sentenceOutcome(report.facts.reported_vs_expected, "results")} />
                ) : null}
                {report.facts?.guidance_signal ? <FactRow label="Guidance" text={report.facts.guidance_signal} word={sentenceOutcome(report.facts.guidance_signal, "guidance")} /> : null}
                {report.facts?.price_reaction ? <FactRow label="Price reaction" text={report.facts.price_reaction} /> : null}
              </div>
              <p className="border-t border-oa-border px-3.5 py-2 sm:px-4">
                <MoreLink href={`/calendar/earnings/${encodeURIComponent(stock.ticker)}`}>Read the full earnings report</MoreLink>
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {past.length ? (
        <Panel label="Earlier report dates">
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-3.5 py-2.5 sm:px-4">
            {past.map((event) => (
              <span key={event.event_date} className={`${NUM} text-[13px] leading-5 text-oa-fg`}>
                {fmtDate(event.event_date)}
                {fin(event.eps_estimate) ? <span className="text-oa-muted-fg"> · est. {perShare(event.eps_estimate, currency)}</span> : null}
              </span>
            ))}
          </div>
        </Panel>
      ) : null}
    </ReportSection>
  );
}

function FactRow({ label, text, word = null }: { label: string; text: string; word?: ToneWord | null }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 border-b border-oa-border px-3.5 py-2 text-[14px] leading-5 last:border-b-0 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:px-4">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 self-start text-oa-muted-fg">
        {label}
        <VerdictOf word={word} />
      </span>
      <span className="text-pretty text-oa-fg">{text}</span>
    </div>
  );
}

// ─── Ownership ───────────────────────────────────────────────────────────────

const FUND_ACTION: Record<string, { label: string; tone: Tone | "primary" }> = {
  new: { label: "New", tone: "primary" },
  added: { label: "Added", tone: "up" },
  trimmed: { label: "Trimmed", tone: "down" },
  held: { label: "Held", tone: "flat" },
};

export function OwnershipSection({ data }: SectionProps) {
  const { stock, facts, ownership, congress, currency } = data;
  const today = todayET(Number.isFinite(Date.parse(data.nowIso)) ? Date.parse(data.nowIso) : Date.now());
  const funds = ownership.funds;
  const insiders = ownership.insiders;
  const edgarForm4 = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(stock.ticker)}&type=4&dateb=&owner=include&count=40`;
  const institutions = facts?.institutions;
  const holders = (institutions?.top_holders ?? []).filter((row) => row.name);
  const recentCongress = (congress ?? []).filter((trade) => {
    const days = daysBetween(trade.transaction_date, today);
    return days != null && days <= 365;
  });
  const buys = recentCongress.filter((trade) => trade.tx_type === "buy").length;
  const sells = recentCongress.filter((trade) => trade.tx_type === "sell").length;
  // Funds: who added or opened against who trimmed or sold out, by count of funds.
  const fundsFlow = funds ? netFlow(funds.added, funds.cut, "Funds") : null;
  // Insiders: by dollars, leaving out pre-planned 10b5-1 sales, which are scheduled months ahead and say little.
  const insiderRows = (insiders?.rows ?? []).filter((row) => !row.planned);
  // Some filings carry no dollar value; then count trades instead.
  const insiderSide = (action: "buy" | "sell", dollars: boolean) =>
    insiderRows.filter((row) => row.action === action).reduce((sum, row) => sum + (dollars ? row.valueUsd ?? 0 : 1), 0);
  const insiderDollars = insiderSide("buy", true) + insiderSide("sell", true) > 0;
  const insiderFlow = netFlow(insiderSide("buy", insiderDollars), insiderSide("sell", insiderDollars), "Insiders");
  const lede = ownershipHeadline({
    ticker: stock.ticker,
    institutionalPct: institutions?.ownership_pct ?? facts?.quick_stats?.institutional_ownership_pct,
    congressBuys: buys,
    congressSells: sells,
    congressOther: recentCongress.length - buys - sells,
    windowDays: 365,
    hasCongressFeed: congress != null,
  });

  return (
    <ReportSection id="ownership" lede={lede}>
      {data.market === "US" ? (
        <Panel label="Funds we follow" meta={<MetaWith word={fundsFlow}>13F filings</MetaWith>}>
          {!funds ? (
            <Missing>
              No fund holdings for {stock.ticker} yet.{" "}
              <MoreLink href="/follow">See the funds we follow</MoreLink>
            </Missing>
          ) : funds.rows.length === 0 && funds.exits.length === 0 ? (
            <Missing>
              None of the funds we follow listed {stock.ticker} among their top positions in their latest 13F.{" "}
              <MoreLink href="/follow">See the funds we follow</MoreLink>
            </Missing>
          ) : (
            <>
              {funds.rows.slice(0, 8).map((row) => {
                const action = row.action ? FUND_ACTION[row.action] : null;
                return (
                  <AppLink
                    key={row.slug}
                    href={row.href}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-oa-border px-3.5 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-medium leading-5 text-oa-fg">
                        <span className="truncate">{row.fund}</span>
                        {action ? <Tag tone={action.tone}>{action.label}</Tag> : null}
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-oa-muted-fg">
                        {[row.manager, row.quarter || fmtDate(row.reportDate), row.filedDate ? `filed ${fmtDate(row.filedDate)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`${NUM} block text-[14px] leading-5 text-oa-fg`}>
                        {row.portfolioPct != null ? `${row.portfolioPct.toFixed(row.portfolioPct >= 10 ? 0 : 1)}% of book` : row.valueUsd != null ? compactMoney(row.valueUsd, currency) : ""}
                      </span>
                      <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg`}>
                        {[
                          row.portfolioPct != null && row.valueUsd != null ? compactMoney(row.valueUsd, currency) : null,
                          row.changePct != null && row.action !== "new" ? `${signedPct(row.changePct, 0)} shares` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </AppLink>
                );
              })}
              {funds.exits.slice(0, 4).map((row) => (
                <AppLink
                  key={`exit-${row.slug}`}
                  href={row.href}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-oa-border px-3.5 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] font-medium leading-5 text-oa-fg">
                      <span className="truncate">{row.fund}</span>
                      <Tag tone="down">Sold out</Tag>
                    </span>
                    <span className="block truncate text-[12px] leading-4 text-oa-muted-fg">
                      {[row.manager, row.quarter || fmtDate(row.reportDate), row.filedDate ? `filed ${fmtDate(row.filedDate)}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`${NUM} text-right text-[12px] leading-5 text-oa-muted-fg`}>
                    {row.prevPortfolioPct != null ? `was ${row.prevPortfolioPct.toFixed(1)}% of book` : ""}
                  </span>
                </AppLink>
              ))}
              <p className="px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
                {funds.holderCount > 8 ? `${funds.holderCount} followed funds hold it; top eight shown. ` : ""}
                Long positions at quarter end, filed up to 45 days later.
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {congress != null ? (
        <Panel label="Congress" meta={<MetaWith word={netFlow(buys, sells, "Congress")}>last 12 months</MetaWith>}>
          {recentCongress.length === 0 ? (
            <Missing>
              No disclosed congressional trades in {stock.ticker} in the last 12 months.{" "}
              <MoreLink href="/follow?tab=congress">All congressional trades</MoreLink>
            </Missing>
          ) : (
            <>
              {recentCongress.slice(0, 8).map((trade) => {
                const buy = trade.tx_type === "buy";
                const sell = trade.tx_type === "sell";
                const range =
                  trade.amount_low != null && trade.amount_high != null
                    ? `${compactMoney(trade.amount_low, "$")} to ${compactMoney(trade.amount_high, "$")}`
                    : trade.amount_low != null
                      ? `${compactMoney(trade.amount_low, "$")} or more`
                      : "Amount not disclosed";
                return (
                  <Link prefetch={false}
                    key={trade.trade_id}
                    href={data.followSlugs.includes(trade.person_id) ? `/follow/${trade.person_id}` : "/follow?tab=congress"}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-oa-border px-3.5 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-medium leading-5 text-oa-fg">
                        <span className="truncate">{trade.person_name}</span>
                        <Tag tone={buy ? "up" : sell ? "down" : "flat"}>{buy ? "Bought" : sell ? "Sold" : "Traded"}</Tag>
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-oa-muted-fg">
                        {[
                          [trade.party, trade.state].filter(Boolean).join("-"),
                          trade.chamber ? trade.chamber.charAt(0).toUpperCase() + trade.chamber.slice(1) : null,
                          trade.disclosure_date ? `disclosed ${fmtDate(trade.disclosure_date, false)}${fin(trade.lag_days) && trade.lag_days > 0 ? `, ${trade.lag_days}d later` : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`${NUM} block text-[14px] leading-5 text-oa-fg`}>{range}</span>
                      <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg`}>traded {fmtDate(trade.transaction_date)}</span>
                    </span>
                  </Link>
                );
              })}
              <p className="px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
                {recentCongress.length > 8 ? `${recentCongress.length} trades; latest eight shown. ` : ""}
                Amounts are disclosed as ranges, up to 45 days after the trade.{" "}
                <MoreLink href="/follow?tab=congress">All congressional trades</MoreLink>
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {data.market === "US" ? (
        <Panel label="Insiders" meta={<MetaWith word={insiderFlow}>open-market trades</MetaWith>}>
          {!insiders ? (
            <Missing>
              No insider trades for {stock.ticker} yet.{" "}
              <MoreLink href={edgarForm4} external>
                Form 4 filings on SEC EDGAR
              </MoreLink>
            </Missing>
          ) : insiders.rows.length === 0 ? (
            <Missing>
              No open-market insider buys or sales in {stock.ticker}
              {insiders.since ? ` since ${fmtDate(insiders.since)}` : ""}.{" "}
              <MoreLink href="/follow?tab=insiders">Insider trades across the market</MoreLink>
            </Missing>
          ) : (
            <>
              {insiders.rows.slice(0, 8).map((row) => {
                const buy = row.action === "buy";
                const body = (
                  <>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-medium leading-5 text-oa-fg">
                        <span className="truncate">{row.insider}</span>
                        <Tag tone={buy ? "up" : "down"}>{buy ? "Bought" : "Sold"}</Tag>
                        {row.planned ? <Tag>10b5-1 plan</Tag> : null}
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-oa-muted-fg">
                        {[row.role, row.filedDate ? `filed ${fmtDate(row.filedDate, false)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`${NUM} block text-[14px] leading-5 text-oa-fg`}>
                        {row.valueUsd != null ? compactMoney(row.valueUsd, currency) : row.shares != null ? `${compactNumber(row.shares)} shares` : ""}
                      </span>
                      <span className={`${NUM} block text-[12px] leading-4 text-oa-muted-fg`}>
                        {[row.valueUsd != null && row.shares != null ? `${compactNumber(row.shares)} sh` : null, row.price != null ? `at ${currency}${row.price.toFixed(2)}` : null, fmtDate(row.transactionDate, false)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </>
                );
                const rowClass = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-oa-border px-3.5 py-2 sm:px-4";
                return row.sourceUrl ? (
                  <a key={row.id} href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${rowClass} outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent`}>
                    {body}
                  </a>
                ) : (
                  <div key={row.id} className={rowClass}>
                    {body}
                  </div>
                );
              })}
              <p className="px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
                {insiders.rows.length > 8 ? `${insiders.rows.length} trades; latest eight shown. ` : ""}
                Each row opens the SEC filing.{" "}
                <MoreLink href="/follow?tab=insiders">Insider trades across the market</MoreLink>
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {holders.length ? (
        <Panel label="Largest institutional holders">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem] gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[11px] uppercase leading-4 tracking-[0.06em] text-oa-muted-fg sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6rem] sm:px-4">
            <span>Holder</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Change</span>
            <span className="hidden text-right sm:block">Reported</span>
          </div>
          {holders.slice(0, 5).map((row) => {
            const change = Number(String(row.change_pct ?? "").replace(/[%,\s]/g, ""));
            return (
              <div
                key={row.name}
                className="grid min-h-9 grid-cols-[minmax(0,1fr)_5.5rem_4.5rem] items-center gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[14px] leading-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6rem] sm:px-4"
              >
                <span className="min-w-0 truncate text-oa-fg">{row.name}</span>
                <span className={`${NUM} text-right text-oa-fg`}>
                  {row.shares && Number.isFinite(Number(row.shares.replace(/,/g, ""))) ? compactNumber(Number(row.shares.replace(/,/g, ""))) : row.shares ?? ""}
                </span>
                <span className={`${NUM} text-right`} style={{ color: Number.isFinite(change) && change !== 0 ? (change > 0 ? TONE_COLOR.up : TONE_COLOR.down) : undefined }}>
                  {Number.isFinite(change) && row.change_pct ? signedPct(change, 1) : ""}
                </span>
                <span className={`${NUM} hidden text-right text-[12px] text-oa-muted-fg sm:block`}>{row.date ?? ""}</span>
              </div>
            );
          })}
          {fin(institutions?.ownership_pct) ? (
            <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
              Institutions hold {institutions.ownership_pct.toFixed(1)}% of the shares
              {institutions.total_holders ? ` across ${Number(institutions.total_holders.replace(/,/g, "")).toLocaleString("en-US")} holders` : ""}.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </ReportSection>
  );
}

/** A panel's header note with a verdict chip in front of it. */
function MetaWith({ word, children }: { word: ToneWord | null; children: ReactNode }) {
  if (!word || word.tone === "flat") return <>{children}</>;
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <Verdict tone={word.tone} className="font-sans">
        {word.word}
      </Verdict>
      <span>{children}</span>
    </span>
  );
}

// ─── News ────────────────────────────────────────────────────────────────────

export function NewsSection({ data }: SectionProps) {
  const { stock, news, reddit } = data;
  return (
    <ReportSection id="news">
      {news.length ? (
        <Panel label={`Latest on ${stock.ticker}`} meta={`${news.length} ${news.length === 1 ? "article" : "articles"} · last 14 days`}>
          {news.slice(0, 8).map((article) => (
            <NewsRow key={article.id || article.url} article={article} />
          ))}
          {news.length > 8 ? (
            <Details summary={`${news.length - 8} more`} track={{ section: "news", ticker: stock.ticker }}>
              {news.slice(8).map((article) => (
                <NewsRow key={article.id || article.url} article={article} />
              ))}
            </Details>
          ) : null}
        </Panel>
      ) : (
        <Panel label={`Latest on ${stock.ticker}`}>
          <Missing>No news on {stock.ticker} in the last 14 days.</Missing>
        </Panel>
      )}
      {reddit ? (
        <Panel label="On Reddit" meta={<VerdictOf word={moodWord(reddit.sentiment)} className="font-sans" />}>
          <p className="px-3.5 py-3 text-[14px] leading-5 text-oa-fg sm:px-4">
            {reddit.postCount} {reddit.postCount === 1 ? "post" : "posts"} mentioned {stock.ticker} recently.
            {reddit.summary ? <span className="text-oa-muted-fg"> {reddit.summary}</span> : null}{" "}
            <MoreLink href="/signals?tab=reddit">What Reddit is talking about</MoreLink>
          </p>
        </Panel>
      ) : null}
    </ReportSection>
  );
}

function NewsRow({ article }: { article: SectionData["news"][number] }) {
  const tone: Tone | undefined = article.sentiment_label === "bullish" ? "up" : article.sentiment_label === "bearish" ? "down" : undefined;
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border-b border-oa-border px-3.5 py-2 outline-none transition-colors last:border-b-0 hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-4"
    >
      <span className="block text-pretty text-[14px] font-medium leading-5 text-oa-fg">{article.title}</span>
      <span className="oa-mono mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-oa-muted-fg">
        <span>{article.source_name || "News"}</span>
        <span>{fmtStamp(article.published_at)}</span>
        {tone ? (
          <span className="inline-flex items-center gap-1">
            <ToneGlyph tone={tone} />
            reads {article.sentiment_label}
          </span>
        ) : null}
      </span>
    </a>
  );
}

// ─── Technicals ──────────────────────────────────────────────────────────────

export function TechnicalsSection({ data }: SectionProps) {
  const { stock, technicals, facts, fundamentals, series, currency } = data;
  const money = moneyFormatter(currency);
  const averages = technicals?.moving_averages;
  const trend = trendReading(stock.price, technicals);
  const lede = trend?.statement ?? null;
  const away = (value: number) => `${Math.abs(((stock.price - value) / value) * 100).toFixed(1)}%`;
  const side = (value: number) => `price is ${away(value)} ${stock.price >= value ? "above" : "below"} it`;
  const averageRows = [
    { label: "20-day average", value: averages?.sma_20 },
    { label: "50-day average", value: averages?.sma_50 ?? fundamentals?.fifty_day_average },
    { label: "200-day average", value: averages?.sma_200 ?? fundamentals?.two_hundred_day_average },
  ].filter((row): row is { label: string; value: number } => fin(row.value) && row.value > 0);
  const returns = [
    { label: "1 month", value: facts?.returns?.one_month_pct },
    { label: "3 months", value: facts?.returns?.three_month_pct },
    { label: "6 months", value: facts?.returns?.six_month_pct },
    { label: "1 year", value: facts?.returns?.one_year_pct },
    ...(series?.longReturns ?? []).map((row) => ({ label: row.label.replace("Y", row.label === "1Y" ? " year" : " years"), value: row.pct })),
  ].filter((row): row is { label: string; value: number } => fin(row.value));
  const rsi = technicals?.rsi_14?.value;
  const high52 = fundamentals?.week_52_high;
  const low52 = fundamentals?.week_52_low;
  const levels = technicals?.levels;

  return (
    <ReportSection id="technicals" lede={lede}>
      <div className="grid gap-3 md:grid-cols-2">
        {averageRows.length || fin(rsi) ? (
          <Panel label="Trend and momentum">
            {averageRows.map((row) => (
              <Row
                key={row.label}
                label={row.label}
                // The mark sits on the "price is above/below" note it judges, not on the average, which it would seem to call rising or falling.
                sub={
                  <span className="inline-flex items-center gap-1">
                    <ToneGlyph tone={stock.price >= row.value ? "up" : "down"} className="size-2" />
                    price is {away(row.value)} {stock.price >= row.value ? "above" : "below"}
                  </span>
                }
                value={money(row.value)}
              />
            ))}
            {fin(rsi) ? <Row label="RSI (14 days)" sub={rsi >= 70 ? "above 70" : rsi <= 30 ? "under 30" : "between 30 and 70"} value={rsi.toFixed(1)} /> : null}
            {[rsiReading(technicals), rangeReading(technicals)].filter(Boolean).length ? (
              <div className="border-t border-oa-border">
                <ReadingsList items={[rsiReading(technicals), rangeReading(technicals)]} />
              </div>
            ) : null}
          </Panel>
        ) : null}

        {returns.length ? (
          <Panel label="Returns">
            {returns.map((row) => (
              <Row key={row.label} label={row.label} value={bigPct(row.value)} tone={row.value >= 0 ? "up" : "down"} />
            ))}
            {series?.longReturns.length ? (
              <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
                Multi-year figures are total return, dividends included.
              </p>
            ) : null}
          </Panel>
        ) : null}
      </div>

      {(fin(high52) && fin(low52) && high52 > low52) || fin(levels?.support) || fin(levels?.resistance) ? (
        <Panel label="Range and levels">
          {fin(high52) && fin(low52) && high52 > low52 ? (
            <div className="px-3.5 pb-2 pt-3 sm:px-4">
              <p className="mb-1 text-[12px] leading-4 text-oa-muted-fg">52-week range, price marked</p>
              <RangeTrack
                low={low52}
                high={high52}
                format={money}
                markers={[{ key: "price", value: stock.price, color: "var(--oa-fg)", shape: "dot", label: "Price now" }]}
              />
            </div>
          ) : null}
          <div className="border-t border-oa-border">
            {fin(levels?.resistance) ? <Row label="Resistance (monthly pivot)" sub={side(levels.resistance)} value={money(levels.resistance)} /> : null}
            {fin(levels?.support) ? <Row label="Support (monthly pivot)" sub={side(levels.support)} value={money(levels.support)} /> : null}
            {series?.allTimeHigh ? (
              <Row label={`Highest close since ${series.firstDate.slice(0, 4)}`} sub={`${fmtDate(series.allTimeHigh.date)}${series.adjusted ? ", adjusted" : ""}`} value={money(series.allTimeHigh.close)} />
            ) : null}
          </div>
        </Panel>
      ) : null}
    </ReportSection>
  );
}

/** +10,201% for the multi-year rows, +12.3% otherwise. */
function bigPct(value: number): string {
  if (Math.abs(value) < 100) return signedPct(value, 1);
  return `${value >= 0 ? "+" : "−"}${Math.round(Math.abs(value)).toLocaleString("en-US")}%`;
}

function ReadingsList({ items }: { items: Array<Reading | null> }) {
  return <Readings items={items} />;
}

// ─── Peers ───────────────────────────────────────────────────────────────────

export function PeersSection({ data }: SectionProps) {
  const { stock, peers, facts, fundamentals, currency, market } = data;
  const self = {
    instrument_id: stock.instrument_id,
    ticker: stock.ticker,
    name: stock.name,
    price: stock.price,
    day_change_pct: stock.day_change_pct,
    market_cap: facts?.quick_stats?.market_cap ?? fundamentals?.market_cap,
    pe_ttm: fundamentals?.pe_ttm ?? facts?.quick_stats?.pe_ttm,
    revenue_growth_yoy_pct: facts?.financials?.revenue_growth_yoy_pct ?? undefined,
    isSelf: true,
  };
  const rows = [self, ...peers.filter((peer) => peer.ticker !== stock.ticker).slice(0, 8).map((peer) => ({ ...peer, isSelf: false }))];
  const cols = "grid-cols-[minmax(0,1fr)_4.75rem_4.25rem] md:grid-cols-[minmax(0,1.5fr)_5rem_4.5rem_5rem_4.75rem_5rem]";
  // The stock's own P/E against the middle of its peers: the same cheap-or-pricey line as the sector gap.
  const peerPes = rows
    .filter((row) => !row.isSelf)
    .map((row) => row.pe_ttm)
    .filter((value): value is number => fin(value) && value > 0)
    .sort((a, b) => a - b);
  const peerMedian = peerPes.length >= 3 ? (peerPes[(peerPes.length - 1) >> 1]! + peerPes[peerPes.length >> 1]!) / 2 : null;
  const selfPeWord = peerMedian != null && fin(self.pe_ttm) && self.pe_ttm > 0 ? multipleVsSector(((self.pe_ttm - peerMedian) / peerMedian) * 100) : null;
  const selfPeMark = selfPeWord && selfPeWord.tone !== "flat" ? selfPeWord.tone : null;
  return (
    <ReportSection id="peers" lede={`${stock.ticker} beside ${rows.length - 1} ${stock.industry || stock.sector || "sector"} ${rows.length - 1 === 1 ? "peer" : "peers"}.`}>
      <Panel label="Comparison">
        <div className={`grid ${cols} gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[11px] uppercase leading-4 tracking-[0.06em] text-oa-muted-fg sm:px-4`}>
          <span>Company</span>
          <span className="text-right">Price</span>
          <span className="text-right">Day</span>
          <span className="hidden text-right md:block">Mkt cap</span>
          {/* pr-3.5 matches the gap and glyph slot after the figures below, so the labels sit over the digits. */}
          <span className="hidden pr-3.5 text-right md:block">P/E</span>
          <span className="hidden pr-3.5 text-right md:block">Rev 1Y</span>
        </div>
        {rows.map((row) => {
          const cells = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <StockLogo ticker={row.ticker} market={market} size={20} />
                <span className="oa-mono shrink-0 text-[13px] font-medium text-oa-fg">{row.ticker}</span>
                <span className="min-w-0 truncate text-[13px] text-oa-muted-fg">{row.name}</span>
              </span>
              <span className={`${NUM} text-right text-oa-fg`}>{fin(row.price) ? `${currency}${row.price.toFixed(2)}` : ""}</span>
              <span className={`${NUM} text-right`} style={{ color: fin(row.day_change_pct) ? (row.day_change_pct >= 0 ? TONE_COLOR.up : TONE_COLOR.down) : undefined }}>
                {fin(row.day_change_pct) ? signedPct(row.day_change_pct, 2) : ""}
              </span>
              <span className={`${NUM} hidden text-right text-oa-fg md:block`}>{fin(row.market_cap) && row.market_cap > 0 ? compactMoney(row.market_cap, currency) : ""}</span>
              <span className={`${NUM} hidden items-center justify-end gap-1 text-right text-oa-fg md:flex`} title={row.isSelf && selfPeWord ? `${selfPeWord.word.replace("sector", "peers")}` : undefined}>
                {fin(row.pe_ttm) && row.pe_ttm > 0 ? row.pe_ttm.toFixed(1) : ""}
                {/* Only the stock's own P/E is judged, against the peer median; the slot keeps every row's digits aligned. */}
                <MarkSlot tone={row.isSelf ? selfPeMark : null} />
              </span>
              <span className={`${NUM} hidden items-center justify-end gap-1 text-right text-oa-fg md:flex`}>
                {fin(row.revenue_growth_yoy_pct) ? signedPct(row.revenue_growth_yoy_pct, 0) : ""}
                <MarkSlot tone={markFor("revenueGrowth", row.revenue_growth_yoy_pct)} />
              </span>
            </>
          );
          const base = `grid ${cols} min-h-10 items-center gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[14px] leading-5 last:border-b-0 sm:px-4`;
          return row.isSelf ? (
            <div key={row.ticker} className={`${base} bg-oa-bg`}>
              {cells}
            </div>
          ) : (
            <Link prefetch={false} key={row.ticker} href={`/stock/${row.ticker}`} className={`${base} outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent`}>
              {cells}
            </Link>
          );
        })}
        <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-4 text-oa-muted-fg sm:px-4">
          <MoreLink href={`/compare?symbols=${encodeURIComponent(stock.ticker)}`}>Compare any two stocks side by side</MoreLink>
        </p>
      </Panel>
    </ReportSection>
  );
}
