import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentResearchWalkthrough } from "@/components/agent-research-walkthrough";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";

export function AgentAccessLandingSection() {
  return (
    <section id="agent-access" className="scroll-mt-20 border-y border-outline-variant bg-surface-container-low/30">
      <div className="landing-inner py-14 lg:py-20">
        <div className="grid items-start gap-9 lg:grid-cols-[0.78fr_1.22fr] lg:gap-12">
          <div>
            <p className="landing-section-kicker text-landing-brand">Stocksbrew for Agents</p>
            <h2 className="mt-2 max-w-xl text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
              Give your AI current stock context.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
              Without a data connection, stock answers can be generic and hard to verify. Stocksbrew adds current calls, targets, drivers, risks, and timestamps in a consistent format.
            </p>
            <AgentSetupPrompt compact className="mt-6" />
            <AgentClientLogos compact className="mt-5" />
            <p className="mt-5 text-[12px] text-on-surface-variant">
              <Link href="/agents" className="font-bold text-on-surface hover:text-landing-brand">See how it works →</Link>
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
  return (
    <section className="mx-auto my-10 w-full max-w-[1180px] px-3 sm:px-5">
      <div className="grid gap-5 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-landing-brand">Stocksbrew for agents</p>
          <h2 className="mt-2 text-[19px] font-extrabold tracking-tight text-on-surface">Ask your AI about {ticker} with current Stocksbrew data.</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">It can retrieve the current call, target, drivers, risks, and freshness before answering.</p>
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
