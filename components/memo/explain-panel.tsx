import Link from "next/link";

import { FOCUS } from "@/components/oa/kit";

import type { Explanation } from "./explain";

/**
 * What opens under a row of "Who moved it" or "Calls that changed": the memo's
 * sentence about it, its source and date, the page with the evidence, and Ask
 * about it. Server-safe; the rows open with <details>, no script.
 */

const LINK = `rounded font-medium text-oa-primary underline-offset-2 hover:underline ${FOCUS}`;

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
