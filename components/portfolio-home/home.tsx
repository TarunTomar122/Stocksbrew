import Link from "next/link";
import { Suspense } from "react";

import { fmtDay, fmtStampET } from "@/components/oa/kit";
import { Bar } from "@/components/oa/kit/skeleton";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { findingSlug } from "@/components/portfolio-home/agents-panel";
import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { countWord } from "@/lib/read-format";
import { newYorkToday } from "@/lib/portfolio-data";
import { focusHeadline, focusNoticed, prioritise, type FoldRow, type Lead } from "@/lib/portfolio-home/focus";
import { buildAgentLog, dataChecks, type LogRow } from "@/lib/portfolio-home/log";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import { askFor, exampleWatchLine, findingLoop, findingWatchLine, matchAgent, stampWords, type FindingLoop } from "@/lib/portfolio-home/loop";
import type { FindingSource } from "@/lib/portfolio-home/pick";
import { MAX_QUESTIONS, pickQuestions } from "@/lib/portfolio-home/questions";
import { feedSources, type ExampleReason, type HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview, laid out as an agent reporting to the person: the
 * two or three changes that need them, each a card with everything in view
 * (the headline, why it matters, the evidence with its source and date, and
 * whether a watch covers it), the card itself opening the page where the
 * decision is made; then everything else the agent looked at, listed; an Ask
 * box (the page's one Ask) with questions drawn from the findings and the
 * holdings; and a short dated log of the checks and what is coming up. Each
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

/**
 * Under each finding: whether a watch covers it and what that watch last found, linking to the run when it fired
 * (lib/portfolio-home/loop.ts findingWatchLine). When nothing watches it yet, the rule that would, as the one link
 * (its words are the finding's own, so no two cards say the same). Waits only for the person's agents.
 */
async function FindingWatch({ item, loop, load, today }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string }) {
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
  if (!line && !setUp) return null;
  return (
    // No eye icon in front of every card's watch line (owner rule 1); the words say it.
    // Only its links sit above the card's link; the words stay part of the card.
    <p className={`mt-1.5 text-pretty text-[12.5px] leading-[17px] ${line?.fired ? "text-oa-fg" : "text-oa-muted-fg"} [&_a]:relative [&_a]:z-[1]`}>
      {line ? line.text : null}
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
          {line ? " " : null}
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
 * One finding, everything in view (owner rule 2: nothing to open to read it): the stock, the headline, why it
 * matters, the evidence with its source and date, and the watch. The card is the link, to the page where the
 * decision is made; the only other link on it is the watch's, when there is one.
 */
function FindingCard({ item, loop, load, today }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string }) {
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
      className="relative scroll-mt-20 px-4 py-3 transition-colors hover:bg-oa-accent target:bg-oa-accent sm:px-5 sm:py-3.5"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-oa-muted-fg">
        {item.ticker ? (
          <>
            <StockLogo ticker={item.ticker} size={18} eager />
            <span className="oa-mono font-medium tabular-nums text-oa-fg">{item.ticker}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : (
          <ToneGlyph tone={item.tone} />
        )}
        <span className="truncate">{item.caption}</span>
      </span>
      <Link
        href={item.open.href}
        prefetch={false}
        data-track-target="action"
        aria-describedby={why || item.evidence || sourceLine ? `finding-${slug}-more` : undefined}
        className={`mt-1 block w-fit text-pretty text-[15px] font-medium leading-[21px] text-oa-fg after:absolute after:inset-0 after:content-[''] hover:underline ${FOCUS} rounded`}
      >
        {headline}
      </Link>
      <span id={`finding-${slug}-more`} className="block">
        {why ? <span className="mt-1 block text-pretty text-[14px] leading-5 text-oa-fg">{why}</span> : null}
        {item.evidence || sourceLine ? (
          <span className="mt-1 block text-pretty text-[13px] leading-[19px] text-oa-muted-fg">
            {item.evidence}
            {item.evidence && sourceLine ? " " : null}
            {sourceLine}
          </span>
        ) : null}
      </span>
      {loop.watch || item.ticker ? (
        <Suspense fallback={null}>
          <FindingWatch item={item} loop={loop} load={load} today={today} />
        </Suspense>
      ) : null}
    </li>
  );
}

function FoldItem({ row }: { row: FoldRow }) {
  return (
    <li>
      <Link
        href={row.href}
        prefetch={false}
        data-track-links="insight_clicked"
        data-track-insight-id={row.key.slice(0, 80)}
        data-track-insight-kind={`home-fold-${row.tool}`}
        className={`grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5 transition-colors hover:bg-oa-accent sm:px-5 ${FOCUS}`}
      >
        <span className="mt-px flex h-[18px] items-center justify-center">
          {row.ticker ? <StockLogo ticker={row.ticker} size={18} /> : row.tone ? <ToneGlyph tone={row.tone} /> : <span aria-hidden="true" className="h-1 w-1 rounded-full bg-oa-muted-fg" />}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate text-[14px] font-medium leading-[18px] text-oa-fg">{row.title}</span>
            {row.figure ? <span className="oa-mono shrink-0 text-[13.5px] font-medium tabular-nums text-oa-fg">{row.figure}</span> : null}
          </span>
          <span className="mt-0.5 block text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{row.text}</span>
        </span>
      </Link>
    </li>
  );
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

/** The lead: what needs the person, each with one step; then one fold with everything else, each tool said once. */
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
  return (
    <section aria-labelledby="focus-head" className={CARD}>
      <h2 id="focus-head" className={`${H2} border-b border-oa-border px-4 py-3 sm:px-5`}>
        {noticed.length === 0 && slow + failed > 0 ? `The tools could not read ${example ? "the example's" : "your"} holdings just now.` : focusHeadline(urgent, mode)}
      </h2>
      {lead.length > 0 ? (
        <ol className="divide-y divide-oa-border">
          {lead.map((item) => (
            <FindingCard key={item.id} item={item} loop={findingLoop(item, checks, mode)} load={load} today={today} />
          ))}
        </ol>
      ) : (
        <p className="px-4 py-4 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-5">
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
        <div className="border-t border-oa-border">
          <h3 className="px-4 pb-1 pt-3 text-[14.5px] font-semibold leading-5 text-oa-fg sm:px-5">Everything else the agent looked at</h3>
          {/* About eight rows, then it scrolls inside with no bar showing (owner rule 5). */}
          <ul className="scrollbar-hide max-h-[29rem] divide-y divide-oa-border overflow-y-auto overscroll-contain">
            {fold.map((row) => (
              <FoldItem key={row.key} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
      {slow + failed > 0 && noticed.length > 0 ? <p className="border-t border-oa-border px-4 py-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-5">{leftOutWords(slow, failed)}</p> : null}
    </section>
  );
}

export function FocusGhost() {
  return (
    <div aria-hidden="true" className={CARD}>
      <div className="border-b border-oa-border px-4 py-3.5 sm:px-5">
        <Bar className="h-4 w-64" />
      </div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="border-b border-oa-border px-4 py-3.5 sm:px-5">
          <Bar className="h-3 w-28" />
          <Bar className="mt-2 h-4 w-full max-w-[30rem]" />
          <Bar className="mt-2 hidden h-3 w-3/4 max-w-[28rem] sm:block" />
          <Bar className="mt-2.5 h-3.5 w-40" />
        </div>
      ))}
      <div className="px-4 py-3.5 sm:px-5">
        <Bar className="h-3.5 w-72" />
      </div>
    </div>
  );
}

/* ── ask ───────────────────────────────────────────────────────────────── */

async function AskSuggestions({ load }: { load: HomeLoad }) {
  const [{ mode }, sources] = await Promise.all([load.context, feedSources(load)]);
  const noticed = focusNoticed(sources, mode);
  const { lead } = prioritise(noticed, sources, mode);
  const leadIds = new Set(lead.map((item) => item.id));
  // This box is the page's one Ask (owner rule 1): the lead findings' own questions come first, then the others.
  const fromLead = lead
    .map((item) => askFor(item, mode))
    .filter((ask): ask is NonNullable<typeof ask> => Boolean(ask))
    .slice(0, 2);
  const rest = pickQuestions({
    lead: [],
    rest: noticed.filter((item) => !leadIds.has(item.id)),
    sources,
    mode,
    skip: fromLead.map((ask) => ask.question),
  });
  const questions = [...fromLead, ...rest].slice(0, MAX_QUESTIONS);
  if (questions.length === 0) return null;
  return (
    <ul aria-label="Questions to ask" className="mt-3 flex flex-col gap-1.5">
      {questions.map((item) => (
        <li key={item.question}>
          <Link
            href={item.href}
            prefetch={false}
            data-track-links="insight_clicked"
            data-track-insight-id="home-ask"
            data-track-insight-kind="home-ask"
            data-track-target="ask"
            className={`block rounded border border-oa-border bg-oa-bg px-3 py-2 text-pretty text-[13.5px] leading-[19px] text-oa-fg transition-colors hover:border-oa-primary hover:text-oa-primary ${FOCUS}`}
          >
            {item.question}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AskSuggestionsGhost() {
  return (
    <div aria-hidden="true" className="mt-3 flex flex-col gap-1.5">
      {[0, 1, 2].map((row) => (
        <Bar key={row} className="h-9 w-full" />
      ))}
    </div>
  );
}

/**
 * Ask, from here: a plain form that opens /ask with the question (Ask asks it
 * on arrival), and questions drawn from the holdings and this week's findings.
 * Nothing calls a model until the person asks.
 */
export async function AskBox({ load }: { load: HomeLoad }) {
  const { mode } = await load.context;
  const mine = mode === "mine";
  return (
    <AskFrame
      mine={mine}
      suggestions={
        <Suspense fallback={<AskSuggestionsGhost />}>
          <AskSuggestions load={load} />
        </Suspense>
      }
    />
  );
}

function AskFrame({ mine, suggestions }: { mine: boolean; suggestions: React.ReactNode }) {
  return (
    <section aria-labelledby="ask-head" className={`${CARD} px-4 py-3.5`}>
      <h2 id="ask-head" className={H2}>
        {mine ? "Ask about your stocks" : "Ask about any stock"}
      </h2>
      <form action="/ask" method="get" role="search" className="mt-2.5 flex gap-2">
        <label htmlFor="home-ask" className="sr-only">
          Your question
        </label>
        <input
          id="home-ask"
          name="q"
          type="text"
          required
          maxLength={ASK_MAX_QUESTION_CHARS}
          autoComplete="off"
          placeholder={mine ? "What changed in my portfolio?" : "Ask about any US stock"}
          className={`h-10 min-w-0 flex-1 rounded border border-oa-border bg-oa-bg px-3 text-[14px] text-oa-fg placeholder:text-oa-muted-fg ${FOCUS}`}
        />
        <button
          type="submit"
          className={`inline-flex h-10 shrink-0 cursor-pointer items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg transition-[filter] hover:brightness-110 ${FOCUS}`}
        >
          Ask
        </button>
      </form>
      {suggestions}
    </section>
  );
}

export function AskGhost() {
  return <AskFrame mine={false} suggestions={<AskSuggestionsGhost />} />;
}

/* ── what the agent checked ────────────────────────────────────────────── */

function LogItem({ row, upcoming }: { row: LogRow; upcoming: boolean }) {
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
          <span className="mt-0.5 flex items-start gap-1.5 text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">
            {!upcoming && row.tone !== "flat" ? <ToneGlyph tone={row.tone} className="mt-[4px]" /> : null}
            <span>{row.changed}</span>
          </span>
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
  // The person's agents, their runs and their next check are in the agents panel (./agents-panel.tsx), so the log is the data checks and what is coming up.
  const log = buildAgentLog({
    sources: { ...sources, goal },
    agents: null,
    mode,
    today,
    omit,
  });
  const waiting = [memo, reasons, season, goal].some((source) => source?.state === "slow" || source?.state === "failed");
  // Every check went onto a finding: the panel is only what is coming up.
  const allFolded = omit.size > 0 && log.checked.length === 0;
  // Nothing left to list: no panel, unless a source is still out (then it says to reload).
  if (allFolded && log.next.length === 0 && !waiting) return null;
  return (
    <section aria-labelledby="log-head" className={CARD}>
      <h2 id="log-head" className={`${H2} px-4 pt-3.5`}>
        {allFolded && log.next.length > 0 ? "Coming up" : mine ? "What your agent checked" : "What the agent checked"}
      </h2>
      {allFolded && log.next.length > 0 ? null : log.checked.length > 0 ? (
        <ol className={`${LIST} mt-1.5`}>
          {log.checked.map((row) => (
            <LogItem key={row.id} row={row} upcoming={false} />
          ))}
        </ol>
      ) : (
        <p className="px-4 pb-3 pt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {waiting ? (omit.size > 0 ? "Some checks have not come back yet. Reload in a minute." : "No check has come back yet. Reload in a minute.") : "Nothing has been checked yet."}
        </p>
      )}
      {log.next.length > 0 ? (
        <>
          {allFolded ? null : <h3 className="border-t border-oa-border px-4 pt-3 text-[14.5px] font-semibold leading-5 text-oa-fg">Coming up</h3>}
          <ol className={`${LIST} mt-1`}>
            {log.next.map((row) => (
              <LogItem key={row.id} row={row} upcoming />
            ))}
          </ol>
        </>
      ) : null}
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
