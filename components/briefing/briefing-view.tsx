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
  groupBriefingSections,
  type BriefingGroup,
} from "@/lib/briefing-groups";
import { briefingRead, comingUpAfterRead, earlierSession, holdingsFirst, readEarningsTickers, worthAfterRead, type BriefingReportHistory, type BriefingSession } from "@/lib/briefing-read";
import { anchorGroups, WORTH_KNOWING_FIRST } from "@/lib/briefing-anchors";
import type { ExampleBriefingExtras } from "@/lib/briefing-example";
import { briefingLead, briefingSteps } from "@/lib/next-steps";
import { etClock, etDayOfStamp } from "@/lib/quote-time";

import { readAskContext } from "./ask";
import { BriefingGroupCard, type GroupActions } from "./briefing-group";
import { sectionWords } from "./card-words";
import { StockCard, StockCardGrid, StockChip, StockChipRow, stockGridFill } from "./stock-card";
import { quietCardsWords, reportSoonWords } from "@/lib/briefing-move-facts";
import { longDay, pricesLine, shortDay, signedPct, sourceTime } from "./format";
import Link from "next/link";

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
  /** Signed in: the person's agents and their latest outcomes, at the top of the side rail. */
  rail?: React.ReactNode;
  /** Before 9:30 ET: the futures and the biggest gaps (components/premarket/before-open.tsx), streamed. */
  beforeOpen?: React.ReactNode;
  /** The "rest of your stocks moved too" card on Free (./locked-moves.tsx), rendered on the server. */
  locked?: React.ReactNode;
  /** What the agent did today across the market (components/agent-log), streamed into the side rail: secondary (owner rule 10). */
  agentLog?: React.ReactNode;
  /** Signed out: the briefing is the example portfolio's (lib/briefing-example.ts), with its market line and clock. */
  example?: ExampleBriefingExtras | null;
  /** Held stocks that reported overnight, by ticker: the card's fact becomes the result (lib/results). */
  resultFacts?: Readonly<Record<string, string>>;
  /**
   * Price facts by ticker, most telling first (lib/briefing-move-facts.ts): a Worth knowing stock with no other fact
   * of its own still gets a card with one ("Its biggest gain since Sep 9"), not a bare chip (owner rule 3).
   */
  moveFacts?: Readonly<Record<string, readonly string[]>>;
  /** What the person's agents flagged, by ticker, said on the read's card about that stock (lib/briefing-read.ts). */
  flags?: Readonly<Record<string, string>>;
  /** Held stocks' report histories by ticker (lib/briefing-report-history-server.ts): the read's earnings card figure. */
  reportHistory?: Readonly<Record<string, BriefingReportHistory>>;
  /** When the server rendered the page (ms). The read dates old moves against it, so server and browser agree. */
  renderedAt?: number;
};

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";

/** A section of stock cards: its label on the page, then the cards (no panel around them, so no card in a card). */
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
    <section aria-labelledby={`${id}-label`}>
      <header className="flex min-h-8 items-center px-2 pb-2 sm:px-0">
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

/** Short names for the long sectors, as traders say them. */
const SECTOR_SHORT: Record<string, string> = {
  "communication services": "Communication",
  "consumer discretionary": "Discretionary",
  "consumer staples": "Staples",
  "information technology": "Tech",
};

/**
 * Every sector with its move, best to worst, each named and opening its sector page: a plain labelled list, so
 * "6 of 11 sectors fell" is something you read, not a chart to decode (owner rule 6). Reads down the columns.
 */
function SessionStrip({ sectors }: { sectors: BriefingSession["sectors"] }) {
  const rows = [...sectors].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (rows.length < 4) return null;
  return (
    <ul aria-label="How each sector did today, best to worst" className="mt-3 columns-2 gap-x-6 border-t border-oa-border pt-2 sm:columns-3">
      {rows.map((row) => (
        <li key={row.name} className="break-inside-avoid">
          <Link
            prefetch={false}
            href={row.slug ? `/sectors/${row.slug}` : "/sectors"}
            className="-mx-1.5 flex min-h-8 items-center justify-between gap-3 rounded px-1.5 text-[13.5px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
          >
            <span className="min-w-0 text-oa-fg">
              {/* A phone's half-width column has no room for "Consumer discretionary": the trade's short name, whole. */}
              <span className="sm:hidden">{SECTOR_SHORT[row.name.toLowerCase()] ?? row.name}</span>
              <span className="hidden sm:inline">{row.name}</span>
            </span>
            <span className={`oa-mono shrink-0 tabular-nums ${row.day >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(row.day)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Your other stocks today": what the card is (the stocks with no card above, each with its move), not a count of
 * what did not happen (judges, ship 39). An earlier session's prices say their day, never "today".
 */
function quietHead(asOf: string | null | undefined, date: string, archived: boolean): string {
  // A saved briefing from an earlier day read as it was then: "that day", never "today".
  return `Your other stocks${earlierSession(asOf, date) || (archived ? " that day" : " today")}`;
}

/**
 * "Your other stocks today": the stocks with no card above, as small cards like Worth knowing's (owner rule 3): the
 * logo, the move as the big figure and what is its own (judges, ship 44). What you hold first, then what you watch,
 * said once above the cards when there are several, so no tag repeats on each (owner rule 1). When most cards know
 * their stock's normal day, that comparison is said once above them and each card shows only its own multiple
 * ("1.6×"), with a chip only for what is different about it: a report soon, its biggest move in a while, an outlier
 * month (judges, ship 50). An odd last card spans what its row has left (owner rule 4). Each card opens its stock.
 */
function QuietCards({
  head,
  names,
  facts,
  today,
}: {
  head: string;
  names: Briefing["quiet"]["names"];
  facts?: Readonly<Record<string, readonly string[]>>;
  /** The briefing's own day, for a report coming up; null on a saved briefing, whose dates have passed. */
  today: string | null;
}) {
  const held = names.filter((name) => name.relation !== "watching");
  const watched = names.filter((name) => name.relation === "watching");
  const ordered = [...held, ...watched];
  // Worked out in the order shown, so no two cards say the same words (lib/briefing-move-facts.ts quietCardsWords).
  const words = quietCardsWords(
    ordered.map((name) => ({
      ticker: name.ticker,
      pct: name.day_change_pct,
      facts: facts?.[name.ticker.toUpperCase()],
      report: today && name.earnings_date ? reportSoonWords({ date: name.earnings_date, time: name.earnings_time }, today) : null,
    })),
  );
  const watchTickers = watched.map((name) => name.ticker);
  const watchLine =
    held.length > 0 && watchTickers.length > 1
      ? `${watchTickers.slice(0, -1).join(", ")} and ${watchTickers[watchTickers.length - 1]} are stocks you watch rather than hold.`
      : null;
  const intro = [watchLine, words.shared].filter(Boolean).join(" ");
  return (
    <Section id="quiet" label={head}>
      {intro ? <p className="mb-2.5 text-pretty px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">{intro}</p> : null}
      <StockCardGrid dense>
        {ordered.map((name, index) => {
          const move = name.day_change_pct;
          const fact = words.facts.get(name.ticker) ?? null;
          const versus = words.versus.get(name.ticker) ?? null;
          const figure = move != null ? signedPct(move, 1) : null;
          return (
            <StockCard
              key={name.ticker}
              ticker={name.ticker}
              name=""
              eagerLogo
              figure={figure}
              tone={move == null ? "flat" : move >= 0 ? "up" : "down"}
              // With the comparison said once above, the card's own fact is a line under its ticker, so every card in
              // the grid is the same short height (owner rule 4); otherwise it is the usual chip.
              note={words.shared ? fact : null}
              fact={words.shared ? null : fact}
              subFigure={versus}
              tag={held.length > 0 && watchTickers.length === 1 && name.relation === "watching" ? `You watch ${name.ticker}.` : null}
              fill={stockGridFill(index, ordered.length, false, true)}
              cover={
                <Link
                  prefetch={false}
                  href={`/stock/${encodeURIComponent(name.ticker)}`}
                  aria-label={[name.ticker, figure, versus ? `${versus} its normal day` : null, fact].filter(Boolean).join(", ")}
                  className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                />
              }
            />
          );
        })}
      </StockCardGrid>
    </Section>
  );
}

/**
 * A section's stocks as cards. The words are worked out for the section as a whole (./card-words.ts): an update
 * several stocks share is said once above the cards, and each card says only what is its own. With `chips`, a stock
 * left with nothing of its own (its only update said above) is a small chip under that line, not an empty card
 * (owner rule 4).
 */
function GroupCards({
  groups,
  actions,
  anchors,
  personal,
  chips = false,
  results,
  readEarnings,
  moveFacts,
}: {
  groups: BriefingGroup[];
  actions: GroupActions;
  anchors?: ReadonlySet<BriefingGroup>;
  personal: boolean;
  chips?: boolean;
  results?: Readonly<Record<string, string>>;
  /** Stocks whose report the read already names, so no card says it again. */
  readEarnings?: ReadonlySet<string>;
  moveFacts?: Readonly<Record<string, readonly string[]>>;
}) {
  const words = React.useMemo(() => sectionWords(groups, { personal, results, readEarnings, moveFacts }), [groups, personal, results, readEarnings, moveFacts]);
  if (groups.length === 0) return null;
  // Nothing on the card, and nothing more to open on it (./card-words.ts).
  const bare = (group: BriefingGroup) => chips && Boolean(group.ticker) && words.cards.get(group.key)!.bare;
  const cards = groups.filter((group) => !bare(group));
  // Every company in the section keeps its capitals in an opened card's sources too, as on the card faces.
  const names = groups.filter((group) => group.ticker).map((group) => group.name).filter(Boolean);
  const chipped = groups.filter(bare);
  // One watched card says so under its name; several are named once above the cards (owner rule 1).
  const watched = personal ? cards.filter((group) => group.ticker && group.relation === "watching").map((group) => group.ticker as string) : [];
  const watchLine =
    watched.length > 1 ? `${watched.slice(0, -1).join(", ")} and ${watched[watched.length - 1]} are stocks you watch rather than hold.` : null;
  return (
    <>
      {watchLine ? <p className="mb-2.5 text-pretty px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">{watchLine}</p> : null}
      {words.shared.length > 0 ? (
        <ul className="mb-2.5 grid gap-1 px-2 sm:px-0">
          {words.shared.map((line) => (
            <li key={line} className="text-pretty text-[14px] font-medium leading-5 text-oa-fg">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {chipped.length > 0 ? (
        <StockChipRow className={`px-2 sm:px-0 ${cards.length > 0 ? "mb-3" : ""}`}>
          {chipped.map((group) => (
            <StockChip
              key={group.key}
              id={anchors?.has(group) ? `brief-${group.ticker}` : undefined}
              className="scroll-mt-20"
              ticker={group.ticker!}
              name={group.name}
              figure={group.day_change_pct != null ? signedPct(group.day_change_pct, 1) : null}
              tone={group.day_change_pct == null ? "flat" : group.day_change_pct >= 0 ? "up" : "down"}
            />
          ))}
        </StockChipRow>
      ) : null}
      {cards.length > 0 ? (
        <StockCardGrid>
          {cards.map((group, index) => (
            <BriefingGroupCard
              key={group.key}
              group={group}
              words={words.cards.get(group.key)!}
              names={names}
              actions={actions}
              anchor={anchors?.has(group) ?? false}
              fill={stockGridFill(index, cards.length)}
              watchTag={watched.length <= 1}
            />
          ))}
        </StockCardGrid>
      ) : null}
    </>
  );
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
                  {signedPct(row.day_change_pct, 1)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The page's one clock, said once in the header: the session and when the prices on the page were taken ("After the
 * close, prices as of 4:00 PM ET"), or the earlier close they are from ("Before the open, prices as of Tuesday's
 * close"). Every number below follows it; a card whose quote is older says its own time.
 */
export function exampleClock(marketState: string, pricedAt: string | null | undefined, staleNote: string | null | undefined, date: string): string {
  const pricedDay = etDayOfStamp(pricedAt ?? null);
  // Prices from an earlier session than the page's day name that session, never a bare time that reads as today's.
  if (pricedDay && pricedDay < date) {
    const clock = etClock(pricedAt ?? null);
    const closed = (etMinutes(pricedAt) ?? 0) >= 16 * 60;
    return `${marketState}, prices as of ${weekdayOf(pricedDay)}${closed || !clock ? "'s close" : ` ${clock}`}`;
  }
  const stale = pricedDay ? null : pricesLine(staleNote);
  if (stale) return `${marketState}, ${stale.charAt(0).toLowerCase()}${stale.slice(1).replace(/\.$/, "")}`;
  const clock = etClock(pricedAt ?? null);
  return clock ? `${marketState}, prices as of ${clock}` : marketState;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-11-11" -> "Wednesday", read by hand so no time zone shifts it. */
function weekdayOf(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? WEEKDAY_NAMES[new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()]! : day;
}

const ET_HM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hourCycle: "h23" });

/** Minutes after midnight in New York, or null. */
function etMinutes(stamp: string | null | undefined): number | null {
  const ms = stamp ? Date.parse(stamp) : NaN;
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(ET_HM.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return Number.isFinite(minutes) ? minutes : null;
}

/**
 * "Market today: S&P 500 +1.31%, tech led", or "Market on Friday: …" when the example's prices (and so this figure)
 * are from an earlier session than the page's day. Null without a figure.
 */
export function exampleMarketWords(market: ExampleBriefingExtras["market"], date: string): string | null {
  if (!market || !Number.isFinite(market.pct)) return null;
  const when = market.day && market.day < date ? `Market on ${weekdayOf(market.day)}` : "Market today";
  // One decimal, like the read's headline under it.
  return `${when}: S&P 500 ${signedPct(market.pct, 1)}${market.leader ? `, ${market.leader} led` : ""}`;
}

/**
 * The example's head: what this is, once, the one clock and the market in a line. No button: the shell's Start free
 * (the sidebar, or the top bar on a phone) is the view's one (judges, ship 39).
 */
function ExampleHead({ date, marketState, example, staleNote, degraded }: { date: string; marketState: string; example: ExampleBriefingExtras; staleNote: string | null; degraded: boolean }) {
  const market = exampleMarketWords(example.market, date);
  return (
    <header className="col-span-full min-w-0 px-2 sm:px-0">
      <h1 className="min-w-0 text-pretty text-[15px] font-semibold leading-6 text-oa-fg">Example briefing for a made-up portfolio of real stocks</h1>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">
        <span>
          {longDay(date)} · {exampleClock(marketState, example.pricedAt, staleNote, date)}.
        </span>
        {market ? (
          <Link prefetch={false} href="/explore" className="-my-2.5 inline-flex h-10 items-center text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg sm:my-0 sm:h-5">
            {market} →
          </Link>
        ) : null}
        {degraded ? (
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
    </header>
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
  rail = null,
  beforeOpen = null,
  locked = null,
  agentLog = null,
  example = null,
  resultFacts,
  moveFacts,
  flags,
  reportHistory,
  renderedAt,
}: BriefingViewProps) {
  // One clock for the whole life of the view: the server's, so the hydrated read matches the one sent as HTML.
  const [now] = React.useState(() => renderedAt ?? Date.now());
  const [state, setState] = React.useState<BriefingStateMap>(initialState);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showSettled, setShowSettled] = React.useState(false);
  const [showAllWorth, setShowAllWorth] = React.useState(false);

  const personal = briefing.mode === "personal";
  const canSave = viewer === "member" && !archived;
  const sections = briefingSections(briefing, state);
  const settledCount = sections.kept.length + sections.dismissed.length;

  // Your own briefing reads holdings first, then what you watch, then the market (lib/briefing-read.ts).
  const grouped = personal ? holdingsFirst(groupBriefingSections(sections, briefing.mode)) : groupBriefingSections(sections, briefing.mode);
  // The read, with its next steps beside the findings (lib/next-steps.ts).
  const read = briefingSteps(briefingRead(briefing, grouped, personal ? null : session, now, { example: Boolean(example), marketPct: example?.market?.pct ?? null, reports: reportHistory, flags }), {
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
    // The example is not the visitor's to clear: no "Got it" or "Keep watching" on its cards.
    readOnly: archived || Boolean(example),
    day: briefing.date,
    personal,
  };
  // Each card of your own read opens Ask on the briefing line it is about (or your stocks, for a card about several).
  const askContext = personal && !example
    ? readAskContext([...grouped.needs_you, ...grouped.worth_knowing, ...grouped.coming_up].flatMap((group) => group.items), briefing.date)
    : undefined;

  const index = briefing.market.indices;
  const movers = [...briefing.market.gainers, ...briefing.market.losers];

  const prices = pricesLine(briefing.stale_note);
  // The market view's read already tells the biggest explained moves; the ones it left out lead the list below.
  const inRead = new Set([...(read?.headlineTickers ?? []), ...(read?.insights ?? []).flatMap((insight) => insight.tickers ?? [])]);
  // The read's card about one stock owns it: that stock has no second card under Worth knowing (owner rule 1).
  const worthListed = personal
    ? worthAfterRead(grouped.worth_knowing, read)
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
  // A report the read already names is not said again under Coming up (owner, round 6).
  const comingUp = personal ? comingUpAfterRead(grouped.coming_up, readEarningsTickers(read)) : grouped.coming_up;
  // Only a personal briefing's cards are linked from the agents strip (lib/briefing-anchors.ts); settled ones never.
  const anchors: ReadonlySet<BriefingGroup> = personal ? anchorGroups([...grouped.needs_you, ...worth, ...comingUp]) : new Set();
  // Keyed on the tickers, so the cards' words are not worked out again on every render (the read is rebuilt each time).
  const readEarningsKey = personal ? [...readEarningsTickers(read)].sort().join(",") : "";
  const readEarnings = React.useMemo(() => new Set(readEarningsKey.split(",").filter(Boolean)), [readEarningsKey]);
  const groupCards = (groups: BriefingGroup[], chips = false, prices?: BriefingViewProps["moveFacts"]) => (
    <GroupCards groups={groups} actions={actions} anchors={anchors} personal={personal} chips={chips} results={resultFacts} readEarnings={readEarnings} moveFacts={prices} />
  );

  return (
    // Two columns only while the rail has something in it (owner rule 4: no rail that leaves a void): on an earlier
    // day, or when the agent log has nothing, it can be empty and the briefing takes the whole width. The test is the
    // aside's own hide rule below: an empty agent-log wrapper does not count.
    <div className="grid gap-4 lg:items-start lg:gap-x-5 lg:[&:has(>aside>:not(template):not([data-rail-log]),>aside>[data-rail-log]_section,>aside>[data-rail-log]_[aria-hidden=true])]:grid-cols-[minmax(0,1fr)_19rem]">
      {/* Head: whose briefing, the day, earlier days. One plain status line only when something is off. */}
      {example ? (
        <ExampleHead date={briefing.date} marketState={marketState} example={example} staleNote={briefing.stale_note} degraded={degraded.length > 0} />
      ) : (
      <header className="col-span-full min-w-0 px-2 sm:px-0">
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
            {/* Signed out normally gets the example (ExampleHead); if the example failed to load, it lands here. */}
            {!personal ? (
              viewer === "signed_out" ? (
                <>
                  <span>Market view.</span>
                  <Link prefetch={false} href="/" className="-my-2.5 inline-flex h-10 items-center text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 sm:my-0 sm:h-5">
                    Try it on your stocks
                  </Link>
                  <span>to get one about yours.</span>
                </>
              ) : viewer === "pending" ? (
                <span>
                  Market view. Yours appears once your {pendingTracked} {pendingTracked === 1 ? "stock is" : "stocks are"} ready.
                </span>
              ) : (
                <>
                  <span>Market view.</span>
                  <Link prefetch={false} href="/portfolio?tab=holdings" className="-my-2.5 inline-flex h-10 items-center text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 sm:my-0 sm:h-5">
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
      )}

      {/* The read across the page, then the stocks beside the rail: the rail starts level with Worth knowing, so its
          agents and their day sit beside the stock cards and the two columns end together (owner rules 4 and 10). */}
      <div className="col-span-full flex min-w-0 flex-col gap-4">
        <TheRead
          read={read}
          label={personal ? "Today for you" : "Today in the market"}
          askContext={askContext}
          visual={showSession && session ? <SessionStrip sectors={session.sectors} /> : null}
        />
        {earnings}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-lg border border-[color:color-mix(in_srgb,var(--signal-bearish)_40%,transparent)] bg-oa-card px-3.5 py-2 text-[13px] text-signal-bearish">
            {error}
          </p>
        ) : null}

        {/* Only when something needs a decision: a card saying there is nothing is a card without data (owner rule 4). */}
        {personal && grouped.needs_you.length > 0 ? (
          <Section id="needs-you" label="Needs you">
            {/* One card per stock: its main update and the next one on the face; opening it shows the reason and the rest. */}
            {groupCards(grouped.needs_you)}
          </Section>
        ) : null}

        {worthAll.length > 0 || unexplained.length > 0 || reportedOnly.length > 0 ? (
          <Section
            id="worth-knowing"
            label={personal ? "Worth knowing" : worthAll.length > 0 ? "Other big moves, with the reason" : "Other big moves"}
          >
            {/* No count beside the heading (owner rule 6). Each stock is a card with a fact of its own, a measured price
                fact when nothing else is confirmed (owner rules 3, 7); only a stock with no fact at all is a chip. */}
            {groupCards(worth, personal, personal ? moveFacts : undefined)}
            {worthAll.length > WORTH_KNOWING_FIRST ? (
              <button
                type="button"
                aria-expanded={showAllWorth}
                onClick={() => setShowAllWorth((value) => !value)}
                className={`${CARD} mt-3 flex min-h-10 w-full cursor-pointer items-center justify-center px-4 text-[13.5px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent`}
              >
                {showAllWorth ? "Show fewer" : `Show all ${worthAll.length}`}
              </button>
            ) : null}
            {/* Moves with no confirmed reason come last as one line of tickers and moves, with nothing said about the missing reason (owner, Nov 11). */}
            {unexplained.length > 0 ? (
              <p className={`text-pretty px-2 text-[13.5px] leading-6 text-oa-muted-fg sm:px-0 ${worth.length > 0 ? "mt-3" : ""}`}>
                Also moved:{" "}
                {unexplained.map((group, index) => (
                  <React.Fragment key={group.key}>
                    {index > 0 ? (index === unexplained.length - 1 ? " and " : ", ") : null}
                    <Link prefetch={false} href={`/stock/${encodeURIComponent(group.ticker as string)}`} className="whitespace-nowrap text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                      <span className="oa-mono font-semibold">{group.ticker}</span>{" "}
                      {group.day_change_pct != null ? (
                        <span className={`oa-mono tabular-nums ${group.day_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(group.day_change_pct, 1)}</span>
                      ) : null}
                    </Link>
                  </React.Fragment>
                ))}
                .
              </p>
            ) : null}
            {reportedOnly.length > 0 ? (
              <p className={`text-pretty px-2 text-[13.5px] leading-6 text-oa-muted-fg sm:px-0 ${worth.length > 0 || unexplained.length > 0 ? "mt-2" : ""}`}>
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

        {/* Hidden when empty, like Needs you: the calendar page owns "nothing reports this week". */}
        {comingUp.length > 0 ? (
          <Section id="coming-up" label="Coming up" count="next 7 days">
            {groupCards(comingUp, true)}
          </Section>
        ) : null}

        {settledCount > 0 ? (
          <section aria-labelledby="settled-label">
            <div className={CARD}>
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
              {!canSave && !archived ? (
                <p className="px-4 pb-2.5 text-[12.5px] leading-5 text-oa-muted-fg">Kept for this visit only.</p>
              ) : null}
            </div>
            {/* The cards sit under the bar, not inside it: no card in a card. */}
            {showSettled ? (
              <div className="mt-3">
                <GroupCards groups={grouped.settled} actions={actions} personal={personal} results={resultFacts} />
              </div>
            ) : null}
          </section>
        ) : null}

        {/* The stocks with nothing new today, each a small card with its move and what is its own. In the main column
            beside the rail, so the rail's agent log sits next to the whole briefing and neither column ends far above
            the other (owner rules 4 and 10, judges ship 50). Before the rail in the page, so a phone reaches it first.
            Nothing when every stock has a card above. */}
        {personal && briefing.quiet.names.length > 0 ? (
          <QuietCards head={quietHead(briefing.portfolio?.as_of, briefing.date, archived)} names={briefing.quiet.names} facts={archived ? undefined : moveFacts} today={archived ? null : briefing.date} />
        ) : null}
      </div>

      {/* Side rail: the market as context, not the lead. Only what earns it (before the open, the market, your
          agents, the agent's day). On a wide screen it stretches to the main column's height, and
          the agent's day, last, fills what is left: it is never taller than that space (its rows scroll inside), and
          it keeps at least a header and a few rows, so neither column ends far above the other (owner rule 4). The
          other cards keep their height ([&>*]:shrink-0). Hidden when nothing in it has content. */}
      <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-3 [&>*]:shrink-0 [&:not(:has(>:not(template):not([data-rail-log]),>[data-rail-log]_section,>[data-rail-log]_[aria-hidden=true]))]:hidden lg:self-stretch">
        {/* Before the bell, how the open is set up leads the rail; after 9:30 ET it renders nothing. */}
        {beforeOpen}
        {/* The market view's read already says how the index did and leads with the same moves, so this card is for
            your own briefing. */}
        {/* The example says the market in one line in its head (/explore is the market's read), so no card here. */}
        {example ? null : personal && (index.length > 0 || movers.length > 0) ? (
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
            {/* The index is a live quote; the movers come from the last full run, so their time sits with them. */}
            <MoverRows title="Biggest gains" rows={briefing.market.gainers} asOf={sourceTime(briefing.market.as_of)} />
            <MoverRows title="Biggest drops" rows={briefing.market.losers} asOf={briefing.market.gainers.length > 0 ? null : sourceTime(briefing.market.as_of)} />
            <div className="flex min-h-10 items-center justify-end px-4 py-1">
              <Link prefetch={false} href="/explore#moves" className="-my-2 inline-flex min-h-10 items-center text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                See all stock moves
              </Link>
            </div>
          </section>
        ) : personal ? (
          <section aria-label="Market today" className={CARD}>
            <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">Market data is not available right now.</p>
          </section>
        ) : null}

        {/* Your agents: useful, but not the lead (owner, Nov 11), so under the market card. */}
        {rail}
        {/* What the agent did today across the market: secondary, so in the rail (owner rule 10), for everyone. On a wide
            screen it sits in the space the cards above leave (absolute inside it, so it never makes the rail taller
            than the main column beyond its own minimum). */}
        {agentLog ? (
          <div data-rail-log className="relative min-w-0 lg:min-h-[15rem] lg:flex-1 [&:not(:has(section,[aria-hidden=true]))]:hidden">
            <div className="lg:absolute lg:inset-x-0 lg:top-0 lg:flex lg:max-h-full lg:flex-col">{agentLog}</div>
          </div>
        ) : null}
      </aside>

      <p className="col-span-full px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-1">Prices are delayed. Nothing here is advice to trade.</p>

    </div>
  );
}
