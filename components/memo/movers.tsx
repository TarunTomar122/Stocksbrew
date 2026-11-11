import Link from "next/link";

import { FOCUS, NUM, Panel } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { signedPct, signedPoints } from "@/lib/memo/format";
import type { Memo, MemoMover } from "@/lib/memo/types";

import { explainMover } from "./explain";
import { MEMO_LIST, MEMO_ROW } from "./rows";

/**
 * Who moved the week: each holding's share of the portfolio's move, in
 * points, the ones that helped most on top and the ones that hurt most
 * underneath. When the memo has the reason (a report, or a move with a
 * confirmed cause), it is written under the row; when it has none, the row is
 * just the numbers. The row opens the page with the evidence.
 */
export function Movers({ movers, memo, example }: { movers: MemoMover[]; memo: Pick<Memo, "changed" | "hurt" | "look">; example: boolean }) {
  if (movers.length === 0) return null;
  return (
    <Panel label="Who moved it" right={<span>Points of the week&apos;s move</span>} flush>
      <ul className={MEMO_LIST}>
        {movers.map((mover) => {
          const explain = explainMover(memo, mover, example);
          const href = explain.evidence?.href ?? mover.href;
          return (
            <li key={mover.ticker}>
              <Link
                href={href}
                prefetch={false}
                title={`${mover.name}: ${signedPct(mover.pct)} this week, ${signedPoints(mover.points)} points of the portfolio's move`}
                className={`${MEMO_ROW} ${FOCUS}`}
              >
                <span className="flex items-center gap-2">
                  <StockLogo ticker={mover.ticker} size={20} eager />
                  <span className={`${NUM} text-[13.5px] font-medium text-oa-fg`}>{mover.ticker}</span>
                  <span className={`${NUM} text-[12.5px] ${mover.pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(mover.pct)}</span>
                  <span className="sr-only">this week,</span>
                  <span className={`${NUM} ml-auto text-[15px] font-semibold ${mover.points >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                    {signedPoints(mover.points)}
                    <span className="sr-only"> points</span>
                  </span>
                </span>
                {explain.text ? <span className="mt-1 block text-pretty pl-7 text-[13px] leading-[19px] text-oa-muted-fg">{explain.text}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
