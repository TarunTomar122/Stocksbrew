import * as React from "react";
import { Suspense } from "react";

import { AgentLog, AgentLogGhost } from "@/components/agent-log/agent-log";
import { Disclosure } from "@/components/oa/disclosure";
import { Bar } from "@/components/oa/kit/skeleton";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { OaHeroSearch } from "@/components/oa/oa-hero-search";
import { SquircleSurface } from "@/components/oa/squircle";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  CALL_COVERAGE,
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
} from "@/lib/brand-copy";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { limitFor } from "@/lib/entitlements";
import { countWord } from "@/lib/plain-copy";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/landing-data";

import { AgentDoes } from "./landing/agent-does";
import { HeroBriefing } from "./landing/hero-briefing";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, SectionHead } from "./landing/shared";
import { TodayMoves } from "./landing/today-moves";
import Link from "next/link";

// Folded, all closed: the page proves its points above and answers the rest here. The founder note is the last answer.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is stocksbrew?",
    a: "A research site that follows US stocks for you. Every market day it reads the filings, earnings reports and news, says why each stock moved and what we would do with it: buy more, keep or sell some.",
  },
  {
    q: "Does it trade for me or hold my money?",
    a: "No. stocksbrew never connects to a brokerage, and it cannot place trades or move money. You read the research and act wherever you already invest.",
  },
  {
    q: "Where does the information come from, and who writes it?",
    a: "Prices, financials and filings come from public sources, and headlines link to the original. The explanations and calls are written by AI from those numbers and that news, and a move only gets a reason when a source backs it.",
  },
  {
    q: "Is this investment advice?",
    a: "No. stocksbrew is research for your own decisions. It is not a broker or an adviser.",
  },
  {
    q: "Who makes stocksbrew?",
    a: (
      <>
        One person. Following a company used to mean reopening the same tabs every day, and most days nothing had changed. So I
        built the thing I wanted: it does the reading and speaks up only when it has something to say, with the source next to
        it. If a page is confusing or a fact looks wrong,{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
          tell me
        </a>
        . I read every message.{" "}
        <Link prefetch={false} href="/about" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
          More about me
        </Link>{" "}
        and{" "}
        <Link prefetch={false} href="/docs" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
          how the research is made
        </Link>
        .
      </>
    ),
  },
];

export async function OaLanding() {
  const user = await getLandingUserContext();

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader variant="marketing" />

      <div className={FRAME}>
        {/* hero: tighter on a phone so today's briefing card (the stock, its move, our call, the watch button) is on the first screen */}
        <section className="grid grid-cols-1 items-center gap-5 pb-4 pt-5 sm:gap-14 sm:pt-16 lg:pt-20 lg:grid-cols-[1fr_1fr]">
          <div>
            <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[1.875rem] leading-[1.1] sm:text-[3.5rem] sm:leading-[1.05]">
              {HERO_HEADLINE_LEAD}{" "}
              <span className="text-oa-muted-fg">{HERO_HEADLINE_EMPHASIS}</span>
            </h1>
            <p className="text-pretty mt-3 max-w-lg text-[15px] leading-6 text-oa-fg/85 sm:mt-5 sm:text-[17px] sm:leading-7">
              {HERO_SUBHEAD}
            </p>
            <div className="mt-4 sm:mt-8">
              <OaHeroSearch source="hero" />
            </div>
            {user.signedIn ? null : <p className="mt-2 text-[14px] leading-5 text-oa-muted-fg sm:mt-3 sm:text-base">{HERO_FOOTNOTE}</p>}
          </div>
          <div className="flex justify-center lg:justify-end">
            <Suspense fallback={<HeroBriefingGhost />}>
              <HeroBriefing />
            </Suspense>
          </div>
        </section>

        {/* Under the hero: the work the agent did across the market today, from the jobs' own records. Nothing at all
            when there is no log yet, so no empty box. */}
        <Suspense fallback={<AgentLogGhost compact className="mt-4 sm:mt-10" />}>
          <AgentLog compact className="mt-4 sm:mt-10" />
        </Suspense>

        {/* one story below the hero: short proofs with real data, one link each, then the questions folded */}
        <div className="flex flex-col gap-14 pb-12 pt-10 sm:gap-20 sm:pb-20 sm:pt-14">
          {/* Renders its own head, and nothing at all on a day with no confirmed reason yet (no empty strip). */}
          <Suspense fallback={null}>
            <TodayMoves />
          </Suspense>

          <section id="portfolio" className="scroll-mt-24">
            <SectionHead
              title="What we'd do with each stock you own."
              lede="Add your stocks and we tell you, for each one, whether we'd buy more, keep it or sell some, and why. There is no broker login, so nothing here can touch your money."
              href="/watchlist"
              hrefLabel="Add your stocks"
            />
            <Suspense fallback={<div className="oa-surface h-80 animate-pulse border border-oa-border bg-oa-card motion-reduce:animate-none" aria-hidden="true" />}>
              <OnePlace />
            </Suspense>
          </section>

          {/* the rest of what it does, each with one live finding from the example portfolio; every finding streams in on its own */}
          <section id="what-it-does" className="scroll-mt-24">
            <SectionHead
              title="Everything it watches for you."
              lede="Each finding below comes from an example portfolio and live data. Add your stocks and it does the same for yours."
              href="/portfolio"
              hrefLabel="See the example portfolio"
            />
            <AgentDoes />
          </section>

          {/* plans: hidden once you already subscribe */}
          {!user.isSubscribed ? (
            <section id="pricing" className="scroll-mt-24">
              <SectionHead
                title={`Our call on ${CALL_COVERAGE} is free. Pro adds the full report on all of them.`}
                lede={`A free account also gets the full report on ${countWord(limitFor("covered_stocks", "free"))} stocks you pick: why we made the call, and the prices where we'd buy more or sell some.`}
                href="/pricing"
                hrefLabel="Compare the plans"
              />
              <Reveal>
                <PlansSection trialEligible={(await getViewer()).trialEligible} />
              </Reveal>
            </section>
          ) : null}

          <section id="faq" className="scroll-mt-24">
            <h2 className="text-[20px] font-medium tracking-tight text-oa-fg">Questions</h2>
            <div className="mt-3 max-w-3xl">
              {FAQS.map((item) => (
                <Disclosure key={item.q} question={item.q}>
                  {item.a}
                </Disclosure>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}


/** The hero card's shape while today's briefing loads: same frame and rows, so nothing jumps when it arrives. */
function HeroBriefingGhost() {
  return (
    <div className="w-full" aria-hidden="true">
      <SquircleSurface className="border border-oa-border p-1">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-2.5">
          <Bar className="h-4 w-36" />
          <Bar className="h-6 w-20 rounded-full" />
        </div>
        <div className="oa-surface border border-oa-border bg-oa-card p-4">
          <div className="flex items-center gap-2">
            <Bar className="size-7 rounded-full" />
            <Bar className="h-4 w-40" />
          </div>
          <Bar className="mt-4 h-9 w-44" />
          <Bar className="mt-3 h-4 w-32" />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-oa-border pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <Bar className="h-3.5 w-20" />
                <Bar className="mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
          <Bar className="mt-5 h-14 w-full" />
        </div>
        <div className="oa-surface mt-1 border border-oa-border bg-oa-card p-4">
          <Bar className="h-3.5 w-24" />
          <Bar className="mt-2 h-4 w-3/4" />
        </div>
      </SquircleSurface>
    </div>
  );
}
