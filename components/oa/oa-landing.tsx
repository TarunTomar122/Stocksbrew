import * as React from "react";
import { Suspense } from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  CALL_COVERAGE,
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
} from "@/lib/brand-copy";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/landing-data";
import { pricingMarket } from "@/lib/pricing";
import { headers } from "next/headers";

import { AgentLoopGhost, AgentLoopSection } from "./landing/agent-loop";
import { AgentWatchGhost, AgentWatchSection } from "./landing/agent-watch";
import { HeroDemo, HeroDemoGhost } from "./landing/hero-demo";
import { HeroHeadline } from "./landing/hero-headline";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, SectionHead } from "./landing/shared";
import { LandingTaste } from "./landing/taste";
import Image from "next/image";
import Link from "next/link";
import { ABOUT_WHY, GITHUB_URL } from "@/lib/docs/company";

// Owner, Nov 15: five or six real questions, folded, each opening on a chevron, centred. One or two sentences an
// answer, with a link where there is more to read. "What is it" is the page itself.
const FAQ_LINK = "font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg";
const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Does it trade for me or hold my money?",
    a: "No. It never sees your brokerage account, and you place any trade yourself.",
  },
  {
    q: "How does it decide Buy more, Keep or Sell some?",
    a: (
      <>
        A fixed scoring rule turns the evidence (results, filings, news, the price trend) into the call, so the same inputs
        always give the same call. A model only summarises the sources.{" "}
        <Link prefetch={false} href="/docs/methodology/calls-and-zones" className={FAQ_LINK}>
          How calls are made
        </Link>
      </>
    ),
  },
  {
    q: "Where does the information come from?",
    a: "Public prices, filings and news, each one linked. AI writes the explanations; every number is computed or copied from a source.",
  },
  {
    q: "What is free, and what does Pro add?",
    a: (
      <>
        Our call on {CALL_COVERAGE} is free, and so is tracking as many stocks as you like, with the full report on{" "}
        {FREE_COVERED_WORD} you pick. Pro gives the full report on everything you own.{" "}
        <Link prefetch={false} href="/docs/start/free-vs-pro" className={FAQ_LINK}>
          Free vs Pro
        </Link>
      </>
    ),
  },
  {
    q: "Is this investment advice?",
    a: "No. It is research: the call is our read of public data, and what you do with your money is your decision.",
  },
  {
    q: "Is stocksbrew open source?",
    a: (
      <>
        Yes. The code is on{" "}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={FAQ_LINK}>
          GitHub
        </a>{" "}
        under the AGPL, so you can read how every number is made, or run your own copy.
      </>
    ),
  },
];

const NOTE_LINK = "font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg";

export async function OaLanding() {
  const user = await getLandingUserContext();

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader variant="marketing" />

      <div className={FRAME}>
        {/* The hero, in two columns from lg: the headline and the taste's search on the left (type a stock, read our
            call on it), and a live demo card on the right that flips between today's stand-out stocks. The visitor's
            own picks take the demo's place. On a phone the demo stacks under the search. */}
        <section className="pb-4 pt-12 sm:pt-14 lg:pt-16">
          <LandingTaste
            lead={
              <>
                <HeroHeadline lead={HERO_HEADLINE_LEAD} emphasis={HERO_HEADLINE_EMPHASIS} />
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

          <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24">
            <h2 id="faq-title" className="text-center text-[24px] font-medium tracking-tight text-oa-fg sm:text-[28px]">
              Questions
            </h2>
            {/* Native details/summary: no script, keyboard and screen readers work, the answers stay in the HTML. */}
            <div className="mx-auto mt-6 max-w-[44rem] divide-y divide-oa-border border-y border-oa-border">
              {FAQS.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium leading-6 text-oa-fg outline-none transition-colors hover:text-oa-fg/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-fg/20 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5 shrink-0 text-oa-muted-fg transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="pb-4 pr-9 text-pretty text-[15px] leading-6 text-oa-muted-fg">{item.a}</div>
                </details>
              ))}
            </div>
          </section>

          {/* Last, the person behind it (owner, Nov 15), in their own words from the About page, and that the code is open. */}
          <section id="maker" aria-labelledby="maker-title" className="scroll-mt-24">
            <h2 id="maker-title" className="text-center text-[24px] font-medium tracking-tight text-oa-fg sm:text-[28px]">
              Why I built it
            </h2>
            <figure className="oa-surface mx-auto mt-6 max-w-[44rem] border border-oa-border bg-oa-card p-5 sm:p-7">
              <blockquote className="flex flex-col gap-3 text-pretty text-[16px] leading-7 text-oa-fg sm:text-[17px]">
                {ABOUT_WHY.map((text) => (
                  <p key={text.slice(0, 24)}>{text}</p>
                ))}
              </blockquote>
              <figcaption className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-3">
                  <Image src="/founder.jpg" alt="" width={44} height={44} unoptimized className="size-11 shrink-0 rounded-full object-cover" />
                  <span className="min-w-0 whitespace-nowrap">
                    <span className="block text-[15px] font-medium leading-5 text-oa-fg">Tarun Tomar</span>
                    <span className="block text-[13.5px] leading-5 text-oa-muted-fg">The person behind stocksbrew</span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap text-[14.5px] leading-6">
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${NOTE_LINK}`}>
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 fill-current">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    Open source on GitHub
                  </a>
                  <a href={`mailto:${CONTACT_EMAIL}`} className={NOTE_LINK}>
                    Email me
                  </a>
                </span>
              </figcaption>
            </figure>
          </section>
        </div>
      </div>
    </main>
  );
}

