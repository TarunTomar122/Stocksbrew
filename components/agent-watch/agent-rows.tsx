import Link from "next/link";

import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { StockLogo } from "@/components/stock-logo";
import { capitalize, dayWords } from "@/lib/day-words";
import { fmtPlanDay } from "@/lib/dividend-plan";
import type { AgentChip, AgentKind, AgentLine } from "@/lib/portfolio-home/agent-lines";

/**
 * The person's agents as compact rows (lib/portfolio-home/agent-lines.ts) under one sentence that says what they came
 * to (AgentLead): the kind's icon, a short name said whole, the last run as a figure and when it ran, and the stocks
 * it flagged as logo chips with their move. The row is the link (to the agent on /agents, where what it checked and
 * its sources are). Used by My stocks and the Today briefing rail.
 * Server-safe: no hooks.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** Fixed height for about eight rows, then it scrolls with no visible bar (owner rule 5). */
export const AGENT_LIST = "scrollbar-hide max-h-[30rem] divide-y divide-oa-border overflow-y-auto";

const ICON: Record<AgentKind, NavIconName> = {
  digest: "briefing",
  weekly: "briefing",
  move: "movers",
  movers: "movers",
  price: "markets",
  zone: "markets",
  sell: "markets",
  call: "portfolio",
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

/** "Today, 6:19 AM ET", "Yesterday, 6:19 AM ET", "Monday, …", "Nov 3, …", or the day alone without a time: when one row last ran. */
export function ranWords(line: Pick<AgentLine, "day" | "time">, today: string): string | null {
  if (!line.day) return null;
  const day = capitalize(dayWords(line.day, today)) || fmtPlanDay(line.day);
  return line.time ? `${day}, ${line.time} ET` : day;
}

export function AgentRow({
  line,
  ranToday,
  maxChips = RAIL_CHIPS,
}: {
  line: AgentLine;
  /**
   * New York today: the row says when it ran under its figure ("Nov 11, 6:19 AM ET"), even when every row shares it,
   * so each row reads on its own (owner rule 10).
   */
  ranToday: string;
  maxChips?: number;
}) {
  const chips = line.chips.slice(0, maxChips);
  const more = line.more + (line.chips.length - chips.length);
  // Moves that all share one earlier day say it once after the chips, not in every chip (owner rule 1).
  const sharedWhen = chips.length > 1 && chips.every((chip) => chip.when && chip.when === chips[0]!.when) ? chips[0]!.when! : null;
  const ran = ranWords(line, ranToday);
  return (
    <li>
      <Link
        href={line.href}
        prefetch={false}
        title={line.rule}
        data-track-target="agent-run"
        className={`grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-start gap-x-2.5 px-4 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        <NavIcon name={ICON[line.kind]} className="mt-px size-[18px] text-oa-muted-fg" />
        {/* The whole name, wrapping if it must, never cut (judges, ship 53: "Earnings · 3 days…"); when it ran sits
            under it, so the figure on the right keeps its own short column. */}
        <span className="min-w-0">
          <span className="block text-pretty break-words text-[13.5px] font-medium leading-5 text-oa-fg">{line.name}</span>
          {ran ? <span className="oa-mono block text-[11.5px] leading-4 tabular-nums text-oa-muted-fg">{ran}</span> : null}
        </span>
        <span className={`oa-mono whitespace-nowrap text-[12.5px] leading-5 tabular-nums ${STATUS_TONE[line.status]}`}>{line.figure}</span>
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
 * What the agents' latest runs came to, as one sentence over their rows (lib/portfolio-home/agent-lines.ts
 * agentsLead): "Flagged NVDA, down 5.5% to $168.89 on Nov 10. Earnings and filings were quiet."
 */
export function AgentLead({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="px-4 pb-2.5 text-pretty text-[14px] leading-5 text-oa-fg">{text}</p>;
}

/** The next check and how many agents are paused, once under the list; each row says when it ran itself. */
export function AgentFoot({ nextWords, paused }: { nextWords: string | null; paused: number }) {
  const parts = [
    nextWords ? `Next check ${nextWords}.` : null,
    paused > 0 ? (paused === 1 ? "One more is paused." : `${paused} more are paused.`) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="border-t border-oa-border px-4 py-2 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{parts.join(" ")}</p>;
}
