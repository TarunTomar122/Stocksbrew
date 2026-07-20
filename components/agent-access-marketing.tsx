import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";

const PROMPTS = [
  "Compare NVDA, AMD, and AVGO on valuation, growth, momentum, and target room.",
  "What changed across my Radar, and which positions need attention first?",
  "Give me the market brief, then explain the biggest risk to today's setup.",
] as const;

export function AgentAccessLandingSection() {
  return (
    <section id="agent-access" className="scroll-mt-20 border-t border-outline-variant bg-surface-container-low/35">
      <div className="landing-inner py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div>
            <p className="landing-section-kicker text-landing-brand">Stocksbrew for Agents</p>
            <h2 className="mt-2 max-w-xl text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
              Let your AI agent research the market with your Stocksbrew context.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
              Connect Claude Code, Cursor, Codex, or your own workflow to the same calls, targets, market read, and private Radar you use on Stocksbrew.
            </p>
            <AgentClientLogos className="mt-6" />
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/agents" className="inline-flex items-center justify-center rounded-full bg-on-surface px-5 py-2.5 text-[13px] font-bold text-surface">
                See how agent access works <span className="ml-1.5" aria-hidden>→</span>
              </Link>
              <Link href="/developers" className="inline-flex items-center justify-center rounded-full border border-outline-variant bg-surface px-5 py-2.5 text-[13px] font-semibold text-on-surface">
                Developer guide
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-outline-variant bg-[#07110c] shadow-[0_22px_60px_rgba(7,17,12,0.16)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Agent workspace</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#86efac]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" /> read-only
              </span>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[12px] leading-relaxed text-white/85">{PROMPTS[0]}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["Tool", "compare_stocks"],
                  ["Coverage", "3 stocks · current"],
                  ["Source", "Stocksbrew Pro"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/40">{label}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#9ff7bd]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-[#4ade80]/20 bg-[#4ade80]/[0.06] p-4">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#86efac]">What the agent gets</p>
                <ul className="mt-3 grid gap-2 text-[11px] leading-relaxed text-white/70 sm:grid-cols-2">
                  <li>✓ Calls, zones, drivers, and risks</li>
                  <li>✓ Targets and fundamental scores</li>
                  <li>✓ Market brief and sector context</li>
                  <li>✓ Your private Radar and changes</li>
                </ul>
              </div>
              <p className="px-1 font-mono text-[9px] leading-relaxed text-white/40">Freshness and usage travel with every response. No trading or write access.</p>
            </div>
          </div>
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
