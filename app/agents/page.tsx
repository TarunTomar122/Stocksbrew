import type { Metadata } from "next";
import Link from "next/link";

import { AgentChannelLogos, AgentClientLogos } from "@/components/agent-client-logos";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "AI Stock Agent for Research, Radar, and Alerts",
  description: "Connect Claude Code, Hermes, OpenClaw, or another AI agent to Stocksbrew stock research, Radar changes, and alerts through MCP or REST.",
  keywords: [
    "AI stock agent",
    "stock market MCP server",
    "Hermes stock research",
    "OpenClaw stock research",
    "Claude Code stock analysis",
    "stock alerts API",
    "AI agent watchlist",
    "Telegram stock research bot",
    "WhatsApp stock alerts AI",
    "Discord stock research agent",
  ],
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Let your AI agent keep up with your stocks",
    description: "Ask about any stock, manage Radar, and track alerts with current Stocksbrew data.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Stocksbrew for AI agents", description: "Stock research, Radar, and alerts through MCP or REST." },
};

const JOBS = [
  ["Research any stock", "Get current price context, fundamentals, scores, news, and the latest Stocksbrew view. Missing research is returned as a clear state, never invented."],
  ["Keep Radar current", "Read holdings and watchlists, add or remove names, and ask what changed since the last check."],
  ["Manage alerts by asking", "Create or remove price alerts, and ask what changed across earnings, RSI, calls, anomalies, and news."],
] as const;

const CAPABILITIES = [
  "Read stock research and market data",
  "Read and update your Radar",
  "Read alerts and manage price alerts",
  "Check Radar changes with a reusable cursor",
  "Queue missing research by adding a stock to Radar",
  "No trading, money movement, or brokerage access",
] as const;

const FAQS = [
  ["Can my agent answer questions about a stock that is not in my Radar?", "Yes. It returns the baseline market, fundamental, score, and technical data Stocksbrew has. If a detailed AI brief is missing, it says so and offers to add the stock to Radar so research can be queued."],
  ["What happens while research is being generated?", "The stock response reports queued or running. Your agent can give a clearly labeled baseline answer, then call the same tool again later. Radar changes also return a cursor for incremental checks."],
  ["Can an agent change my Radar or alerts?", "Yes, when you grant the write scopes. The tools can add or remove Radar stocks and create or deactivate price alerts. Other changes are read through Radar. A well-behaved client should ask before each write. You can revoke access from Profile."],
  ["Can it message me on Telegram, WhatsApp, or Discord?", "OpenClaw, Hermes, or another agent can relay Stocksbrew results through channels you configure. Stocksbrew supplies the research and alert state. Your agent owns chat delivery."],
  ["Does it work with Hermes, OpenClaw, and Claude Code?", "They can connect when the installed version supports remote Streamable HTTP MCP and OAuth. REST with a personal token is available when MCP is not the right fit."],
  ["Is this included with Pro?", `Yes. Pro includes ${AGENT_MONTHLY_CALL_LIMIT} combined MCP or REST calls each calendar month, with a ${AGENT_PER_MINUTE_CALL_LIMIT}-call per-minute limit.`],
  ["Do older connections get the new Radar and alert tools?", "Reconnect or issue a new personal token if an existing credential only has the older read scopes. The consent screen shows every requested permission."],
] as const;

function Label({ children }: { children: string }) {
  return <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-landing-brand">{children}</p>;
}

function JsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "SoftwareApplication", name: "Stocksbrew for AI Agents", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: "https://www.stocksbrew.online/agents", description: metadata.description, offers: { "@type": "Offer", price: "9", priceCurrency: "USD" } },
        { "@type": "WebAPI", name: "Stocksbrew Agent API", url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers", description: "Stock research, Radar, and alert tools through MCP and REST." },
        { "@type": "FAQPage", mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      ],
    }) }} />
  );
}

export default function AgentsPage() {
  return (
    <main className="min-w-0 flex-grow bg-surface text-on-surface">
      <JsonLd />
      <header className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-20">
          <Label>Stocksbrew for agents</Label>
          <h1 className="mt-4 max-w-4xl font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-tight sm:text-[4.2rem]">
            Let your agent keep up with your stocks.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-on-surface-variant sm:text-[18px]">
            Ask about any stock, keep Radar current, and manage alerts with the AI you already use.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#connect" className="rounded-full bg-on-surface px-5 py-2.5 text-[12px] font-bold text-surface">Connect your agent</Link>
            <Link href="#example" className="rounded-full border border-outline-variant px-5 py-2.5 text-[12px] font-semibold">See a real flow</Link>
          </div>
          <AgentClientLogos compact className="mt-7" />
          <p className="mt-4 text-[11px] text-on-surface-variant">MCP or REST. Included with Pro. No trading or brokerage access.</p>
        </div>
      </header>

      <section id="example" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:py-16">
          <div>
            <Label>One complete loop</Label>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">From an unknown stock to monitored research.</h2>
            <p className="mt-4 text-[13px] leading-relaxed text-on-surface-variant">The agent uses the same Radar and alert services as the app. Missing research stays visible and can be queued with your approval.</p>
          </div>
          <div className="divide-y divide-outline-variant border-y border-outline-variant text-[13px] leading-relaxed">
            <div className="py-4"><strong className="text-landing-brand">You</strong><p className="mt-1">What do we know about CCL?</p></div>
            <div className="py-4"><strong>Agent</strong><p className="mt-1 text-on-surface-variant">I have current price, fundamentals, scores, and technicals. The detailed brief is missing. Add CCL to Radar and queue research?</p></div>
            <div className="py-4"><strong className="text-landing-brand">You</strong><p className="mt-1">yes, and alert me below $25</p></div>
            <div className="py-4"><strong>Agent</strong><p className="mt-1 text-on-surface-variant">CCL is in Radar, research is queued, and the price alert is active. I can recheck the brief later.</p></div>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 lg:py-16">
          <Label>What it can do</Label>
          <div className="mt-5 grid border-t border-outline-variant md:grid-cols-3">
            {JOBS.map(([title, body], index) => (
              <article key={title} className={`border-b border-outline-variant py-6 md:px-6 ${index > 0 ? "md:border-l" : "md:pl-0"}`}>
                <h2 className="text-[16px] font-bold">{title}</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1180px] gap-9 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:py-16">
          <div>
            <Label>Agent-owned delivery</Label>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Use it where your agent already talks to you.</h2>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-on-surface-variant">OpenClaw, Hermes, or another agent can relay Stocksbrew answers through channels you configure.</p>
            <AgentChannelLogos className="mt-5" />
            <p className="mt-4 text-[10px] text-on-surface-variant">Stocksbrew supplies stock data and alert state. Your agent owns message delivery.</p>
          </div>
          <div className="border-y border-outline-variant py-5">
            <Label>Permissions</Label>
            <ul className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
              {CAPABILITIES.map((item) => <li key={item} className="flex gap-2"><span className="text-landing-brand">✓</span><span>{item}</span></li>)}
            </ul>
            <p className="mt-5 text-[11px] leading-relaxed text-on-surface-variant">Your agent should ask before changing Radar or alerts. OAuth scopes stay visible and revocable.</p>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16">
          <Label>Connect</Label>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Paste one prompt into your agent.</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">It contains the MCP URL, safe missing-research behavior, confirmation rules, and a verification step.</p>
          <AgentSetupPrompt className="mt-6" />
          <div className="mt-5 flex flex-wrap gap-4 text-[11px] font-semibold">
            <Link href="/developers" className="text-landing-brand">Complete setup and API reference →</Link>
            <Link href="/profile#agent-access">Manage tokens and access →</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 lg:py-16">
          <Label>Included with Pro</Label>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">For when your watchlist gets serious.</h2>
              <p className="mt-3 text-[13px] text-on-surface-variant">$9/month. Three days free. Detailed calls, unlimited Radar, alerts, research generation, and agent access.</p>
            </div>
            <Link href="/subscribe" className="shrink-0 self-start rounded-full bg-landing-brand px-5 py-2.5 text-[12px] font-bold text-white sm:self-auto">Start your 3-day free trial</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16">
        <Label>Questions</Label>
        <div className="mt-5 divide-y divide-outline-variant border-y border-outline-variant">
          {FAQS.map(([question, answer]) => (
            <article key={question} className="py-5">
              <h2 className="text-[14px] font-bold">{question}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
