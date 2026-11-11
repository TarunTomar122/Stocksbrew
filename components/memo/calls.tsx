import { FOCUS, NUM, Panel, Tag } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { CallWord, Memo, MemoCallChange } from "@/lib/memo/types";
import { CALL_CHIP } from "@/lib/memo/view";
import { shortDay, weekdayName } from "@/lib/memo/week";

import { explainCall } from "./explain";
import { ExplainPanel, ROW_CHEVRON } from "./explain-panel";

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
 * Calls that ended the week different from how they started: the stock, the
 * call before and after, and the day. A row opens under itself to the call's
 * reason as the memo wrote it, its source, the stock page and Ask about it.
 */
export function CallChanges({ calls, memo, example }: { calls: MemoCallChange[]; memo: Pick<Memo, "changed" | "hurt" | "look">; example: boolean }) {
  return (
    <Panel label="Calls that changed" right={calls.length > 0 ? <span className={NUM}>{calls.length}</span> : null} flush>
      {calls.length === 0 ? (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">None of our calls on these holdings changed this week.</p>
      ) : (
        // About eight rows, then it scrolls inside (owner rule for every list).
        <ul className="max-h-[22rem] divide-y divide-oa-border overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {calls.map((call) => (
            <li key={`${call.ticker}:${call.date}`}>
              <details className="group/row">
                <summary
                  title={`${call.name}: from ${CALL_CHIP[call.from].label} to ${CALL_CHIP[call.to].label} on ${weekdayName(call.date)}, ${shortDay(call.date)}`}
                  className={`flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-1.5 transition-colors hover:bg-oa-bg group-open/row:bg-oa-bg sm:gap-3 ${FOCUS} [&::-webkit-details-marker]:hidden`}
                >
                  <span className="flex w-[4.75rem] shrink-0 items-center gap-2">
                    <StockLogo ticker={call.ticker} size={20} eager />
                    <span className={`${NUM} text-[13.5px] font-medium text-oa-fg`}>{call.ticker}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <CallChip call={call.from} />
                    <span aria-hidden="true" className="text-[13px] text-oa-muted-fg">
                      →
                    </span>
                    <span className="sr-only">to</span>
                    <CallChip call={call.to} />
                  </span>
                  <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>
                    <span className="hidden sm:inline">{weekdayName(call.date).slice(0, 3)} </span>
                    {shortDay(call.date)}
                  </span>
                  {ROW_CHEVRON}
                </summary>
                <ExplainPanel
                  explain={explainCall(memo, call, example)}
                  className="mx-4 mb-2 mt-1"
                />
              </details>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
