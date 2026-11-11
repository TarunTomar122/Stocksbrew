import Link from "next/link";
import { Suspense } from "react";

import { WATCH_FOCUS, WATCH_LINK, WATCH_LIST, WatchRow, WouldWatchRow } from "@/components/agent-watch/watch-list";
import { Bar } from "@/components/oa/kit/skeleton";
import { CheckDetail, CheckDisclosure, didWhen, ExampleChecks, tickerList } from "@/components/portfolio-home/example-check";
import { activeWatches } from "@/lib/agent-watch";
import { fmtPlanDay } from "@/lib/dividend-plan";
import { newYorkToday } from "@/lib/portfolio-data";
import { focusNoticed, prioritise, type Lead } from "@/lib/portfolio-home/focus";
import { ownCheckView } from "@/lib/portfolio-home/example-check";
import { loadExampleChecks } from "@/lib/portfolio-home/example-check-server";
import { watchPlan } from "@/lib/portfolio-home/loop";
import { feedSources, type HomeLoad } from "@/lib/portfolio-home/server";
import { countWord } from "@/lib/read-format";
import type { Verdict } from "@/lib/thesis-watch/rules";

/**
 * "Your agents" on the My stocks overview: every active watch in one row, with
 * its last check, what it found and its next check (lib/agent-watch.ts); a row
 * that has run opens to the whole check (what it examined, the evidence, what
 * it decided, its next run, Ask about it, change it: ./example-check.tsx), and
 * the reason watcher when the person gave reasons. With no agents: signed out,
 * the example portfolio's own agents with their latest real check in full
 * (./example-check.tsx); signed in, that check under "You have no agents
 * yet", then the watches the findings below would set up. When the example
 * agents have not run lately, the example's would-watch list instead, never a
 * made-up check. It waits only for the person's agents and the example's runs
 * (small reads with their own time limits); the reason row and the links to
 * the findings stream in after them.
 */

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg sm:text-[17px] sm:leading-6";
/** On a phone the panel comes first (its ghost too, so nothing jumps), so the ongoing work sits above the findings. */
const PHONE_FIRST = "order-first lg:order-none";

/** The anchor of a finding card on this page (components/portfolio-home/home.tsx uses the same). */
export function findingSlug(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);
}

async function leadFindings(load: HomeLoad): Promise<Lead[]> {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  return prioritise(focusNoticed(sources, mode), { ...sources, goal }, mode).lead;
}

/** Under a watch that flagged a stock: a link to that stock's finding on this page, when there is one. */
async function FindingAnchor({ lead: leadPromise, tickers }: { lead: Promise<Lead[]>; tickers: string[] }) {
  const lead = await leadPromise;
  const item = lead.find((finding) => finding.ticker && tickers.includes(finding.ticker.toUpperCase()));
  if (!item?.ticker) return null;
  return (
    <a href={`#finding-${findingSlug(item.id)}`} className={`mt-0.5 inline-block text-[12.5px] leading-[17px] ${WATCH_LINK}`}>
      Go to the {item.ticker} finding
    </a>
  );
}

const VERDICT_WORDS: Record<Verdict, string> = { holds: "still holds", weaker: "is weaker", broken: "no longer holds", played_out: "has played out" };

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length <= 3) return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  return `${items.slice(0, 3).join(", ")} and ${items.length - 3} more`;
}

/** The reason watcher as one more watch, from the same checks the findings read. No next check: its runs are not logged. */
async function ReasonWatchRow({ load }: { load: HomeLoad }) {
  const reasons = await load.sources.reasons;
  if (!reasons || reasons.state !== "ready" || reasons.value.checks.length === 0) return null;
  const checks = reasons.value.checks;
  const days = checks.map((check) => check.asOf).filter((day) => /^\d{4}-\d{2}-\d{2}/.test(day ?? "")).sort();
  const day = days[days.length - 1];
  const off = checks.filter((check) => check.verdict !== "holds");
  const n = checks.length;
  const outcome =
    off.length === 0
      ? n === 1
        ? "It still holds."
        : n === 2
          ? "Both still hold."
          : `All ${countWord(n).toLowerCase()} still hold.`
      : `${listWords(off.map((check) => `${check.ticker}'s reason ${VERDICT_WORDS[check.verdict]}`))}.`;
  const what = `Checks the ${n === 1 ? "reason" : "reasons"} you gave for owning ${listWords(checks.map((check) => check.ticker))}.`;
  return (
    <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5 leading-[18px]">
      <span role="img" aria-label={off.length > 0 ? "Found something" : "Nothing to report"} className={`mt-[5px] inline-block size-2 shrink-0 rounded-full ${off.length > 0 ? "bg-oa-primary" : "border border-oa-muted-fg"}`} />
      <div className="min-w-0">
        <Link href="/watchlist?reasons=1" prefetch={false} className={`block rounded text-pretty text-[13.5px] leading-[18px] text-oa-fg hover:underline ${WATCH_FOCUS}`}>
          {what}
        </Link>
        <p className="mt-0.5 text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">
          {day ? (
            <>
              <span className="oa-mono whitespace-nowrap text-[12px] tabular-nums">{fmtPlanDay(day.slice(0, 10))}</span>
              {": "}
            </>
          ) : null}
          <span className={off.length > 0 ? "text-oa-fg" : undefined}>{outcome}</span>
        </p>
      </div>
    </li>
  );
}

/** The watches the lead findings would set up, or none. */
async function WouldWatchRows({ load, mine }: { load: HomeLoad; mine: boolean }) {
  const lead = await leadFindings(load);
  const plans = lead
    .map((item) => watchPlan(item, mine ? "mine" : "example"))
    .filter((plan): plan is Extract<NonNullable<ReturnType<typeof watchPlan>>, { kind: "agent" }> => plan?.kind === "agent");
  if (plans.length === 0) return null;
  return (
    <>
      <p className="px-4 pb-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
        {mine ? "These would keep watching what your findings turned up:" : "These would keep watching what the example's findings turned up:"}
      </p>
      <ul className={`${WATCH_LIST} border-t border-oa-border`}>
        {plans.map((plan) => (
          <WouldWatchRow key={plan.href} request={plan.request} href={plan.href} />
        ))}
      </ul>
    </>
  );
}

function WouldWatchGhost() {
  return (
    <div aria-hidden="true" className="border-t border-oa-border px-4 py-3">
      <Bar className="h-3.5 w-full" />
      <Bar className="mt-3 h-3.5 w-4/5" />
    </div>
  );
}

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
    Example
  </span>
);

export async function AgentsPanel({ load }: { load: HomeLoad }) {
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const today = newYorkToday();
  const signedIn = Boolean(viewer.uid);
  const mine = mode === "mine";

  if (signedIn && (agents.state === "slow" || agents.state === "failed")) {
    return (
      <section aria-labelledby="agents-head" className={`${CARD} ${PHONE_FIRST} px-4 py-3.5`}>
        <h2 id="agents-head" className={H2}>
          Your agents
        </h2>
        <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">We could not read your agents just now. Reload in a minute.</p>
        {mine ? (
          <ul className="-mx-4 -mb-3.5 mt-2.5 border-t border-oa-border empty:hidden">
            <Suspense fallback={null}>
              <ReasonWatchRow load={load} />
            </Suspense>
          </ul>
        ) : null}
      </section>
    );
  }

  const own = signedIn && agents.state === "ready" && agents.value.jobs.length > 0 ? agents.value : null;
  if (own) {
    const { rows, paused } = activeWatches(own, today);
    // Worked out once for every row that flagged a stock, and only when one did.
    const lead = mine && rows.some((row) => (row.last?.tickers.length ?? 0) > 0) ? leadFindings(load) : null;
    return (
      <section aria-labelledby="agents-head" className={`${CARD} ${PHONE_FIRST}`}>
        <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5">
          <h2 id="agents-head" className={H2}>
            Your agents
          </h2>
          <Link href="/agents" prefetch={false} className={`shrink-0 text-[13px] ${WATCH_LINK}`}>
            Manage
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 pb-1 pt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
            {paused === 1 ? "Your one agent is paused, so nothing is being checked." : `All ${countWord(paused).toLowerCase()} of your agents are paused, so nothing is being checked.`}
          </p>
        ) : null}
        <ul className={`${WATCH_LIST} mt-1.5`}>
          {rows.map((row) => {
            const extra =
              lead && row.last && row.last.tickers.length > 0 ? (
                <Suspense fallback={null}>
                  <FindingAnchor lead={lead} tickers={row.last.tickers} />
                </Suspense>
              ) : null;
            // A check that has run opens to what it examined, what it found and its next run; one not run yet stays a row.
            const job = own.jobs.find((entry) => entry.id === row.id);
            const view = job ? ownCheckView(job, own.runs, today) : null;
            return view ? (
              <CheckDisclosure key={row.id} view={view} today={today} audience="mine" extra={extra} />
            ) : (
              <WatchRow key={row.id} row={row} today={today} extra={extra} />
            );
          })}
          {mine ? (
            <Suspense fallback={null}>
              <ReasonWatchRow load={load} />
            </Suspense>
          ) : null}
        </ul>
        {rows.length > 0 && paused > 0 ? (
          <p className="border-t border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
            {paused === 1 ? "One more is paused." : `${countWord(paused)} more are paused.`}
          </p>
        ) : null}
      </section>
    );
  }

  // No agents of their own. Signed out, or with no holdings marked, the page is about the example, so this shows what
  // the example's own agents really checked (their runs, lib/portfolio-home/example-check.ts); with nothing run lately,
  // what the example's findings would watch. A suggestion, not a status: on a phone it follows the findings.
  const example = !mine;
  const checks = await loadExampleChecks();
  if (!signedIn && checks) {
    return (
      <section aria-labelledby="agents-head" className={CARD}>
        <ExampleChecks
          checks={checks}
          today={today}
          head={
            <h2 id="agents-head" className={H2}>
              {EXAMPLE_TAG}
              What an agent did {didWhen(checks.featured)}
            </h2>
          }
        />
        <p className="border-t border-oa-border px-4 py-2.5 text-[13.5px] leading-5">
          <Link href="/agents" prefetch={false} className={WATCH_LINK}>
            Set one up for your stocks
          </Link>
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="agents-head" className={CARD}>
      <div className="px-4 pb-2 pt-3.5">
        <h2 id="agents-head" className={H2}>
          {example && !signedIn ? (
            <>
              {EXAMPLE_TAG}
              What the example would watch
            </>
          ) : (
            "Your agents"
          )}
        </h2>
        <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {signedIn && checks
            ? `You have no agents yet. Here's what an agent did ${didWhen(checks.featured)} for the example portfolio, which holds ${tickerList(checks.tickers)}.`
            : example && !signedIn
              ? "An agent checks your stocks after every market close and tells you only when something needs you."
              : "You have no agents yet. An agent checks your stocks after every market close and tells you only when something needs you."}
        </p>
      </div>
      {signedIn && checks ? (
        <div className="px-4 pb-3">
          <CheckDetail view={checks.featured} today={today} audience="example" />
        </div>
      ) : null}
      {mine ? (
        <ul className="border-t border-oa-border empty:hidden">
          <Suspense fallback={null}>
            <ReasonWatchRow load={load} />
          </Suspense>
        </ul>
      ) : null}
      {/* The example's would-watch list only stands in when there is no real example check to show. */}
      {mine || !checks ? (
        <Suspense fallback={<WouldWatchGhost />}>
          <WouldWatchRows load={load} mine={mine} />
        </Suspense>
      ) : null}
      <p className="border-t border-oa-border px-4 py-2.5 text-[13.5px] leading-5">
        <Link href="/agents" prefetch={false} className={WATCH_LINK}>
          Set one up
        </Link>
      </p>
    </section>
  );
}

export function AgentsPanelGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} ${PHONE_FIRST} px-4 py-3.5`}>
      <Bar className="h-4 w-32" />
      {[0, 1].map((row) => (
        <div key={row} className="mt-3.5">
          <Bar className="h-3.5 w-full" />
          <Bar className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
