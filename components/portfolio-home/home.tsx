import Link from "next/link";
import { Suspense } from "react";

import { fmtDay, fmtStampET } from "@/components/oa/kit";
import { Bar } from "@/components/oa/kit/skeleton";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { findingSlug } from "@/components/portfolio-home/agents-panel";
import { phoneReason } from "@/components/portfolio-home/phone-reason";
import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { countWord } from "@/lib/read-format";
import { newYorkToday } from "@/lib/portfolio-data";
import { focusHeadline, focusNoticed, prioritise, type FoldRow, type Lead } from "@/lib/portfolio-home/focus";
import { buildAgentLog, dataChecks, type LogRow } from "@/lib/portfolio-home/log";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import { askFor, exampleWatchLine, findingLoop, findingWatchLine, foldedCheckIds, matchAgent, nextWords, stampWords, watchPlan, type FindingLoop, type WatchPlan } from "@/lib/portfolio-home/loop";
import type { FindingSource } from "@/lib/portfolio-home/pick";
import { pickQuestions } from "@/lib/portfolio-home/questions";
import { feedSources, type ExampleReason, type HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview, laid out as an agent reporting to the person: the
 * two or three changes that need them, each a compact card with one next step
 * that opens to its loop (the evidence with its source and date, a question
 * for Ask, and the watch: the rule, the last check and the next one), and one
 * fold with everything else; an Ask box with more questions drawn from their
 * holdings; and a short dated log of the other checks and what is coming up.
 * Each part waits only for the sources it reads (lib/portfolio-home/server.ts).
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

const CHEVRON = (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-oa-muted-fg transition-transform group-open:rotate-180">
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One row of a finding's loop: a short word on the left, the line on the right (styled once on the list, LOOP). */
function LoopRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const LOOP =
  "flex flex-col gap-2 rounded border border-oa-border bg-oa-bg px-3 py-2.5 text-[13px] leading-[18px] [&>div]:grid [&>div]:grid-cols-[4.75rem_minmax(0,1fr)] [&>div]:gap-x-3 [&_dd]:min-w-0 [&_dd]:text-pretty [&_dt]:text-[12.5px] [&_dt]:text-oa-muted-fg";

/** "Earnings calendar, Nov 9 at 3:13 PM ET." */
function sourceWords(source: FindingSource): string {
  const when = stampWords(source.at, source.day);
  return when ? `${source.label}, ${when}.` : `${source.label}.`;
}

function ruleLink(plan: Extract<WatchPlan, { kind: "agent" }>, href: string) {
  return (
    <Link href={href} prefetch={false} data-track-target="watch" className={LINK}>
      {plan.request}
    </Link>
  );
}

/** The tickers the person tracks (the watchlist scope of an agent covers these). */
function trackedTickers(tracked: string[] | undefined): Set<string> {
  return new Set((tracked ?? []).filter((id) => id.startsWith("US_")).map((id) => id.slice(3).toUpperCase()));
}

/**
 * The watch, open: the rule that would keep watching the finding (opening the
 * person's agent when one already has it), then when it is checked next, only
 * when the run log proves the after-close runner is running. Whether it is
 * covered, and what the watch last found, shows on the card closed (FindingWatch).
 */
async function WatchRows({ plan, ticker, load, today }: { plan: WatchPlan; ticker: string | null; load: HomeLoad; today: string }) {
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const match = mode === "mine" && agents.state === "ready" ? matchAgent(plan, ticker, agents.value, trackedTickers(viewer.tracked), today) : null;
  return (
    <>
      <LoopRow term="Watch">{plan.kind === "reasons" ? plan.text : ruleLink(plan, match ? `/agents?job=${encodeURIComponent(match.id)}` : plan.href)}</LoopRow>
      {match?.next ? <LoopRow term="Next check">{nextWords(match.next, today)}</LoopRow> : null}
    </>
  );
}

const EYE = (
  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" className="mt-[2px] shrink-0">
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

/**
 * Beside each finding, closed or open: whether a watch covers it and what that
 * watch last found, linking to the run when it fired (lib/portfolio-home/loop.ts
 * findingWatchLine). Waits only for the person's agents.
 */
async function FindingWatch({ item, loop, load, today }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string }) {
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const mine = mode === "mine";
  const match = mine && agents.state === "ready" ? matchAgent(loop.watch, item.ticker, agents.value, trackedTickers(viewer.tracked), today) : null;
  // The example, for someone with no agents of their own: the agents panel shows the example's own agents, so a
  // finding one of them watches says so (with its real last check) instead of "No agent watches this yet".
  const noOwnAgents = !viewer.uid || agents.state === "empty" || (agents.state === "ready" && agents.value.jobs.length === 0);
  const exampleAgents = !mine && noOwnAgents ? await loadExampleAgentsSource() : null;
  const line =
    (exampleAgents ? exampleWatchLine({ plan: loop.watch, ticker: item.ticker, agents: exampleAgents, today }) : null) ??
    findingWatchLine({
      plan: loop.watch,
      match,
      ticker: item.ticker,
      agents,
      mine,
      reasonDay: loop.check?.id === "reasons" ? loop.check.day : null,
      today,
    });
  if (!line) return null;
  return (
    <p className={`mb-1 flex items-start gap-1.5 text-pretty text-[12.5px] leading-[17px] ${line.fired ? "text-oa-fg" : "text-oa-muted-fg"}`}>
      <span className={line.fired ? "text-oa-primary" : undefined}>{EYE}</span>
      <span>
        {line.text}
        {line.link ? (
          <>
            {" "}
            <Link href={line.link.href} prefetch={false} data-track-target="agent-run" className={LINK}>
              {line.link.label}
            </Link>
          </>
        ) : null}
      </span>
    </p>
  );
}

/** The step under a finding; when it would set up an agent the person already has, it opens that agent instead. */
async function PrimaryStep({ item, load, today }: { item: Lead; load: HomeLoad; today: string }) {
  let { label, href } = item.action;
  let watch = item.action.kind === "watch";
  if (watch) {
    const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
    if (mode === "mine" && agents.state === "ready") {
      const tracked = trackedTickers(viewer.tracked);
      const match = matchAgent(watchPlan(item, mode), item.ticker, agents.value, tracked, today);
      if (match) {
        label = `Open your agent “${match.name}”`;
        href = `/agents?job=${encodeURIComponent(match.id)}`;
        // It opens an agent that exists; nothing is read back or saved.
        watch = false;
      }
    }
  }
  return <StepLink label={label} href={href} watch={watch} />;
}

function StepLink({ label, href, watch }: { label: string; href: string; watch: boolean }) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-track-target={watch ? "watch" : "action"}
      title={watch ? "We read it back to you on the agents page before anything is saved." : undefined}
      className={`inline-flex min-h-8 max-w-full items-center gap-1 text-pretty text-left text-[14px] font-medium leading-[19px] text-oa-primary hover:underline ${FOCUS} rounded`}
    >
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

/**
 * One finding, compact: the stock, a short headline and one step. It opens to
 * the loop: the evidence with its source and date, a question for Ask, and the
 * watch. From sm up the explanation and the evidence also show closed, as before.
 */
function FindingCard({ item, loop, load, today }: { item: Lead; loop: FindingLoop; load: HomeLoad; today: string }) {
  const headline = item.headline ?? item.text;
  const why = item.headline ? (item.why ?? null) : null;
  const reason = phoneReason(item, headline);
  const slug = findingSlug(item.id);
  const check = loop.check;
  const source = item.source ?? null;
  const sourceLine = source ? sourceWords(source) : null;
  // The last check already gives the same time (the calendar capture, the close the prices are from).
  const sourceRow = sourceLine && !(check && stampWords(source!.at, source!.day) === stampWords(check.at, check.day));
  // When the step sets up an agent, the open card shows that request under Watch; the page with the evidence takes its place.
  const sameAsWatch = item.action.kind === "watch" && loop.watch?.kind === "agent";
  return (
    <li
      id={`finding-${slug}`}
      data-track-links="insight_clicked"
      data-track-insight-id={item.id.slice(0, 80)}
      data-track-insight-kind={`home-${item.tool}`}
      data-track-tone={item.tone}
      className="scroll-mt-20 [&:has(>details[open])_[data-open-only]]:inline [&:has(>details[open])_[data-same-as-watch]]:hidden"
    >
      <details className="group">
        <summary
          aria-label={headline}
          // The name stays short; the explanation and evidence come through as its description.
          aria-describedby={why || item.evidence || sourceLine ? `finding-${slug}-more` : undefined}
          className={`grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_12px] gap-x-3 px-4 pt-3 transition-colors hover:bg-oa-accent sm:px-5 sm:pt-3.5 [&::-webkit-details-marker]:hidden ${FOCUS}`}
        >
          <span className="min-w-0">
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
            <span className="mt-1 block text-pretty text-[15px] font-medium leading-[21px] text-oa-fg">{headline}</span>
            {/* A phone shows one short reason closed; open, the full explanation below takes its place. */}
            {reason ? <span className="mt-0.5 block text-pretty text-[13.5px] leading-[18px] text-oa-muted-fg group-open:hidden sm:hidden">{reason}</span> : null}
            {/* Shown closed from sm up (the desktop density); on a phone they open with the card. */}
            <span id={`finding-${slug}-more`}>
              {why ? <span className="mt-1 hidden text-pretty text-[14px] leading-5 text-oa-fg group-open:block sm:block">{why}</span> : null}
              {item.evidence || sourceLine ? (
                <span className="mt-1 hidden text-pretty text-[13px] leading-[19px] text-oa-muted-fg group-open:block sm:block">
                  {item.evidence}
                  {/* Closed on a desktop, the source and its date sit with the numbers; open, the loop below says them. */}
                  {sourceLine ? <span className="group-open:hidden"> {sourceLine}</span> : null}
                </span>
              ) : null}
            </span>
          </span>
          <span className="mt-[3px] flex h-[14px] items-center">{CHEVRON}</span>
        </summary>
        <div className="px-4 pb-1.5 pt-2 sm:px-5" id={`finding-${slug}-loop`}>
          <dl className={LOOP}>
            {sourceRow ? <LoopRow term="Source">{sourceLine}</LoopRow> : null}
            {loop.ask ? (
              <LoopRow term="Ask">
                <Link href={loop.ask.href} prefetch={false} data-track-target="ask" className={LINK}>
                  {loop.ask.question}
                </Link>
              </LoopRow>
            ) : null}
            {loop.watch ? (
              <Suspense fallback={<LoopRow term="Watch">{loop.watch.kind === "reasons" ? loop.watch.text : ruleLink(loop.watch, loop.watch.href)}</LoopRow>}>
                <WatchRows plan={loop.watch} ticker={item.ticker} load={load} today={today} />
              </Suspense>
            ) : null}
            {check ? (
              <LoopRow term="Last check">
                <span className="oa-mono whitespace-nowrap text-[12.5px] tabular-nums text-oa-muted-fg">{stampWords(check.at, check.day)}</span> {check.text}
                {check.changed ? ` ${check.changed}` : ""}
              </LoopRow>
            ) : null}
          </dl>
        </div>
      </details>
      <div className="px-4 pb-2.5 pt-1 sm:px-5">
        {loop.watch || item.ticker ? (
          <Suspense fallback={null}>
            <FindingWatch item={item} loop={loop} load={load} today={today} />
          </Suspense>
        ) : null}
        <span data-same-as-watch={sameAsWatch ? "" : undefined}>
          <Suspense fallback={<StepLink label={item.action.label} href={item.action.href} watch={item.action.kind === "watch"} />}>
            <PrimaryStep item={item} load={load} today={today} />
          </Suspense>
        </span>
        {sameAsWatch ? (
          <span data-open-only="" className="hidden">
            <StepLink label={item.open.label} href={item.open.href} watch={false} />
          </span>
        ) : null}
      </div>
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
        <details className="group border-t border-oa-border">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-[14px] font-medium text-oa-fg transition-colors hover:bg-oa-accent sm:px-5 [&::-webkit-details-marker]:hidden ${FOCUS}`}
          >
            <span>
              <span className="group-open:hidden">Show the other {fold.length} things the agent looked at</span>
              <span className="hidden group-open:inline">Everything else the agent looked at</span>
            </span>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="shrink-0 text-oa-muted-fg transition-transform group-open:rotate-180">
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className="scrollbar-hide max-h-[31rem] divide-y divide-oa-border overflow-y-auto overscroll-contain border-t border-oa-border">
            {fold.map((row) => (
              <FoldItem key={row.key} row={row} />
            ))}
          </ul>
        </details>
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
  // Each lead finding already carries its own question; the box offers the others.
  const skip = lead.map((item) => askFor(item, mode)?.question).filter((question): question is string => Boolean(question));
  const questions = pickQuestions({
    lead: [],
    rest: noticed.filter((item) => !leadIds.has(item.id)),
    sources,
    mode,
    skip,
  });
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
  // A check that explains a lead finding is shown on that finding; the log keeps the rest.
  const { lead } = prioritise(focusNoticed(sources, mode), { ...sources, goal }, mode);
  const omit = foldedCheckIds(lead, dataChecks({ ...sources, goal }, mode, today));
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
