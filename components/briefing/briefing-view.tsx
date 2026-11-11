"use client";

import * as React from "react";

import {
  briefingSections,
  statusOf,
  type Briefing,
  type BriefingItem,
  type BriefingItemStatus,
  type BriefingMarketMover,
  type BriefingStateMap,
} from "@/lib/briefing";

import { TheRead } from "@/components/oa/insight";
import { MoveBar } from "@/components/oa/kit/tone";
import {
  COMPACT_VISIBLE_LINES,
  GROUP_VISIBLE_LINES,
  groupBriefingSections,
  groupCountLabel,
  type BriefingGroup,
} from "@/lib/briefing-groups";
import { briefingRead } from "@/lib/briefing-read";

import { BriefingGroupCard, type GroupActions } from "./briefing-group";
import { longDay, pricesLine, shortDay, signedPct, sourceTime } from "./format";
import { SignInButton } from "./sign-in-button";

export type BriefingViewerKind = "signed_out" | "empty" | "pending" | "member";

export type BriefingViewProps = {
  briefing: Briefing;
  initialState: BriefingStateMap;
  viewer: BriefingViewerKind;
  /** Names the person tracks whose research is still being built. */
  pendingTracked?: number;
  days: Array<{ day: string }>;
  archived: boolean;
  degraded: string[];
  /** "Market is open", worked out on the server from the exchange clock. */
  marketState: string;
  /** Earnings reports for the person's stocks, rendered on the server (components/earnings-day). */
  earnings?: React.ReactNode;
};

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";
/** On a day when everything moves the list gets long; the rest is one tap away, never dropped. */
const WORTH_KNOWING_FIRST = 8;

function Section({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-label`} className={`${CARD} pb-1`}>
      <header className="flex min-h-10 items-center px-4 pb-0.5 pt-2.5">
        <h2 id={`${id}-label`} className="oa-label flex min-w-0 flex-wrap items-baseline gap-x-2">
          {label}
          {count ? <span className="oa-mono whitespace-nowrap text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg">{count}</span> : null}
        </h2>
      </header>
      {children}
    </section>
  );
}

/** A market mover whose only news is the move itself: no confirmed reason, nothing else to say. */
function isUnexplainedMove(group: BriefingGroup): boolean {
  return (
    Boolean(group.ticker) &&
    group.items.length > 0 &&
    group.items.every((item) => item.kind === "price_move" && item.reason_status !== "confirmed")
  );
}

/** The other Today pages, each said by what it is for, so the briefing is the start and the rest are one tap on. */
const TODAY_PAGES: Array<{ href: string; title: string; line: string }> = [
  { href: "/explore", title: "Market today", line: "Every sector, index and market, and how the day went for each." },
  { href: "/movers", title: "Why stocks moved", line: "Every big move today, each with the reason we confirmed." },
  { href: "/signals", title: "Signals", line: "What Reddit and the President are saying about stocks." },
  { href: "/calendar", title: "Calendar", line: "Earnings reports and economic news coming this week." },
];

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-2.5 pt-1 text-[14px] leading-6 text-oa-muted-fg">{children}</p>;
}

/**
 * The day's largest moves. A reason is printed only where one is confirmed;
 * the rest are a ticker and a number, and the panel says once that no reason
 * was found for them.
 */
function MoverRows({ title, rows, asOf, max }: { title: string; rows: BriefingMarketMover[]; asOf?: string | null; max: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="pb-1">
      <p className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
        <span className="oa-caption">{title}</span>
        {asOf ? <span className="text-[12px] text-oa-muted-fg">{asOf}</span> : null}
      </p>
      <ul>
        {rows.map((row) => {
          const confirmed = row.reason_status === "confirmed";
          return (
            <li key={row.ticker}>
              <a
                href={`/stock/${row.ticker}`}
                className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-4 py-1.5 text-[14px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent lg:min-h-8"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="oa-mono font-semibold text-oa-fg">{row.ticker}</span>

                </span>
                <span className="flex items-center gap-2">
                  <MoveBar value={row.day_change_pct} max={max} width={40} />
                  <span className={`oa-mono w-[4.25rem] text-right tabular-nums ${row.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                    {signedPct(row.day_change_pct)}
                  </span>
                </span>
                {/* The reasons are in the main column; here a short marker says whether one exists. */}
                {confirmed ? null : <span className="col-span-2 text-[12.5px] leading-[18px] text-oa-muted-fg">No confirmed reason yet</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BriefingView({
  briefing,
  initialState,
  viewer,
  pendingTracked = 0,
  days,
  archived,
  degraded,
  marketState,
  earnings = null,
}: BriefingViewProps) {
  const [state, setState] = React.useState<BriefingStateMap>(initialState);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showSettled, setShowSettled] = React.useState(false);
  const [showQuiet, setShowQuiet] = React.useState(false);
  const [showAllWorth, setShowAllWorth] = React.useState(false);

  const personal = briefing.mode === "personal";
  const canSave = viewer === "member" && !archived;
  const sections = briefingSections(briefing, state);
  const settledCount = sections.kept.length + sections.dismissed.length;

  const grouped = groupBriefingSections(sections, briefing.mode);
  const read = briefingRead(briefing, grouped);

  /**
   * Sets one or more items (a line, or a whole stock) and saves them one at a
   * time, so the per-day state document is never written twice at once. On a
   * failure, whatever was not saved goes back the way it was; what did save stays.
   */
  const setStatuses = React.useCallback(
    async (items: BriefingItem[], status: BriefingItemStatus, busyKey: string) => {
      const targets = items.filter((item) => statusOf(state, item.id) !== status);
      if (targets.length === 0) return;
      const previous = state;
      const at = new Date().toISOString();
      setError(null);
      setState((current) => {
        const next = { ...current };
        for (const item of targets) next[item.id] = { status, at };
        return next;
      });
      if (!canSave) return;
      setBusy(busyKey);
      const saved = new Set<string>();
      try {
        for (const item of targets) {
          const response = await fetch("/api/briefing/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day: briefing.date, item_id: item.id, status }),
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(payload?.error || "Could not save that.");
          }
          saved.add(item.id);
        }
      } catch (cause) {
        setState((current) => {
          const next = { ...current };
          for (const item of targets) {
            if (saved.has(item.id)) continue;
            if (previous[item.id]) next[item.id] = previous[item.id];
            else delete next[item.id];
          }
          return next;
        });
        setError(cause instanceof Error ? cause.message : "Could not save that.");
      } finally {
        setBusy(null);
      }
    },
    [briefing.date, canSave, state],
  );

  const actions: GroupActions = {
    statusOf: (id) => statusOf(state, id),
    onStatus: (items, status, busyKey) => void setStatuses(items, status, busyKey),
    busy,
    readOnly: archived,
    day: briefing.date,
  };
  const groupCards = (groups: BriefingGroup[], limit: number) =>
    groups.map((group) => <BriefingGroupCard key={group.key} group={group} actions={actions} limit={limit} />);

  const index = briefing.market.indices;
  const movers = [...briefing.market.gainers, ...briefing.market.losers];
  const moverMax = Math.max(0, ...movers.map((row) => Math.abs(row.day_change_pct)));
  const prices = pricesLine(briefing.stale_note);
  // The market view's read already tells the biggest explained moves; the ones it left out lead the list below.
  const inRead = new Set([...(read?.headlineTickers ?? []), ...(read?.insights ?? []).flatMap((insight) => insight.tickers ?? [])]);
  const worthListed = personal
    ? grouped.worth_knowing
    : [...grouped.needs_you.filter((group) => !inRead.has(group.key)), ...grouped.worth_knowing];
  // In the market view a move with no confirmed reason has nothing to say but its number, so those
  // share one line at the top of the list instead of a row each repeating "no reason yet".
  const unexplained = personal ? [] : worthListed.filter(isUnexplainedMove);
  // The market list reads biggest move first; rows with no move today (an earnings report) follow.
  const worthAll = personal
    ? worthListed
    : worthListed
        .filter((group) => !isUnexplainedMove(group))
        .map((group, index) => ({ group, index }))
        .sort((a, b) => {
          const am = a.group.day_change_pct == null ? -1 : Math.abs(a.group.day_change_pct);
          const bm = b.group.day_change_pct == null ? -1 : Math.abs(b.group.day_change_pct);
          return bm - am || a.index - b.index;
        })
        .map(({ group }) => group);
  const worth = showAllWorth ? worthAll : worthAll.slice(0, WORTH_KNOWING_FIRST);
  // One scale for every bar in the list, so a 16% move looks twice a 8% one.
  const worthMax = Math.max(0, ...worthListed.map((group) => Math.abs(group.day_change_pct ?? 0)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-x-5">
      {/* Head: whose briefing, the day, earlier days. One plain status line only when something is off. */}
      <header className="min-w-0 px-2 sm:px-0 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold leading-6 text-oa-fg">
            {personal ? "Your briefing" : "Market briefing"}
            <span className="text-[13px] font-normal text-oa-muted-fg">
              {longDay(briefing.date)} · {archived ? "as it read that day" : marketState}
            </span>
          </h1>
          {days.length > 1 ? (
            <nav aria-label="Earlier briefings" className="-mx-1 flex max-w-full gap-1 overflow-x-auto">
              {days.map((entry, position) => {
                const active = entry.day === briefing.date;
                return (
                  <a
                    key={entry.day}
                    href={position === 0 ? "/briefing" : `/briefing?day=${entry.day}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-10 shrink-0 items-center rounded-md px-2.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:h-7 ${
                      active ? "bg-oa-card font-medium text-oa-fg shadow-[inset_0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                    }`}
                  >
                    {position === 0 ? "Today" : shortDay(entry.day)}
                  </a>
                );
              })}
            </nav>
          ) : null}
        </div>
        {!personal || prices || degraded.length > 0 ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-pretty text-[13px] leading-5 text-oa-muted-fg">
            {!personal ? (
              viewer === "signed_out" ? (
                <>
                  <span>This is the whole market.</span>
                  <SignInButton
                    label="Sign in"
                    variant="ghost"
                    size="xs"
                    className="!h-10 -my-2.5 !px-0 !text-[length:inherit] !text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 sm:my-0 sm:!h-5"
                  />
                  <span>to see one about your own stocks.</span>
                </>
              ) : viewer === "pending" ? (
                <span>
                  Market view. Yours appears once your {pendingTracked} {pendingTracked === 1 ? "stock is" : "stocks are"} ready.
                </span>
              ) : (
                <>
                  <span>Market view.</span>
                  <a href="/watchlist" className="-my-2.5 inline-flex h-10 items-center text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 sm:my-0 sm:h-5">
                    Add a stock you hold or watch
                  </a>
                  <span>to make it yours.</span>
                </>
              )
            ) : null}
            {prices ? <span>{prices}</span> : null}
            {degraded.length > 0 ? (
              <span className="inline-flex items-center gap-x-1">
                Some updates couldn&apos;t load.
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="-my-2.5 inline-flex h-10 cursor-pointer items-center font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg sm:my-0 sm:h-5"
                >
                  Try again
                </button>
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-col gap-4">
        <TheRead read={read} label={personal ? "Today for you" : "Today in the market"} />
        {earnings}

        {error ? (
          <p role="alert" className="rounded-lg border border-[color:color-mix(in_srgb,var(--signal-bearish)_40%,transparent)] bg-oa-card px-3.5 py-2 text-[13px] text-signal-bearish">
            {error}
          </p>
        ) : null}

        {personal ? (
          <Section id="needs-you" label="Needs you" count={grouped.needs_you.length > 0 ? groupCountLabel(grouped.needs_you) : undefined}>
            {grouped.needs_you.length > 0 ? (
              groupCards(grouped.needs_you, GROUP_VISIBLE_LINES)
            ) : (
              <EmptyLine>No decisions today. The rest is below.</EmptyLine>
            )}
          </Section>
        ) : null}

        {worthListed.length > 0 ? (
          <Section id="worth-knowing" label={personal ? "Worth knowing" : "Also moving"} count={groupCountLabel(worthListed)}>
            {unexplained.length > 0 ? (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-oa-border px-4 pb-2.5 pt-1 text-[13px] leading-5 text-oa-muted-fg">
                <span>Big moves we can&apos;t explain yet:</span>
                {unexplained.map((group) => (
                  <a
                    key={group.key}
                    href={`/stock/${encodeURIComponent(group.ticker as string)}`}
                    className="inline-flex min-h-10 items-baseline gap-1.5 rounded hover:underline sm:min-h-0"
                  >
                    <span className="oa-mono font-semibold text-oa-fg">{group.ticker}</span>
                    {group.day_change_pct != null ? (
                      <span className={`oa-mono tabular-nums ${group.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(group.day_change_pct)}</span>
                    ) : null}
                  </a>
                ))}
              </p>
            ) : null}
            {worth.map((group, index) => (
              <React.Fragment key={group.key}>
                {/* Rows with no move of their own (an earnings report) are not moves: they get their own small heading. */}
                {!personal && group.day_change_pct == null && (index === 0 || worth[index - 1]!.day_change_pct != null) ? (
                  <p className="oa-caption border-b border-oa-border bg-oa-bg px-4 py-1.5">Earnings reports</p>
                ) : null}
                <BriefingGroupCard group={group} actions={actions} limit={COMPACT_VISIBLE_LINES} moveMax={personal ? undefined : worthMax || undefined} />
              </React.Fragment>
            ))}
            {worthAll.length > WORTH_KNOWING_FIRST ? (
              <button
                type="button"
                aria-expanded={showAllWorth}
                onClick={() => setShowAllWorth((value) => !value)}
                className="w-full cursor-pointer px-4 pb-3 pt-1.5 text-left text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:bg-oa-accent"
              >
                {showAllWorth ? "Show fewer" : `Show all ${worthAll.length}`}
              </button>
            ) : null}
          </Section>
        ) : null}

        <Section id="coming-up" label="Coming up" count={grouped.coming_up.length > 0 ? "next 7 days" : undefined}>
          {grouped.coming_up.length > 0 ? (
            groupCards(grouped.coming_up, COMPACT_VISIBLE_LINES)
          ) : (
            <EmptyLine>
              {personal
                ? "None of your stocks reports earnings in the next 7 days."
                : "None of the most followed stocks reports earnings in the next 7 days."}
            </EmptyLine>
          )}
        </Section>

        {personal ? (
          <section aria-labelledby="quiet-label" className={CARD}>
            <button
              type="button"
              aria-expanded={showQuiet}
              onClick={() => setShowQuiet((value) => !value)}
              className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
            >
              <span id="quiet-label" className="oa-label flex items-center gap-2">
                Quiet
                <span className="oa-mono text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg">{briefing.quiet.names.length}</span>
              </span>
              <span className="text-right text-[12.5px] leading-4 text-oa-muted-fg">{showQuiet ? "Hide" : "Show"}</span>
            </button>
            {showQuiet ? (
              <div className="px-4 pb-3">
                {briefing.quiet.names.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                    {briefing.quiet.names.map((name) => (
                      <li key={name.ticker}>
                        <a href={`/stock/${name.ticker}`} className="flex items-baseline justify-between gap-2 rounded px-1 py-1 text-[13px] leading-5 hover:bg-oa-accent">
                          <span className="oa-mono font-semibold text-oa-fg">{name.ticker}</span>
                          {name.day_change_pct != null ? (
                            <span className={`oa-mono tabular-nums ${name.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                              {signedPct(name.day_change_pct)}
                            </span>
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] leading-6 text-oa-muted-fg">Every stock you track is listed above today.</p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {settledCount > 0 ? (
          <section aria-labelledby="settled-label" className={CARD}>
            <button
              type="button"
              aria-expanded={showSettled}
              onClick={() => setShowSettled((value) => !value)}
              className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
            >
              <span id="settled-label" className="oa-label flex items-center gap-2">
                Handled today
                <span className="oa-mono text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg">{settledCount}</span>
              </span>
              <span className="text-right text-[12.5px] leading-4 text-oa-muted-fg">{showSettled ? "Hide" : "Show"}</span>
            </button>
            {showSettled ? <div className="pb-1">{groupCards(grouped.settled, GROUP_VISIBLE_LINES)}</div> : null}
            {!canSave && !archived ? (
              <p className="px-4 pb-2.5 text-[12.5px] leading-5 text-oa-muted-fg">Kept for this visit only. Sign in to keep it.</p>
            ) : null}
          </section>
        ) : null}

        <p className="px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-1">Prices are delayed. Nothing here is advice to trade.</p>
      </div>

      {/* Side rail: the market as context, not the lead. */}
      <aside className="flex min-w-0 flex-col gap-4">
        <section aria-label="Market today" className={CARD}>
          <header className="flex min-h-10 items-center justify-between gap-3 px-4 py-2">
            <h2 className="oa-label">Market today</h2>
          </header>
          {index.length > 0 ? (
            <ul className="pb-1">
              {index.map((entry) => (
                <li key={entry.name} className="flex h-8 items-center justify-between gap-3 px-4 text-[14px]">
                  <span className="text-oa-fg">{entry.name}</span>
                  <span className="oa-mono flex items-baseline gap-2 tabular-nums">
                    <span className="text-oa-muted-fg">{entry.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                    <span className={entry.change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}>{signedPct(entry.change_pct)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {/* The index is a live quote; the movers come from the last full run, so their time sits with them.
              The market view already leads with these same moves, so there it shows only the index. */}
          {briefing.mode !== "market" ? (
            <>
              <MoverRows title="Biggest gains" rows={briefing.market.gainers} max={moverMax} asOf={sourceTime(briefing.market.as_of)} />
              <MoverRows title="Biggest drops" rows={briefing.market.losers} max={moverMax} asOf={briefing.market.gainers.length > 0 ? null : sourceTime(briefing.market.as_of)} />
            </>
          ) : null}
          {index.length === 0 && movers.length === 0 ? (
            <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">Market data is not available right now.</p>
          ) : null}
          <div className="flex min-h-10 items-center justify-end px-4 py-1">
            <a href="/movers" className="-my-2 inline-flex min-h-10 items-center text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
              See all stock moves
            </a>
          </div>
        </section>

        {!personal ? (
          <section aria-labelledby="today-pages-label" className={CARD}>
            <header className="flex min-h-10 items-center px-4 pb-0.5 pt-2.5">
              <h2 id="today-pages-label" className="oa-label">
                More about today
              </h2>
            </header>
            <ul className="pb-1">
              {TODAY_PAGES.map((page) => (
                <li key={page.href}>
                  <a href={page.href} className="group block px-4 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className="block text-[14px] font-medium leading-5 text-oa-fg group-hover:underline">{page.title} →</span>
                    <span className="block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{page.line}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="px-2 text-[12.5px] leading-5 text-oa-muted-fg sm:px-1">
          Want a heads-up when a stock hits a price, files a report or nears earnings?{" "}
          <a href="/agents" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            Set up an agent
          </a>{" "}
          and it will report here every market day.
        </p>
      </aside>
    </div>
  );
}
