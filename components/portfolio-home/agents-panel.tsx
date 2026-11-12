import Link from "next/link";
import { Suspense } from "react";

import { AGENT_LIST, AgentFoot, AgentRow } from "@/components/agent-watch/agent-rows";
import { WATCH_LINK, WATCH_LIST, WouldWatchRow } from "@/components/agent-watch/watch-list";
import { Bar } from "@/components/oa/kit/skeleton";
import { describeWatch, nextCheckWords } from "@/lib/agent-watch";
import { newYorkToday } from "@/lib/portfolio-data";
import { agentLines, type AgentLine } from "@/lib/portfolio-home/agent-lines";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import { focusNoticed, prioritise } from "@/lib/portfolio-home/focus";
import { watchPlan } from "@/lib/portfolio-home/loop";
import { feedSources, type HomeLoad } from "@/lib/portfolio-home/server";
import type { Verdict } from "@/lib/thesis-watch/rules";

/**
 * "Your agents" on My stocks, in the side rail: one compact row per agent (its kind, a short name, what the last run
 * came to and when, and the stocks it flagged as chips), opening the agent on /agents where what it checked lives.
 * The reason watcher is one more row when the person gave reasons. Signed out, the example portfolio's own agents
 * with their real latest runs; signed in with none, the watches the person's stocks would want. It waits only for the
 * person's agents (one small read with its own time limit) and, without them, the example's cached runs.
 */

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg";

const EXAMPLE_TAG = (
  <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
    Example
  </span>
);

function Head({ children, manage = false }: { children: React.ReactNode; manage?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
      <h2 id="agents-head" className={H2}>
        {children}
      </h2>
      {manage ? (
        <Link href="/agents" prefetch={false} className={`shrink-0 text-[13px] ${WATCH_LINK}`}>
          Manage
        </Link>
      ) : null}
    </div>
  );
}

const VERDICT_CHIP: Record<Verdict, { figure: string; tone: "up" | "down" | null }> = {
  holds: { figure: "holds", tone: null },
  weaker: { figure: "weaker", tone: "down" },
  broken: { figure: "broken", tone: "down" },
  played_out: { figure: "played out", tone: null },
};

/** The reason watcher as one more row, from the same checks the stock cards read. */
async function ReasonRow({ load, showDay }: { load: HomeLoad; showDay: boolean }) {
  const reasons = await load.sources.reasons;
  if (!reasons || reasons.state !== "ready" || reasons.value.checks.length === 0) return null;
  const checks = reasons.value.checks;
  const days = checks.map((check) => check.asOf?.slice(0, 10) ?? "").filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  const off = checks.filter((check) => check.verdict !== "holds");
  const line: AgentLine = {
    id: "reasons",
    href: "/portfolio?tab=holdings&reasons=1",
    kind: "reasons",
    name: "Your reasons",
    rule: "Checks the reasons you gave for owning your stocks.",
    status: off.length > 0 ? "flagged" : "quiet",
    figure: off.length > 0 ? `${off.length} flagged` : checks.length === 1 ? "holds" : "all hold",
    day: days[days.length - 1] ?? null,
    chips: off.slice(0, 3).map((check) => ({ ticker: check.ticker, ...VERDICT_CHIP[check.verdict] })),
    more: Math.max(0, off.length - 3),
  };
  return <AgentRow line={line} showDay={showDay} />;
}

/** The watches the person's stocks would want, from the findings on their holdings; none when nothing calls for one. */
async function WouldWatchRows({ load, mine }: { load: HomeLoad; mine: boolean }) {
  const [{ mode }, sources, goal] = await Promise.all([load.context, feedSources(load), load.sources.goal]);
  const lead = prioritise(focusNoticed(sources, mode), { ...sources, goal }, mode).lead;
  const plans = lead
    .map((item) => watchPlan(item, mine ? "mine" : "example"))
    .filter((plan): plan is Extract<NonNullable<ReturnType<typeof watchPlan>>, { kind: "agent" }> => plan?.kind === "agent");
  if (plans.length === 0) return null;
  return (
    <ul className={`${WATCH_LIST} border-t border-oa-border`}>
      {plans.map((plan) => (
        <WouldWatchRow key={plan.href} request={plan.request} href={plan.href} />
      ))}
    </ul>
  );
}

export async function AgentsPanel({ load }: { load: HomeLoad }) {
  const [{ mode, viewer }, agents] = await Promise.all([load.context, load.agents]);
  const today = newYorkToday();
  const signedIn = Boolean(viewer.uid);
  const mine = mode === "mine";

  if (signedIn && (agents.state === "slow" || agents.state === "failed")) {
    return (
      <section aria-labelledby="agents-head" className={CARD}>
        <Head>Your agents</Head>
        <p className="px-4 pb-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">We could not read your agents just now. Reload in a minute.</p>
        {mine ? (
          <ul className="border-t border-oa-border empty:hidden">
            <Suspense fallback={null}>
              <ReasonRow load={load} showDay />
            </Suspense>
          </ul>
        ) : null}
      </section>
    );
  }

  const own = signedIn && agents.state === "ready" && agents.value.jobs.length > 0 ? agents.value : null;
  if (own) {
    const { lines, paused, sharedDay, ownTimes, sharedTime, next } = agentLines(own, today, { describe: describeWatch });
    return (
      <section aria-labelledby="agents-head" className={CARD}>
        <Head manage>Your agents</Head>
        {lines.length === 0 ? (
          <p className="px-4 pb-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
            {paused === 1 ? "Your one agent is paused, so nothing is being checked." : `All ${paused} of your agents are paused, so nothing is being checked.`}
          </p>
        ) : (
          <>
            <ul className={AGENT_LIST}>
              {lines.map((line) => (
                <AgentRow key={line.id} line={line} showDay={!sharedDay} showTime={ownTimes && Boolean(sharedDay)} />
              ))}
              {mine ? (
                <Suspense fallback={null}>
                  <ReasonRow load={load} showDay />
                </Suspense>
              ) : null}
            </ul>
            <AgentFoot sharedDay={sharedDay} nextWords={next ? nextCheckWords(next, today) : null} paused={paused} ownTimes={ownTimes} sharedTime={sharedTime} count={lines.length} />
          </>
        )}
      </section>
    );
  }

  // Signed out: the example's own agents, with what their latest real runs found. They open the agents page.
  const example = !signedIn ? await loadExampleAgentsSource() : null;
  if (example) {
    const { lines, sharedDay, ownTimes, sharedTime, next } = agentLines(example, today, { hrefFor: () => "/agents" });
    return (
      <section aria-labelledby="agents-head" className={CARD}>
        <Head>
          {/* The tag already says whose: "[Example] Agents", not "the example's agents". */}
          {EXAMPLE_TAG}
          Agents
        </Head>
        <ul className={AGENT_LIST}>
          {lines.map((line) => (
            <AgentRow key={line.id} line={line} showDay={!sharedDay} showTime={ownTimes && Boolean(sharedDay)} />
          ))}
        </ul>
        <AgentFoot sharedDay={sharedDay} nextWords={next ? nextCheckWords(next, today) : null} paused={0} ownTimes={ownTimes} sharedTime={sharedTime} count={lines.length} />
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
      <Head>Your agents</Head>
      <p className="px-4 pb-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
        {signedIn ? "You have no agents yet. " : null}An agent checks your stocks after every market close and tells you when one needs you.{" "}
        <Link href="/agents" prefetch={false} className={WATCH_LINK}>
          Set one up
        </Link>
      </p>
      {mine ? (
        <ul className="border-t border-oa-border empty:hidden">
          <Suspense fallback={null}>
            <ReasonRow load={load} showDay />
          </Suspense>
        </ul>
      ) : null}
      <Suspense fallback={null}>
        <WouldWatchRows load={load} mine={mine} />
      </Suspense>
    </section>
  );
}

export function AgentsPanelGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3`}>
      <Bar className="h-4 w-28" />
      {[0, 1, 2].map((row) => (
        <div key={row} className="mt-3.5 flex items-center gap-2.5">
          <Bar className="size-4" />
          <Bar className="h-3.5 flex-1" />
          <Bar className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
