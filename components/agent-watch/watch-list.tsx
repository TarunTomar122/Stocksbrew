import Link from "next/link";

import type { ActiveWatch } from "@/lib/agent-watch";
import { nextCheckWords } from "@/lib/agent-watch";

/**
 * The person's active watches as rows: what each one watches (it opens the
 * agent on /agents), when it last checked and what it found, and when it
 * checks next. Used by the My stocks overview (components/portfolio-home) and
 * the Today briefing (components/briefing). Server-safe: no hooks.
 */

export const WATCH_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
export const WATCH_LINK = `font-medium text-oa-primary hover:underline ${WATCH_FOCUS} rounded`;
/** Fixed height for about eight short rows, then it scrolls with no visible bar. */
export const WATCH_LIST = "scrollbar-hide max-h-[32rem] divide-y divide-oa-border overflow-y-auto overscroll-contain";

const DOT: Record<"notify" | "nothing" | "could_not_check" | "none", string> = {
  notify: "bg-oa-primary",
  nothing: "border border-oa-muted-fg",
  could_not_check: "bg-signal-bearish",
  none: "border border-dashed border-oa-muted-fg",
};

const DOT_LABEL: Record<keyof typeof DOT, string> = {
  notify: "Found something",
  nothing: "Nothing to report",
  could_not_check: "Could not check",
  none: "Not run yet",
};

function StatusDot({ state }: { state: keyof typeof DOT }) {
  return <span role="img" aria-label={DOT_LABEL[state]} className={`mt-[5px] inline-block size-2 shrink-0 rounded-full ${DOT[state]}`} />;
}

export function WatchRow({
  row,
  today,
  showNext = true,
  extra = null,
}: {
  row: ActiveWatch;
  today: string;
  /** Off where one line under the list says when they all check next (the briefing strip). */
  showNext?: boolean;
  /** A link to where the run's finding shows on this page, streamed in after the row. */
  extra?: React.ReactNode;
}) {
  const last = row.last;
  const fired = last?.decision === "notify";
  return (
    <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5 leading-[18px]">
      <StatusDot state={last ? last.decision : "none"} />
      <div className="min-w-0">
        <Link href={row.href} prefetch={false} title={row.name} className={`block text-pretty text-[13.5px] leading-[18px] text-oa-fg hover:underline ${WATCH_FOCUS} rounded`}>
          {row.what}
        </Link>
        <p className="mt-0.5 text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">
          {last ? (
            <>
              <span className="oa-mono whitespace-nowrap text-[12px] tabular-nums">{last.when}</span>
              {": "}
              {fired ? (
                // The finding itself opens the run, so no "see more" words repeat on each fired row.
                <Link href={row.href} prefetch={false} data-track-target="agent-run" className={`text-oa-fg underline decoration-[color-mix(in_srgb,var(--oa-primary)_50%,transparent)] underline-offset-2 hover:decoration-oa-primary ${WATCH_FOCUS} rounded`}>
                  {last.outcome}
                </Link>
              ) : (
                last.outcome
              )}
            </>
          ) : (
            "It has not run yet."
          )}
          {showNext && row.next ? <> Checks again {nextCheckWords(row.next, today)}.</> : null}
        </p>
        {extra}
      </div>
    </li>
  );
}

/** A watch that is not set up: what it would watch, opening the agents page with it filled in (nothing is saved there until the person says so). */
export function WouldWatchRow({ request, href }: { request: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        data-track-target="watch"
        title="We read it back to you on the agents page before anything is saved."
        className={`grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-2.5 px-4 py-2.5 transition-colors hover:bg-oa-accent ${WATCH_FOCUS}`}
      >
        <StatusDot state="none" />
        <span className="text-pretty text-[13.5px] leading-[18px] text-oa-fg">{/[.!?]$/.test(request) ? request : `${request}.`}</span>
        <span aria-hidden="true" className="text-[13px] leading-[18px] text-oa-primary">
          →
        </span>
      </Link>
    </li>
  );
}

/** "Checks again after the close today, from 5:30 PM ET." for the earliest next check among the rows, or null. */
export function soonestNext(rows: ActiveWatch[]): string | null {
  return rows.map((row) => row.next).filter((day): day is string => Boolean(day)).sort()[0] ?? null;
}
