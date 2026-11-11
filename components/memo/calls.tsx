import Link from "next/link";

import { FOCUS, NUM, Panel, Tag } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { CallWord, Memo, MemoCallChange } from "@/lib/memo/types";
import { CALL_CHIP } from "@/lib/memo/view";
import { shortDay, weekdayName } from "@/lib/memo/week";

import { callReasonText, explainCall } from "./explain";
import { MEMO_LIST, MEMO_ROW } from "./rows";

/** A call in its plain words, coloured by what it asks of you. */
export function CallChip({ call }: { call: CallWord }) {
  const chip = CALL_CHIP[call];
  return (
    <Tag tone={chip.tone} caps={false} className="h-[22px] px-1.5 text-[12.5px]">
      {chip.label}
    </Tag>
  );
}

/**
 * Calls that ended the week different from how they started: the call it is
 * now as the one chip, what it was as quiet words (never a sale chip beside a
 * Buy more, owner rule 9), and the day. The call's reason, when the memo has
 * it, is written under the row. The row opens the stock, where the call lives.
 */
export function CallChanges({ calls, memo, example }: { calls: MemoCallChange[]; memo: Pick<Memo, "changed" | "hurt" | "look">; example: boolean }) {
  return (
    <Panel label="Calls that changed" right={calls.length > 0 ? <span className={NUM}>{calls.length}</span> : null} flush>
      {calls.length === 0 ? (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">None of our calls on these holdings changed this week.</p>
      ) : (
        <ul className={MEMO_LIST}>
          {calls.map((call) => {
            const explain = explainCall(memo, call, example);
            const reason = explain.text ? callReasonText(explain.text) : null;
            return (
              <li key={`${call.ticker}:${call.date}`}>
                <Link
                  href={`/stock/${encodeURIComponent(call.ticker)}`}
                  prefetch={false}
                  title={`${call.name}: now ${CALL_CHIP[call.to].label}, was ${CALL_CHIP[call.from].label}, changed ${weekdayName(call.date)}, ${shortDay(call.date)}`}
                  className={`${MEMO_ROW} ${FOCUS}`}
                >
                  <span className="flex items-center gap-2 sm:gap-3">
                    <span className="flex w-[4.75rem] shrink-0 items-center gap-2">
                      <StockLogo ticker={call.ticker} size={20} eager />
                      <span className={`${NUM} text-[13.5px] font-medium text-oa-fg`}>{call.ticker}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <CallChip call={call.to} />
                      <span className="whitespace-nowrap text-[12.5px] text-oa-muted-fg">was {CALL_CHIP[call.from].label}</span>
                    </span>
                    <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>
                      <span className="hidden sm:inline">{weekdayName(call.date).slice(0, 3)} </span>
                      {shortDay(call.date)}
                    </span>
                  </span>
                  {reason ? <span className="mt-1 block text-pretty pl-7 text-[13px] leading-[19px] text-oa-muted-fg">{reason}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
