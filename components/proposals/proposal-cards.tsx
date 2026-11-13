"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CARD_HOVER } from "@/components/briefing/stock-card";
import { OaButton } from "@/components/oa/button";
import { NavIcon } from "@/components/oa/nav-icon";
import { cardAction, layoutPlan, planHasTile, proposalBlocks, type PlannedBlock } from "@/components/proposals/groups";
import { LevelBar, MoveRange } from "@/components/proposals/level-bar";
import { StockLogo } from "@/components/stock-logo";
import { trackProposalDecided } from "@/lib/product-analytics";
import { capitalize, dayWords, etDayOf, etToday } from "@/lib/day-words";
import {
  type ProposalCard,
  type ProposalResult,
  type WatchSummary,
} from "@/lib/proposals";
import {
  PROPOSAL_ANSWERED_EVENT,
  PROPOSALS_CHANGED_EVENT,
  type ProposalAnsweredDetail,
  type ProposalsChangedDetail,
} from "@/lib/proposals-event";
import type { RecordItem } from "@/lib/thread/record";

function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function toneClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

function price(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Today", "Yesterday", "Monday", "Nov 3": recent days in words (owner rule 4). */
function when(at: string, today: string): string {
  const day = etDayOf(at);
  return day ? capitalize(dayWords(day, today)) : "";
}

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

const CLOSED: CardState = { busy: null, result: null, error: null, open: false };

type CardState = {
  busy: "accept" | "dismiss" | null;
  result: ProposalResult | null;
  error: string | null;
  open: boolean;
  gone?: boolean;
};

function RunLog({ card, today }: { card: ProposalCard; today: string }) {
  return (
    <div className="grid min-w-0 gap-3 text-[13px] leading-5 sm:grid-cols-2 sm:gap-x-6">
      {/* The second line of the reasoning, and what accepting does: the card itself keeps one line. */}
      {card.why[1] || card.does ? (
        <div className="min-w-0 text-pretty sm:col-span-2">
          {card.why[1] ? <p className="text-oa-fg">{card.why[1]}</p> : null}
          {card.does ? (
            <p className="text-oa-muted-fg">
              <span className="font-medium text-oa-fg">If you accept: </span>
              {card.does}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-oa-muted-fg">What I read</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {card.read.map((source, index) => {
            const day = when(source.at, today);
            const label = source.href ? (
              source.href.startsWith("http") ? (
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`rounded text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary ${FOCUS}`}
                >
                  {source.label}
                </a>
              ) : (
                <Link
                  href={source.href}
                  prefetch={false}
                  className={`rounded text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary ${FOCUS}`}
                >
                  {source.label}
                </Link>
              )
            ) : (
              <span className="text-oa-fg">{source.label}</span>
            );
            return (
              <li key={index} className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0 text-pretty">{label}</span>
                {day ? <span className="shrink-0 text-[12px] text-oa-muted-fg">{day}</span> : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-oa-muted-fg">What I checked</p>
        <dl className="mt-1 flex flex-col gap-0.5">
          {card.figures.map((figure, index) => (
            <div key={index} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="min-w-0 truncate text-oa-muted-fg">{figure.label}</dt>
              <dd className="oa-mono shrink-0 tabular-nums text-oa-fg">{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The status rows: what the agent watches and when it next checks. */
function statusRows(watch: WatchSummary): Array<[string, string]> {
  return [
    ["Stocks", String(watch.stocks)],
    ["Price alerts set", String(watch.alerts)],
    ["Agents", watch.paused ? `${watch.agents} running, ${watch.paused} paused` : `${watch.agents} running`],
    ...(watch.next ? ([["Next check", capitalize(watch.next)]] as Array<[string, string]>) : []),
  ];
}

/**
 * The queue's companion: what the agent watches and when it next checks (it used to sit in a short side rail). A tile
 * beside the cards when that fills the last row; a one-row strip across the top when the cards already fill theirs
 * (or there are none), so no row ends with an empty slot (owner rules 4 and 10).
 */
export function AgentStatus({ watch, variant }: { watch: WatchSummary; variant: "tile" | "strip" }) {
  const rows = statusRows(watch);
  const head = (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary"
      >
        <NavIcon name="agents" className="size-[16px]" />
      </span>
      <span className="text-[14px] font-semibold text-oa-fg">What I watch</span>
    </span>
  );
  if (variant === "strip") {
    return (
      <Link
        href="/agents"
        prefetch={false}
        className={`oa-surface flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5 border border-oa-border bg-oa-card px-3.5 py-2.5 ${CARD_HOVER} ${FOCUS}`}
      >
        {head}
        {rows.map(([label, value]) => (
          <span key={label} className="flex items-baseline gap-1.5 text-[13px] leading-5">
            <span className="text-oa-muted-fg">{label}</span>
            <span className="oa-mono font-semibold tabular-nums text-oa-fg">{value}</span>
          </span>
        ))}
      </Link>
    );
  }
  return (
    <Link
      href="/agents"
      prefetch={false}
      className={`oa-surface flex h-full w-full min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3 ${CARD_HOVER} ${FOCUS}`}
    >
      {head}
      <span className="mt-2.5 flex flex-col divide-y divide-oa-border">
        {rows.map(([label, value]) => (
          <span key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-[13.5px] leading-5">
            <span className="shrink-0 text-oa-muted-fg">{label}</span>
            <span className="oa-mono min-w-0 text-right font-semibold tabular-nums text-oa-fg">{value}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}

function Mark({ ticker }: { ticker: string | null }) {
  if (ticker) return <StockLogo ticker={ticker} size={28} eager />;
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md border border-oa-border bg-oa-bg text-oa-muted-fg"
    >
      <NavIcon name="agents" className="size-[16px]" />
    </span>
  );
}

/**
 * The agent's proposals that wait for an answer, as cards: logo, ticker, price and today's move, the proposal and its
 * one reason, Accept (what it does on hover) and Dismiss, and the run log behind "How I got here": the sources read
 * and the figures checked. An answered card says what happened in place of its buttons;
 * a dismissed one leaves. Opening a run log widens that card to the whole row, so its neighbours keep their height.
 */
export function ProposalCards({
  initial,
  watch = null,
  today: todayProp,
  statusAlone = false,
  recordOnPage = false,
  compact = false,
  fold,
}: {
  initial: ProposalCard[];
  watch?: WatchSummary | null;
  today?: string;
  /** With no proposals waiting, still show the status strip (on /agent, where it replaced the side rail). */
  statusAlone?: boolean;
  /** The page has the record ("What I did", /agent): an answered card leaves at once and its line goes there. */
  recordOnPage?: boolean;
  /**
   * One line per card (the briefing's desk): the action, or under a group's heading only the card's own part of it;
   * the line that set it off is the card's hover and its run log. The status shows only as the tile that fills an odd
   * row, never as the strip above the cards.
   */
  compact?: boolean;
  /**
   * Show only this many cards (the briefing: its first row) and the rest behind one "Show N more" under them, which
   * opens in place. Folding is only how the queue is drawn: the count, the bell and every answer still cover the whole
   * queue, and the rest stays reachable whatever is answered.
   */
  fold?: number;
}) {
  const router = useRouter();
  const [unfolded, setUnfolded] = React.useState(false);

  const [cards, setCards] = React.useState(initial);
  const [states, setStates] = React.useState<Record<string, CardState>>({});
  const today = todayProp ?? etToday();
  const headingId = React.useId();

  const stateOf = (id: string): CardState => states[id] ?? CLOSED;
  const patch = (id: string, next: Partial<CardState>) =>
    setStates((all) => ({
      ...all,
      [id]: {
        ...(all[id] ?? { busy: null, result: null, error: null, open: false }),
        ...next,
      },
    }));

  /** One run log open at a time: opening one closes any other. */
  const toggle = (id: string) =>
    setStates((all) =>
      Object.fromEntries(
        Object.entries({ ...all, [id]: { ...(all[id] ?? CLOSED), open: !(all[id]?.open ?? false) } }).map(
          ([key, entry]) => [key, key === id ? entry : { ...entry, open: false }],
        ),
      ),
    );

  // Escape closes the open run log.
  const anyOpen = Object.values(states).some((entry) => entry.open);
  React.useEffect(() => {
    if (!anyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        setStates((all) =>
          Object.fromEntries(Object.entries(all).map(([key, entry]) => [key, { ...entry, open: false }])),
        );
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anyOpen]);

  const waiting = cards.filter((card) => !stateOf(card.id).result?.ok).length;
  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<ProposalsChangedDetail>(PROPOSALS_CHANGED_EVENT, {
        detail: { waiting },
      }),
    );
  }, [waiting]);

  /**
   * After an answer the queue is read again (GET /api/proposals: the server worked out the next proposal once the throttle
   * was reset), and merged by id: a card answered here never comes back, a new one joins at the end. Only the queue is
   * read, never the whole page.
   */
  const answeredIds = React.useRef(new Set<string>());
  const refreshQueue = React.useCallback(async () => {
    try {
      const response = await fetch("/api/proposals", { credentials: "same-origin", cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; proposals?: ProposalCard[] } | null;
      if (!response.ok || !body?.ok || !Array.isArray(body.proposals)) return;
      const fresh = body.proposals.filter((card) => !answeredIds.current.has(card.id));
      setCards((current) => {
        const kept = current.filter((card) => !answeredIds.current.has(card.id));
        const known = new Set(kept.map((card) => card.id));
        return [...kept, ...fresh.filter((card) => !known.has(card.id))];
      });
    } catch {
      // The queue stays as it is; the next page load reads it again.
    }
  }, []);

  /**
   * A proposal left the queue: on /agent its line goes into the record at once (PROPOSAL_ANSWERED_EVENT); the queue is
   * read again for the next one (not when the answer navigates away, as the practice ticket does).
   */
  const answered = (
    card: ProposalCard,
    status: "accepted" | "dismissed" | "expired",
    message: string | null,
    leaving = false,
  ) => {
    answeredIds.current.add(card.id);
    if (!leaving) void refreshQueue();
    if (!recordOnPage) return;
    const text = status === "accepted" && message ? message : card.title;
    const item: RecordItem = {
      id: `proposal:${card.id}`,
      kind: status,
      ticker: card.ticker,
      text: /[.!?]$/.test(text) ? text : `${text}.`,
      tag: status === "accepted" ? "Done" : status === "dismissed" ? "Dismissed" : "Expired",
      figure: null,
      href: card.ticker ? `/stock/${encodeURIComponent(card.ticker)}` : "/agents",
    };
    window.dispatchEvent(
      new CustomEvent<ProposalAnsweredDetail>(PROPOSAL_ANSWERED_EVENT, {
        detail: { item },
      }),
    );
  };

  const decide = async (card: ProposalCard, decision: "accept" | "dismiss") => {
    patch(card.id, { busy: decision, error: null });
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(card.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        status?: string;
        result?: ProposalResult | null;
        error?: string;
      } | null;
      if (body?.ok) trackProposalDecided({ decision: decision === "accept" ? "accepted" : "dismissed" });
      if (decision === "dismiss" && (body?.ok || body?.status === "dismissed" || body?.status === "expired")) {
        answered(card, body?.status === "expired" ? "expired" : "dismissed", null);
        setCards((all) => all.filter((entry) => entry.id !== card.id));
        return;
      }
      if (body?.status === "expired") {
        // The reason the facts changed, in the server's words. With the record on the page the line moves there at once;
        // elsewhere the card says it and leaves a moment later.
        const message = body.result?.message || "The facts changed since, so this one is gone.";
        if (recordOnPage) {
          answered(card, "expired", null);
          setCards((all) => all.filter((entry) => entry.id !== card.id));
          return;
        }
        patch(card.id, { busy: null, gone: true, error: message });
        window.setTimeout(() => setCards((all) => all.filter((entry) => entry.id !== card.id)), 2500);
        return;
      }
      const result = body?.result ?? null;
      if (body?.ok && result) {
        if (result.code === "opened" && result.href) {
          answered(card, "accepted", result.message, true);
          router.push(result.href);
          return;
        }
        if (recordOnPage) {
          // Out of "Needs you" and into "What I did" at once, with what it did.
          answered(card, "accepted", result.message);
          setCards((all) => all.filter((entry) => entry.id !== card.id));
          return;
        }
        patch(card.id, { busy: null, result });
        return;
      }
      patch(card.id, {
        busy: null,
        error: result?.message || body?.error || "That didn't go through. Try again in a minute.",
      });
    } catch {
      patch(card.id, {
        busy: null,
        error: "That didn't go through. Check your connection and try again.",
      });
    }
  };

  const status = watch && watch.stocks > 0 ? watch : null;
  if (cards.length === 0) return status && statusAlone ? <AgentStatus watch={status} variant="strip" /> : null;

  // Cards that do the same thing sit under one heading that says it once, laid out two across so every row ends full
  // (components/proposals/groups.ts layoutPlan): a group with an odd count takes a lone card into its last row, else
  // the status tile; odd lone cards take the tile. With the tile in the grid the strip above is hidden; one column (a
  // phone) has no empty slot, so the status is always the strip there.
  // Decided from the cards themselves, not which run log is open, so opening one never moves the others.
  const folded = fold !== undefined && !unfolded && cards.length > fold;
  const shownCards = folded ? cards.slice(0, fold) : cards;
  const plan = layoutPlan(proposalBlocks(shownCards), Boolean(status));
  const tiled = planHasTile(plan);
  // Each block's cards in grid order: its own (said under its heading), then any lone guest (with its whole title).
  const itemsOf = (block: PlannedBlock) => [
    ...block.cards.map((card) => ({ card, grouped: block.heading !== null })),
    ...block.guests.map((card) => ({ card, grouped: false })),
  ];
  // One run log open at a time. It opens as a panel across the grid, inserted after the open card's row in its block
  // (two across) or right under the card (one column), with a pointer to its card: no card in the grid stretches or moves.
  const openId = cards.find((card) => stateOf(card.id).open)?.id ?? null;
  const openBlock = openId ? plan.findIndex((block) => itemsOf(block).some((item) => item.card.id === openId)) : -1;
  const openPos = openBlock < 0 ? -1 : itemsOf(plan[openBlock]!).findIndex((item) => item.card.id === openId);
  const openItems = openBlock < 0 ? 0 : itemsOf(plan[openBlock]!).length + (plan[openBlock]!.tile ? 1 : 0);
  const rowEnd = openPos < 0 ? -1 : Math.min(openPos - (openPos % 2) + 1, openItems - 1);
  const panel = (variant: "narrow" | "wide") => {
    const card = itemsOf(plan[openBlock]!)[openPos]!.card;
    return (
      <li
        key={`log-${variant}`}
        id={`proposal-log-${card.id}-${variant}`}
        className={`col-span-full ${variant === "narrow" ? "[@container(min-width:34rem)]:hidden" : "hidden [@container(min-width:34rem)]:block"}`}
      >
        <div className="oa-surface relative border border-oa-border bg-oa-card px-3.5 pb-3.5 pt-3">
          {/* The pointer up to its card: under the card's column. */}
          <span
            aria-hidden="true"
            className="absolute -top-[7px] size-3 -translate-x-1/2 rotate-45 border-l border-t border-oa-border bg-oa-card"
            style={{
              left: variant === "narrow" ? "2rem" : openPos % 2 === 0 ? "25%" : "75%",
            }}
          />
          <p className="mb-2.5 text-[13px] font-semibold text-oa-fg">
            How I got here
            {card.ticker ? <span className="oa-mono font-medium text-oa-muted-fg"> · {card.ticker}</span> : null}
          </p>
          <RunLog card={card} today={today} />
        </div>
      </li>
    );
  };

  const cardItem = (card: ProposalCard, grouped: boolean) => {
    const state = stateOf(card.id);
    const done = state.result?.ok ? state.result : null;
    const logId = `proposal-log-${card.id}-narrow proposal-log-${card.id}-wide`;
    const action = cardAction(card, grouped);
    return (
      <li
        key={card.id}
        className={`oa-surface flex min-w-0 flex-col border bg-oa-card ${CARD_HOVER} ${compact ? "[container-type:inline-size]" : ""} ${state.open ? "border-[color-mix(in_srgb,var(--oa-fg)_30%,transparent)]" : "border-oa-border"}`}
      >
        {/* Compact on a wide card, the buttons sit beside the body instead of under it, so a wide card is not half empty. */}
        <div className={compact ? "flex min-w-0 flex-1 flex-col [@container(min-width:36rem)]:flex-row [@container(min-width:36rem)]:items-center [@container(min-width:36rem)]:gap-4" : "contents"}>
        {/* The card body is the run log's toggle: no link text repeated on every card (owner rule 1). */}
        <button
          type="button"
          aria-expanded={state.open}
          // Only a panel that is on the page; a short name for the toggle, not the whole card read out.
          aria-controls={state.open ? logId : undefined}
          aria-label={`How I got here, ${card.ticker ?? "your agents"}`}
          // Compact, the line that set it off is the hover (and the run log).
          title={compact ? card.why[0] : undefined}
          onClick={() => toggle(card.id)}
          className={`flex min-w-0 flex-col rounded-[inherit] px-3.5 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${compact ? "[@container(min-width:36rem)]:flex-1 [@container(min-width:36rem)]:pb-3" : ""}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Mark ticker={card.ticker} />
            <span className="block min-w-0 leading-5">
              <span className="oa-mono block text-[14px] font-semibold text-oa-fg">
                {card.ticker ?? "Your agents"}
              </span>
              {card.quote ? (
                <span className="oa-mono flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-4 tabular-nums">
                  <span className="text-oa-muted-fg">{price(card.quote.price)}</span>
                  {card.quote.dayPct !== null ? (
                    <span className={toneClass(card.quote.dayPct)}>{signed(card.quote.dayPct)} today</span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </span>
          {/* The action, then the one line that set it off (owner rules 2 and 8); everything else is in the run log.
              Under a group's heading the action is only this card's part of it, or nothing, and the line leads. */}
          {action ? (
            <span className="mt-2.5 block text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{action}</span>
          ) : null}
          {card.why[0] && !compact ? (
            <span
              className={`block text-pretty ${action ? "mt-1 text-[13px] leading-[18px] text-oa-muted-fg" : "mt-2.5 text-[14px] leading-5 text-oa-fg"}`}
            >
              {card.why[0]}
            </span>
          ) : null}
          {card.level && card.quote ? (
            <LevelBar now={card.quote.price} level={card.level} withPrice={card.kind === "level_reached"} />
          ) : card.usualPct && card.quote ? (
            <MoveRange now={card.quote.price} pct={card.usualPct} />
          ) : null}
        </button>
        <div className={`mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 pb-3 pt-3 ${compact ? "[@container(min-width:36rem)]:mt-0 [@container(min-width:36rem)]:shrink-0" : ""}`}>
          {state.gone ? null : done ? (
            <p role="status" className="min-w-0 flex-1 text-pretty text-[13px] leading-5 text-oa-fg">
              {done.message}
              {done.href && done.code !== "opened" ? (
                <>
                  {" "}
                  <Link
                    href={done.href}
                    prefetch={false}
                    className={`rounded font-medium text-oa-primary hover:underline ${FOCUS}`}
                  >
                    {done.href.startsWith("/agents") ? "Open agents" : "Open alerts"}
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <>
              <OaButton
                size="sm"
                // Under a heading the card no longer prints the whole action: the hover and the screen reader say it.
                title={card.does ?? (action === card.title ? undefined : card.title)}
                aria-label={`Accept: ${card.title}`}
                loading={state.busy === "accept"}
                disabled={state.busy !== null}
                onClick={() => void decide(card, "accept")}
              >
                Accept
              </OaButton>
              <OaButton
                size="sm"
                variant="secondary"
                aria-label={`Dismiss: ${card.title}`}
                loading={state.busy === "dismiss"}
                disabled={state.busy !== null}
                onClick={() => void decide(card, "dismiss")}
              >
                Dismiss
              </OaButton>
            </>
          )}
        </div>
        </div>
        {state.error ? (
          <p role="alert" className="-mt-1 px-3.5 pb-3 text-pretty text-[13px] leading-5 text-signal-bearish">
            {state.error}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <section id="agent-proposals" aria-labelledby={headingId} className="min-w-0 scroll-mt-20">
      <h2 id={headingId} className="flex items-baseline gap-2 px-1 pb-2 text-[15px] font-semibold leading-6 text-oa-fg">
        Needs you
        {waiting > 0 ? (
          <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg">{waiting}</span>
        ) : null}
      </h2>
      <div className="[container-type:inline-size]">
        {status && !compact ? (
          <div className={`mb-3 ${tiled ? "[@container(min-width:34rem)]:hidden" : ""}`}>
            <AgentStatus watch={status} variant="strip" />
          </div>
        ) : null}
        {/* Folded on a phone (one card across), the first row is one card. */}
        <div className={`flex flex-col gap-4 ${folded ? "[@container(max-width:33.99rem)]:[&_ul>li.oa-surface~li.oa-surface]:hidden" : ""}`}>
          {plan.map((block, blockIndex) => {
            const items = itemsOf(block);
            const open = blockIndex === openBlock;
            return (
              <div key={block.key} className="min-w-0">
                {block.heading !== null ? (
                  <h3 className="px-1 pb-2 text-[14px] font-medium leading-5 text-oa-fg">{block.heading}</h3>
                ) : null}
                <ul className="grid grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2">
                  {items.map(({ card, grouped }, index) => (
                    <React.Fragment key={card.id}>
                      {cardItem(card, grouped)}
                      {open && index === openPos ? panel("narrow") : null}
                      {open && index === rowEnd ? panel("wide") : null}
                    </React.Fragment>
                  ))}
                  {block.tile && status ? (
                    <li className="hidden [@container(min-width:34rem)]:flex">
                      <AgentStatus watch={status} variant="tile" />
                    </li>
                  ) : null}
                  {open && rowEnd === items.length ? panel("wide") : null}
                </ul>
              </div>
            );
          })}
        </div>
        {folded ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setUnfolded(true)}
            className={`mt-2 flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
          >
            <span className="hidden [@container(max-width:33.99rem)]:inline">Show {cards.length - Math.min(1, shownCards.length)} more</span>
            <span className="[@container(max-width:33.99rem)]:hidden">Show {cards.length - shownCards.length} more</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
