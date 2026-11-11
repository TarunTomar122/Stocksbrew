import Link from "next/link";
import { Suspense } from "react";

import { fmtDay, fmtStampET } from "@/components/oa/kit";
import { Bar } from "@/components/oa/kit/skeleton";
import { findingSlug } from "@/components/portfolio-home/agents-panel";
import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { countWord } from "@/lib/read-format";
import { newYorkToday } from "@/lib/portfolio-data";
import { focusHeadline, focusNoticed, prioritise, type FoldRow, type Lead, type MemoFact } from "@/lib/portfolio-home/focus";
import { buildAgentLog, dataChecks, type LogRow } from "@/lib/portfolio-home/log";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import { exampleWatchLine, findingLoop, findingWatchLine, matchAgent, stampWords, type FindingLoop } from "@/lib/portfolio-home/loop";
import type { FindingSource } from "@/lib/portfolio-home/pick";
import { feedSources, type ExampleReason, type HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview, laid out as an agent reporting to the person: the
 * two or three changes that need them, each a card with everything in view
 * (the headline, why it matters, the evidence with its source and date, and
 * whether a watch covers it), the card itself opening the page where the
 * decision is made; then everything else the agent looked at, listed; and a
 * short dated log of the checks and what is coming up. Each
 * part waits only for the sources it reads (lib/portfolio-home/server.ts).
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const LINK = `font-medium text-oa-primary hover:underline ${FOCUS} rounded`;
const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg sm:text-[17px] sm:leading-6";

/* ── the example line ──────────────────────────────────────────────────── */

const MARK = (
  <Link href="/watchlist" className={LINK}>
    Mark the stocks you own in Portfolio
  </Link>
);

function reasonWords(reason: ExampleReason): React.ReactNode {
  switch (reason) {
    case "read-failed":
      return <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>;
    case "no-us-holdings":
      return <>These tools cover US stocks and funds, and none of your holdings is one yet, so this is the example portfolio.</>;
    case "watching-only":
      return <>You watch stocks but have not marked any as owned, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "no-holdings":
      return <>You have no holdings marked yet, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "signed-out":
      return <>This is an example portfolio of real stocks and funds with made-up share counts.</>;
  }
}

/** Says plainly when the page is about the example, with the one way to make it yours. */
export async function ExampleLine({ load }: { load: HomeLoad }) {
  const { mode, reason } = await load.context;
  if (mode === "mine" || !reason) return null;
  return (
    <div className="mb-3 flex flex-col items-start gap-1 px-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-0">
      <p className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
        <span className="mr-2 inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 align-[1px] text-[13px] font-medium text-oa-primary">
          Example
        </span>
        {reasonWords(reason)}
      </p>
      {reason === "signed-out" ? <HomeSignIn /> : null}
    </div>
  );
}

/* ── what needs you ────────────────────────────────────────────────────── */

/** "Earnings calendar, Nov 9 at 3:13 PM ET." */
function sourceWords(source: FindingSource): string {
  const when = stampWords(source.at, source.day);
  return when ? `${source.label}, ${when}.` : `${source.label}.`;
}

/** The tickers the person tracks (the watchlist scope of an agent covers these). */
function trackedTickers(tracked: string[] | undefined): Set<string> {
  return new Set((tracked ?? []).filter((id) => id.startsWith("US_")).map((id) => id.slice(3).toUpperCase()));
}

/** watchStatus's words when nothing watches a finding (lib/portfolio-home/loop.ts). */
const NO_WATCH = new Set(["No agent watches this yet.", "None of your agents does this yet."]);

/**
 * Under each finding: whether a watch covers it and what that watch last found, linking to the run when it fired
 * (lib/portfolio-home/loop.ts findingWatchLine). When nothing watches it yet, the rule that would, as the one link
 * (its words are the finding's own, so no two cards say the same). Waits only for the person's agents.
 */
async function FindingWatch({ item, loop, load, today }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string }) {
  // A reason finding's source line already says what was checked and when; "the reason watcher last checked this"
  // only explains how it works (owner rule 8).
  if (loop.watch?.kind === "reasons") return null;
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const mine = mode === "mine";
  const match = mine && agents.state === "ready" ? matchAgent(loop.watch, item.ticker, agents.value, trackedTickers(viewer.tracked), today) : null;
  // The example, for someone with no agents of their own: the agents panel shows the example's own agents, so a
  // finding one of them watches says so (with its real last check) instead of "No agent watches this yet".
  const noOwnAgents = !viewer.uid || agents.state === "empty" || (agents.state === "ready" && agents.value.jobs.length === 0);
  const exampleAgents = !mine && noOwnAgents ? await loadExampleAgentsSource() : null;
  const exampleLine = exampleAgents ? exampleWatchLine({ plan: loop.watch, ticker: item.ticker, agents: exampleAgents, today }) : null;
  const line =
    exampleLine ??
    findingWatchLine({
      plan: loop.watch,
      match,
      ticker: item.ticker,
      agents,
      mine,
      reasonDay: loop.check?.id === "reasons" ? loop.check.day : null,
      today,
    });
  // Nothing watches it, and an agent could: offer that one rule (it opens the agent box filled in; nothing is saved yet).
  const setUp = !exampleLine && !match && loop.watch?.kind === "agent" && agents.state !== "slow" && agents.state !== "failed" ? loop.watch : null;
  // Beside the one-tap watch, "No agent watches this yet." only says how it works; the link is what needs doing.
  const text = setUp && line && !line.fired && NO_WATCH.has(line.text) ? null : (line?.text ?? null);
  if (!text && !setUp) return null;
  return (
    // No eye icon in front of every card's watch line (owner rule 1); the words say it.
    // Only its links sit above the card's link; the words stay part of the card.
    <p className={`mt-1 text-pretty text-[12.5px] leading-[17px] ${line?.fired ? "text-oa-fg" : "text-oa-muted-fg"} [&_a]:relative [&_a]:z-[1]`}>
      {text}
      {line?.link ? (
        <>
          {" "}
          <Link href={line.link.href} prefetch={false} data-track-target="agent-run" className={LINK}>
            {line.link.label}
          </Link>
        </>
      ) : null}
      {setUp ? (
        <>
          {text ? " " : null}
          <Link
            href={setUp.href}
            prefetch={false}
            data-track-target="watch"
            title="We read it back to you on the agents page before anything is saved."
            className={LINK}
          >
            {setUp.request}
          </Link>
        </>
      ) : null}
    </p>
  );
}

/**
 * One finding as a small stock card (owner rule 3): the logo and ticker with where it comes from, one big figure
 * ("Nov 17", "P/E 31.7"), one sentence on what it means, and the source with its date. A finding with no figure of
 * its own shows its headline instead. The card is the link, to the page where the decision is made; the only other
 * link on it is the watch's, when there is one.
 */
function FindingCard({ item, loop, load, today, className }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string; className: string }) {
  const card = item.card ?? null;
  const headline = item.headline ?? item.text;
  const why = item.headline ? (item.why ?? null) : null;
  const slug = findingSlug(item.id);
  const source = item.source ?? null;
  const sourceLine = source ? sourceWords(source) : null;
  return (
    <li
      id={`finding-${slug}`}
      data-track-links="insight_clicked"
      data-track-insight-id={item.id.slice(0, 80)}
      data-track-insight-kind={`home-${item.tool}`}
      data-track-tone={item.tone}
      className={`${CARD} ${className} relative flex scroll-mt-20 flex-col px-4 py-3 transition-colors hover:bg-oa-accent target:bg-oa-accent`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-oa-muted-fg">
        {item.ticker ? (
          <>
            <StockLogo ticker={item.ticker} size={20} eager />
            <span className="oa-mono font-medium tabular-nums text-oa-fg">{item.ticker}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span className="truncate">{item.caption}</span>
      </span>
      <Link
        href={item.open.href}
        prefetch={false}
        data-track-target="action"
        aria-describedby={sourceLine || (!card && why) ? `finding-${slug}-more` : undefined}
        className={`mt-1.5 block text-oa-fg after:absolute after:inset-0 after:content-[''] ${FOCUS} rounded`}
      >
        {card ? (
          <>
            <span className="oa-mono block text-[24px] font-semibold leading-8 tracking-[-0.01em] tabular-nums">{card.figure}</span>
            <span className="mt-0.5 block text-pretty text-[14px] leading-5">{card.sentence}</span>
          </>
        ) : (
          <span className="block text-pretty text-[15px] font-medium leading-[21px]">{headline}</span>
        )}
      </Link>
      <span id={`finding-${slug}-more`} className="mt-auto block pt-2">
        {!card && why ? <span className="mb-1 block text-pretty text-[14px] leading-5 text-oa-fg">{why}</span> : null}
        {sourceLine ? <span className="block text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{sourceLine}</span> : null}
      </span>
      {loop.watch || item.ticker ? (
        <Suspense fallback={null}>
          <FindingWatch item={item} loop={loop} load={load} today={today} />
        </Suspense>
      ) : null}
    </li>
  );
}

const FACT_COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-2 sm:grid-cols-3 max-sm:[&>*:last-child]:col-span-2"];

/**
 * The weekly memo in two or three figures (lib/portfolio-home/focus.ts memoFacts): the week against the S&P 500, the
 * holding that moved it most and the main risk, each a figure with the words that read on from it. Opens the memo.
 */
function MemoFactsCard({ row }: { row: FoldRow & { facts: NonNullable<FoldRow["facts"]> } }) {
  const tone = (fact: MemoFact) => (fact.tone === "up" ? "text-signal-bullish" : fact.tone === "down" ? "text-signal-bearish" : "text-oa-fg");
  return (
    <Link
      href={row.href}
      prefetch={false}
      data-track-links="insight_clicked"
      data-track-insight-id={row.key.slice(0, 80)}
      data-track-insight-kind="home-fold-memo"
      className={`${CARD} block px-4 py-3 transition-colors hover:bg-oa-accent ${FOCUS}`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium leading-5 text-oa-fg">{row.title}</span>
        {row.note ? <span className="oa-mono shrink-0 text-[12.5px] tabular-nums text-oa-muted-fg">{row.note}</span> : null}
      </span>
      {/* As many columns as facts, so two facts never leave a third of the row empty (owner rule 4). */}
      <span className={`mt-2 grid gap-x-4 gap-y-3 ${FACT_COLS[row.facts.length] ?? FACT_COLS[3]}`}>
        {row.facts.map((fact) => (
          <span key={fact.id} className="block min-w-0">
            <span className="block text-[12.5px] leading-[17px] text-oa-muted-fg">{fact.caption}</span>
            <span className={`oa-mono block text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${tone(fact)}`}>{fact.figure}</span>
            <span className="flex min-w-0 items-start gap-1.5 text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">
              {fact.ticker ? <StockLogo ticker={fact.ticker} size={14} className="mt-px" /> : null}
              <span className="min-w-0">{fact.label}</span>
            </span>
          </span>
        ))}
      </span>
    </Link>
  );
}

/** Each other place on My stocks as a small card: its name, its one live figure and what the figure is. */
function PlaceCard({ row, className }: { row: FoldRow; className: string }) {
  return (
    <li className={className}>
      <Link
        href={row.href}
        prefetch={false}
        data-track-links="insight_clicked"
        data-track-insight-id={row.key.slice(0, 80)}
        data-track-insight-kind={`home-fold-${row.tool}`}
        className={`${CARD} flex h-full flex-col px-3.5 py-3 transition-colors hover:bg-oa-accent ${FOCUS}`}
      >
        {/* The place's name only: a stock logo beside "Stress test" would read as a card about that stock. */}
        <span className="truncate text-[13.5px] font-medium leading-[18px] text-oa-fg">{row.title}</span>
        {row.figure ? <span className="oa-mono mt-1 block text-[18px] font-semibold leading-6 tabular-nums text-oa-fg">{row.figure}</span> : null}
        <span className="mt-0.5 block text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{row.text}</span>
      </Link>
    </li>
  );
}

/**
 * Cards side by side, all the same height (owner rule 3): `phone` columns on a phone, `wide` from `from` up. The last
 * card takes whatever its row has left, so no row ends half empty (owner rule 4). Classes written out whole so
 * Tailwind finds them.
 */
const SPAN_SM = ["", "sm:col-span-1", "sm:col-span-2", "sm:col-span-3"];
const SPAN_LG = ["", "lg:col-span-1", "lg:col-span-2", "lg:col-span-3"];
function cellClass(index: number, count: number, phone: 1 | 2, wide: 2 | 3, from: "sm" | "lg"): string {
  if (index !== count - 1) return "min-w-0";
  const phoneRest = count % phone;
  const wideRest = count % wide;
  const phoneSpan = phone === 2 && phoneRest === 1 ? "col-span-2" : "";
  const wideSpan = (from === "sm" ? SPAN_SM : SPAN_LG)[wideRest === 0 ? 1 : wide - wideRest + 1] ?? "";
  return `min-w-0 ${phoneSpan} ${wideSpan}`.trim();
}

/** "One tool took too long to answer and one could not be read, so they are left out here." */
export function leftOutWords(slow: number, failed: number): string {
  const count = (n: number) => countWord(n).toLowerCase();
  const parts = [
    slow > 0 ? `${count(slow)} ${slow === 1 ? "tool" : "tools"} took too long to answer` : null,
    failed > 0 ? `${count(failed)} ${slow > 0 ? "" : failed === 1 ? "tool " : "tools "}could not be read` : null,
  ].filter(Boolean) as string[];
  const many = slow + failed > 1;
  const text = `${parts.join(" and ")}, so ${many ? "they are" : "it is"} left out here. Reload in a minute to try again.`;
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/\s+/g, " ");
}

/**
 * The lead: what needs the person, each a stock card; then everything else the agent looked at: the weekly memo in
 * figures and every other place with its one live figure, as small cards (owner rules 1 to 3: no chevrons, no
 * "See…" on every row, nothing to open to read it).
 */
export async function FocusCard({ load }: { load: HomeLoad }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const noticed = focusNoticed(sources, mode);
  const { lead, fold } = prioritise(noticed, { ...sources, goal }, mode);
  const today = newYorkToday();
  const checks = dataChecks({ ...sources, goal }, mode, today);
  const urgent = lead.filter((item) => item.needsYou).length;
  const states = Object.values(sources).map((source) => source.state);
  const slow = states.filter((state) => state === "slow").length;
  const failed = states.filter((state) => state === "failed").length;
  const example = mode === "example";
  const memoRow = fold.find((row): row is FoldRow & { facts: NonNullable<FoldRow["facts"]> } => (row.facts?.length ?? 0) > 0) ?? null;
  const places = fold.filter((row) => row !== memoRow);
  return (
    <section aria-labelledby="focus-head" className="min-w-0">
      <h2 id="focus-head" className={`${H2} px-1 pb-2.5`}>
        {noticed.length === 0 && slow + failed > 0 ? `The tools could not read ${example ? "the example's" : "your"} holdings just now.` : focusHeadline(urgent, mode)}
      </h2>
      {lead.length > 0 ? (
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {lead.map((item, index) => (
            <FindingCard key={item.id} item={item} loop={findingLoop(item, checks, mode)} load={load} today={today} className={cellClass(index, lead.length, 1, 2, "sm")} />
          ))}
        </ol>
      ) : (
        <p className={`${CARD} px-4 py-3 text-pretty text-[14px] leading-5 text-oa-muted-fg`}>
          {slow + failed > 0 ? (
            "Reload in a minute to try again."
          ) : example ? (
            "The example's tools came back with nothing to say this week."
          ) : (
            <>
              <Link href="/watchlist" prefetch={false} className={LINK}>
                Add share counts in Portfolio
              </Link>{" "}
              and the tools have more to go on.
            </>
          )}
        </p>
      )}
      {fold.length > 0 ? (
        <div className="mt-5">
          <h3 className="px-1 pb-2.5 text-[14.5px] font-semibold leading-5 text-oa-fg">Everything else the agent looked at</h3>
          <div className="flex flex-col gap-3">
            {memoRow ? <MemoFactsCard row={memoRow} /> : null}
            {places.length > 0 ? (
              <ul className="oa-card-grid grid grid-cols-2 gap-3 lg:grid-cols-3">
                {places.map((row, index) => (
                  <PlaceCard key={row.key} row={row} className={cellClass(index, places.length, 2, 3, "lg")} />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      {slow + failed > 0 && noticed.length > 0 ? <p className="px-1 pt-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg">{leftOutWords(slow, failed)}</p> : null}
    </section>
  );
}

export function FocusGhost() {
  return (
    <div aria-hidden="true" className="min-w-0">
      <Bar className="mx-1 mb-3 mt-1 h-4 w-64" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className={`${CARD} px-4 py-3.5`}>
            <Bar className="h-3 w-28" />
            <Bar className="mt-3 h-6 w-20" />
            <Bar className="mt-2 h-3.5 w-full" />
            <Bar className="mt-1.5 h-3.5 w-3/4" />
            <Bar className="mt-4 h-3 w-40" />
          </div>
        ))}
      </div>
      <Bar className="mx-1 mb-3 mt-6 h-3.5 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className={`${CARD} px-3.5 py-3 ${card === 2 ? "col-span-2 lg:col-span-1" : ""}`}>
            <Bar className="h-3.5 w-24" />
            <Bar className="mt-2 h-5 w-16" />
            <Bar className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── what the agent checked ────────────────────────────────────────────── */

function LogItem({ row }: { row: LogRow }) {
  const time = row.at ? fmtStampET(row.at).replace(/^[A-Z][a-z]{2} \d{1,2}, /, "") : "";
  const body = (
    <>
      <span className="oa-mono pt-px text-[12.5px] leading-[18px] tabular-nums text-oa-muted-fg">
        {fmtDay(row.day)}
        {time ? <span className="block whitespace-nowrap text-[11px]">{time}</span> : null}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-start gap-1.5">
          {row.ticker ? <StockLogo ticker={row.ticker} size={16} className="mt-px" /> : null}
          <span className="text-pretty text-[13.5px] leading-[18px] text-oa-fg">{row.text}</span>
        </span>
        {row.changed ? (
          // No tone triangle in front: it read as a chevron (owner rule 1); the words say it.
          <span className="mt-0.5 block text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{row.changed}</span>
        ) : null}
      </span>
    </>
  );
  // Wide enough for "12:37 AM ET" on one line, with a clear gap before the text.
  const grid = "grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 px-4 py-2.5";
  return (
    <li>
      {row.href ? (
        <Link href={row.href} prefetch={false} className={`${grid} transition-colors hover:bg-oa-accent ${FOCUS}`}>
          {body}
        </Link>
      ) : (
        <div className={grid}>{body}</div>
      )}
    </li>
  );
}

const LIST = "scrollbar-hide max-h-[26rem] divide-y divide-oa-border overflow-y-auto overscroll-contain";

/** A dated log: what the agent checked (newest first) and what is coming up, from real runs and real dates only. */
export async function AgentLogPanel({ load }: { load: HomeLoad }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const { memo, reasons, season } = sources;
  const mine = mode === "mine";
  const today = newYorkToday();
  // Every check is listed here: the finding cards say what was found, the log what was checked and when.
  const omit = new Set<string>();
  // The agents panel lists the reason watcher with its last check, so the log leaves that row out for a person's own stocks.
  if (mine && reasons?.state === "ready" && reasons.value.checks.length > 0) omit.add("reasons");
  // The person's agents, their runs and their next check are in the agents panel (./agents-panel.tsx), so the log is
  // the data checks. What is coming up is its own row of cards with the findings (ComingUp).
  const log = buildAgentLog({
    sources: { ...sources, goal },
    agents: null,
    mode,
    today,
    omit,
  });
  const waiting = [memo, reasons, season, goal].some((source) => source?.state === "slow" || source?.state === "failed");
  // Nothing left to list: no panel, unless a source is still out (then it says to reload).
  if (log.checked.length === 0 && !waiting) return null;
  return (
    <section aria-labelledby="log-head" className={CARD}>
      <h2 id="log-head" className={`${H2} px-4 pt-3.5`}>
        {mine ? "What your agent checked" : "What the agent checked"}
      </h2>
      {log.checked.length > 0 ? (
        <ol className={`${LIST} mt-1.5`}>
          {log.checked.map((row) => (
            <LogItem key={row.id} row={row} />
          ))}
        </ol>
      ) : (
        <p className="px-4 pb-3 pt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {omit.size > 0 ? "Some checks have not come back yet. Reload in a minute." : "No check has come back yet. Reload in a minute."}
        </p>
      )}
    </section>
  );
}

/**
 * What is coming up for the holdings (a report, the next dividend), from real dates only, as small stock cards: the
 * day as the figure and one line. A report a finding card above already leads with is left out, so it is said once.
 */
export async function ComingUp({ load }: { load: HomeLoad }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const today = newYorkToday();
  const log = buildAgentLog({ sources: { ...sources, goal }, agents: null, mode, today, omit: new Set() });
  // Any earnings finding, led with or in the fold: its card already shows the report and its date.
  const said = new Set(focusNoticed(sources, mode).filter((item) => item.tool === "earnings" && item.ticker).map((item) => `report-${item.ticker}`));
  const rows = log.next.filter((row) => !said.has(row.id));
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="next-head" className="min-w-0">
      <h2 id="next-head" className="px-1 pb-2.5 text-[14.5px] font-semibold leading-5 text-oa-fg">
        Coming up
      </h2>
      <ul className="oa-card-grid grid grid-cols-2 gap-3 lg:grid-cols-3">
        {rows.map((row, index) => {
          const body = (
            <>
              <span className="flex min-w-0 items-center gap-1.5">
                {row.ticker ? <StockLogo ticker={row.ticker} size={16} /> : null}
                <span className="oa-mono truncate text-[13px] font-medium tabular-nums text-oa-fg">{row.ticker ?? ""}</span>
              </span>
              <span className="oa-mono mt-1 block text-[18px] font-semibold leading-6 tabular-nums text-oa-fg">{fmtDay(row.day)}</span>
              <span className="mt-0.5 block text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{row.text}</span>
            </>
          );
          const card = `${CARD} flex h-full flex-col px-3.5 py-3`;
          return (
            <li key={row.id} className={cellClass(index, rows.length, 2, 3, "lg")}>
              {row.href ? (
                <Link href={row.href} prefetch={false} className={`${card} transition-colors hover:bg-oa-accent ${FOCUS}`}>
                  {body}
                </Link>
              ) : (
                <div className={card}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AgentLogGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3.5`}>
      <Bar className="h-4 w-48" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="mt-3.5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4">
          <Bar className="h-3 w-10" />
          <span>
            <Bar className="h-3.5 w-full" />
            <Bar className="mt-1.5 h-3 w-2/3" />
          </span>
        </div>
      ))}
    </div>
  );
}
