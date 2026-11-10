import { Suspense } from "react";

import { Disclosure } from "@/components/oa/disclosure";
import { Bar } from "@/components/oa/kit/skeleton";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { OaHeroSearch } from "@/components/oa/oa-hero-search";
import { SquircleSurface } from "@/components/oa/squircle";
import { interTight } from "@/components/oa/font";
import { Reveal } from "@/components/reveal";
import {
  HERO_FOOTNOTE,
  HERO_HEADLINE_EMPHASIS,
  HERO_HEADLINE_LEAD,
  HERO_SUBHEAD,
} from "@/lib/brand-copy";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";
import { getViewer } from "@/lib/entitlements-server";
import { getLandingUserContext } from "@/components/terminal-landing-streams";

import { AgentsSection } from "./landing/agents-section";
import { HeroBriefing } from "./landing/hero-briefing";
import { OnePlace } from "./landing/one-place";
import { PlansSection } from "./landing/plans-section";
import { FRAME, H2, SectionHead } from "./landing/shared";
import { TrackGrid } from "./landing/track-grid";

const FAQS = [
  {
    q: "What is stocksbrew?",
    a: "An agent that follows your stocks. It reads the filings, earnings reports and news on what you own, explains what moved and why, shows you what funds, members of Congress and insiders are doing, and tells you when something needs a look.",
  },
  {
    q: "Does it trade for me or hold my money?",
    a: "No. stocksbrew never connects to a brokerage, and it cannot place trades or move money. You read the research and act wherever you already invest.",
  },
  {
    q: "How much does it cost?",
    a: `Reading is free on every stock, including our call. On Free your agent covers five stocks in full. Pro is $${US_PRO_MONTHLY} a month or $${US_PRO_YEARLY} a year and covers everything you own, with more agents, alerts and questions.`,
  },
  {
    q: "Where does the information come from?",
    a: "Public filings, earnings reports, market prices, analyst targets and the news. Headlines and filings link to the original.",
  },
  {
    q: "Is the research written by AI?",
    a: "The explanations and calls are AI-written from filings, numbers and news. Prices and financials are not. When there is no confirmed reason for a move, we say so.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click, no questions asked, and you keep access until the period you paid for runs out.",
  },
  {
    q: "Is this investment advice?",
    a: "No. stocksbrew provides research for your own decisions. It is not a broker or an adviser.",
  },
];

export async function OaLanding() {
  const user = await getLandingUserContext();
  const half = Math.ceil(FAQS.length / 2);
  const faqColumns = [FAQS.slice(0, half), FAQS.slice(half)];

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader variant="marketing" />

      <div className={FRAME}>
        {/* hero */}
        <section className="grid grid-cols-1 items-center gap-8 pb-4 pt-10 sm:gap-14 sm:pt-16 lg:pt-20 lg:grid-cols-[1fr_1fr]">
          <div>
            <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-[3.5rem] sm:leading-[1.05]">
              {HERO_HEADLINE_LEAD}{" "}
              <span className="text-oa-muted-fg">{HERO_HEADLINE_EMPHASIS}</span>
            </h1>
            <p className="text-pretty mt-4 max-w-lg text-[16px] leading-[26px] text-oa-fg/85 sm:mt-5 sm:text-[17px] sm:leading-7">
              {HERO_SUBHEAD}
            </p>
            <div className="mt-6 sm:mt-8">
              <OaHeroSearch source="hero" />
            </div>
            {user.signedIn ? null : <p className="mt-3 text-base text-oa-muted-fg">{HERO_FOOTNOTE}</p>}
          </div>
          <div className="flex justify-center lg:justify-end">
            <Suspense fallback={<HeroBriefingGhost />}>
              <HeroBriefing />
            </Suspense>
          </div>
        </section>

        {/* everything below stacks as plates; the page background between them is the only divider */}
        <div className="flex flex-col gap-14 pb-12 pt-10 sm:gap-20 sm:pb-20 sm:pt-14">
          {/* proof: three live feeds from today, each tied to the page that has the rest */}
          <section id="live" className="scroll-mt-24">
            <SectionHead
              title="Every day, it checks what moves your stocks."
              lede="Big moves with the reason behind them, earnings coming up, and what members of Congress bought and sold. This is today's real data."
              href="/briefing"
              hrefLabel="See today's briefing"
            />
            <Suspense fallback={<div className="oa-surface h-[26rem] animate-pulse border border-oa-border bg-oa-card motion-reduce:animate-none" aria-hidden="true" />}>
              <TrackGrid only={["moves", "earnings", "congress"]} rows={5} />
            </Suspense>
          </section>

          {/* proof: your stocks */}
          <section id="portfolio" className="scroll-mt-24">
            <SectionHead
              title="Everything you own, in one place."
              lede="Add your stocks one at a time or paste a list. There is no broker login, so nothing here can touch your money."
              href="/watchlist"
              hrefLabel="Open your stocks"
            />
            <Suspense fallback={<div className="oa-surface h-[22rem] animate-pulse border border-oa-border bg-oa-card motion-reduce:animate-none" aria-hidden="true" />}>
              <OnePlace />
            </Suspense>
          </section>

          {/* proof: agents */}
          <section id="agents" className="scroll-mt-24">
            <Reveal>
              <AgentsSection />
            </Reveal>
          </section>

          {/* plans: hidden once you already subscribe */}
          {!user.isSubscribed ? (
            <section id="pricing" className="scroll-mt-24">
              <Reveal>
                <PlansSection trialEligible={(await getViewer()).trialEligible} />
              </Reveal>
            </section>
          ) : null}

          {/* questions */}
          <section id="faq" className="scroll-mt-24">
            <SectionHead title="Questions" align="center" />
            <Reveal>
              <div className="mx-auto grid max-w-5xl grid-cols-1 gap-x-12 md:grid-cols-2">
                {faqColumns.map((column, index) => (
                  <div key={index}>
                    {column.map((item) => (
                      <Disclosure key={item.q} question={item.q}>
                        {item.a}
                      </Disclosure>
                    ))}
                  </div>
                ))}
              </div>
            </Reveal>
          </section>

          {/* why */}
          <section id="why" className="scroll-mt-24">
            <Reveal>
              <div className="mx-auto max-w-3xl">
                <h2 className={H2}>Why I built stocksbrew.</h2>
                <div className="mt-5 flex flex-col gap-4 text-[17px] leading-8 text-oa-fg/80">
                  <p>
                    Following a company meant reopening the same tabs every day: the filing, the
                    earnings call, the chart, the news, the forum thread. Most days nothing had
                    changed. The day something did was easy to miss.
                  </p>
                  <p>
                    So I built the thing I wanted. It does the reading every day and speaks up only
                    when it has something to say, with the source next to it. It never touches your
                    money. You stay the one who decides.
                  </p>
                  <p>
                    stocksbrew is a small, independent product. If a page is confusing or a fact
                    looks wrong, tell me. I read every message.
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3 text-[15px]">
                  <a
                    href="/about"
                    className="inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-4 font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
                  >
                    Who is behind this
                  </a>
                  <a
                    href="/docs"
                    className="inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-4 font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
                  >
                    How the research is made
                  </a>
                </div>
              </div>
            </Reveal>
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
