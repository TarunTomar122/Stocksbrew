"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CARD_HOVER } from "@/components/briefing/stock-card";
import { OaButton } from "@/components/oa/button";
import { NavIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { capitalize, dayWords, etDayOf, etToday } from "@/lib/day-words";
import type { ProposalCard, ProposalResult, WatchSummary } from "@/lib/proposals";
import { PROPOSALS_CHANGED_EVENT, type ProposalsChangedDetail } from "@/lib/proposals-event";


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

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

type CardState = { busy: "accept" | "dismiss" | null; result: ProposalResult | null; error: string | null; open: boolean; gone?: boolean };

function RunLog({ card, today }: { card: ProposalCard; today: string }) {
  return (
    <div className="mt-3 grid min-w-0 gap-3 border-t border-oa-border pt-3 text-[13px] leading-5 sm:grid-cols-2 sm:gap-x-6">
      {/* The second line of the reasoning, when there is one (the first is on the card). */}
      {card.why[1] ? <p className="min-w-0 text-pretty text-oa-fg sm:col-span-2">{card.why[1]}</p> : null}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-oa-muted-fg">What I read</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {card.read.map((source, index) => {
            const day = when(source.at, today);
            const label = source.href ? (
              source.href.startsWith("http") ? (
                <a href={source.href} target="_blank" rel="noreferrer" className={`rounded text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary ${FOCUS}`}>
                  {source.label}
                </a>
              ) : (
                <Link href={source.href} prefetch={false} className={`rounded text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary ${FOCUS}`}>
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

/** What the agent watches for the person, as one tile: the stocks as the figure, the alerts and agents as one line. */
function WatchTile({ watch, waiting }: { watch: WatchSummary; waiting: number }) {
  const rows: Array<[string, number]> = [
    ["Stocks", watch.stocks],
    ["Price alerts set", watch.alerts],
    ["Agents running", watch.agents],
    ["Waiting for you", waiting],
  ];
  return (
    <li className="hidden [@container(min-width:34rem)]:flex">
      <Link
        href="/agents"
        prefetch={false}
        className={`oa-surface flex w-full min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3 ${CARD_HOVER} ${FOCUS}`}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary">
            <NavIcon name="agents" className="size-[16px]" />
          </span>
          <span className="text-[14px] font-semibold text-oa-fg">What I watch for you</span>
        </span>
        {/* Top-aligned rows, one figure each, so the tile reads as a list rather than a padded number. */}
        <span className="mt-2.5 flex flex-col divide-y divide-oa-border">
          {rows.map(([label, value]) => (
            <span key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-[13.5px] leading-5">
              <span className="text-oa-muted-fg">{label}</span>
              <span className="oa-mono font-semibold tabular-nums text-oa-fg">{value}</span>
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}

function Mark({ ticker }: { ticker: string | null }) {
  if (ticker) return <StockLogo ticker={ticker} size={28} eager />;
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md border border-oa-border bg-oa-bg text-oa-muted-fg">
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
export function ProposalCards({ initial, watch = null, today: todayProp }: { initial: ProposalCard[]; watch?: WatchSummary | null; today?: string }) {
  const router = useRouter();

  const [cards, setCards] = React.useState(initial);
  const [states, setStates] = React.useState<Record<string, CardState>>({});
  const today = todayProp ?? etToday();
  const headingId = React.useId();

  const stateOf = (id: string): CardState => states[id] ?? { busy: null, result: null, error: null, open: false };
  const patch = (id: string, next: Partial<CardState>) => setStates((all) => ({ ...all, [id]: { ...(all[id] ?? { busy: null, result: null, error: null, open: false }), ...next } }));

  const waiting = cards.filter((card) => !stateOf(card.id).result?.ok).length;
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent<ProposalsChangedDetail>(PROPOSALS_CHANGED_EVENT, { detail: { waiting } }));
  }, [waiting]);

  const decide = async (card: ProposalCard, decision: "accept" | "dismiss") => {
    patch(card.id, { busy: decision, error: null });
    try {
      const response = await fetch(`/api/proposals/${encodeURIComponent(card.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; status?: string; result?: ProposalResult | null; error?: string } | null;
      if (decision === "dismiss" && (body?.ok || body?.status === "dismissed" || body?.status === "expired")) {
        setCards((all) => all.filter((entry) => entry.id !== card.id));
        return;
      }
      if (body?.status === "expired") {
        // The reason the facts changed, in the server's words; the card leaves a moment later.
        patch(card.id, { busy: null, gone: true, error: body.result?.message || "The facts changed since, so this one is gone." });
        window.setTimeout(() => setCards((all) => all.filter((entry) => entry.id !== card.id)), 2500);
        return;
      }
      const result = body?.result ?? null;
      if (body?.ok && result) {
        patch(card.id, { busy: null, result });
        if (result.code === "opened" && result.href) router.push(result.href);
        return;
      }
      patch(card.id, { busy: null, error: result?.message || body?.error || "That didn't go through. Try again in a minute." });
    } catch {
      patch(card.id, { busy: null, error: "That didn't go through. Check your connection and try again." });
    }
  };

  if (cards.length === 0) return null;

  // Two across: with an odd number of closed cards the last row has one empty slot, which the watch tile fills
  // (owner rule 4). An open card takes its own row. One column (a phone) has no empty slot, so no tile.
  const closed = cards.filter((card) => !stateOf(card.id).open).length;
  const watchTile = watch && watch.stocks > 0 && closed % 2 === 1 ? <WatchTile watch={watch} waiting={waiting} /> : null;

  return (
    <section id="agent-proposals" aria-labelledby={headingId} className="min-w-0 scroll-mt-20">
      <h2 id={headingId} className="flex items-baseline gap-2 px-1 pb-2 text-[15px] font-semibold leading-6 text-oa-fg">
        Waiting for you
        {waiting > 0 ? <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg">{waiting}</span> : null}
      </h2>
      <div className="[container-type:inline-size]">
        {/* Two across at most, so a row is full with an even count; an odd count gets the watch tile beside the last. */}
        <ul className="grid grid-flow-row-dense grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2">
          {cards.map((card) => {
            const state = stateOf(card.id);
            const done = state.result?.ok ? state.result : null;
            const logId = `proposal-log-${card.id}`;
            return (
              <li
                key={card.id}
                className={`oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card ${CARD_HOVER} ${state.open ? "col-span-full" : ""}`}
              >
                {/* The card body is the run log's toggle: no link text repeated on every card (owner rule 1). */}
                <button
                  type="button"
                  aria-expanded={state.open}
                  aria-controls={logId}
                  onClick={() => patch(card.id, { open: !state.open })}
                  className="flex min-w-0 flex-col rounded-[inherit] px-3.5 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Mark ticker={card.ticker} />
                    <span className="block min-w-0 leading-5">
                      <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{card.ticker ?? "Your agents"}</span>
                      {card.quote ? (
                        <span className="oa-mono flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-4 tabular-nums">
                          <span className="text-oa-muted-fg">{price(card.quote.price)}</span>
                          {card.quote.dayPct !== null ? <span className={toneClass(card.quote.dayPct)}>{signed(card.quote.dayPct)} today</span> : null}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-2.5 block text-pretty text-[14.5px] font-medium leading-5 text-oa-fg">{card.title}</span>
                  {/* The one reason, always shown (owner rule 2). */}
                  {card.why[0] ? <span className="mt-1 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{card.why[0]}</span> : null}
                  {/* What accepting does, on the card itself (a phone has no hover); left out when the title says it. */}
                  {card.does ? (
                    <span className="mt-1 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                      <span className="font-medium text-oa-fg">If you accept: </span>
                      {card.does}
                    </span>
                  ) : null}
                </button>
                <div id={logId} hidden={!state.open} className="px-3.5">
                  {state.open ? <RunLog card={card} today={today} /> : null}
                </div>
                <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 pb-3 pt-3">
                  {state.gone ? null : done ? (
                    <p role="status" className="min-w-0 flex-1 text-pretty text-[13px] leading-5 text-oa-fg">
                      {done.message}
                      {done.href && done.code !== "opened" ? (
                        <>
                          {" "}
                          <Link href={done.href} prefetch={false} className={`rounded font-medium text-oa-primary hover:underline ${FOCUS}`}>
                            {done.href.startsWith("/agents") ? "Open agents" : "Open alerts"}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <>
                      <OaButton size="sm" loading={state.busy === "accept"} disabled={state.busy !== null} onClick={() => void decide(card, "accept")}>
                        Accept
                      </OaButton>
                      <OaButton size="sm" variant="secondary" loading={state.busy === "dismiss"} disabled={state.busy !== null} onClick={() => void decide(card, "dismiss")}>
                        Dismiss
                      </OaButton>
                    </>
                  )}
                </div>
                {state.error ? (
                  <p role="alert" className="-mt-1 px-3.5 pb-3 text-pretty text-[13px] leading-5 text-signal-bearish">
                    {state.error}
                  </p>
                ) : null}
              </li>
            );
          })}
          {watchTile}
        </ul>
      </div>
    </section>
  );
}
