import Link from "next/link";

import { NUM } from "@/components/basket-agent/parts";
import { STATUS_WORDS, type ThesisState } from "@/lib/thesis-monitor/model";

import { CountBar, STATUS_TEXT } from "./parts";

/** On an idea basket's page: its thesis in one row (status, lines that hold, the bar), the row itself the link. */
export function ThesisRow({ href, state, lines, enabled }: { href: string; state: ThesisState | null; lines: number; enabled: boolean }) {
  return (
    <Link
      prefetch={false}
      href={href}
      className="oa-surface mb-4 flex min-h-11 min-w-0 items-center gap-3 border border-oa-border bg-oa-card px-4 py-2.5 transition-colors hover:bg-oa-accent"
    >
      <span className="shrink-0 text-[14.5px] font-medium text-oa-fg">Your thesis</span>
      {state ? (
        <>
          <span className={`shrink-0 text-[14px] font-semibold ${STATUS_TEXT[state.status]}`}>{STATUS_WORDS[state.status]}</span>
          <span className={`${NUM} min-w-0 truncate text-[13px] text-oa-muted-fg`}>
            {state.counts.holds} of {state.counts.lines} lines hold
          </span>
          <CountBar counts={state.counts} className="ml-auto hidden w-40 shrink-0 sm:flex" />
        </>
      ) : (
        <span className={`${NUM} min-w-0 truncate text-[13px] text-oa-muted-fg`}>
          {lines} {lines === 1 ? "line" : "lines"}
          {enabled ? ", first check after the close" : ""}
        </span>
      )}
    </Link>
  );
}
