import * as React from "react";
import { Suspense } from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
} from "@/lib/brand-copy";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/landing-data";
import { pricingMarket } from "@/lib/pricing";
import { headers } from "next/headers";

import { AgentDoes } from "./landing/agent-does";
import { HeroDemo, HeroDemoGhost } from "./landing/hero-demo";
import { MarketTiles, MarketTilesGhost } from "./landing/market-tiles";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, SectionHead } from "./landing/shared";
import { LandingTaste } from "./landing/taste";
import { TodayMoves } from "./landing/today-moves";
import Link from "next/link";

// Printed open, never folded (owner rule 2): one line each, only what decides whether to use it (rule 8). The founder
// note is the last answer.
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is stocksbrew?",
    a: "Research on US stocks: why each one moved, and whether we would buy more, keep or sell some.",
  },
  {
    q: "Does it trade for me or hold my money?",
    a: "No. It never connects to a brokerage, so it cannot trade or move your money.",
  },
  {
    q: "Where does the information come from, and who writes it?",
    a: "Public prices, filings and news, each linked; AI writes the explanations from them.",
  },
  {
    q: "Is this investment advice?",
    a: "No. It is research for your own decisions.",
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
                <p className="text-pretty mt-3 max-w-xl text-[15px] leading-6 text-oa-fg/85 sm:mt-5 sm:text-[17px] sm:leading-7">
                  {HERO_SUBHEAD}
                </p>
              </>
            }
            demo={
              <Suspense fallback={<HeroDemoGhost />}>
                <HeroDemo />
              </Suspense>
            }
            footnote={HERO_FOOTNOTE}
          />
        </section>

        {/* Under the hero: the day's check of the whole market as figure tiles, from the jobs' own records. Nothing at
            all when there are not two checks to show, so no empty box. */}
        <Suspense fallback={<MarketTilesGhost className="mt-8 sm:mt-12" />}>
          <MarketTiles className="mt-8 sm:mt-12" />
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
              lede="No broker login, so nothing here can touch your money."
              href="/portfolio"
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
            {/* Two columns from `md`, each answer one column wide, the last one included (owner rule 4). */}
            <dl className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
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

