import * as React from "react";

import { LockCard, ProMark } from "@/components/oa/gate";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { TheRead } from "@/components/oa/insight";
import { NUM, Panel, fmtMoney } from "@/components/oa/kit";
import { BasketActions } from "@/components/screener/basket-actions";
import { LINE_COLORS } from "@/components/screener/controls";
import { OverlayChart, type OverlayRange } from "@/components/screener/overlay-chart";
import { CallTag, EarningsDate, MarkSlot, Unknown, ZoneTag, fieldHasMark, fieldMark } from "@/components/screener/shared";
import { StockLogo } from "@/components/stock-logo";
import { getCompareData, getCompareDataCached } from "@/lib/compare";
import { buildCompareRead } from "@/lib/compare-insights";
import { buildCompareTable, describeDifferences, figureLabel, withChartReturns, type CompareTableGroup } from "@/lib/compare-shared";
import { ownCallLevel } from "@/lib/call-level";
import { callLine } from "@/components/stock-report/call-line";
import { WholeRowsBox } from "./whole-rows-box";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { getScreenerRows } from "@/lib/screener";
import { withoutZones, type ScreenerRow } from "@/lib/screener-shared";
import { deriveFigure } from "@/lib/insights";
import { plainCallReason, shortCompanyName, wholeSentences } from "@/lib/plain-copy";
import { withoutVagueChange } from "@/lib/call-basis";
import Link from "next/link";

/**
 * The compare desk's body for two to four stocks: the read with our call on
 * each right under its headline, the rebased price chart beside every
 * difference, then the side-by-side table as evidence. Shared by the desk
 * (/compare?symbols=...) and the stock-against-stock pages (/compare/a-vs-b),
 * so both always show the same numbers.
 */

const CELL = "px-2 py-2 text-right align-top sm:px-3";
const LABEL_CELL = "sticky left-0 z-[1] bg-oa-card py-2 pl-4 pr-2 text-left align-top text-[13px] font-normal leading-5 text-oa-muted-fg sm:text-[13.5px]";

function GroupHead({ label, span, right }: { label: string; span: number; right?: React.ReactNode }) {
  return (
    <tr>
      <th colSpan={span} scope="colgroup" className="border-y border-oa-border bg-oa-bg px-4 py-1.5 text-left">
        <span className="flex items-center justify-between gap-3">
          <span className="oa-caption">{label}</span>
          {right ? <span className="text-[12px] font-normal text-oa-muted-fg">{right}</span> : null}
        </span>
      </th>
    </tr>
  );
}

function NumberRows({ group, rows }: { group: CompareTableGroup; rows: ReadonlyArray<ScreenerRow | null> }) {
  return (
    <>
      {group.rows.map((row) => {
        // Margins, returns on capital, debt and our scores also get a good-or-bad mark of their own,
        // from the same thresholds as the stock page: the dot only says which is better of these names.
        const marked = fieldHasMark(row.id);
        return (
          <tr key={row.id} className="border-b border-oa-border last:border-b-0 hover:bg-oa-accent">
            <th scope="row" title={row.hint} className={`${LABEL_CELL} group-hover:bg-transparent`}>
              {row.label}
            </th>
            {row.cells.map((cell, index) => (
              <td key={index} className={CELL}>
                {cell.value === null ? (
                  <Unknown />
                ) : (
                  <span
                    className={`${NUM} inline-flex items-center gap-1.5 text-[13.5px] ${
                      // A judged figure stays in normal ink and lets its glyph speak; only signed changes take the colour.
                      !marked && cell.tone === "up" ? "text-signal-bullish" : !marked && cell.tone === "down" ? "text-signal-bearish" : "text-oa-fg"
                    } ${cell.best ? "font-semibold" : ""}`}
                  >
                    {cell.best ? <span className="sr-only">Best in this row: </span> : null}
                    {cell.text}
                    {marked ? <MarkSlot tone={fieldMark(row.id, cell.value, rows[index] ?? undefined)} /> : null}
                  </span>
                )}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

/** "Buy more below $160.00, 8.0% under today's $173.85.": the call's own level, when this row carries one. */
function levelLine(row: ScreenerRow | null | undefined): string | null {
  if (!row?.call) return null;
  const price = typeof row.price === "number" && row.price > 0 ? row.price : null;
  // Within half the price, the stock page's rule; a sell-some price under the buy-more price is not a level.
  const near = (value: number | undefined) => (value && (!price || Math.abs(value - price) / price <= 0.5) ? value : null);
  const addBelow = near(row.add_below);
  const trimAbove = near(row.trim_above);
  const own = ownCallLevel(row.call, { addBelow, trimAbove: trimAbove && (!addBelow || trimAbove > addBelow) ? trimAbove : null });
  if (!own) return null;
  return callLine({ callWord: null, callAction: null, level: own, hidden: null, price, money: fmtMoney, plan: "" })?.text ?? null;
}

/**
 * Our call on each stock, right under the read's headline: the call, the one figure its evidence leads with and that
 * evidence as one sentence, which carries its own baseline ("while other chip stocks rose 5.8%"). The card opens the
 * stock. Only stocks with a call get a card (owner rule 4: no card without data); a lone card takes the row.
 */
function CallCards({ symbols, rows, className = "mt-3" }: { symbols: string[]; rows: ReadonlyArray<ScreenerRow | null>; className?: string }) {
  const called = symbols.filter((_, index) => rows[index]?.call);
  if (called.length === 0) return null;
  const cols = called.length === 1 ? "" : called.length === 3 ? "lg:grid-cols-3" : "sm:grid-cols-2";
  return (
    <ul aria-label="Our call on each" className={`grid grid-cols-1 gap-3 ${cols} ${className}`}>
      {called.map((symbol) => {
        const row = rows[symbols.indexOf(symbol)];
        const reason = row?.call_reason ? wholeSentences(plainCallReason(withoutVagueChange(row.call_reason)), 1) : "";
        const figure = reason ? deriveFigure(reason) : null;
        const sign = figure && /[1-9]/.test(figure.value) ? /^[+\u2212-]/.exec(figure.value)?.[0] : undefined;
        const label = figure ? figureLabel(reason, figure.value) : null;
        // The call's own price against today's, as on the stock page (components/stock-report/call-line.ts), only when
        // the row still has it: rows arrive with levels stripped where the viewer's plan does not show them.
        const level = levelLine(row);
        return (
          <li
            key={symbol}
            data-track-links="insight_clicked"
            data-track-insight-id="compare-call"
            data-track-insight-kind="call"
            data-track-ticker={symbol}
            className="oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent"
          >
            {/* The figure and what it is wrap under the stock on a narrow card rather than run over its call. */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex shrink-0 items-center gap-2">
                <StockLogo ticker={symbol} size={20} />
                <span className={`${NUM} text-[15px] font-medium text-oa-fg`}>{symbol}</span>
                <CallTag call={row?.call} />
              </span>
              {figure ? (
                <span className="ml-auto inline-flex shrink-0 items-baseline gap-2">
                  {/* What the figure is, beside it at reading size, never as a caption over it (owner rule 6). */}
                  {label ? <span className="text-[13px] leading-5 text-oa-muted-fg">{label}</span> : null}
                  <span className={`${NUM} inline-flex items-center gap-1.5 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-oa-fg`}>
                    {figure.value}
                    {sign ? <ToneGlyph tone={sign === "+" ? "up" : "down"} className="size-2.5" decorative /> : null}
                  </span>
                </span>
              ) : null}
            </div>
            {level ? <p className="mt-2 text-pretty text-[14.5px] font-medium leading-[21px] text-oa-fg">{level}</p> : null}
            {reason ? <p className={`${level ? "mt-1" : "mt-2"} text-pretty text-[14.5px] leading-[21px] text-oa-fg`}>{reason}</p> : null}
            <Link
              href={`/stock/${encodeURIComponent(symbol)}`}
              prefetch={false}
              data-track-target="action"
              aria-label={`${symbol}: our call and the full report`}
              className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
            />
          </li>
        );
      })}
    </ul>
  );
}

export async function CompareView({
  symbols,
  range,
  viewer,
  readLabel,
  cached = false,
}: {
  symbols: string[];
  range?: string;
  viewer: Viewer;
  /** The read's label; the desk says "A vs B, in short". */
  readLabel?: string;
  /** Read the pair as one cached piece (the desk's example, which every visit to /compare opens on). */
  cached?: boolean;
}) {
  const [data, benchmarkRows] = await Promise.all([cached ? getCompareDataCached([...symbols]).catch(() => getCompareData(symbols)) : getCompareData(symbols), getScreenerRows(["SPY"]).catch(() => new Map<string, ScreenerRow>())]);
  // The call is open to everyone; price zones only on stocks this viewer covers.
  // Returns over the chart's own periods come from the chart's lines, so the table and the legend agree.
  const rows: Array<ScreenerRow | null> = withChartReturns(data.rows, data.chart.ranges).map((row) => (row && !canSeeLevels(viewer, row.symbol) ? withoutZones(row) : row));
  const groups = buildCompareTable(rows);
  const benchmark = benchmarkRows.get("SPY") ?? null;
  const differences = describeDifferences(rows, benchmark);
  // The read: who wins on what, then the few differences that matter. Built on the zone-stripped rows. Our call on
  // each sits right under its headline as its own cards (CallCards), so the read's cards leave the calls out.
  const built = buildCompareRead({
    rows,
    benchmark,
    asOf: rows.find((row) => row?.price_at)?.price_at ?? null,
    spread: true,
    calls: false,
  });
  const showCalls = rows.some((row) => row?.call);
  // With our calls under the headline, the read's own difference cards would only repeat rows of "Where they differ"
  // (the margin, the year), so they go; a report coming up is not in those rows, so it stays. Without a call, the
  // read keeps every finding.
  const compareRead = built && showCalls ? { ...built, insights: built.insights.filter((insight) => insight.id === "earnings") } : built;
  const span = symbols.length + 1;
  const zonesLocked = viewer.plan !== "pro" && data.rows.some((row, index) => row?.zone && !rows[index]?.zone);
  const missing = symbols.filter((_, index) => !rows[index]);

  const ranges: OverlayRange[] = data.chart.ranges.map((item) => ({
    key: item.key,
    label: item.label,
    startDate: item.startDate,
    endDate: item.endDate,
    lines: item.series.map((line) => ({
      id: line.symbol,
      label: line.symbol,
      color: LINE_COLORS[symbols.indexOf(line.symbol) % LINE_COLORS.length]!,
      points: line.points,
      pct: line.pct,
    })),
  }));

  const group = (id: CompareTableGroup["id"]) => groups.find((item) => item.id === id) ?? null;
  const read = group("read");
  const earnings = group("earnings");
  const anyCall = rows.some((row) => row?.call);
  const anyEarnings = rows.some((row) => row?.earnings_date);

  return (
    <>
      {missing.length > 0 ? (
        <p className="mb-4 text-[13.5px] leading-5 text-oa-muted-fg">
          We do not cover {missing.join(", ")} yet, so {missing.length === 1 ? "its column is" : "their columns are"} empty.
        </p>
      ) : null}

      <TheRead
        read={compareRead}
        label={readLabel ?? `${symbols.join(" vs ")}, in short`}
        className="mb-4"
        visual={showCalls ? <CallCards symbols={symbols} rows={rows} /> : undefined}
      />
      {/* No read (fewer than two covered stocks): the calls still lead the page. */}
      {!compareRead && showCalls ? <CallCards symbols={symbols} rows={rows} className="mb-4" /> : null}

      {(() => {
        const chartPanel = (
        <Panel flush label="Percent return">
          <OverlayChart
            ranges={ranges}
            initialRange={range ?? "1Y"}
            rangeParam="range"
            emptyText={`No shared price history for ${symbols.join(" and ")}.`}
          />
        </Panel>
        );
        const separatesPanel = (
        <Panel flush fill label="Where they differ">
          {/* One figure per row, then whose it is against the other name's number. */}
          <ul className="flex flex-1 flex-col">
            {differences.map((item) => (
              <li key={item.topic} className="grid flex-1 grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 border-b border-oa-border px-4 py-2 last:border-b-0">
                  <span className={`${NUM} inline-flex items-center gap-1 text-[16px] font-semibold leading-6 text-oa-fg`}>
                    {item.figure}
                    {item.tone ? <ToneGlyph tone={item.tone} className="size-2" decorative /> : null}
                  </span>
                  <span className="text-pretty text-[13.5px] leading-5 text-oa-fg">
                    <span className="sr-only">{item.topic}: </span>
                    {item.text}
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
        );
        const tablePanel = (
      <Panel flush>
        {/* About eight rows tall and scrolls inside (no visible bar), with the stocks pinned on top so every row stays
            readable. The better figure in each row is in bold. */}
        <WholeRowsBox className="scrollbar-hide relative max-h-[27rem] overflow-auto">
          <table className="w-full border-collapse max-sm:table-fixed" style={{ minWidth: `${7 + symbols.length * 6.5}rem` }}>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-[3] w-[36%] bg-oa-card shadow-[inset_0_-1px_0_var(--oa-border)] px-4 py-3 text-left align-bottom sm:w-[28%]">
                  <span className="sr-only">Measure</span>
                </th>
                {symbols.map((symbol, index) => {
                  const row = rows[index];
                  return (
                    <th key={symbol} scope="col" className="sticky top-0 z-[2] bg-oa-card px-2 shadow-[inset_0_-1px_0_var(--oa-border)] py-3 text-right align-bottom font-normal sm:px-3">
                      <Link prefetch={false} href={`/stock/${encodeURIComponent(symbol)}`} className="group inline-flex flex-col items-end gap-1 outline-none">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className="size-2 rounded-full max-sm:hidden" style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />
                          <StockLogo ticker={symbol} size={20} />
                          <span className={`${NUM} text-[15px] font-medium text-oa-fg group-hover:underline group-focus-visible:underline`}>{symbol}</span>
                        </span>
                        <span className="max-w-[5.75rem] text-pretty text-right text-[12.5px] leading-4 text-oa-muted-fg sm:max-w-[11rem]">{row?.name ? shortCompanyName(row.name) : "Not covered"}</span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups
                .filter((item) => item.id !== "read" && item.id !== "earnings")
                .map((item) => (
                  <React.Fragment key={item.id}>
                    <GroupHead label={item.label} span={span} />
                    <NumberRows group={item} rows={rows} />
                  </React.Fragment>
                ))}

              {anyCall || read ? (
                <>
                  <GroupHead label="Our read" span={span} right={zonesLocked ? <ProMark /> : undefined} />
                  {anyCall ? (
                    <>
                      <tr className="border-b border-oa-border">
                        <th scope="row" className={LABEL_CELL}>Our call</th>
                        {rows.map((row, index) => (
                          <td key={index} className={CELL}>{row?.call ? <CallTag call={row.call} /> : <Unknown />}</td>
                        ))}
                      </tr>
                      <tr className="border-b border-oa-border">
                        <th scope="row" className={LABEL_CELL}>Why</th>
                        {rows.map((row, index) => (
                          <td key={index} className={`${CELL} w-[7.25rem] max-w-[7.25rem] sm:w-[10.5rem] sm:max-w-[10.5rem]`}>
                            {row?.call_reason ? (
                              <span className="block text-pretty text-right text-[12.5px] leading-[1.15rem] text-oa-fg">{/* The evidence sentence only; the narrow cell has no room for what would change the call. */}
                                {wholeSentences(plainCallReason(row.call_reason), 1)}
                              </span>
                            ) : (
                              <Unknown />
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-oa-border">
                        <th scope="row" className={LABEL_CELL}>Where the price sits</th>
                        {rows.map((row, index) => (
                          <td key={index} className={CELL}>
                            {row?.zone ? (
                              <span className="inline-flex flex-col items-end gap-1">
                                <ZoneTag zone={row.zone} />
                                {/* Phones get fixed 6.5rem columns, too narrow for "add under $535.93" on one line, so it wraps there instead of running into the next column. */}
                                <span className={`${NUM} flex flex-col items-end text-right text-[11.5px] leading-4 text-oa-muted-fg sm:whitespace-nowrap`}>
                                  {/* Only the call's own level (owner rule 8): the buy-more price on Buy more, the sell-some price on Sell some, none on Keep. */}
                                  {row.call === "Add" && row.add_below !== undefined ? <span>buy more under {fmtMoney(row.add_below)}</span> : null}
                                  {row.call === "Trim" && row.trim_above !== undefined ? <span>sell some over {fmtMoney(row.trim_above)}</span> : null}
                                </span>
                              </span>
                            ) : data.rows[index]?.zone ? (
                              <span className="text-[12.5px] text-oa-muted-fg">in the full report</span>
                            ) : (
                              <Unknown />
                            )}
                          </td>
                        ))}
                      </tr>
                    </>
                  ) : null}
                  {read ? <NumberRows group={read} rows={rows} /> : null}
                </>
              ) : null}

              {anyEarnings || earnings ? (
                <>
                  <GroupHead label="Earnings and analysts" span={span} />
                  {anyEarnings ? (
                    <tr className="border-b border-oa-border">
                      <th scope="row" className={LABEL_CELL}>Next earnings</th>
                      {rows.map((row, index) => (
                        <td key={index} className={CELL}>
                          {row?.earnings_date ? (
                            <span className="inline-flex flex-col items-end">
                              <EarningsDate row={row} />
                              <span className={`${NUM} text-[11.5px] text-oa-muted-fg`}>
                                {row.earnings_in_days === 0 ? "today" : `in ${row.earnings_in_days} days`}
                              </span>
                            </span>
                          ) : (
                            <Unknown />
                          )}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                  <tr className="border-b border-oa-border">
                    <th scope="row" className={LABEL_CELL}>Analyst consensus</th>
                    {rows.map((row, index) => (
                      <td key={index} className={`${CELL} text-[13.5px] text-oa-fg`}>{row?.analyst_label ?? <Unknown />}</td>
                    ))}
                  </tr>
                  {earnings ? <NumberRows group={earnings} rows={rows} /> : null}
                </>
              ) : null}
            </tbody>
          </table>
        </WholeRowsBox>
      </Panel>
        );
        // Chart and the differences side by side at the same height when there are enough rows to stand beside the
        // chart; with fewer, they run under it so no row is stretched tall (owner rule 4). The table follows as evidence.
        const beside = differences.length >= 4;
        return (
          <div className="flex flex-col gap-4 xl:gap-5">
            {beside ? (
              <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
                {chartPanel}
                {separatesPanel}
              </div>
            ) : (
              <>
                {chartPanel}
                {differences.length ? separatesPanel : null}
              </>
            )}
            {tablePanel}
          </div>
        );
      })()}
      {zonesLocked ? <LockCard feature="stock_zones" plan={viewer.plan} trialEligible={viewer.trialEligible} className="mt-3" /> : null}

      {symbols.length >= 2 ? (
        <div className="mt-4 sm:hidden">
          <BasketActions symbols={symbols} compareLimit={0} />
        </div>
      ) : null}
      <p className="mt-4 max-w-[70ch] text-[12.5px] leading-5 text-oa-muted-fg">A view, not advice.</p>
    </>
  );
}
