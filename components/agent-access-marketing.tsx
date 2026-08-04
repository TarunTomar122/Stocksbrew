import Link from "next/link";

import { AgentChannelLogos, AgentClientLogos } from "@/components/agent-client-logos";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";

export function AgentAccessLandingSection() {
  return (
    <section id="agent-access" className="scroll-mt-20 border-y border-outline-variant bg-surface">
      <div className="landing-inner py-14 lg:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div>
            <p className="landing-section-kicker text-landing-brand">Stocksbrew for Agents</p>
            <h2 className="mt-2 max-w-xl text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
              Let your agent keep up with your stocks.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
              Ask about any stock, check your Watchlist and manage alerts from the AI you already use.
            </p>
            <AgentClientLogos compact className="mt-5" />
            <p className="mt-6 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Works wherever your agent talks to you</p>
            <AgentChannelLogos className="mt-3" />
            <p className="mt-5 text-[12px] text-on-surface-variant">
              <Link href="/agents" className="font-bold text-on-surface hover:text-landing-brand">See agent access →</Link>
              <span className="mx-2 text-outline">/</span>
              <Link href="/developers" className="font-semibold hover:text-landing-brand">Read the docs</Link>
            </p>
          </div>
          <div>
            <div className="divide-y divide-outline-variant border-y border-outline-variant">
              {[
                ["Research any stock", "Get current market data and the detailed Stocksbrew view. If research is missing, your agent can ask to add the stock to Watchlist and queue it."],
                ["Check what changed", "Read your Watchlist, find new price levels or events since the last run, and revisit queued research."],
                ["Manage alerts", "Create or remove price alerts, and ask what changed across earnings, RSI, calls, anomalies, and news."],
              ].map(([title, body]) => (
                <div key={title} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-6">
                  <h3 className="text-[13px] font-bold text-on-surface">{title}</h3>
                  <p className="text-[12px] leading-relaxed text-on-surface-variant">{body}</p>
                </div>
              ))}
            </div>
            <AgentSetupPrompt compact className="mt-6" />
            <p className="mt-4 text-[10px] leading-relaxed text-on-surface-variant">Included with Pro. No trading or brokerage access. Chat delivery is handled by the agent and channels you configure.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AgentAccessLandingStrip() {
  return (
    <section id="agent-access" className="scroll-mt-20 border-t border-outline-variant bg-surface-container-low/30">
      <div className="landing-inner flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="landing-section-kicker text-landing-brand">For developers and AI users</p>
          <p className="mt-1 text-[14px] leading-relaxed text-on-surface-variant">
            Give Claude, Cursor, Codex, or your own agent the same current Stocksbrew stock context.
          </p>
        </div>
        <Link
          href="/agents"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-outline-variant bg-surface px-4 py-2 text-[12px] font-bold text-on-surface no-underline transition-colors hover:border-on-surface sm:self-auto"
        >
          Agent access
          <span aria-hidden>→</span>
        </Link>
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
          <Link href="/agents" className="inline-flex rounded-full border border-outline-variant px-4 py-2 text-[12px] font-semibold text-on-surface">Agent access</Link>
          <Link href={isSubscribed ? "/profile#agent-access" : "/subscribe"} className="inline-flex rounded-full bg-on-surface px-4 py-2 text-[12px] font-bold text-surface">
            {isSubscribed ? "Connect an agent" : "Unlock with Pro"}
          </Link>
        </div>
      </div>
    </section>
  );
}
