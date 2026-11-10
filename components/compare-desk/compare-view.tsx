import * as React from "react";

import { LockCard, ProMark } from "@/components/oa/gate";
import { TheRead } from "@/components/oa/insight";
import { NUM, Panel, Ticker, ToneGlyph, fmtMoney } from "@/components/oa/kit";
import { BasketActions } from "@/components/screener/basket-actions";
import { LINE_COLORS } from "@/components/screener/controls";
import { OverlayChart, type OverlayRange } from "@/components/screener/overlay-chart";
import { CallTag, EarningsDate, MarkSlot, Unknown, ZoneTag, fieldHasMark, fieldMark } from "@/components/screener/shared";
import { StockLogo } from "@/components/stock-logo";
import { getCompareData } from "@/lib/compare";
import { buildCompareRead } from "@/lib/compare-insights";
import { buildCompareTable, describeDifferences, tallyWins, type CompareTableGroup } from "@/lib/compare-shared";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { getScreenerRows } from "@/lib/screener";
import { withoutZones, type ScreenerRow } from "@/lib/screener-shared";

/**
 * The compare desk's body for two to four stocks: the read, the rebased price
 * chart, every difference, the briefs and the side-by-side table. Shared by
 * the desk (/compare?symbols=...) and the stock-against-stock pages
 * (/compare/a-vs-b), so both always show the same numbers.
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
                    {cell.best ? <span aria-label="best in this row" title="Best in this row" className="size-1.5 rounded-full bg-oa-primary" /> : null}
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

export async function CompareView({
  symbols,
  range,
  viewer,
  readLabel,
  afterRead,
}: {
  symbols: string[];
  range?: string;
  viewer: Viewer;
  /** The read's label; the desk says "A vs B, in short". */
  readLabel?: string;
  /** Shown right under the read. */
  afterRead?: React.ReactNode;
}) {
  const [data, benchmarkRows] = await Promise.all([getCompareData(symbols), getScreenerRows(["SPY"]).catch(() => new Map<string, ScreenerRow>())]);
  // The call is open to everyone; price zones only on stocks this viewer covers.
  const rows: Array<ScreenerRow | null> = data.rows.map((row) => (row && !canSeeLevels(viewer, row.symbol) ? withoutZones(row) : row));
  const groups = buildCompareTable(rows);
  const wins = tallyWins(groups, symbols.length);
  const differences = describeDifferences(rows);
  // The read: who wins on what, then the few differences that matter. Built on the zone-stripped rows.
  const compareRead = buildCompareRead({
    rows,
    benchmark: benchmarkRows.get("SPY") ?? null,
    asOf: rows.find((row) => row?.price_at)?.price_at ?? null,
  });
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
  // The thesis, drivers and risk are the full read: an uncovered stock keeps only its headline, here on the server.
  const briefs = data.briefs.map((brief) =>
    brief && !canSeeLevels(viewer, brief.symbol)
      ? { ...brief, thesis: null, drivers: [], points: [], risk: null, locked: true as const }
      : brief ? { ...brief, locked: false as const } : brief,
  );
  const pair = symbols.length === 2;

  return (
    <>
      {missing.length > 0 ? (
        <p className="mb-4 text-[13.5px] leading-5 text-oa-muted-fg">
          We do not cover {missing.join(", ")} yet, so {missing.length === 1 ? "its column is" : "their columns are"} empty.
        </p>
      ) : null}

      <TheRead read={compareRead} label={readLabel ?? `${symbols.join(" vs ")}, in short`} className="mb-4" />
      {afterRead}

      {/* Two names read best as two columns: chart and table on the left, the words on the right. */}
      {(() => {
        const chartPanel = (
        <Panel flush label="Price, rebased to the same start">
          <OverlayChart
            ranges={ranges}
            initialRange={range ?? "1Y"}
            rangeParam="range"
            emptyText={`No shared price history for ${symbols.join(" and ")}.`}
          />
        </Panel>
        );
        const separatesPanel = (
        <Panel label="Every difference">
          {differences.length === 0 ? (
            <p className="text-[14px] leading-6 text-oa-muted-fg">These names are close on every measure here.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {differences.map((item) => (
                <li key={item.topic} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
                  <span className="oa-caption pt-[3px]">{item.topic}</span>
                  <span className="text-pretty text-[14px] leading-[1.45rem] text-oa-fg">{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        );
        const briefsPanel = (
      <Panel flush label="From our briefs">
        <div className="overflow-hidden">
          <div className={`grid ${pair ? "md:grid-cols-2 xl:grid-cols-1" : symbols.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
            {symbols.map((symbol, index) => {
              const brief = briefs[index];
              const row = rows[index];
              return (
                <div key={symbol} className="-mb-px -mr-px min-w-0 border-b border-r border-oa-border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />
                    <Ticker symbol={symbol} size={18} />
                    <CallTag call={row?.call} />
                  </div>
                  {brief ? (
                    <>
                      {brief.thesis ?? brief.headline ? (
                        <p className="text-pretty text-[14.5px] font-medium leading-[1.45rem] text-oa-fg">{brief.thesis ?? brief.headline}</p>
                      ) : null}
                      {brief.drivers[0] ? (
                        <p className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                          <span className="text-oa-fg">Driving it:</span> {brief.drivers[0].detail ?? brief.drivers[0].label}
                        </p>
                      ) : brief.points[0] ? (
                        <p className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{brief.points[0]}</p>
                      ) : null}
                      {brief.risk ? (
                        <p className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                          <span className="text-oa-fg">Main risk:</span> {brief.risk}
                        </p>
                      ) : null}
                      {brief.locked ? (
                        <p className="mt-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">The reasons and risks come with covering {symbol}.</p>
                      ) : null}
                      <p className={`${NUM} mt-2.5 text-[11px] text-oa-muted-fg`}>
                        <a href={`/stock/${encodeURIComponent(symbol)}`} className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                          full report
                        </a>
                      </p>
                    </>
                  ) : (
                    <p className="text-[13.5px] leading-5 text-oa-muted-fg">No brief on {symbol} yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
        );
        const tablePanel = (
      <Panel
        flush
        label="Side by side"
        right={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-oa-primary" /> best in the row
            </span>
            <span className="inline-flex items-center gap-1">
              <ToneGlyph tone="up" decorative />
              <ToneGlyph tone="down" decorative />
              <span className="ml-0.5">good or bad on its own</span>
            </span>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse max-sm:table-fixed" style={{ minWidth: `${7 + symbols.length * 6.5}rem` }}>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-[1] w-[36%] bg-oa-card px-4 py-3 text-left align-bottom sm:w-[28%]">
                  <span className="sr-only">Measure</span>
                </th>
                {symbols.map((symbol, index) => {
                  const row = rows[index];
                  return (
                    <th key={symbol} scope="col" className="px-2 py-3 text-right align-bottom font-normal sm:px-3">
                      <a href={`/stock/${encodeURIComponent(symbol)}`} className="group inline-flex flex-col items-end gap-1 outline-none">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />
                          <span className="max-sm:hidden"><StockLogo ticker={symbol} size={22} /></span>
                          <span className={`${NUM} text-[15px] font-medium text-oa-fg group-hover:underline group-focus-visible:underline`}>{symbol}</span>
                        </span>
                        <span className="max-w-[5.75rem] truncate text-[12.5px] text-oa-muted-fg sm:max-w-[11rem]">{row?.name ?? "Not covered"}</span>
                      </a>
                      <div className={`${NUM} mt-1 text-[11px] text-oa-muted-fg`}>
                        {row ? `${wins[index]} ${wins[index] === 1 ? "row" : "rows"} won` : ""}
                      </div>
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
                        <th scope="row" className={LABEL_CELL}>The reason, in one line</th>
                        {rows.map((row, index) => (
                          <td key={index} className={`${CELL} w-[7.25rem] max-w-[7.25rem] sm:w-[10.5rem] sm:max-w-[10.5rem]`}>
                            {row?.call_reason ? (
                              <span className="block text-pretty text-right text-[12.5px] leading-[1.15rem] text-oa-fg">{row.call_reason}</span>
                            ) : (
                              <Unknown />
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-oa-border">
                        <th scope="row" className={LABEL_CELL}>Price against our zones</th>
                        {rows.map((row, index) => (
                          <td key={index} className={CELL}>
                            {row?.zone ? (
                              <span className="inline-flex flex-col items-end gap-1">
                                <ZoneTag zone={row.zone} />
                                {/* Phones get fixed 6.5rem columns, too narrow for "add under $535.93" on one line, so it wraps there instead of running into the next column. */}
                                <span className={`${NUM} flex flex-col items-end text-right text-[11.5px] leading-4 text-oa-muted-fg sm:whitespace-nowrap`}>
                                  {row.add_below !== undefined ? <span>add under {fmtMoney(row.add_below)}</span> : null}
                                  {row.trim_above !== undefined ? <span>trim over {fmtMoney(row.trim_above)}</span> : null}
                                </span>
                              </span>
                            ) : data.rows[index]?.zone ? (
                              <span className="text-[12.5px] text-oa-muted-fg">covered stocks</span>
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
        </div>
      </Panel>
        );
        return pair ? (
          // Desktop: chart and table lead on the left, the words support on the right.
          // Phone: chart, the short answer, the table, then the briefs.
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] xl:gap-5">
            <div className="flex min-w-0 flex-col gap-4 max-xl:contents xl:gap-5">
              <div className="min-w-0 max-xl:order-1">{chartPanel}</div>
              <div className="min-w-0 max-xl:order-3">{tablePanel}</div>
            </div>
            <div className="flex min-w-0 flex-col gap-4 max-xl:contents xl:gap-5">
              <div className="min-w-0 max-xl:order-2">{separatesPanel}</div>
              <div className="min-w-0 max-xl:order-4">{briefsPanel}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              {chartPanel}
              {separatesPanel}
            </div>
            {briefsPanel}
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
