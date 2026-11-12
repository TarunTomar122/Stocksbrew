import * as React from "react";

import { NUM, Panel, Ticker } from "@/components/oa/kit";
import type { StockTally } from "@/lib/follow-insights";
import { alsoClassesLabel, oneRowPerCompany } from "@/lib/share-class";

/**
 * "Most bought by funds" style list: one row per stock, how many of them were
 * on that side, and who. The takeaway sentence sits above the rows.
 */
export function StockTallyPanel({
  label,
  takeaway,
  rows,
  side,
  unit,
  empty,
  right,
  figure,
}: {
  label: React.ReactNode;
  takeaway?: React.ReactNode;
  rows: StockTally[];
  side: "buy" | "sell";
  /** "fund" / "member" / "insider": the counted thing, singular. */
  unit: string;
  empty: string;
  right?: React.ReactNode;
  /** The row's figure instead of the head count (e.g. the money in), for a list ranked by something else. */
  figure?: (row: StockTally) => string;
}) {
  // One row per company (Alphabet once, not GOOGL and GOOG); the other class is named on the row.
  const { rows: shown, also } = oneRowPerCompany(rows, (row) => row.ticker);
  return (
    // The head count's unit is said once, as the figure column's head, not on every row (owner rule 1).
    <Panel flush fill label={label} right={right ?? (figure ? undefined : <span className="text-oa-muted-fg">{`${unit[0]!.toUpperCase()}${unit.slice(1)}s`}</span>)}>
      {takeaway ? <p className="border-b border-oa-border px-4 py-2.5 text-pretty text-[14px] leading-5 text-oa-fg">{takeaway}</p> : null}
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[14px] leading-5 text-oa-muted-fg">{empty}</p>
      ) : (
        <ol className="divide-y divide-oa-border">
          {shown.map((row) => {
            const who = side === "buy" ? row.buyers : row.sellers;
            const other = side === "buy" ? row.sellers.length : row.buyers.length;
            const names = who.slice(0, 2).map((entry) => entry.name);
            const more = who.length - names.length;
            return (
              <li key={row.ticker} className="relative grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-1.5 transition-colors hover:bg-oa-accent">
                <div className="min-w-0">
                  <Ticker symbol={row.ticker} name={row.name} size={18} wrap stretch className="max-w-full" />
                  <p className="mt-0.5 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
                    {names.join(", ")}
                    {more > 0 ? ` and ${more} more` : ""}
                    {alsoClassesLabel(also, row.ticker) ? <span className={NUM}> · {alsoClassesLabel(also, row.ticker)}</span> : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`${NUM} text-[14px] font-medium ${side === "buy" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                    {figure ? figure(row) : who.length}
                  </p>
                  {other > 0 ? (
                    <p className={`${NUM} text-[12px] text-oa-muted-fg`}>
                      {other} {side === "buy" ? "sold" : "bought"}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

/**
 * The same tally drawn as bars: one row per stock, the bar is the share of
 * everyone counted who was on that side ("19 of 60 funds"), so the leader
 * reads at a glance and the names wait under each bar. With no `total`, the
 * bars share the longest row's scale instead.
 */
export function TallyBars({
  rows,
  side,
  unit,
  total,
  empty,
}: {
  rows: StockTally[];
  side: "buy" | "sell";
  /** "fund" / "member" / "insider": the counted thing, singular. */
  unit: string;
  /** Everyone counted (funds that filed this quarter); the bars are shares of it. */
  total?: number;
  empty: string;
}) {
  const { rows: shown, also } = oneRowPerCompany(rows, (row) => row.ticker);
  if (shown.length === 0) return <p className="py-4 text-[14px] leading-5 text-oa-muted-fg">{empty}</p>;
  const counts = shown.map((row) => (side === "buy" ? row.buyers : row.sellers).length);
  const scale = total && total > 0 ? total : Math.max(...counts, 1);
  return (
    <ol className="divide-y divide-oa-border">
      {shown.map((row, index) => {
        const who = side === "buy" ? row.buyers : row.sellers;
        const names = who.slice(0, 2).map((entry) => entry.name);
        const more = who.length - names.length;
        const width = Math.max(3, (counts[index]! / scale) * 100);
        return (
          <li key={row.ticker} className="relative py-2.5 transition-colors hover:bg-oa-accent/60">
            <div className="flex items-center justify-between gap-3">
              <Ticker symbol={row.ticker} name={row.name} size={20} wrap stretch className="min-w-0 max-w-full" />
              <p className="shrink-0 text-right text-[13.5px] leading-5 text-oa-muted-fg">
                <span className={`${NUM} font-semibold text-oa-fg`}>{who.length}</span>
                {total ? (
                  <>
                    {" "}
                    of <span className={NUM}>{total}</span> {unit}s
                  </>
                ) : (
                  ` ${who.length === 1 ? unit : `${unit}s`}`
                )}
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-oa-bg" aria-hidden="true">
              <div className={`h-full rounded-full ${side === "buy" ? "bg-signal-bullish" : "bg-signal-bearish"} opacity-75`} style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
              {names.join(", ")}
              {more > 0 ? ` and ${more} more` : ""}
              {row.opened && side === "buy" ? (row.opened === who.length && who.length > 1 ? `. All ${who.length} bought it for the first time` : `. ${row.opened} bought it for the first time`) : ""}
              {row.opened && side === "buy" ? "." : ""}
              {alsoClassesLabel(also, row.ticker) ? <span className={NUM}> · {alsoClassesLabel(also, row.ticker)}</span> : null}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
