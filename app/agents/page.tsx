import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentResearchWalkthrough } from "@/components/agent-research-walkthrough";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "AI Stock Research Agents with MCP",
  description: "Connect Claude Code, Cursor, Codex, or your own AI agent to Stocksbrew stock intelligence, market context, and private Radar through MCP or a read-only API.",
  keywords: [
    "stock market MCP server",
    "AI stock research agent",
    "stock data for AI agents",
    "investment research API",
    "Claude stock research",
    "Cursor MCP server",
    "Codex MCP",
  ],
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Give your AI agent the Stocksbrew research layer",
    description: "Calls, targets, market context, and your private Radar through a read-only MCP server and API.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stocksbrew for AI Agents",
    description: "Connect your agent to current stock intelligence, market context, and Radar.",
  },
};

const CAPABILITIES = [
  ["Understand one stock", "Current call, target, buy and trim zones, drivers, risks, fundamentals, scores, and freshness.", "get_stock_intelligence"],
  ["Compare a decision", "Two to five stocks evaluated on the same valuation, growth, quality, momentum, and return dimensions.", "compare_stocks"],
  ["Read the market around it", "Market regime, macro context, sectors, and movers so a stock call is not interpreted in isolation.", "get_market_brief"],
  ["Review your own Radar", "Tracked positions, position context, recent changes, and upcoming events for the authorized member.", "get_my_radar · get_radar_changes"],
] as const;

const QUESTIONS = [
  "Which stocks on my Radar need attention today, and what actually changed?",
  "Compare NVDA and AMD. Where is the valuation premium justified, and what could invalidate the current calls?",
  "Prepare me for AAPL earnings: current call, key expectations, target room, and the two risks that matter most.",
  "Give me the market setup first, then tell me which of my positions are fighting the tape.",
] as const;

const FAQS = [
  {
    question: "What is the Stocksbrew MCP server?",
    answer: "It is a read-only connection that lets a compatible AI client discover and call six Stocksbrew research tools. The agent receives structured stock, market, and Radar context instead of scraping a web page.",
  },
  {
    question: "Which AI agents can connect?",
    answer: "Any client that supports remote Streamable HTTP MCP can use the server. Claude Code, Cursor, and Codex are common examples; exact setup and OAuth support depend on the client version. Developers can use a personal token and the REST API when MCP is not available.",
  },
  {
    question: "Can the agent trade or change my Radar?",
    answer: "No. Every Stocksbrew agent tool is read-only. It cannot place trades, edit holdings, change Radar, create alerts, or move money.",
  },
  {
    question: "Is agent access included in the $9 Pro plan?",
    answer: `Yes. Active US Pro members get agent and developer access with ${AGENT_MONTHLY_CALL_LIMIT} tool or API calls per calendar month and a ${AGENT_PER_MINUTE_CALL_LIMIT}-call per-minute limit.`,
  },
  {
    question: "Does the API provide raw market-data feeds?",
    answer: "No. It provides bounded Stocksbrew product context and derived intelligence with timestamps and freshness. It does not expose bulk history, raw upstream-provider responses, article bodies, or redistribution rights.",
  },
] as const;

function JsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Stocksbrew for Agents",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: "https://www.stocksbrew.online/agents",
        description: metadata.description,
        offers: { "@type": "Offer", price: "9", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-landing-brand">{children}</p>;
}

export default function AgentsPage() {
  return (
    <main className="min-w-0 flex-grow bg-surface-container-low/30">
      <JsonLd />
      <div className="mx-auto grid w-full max-w-[1320px] lg:grid-cols-[180px_minmax(0,780px)_190px]">
        <aside className="hidden px-5 py-12 lg:block" aria-label="Agent guide navigation">
          <div className="sticky top-24">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface">Agent guide</p>
            <nav className="mt-5 space-y-1 text-[11px] text-on-surface-variant">
              <a href="#why" className="block border-l-2 border-landing-brand py-1.5 pl-3 font-semibold text-on-surface">What it does</a>
              <a href="#example" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Example run</a>
              <a href="#connect" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Connect</a>
              <a href="#capabilities" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Capabilities</a>
              <a href="#questions" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Questions to ask</a>
              <a href="#safety" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Safety & limits</a>
              <a href="#faq" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">FAQ</a>
            </nav>
            <Link href="/developers" className="mt-7 inline-flex text-[11px] font-bold text-landing-brand">Developer reference →</Link>
          </div>
        </aside>

        <article className="min-w-0 border-x border-outline-variant bg-surface">
          <header className="px-5 py-12 sm:px-10 sm:py-16 lg:px-12">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-on-surface-variant">
              <span className="font-semibold text-landing-brand">Stocksbrew</span><span>/</span><span>Agent access</span><span>/</span><span>Overview</span>
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-[2.45rem] font-extrabold leading-[1.04] tracking-tight text-on-surface sm:text-[3.5rem]">
              Give your agent the context behind your stock decisions.
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-on-surface-variant">
              Ask a portfolio question in plain English. Your agent can pull Stocksbrew&apos;s current calls, targets, drivers, risks, market context, and private Radar—then combine them into one decision brief.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/profile#agent-access" className="rounded-full bg-on-surface px-5 py-2.5 text-[12px] font-bold text-surface">Connect with one prompt</Link>
              <Link href="/subscribe" className="rounded-full border border-outline-variant px-5 py-2.5 text-[12px] font-semibold text-on-surface">Included with Pro · $9/month</Link>
            </div>
          </header>

          <section id="why" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Why it is useful</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">The agent does the joining. Stocksbrew supplies the evidence.</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-on-surface-variant">
              Without the connection, an agent can discuss a company in general. With Stocksbrew, it can answer the questions that depend on your product context: what the current call is, why the target moved, whether the stock is in a buy or trim zone, what changed on your Radar, and which assumptions would invalidate the setup.
            </p>
            <dl className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {[
                ["Before a new position", "Compare candidates on one contract and make the trade-offs explicit."],
                ["When a holding moves", "Check the call, drivers, risks, and market regime before reacting to price alone."],
                ["During a portfolio review", "Rank Radar changes and upcoming events so attention goes to the right names first."],
              ].map(([term, detail]) => (
                <div key={term} className="grid gap-1 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-5">
                  <dt className="text-[12px] font-bold text-on-surface">{term}</dt>
                  <dd className="text-[12px] leading-relaxed text-on-surface-variant">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="example" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-8 lg:px-10">
            <div className="px-0 sm:px-2">
              <SectionLabel>See the workflow</SectionLabel>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">From one question to a decision brief.</h2>
              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">The tool trace stays visible, so the result is inspectable instead of feeling like unexplained AI prose.</p>
            </div>
            <div className="mt-7"><AgentResearchWalkthrough /></div>
          </section>

          <section id="connect" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Connect</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Let your agent handle its own setup.</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Copy the prompt below into Claude Code, Cursor, Codex, or another capable agent. It includes the server URL, safe OAuth instructions, and a verification task.</p>
            <AgentSetupPrompt className="mt-7" />
            <p className="mt-5 text-[12px] text-on-surface-variant">
              Prefer to configure it manually? Read the <Link href="/developers#quickstart" className="font-bold text-landing-brand">five-minute quickstart</Link>.
            </p>
          </section>

          <section id="capabilities" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>What it can research</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Four jobs, backed by six bounded tools.</h2>
            <div className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {CAPABILITIES.map(([title, detail, tools]) => (
                <div key={title} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-on-surface">{title}</h3>
                    <code className="text-[9px] text-landing-brand">{tools}</code>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="questions" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Questions worth asking</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Start with a decision, not a ticker lookup.</h2>
            <ol className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {QUESTIONS.map((question, index) => (
                <li key={question} className="grid grid-cols-[28px_1fr] gap-3 py-4 text-[12px] leading-relaxed text-on-surface-variant">
                  <span className="font-mono text-[9px] font-bold text-landing-brand">0{index + 1}</span>
                  <span>“{question}”</span>
                </li>
              ))}
            </ol>
          </section>

          <section id="safety" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Safety & limits</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Research access—not brokerage access.</h2>
            <div className="mt-6 grid gap-x-8 gap-y-4 text-[12px] leading-relaxed text-on-surface-variant sm:grid-cols-2">
              <p><strong className="block text-on-surface">Read-only by design</strong>No trades, money movement, Radar edits, alerts, or account changes.</p>
              <p><strong className="block text-on-surface">Freshness is explicit</strong>Responses include as-of timestamps and freshness status.</p>
              <p><strong className="block text-on-surface">Personal Pro access</strong>{AGENT_MONTHLY_CALL_LIMIT} calls each month with a {AGENT_PER_MINUTE_CALL_LIMIT}-call burst limit.</p>
              <p><strong className="block text-on-surface">Bounded data</strong>No bulk feeds, raw article bodies, provider credentials, resale, or redistribution.</p>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>FAQ</SectionLabel>
            <div className="mt-5 divide-y divide-outline-variant border-y border-outline-variant">
              {FAQS.map((item) => (
                <div key={item.question} className="py-5">
                  <h2 className="text-[14px] font-bold text-on-surface">{item.question}</h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{item.answer}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[10px] leading-relaxed text-on-surface-variant">Claude Code, Cursor, and Codex are examples of compatible clients and are not affiliated with Stocksbrew. Client support varies by product version.</p>
          </section>

          <footer className="border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Use your Stocksbrew context where you already think.</h2>
            <p className="mt-3 text-[13px] text-on-surface-variant">Agent access is included with the detailed calls, targets, and Radar alerts in Pro.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/subscribe" className="rounded-full bg-on-surface px-5 py-2.5 text-[12px] font-bold text-surface">Get Pro for $9/month</Link>
              <Link href="/profile#agent-access" className="rounded-full border border-outline-variant px-5 py-2.5 text-[12px] font-semibold text-on-surface">Connect an agent</Link>
            </div>
          </footer>
        </article>

        <aside className="hidden px-5 py-12 lg:block">
          <div className="sticky top-24">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface">Works with</p>
            <AgentClientLogos compact className="mt-4 flex-col items-stretch" />
            <div className="mt-7 border-y border-outline-variant py-4 text-[10px] leading-relaxed text-on-surface-variant">
              <p className="font-semibold text-on-surface">Included with Pro</p>
              <p className="mt-1">$9/month · read-only · cancel anytime</p>
            </div>
            <p className="mt-5 text-[10px] leading-relaxed text-on-surface-variant">Need endpoints, scopes, or response fields?</p>
            <Link href="/developers" className="mt-2 inline-flex text-[11px] font-bold text-landing-brand">Open the docs →</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
