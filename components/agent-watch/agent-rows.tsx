import Link from "next/link";

import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { StockLogo } from "@/components/stock-logo";
import { fmtPlanDay } from "@/lib/dividend-plan";
import type { AgentChip, AgentKind, AgentLine } from "@/lib/portfolio-home/agent-lines";
import { countWord } from "@/lib/read-format";

/**
 * The person's agents as compact rows (lib/portfolio-home/agent-lines.ts): the kind's icon, a short name, the last
 * run as a figure and its day, and the stocks it flagged as logo chips with their move. The row is the link (to the
 * agent on /agents, where what it checked and its sources are). Used by My stocks and the Today briefing rail.
 * Server-safe: no hooks.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** Fixed height for about eight rows, then it scrolls with no visible bar (owner rule 5). */
export const AGENT_LIST = "scrollbar-hide max-h-[30rem] divide-y divide-oa-border overflow-y-auto overscroll-contain";

const ICON: Record<AgentKind, NavIconName> = {
  digest: "briefing",
  weekly: "briefing",
  move: "movers",
  movers: "movers",
  price: "markets",
  zone: "markets",
  earnings: "calendar",
  reported: "calendar",
  congress: "follow",
  insider: "follow",
  fund: "follow",
  filing: "filings",
  news: "news",
  reasons: "portfolio",
};

const STATUS_TONE: Record<AgentLine["status"], string> = {
  flagged: "font-semibold text-oa-primary",
  quiet: "text-oa-muted-fg",
  failed: "text-signal-bearish",
  waiting: "text-oa-muted-fg",
};

function Chip({ chip, showWhen }: { chip: AgentChip; showWhen: boolean }) {
  return (
    <span className="inline-flex h-6 items-center gap-[3px] rounded-md border border-oa-border bg-oa-bg pl-1 pr-1">
      <StockLogo ticker={chip.ticker} size={13} eager />
      <span className="oa-mono text-[11px] font-medium tabular-nums text-oa-fg">{chip.ticker}</span>
      {chip.figure ? (
        <span className={`oa-mono text-[11px] tabular-nums ${chip.tone === "up" ? "text-signal-bullish" : chip.tone === "down" ? "text-signal-bearish" : "text-oa-muted-fg"}`}>{chip.figure}</span>
      ) : null}
      {showWhen && chip.when ? <span className="oa-mono text-[11px] tabular-nums text-oa-muted-fg">{chip.when}</span> : null}
    </span>
  );
}

/** Chips per row in the side rails: two and the count of the rest keep one line at 19 to 23rem. */
const RAIL_CHIPS = 2;

export function AgentRow({
  line,
  showDay = true,
  showTime = false,
  maxChips = RAIL_CHIPS,
}: {
  line: AgentLine;
  showDay?: boolean;
  /** Its own run time ("6:12 PM"), when the rows ran at different times on the day the foot names. */
  showTime?: boolean;
  maxChips?: number;
}) {
  const chips = line.chips.slice(0, maxChips);
  const more = line.more + (line.chips.length - chips.length);
  // Moves that all share one earlier day say it once after the chips, not in every chip (owner rule 1).
  const sharedWhen = chips.length > 1 && chips.every((chip) => chip.when && chip.when === chips[0]!.when) ? chips[0]!.when! : null;
  return (
    <li>
      <Link
        href={line.href}
        prefetch={false}
        title={line.rule}
        data-track-target="agent-run"
        className={`grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        <NavIcon name={ICON[line.kind]} className="size-[18px] text-oa-muted-fg" />
        <span className="truncate text-[13.5px] font-medium leading-5 text-oa-fg">{line.name}</span>
        <span className="oa-mono whitespace-nowrap text-[12.5px] leading-5 tabular-nums">
          <span className={STATUS_TONE[line.status]}>{line.figure}</span>
          {showDay && line.day ? <span className="text-oa-muted-fg"> · {fmtPlanDay(line.day)}</span> : null}
          {showTime && line.time ? <span className="text-oa-muted-fg"> · {line.time}</span> : null}
        </span>
        {chips.length > 0 ? (
          // The whole width under the row, so the chips fit on one line in the side rail.
          <span className="col-span-3 mt-1.5 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <Chip key={chip.ticker} chip={chip} showWhen={sharedWhen === null} />
            ))}
            {more > 0 ? <span className="oa-mono inline-flex h-6 items-center px-0.5 text-[11.5px] tabular-nums text-oa-muted-fg">+{more}</span> : null}
            {sharedWhen ? <span className="oa-mono inline-flex h-6 items-center px-0.5 text-[11.5px] tabular-nums text-oa-muted-fg">on {sharedWhen}</span> : null}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * "Last run Nov 9." with the next check, once under the list, when every row shares them. With `ownTimes` each row
 * says its own time, so the foot names only the day they all ran.
 */
export function AgentFoot({
  sharedDay,
  nextWords,
  paused,
  ownTimes = false,
  sharedTime = null,
  count = 0,
}: {
  sharedDay: string | null;
  nextWords: string | null;
  paused: number;
  ownTimes?: boolean;
  /** The one time they all ran at, from the runs' own stamps: "All three ran on Nov 11 at 6:19 AM ET." */
  sharedTime?: string | null;
  /** How many rows ran, for "All three". */
  count?: number;
}) {
  const all = count === 2 ? "Both" : count > 2 ? `All ${countWord(count).toLowerCase()}` : null;
  const ran = sharedDay
    ? ownTimes
      ? `Ran on ${fmtPlanDay(sharedDay)}.`
      : sharedTime
        ? `${all ? `${all} ran` : "Ran"} on ${fmtPlanDay(sharedDay)} at ${sharedTime} ET.`
        : `Last run ${fmtPlanDay(sharedDay)}.`
    : null;
  const parts = [
    ran,
    nextWords ? `Next check ${nextWords}.` : null,
    paused > 0 ? (paused === 1 ? "One more is paused." : `${paused} more are paused.`) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="border-t border-oa-border px-4 py-2 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{parts.join(" ")}</p>;
}
