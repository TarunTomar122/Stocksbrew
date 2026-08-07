import type { Metadata } from "next";
import Link from "next/link";

import { AgentChannelLogos, AgentClientLogos } from "@/components/agent-client-logos";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "AI Stock Agent for Research, Watchlist, and Alerts",
  description: "Connect Claude Code, Hermes, OpenClaw or another AI agent to Stocksbrew stock research, Watchlist changes and alerts through MCP or REST.",
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
    description: "Ask about any stock, manage your Watchlist and track alerts with current Stocksbrew data.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Stocksbrew for AI agents", description: "Stock research, Watchlist and alerts through MCP or REST." },
};

const JOBS = [
  ["Research any stock", "Get current price context, fundamentals, scores, news, and the latest Stocksbrew view. Missing research is returned as a clear state, never invented."],
  ["Keep your Watchlist current", "Read holdings and watchlist names, add or remove stocks and ask what changed since the last check."],
  ["Manage alerts by asking", "Create or remove price alerts, and ask what changed across earnings, RSI, calls, anomalies, and news."],
] as const;

const CAPABILITIES = [
  "Read stock research and market data",
  "Read and update your Watchlist",
  "Read alerts and manage price alerts",
  "Check Watchlist changes with a reusable cursor",
  "Queue missing research by adding a stock to Watchlist",
  "No trading, money movement, or brokerage access",
] as const;

const FAQS = [
  ["Can my agent answer questions about a stock that is not in my Watchlist?", "Yes. It returns the baseline market, fundamental, score and technical data Stocksbrew has. If detailed research is missing, it says so and offers to add the stock to Watchlist so research can be queued."],
  ["What happens while research is being generated?", "The stock response reports queued or running. Your agent can give a clearly labeled baseline answer, then call the same tool again later. Watchlist changes also return a cursor for incremental checks."],
  ["Can an agent change my Watchlist or alerts?", "Yes, when you grant the write scopes. The tools can add or remove Watchlist stocks and create or deactivate price alerts. Other changes are read through Watchlist. A well-behaved client should ask before each write. You can revoke access from Profile."],
  ["Can it message me on Telegram, WhatsApp, or Discord?", "OpenClaw, Hermes, or another agent can relay Stocksbrew results through channels you configure. Stocksbrew supplies the research and alert state. Your agent owns chat delivery."],
  ["Does it work with Hermes, OpenClaw, and Claude Code?", "They can connect when the installed version supports remote Streamable HTTP MCP and OAuth. REST with a personal token is available when MCP is not the right fit."],
  ["Is this included with Pro?", `Yes. Pro includes ${AGENT_MONTHLY_CALL_LIMIT} combined MCP or REST calls each calendar month, with a ${AGENT_PER_MINUTE_CALL_LIMIT}-call per-minute limit.`],
  ["Do older connections get the new Watchlist and alert tools?", "Reconnect or issue a new personal token if an existing credential only has the older read scopes. The consent screen shows every requested permission."],
] as const;

function JsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "SoftwareApplication", name: "Stocksbrew for AI Agents", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: "https://www.stocksbrew.online/agents", description: metadata.description, offers: { "@type": "Offer", price: "9", priceCurrency: "USD" } },
        { "@type": "WebAPI", name: "Stocksbrew Agent API", url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers", description: "Stock research, Watchlist and alert tools through MCP and REST." },
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
          <h1 className="max-w-3xl text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-[46px]">
            Let your agent keep up with your stocks.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-on-surface-variant sm:text-[18px]">
            Ask about any stock, keep your Watchlist current and manage alerts with the AI you already use.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="#connect" className="landing-btn-primary px-5 py-2.5 text-[13px]">Connect your agent</Link>
            <Link href="#example" className="rounded-xl border border-outline-variant px-5 py-2.5 text-[13px] font-semibold">See a real flow</Link>
          </div>
          <AgentClientLogos compact className="mt-7" />
          <p className="mt-4 text-[12px] text-on-surface-variant">MCP or REST. Included with Pro. No trading or brokerage access.</p>
        </div>
      </header>

      <section id="example" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:py-16">
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">From an unknown stock to monitored research.</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-on-surface-variant">The agent uses the same Watchlist and alert services as the app. Missing research stays visible and can be queued with your approval.</p>
          </div>
          <div className="landing-card flex flex-col gap-4 rounded-xl p-5 text-[14px] leading-relaxed sm:p-6">
            <div><p className="font-medium text-landing-brand">You</p><p className="mt-1">What do we know about CCL?</p></div>
            <div><p className="font-medium text-on-surface">Agent</p><p className="mt-1 text-on-surface-variant">I have current price, fundamentals, scores and technicals. The detailed research is missing. Add CCL to Watchlist and queue it?</p></div>
            <div><p className="font-medium text-landing-brand">You</p><p className="mt-1">yes, and alert me below $25</p></div>
            <div><p className="font-medium text-on-surface">Agent</p><p className="mt-1 text-on-surface-variant">CCL is in Watchlist, research is queued and the price alert is active. I can check again later.</p></div>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 lg:py-16">
          <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">What it can do</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {JOBS.map(([title, body]) => (
              <article key={title} className="landing-card flex flex-col gap-2 rounded-xl p-5">
                <h3 className="text-[16px] font-semibold text-on-surface">{title}</h3>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1180px] gap-9 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:py-16">
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">Use it where your agent already talks to you.</h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-on-surface-variant">OpenClaw, Hermes, or another agent can relay Stocksbrew answers through channels you configure.</p>
            <AgentChannelLogos className="mt-5" />
            <p className="mt-4 text-[12px] text-on-surface-variant">Stocksbrew supplies stock data and alert state. Your agent owns message delivery.</p>
          </div>
          <div className="landing-card rounded-xl p-5 sm:p-6">
            <h2 className="text-[16px] font-semibold text-on-surface">Permissions</h2>
            <ul className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
              {CAPABILITIES.map((item) => <li key={item} className="flex gap-2"><span className="text-landing-brand">✓</span><span>{item}</span></li>)}
            </ul>
            <p className="mt-5 text-[12px] leading-relaxed text-on-surface-variant">Your agent should ask before changing Watchlist or alerts. OAuth scopes stay visible and revocable.</p>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16">
          <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">Paste one prompt into your agent.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant">It contains the MCP URL, safe missing-research behavior, confirmation rules, and a verification step.</p>
          <AgentSetupPrompt className="mt-6" />
          <div className="mt-5 flex flex-wrap gap-4 text-[13px] font-semibold">
            <Link href="/developers" className="text-landing-brand">Complete setup and API reference →</Link>
            <Link href="/profile#agent-access">Manage tokens and access →</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 lg:py-16">
          <div className="landing-card flex flex-col gap-5 rounded-xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">For when your watchlist gets serious.</h2>
              <p className="mt-3 text-[14px] text-on-surface-variant">$9/month. Three days free. Detailed calls, unlimited Watchlist, alerts, research generation and agent access.</p>
            </div>
            <Link href="/subscribe" className="landing-btn-primary shrink-0 self-start px-5 py-2.5 text-[13px] sm:self-auto">Start your 3-day free trial</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[860px] px-5 py-12 sm:px-8 lg:py-16">
        <h2 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">Questions</h2>
        <div className="mt-5 divide-y divide-outline-variant border-y border-outline-variant">
          {FAQS.map(([question, answer]) => (
            <article key={question} className="py-5">
              <h3 className="text-[15px] font-semibold text-on-surface">{question}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
