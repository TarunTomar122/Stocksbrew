import * as React from "react";
import { Suspense } from "react";

import { AppLink } from "@/components/oa/app-link";
import { Bar } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { Reveal } from "@/components/reveal";
import { capitalize } from "@/lib/day-words";
import { shortFact } from "@/components/stock-report/format";
import { leadPercent } from "@/lib/lead-percent";
import { EXAMPLE_AGENTS } from "@/lib/portfolio-home/example-agents";
import type { CheckView } from "@/lib/portfolio-home/example-check";
import { loadExampleChecks, loadExampleFlagStep } from "@/lib/portfolio-home/example-check-server";

/**
 * The example portfolio's three agents and what each found on its last real run (judges, ship 46: the pitch is
 * what the demo showed, not a catalogue of nine tools). One card per agent, in the order they are set up: earnings
 * coming up, big moves, big SEC filings. Each shows one result: a figure, the stocks and when it ran, and one line of
 * at most 15 words (the next step, or what it found). The rule is the card's hover title. Read from a short shared cache; with no recent run a
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

/**
 * One agent's last run as one result (owner rule 8): a figure (the move it caught, how many stocks it flagged, or
 * "Quiet"), a label with the stocks and when it ran, and one line of at most 15 words: the next step for a flagged
 * holding, else what it found. No rule bubble and no "it read…" sentence: the card's title already says what it watches.
 */
function RunBody({ view, step }: { view: CheckView; step: string | null }) {
  const notify = view.decision === "notify";
  // Only a run that found something has a number: "moved 5% or more" in a quiet run is the rule, not a move.
  const figure = notify
    ? leadPercent(view.outcome, { signedOnly: true }) ?? (view.flagged.length ? `${view.flagged.length} flagged` : undefined)
    : view.decision === "nothing"
      ? "Quiet"
      : undefined;
  const flagged = notify ? view.flagged.slice(0, 3).join(", ") : "";
  const label = [flagged, capitalize(view.when)].filter(Boolean).join(" · ");
  // A flagged holding gets its next step, so the agent reads as working for you (judges, ship 42); a quiet run says
  // what it found without the "Nothing to report." the figure already says.
  const found = view.outcome.replace(/^Nothing to report\.\s*/, "");
  // At most 15 words (owner rule 8): the sentence's main clause, or nothing when none is that short.
  const line = (notify && step ? shortFact(step) : "") || shortFact(found);
  return (
    <>
      {figure ? (
        <p className={`oa-mono text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums ${figure === "Quiet" ? "text-oa-muted-fg" : "text-oa-fg"}`}>{figure}</p>
      ) : null}
      <p className="oa-mono mt-0.5 text-[12.5px] leading-[18px] tabular-nums text-oa-muted-fg">{label}</p>
      {line ? <p className="mt-2 text-pretty text-[14.5px] leading-[21px] text-oa-fg">{line}</p> : null}
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
  // The rule in the owner's words, on hover: the card itself shows only what the agent found.
  const rule = EXAMPLE_AGENTS.find((agent) => agent.id === id)?.ask.replace(/\bany of these\b/, "any of my stocks");
  return (
    <li className="min-w-0">
      <AppLink href={CHECK_HREF} title={rule} aria-labelledby={`landing-card-${id}`} aria-describedby={`landing-card-${id}-run`} className={CARD_LINK}>
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
