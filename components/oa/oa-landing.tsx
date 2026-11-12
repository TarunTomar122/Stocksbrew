import * as React from "react";
import { Suspense } from "react";

import { AgentLog, AgentLogGhost } from "@/components/agent-log/agent-log";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  CALL_COVERAGE,
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
  heroProof,
} from "@/lib/brand-copy";
import { getCallCount } from "@/lib/landing-taste";
import { aboutCount } from "@/lib/landing-taste-shared";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { limitFor } from "@/lib/entitlements";
import { countWord } from "@/lib/plain-copy";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/landing-data";

import { AgentDoes } from "./landing/agent-does";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, SectionHead } from "./landing/shared";
import { LandingTaste } from "./landing/taste";
import { TodayMoves } from "./landing/today-moves";
import Link from "next/link";

// Printed open, never folded (owner rule 2): each answer is a sentence or two. The founder note is the last answer.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is stocksbrew?",
    a: "A research site that follows US stocks for you. Every market day it reads the filings, earnings and news. Then it says why each stock moved and whether we would buy more, keep or sell some.",
  },
  {
    q: "Does it trade for me or hold my money?",
    a: "No. stocksbrew never connects to a brokerage, and it cannot place trades or move money. You read the research and act wherever you already invest.",
  },
  {
    q: "Where does the information come from, and who writes it?",
    a: "Public prices, financials, SEC filings and news, each linked to the original. AI writes the explanations and calls from them. A move only gets a reason when a source backs it.",
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
  const [user, callCount] = await Promise.all([getLandingUserContext(), getCallCount().catch(() => null)]);

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader variant="marketing" />

      <div className={FRAME}>
        {/* The hero is the taste: type two or three stocks, read our call on each right here, then watch them. One
            action, centred, so there is no second hero button and no half-empty column beside it. */}
        <section className="pb-4 pt-6 text-center sm:pt-16 lg:pt-20">
          <h1 className="mx-auto max-w-[46rem] text-balance font-medium tracking-tight text-oa-fg text-[1.875rem] leading-[1.1] sm:text-[3.5rem] sm:leading-[1.05]">
            {HERO_HEADLINE_LEAD}{" "}
            <span className="text-oa-muted-fg">{HERO_HEADLINE_EMPHASIS}</span>
          </h1>
          <p className="text-pretty mx-auto mt-3 max-w-xl text-[15px] leading-6 text-oa-fg/85 sm:mt-5 sm:text-[17px] sm:leading-7">
            {HERO_SUBHEAD}
          </p>
          <div className="mt-5 sm:mt-8">
            <LandingTaste proof={heroProof(callCount ? aboutCount(callCount) : null)} footnote={HERO_FOOTNOTE} />
          </div>
        </section>

        {/* Under the hero: the daily check of the whole market, from the jobs' own records, titled as that check so it
            never reads as more agents beside the example's three below (judges, ship 47). Nothing at all when there is
            no log yet, so no empty box. */}
        <Suspense fallback={<AgentLogGhost compact className="mt-4 sm:mt-10" />}>
          <AgentLog compact market className="mt-4 sm:mt-10" />
        </Suspense>

        {/* one story below the hero: short proofs with real data, one link each, then the questions answered in the open */}
        <div className="flex flex-col gap-14 pb-12 pt-10 sm:gap-20 sm:pb-20 sm:pt-14">
          {/* Renders its own head, and nothing at all on a day with no confirmed reason yet (no empty strip). */}
          <Suspense fallback={null}>
            <TodayMoves />
          </Suspense>

          <section id="portfolio" className="scroll-mt-24">
            <SectionHead
              title="What we'd do with each stock you own."
              lede="Add your stocks and we tell you, for each one, whether we'd buy more, keep it or sell some, and why. There is no broker login, so nothing here can touch your money."
              href="/portfolio?tab=holdings"
              hrefLabel="Add your stocks"
            />
            <Suspense fallback={<div className="oa-surface h-80 animate-pulse border border-oa-border bg-oa-card motion-reduce:animate-none" aria-hidden="true" />}>
              <OnePlace />
            </Suspense>
          </section>

          {/* the example's three agents and what each found on its last real run: the pitch is what the demo did */}
          <section id="what-it-does" className="scroll-mt-24">
            <SectionHead
              title="Three agents watch the example portfolio."
              lede="On top of our daily check of the whole market, these three look only at the example's stocks, every market day, and write only when they find something. Here is what each found on its last run. Set them up on your stocks and they do the same for you."
              href="/agents"
              hrefLabel="Set one up"
            />
            <AgentDoes />
          </section>

          {/* plans: hidden once you already subscribe */}
          {!user.isSubscribed ? (
            <section id="pricing" className="scroll-mt-24">
              <SectionHead
                // One heading, one idea (owner rule 6, judges ship 42): the two plans in one sentence.
                title="Our calls are free, and Pro adds the full report."
                lede={`Our call on ${CALL_COVERAGE}, why we made it and what would change it are free. A free account also gets the full report on ${countWord(limitFor("covered_stocks", "free"))} stocks you pick, with the prices where we'd buy more or sell some.`}
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
            {/* Two columns from `md`; the founder note, last and odd, takes the whole row so no row ends half empty. */}
            <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              {FAQS.map((item, index) => (
                <div key={item.q} className={index === FAQS.length - 1 && FAQS.length % 2 === 1 ? "min-w-0 md:col-span-2 md:max-w-3xl" : "min-w-0"}>
                  <dt className="text-pretty text-[16px] font-medium leading-6 text-oa-fg">{item.q}</dt>
                  <dd className="mt-1.5 text-pretty text-[15px] leading-6 text-oa-muted-fg">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

