import * as React from "react";

import { Delta, NUM, Ticker, fmtMoney } from "@/components/oa/kit";
import { CallTag, Unknown, ZoneTag } from "@/components/screener/shared";
import type { BasketLine, BasketPerf, BasketWindow } from "@/lib/screener-themes";
import { BASKET_WINDOWS } from "@/lib/screener-themes";
import { plainCallReason } from "@/lib/plain-copy";

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
  if (!row) {
    return <p className="text-[12.5px] leading-4 text-oa-muted-fg">We do not hold prices for this line, so it is left out of the basket numbers.</p>;
  }
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-right lg:grid-cols-1 lg:gap-y-1.5">
      <div>
        <dt className="oa-caption lg:hidden">Price</dt>
        <dd className={`${NUM} text-[14px] text-oa-fg`}>
          {row.price !== undefined ? fmtMoney(row.price) : <Unknown />}
          <Delta value={row.day_pct} className="ml-2 hidden text-[12px] lg:inline" />
        </dd>
      </div>
      <div>
        <dt className="oa-caption lg:hidden">1M</dt>
        <dd className="text-[13px]">
          <span className="oa-caption mr-1.5 hidden lg:inline">1M</span>
          <Delta value={row.ret_1m} digits={1} />
        </dd>
      </div>
      <div>
        <dt className="oa-caption lg:hidden">YTD</dt>
        <dd className="text-[13px]">
          <span className="oa-caption mr-1.5 hidden lg:inline">YTD</span>
          <Delta value={row.ret_ytd} digits={1} />
        </dd>
      </div>
    </dl>
  );
}

const BOOK_GRID = "lg:grid-cols-[13.5rem_minmax(0,1fr)_minmax(0,1fr)_9.5rem]";

/** Desktop column heads for the book, said once so each line does not repeat them. */
export function BookHead() {
  return (
    <div className={`oa-caption hidden h-9 items-center gap-x-5 border-b border-oa-border bg-oa-bg px-4 lg:grid ${BOOK_GRID}`}>
      <span>Line</span>
      <span>Why it benefits</span>
      <span>What breaks it</span>
      <span className="text-right">Price, 1M, YTD</span>
    </div>
  );
}

/** One line of the book: the company, its part in the idea, why it gains, what breaks it, our read. */
export function BookLine({ line, index, weight }: { line: BasketLine; index: number; weight: number | null }) {
  const row = line.row;
  return (
    <li className={`grid gap-x-5 gap-y-3 border-b border-oa-border px-4 py-4 last:border-b-0 lg:py-3.5 ${BOOK_GRID}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`${NUM} w-5 shrink-0 text-[12.5px] text-oa-muted-fg`}>{String(index + 1).padStart(2, "0")}</span>
          <Ticker symbol={line.ticker} size={22} />
          {weight !== null ? <span className={`${NUM} ml-auto text-[12.5px] text-oa-muted-fg lg:ml-1`}>{weight.toFixed(1)}%</span> : null}
        </div>
        <p className="mt-1 truncate pl-7 text-[14px] leading-5 text-oa-fg">{line.company}</p>
        {/* The role is a description, not a state, so it is plain text that wraps; tags are kept for the call and zone. */}
        {line.role ? <p className="mt-0.5 pl-7 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{line.role}</p> : null}
        {row?.call || row?.zone ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7">
            {row?.call ? <CallTag call={row.call} /> : null}
            {row?.zone ? <ZoneTag zone={row.zone} /> : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="oa-caption mb-1 lg:hidden">Why it benefits</p>
        <p className="text-pretty text-[14px] leading-[1.45rem] text-oa-fg">{line.benefit}</p>
        {line.catalyst ? <p className="mt-1.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">Next: {line.catalyst}</p> : null}
      </div>

      <div className="min-w-0">
        <p className="oa-caption mb-1 lg:hidden">What breaks it</p>
        <p className="text-pretty text-[14px] leading-[1.45rem] text-oa-fg">{line.breaks}</p>
        {row?.call_reason ? (
          <p className="mt-1.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">
            <span className="text-oa-fg">Our read:</span> {plainCallReason(row.call_reason)}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 lg:pt-0.5">
        <LineNumbers line={line} />
      </div>
    </li>
  );
}
