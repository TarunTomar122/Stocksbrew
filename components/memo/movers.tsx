import Link from "next/link";

import { FOCUS, NUM, Panel } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { signedPct, signedPoints } from "@/lib/memo/format";
import type { MemoMover } from "@/lib/memo/types";

/**
 * Who moved the week: each holding's share of the portfolio's move, in
 * points, as bars either side of zero. The ones that helped most on top, the
 * ones that hurt most underneath. A row opens the stock's report, why it
 * moved, or the stock.
 */
export function Movers({ movers }: { movers: MemoMover[] }) {
  if (movers.length === 0) return null;
  const max = Math.max(...movers.map((mover) => Math.abs(mover.points))) || 1;
  const anyDown = movers.some((mover) => mover.points < 0);
  const anyUp = movers.some((mover) => mover.points > 0);
  return (
    <Panel label="Who moved it" right={<span>Points of the week&apos;s move</span>} flush>
      <div className="px-2 pb-2 pt-1 sm:px-3">
        <div aria-hidden="true" className="grid grid-cols-[5.75rem_minmax(0,1fr)_3.25rem] gap-x-2 px-2 pb-1 text-[11.5px] leading-4 text-oa-muted-fg sm:grid-cols-[7rem_minmax(0,1fr)_3.5rem]">
          <span />
          <span className="grid grid-cols-2">
            <span className="whitespace-nowrap pr-2 text-right">{anyDown ? "Pulled down" : ""}</span>
            <span className="whitespace-nowrap pl-2">{anyUp ? "Pushed up" : ""}</span>
          </span>
          <span />
        </div>
        <ul>
          {movers.map((mover) => {
            const width = (Math.abs(mover.points) / max) * 50;
            const up = mover.points >= 0;
            return (
              <li key={mover.ticker}>
                <Link
                  href={mover.href}
                  prefetch={false}
                  title={`${mover.name}: ${signedPct(mover.pct)} this week, ${signedPoints(mover.points)} points of the portfolio's move`}
                  className={`grid min-h-10 grid-cols-[5.75rem_minmax(0,1fr)_3.25rem] items-center gap-x-2 rounded px-2 transition-colors hover:bg-oa-bg sm:grid-cols-[7rem_minmax(0,1fr)_3.5rem] ${FOCUS}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StockLogo ticker={mover.ticker} size={20} eager />
                    <span className="min-w-0">
                      <span className={`${NUM} block text-[13.5px] font-medium leading-4 text-oa-fg`}>{mover.ticker}</span>
                      <span className={`${NUM} block text-[11.5px] leading-4 ${mover.pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                        {signedPct(mover.pct)}
                      </span>
                    </span>
                  </span>
                  <span aria-hidden="true" className="relative block h-6">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-oa-border" />
                    <span
                      className={`absolute top-1/2 h-3 -translate-y-1/2 ${up ? "rounded-r bg-signal-bullish" : "rounded-l bg-signal-bearish"}`}
                      style={{ left: up ? "50%" : `${50 - width}%`, width: `${Math.max(width, 0.8)}%` }}
                    />
                  </span>
                  <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{signedPoints(mover.points)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
