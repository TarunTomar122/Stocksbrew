import * as React from "react";
import { Suspense } from "react";

import { AppLink } from "@/components/oa/app-link";
import { Bar } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { Reveal } from "@/components/reveal";
import { capitalize } from "@/lib/day-words";
import { leadPercent } from "@/lib/lead-percent";
import { EXAMPLE_AGENTS } from "@/lib/portfolio-home/example-agents";
import type { CheckView } from "@/lib/portfolio-home/example-check";
import { loadExampleChecks, loadExampleFlagStep } from "@/lib/portfolio-home/example-check-server";

/**
 * The example portfolio's three agents and what each found on its last real run (judges, ship 46: the pitch is
 * what the demo showed, not a catalogue of nine tools). One card per agent, in the order they are set up: earnings
 * coming up, big moves, big SEC filings. Each says the rule in the owner's words, when it ran, what it found or that
 * there was nothing to report, and the evidence or the next step. Read from a short shared cache; with no recent run a
 * card says only what the agent watches, never a made-up check. The frames are there at once and only the runs
 * stream in, inside a slot that keeps its height.
 */

const AGENT_FACE: Record<string, { title: string; icon: NavIconName }> = {
  exampleearnings: { title: "Earnings coming up", icon: "calendar" },
  examplebigmove: { title: "Big moves", icon: "movers" },
  examplefilings: { title: "Big SEC filings", icon: "filings" },
};

const CHECK_HREF = "/portfolio";

const CARD_LINK =
  "oa-surface flex h-full flex-col border border-oa-border bg-oa-card px-4 py-4 outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:px-5";

function CardHead({ id, title, icon }: { id: string; title: string; icon: NavIconName }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-bg text-oa-primary">
        <NavIcon name={icon} className="size-[18px]" />
      </span>
      <h3 id={`landing-card-${id}`} className="text-[15px] font-medium leading-6 text-oa-fg">
        {title}
      </h3>
    </div>
  );
}

/** The rule as someone would ask for it, about the example's stocks. */
function Ask({ ask }: { ask: string }) {
  return (
    <p className="mb-2 w-fit max-w-full rounded-lg border border-oa-border bg-oa-bg px-2.5 py-1.5 text-pretty text-[14px] leading-5 text-oa-fg">
      <span className="sr-only">The example portfolio&apos;s agent: </span>“{ask.replace(/\bany of these\b/, "any of my stocks")}”
    </p>
  );
}

/** One agent's last run: the figure when it found a move, its rule, when it ran and what it found, then a note. */
function RunBody({ view, step }: { view: CheckView; step: string | null }) {
  const evidence = view.findings[0]?.detail || null;
  // A flagged holding gets its next step (its report and its usual move on one, then our call), so the agent reads as
  // working for you (judges, ship 42); a finding keeps its evidence. A quiet run's "It stayed quiet" would read the
  // same on two cards (owner rule 1).
  const next = step && view.decision === "notify" ? step : null;
  // A quiet run says what it read instead, which differs per agent, so its card is not left half empty (owner rule 4).
  const read = view.checked && !/^Its sources/.test(view.checked) ? `It read ${/^[A-Z][a-z]/.test(view.checked) ? view.checked.charAt(0).toLowerCase() + view.checked.slice(1) : view.checked}` : null;
  const note = next ?? (view.decision === "notify" ? evidence : read);
  // Only a run that found something has a figure: "moved 5% or more" in a quiet run is the rule, not a move.
  const figure = view.decision === "notify" ? leadPercent(view.outcome, { signedOnly: true }) : undefined;
  return (
    <>
      {figure ? <p className="oa-mono mb-1.5 text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums text-oa-fg">{figure}</p> : null}
      <Ask ask={view.ask} />
      <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">
        <span className="oa-mono whitespace-nowrap text-[13px] tabular-nums text-oa-muted-fg">{capitalize(view.when)}</span>
        {": "}
        {view.outcome}
      </p>
      {note ? <p className="mt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{note}</p> : null}
    </>
  );
}

function RunGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 pt-1">
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-11/12" />
      <Bar className="h-4 w-2/3" />
    </div>
  );
}

function AgentCard({ id, children }: { id: string; children: React.ReactNode }) {
  const face = AGENT_FACE[id] ?? { title: "Agent", icon: "alerts" as NavIconName };
  return (
    <li className="min-w-0">
      <AppLink href={CHECK_HREF} aria-labelledby={`landing-card-${id}`} aria-describedby={`landing-card-${id}-run`} className={CARD_LINK}>
        <CardHead id={id} title={face.title} icon={face.icon} />
        <div id={`landing-card-${id}-run`} className="mt-3 min-h-[4.25rem]">
          {children}
        </div>
      </AppLink>
    </li>
  );
}

/** The three cards with their runs, or each agent's rule alone when no run is recent. */
async function AgentCards() {
  const [checks, flag] = await Promise.all([loadExampleChecks(), loadExampleFlagStep().catch(() => null)]);
  const views = checks ? [checks.featured, ...checks.others] : [];
  return (
    <>
      {EXAMPLE_AGENTS.map((agent) => {
        const view = views.find((entry) => entry.id === agent.id) ?? null;
        const step = flag && view?.flagged.includes(flag.ticker) ? flag.step : null;
        return (
          <AgentCard key={agent.id} id={agent.id}>
            {view ? <RunBody view={view} step={step} /> : <Ask ask={agent.ask} />}
          </AgentCard>
        );
      })}
    </>
  );
}

function AgentCardsGhost() {
  return (
    <>
      {EXAMPLE_AGENTS.map((agent) => (
        <AgentCard key={agent.id} id={agent.id}>
          <RunGhost />
        </AgentCard>
      ))}
    </>
  );
}

/** Every card at once, with no "show all" click (owner rule 2): three across, one under another on a phone. */
export function AgentDoes() {
  return (
    <Reveal delay={60}>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Suspense fallback={<AgentCardsGhost />}>
          <AgentCards />
        </Suspense>
      </ul>
    </Reveal>
  );
}
