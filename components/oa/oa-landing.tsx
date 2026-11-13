import * as React from "react";
import { Suspense } from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
} from "@/lib/brand-copy";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/landing-data";
import { pricingMarket } from "@/lib/pricing";
import { headers } from "next/headers";

import { AgentLoopGhost, AgentLoopSection } from "./landing/agent-loop";
import { AgentWatchGhost, AgentWatchSection } from "./landing/agent-watch";
import { HeroCounters, HeroCountersGhost } from "./landing/hero-counters";
import { HeroDemo, HeroDemoGhost } from "./landing/hero-demo";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, SectionHead } from "./landing/shared";
import { LandingTaste } from "./landing/taste";
import Link from "next/link";

// Printed open, never folded (owner rule 2): one line each, only what decides whether to use it (rule 8). The founder
// note is the last answer. "What is it" is the page itself, and "not investment advice" is the footer's line.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Does it trade for me or hold my money?",
    a: "No. It never sees your account; you place any trade yourself.",
  },
  {
    q: "Where does the information come from, and who writes it?",
    a: "Public prices, filings and news, each linked; AI writes the explanations from them.",
  },
  {
    q: "Who makes stocksbrew?",
    a: (
      <>
        <Link prefetch={false} href="/about" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
          One person
        </Link>
        . If something looks wrong,{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
          tell me
        </a>
        ; I read every message.
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
        {/* The hero, in two columns from lg: the headline and the taste's search on the left (type a stock, read our
            call on it), and a live demo card on the right that flips between today's stand-out stocks. The visitor's
            own picks take the demo's place. On a phone the demo stacks under the search. */}
        <section className="pb-4 pt-6 sm:pt-14 lg:pt-16">
          <LandingTaste
            lead={
              <>
                <h1 className="max-w-[40rem] text-balance font-medium tracking-tight text-oa-fg text-[2rem] leading-[1.08] sm:text-[3rem] sm:leading-[1.04] xl:text-[3.5rem]">
                  {HERO_HEADLINE_LEAD}{" "}
                  <span className="text-oa-muted-fg">{HERO_HEADLINE_EMPHASIS}</span>
                </h1>
                {/* No line under the headline (owner rule 8, judges ship 85): the example card beside it shows the call,
                    the why and what would change it. HERO_SUBHEAD stays the page's meta and share description. */}
              </>
            }
            demo={
              <Suspense fallback={<HeroDemoGhost />}>
                <HeroDemo />
              </Suspense>
            }
            footnote={HERO_FOOTNOTE}
            below={
              // What the agent went through on its last market day, filling the left column beside the demo card (lg+).
              <Suspense fallback={<HeroCountersGhost />}>
                <HeroCounters />
              </Suspense>
            }
          />
        </section>

        {/* Right under the hero, the agent's loop on one real case: what the example portfolio asked, the days it
            checked, what it found, what it decided and what the stock did next against the S&P 500. On a day with no
            stored case, the strongest proposal today takes its place. */}
        <Suspense fallback={<AgentLoopGhost className="mt-8 sm:mt-12" />}>
          <AgentLoopSection className="mt-8 sm:mt-12" />
        </Suspense>

        {/* Then what else the agent watches, as small cards on real data: a filing that changed its risks, a reason
            with a number, a theme's basket replayed, a thesis rolled up. It took the place of the day's market-check
            tiles (a count of what ran, not what it found). Each card waits at most 2s; the section needs two. */}
        <Suspense fallback={<AgentWatchGhost className="mt-8 sm:mt-12" />}>
          <AgentWatchSection className="mt-8 sm:mt-12" />
        </Suspense>

        {/* one story below the hero: short proofs with real data, one link each, then the questions answered in the open */}
        <div className="flex flex-col gap-14 pb-12 pt-10 sm:gap-20 sm:pb-20 sm:pt-14">
          {/* "Why stocks moved today" used to open here: the hero's card already shows today's stand-out moves with
              their reason, so the page spends that room on the agent instead (the section above). */}

          <section id="portfolio" className="scroll-mt-24">
            {/* No line under the title (owner rule 8): "no broker login" is the hero's footnote and the first answer below. */}
            <SectionHead
              title="What we'd do with each stock you own."
              href="/portfolio"
              hrefLabel="Add your stocks"
            />
            <Suspense fallback={<div className="oa-surface h-80 animate-pulse border border-oa-border bg-oa-card motion-reduce:animate-none" aria-hidden="true" />}>
              <OnePlace />
            </Suspense>
          </section>

          {/* plans: hidden once you already subscribe */}
          {!user.isSubscribed ? (
            <section id="pricing" className="scroll-mt-24">
              <SectionHead
                // One heading, one idea (owner rule 6, judges ship 42): the two plans in one sentence.
                title="Our calls are free, and Pro adds the full report."
                href="/pricing"
                hrefLabel="Compare the plans"
              />
              <Reveal>
                <PlansSection trialEligible={(await getViewer()).trialEligible} market={pricingMarket(headers().get("x-vercel-ip-country"))} />
              </Reveal>
            </section>
          ) : null}

          <section id="faq" className="scroll-mt-24">
            <h2 className="text-[20px] font-medium tracking-tight text-oa-fg">Questions</h2>
            {/* Two columns from `md`, three (one row) from `lg`, each answer one column wide (owner rule 4). */}
            <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {FAQS.map((item) => (
                <div key={item.q} className="min-w-0">
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

