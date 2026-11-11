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
import { StockLogo } from "@/components/stock-logo";
import {
  COMPACT_VISIBLE_LINES,
  GROUP_VISIBLE_LINES,
  groupBriefingSections,
  groupCountLabel,
  type BriefingGroup,
} from "@/lib/briefing-groups";
import { briefingRead, earlierSession, type BriefingSession } from "@/lib/briefing-read";
import { anchorGroups, WORTH_KNOWING_FIRST } from "@/lib/briefing-anchors";
import { briefingLead, briefingSteps } from "@/lib/next-steps";

import { BriefingGroupCard, type GroupActions } from "./briefing-group";
import { longDay, pricesLine, shortDay, signedPct, sourceTime } from "./format";
import { SignInButton } from "./sign-in-button";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

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
  /** How every sector did today, for the market view's headline and its strip. Null on other days. */
  session?: BriefingSession | null;
  /**
   * The person's agents with their latest outcomes and an Ask box (./agents-strip.tsx), rendered and streamed on
   * the server; signed out, Ask on the market. Sits under the read. When given, the side rail's agents line goes.
   */
  agents?: React.ReactNode;
  /** The "rest of your stocks moved too" card on Free (./locked-moves.tsx), rendered on the server. */
  locked?: React.ReactNode;
};

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";

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

/**
 * Every sector on one line, best to worst: one bar each, up from the middle
 * when it rose and down when it fell, so "7 of 11 rose" is something you see.
 * Each bar opens its sector page.
 */
function SessionStrip({ sectors }: { sectors: BriefingSession["sectors"] }) {
  const rows = [...sectors].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (rows.length < 4) return null;
  const max = Math.max(0.5, ...rows.map((row) => Math.abs(row.day)));
  const best = rows[0]!;
  const worst = rows[rows.length - 1]!;
  return (
    <figure className="mt-3 border-t border-oa-border pt-3">
      <ul aria-label="How each sector did today, best to worst" className="flex h-16 items-stretch gap-1">
        {rows.map((row) => {
          const height = Math.max(4, (Math.abs(row.day) / max) * 50);
          const up = row.day >= 0;
          return (
            <li key={row.name} className="relative flex-1">
            <Link prefetch={false}
              href={row.slug ? `/sectors/${row.slug}` : "/sectors"}
              title={`${row.name} ${signedPct(row.day)}`}
              aria-label={`${row.name} ${signedPct(row.day)}`}
              className="absolute inset-0 rounded-sm outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
            >
              <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-oa-border" />
              <span
                aria-hidden="true"
                className={`absolute inset-x-[18%] rounded-[2px] ${up ? "bg-signal-bullish" : "bg-signal-bearish"}`}
                style={up ? { bottom: "50%", height: `${height}%` } : { top: "50%", height: `${height}%` }}
              />
            </Link>
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[13px] leading-5 text-oa-muted-fg">
        <span>
          Best: <span className="text-oa-fg">{best.name}</span> <span className="oa-mono tabular-nums">{signedPct(best.day)}</span>
        </span>
        <Link prefetch={false} href="/explore" className="order-last w-full font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg sm:order-none sm:w-auto">
          Each bar is a sector: see all {rows.length}
        </Link>
        <span>
          Worst: <span className="text-oa-fg">{worst.name}</span> <span className="oa-mono tabular-nums">{signedPct(worst.day)}</span>
        </span>
      </figcaption>
    </figure>
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

/** The day's largest moves: a ticker and a number each. The reasons are in the main column. */
function MoverRows({ title, rows, asOf }: { title: string; rows: BriefingMarketMover[]; asOf?: string | null }) {
  if (rows.length === 0) return null;
  return (
    <div className="pb-1">
      <p className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
        <span className="oa-caption">{title}</span>
        {asOf ? <span className="text-[12px] text-oa-muted-fg">{asOf}</span> : null}
      </p>
      <ul>
        {rows.map((row) => {
          return (
            <li key={row.ticker}>
              <Link prefetch={false}
                href={`/stock/${row.ticker}`}
                className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-1.5 text-[14px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent lg:min-h-8"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="oa-mono inline-flex items-center gap-1.5 font-semibold text-oa-fg">
                    <StockLogo ticker={row.ticker} size={18} />
                    {row.ticker}
                  </span>

                </span>
                {/* Ticker and move only: no size bar, and nothing written when there is no reason (owner, Nov 11). */}
                <span className={`oa-mono w-[4.25rem] text-right tabular-nums ${row.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                  {signedPct(row.day_change_pct)}
                </span>
              </Link>
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
  session = null,
  agents = null,
  locked = null,
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
  // The read, with its next steps beside the findings (lib/next-steps.ts).
  const read = briefingSteps(briefingRead(briefing, grouped, personal ? null : session), {
    mode: personal ? "personal" : "market",
    lead: personal ? null : briefingLead(grouped.needs_you),
  });

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

  const index = briefing.market.indices;
  const movers = [...briefing.market.gainers, ...briefing.market.losers];
  const prices = pricesLine(briefing.stale_note);
  // The market view's read already tells the biggest explained moves; the ones it left out lead the list below.
  const inRead = new Set([...(read?.headlineTickers ?? []), ...(read?.insights ?? []).flatMap((insight) => insight.tickers ?? [])]);
  const worthListed = personal
    ? grouped.worth_knowing
    : [...grouped.needs_you.filter((group) => !inRead.has(group.key)), ...grouped.worth_knowing];
  // In the market view a move with no confirmed reason has nothing to say but its number, so those
  // share one line at the end of the list instead of a row each.
  const unexplained = personal ? [] : worthListed.filter(isUnexplainedMove);
  // Report-only rows (no move of their own, they only said "Reported earnings today") become one line of names.
  const reportedOnly = personal ? [] : worthListed.filter((group) => !isUnexplainedMove(group) && group.day_change_pct == null && group.ticker);
  // The market list reads biggest move first.
  const worthAll = personal
    ? worthListed
    : worthListed
        .filter((group) => !isUnexplainedMove(group))
        .filter((group) => group.day_change_pct != null)
        .map((group, index) => ({ group, index }))
        .sort((a, b) => Math.abs(b.group.day_change_pct ?? 0) - Math.abs(a.group.day_change_pct ?? 0) || a.index - b.index)
        .map(({ group }) => group);
  // The sector strip belongs to the session headline: today's live sectors under the index line they explain.
  const showSession = !personal && Boolean(session) && Boolean(read) && !read?.headlineTickers && briefing.market.indices.length > 0 && !earlierSession(briefing.market.as_of, briefing.date);
  const worth = showAllWorth ? worthAll : worthAll.slice(0, WORTH_KNOWING_FIRST);
  // Only a personal briefing's cards are linked from the agents strip (lib/briefing-anchors.ts); settled ones never.
  const anchors: ReadonlySet<BriefingGroup> = personal ? anchorGroups([...grouped.needs_you, ...worth, ...grouped.coming_up]) : new Set();
  const groupCards = (groups: BriefingGroup[], limit: number) =>
    groups.map((group) => <BriefingGroupCard key={group.key} group={group} actions={actions} limit={limit} anchor={anchors.has(group)} />);

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
                  <Link prefetch={false}
                    key={entry.day}
                    href={position === 0 ? "/briefing" : `/briefing?day=${entry.day}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-10 shrink-0 items-center rounded-md px-2.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:h-7 ${
                      active ? "bg-oa-card font-medium text-oa-fg shadow-[inset_0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                    }`}
                  >
                    {position === 0 ? "Today" : shortDay(entry.day)}
                  </Link>
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
                  <Link prefetch={false} href="/watchlist" className="-my-2.5 inline-flex h-10 items-center text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 sm:my-0 sm:h-5">
                    Add a stock you hold or watch
                  </Link>
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
        <TheRead
          read={read}
          label={personal ? "Today for you" : "Today in the market"}
          visual={showSession && session ? <SessionStrip sectors={session.sectors} /> : null}
        />
        {agents}
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

        {worthAll.length > 0 || unexplained.length > 0 || reportedOnly.length > 0 ? (
          <Section
            id="worth-knowing"
            label={personal ? "Worth knowing" : worthAll.length > 0 ? "Other big moves, with the reason" : "Other big moves"}
            count={personal ? groupCountLabel(worthListed) : worthAll.length > 0 ? `${worthAll.length} ${worthAll.length === 1 ? "stock" : "stocks"}` : undefined}
          >
            {worth.map((group) => (
              <BriefingGroupCard key={group.key} group={group} actions={actions} limit={COMPACT_VISIBLE_LINES} anchor={anchors.has(group)} />
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
            {/* Moves with no confirmed reason come last as one line of tickers and moves, with nothing said about the missing reason (owner, Nov 11). */}
            {unexplained.length > 0 ? (
              <p className={`text-pretty px-4 pb-2.5 pt-2 text-[13.5px] leading-6 text-oa-muted-fg ${worth.length > 0 ? "border-t border-oa-border" : ""}`}>
                Also moved:{" "}
                {unexplained.map((group, index) => (
                  <React.Fragment key={group.key}>
                    {index > 0 ? (index === unexplained.length - 1 ? " and " : ", ") : null}
                    <Link prefetch={false} href={`/stock/${encodeURIComponent(group.ticker as string)}`} className="whitespace-nowrap text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                      <span className="oa-mono font-semibold">{group.ticker}</span>{" "}
                      {group.day_change_pct != null ? (
                        <span className={`oa-mono tabular-nums ${group.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(group.day_change_pct)}</span>
                      ) : null}
                    </Link>
                  </React.Fragment>
                ))}
                .
              </p>
            ) : null}
            {reportedOnly.length > 0 ? (
              <p className={`text-pretty px-4 pb-2.5 pt-2 text-[13.5px] leading-6 text-oa-muted-fg ${worth.length > 0 || unexplained.length > 0 ? "border-t border-oa-border" : ""}`}>
                Also reported earnings:{" "}
                {reportedOnly.map((group, index) => (
                  <React.Fragment key={group.key}>
                    {index > 0 ? (index === reportedOnly.length - 1 ? " and " : ", ") : null}
                    <Link prefetch={false} href={`/stock/${encodeURIComponent(group.ticker as string)}`} className="oa-mono font-semibold text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                      {group.ticker}
                    </Link>
                  </React.Fragment>
                ))}
                .
              </p>
            ) : null}
          </Section>
        ) : null}

        {personal && locked ? locked : null}

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
                        <Link prefetch={false} href={`/stock/${name.ticker}`} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-[13px] leading-5 hover:bg-oa-accent">
                          <span className="oa-mono inline-flex items-center gap-1.5 font-semibold text-oa-fg">
                            <StockLogo ticker={name.ticker} size={16} />
                            {name.ticker}
                          </span>
                          {name.day_change_pct != null ? (
                            <span className={`oa-mono tabular-nums ${name.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>
                              {signedPct(name.day_change_pct)}
                            </span>
                          ) : null}
                        </Link>
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
            {showSettled ? (
              <div className="pb-1">
                {grouped.settled.map((group) => (
                  <BriefingGroupCard key={group.key} group={group} actions={actions} limit={GROUP_VISIBLE_LINES} />
                ))}
              </div>
            ) : null}
            {!canSave && !archived ? (
              <p className="px-4 pb-2.5 text-[12.5px] leading-5 text-oa-muted-fg">Kept for this visit only. Sign in to keep it.</p>
            ) : null}
          </section>
        ) : null}

        <p className="px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-1">Prices are delayed. Nothing here is advice to trade.</p>
      </div>

      {/* Side rail: the market as context, not the lead. */}
      <aside className="flex min-w-0 flex-col gap-4">
        {/* The market view's read already says how the index did, so this card is for your own briefing. */}
        {personal ? (
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
              <MoverRows title="Biggest gains" rows={briefing.market.gainers} asOf={sourceTime(briefing.market.as_of)} />
              <MoverRows title="Biggest drops" rows={briefing.market.losers} asOf={briefing.market.gainers.length > 0 ? null : sourceTime(briefing.market.as_of)} />
            </>
          ) : null}
          {index.length === 0 && movers.length === 0 ? (
            <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">Market data is not available right now.</p>
          ) : null}
          <div className="flex min-h-10 items-center justify-end px-4 py-1">
            <Link prefetch={false} href="/movers" className="-my-2 inline-flex min-h-10 items-center text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
              See all stock moves
            </Link>
          </div>
        </section>
        ) : null}

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
                  <AppLink href={page.href} className="group block px-4 py-2 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className="block text-[14px] font-medium leading-5 text-oa-fg group-hover:underline">{page.title} →</span>
                    <span className="block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{page.line}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {agents ? null : (
          <p className="px-2 text-[12.5px] leading-5 text-oa-muted-fg sm:px-1">
            Want a heads-up when a stock hits a price, files a report or nears earnings?{" "}
            <Link prefetch={false} href="/agents" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
              Set up an agent
            </Link>{" "}
            and it will report here every market day.
          </p>
        )}
      </aside>
    </div>
  );
}
