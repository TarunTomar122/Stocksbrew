import * as React from "react";
import { Suspense } from "react";

import { ShowMore } from "@/components/oa/kit";
import { Bar } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import { iconFor } from "@/components/oa/nav-items";
import { Reveal } from "@/components/reveal";
import { findingWithin, type AgentCardId } from "@/lib/landing-agent-cards";
import { loadExampleChecks } from "@/lib/portfolio-home/example-check-server";
import { AppLink } from "@/components/oa/app-link";
import { nextCheckWords } from "@/lib/agent-watch";
import { newYorkToday } from "@/lib/portfolio-data";

/**
 * "Everything it watches for you": one small card per thing the agent does,
 * each with a live finding from the example portfolio (or the tool's own
 * store) and a link to its page. The frame of every card (icon, title, link)
 * is there at once; only the finding streams in, inside a slot that keeps
 * its height, so nothing on the page moves when it arrives. A finding that is
 * slow or missing becomes a plain line about what the tool does.
 */

type CardDef = {
  id: AgentCardId;
  title: string;
  href: string;
  /** Said when the live finding is not in: what the tool does, with no number. */
  plain: string;
};

const CARDS: CardDef[] = [
  {
    id: "memo",
    title: "Your week, in one memo",
    href: "/portfolio/memo",
    plain: "Every week it writes one memo on how your stocks did and what needs a decision.",
  },
  {
    id: "xray",
    title: "What you really own",
    href: "/portfolio/xray",
    plain: "It opens up your funds and adds up how much of each company you really own.",
  },
  {
    id: "earnings",
    title: "Earnings season",
    href: "/portfolio/earnings",
    plain: "It lists who reports in the next six weeks and which report matters most to you.",
  },
  {
    id: "dividends",
    title: "Dividends",
    href: "/portfolio/dividends",
    plain: "It works out what your stocks should pay you each month for the next year.",
  },
  {
    id: "stress",
    title: "Past crashes",
    href: "/portfolio/stress",
    plain: "It replays past crashes on what you hold today and compares you with the S&P 500.",
  },
  {
    id: "goal",
    title: "A goal",
    href: "/portfolio/goal",
    plain: "It replays thousands of past stretches to show how likely you are to reach a goal in time.",
  },
  {
    id: "copy",
    title: "Copy the smart money, tested",
    href: "/follow/copy",
    plain: "It tests copying each fund and House member from their public filings against the S&P 500.",
  },
  {
    id: "agents",
    title: "Tell your agent what to watch",
    href: "/agents",
    plain: "Write what you want watched in your own words, and an agent emails you when it happens.",
  },
  {
    id: "basket",
    title: "Build a basket in plain words",
    href: "/baskets/new",
    plain: "Describe a kind of company in your own words and get the stocks that fit, with a test against the S&P 500.",
  },
];

const CARDS_BY_ID: Partial<Record<AgentCardId, CardDef>> = Object.fromEntries(CARDS.map((card) => [card.id, card]));

/** Cards shown on a phone before "Show all it does" (the agent check card counts as one). */
const FIRST = 4;

async function Finding({ card }: { card: CardDef }) {
  const found = await findingWithin(card.id);
  if (!found) return <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{card.plain}</p>;
  return (
    <>
      {found.ask ? (
        <p className="mb-2 w-fit max-w-full rounded-lg border border-oa-border bg-oa-bg px-2.5 py-1.5 text-pretty text-[14px] leading-5 text-oa-fg">
          <span className="sr-only">Someone writes: </span>“{found.ask}”
        </p>
      ) : null}
      <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{found.line}</p>
      {found.note ? <p className="mt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{found.note}</p> : null}
    </>
  );
}

/** The finding's shape while it loads: three lines of text, about the height most findings take. */
function FindingGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 pt-1">
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-11/12" />
      <Bar className="h-4 w-2/3" />
    </div>
  );
}

const CARD_LINK =
  "oa-surface flex h-full flex-col border border-oa-border bg-oa-card px-4 py-4 outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:px-5";

function CardHead({ id, href, title }: { id: string; href: string; title: string }) {
  const icon = iconFor(href);
  return (
    <div className="flex items-center gap-2.5">
      {icon ? (
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-bg text-oa-primary">
          <NavIcon name={icon} className="size-[18px]" />
        </span>
      ) : null}
      <h3 id={`landing-card-${id}`} className="text-[15px] font-medium leading-6 text-oa-fg">
        {title}
      </h3>
    </div>
  );
}

function Card({ card }: { card: CardDef }) {
  return (
    <li className="min-w-0">
      <AppLink href={card.href} aria-labelledby={`landing-card-${card.id}`} aria-describedby={`landing-card-${card.id}-finding`} className={CARD_LINK}>
        <CardHead id={card.id} href={card.href} title={card.title} />
        <div id={`landing-card-${card.id}-finding`} className="mt-3 min-h-[4.25rem]">
          <Suspense fallback={<FindingGhost />}>
            <Finding card={card} />
          </Suspense>
        </div>
      </AppLink>
    </li>
  );
}

const CHECK_ID = "agent-check";
const CHECK_HREF = "/portfolio";
const CHECK_TITLE = "What an agent checked";

/**
 * The example portfolio's latest real agent check (lib/portfolio-home/example-check.ts): the rule in the owner's
 * words, when it ran, what it found or that there was nothing to report, and the evidence or its next check. Read
 * from a short shared cache. With no recent run it is the plain "Tell your agent what to watch" card, never a
 * made-up check.
 */
async function AgentCheckCard() {
  const checks = await loadExampleChecks();
  const agents = CARDS_BY_ID.agents;
  if (!checks) return agents ? <Card card={agents} /> : null;
  const view = checks.featured;
  const ask = view.ask.replace(/\bany of these\b/, "any of my stocks");
  const evidence = view.findings[0]?.detail || null;
  const note = evidence ?? `${view.decided}${view.next ? ` It checks again ${nextCheckWords(view.next, newYorkToday())}.` : ""}`;
  return (
    <li className="min-w-0">
      <AppLink href={CHECK_HREF} aria-labelledby={`landing-card-${CHECK_ID}`} aria-describedby={`landing-card-${CHECK_ID}-finding`} className={CARD_LINK}>
        <CardHead id={CHECK_ID} href={CHECK_HREF} title={CHECK_TITLE} />
        <div id={`landing-card-${CHECK_ID}-finding`} className="mt-3 min-h-[4.25rem]">
          <p className="mb-2 w-fit max-w-full rounded-lg border border-oa-border bg-oa-bg px-2.5 py-1.5 text-pretty text-[14px] leading-5 text-oa-fg">
            <span className="sr-only">The example portfolio&apos;s agent: </span>“{ask}”
          </p>
          <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">
            <span className="oa-mono whitespace-nowrap text-[13px] tabular-nums text-oa-muted-fg">{view.when}</span>
            {": "}
            {view.outcome}
          </p>
          {note ? <p className="mt-1.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{note}</p> : null}
        </div>
      </AppLink>
    </li>
  );
}

/** The check card's frame while the run loads, so nothing moves when it arrives. */
function AgentCheckGhost() {
  return (
    <li className="min-w-0" aria-hidden="true">
      <div className={CARD_LINK}>
        <CardHead id={`${CHECK_ID}-ghost`} href={CHECK_HREF} title={CHECK_TITLE} />
        <div className="mt-3 min-h-[4.25rem]">
          <FindingGhost />
        </div>
      </div>
    </li>
  );
}

export function AgentDoes() {
  // The real agent check leads (it stands in for the "agents" card), so a visitor sees the agent at work first.
  const listed = CARDS.filter((card) => card.id !== "agents");
  const first = listed.slice(0, FIRST - 1);
  const rest = listed.slice(FIRST - 1);
  return (
    <Reveal delay={60}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<AgentCheckGhost />}>
          <AgentCheckCard />
        </Suspense>
        {first.map((card) => (
          <Card key={card.id} card={card} />
        ))}
        <li className="min-w-0 sm:col-span-2 lg:contents">
          <ShowMore contents label="Show all it does" less="Show less" className="[&>button]:mt-0">
            <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mb-0 lg:contents">
              {rest.map((card) => (
                <Card key={card.id} card={card} />
              ))}
            </ul>
          </ShowMore>
        </li>
      </ul>
    </Reveal>
  );
}
