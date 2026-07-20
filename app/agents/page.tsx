import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentResearchWalkthrough } from "@/components/agent-research-walkthrough";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "AI Stock Agent with Current, Structured Data",
  description: "Give your AI agent current Stocksbrew calls, targets, drivers, risks, and freshness through a read-only stock market MCP server or API.",
  keywords: [
    "AI stock agent",
    "AI agent for stock analysis",
    "ChatGPT stock analysis",
    "current stock data for AI",
    "stock market MCP server",
    "structured stock data API",
    "stock research API for AI agents",
  ],
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Give your AI current, structured stock data",
    description: "Connect Stocksbrew so your AI can retrieve current calls, targets, drivers, risks, and freshness before it answers.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stocksbrew for AI stock agents",
    description: "Current, structured stock context through MCP or API.",
  },
};

const PRIMARY_TOOLS = [
  ["search_stocks", "Find the right ticker or company."],
  ["get_stock_intelligence", "Get the current call, target, drivers, risks, scores, and freshness."],
  ["compare_stocks", "Compare two to five stocks through the same structured contract."],
] as const;

const SEO_TOPICS = [
  {
    title: "AI agent for stock analysis",
    body: "Use Stocksbrew as the read-only stock context behind your agent. It retrieves the data first; the model reasons over it second.",
    href: "/developers",
    link: "Open the integration guide",
  },
  {
    title: "Current stock data for AI",
    body: "Every successful response includes an as-of time and freshness status, so the agent can show when its stock context was produced.",
    href: "/developers#response",
    link: "See the response contract",
  },
  {
    title: "Stock market MCP server",
    body: "Add one remote MCP URL to a compatible client. Stocksbrew handles OAuth and exposes bounded, read-only research tools.",
    href: "/developers#manual",
    link: "See the MCP setup",
  },
  {
    title: "Structured stock data API",
    body: "Developers can call the same stock contract over REST with a personal token. Responses are designed for code and AI workflows.",
    href: "/developers#rest",
    link: "Read the API reference",
  },
  {
    title: "ChatGPT stock analysis with a data layer",
    body: "A GPT can only reason over the context available to it. Use Stocksbrew through a compatible client or your own API workflow to add current stock fields.",
    href: "/blog/how-to-connect-ai-agent-stock-market-data-mcp",
    link: "Read the practical guide",
  },
  {
    title: "Claude, Cursor, and Codex stock research",
    body: "Connect a supported MCP client, approve access, and ask normal stock questions. No page scraping or manual copy-paste is required.",
    href: "/profile#agent-access",
    link: "Connect an agent",
  },
] as const;

const FAQS = [
  {
    question: "Why do AI stock answers often feel generic?",
    answer: "Without a connected source, an AI can only use the context already available to it. That often leads to a broad company summary with unclear freshness. Stocksbrew supplies a current, consistent stock record before the model answers.",
  },
  {
    question: "What stock data does Stocksbrew give an AI agent?",
    answer: "For a supported stock, the main tool returns the current call, target context, buy and trim zones, drivers, risks, fundamentals, scores, an as-of timestamp, and freshness status.",
  },
  {
    question: "Is Stocksbrew a stock market MCP server?",
    answer: "Yes. Stocksbrew provides a hosted remote MCP server for compatible AI clients and a read-only REST API for custom applications.",
  },
  {
    question: "Can the AI place trades?",
    answer: "No. Agent access is read-only. It cannot trade, move money, or change your account.",
  },
  {
    question: "Which AI clients can connect?",
    answer: "Any client that supports remote Streamable HTTP MCP can use the server. Claude Code, Cursor, and Codex are common examples. Client support varies by product version.",
  },
  {
    question: "Is agent access included with Stocksbrew Pro?",
    answer: `Yes. Active US Pro members get ${AGENT_MONTHLY_CALL_LIMIT} combined MCP or API calls per calendar month, with a ${AGENT_PER_MINUTE_CALL_LIMIT}-call per-minute limit.`,
  },
] as const;

function JsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Stocksbrew for AI Agents",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: "https://www.stocksbrew.online/agents",
        description: metadata.description,
        offers: { "@type": "Offer", price: "9", priceCurrency: "USD" },
      },
      {
        "@type": "WebAPI",
        name: "Stocksbrew stock intelligence API",
        url: "https://www.stocksbrew.online/developers",
        documentation: "https://www.stocksbrew.online/developers",
        description: "Read-only, structured Stocksbrew stock intelligence for MCP clients and developer applications.",
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
        <aside className="hidden px-5 py-12 lg:block" aria-label="Agent access navigation">
          <div className="sticky top-24">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface">Agent access</p>
            <nav className="mt-5 space-y-1 text-[11px] text-on-surface-variant">
              <a href="#difference" className="block border-l-2 border-landing-brand py-1.5 pl-3 font-semibold text-on-surface">Why connect</a>
              <a href="#connect" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Connect</a>
              <a href="#data" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Stock data</a>
              <a href="#use-cases" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">Use cases</a>
              <a href="#faq" className="block border-l-2 border-transparent py-1.5 pl-3 hover:text-on-surface">FAQ</a>
            </nav>
            <Link href="/developers" className="mt-7 inline-flex text-[11px] font-bold text-landing-brand">Developer docs →</Link>
          </div>
        </aside>

        <article className="min-w-0 border-x border-outline-variant bg-surface">
          <header className="px-5 py-12 sm:px-10 sm:py-16 lg:px-12">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-on-surface-variant">
              <span className="font-semibold text-landing-brand">Stocksbrew</span><span>/</span><span>AI agents</span>
            </div>
            <h1 className="mt-6 max-w-2xl font-display text-[2.45rem] font-extrabold leading-[1.04] tracking-tight text-on-surface sm:text-[3.5rem]">
              Give your AI current, structured stock data.
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-on-surface-variant">
              Without a connected source, AI stock answers can be generic and difficult to verify. Stocksbrew supplies current calls, targets, drivers, risks, and freshness before the model answers.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="#connect" className="rounded-full bg-on-surface px-5 py-2.5 text-[12px] font-bold text-surface">Copy the setup prompt</Link>
              <Link href="/subscribe" className="rounded-full border border-outline-variant px-5 py-2.5 text-[12px] font-semibold text-on-surface">Included with Pro · $9/month</Link>
            </div>
          </header>

          <section id="difference" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-8 lg:px-10">
            <div className="px-0 sm:px-2">
              <SectionLabel>The difference</SectionLabel>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Same question. Better context.</h2>
            </div>
            <div className="mt-7"><AgentResearchWalkthrough /></div>
          </section>

          <section id="connect" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Connect</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">One prompt does the setup.</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Paste this into a capable agent. It will connect through OAuth or return the exact manual steps.</p>
            <AgentSetupPrompt className="mt-7" />
          </section>

          <section id="data" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Structured stock data</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Three tools cover the core job.</h2>
            <div className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {PRIMARY_TOOLS.map(([name, description]) => (
                <div key={name} className="grid gap-2 py-4 sm:grid-cols-[190px_1fr] sm:gap-5">
                  <code className="text-[10px] font-semibold text-landing-brand">{name}</code>
                  <p className="text-[12px] leading-relaxed text-on-surface-variant">{description}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-on-surface-variant">
              Every successful response includes an as-of timestamp, freshness status, schema version, and current usage. See the <Link href="/developers#tools" className="font-bold text-landing-brand">complete tool reference</Link> for optional market and account-scoped endpoints.
            </p>
          </section>

          <section id="use-cases" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Common searches</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">A stock data layer for the AI you already use.</h2>
            <div className="mt-7 grid border-l border-t border-outline-variant sm:grid-cols-2">
              {SEO_TOPICS.map((topic) => (
                <section key={topic.title} className="border-b border-r border-outline-variant p-5">
                  <h3 className="text-[14px] font-bold text-on-surface">{topic.title}</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">{topic.body}</p>
                  <Link href={topic.href} className="mt-3 inline-flex text-[10px] font-bold text-landing-brand">{topic.link} →</Link>
                </section>
              ))}
            </div>
          </section>

          <section className="border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Boundaries</SectionLabel>
            <div className="mt-6 grid gap-x-8 gap-y-4 text-[12px] leading-relaxed text-on-surface-variant sm:grid-cols-2">
              <p><strong className="block text-on-surface">Read-only</strong>No trades, money movement, or account changes.</p>
              <p><strong className="block text-on-surface">Timestamped</strong>As-of time and freshness travel with the result.</p>
              <p><strong className="block text-on-surface">Personal Pro access</strong>{AGENT_MONTHLY_CALL_LIMIT} calls per month with a {AGENT_PER_MINUTE_CALL_LIMIT}-call burst limit.</p>
              <p><strong className="block text-on-surface">Bounded use</strong>No bulk extraction, resale, or redistribution.</p>
            </div>
          </section>

          <section id="faq" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Questions</SectionLabel>
            <div className="mt-5 divide-y divide-outline-variant border-y border-outline-variant">
              {FAQS.map((item) => (
                <div key={item.question} className="py-5">
                  <h2 className="text-[14px] font-bold text-on-surface">{item.question}</h2>
                  <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{item.answer}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-[10px] leading-relaxed text-on-surface-variant">Claude Code, Cursor, Codex, and ChatGPT are not affiliated with Stocksbrew. Client support varies by product and version.</p>
          </section>

          <footer className="border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Give your AI the stock context it is missing.</h2>
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
            <Link href="/developers" className="mt-5 inline-flex text-[11px] font-bold text-landing-brand">Open the docs →</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
