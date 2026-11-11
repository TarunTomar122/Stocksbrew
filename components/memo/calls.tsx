import Link from "next/link";

import { FOCUS, NUM, Tag } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { CallWord, Memo, MemoCallChange } from "@/lib/memo/types";
import { CALL_CHIP, callShows } from "@/lib/memo/view";
import { shortDay, weekdayName } from "@/lib/memo/week";

import { callReasonText, explainCall } from "./explain";
import { MEMO_CARD, memoCell, memoGrid } from "./rows";

/** A call in its plain words, coloured by what it asks of you. */
export function CallChip({ call }: { call: CallWord }) {
  const chip = CALL_CHIP[call];
  return (
    <Tag tone={chip.tone} caps={false} className="h-[24px] px-2 text-[14px] font-medium">
      {chip.label}
    </Tag>
  );
}

/**
 * Calls that ended the week different from how they started, as small stock cards: the call it is now and the day
 * it changed. Owner rule 9: a call stays put, and a sale never sits beside Keep or Buy more. So the call it replaced
 * ("was Keep") shows only for a one-step move between Keep and Buy more; a flip (a skipped step, a reversal within
 * five sessions, two changes in a week) shows the call now and its date, and the reason when the memo has one
 * (lib/memo/view.ts callShows). The card opens the stock, where the call lives.
 */
export function CallChanges({ calls, memo, example }: { calls: MemoCallChange[]; memo: Pick<Memo, "changed" | "hurt" | "look">; example: boolean }) {
  return (
    <section aria-labelledby="memo-calls" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-2">
        <h2 id="memo-calls" className="oa-label">
          Calls that changed
        </h2>
      </div>
      {calls.length === 0 ? (
        <p className="oa-surface border border-oa-border bg-oa-card px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">None of our calls on these holdings changed this week.</p>
      ) : (
        <ul className={`oa-card-grid ${memoGrid(calls.length)}`}>
          {calls.map((call, index) => {
            const explain = explainCall(memo, call, example);
            const reason = explain.text ? callReasonText(explain.text) : null;
            const { was } = callShows(call);
            const day = `${weekdayName(call.date).slice(0, 3)} ${shortDay(call.date)}`;
            return (
              <li key={`${call.ticker}:${call.date}`} className={memoCell(index, calls.length)}>
                <Link
                  href={`/stock/${encodeURIComponent(call.ticker)}`}
                  prefetch={false}
                  title={`${call.name}: ${CALL_CHIP[call.to].label}${was ? `, was ${CALL_CHIP[was].label}` : ""}, since ${weekdayName(call.date)}, ${shortDay(call.date)}`}
                  className={`${MEMO_CARD} ${FOCUS}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StockLogo ticker={call.ticker} size={20} eager />
                    <span className={`${NUM} text-[13.5px] font-medium text-oa-fg`}>{call.ticker}</span>
                    <span className={`${NUM} ml-auto shrink-0 whitespace-nowrap text-[12.5px] text-oa-muted-fg`}>{day}</span>
                  </span>
                  <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CallChip call={call.to} />
                    {was ? <span className="whitespace-nowrap text-[12.5px] text-oa-muted-fg">was {CALL_CHIP[was].label}</span> : null}
                  </span>
                  {reason ? <span className="mt-2 block text-pretty text-[13px] leading-[19px] text-oa-fg">{reason}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
