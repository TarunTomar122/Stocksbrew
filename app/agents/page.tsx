import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

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

const TOOLS = [
  ["search_stocks", "Find the right ticker before the agent starts its research."],
  ["get_stock_intelligence", "Read the current call, target, drivers, risks, scores, fundamentals, and freshness."],
  ["compare_stocks", "Compare two to five stocks across valuation, growth, quality, momentum, and returns."],
  ["get_market_brief", "Pull the current market read, macro context, sector flows, and movers."],
  ["get_my_radar", "Read the authorized Pro member's tracked stocks and position context."],
  ["get_radar_changes", "Find fresh changes and upcoming events across the member's Radar."],
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

export default function AgentsPage() {
  const base = publicAppUrl();
  const serverUrl = `${base}/api/mcp`;
  const config = `{
  "mcpServers": {
    "stocksbrew": {
      "url": "${serverUrl}"
    }
  }
}`;
  const rest = `curl -H "Authorization: Bearer $STOCKSBREW_TOKEN" \\
  "${base}/api/v1/stocks/NVDA"`;

  return (
    <main className="min-w-0 flex-grow bg-background">
      <JsonLd />
      <section className="relative overflow-hidden border-b border-outline-variant bg-surface">
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(34,197,94,0.13),transparent_68%)]" aria-hidden />
        <div className="relative mx-auto flex w-full max-w-[1120px] flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-landing-brand/25 bg-landing-brand/[0.06] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" /> Included with Pro
          </span>
          <h1 className="mt-6 max-w-4xl font-display text-[2.35rem] font-extrabold leading-[1.05] tracking-tight text-on-surface sm:text-5xl lg:text-[4rem]">
            Your AI agent, now fluent in <span className="text-landing-brand">your stocks.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-on-surface-variant sm:text-[18px]">
            Give Claude Code, Cursor, Codex, or your own agent the Stocksbrew research layer: current calls, targets, drivers, risks, market context, and your private Radar.
          </p>
          <AgentClientLogos className="mt-8 justify-center" />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/subscribe" className="inline-flex rounded-full bg-on-surface px-6 py-3 text-[14px] font-bold text-surface">Get Pro for $9/month</Link>
            <Link href="/profile#agent-access" className="inline-flex rounded-full border border-outline-variant bg-surface px-6 py-3 text-[14px] font-semibold text-on-surface">Connect an agent</Link>
          </div>
          <div className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
            <span>6 research tools</span><span>Read-only</span><span>OAuth + personal tokens</span><span>Freshness included</span>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-surface-container-low/30">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">How it works</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-on-surface">Connect once. Ask in plain English.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Add Stocksbrew", "Paste the remote MCP URL into a compatible client, or create a personal token for scripts and REST."],
              ["02", "Approve read access", "Sign in to Stocksbrew and choose the scopes the client can read. Pro status is checked on every request."],
              ["03", "Give the agent a job", "Ask for one stock, a comparison, the market brief, or changes across your private Radar."],
            ].map(([number, title, body]) => (
              <div key={number} className="rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
                <span className="font-mono text-[11px] font-bold text-landing-brand">{number}</span>
                <h3 className="mt-4 text-lg font-bold text-on-surface">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-background">
        <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">What your agent can ask</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-on-surface">Real research jobs, not another chat wrapper.</h2>
            <p className="mt-4 text-[14px] leading-relaxed text-on-surface-variant">The agent chooses a bounded tool, Stocksbrew returns structured context with an as-of time, and the agent explains or combines it for the task you gave it.</p>
            <div className="mt-6 rounded-2xl border border-outline-variant bg-[#07110c] p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">Try asking</p>
              <div className="mt-3 space-y-3">
                {[
                  "Compare NVDA and AMD. Where does the valuation premium look justified?",
                  "What changed on my Radar since the last market close?",
                  "Summarize today's market setup and the sectors leading it.",
                  "For AAPL, separate the bull case, bear case, target room, and invalidation risks.",
                ].map((prompt) => <p key={prompt} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-[11px] leading-relaxed text-white/75">“{prompt}”</p>)}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOOLS.map(([name, description]) => (
              <div key={name} className="rounded-2xl border border-outline-variant bg-surface p-5">
                <code className="text-[11px] font-bold text-landing-brand">{name}</code>
                <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="connect" className="border-b border-outline-variant bg-surface">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-outline-variant bg-[#07110c]">
              <div className="border-b border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">MCP · OAuth recommended</div>
              <pre className="overflow-x-auto p-5 text-[11px] leading-relaxed text-[#9ff7bd]">{config}</pre>
            </div>
            <div className="overflow-hidden rounded-2xl border border-outline-variant bg-[#07110c]">
              <div className="border-b border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">REST · personal token</div>
              <pre className="overflow-x-auto p-5 text-[11px] leading-relaxed text-[#9ff7bd]">{rest}</pre>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-outline-variant bg-surface-container-low p-5">
            <div>
              <p className="text-[14px] font-bold text-on-surface">Building your own agent or workflow?</p>
              <p className="mt-1 text-[12px] text-on-surface-variant">See endpoint details, OAuth discovery, scopes, OpenAPI, and response contracts.</p>
            </div>
            <Link href="/developers" className="inline-flex rounded-full bg-on-surface px-5 py-2.5 text-[12px] font-bold text-surface">Open developer docs →</Link>
          </div>
          <p className="mt-4 text-center text-[10px] text-on-surface-variant">New to the protocol? Read the <a href="https://modelcontextprotocol.io/docs/getting-started/intro" rel="noopener noreferrer" className="font-semibold text-landing-brand">official MCP introduction</a>.</p>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-background">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-outline-variant bg-surface p-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">For individual investors</p>
              <h2 className="mt-3 text-2xl font-extrabold text-on-surface">Turn your Radar into a research conversation.</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant">Ask what changed, compare candidates before adding one, or have your agent prepare a review around earnings and risk. The agent sees only the Stocksbrew context you authorize.</p>
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface p-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">For developers</p>
              <h2 className="mt-3 text-2xl font-extrabold text-on-surface">Prototype with a stable, bounded contract.</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant">Use MCP for tool discovery or REST for scripts and internal automations. Every successful response includes a schema version, freshness, and usage. Pro is personal and internal use—not a data-resale license.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-surface-container-low/30">
        <div className="mx-auto w-full max-w-[860px] px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">Questions about agent access</h2>
          <div className="mt-8 divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-surface">
            {FAQS.map((item) => (
              <div key={item.question} className="p-5 sm:p-6">
                <h3 className="text-[15px] font-bold text-on-surface">{item.question}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{item.answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-on-surface-variant">Claude Code, Cursor, and Codex are examples of compatible agent clients and are not affiliated with Stocksbrew. Client support varies by product version.</p>
        </div>
      </section>

      <section className="bg-[#07110c]">
        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center px-4 py-16 text-center sm:px-6 lg:py-20">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86efac]">Included with Stocksbrew Pro</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Put your research where your agent works.</h2>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-white/60">$9/month for the detailed calls, targets, Radar alerts, and agent access. Read-only, cancel anytime.</p>
          <Link href="/subscribe" className="mt-7 inline-flex rounded-full bg-[#4ade80] px-6 py-3 text-[14px] font-bold text-[#07110c]">Get Stocksbrew Pro</Link>
        </div>
      </section>
    </main>
  );
}
