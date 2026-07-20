import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentResearchWalkthrough } from "@/components/agent-research-walkthrough";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";

export function AgentAccessLandingSection() {
  return (
    <section id="agent-access" className="scroll-mt-20 border-y border-outline-variant bg-surface-container-low/30">
      <div className="landing-inner py-14 lg:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
          <div>
            <p className="landing-section-kicker text-landing-brand">Stocksbrew for Agents</p>
            <h2 className="mt-2 max-w-xl text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
              Ask one question. Get the stock call, the evidence, and what could change it.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
              Stocksbrew gives your agent the research context it cannot invent: current calls, targets, drivers, risks, market regime, and the changes on your private Radar.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-outline-variant py-4 text-[11px] leading-relaxed text-on-surface-variant">
              <p><strong className="block text-on-surface">Compare decisions</strong>Know what differs and why.</p>
              <p><strong className="block text-on-surface">Review your Radar</strong>See what needs attention.</p>
              <p><strong className="block text-on-surface">Prepare for earnings</strong>Surface the key triggers.</p>
              <p><strong className="block text-on-surface">Stress-test a call</strong>Separate evidence from risk.</p>
            </div>
            <AgentSetupPrompt compact className="mt-6" />
            <AgentClientLogos compact className="mt-5" />
            <p className="mt-5 text-[12px] text-on-surface-variant">
              <Link href="/agents" className="font-bold text-on-surface hover:text-landing-brand">See the full workflow →</Link>
              <span className="mx-2 text-outline">/</span>
              <Link href="/developers" className="font-semibold hover:text-landing-brand">Read the docs</Link>
            </p>
          </div>
          <AgentResearchWalkthrough compact />
        </div>
      </div>
    </section>
  );
}

export function StockAgentAccessCta({ ticker, isSubscribed }: { ticker: string; isSubscribed: boolean }) {
  const prompt = `Ask your agent to explain ${ticker}'s current call, target, drivers, risks, and what changed.`;
  return (
    <section className="mx-auto my-10 w-full max-w-[1180px] px-3 sm:px-5">
      <div className="grid gap-5 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-landing-brand">Use this stock in your agent</p>
          <h2 className="mt-2 text-[19px] font-extrabold tracking-tight text-on-surface">Take the {ticker} research with you.</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">{prompt} Stocksbrew returns structured data with timestamps and freshness—not a screenshot or scraped page.</p>
          <AgentClientLogos compact className="mt-4" />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link href="/agents" className="inline-flex rounded-full border border-outline-variant px-4 py-2 text-[12px] font-semibold text-on-surface">How it works</Link>
          <Link href={isSubscribed ? "/profile#agent-access" : "/subscribe"} className="inline-flex rounded-full bg-on-surface px-4 py-2 text-[12px] font-bold text-surface">
            {isSubscribed ? "Connect an agent" : "Unlock with Pro"}
          </Link>
        </div>
      </div>
    </section>
  );
}
