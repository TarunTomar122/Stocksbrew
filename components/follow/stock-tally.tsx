import * as React from "react";

import { NUM, Panel, Ticker } from "@/components/oa/kit";
import type { StockTally } from "@/lib/follow-insights";

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
}: {
  label: React.ReactNode;
  takeaway?: React.ReactNode;
  rows: StockTally[];
  side: "buy" | "sell";
  /** "fund" / "member" / "insider": the counted thing, singular. */
  unit: string;
  empty: string;
  right?: React.ReactNode;
}) {
  return (
    <Panel flush fill label={label} right={right}>
      {takeaway ? <p className="border-b border-oa-border px-4 py-2.5 text-pretty text-[14px] leading-5 text-oa-fg">{takeaway}</p> : null}
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[14px] leading-5 text-oa-muted-fg">{empty}</p>
      ) : (
        <ol className="divide-y divide-oa-border">
          {rows.map((row) => {
            const who = side === "buy" ? row.buyers : row.sellers;
            const other = side === "buy" ? row.sellers.length : row.buyers.length;
            const names = who.slice(0, 2).map((entry) => entry.name);
            const more = who.length - names.length;
            return (
              <li key={row.ticker} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-1.5">
                <div className="min-w-0">
                  <Ticker symbol={row.ticker} name={row.name} size={18} className="max-w-full" />
                  <p className="mt-0.5 truncate text-[12.5px] leading-[18px] text-oa-muted-fg">
                    {names.join(", ")}
                    {more > 0 ? ` +${more}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`${NUM} text-[14px] font-medium ${side === "buy" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                    {who.length} {who.length === 1 ? unit : `${unit}s`}
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
