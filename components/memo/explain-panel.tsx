import Link from "next/link";

import { FOCUS } from "@/components/oa/kit";

import type { Explanation } from "./explain";

/**
 * What opens under a row of "Who moved it" or "Calls that changed": the memo's
 * sentence about it, its source and date, the page with the evidence, and Ask
 * about it. Server-safe; the rows open with <details>, no script.
 */

const LINK = `rounded font-medium text-oa-primary underline-offset-2 hover:underline ${FOCUS}`;

export const ROW_CHEVRON = (
  <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0 text-oa-muted-fg transition-transform group-open/row:rotate-180">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ExplainPanel({ explain, className = "" }: { explain: Explanation; className?: string }) {
  return (
    <div className={`rounded bg-oa-bg px-3 py-2 text-[13.5px] leading-5 ${className}`}>
      {/* No confirmed reason: say nothing, just offer the page and Ask (owner, Nov 11). */}
      {explain.text ? <p className="text-pretty text-oa-fg">{explain.text}</p> : null}
      {explain.text && explain.source ? <p className="mt-1 text-[12px] leading-4 text-oa-muted-fg">{explain.source}</p> : null}
      <p className={`${explain.text ? "mt-1.5 " : ""}flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] leading-[22px]`}>
        {explain.evidence ? (
          <Link href={explain.evidence.href} prefetch={false} data-track-target="evidence" className={LINK}>
            {explain.evidence.label}&nbsp;→
          </Link>
        ) : null}
        <Link href={explain.ask.href} prefetch={false} data-track-target="ask" className={LINK}>
          {explain.ask.label}&nbsp;→
        </Link>
      </p>
    </div>
  );
}
