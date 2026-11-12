import Link from "next/link";

import { ranWords } from "@/components/agent-watch/agent-rows";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { CARD, FOCUS } from "@/components/portfolio-home/stocks";
import { StockLogo } from "@/components/stock-logo";
import { describeWatch, nextCheckWords } from "@/lib/agent-watch";
import { newYorkToday } from "@/lib/portfolio-data";
import { agentLines, type AgentChip, type AgentKind, type AgentLine } from "@/lib/portfolio-home/agent-lines";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import type { HomeLoad } from "@/lib/portfolio-home/server";
import type { Verdict } from "@/lib/thesis-watch/rules";

/**
 * "Your agents" on My stocks, as cards under the holdings (./week.tsx lays them out with the memo): one card per agent
 * (its kind, a short name, what the last run came to and when, and the stocks it flagged as chips), opening the agent
 * on /agents where what it checked lives. The reason watcher is one more card when the person gave reasons. Signed
 * out, the example portfolio's own agents with their real latest runs. With no agents there is no card at all (owner
 * rule 4: no card without data). No sentence over the cards: it only said what the chips show (owner rule 10).
 */

export type AgentsView = {
  /** "[Example] Agents" signed out, else "Your agents" with Manage. */
  example: boolean;
  /** Flagged, failed and waiting agents first, then the quiet ones (./fit.ts can fold those into one card). */
  lines: AgentLine[];
  quiet: number;
  /** One quiet line under the cards: the next check, paused agents, or why there are none to show. */
  note: string | null;
  /** The read of the person's agents failed: the note says so, with no Manage link beside it. */
  failed: boolean;
};

const VERDICT_CHIP: Record<Verdict, { figure: string; tone: "up" | "down" | null }> = {
  holds: { figure: "holds", tone: null },
  weaker: { figure: "weaker", tone: "down" },
  broken: { figure: "broken", tone: "down" },
  played_out: { figure: "played out", tone: null },
};

/** The reason watcher as one more agent, from the same checks the stock cards read. */
async function reasonLine(load: HomeLoad): Promise<AgentLine | null> {
  const reasons = await load.sources.reasons;
  if (!reasons || reasons.state !== "ready" || reasons.value.checks.length === 0) return null;
  const checks = reasons.value.checks;
  const days = checks.map((check) => check.asOf?.slice(0, 10) ?? "").filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  const off = checks.filter((check) => check.verdict !== "holds");
  const line: AgentLine = {
    id: "reasons",
    href: "/portfolio?reasons=1",
    kind: "reasons",
    name: "Your reasons",
    rule: "Checks the reasons you gave for owning your stocks.",
    status: off.length > 0 ? "flagged" : "quiet",
    figure: off.length > 0 ? `${off.length} flagged` : checks.length === 1 ? "holds" : "all hold",
    day: days[days.length - 1] ?? null,
    chips: off.slice(0, 3).map((check) => ({ ticker: check.ticker, ...VERDICT_CHIP[check.verdict] })),
    more: Math.max(0, off.length - 3),
  };
  return line;
}

/** "Next check after the close today, from 5:30 PM ET. One more is paused." Null when there is neither. */
function footWords(next: string | null, paused: number, today: string): string | null {
  const parts = [
    next ? `Next check ${nextCheckWords(next, today)}.` : null,
    paused > 0 ? (paused === 1 ? "One more is paused." : `${paused} more are paused.`) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** The quiet agents last, so the cards that flagged something lead and the quiet ones can share one card. */
function view(example: boolean, lines: AgentLine[], note: string | null, failed = false): AgentsView | null {
  if (lines.length === 0 && !note) return null;
  const loud = lines.filter((line) => line.status !== "quiet");
  const quiet = lines.filter((line) => line.status === "quiet");
  return { example, lines: [...loud, ...quiet], quiet: quiet.length, note, failed };
}

/**
 * The agents My stocks shows, or null for none (no card that only says "you have no agents", owner rule 4). It waits
 * only for the person's agents (one small read with its own time limit), the reasons the stock cards read too, and,
 * signed out, the example's cached runs.
 */
export async function loadAgents(load: HomeLoad): Promise<AgentsView | null> {
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const today = newYorkToday();
  const signedIn = Boolean(viewer.uid);
  const reason = mode === "mine" ? await reasonLine(load) : null;
  const reasons = reason ? [reason] : [];

  if (signedIn && (agents.state === "slow" || agents.state === "failed")) {
    return view(false, reasons, "We could not read your agents just now. Reload in a minute.", true);
  }
  const own = signedIn && agents.state === "ready" && agents.value.jobs.length > 0 ? agents.value : null;
  if (own) {
    const { lines, paused, next } = agentLines(own, today, { describe: describeWatch });
    if (lines.length === 0) {
      return view(false, reasons, paused === 1 ? "Your one agent is paused, so nothing is being checked." : `All ${paused} of your agents are paused, so nothing is being checked.`);
    }
    return view(false, [...lines, ...reasons], footWords(next, paused, today));
  }
  // Signed out: the example's own agents, with what their latest real runs found. They open the agents page.
  const example = !signedIn ? await loadExampleAgentsSource() : null;
  if (example) {
    const { lines, next } = agentLines(example, today, { hrefFor: () => "/agents" });
    return view(true, lines, footWords(next, 0, today));
  }
  return view(false, reasons, null);
}

/* ── the cards ────────────────────────────────────────────────────────── */

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

const CELL_LINK = `flex h-full flex-col px-3.5 py-2.5 transition-colors hover:bg-oa-accent ${FOCUS}`;

function Chip({ chip, showWhen }: { chip: AgentChip; showWhen: boolean }) {
  return (
    <span className="inline-flex h-6 items-center gap-[3px] rounded-md border border-oa-border bg-oa-bg pl-1 pr-1">
      <StockLogo ticker={chip.ticker} size={13} atOnce />
      <span className="oa-mono text-[11px] font-medium tabular-nums text-oa-fg">{chip.ticker}</span>
      {chip.figure ? (
        <span className={`oa-mono text-[11px] tabular-nums ${chip.tone === "up" ? "text-signal-bullish" : chip.tone === "down" ? "text-signal-bearish" : "text-oa-muted-fg"}`}>{chip.figure}</span>
      ) : null}
      {showWhen && chip.when ? <span className="oa-mono text-[11px] tabular-nums text-oa-muted-fg">{chip.when}</span> : null}
    </span>
  );
}

/** Two chips and the count of the rest keep one line in a card a quarter of the page wide. */
const CELL_CHIPS = 2;

/**
 * One agent as a card, in the same words as the briefing's rows (../agent-watch/agent-rows.tsx): the kind's icon, the
 * whole name, when it ran, what it came to, and the stocks it flagged as logo chips with their move.
 */
export function AgentCell({ line, today, className, label = null }: { line: AgentLine; today: string; className: string; label?: React.ReactNode }) {
  const chips = line.chips.slice(0, CELL_CHIPS);
  const more = line.more + (line.chips.length - chips.length);
  // Moves that all share one earlier day say it once after the chips, not in every chip (owner rule 1).
  const sharedWhen = chips.length > 1 && chips.every((chip) => chip.when && chip.when === chips[0]!.when) ? chips[0]!.when! : null;
  const ran = ranWords(line, today);
  return (
    <div className={`${CARD} ${className}`}>
      <Link href={line.href} prefetch={false} title={line.rule} data-track-target="agent-run" className={CELL_LINK}>
        {/* The section's name, when the agents start beside the cards before them (./week.tsx). */}
        {label}
        <span className="grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-start gap-x-2.5">
          <NavIcon name={ICON[line.kind]} className="mt-px size-[18px] text-oa-muted-fg" />
          <span className="min-w-0">
            <span className="block text-pretty break-words text-[13.5px] font-medium leading-5 text-oa-fg">{line.name}</span>
            {ran ? <span className="oa-mono block text-[11.5px] leading-4 tabular-nums text-oa-muted-fg">{ran}</span> : null}
          </span>
          <span className={`oa-mono whitespace-nowrap text-[12.5px] leading-5 tabular-nums ${STATUS_TONE[line.status]}`}>{line.figure}</span>
        </span>
        {chips.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <Chip key={chip.ticker} chip={chip} showWhen={sharedWhen === null} />
            ))}
            {more > 0 ? <span className="oa-mono inline-flex h-6 items-center px-0.5 text-[11.5px] tabular-nums text-oa-muted-fg">+{more}</span> : null}
            {sharedWhen ? <span className="oa-mono inline-flex h-6 items-center px-0.5 text-[11.5px] tabular-nums text-oa-muted-fg">on {sharedWhen}</span> : null}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

/** The quiet agents in one card, when that ends their row (./fit.ts): each by its icon and name, and when they ran. */
export function QuietCell({ lines, today, className, label = null }: { lines: AgentLine[]; today: string; className: string; label?: React.ReactNode }) {
  const days = [...new Set(lines.map((line) => ranWords(line, today)).filter(Boolean))];
  return (
    <div className={`${CARD} ${className}`}>
      <Link href="/agents" prefetch={false} className={CELL_LINK}>
        {label}
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] font-medium leading-5 text-oa-fg">{lines.length} agents</span>
          <span className="oa-mono text-[12.5px] leading-5 text-oa-muted-fg">quiet</span>
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {lines.map((line) => (
            <span key={line.id} title={line.rule} className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
              <NavIcon name={ICON[line.kind]} className="size-[15px] shrink-0" />
              {line.name}
            </span>
          ))}
        </span>
        {/* When they ran, once, if they all ran together. */}
        {days.length === 1 ? <span className="oa-mono mt-1 block text-[11.5px] leading-4 tabular-nums text-oa-muted-fg">{days[0]}</span> : null}
      </Link>
    </div>
  );
}
