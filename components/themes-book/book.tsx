import * as React from "react";

import { Delta, NUM, Ticker, fmtMoney } from "@/components/oa/kit";
import { CallTag, Unknown } from "@/components/screener/shared";
import type { BasketLine, BasketPerf, BasketWindow } from "@/lib/screener-themes";
import { BASKET_WINDOWS } from "@/lib/screener-themes";

/** Server-rendered pieces of an idea basket: the performance strip and the book's lines. */

export function PerfCells({
  perf,
  benchmark,
  windows = BASKET_WINDOWS.map((window) => window.id),
  className = "",
}: {
  perf: BasketPerf;
  benchmark: Record<BasketWindow, number | null>;
  windows?: BasketWindow[];
  className?: string;
}) {
  return (
    <dl className={`grid gap-x-5 ${className}`} style={{ gridTemplateColumns: `repeat(${windows.length}, minmax(0, 1fr))` }}>
      {windows.map((id) => {
        const label = BASKET_WINDOWS.find((window) => window.id === id)?.label ?? id;
        const value = perf[id];
        const bench = benchmark[id];
        return (
          <div key={id} className="min-w-0 text-right">
            <dt className="oa-caption">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-medium leading-5">
              {value ? <Delta value={value.pct} digits={1} /> : <Unknown />}
            </dd>
            <dd className={`${NUM} mt-0.5 whitespace-nowrap text-[11px] leading-4 text-oa-muted-fg`}>
              {value && bench !== null ? `${value.pct - bench >= 0 ? "+" : "−"}${Math.abs(value.pct - bench).toFixed(1)} vs SPY` : " "}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function LineNumbers({ line }: { line: BasketLine }) {
  const row = line.row;
  if (!row) return <p className="text-right text-[12.5px] leading-4 text-oa-muted-fg">No price yet</p>;
  // Two lines: the price with the day's move, then the month and the year.
  return (
    <div className="text-right">
      <p className={`${NUM} whitespace-nowrap text-[14px] leading-5 text-oa-fg`}>
        {row.price !== undefined ? fmtMoney(row.price) : <Unknown />}
        <Delta value={row.day_pct} className="ml-2 text-[12px]" />
      </p>
      <p className="mt-0.5 flex justify-end gap-x-3 whitespace-nowrap text-[12.5px] leading-5">
        <span>
          <span className="oa-caption mr-1">1M</span>
          <Delta value={row.ret_1m} digits={1} />
        </span>
        <span>
          <span className="oa-caption mr-1">YTD</span>
          <Delta value={row.ret_ytd} digits={1} />
        </span>
      </p>
    </div>
  );
}

const BOOK_GRID = "lg:grid-cols-[13.5rem_minmax(0,1fr)_10rem]";

/** Desktop column heads for the book, said once so each line does not repeat them. */
export function BookHead() {
  return (
    <div className={`oa-caption hidden h-9 items-center gap-x-5 border-b border-oa-border bg-oa-bg px-4 lg:grid ${BOOK_GRID}`}>
      <span>Stock and our call</span>
      <span>Why it's here, and what would break it</span>
      <span className="text-right">Price, 1M, YTD</span>
    </div>
  );
}

/**
 * One line of the book: the company with our call beside it and its part in the idea under it, one sentence of at most
 * 15 words on why it is here and what would break it (lib/theme-book-lines.ts, one line at 1280), and its price. Only
 * the call, never the price zone: where the price sits against our levels lives on the stock page. The whole row opens
 * the stock.
 */
export function BookLine({ line, index }: { line: BasketLine; index: number }) {
  const row = line.row;
  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 border-b border-oa-border px-4 py-3 transition-colors last:border-b-0 hover:bg-oa-accent [grid-template-areas:'stock_nums'_'line_line'] lg:items-center lg:[grid-template-areas:'stock_line_nums'] ${BOOK_GRID}`}
    >
      <div className="min-w-0 [grid-area:stock]">
        <div className="flex items-center gap-2">
          <span className={`${NUM} w-5 shrink-0 text-[12.5px] text-oa-muted-fg`}>{String(index + 1).padStart(2, "0")}</span>
          <Ticker symbol={line.ticker} size={22} stretch />
          {/* Beside the ticker from lg; a phone's narrow column puts it under the line instead. */}
          {row?.call ? (
            <span className="hidden shrink-0 lg:inline-flex">
              <CallTag call={row.call} />
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-pretty pl-7 text-[13px] leading-[18px] text-oa-muted-fg">
          {[line.company, line.role].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="min-w-0 [grid-area:line]">
        <p data-book-line className="text-pretty text-[14px] leading-5 text-oa-fg">
          {line.line}
        </p>
        {row?.call ? (
          <div className="mt-2 lg:hidden">
            <CallTag call={row.call} />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 [grid-area:nums]">
        <LineNumbers line={line} />
      </div>
    </li>
  );
}
