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
    description: "Give your AI agent your Watchlist, Explore data, Market Daily history, full stock detail and curated screens through current Stocksbrew data.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Stocksbrew for AI agents", description: "Stock detail, Explore, Market Daily history, screens, Watchlist and alerts through MCP or REST." },
};

const ACCESS_AREAS = [
  ["01", "Watchlist + holdings", "get_my_radar · get_radar_changes", "Read the authenticated member's tracked names, holdings context, alerts, pulse, attention items and latest changes."],
  ["02", "Explore", "get_explore", "Bring in the current discovery view: trending names, heat, momentum, news spikes, 52-week moves, Reddit buzz and recent Trump mentions."],
  ["03", "Market history", "get_market_history", "Read the last seven published US Market Daily editions, including the article, tape, premarket view, anomalies and sources."],
  ["04", "Full stock detail", "get_stock_detail", "Read facts, financial history, valuation, balance sheet, dividends, business mix, institutions, technicals, earnings, news, Reddit and the five business questions."],
  ["05", "Curated screens", "get_screens", "Browse Stocksbrew's thematic screen catalog, coverage metadata and every current match."],
] as const;

const WORKFLOW = [
  ["01", "Connect once", "Use the remote MCP URL with OAuth. Your agent gets scoped access while the token stays out of the conversation."],
  ["02", "Research any stock", "Start with get_stock_intelligence for a quick read, then use get_stock_detail when the question needs the full page and deeper evidence."],
  ["03", "Answer honestly", "Missing fields stay visible as not enough current evidence. The agent can ask before queuing research or changing your Watchlist."],
] as const;

const CAPABILITIES = [
  "MCP over OAuth at stocksbrew.online/api/mcp",
  "Read the five Stocksbrew context areas",
  "Use get_stock_intelligence for a concise current read",
  "Keep missing evidence labeled and visible",
  "Read alerts and Watchlist changes",
  "Ask before adding or removing a Watchlist stock",
  "Ask before creating or deleting a price alert",
  "No trading, money movement, or brokerage access",
] as const;

const FAQS = [
  ["What can my agent read?", "It can read your Watchlist and holdings, the current Explore sections, the last seven published US Market Daily editions, Stocksbrew's curated screens, and full materialized stock-page detail. That detail includes facts, financial history, valuation, business questions, price history, technicals, earnings, recent news and Reddit context."],
  ["Can my agent answer questions about a stock that is not in my Watchlist?", "Yes. It returns the baseline market, fundamental, score and technical data Stocksbrew has. If detailed research is missing, it says so and offers to add the stock to Watchlist so research can be queued."],
  ["What happens when a field is missing?", "Stocksbrew marks the missing section, and the agent should say \"not enough current evidence\". It must not turn an empty field into a confident thesis."],
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
        { "@type": "WebAPI", name: "Stocksbrew Agent API", url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers", description: "Stock detail, Explore, Market Daily history, curated screens, Watchlist and alert tools through MCP and REST." },
        { "@type": "FAQPage", mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      ],
    }) }} />
  );
}

export default function AgentsPage() {
  return (
    <main className="landing-page min-w-0 flex-grow bg-surface text-on-surface">
      <JsonLd />
      <header className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <div className="border-b border-outline-variant py-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">stocksbrew <span className="text-landing-brand">/</span> agent access</p>
          </div>
          <div className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-24">
            <div>
              <p className="landing-section-kicker text-landing-brand">Structured context for your AI</p>
              <h1 className="mt-4 max-w-2xl text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[58px]">Let your agent keep up with your stocks.</h1>
              <p className="mt-6 max-w-xl text-[16px] leading-[1.7] text-on-surface-variant sm:text-[18px]">Ask Claude or ChatGPT about a stock with Stocksbrew&apos;s structured market data, analyst signals and research already in the conversation.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="#connect" className="landing-btn-primary px-5 py-3 text-[13px]">Connect your agent</Link>
                <Link href="#access" className="landing-btn-secondary px-5 py-3 text-[13px]">See what it can read</Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-on-surface-variant">
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-signal-bullish" />MCP over OAuth</span>
                <span>Included with Pro</span><span>No brokerage access</span>
              </div>
              <AgentClientLogos compact className="mt-7" />
            </div>
            <div className="landing-card overflow-hidden rounded-xl">
              <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
                <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Claude Code · ChatGPT</p><p className="mt-1 font-mono text-[12px] text-on-surface">Connected through remote MCP</p></div>
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-signal-bullish"><span className="h-1.5 w-1.5 rounded-full bg-signal-bullish" />OAuth</span>
              </div>
              <div className="bg-surface-container-low px-5 py-6 sm:px-7 sm:py-8">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant"><span className="grid h-5 w-5 place-items-center rounded bg-on-surface text-[9px] text-surface">C</span>Claude Code</div>
                <div className="mt-5 space-y-4 text-[13px] leading-relaxed"><div className="border-l-2 border-landing-brand pl-4 text-on-surface">Give me the full read on NVDA. What matters right now?</div><div className="border-l-2 border-outline-variant pl-4 text-on-surface-variant">I&apos;ll pull the current stock detail, analyst context, valuation, technicals and recent market signals, then call out anything that lacks current evidence.</div></div>
                <div className="mt-7 grid gap-2 sm:grid-cols-2">{["get_stock_intelligence", "get_stock_detail"].map((tool) => <div key={tool} className="border border-outline-variant bg-surface px-3 py-3 font-mono text-[10px] text-landing-brand">{tool}()</div>)}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="access" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
          <p className="landing-section-kicker text-landing-brand">Five kinds of context</p>
          <h2 className="mt-3 max-w-2xl text-[28px] font-semibold tracking-[-0.03em] sm:text-[36px]">Your agent gets the useful parts of Stocksbrew.</h2>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-on-surface-variant sm:text-[15px]">Each tool maps to a real product surface. The response includes freshness and evidence status, so a missing section never becomes a made-up thesis.</p>
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            {ACCESS_AREAS.map(([number, title, tool, body], index) => (
              <article key={title} className={`landing-card rounded-xl p-5 sm:p-6 ${index === ACCESS_AREAS.length - 1 ? "md:col-span-2" : ""}`}>
                <div className="flex items-start justify-between gap-5"><span className="font-mono text-[11px] font-semibold text-landing-brand">{number}</span><span className="font-mono text-right text-[10px] text-on-surface-variant">{tool}</span></div>
                <h3 className="mt-8 text-[18px] font-semibold tracking-[-0.02em]">{title}</h3>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-surface-container-low/35">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="landing-section-kicker text-landing-brand">How it works</p>
              <h2 className="mt-3 max-w-md text-[28px] font-semibold tracking-[-0.03em] sm:text-[36px]">A better stock answer starts before the answer.</h2>
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-on-surface-variant">Connect once, give the agent the right context, and keep the line between evidence and inference clear.</p>
            </div>
            <div className="divide-y divide-outline-variant border-y border-outline-variant">
              {WORKFLOW.map(([number, title, body]) => (
                <article key={number} className="grid gap-3 py-5 sm:grid-cols-[52px_180px_1fr] sm:items-start sm:gap-5">
                  <span className="font-mono text-[11px] font-semibold text-landing-brand">{number}</span>
                  <h3 className="text-[15px] font-semibold">{title}</h3>
                  <p className="text-[13px] leading-relaxed text-on-surface-variant">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-16 lg:py-20">
          <div>
            <p className="landing-section-kicker text-landing-brand">Connect once</p>
            <h2 className="mt-3 max-w-xl text-[28px] font-semibold tracking-[-0.03em] sm:text-[36px]">Give your agent a safe, current research layer.</h2>
            <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-on-surface-variant">Paste the prompt into Claude Code, ChatGPT, Cursor, Codex, Hermes, OpenClaw or another OAuth-capable client. It tells the agent what Stocksbrew can provide and how to behave when evidence is missing.</p>
            <AgentClientLogos className="mt-6" />
            <p className="mt-8 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Works with channels you configure</p>
            <AgentChannelLogos className="mt-3" />
          </div>
          <div>
            <AgentSetupPrompt />
            <div className="mt-6 landing-card rounded-xl p-5 sm:p-6">
              <p className="landing-section-kicker text-landing-brand">Permissions</p>
              <ul className="mt-4 grid gap-3 text-[13px]">
                {CAPABILITIES.map((item) => <li key={item} className="flex gap-2"><span className="text-landing-brand">✓</span><span>{item}</span></li>)}
              </ul>
              <p className="mt-5 border-t border-outline-variant pt-4 text-[12px] leading-relaxed text-on-surface-variant">OAuth scopes stay visible and revocable. Ask before every Watchlist or alert write.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-surface-container-low/35">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
          <div className="flex flex-col gap-6 border-y border-outline-variant py-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-section-kicker text-landing-brand">For developers</p>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] sm:text-[30px]">Need the full tool map?</h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-surface-variant">See every MCP tool, scope, REST endpoint, quota and error shape in the developer reference.</p>
            </div>
            <Link href="/developers" className="landing-btn-secondary shrink-0 px-5 py-3 text-[13px]">Open the developer docs →</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
          <div className="landing-card flex flex-col gap-6 rounded-xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <p className="landing-section-kicker text-landing-brand">Ready when you are</p>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] sm:text-[30px]">Give your agent the same context you use.</h2>
              <p className="mt-3 text-[14px] text-on-surface-variant">$9/month. Three days free. Detailed calls, unlimited Watchlist, alerts, research generation and agent access.</p>
            </div>
            <Link href="/subscribe" className="landing-btn-primary shrink-0 self-start px-5 py-2.5 text-[13px] sm:self-auto">Start your 3-day free trial</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[860px] px-5 py-14 sm:px-8 lg:py-20">
        <p className="landing-section-kicker text-landing-brand">Questions</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">Before you connect</h2>
        <div className="mt-6 divide-y divide-outline-variant border-y border-outline-variant">
          {FAQS.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
                {question}
                <span aria-hidden className="font-mono text-[18px] font-normal text-on-surface-variant transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
