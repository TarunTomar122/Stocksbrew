import Link from "next/link";
import { Suspense } from "react";

import { fmtDay, fmtStampET } from "@/components/oa/kit";
import { Bar } from "@/components/oa/kit/skeleton";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { countWord } from "@/lib/read-format";
import { newYorkToday } from "@/lib/portfolio-data";
import { focusHeadline, focusNoticed, prioritise, type FoldRow, type Lead } from "@/lib/portfolio-home/focus";
import { buildAgentLog, type LogRow } from "@/lib/portfolio-home/log";
import { pickQuestions } from "@/lib/portfolio-home/questions";
import { feedSources, type ExampleReason, type HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The My stocks overview, laid out as an agent reporting to the person: the
 * two or three changes that need them (each with one next step) and one fold
 * with everything else; an Ask box with questions drawn from their holdings;
 * and a dated log of what the agent checked and what is coming up. Each part
 * waits only for the sources it reads (lib/portfolio-home/server.ts).
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
    <div className="mb-3 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between sm:px-0">
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

function LeadRow({ item }: { item: Lead }) {
  const watch = item.action.kind === "watch";
  return (
    <li
      data-track-links="insight_clicked"
      data-track-insight-id={item.id.slice(0, 80)}
      data-track-insight-kind={`home-${item.tool}`}
      data-track-tone={item.tone}
      className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 sm:gap-x-4 sm:px-5"
    >
      <ToneGlyph tone={item.tone} className="mt-[5px]" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-oa-muted-fg">
          {item.ticker ? (
            <>
              <StockLogo ticker={item.ticker} size={18} eager />
              <span className="oa-mono font-medium tabular-nums text-oa-fg">{item.ticker}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          {/* When the step is an agent request, the caption is the way to the evidence; otherwise the step already goes there. */}
          {watch ? (
            <Link href={item.open.href} prefetch={false} data-track-target="evidence" className={`truncate hover:text-oa-fg hover:underline ${FOCUS} rounded`}>
              {item.caption}
            </Link>
          ) : (
            <span className="truncate">{item.caption}</span>
          )}
        </div>
        <p className="mt-1 text-pretty text-[15px] leading-[22px] text-oa-fg">{item.text}</p>
        {item.evidence ? <p className="mt-1 text-pretty text-[13px] leading-[19px] text-oa-muted-fg">{item.evidence}</p> : null}
        <Link
          href={item.action.href}
          prefetch={false}
          data-track-target={watch ? "watch" : "action"}
          title={watch ? "We read it back to you on the agents page before anything is saved." : undefined}
          className={`mt-2.5 inline-flex min-h-9 max-w-full items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] px-3 py-1.5 text-left text-[13.5px] font-medium leading-[18px] text-oa-primary transition-colors hover:bg-[color-mix(in_srgb,var(--oa-primary)_8%,transparent)] ${FOCUS}`}
        >
          {item.action.label}
        </Link>
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
            <LeadRow key={item.id} item={item} />
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
      {slow + failed > 0 && noticed.length > 0 ? (
        <p className="border-t border-oa-border px-4 py-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-5">{leftOutWords(slow, failed)}</p>
      ) : null}
    </section>
  );
}

export function FocusGhost() {
  return (
    <div aria-hidden="true" className={CARD}>
      <div className="border-b border-oa-border px-4 py-3.5 sm:px-5">
        <Bar className="h-4 w-64" />
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="border-b border-oa-border px-4 py-4 sm:px-5">
          <Bar className="h-3 w-28" />
          <Bar className="mt-2.5 h-4 w-full max-w-[34rem]" />
          <Bar className="mt-2 h-3 w-3/4 max-w-[28rem]" />
          <Bar className="mt-3 h-8 w-48" />
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
  const questions = pickQuestions({ lead, rest: noticed.filter((item) => !leadIds.has(item.id)), sources, mode });
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
  const grid = "grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5";
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
  const [{ mode }, memo, reasons, season, dividends, goal, agents] = await Promise.all([
    load.context,
    load.sources.memo,
    load.sources.reasons,
    load.sources.season,
    load.sources.dividends,
    load.sources.goal,
    load.agents,
  ]);
  const mine = mode === "mine";
  const log = buildAgentLog({ sources: { memo, reasons, season, dividends, goal }, agents, mode, today: newYorkToday() });
  const waiting = [memo, reasons, season, goal].some((source) => source?.state === "slow" || source?.state === "failed");
  return (
    <section aria-labelledby="log-head" className={CARD}>
      <h2 id="log-head" className={`${H2} px-4 pt-3.5`}>
        {mine ? "What your agent checked" : "What the agent checked"}
      </h2>
      {log.checked.length > 0 ? (
        <ol className={`${LIST} mt-1.5`}>
          {log.checked.map((row) => (
            <LogItem key={row.id} row={row} upcoming={false} />
          ))}
        </ol>
      ) : (
        <p className="px-4 pb-3 pt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {waiting ? "No check has come back yet. Reload in a minute." : "Nothing has been checked yet."}
        </p>
      )}
      {log.next.length > 0 ? (
        <>
          <h3 className="border-t border-oa-border px-4 pt-3 text-[14.5px] font-semibold leading-5 text-oa-fg">Coming up</h3>
          <ol className={`${LIST} mt-1`}>
            {log.next.map((row) => (
              <LogItem key={row.id} row={row} upcoming />
            ))}
          </ol>
        </>
      ) : null}
      {mine && log.hasAgents === false ? (
        <p className="border-t border-oa-border px-4 py-2.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
          No agent of yours is watching these yet.{" "}
          <Link href="/agents" prefetch={false} className={LINK}>
            Set one up
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

export function AgentLogGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3.5`}>
      <Bar className="h-4 w-48" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="mt-3.5 grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-2.5">
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
