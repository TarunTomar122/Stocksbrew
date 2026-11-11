import Link from "next/link";

import { FOCUS, NUM, Panel, Tag } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { CallWord, MemoCallChange } from "@/lib/memo/types";
import { CALL_CHIP } from "@/lib/memo/view";
import { shortDay, weekdayName } from "@/lib/memo/week";

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
 * call before and after, and the day. A row opens the stock, where the
 * reason sits beside the call.
 */
export function CallChanges({ calls }: { calls: MemoCallChange[] }) {
  return (
    <Panel label="Calls that changed" right={calls.length > 0 ? <span className={NUM}>{calls.length}</span> : null} flush>
      {calls.length === 0 ? (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">None of our calls on these holdings changed this week.</p>
      ) : (
        // About eight rows, then it scrolls inside (owner rule for every list).
        <ul className="max-h-[22rem] divide-y divide-oa-border overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {calls.map((call) => (
            <li key={`${call.ticker}:${call.date}`}>
              <Link
                href={`/stock/${encodeURIComponent(call.ticker)}`}
                prefetch={false}
                title={`${call.name}: from ${CALL_CHIP[call.from].label} to ${CALL_CHIP[call.to].label} on ${weekdayName(call.date)}, ${shortDay(call.date)}`}
                className={`flex min-h-11 items-center gap-2 px-4 py-1.5 sm:gap-3 transition-colors hover:bg-oa-bg ${FOCUS}`}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
