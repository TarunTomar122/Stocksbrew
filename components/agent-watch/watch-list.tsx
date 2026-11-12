import Link from "next/link";

/**
 * Shared bits for the agent views (./agent-rows.tsx has the agent rows themselves): the link and list styles, and
 * the row for a watch that is not set up yet. Server-safe: no hooks.
 */

export const WATCH_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
export const WATCH_LINK = `font-medium text-oa-primary hover:underline ${WATCH_FOCUS} rounded`;
/** Fixed height for about eight short rows, then it scrolls with no visible bar. */
export const WATCH_LIST = "scrollbar-hide max-h-[32rem] divide-y divide-oa-border overflow-y-auto";

/**
 * A watch that is not set up: what it would watch, opening the agents page with it filled in (nothing is saved there
 * until the person says so). The row is the link; no arrow on each one (owner rule 1).
 */
export function WouldWatchRow({ request, href }: { request: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        data-track-target="watch"
        title="We read it back to you on the agents page before anything is saved."
        className={`block px-4 py-2.5 text-pretty text-[13.5px] leading-[18px] text-oa-fg transition-colors hover:bg-oa-accent ${WATCH_FOCUS}`}
      >
        {/[.!?]$/.test(request) ? request : `${request}.`}
      </Link>
    </li>
  );
}
