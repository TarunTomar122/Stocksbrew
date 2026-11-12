import Link from "next/link";

import { FOCUS, NUM } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { signedPct, signedPoints } from "@/lib/memo/format";
import type { Memo, MemoMover } from "@/lib/memo/types";
import { weekMoveWords } from "@/lib/memo/week";

import { explainMover } from "./explain";
import { MEMO_CARD, memoGrid } from "./rows";

/**
 * Who moved the week, as small stock cards (owner rule 3): the logo and ticker, the holding's share of the
 * portfolio's move in points as the big figure, its own move over the week, and the reason when the memo has one
 * (a report, or a move with a confirmed cause); with none, nothing is written. The ones that helped most come
 * first, the ones that hurt most last. The card opens the page with the evidence.
 */
export function Movers({ movers, memo, example }: { movers: MemoMover[]; memo: Pick<Memo, "changed" | "hurt" | "look" | "complete">; example: boolean }) {
  if (movers.length === 0) return null;
  // The memo's week runs from Friday's close; while it runs, "so far" keeps it apart from a five-session move.
  const when = weekMoveWords(memo.complete);
  return (
    <section aria-labelledby="memo-movers" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-2">
        <h2 id="memo-movers" className="oa-label">
          Who moved it
        </h2>
        <p className="text-[12.5px] leading-5 text-oa-muted-fg">Points each added to or took off the week</p>
      </div>
      <ul className={`oa-card-grid ${memoGrid(movers.length)}`}>
        {movers.map((mover) => {
          const explain = explainMover(memo, mover, example);
          const href = explain.evidence?.href ?? mover.href;
          const tone = mover.points >= 0 ? "text-signal-bullish" : "text-signal-bearish";
          return (
            <li key={mover.ticker} className="min-w-0">
              <Link
                href={href}
                prefetch={false}
                title={`${mover.name}: ${signedPoints(mover.points)} points of the portfolio's move, ${signedPct(mover.pct)} ${when}`}
                className={`${MEMO_CARD} ${FOCUS}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={mover.ticker} size={20} eager />
                  <span className={`${NUM} text-[13.5px] font-medium text-oa-fg`}>{mover.ticker}</span>
                </span>
                <span className={`${NUM} mt-2 block text-[22px] font-semibold leading-7 tracking-[-0.01em] ${tone}`}>
                  {signedPoints(mover.points)}
                  <span className="ml-1 text-[13px] font-normal text-oa-muted-fg">pts</span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-[18px] text-oa-muted-fg">
                  <span className={`${NUM} ${mover.pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(mover.pct)}</span> {when}
                </span>
                {explain.text ? <span className="mt-2 block text-pretty text-[13px] leading-[19px] text-oa-fg">{explain.text}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
