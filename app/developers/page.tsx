import type { Metadata } from "next";
import Link from "next/link";

import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "Stock Market MCP Server & Structured Stock API",
  description: "Connect an AI agent to current, structured Stocksbrew stock intelligence with remote MCP or a read-only REST API.",
  keywords: ["stock market MCP server", "structured stock API", "stock data API for AI", "AI agent stock tools", "MCP finance"],
  alternates: { canonical: "/developers" },
  openGraph: {
    title: "Stocksbrew stock market MCP server and API",
    description: "Current, structured stock intelligence for compatible AI agents and developer workflows.",
    url: "https://www.stocksbrew.online/developers",
  },
};

const TOOLS = [
  ["search_stocks", "stocks:read", "Find a ticker or company."],
  ["get_stock_intelligence", "stocks:read", "Get the current call, zones, target, drivers, risks, scores, and freshness."],
  ["compare_stocks", "stocks:read", "Compare two to five stocks through one contract."],
  ["get_market_brief", "market:read", "Get the current market, sector, and mover context."],
  ["get_my_radar", "radar:read", "Get the authorized member's tracked stocks."],
  ["get_radar_changes", "radar:read", "Get recent changes across the member's Radar."],
] as const;

function SectionLabel({ children }: { children: string }) {
  return <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-landing-brand">{children}</p>;
}

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-5 overflow-hidden border border-outline-variant bg-surface-container-low/50">
      <div className="border-b border-outline-variant px-4 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{label}</div>
      <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[10px] leading-[1.75] text-on-surface">{children}</pre>
    </div>
  );
}

export default function DevelopersPage() {
  const base = publicAppUrl();
  const mcpUrl = `${base}/api/mcp`;
  const config = `{
  "mcpServers": {
    "stocksbrew": {
      "url": "${mcpUrl}"
    }
  }
}`;
  const curl = `curl -H "Authorization: Bearer $STOCKSBREW_TOKEN" \\
  "${base}/api/v1/stocks/NVDA"`;
  const response = `{
  "schema_version": "2026-07-20",
  "as_of": "2026-07-20T14:35:00Z",
  "freshness": {
    "status": "fresh",
    "age_hours": 0.4
  },
  "stock": { "ticker": "NVDA" },
  "call": { "directive": "..." },
  "usage": { "used": 18, "remaining": 482 }
}`;

  return (
    <main className="min-w-0 flex-grow bg-surface-container-low/30">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebAPI",
            name: "Stocksbrew stock intelligence API",
            url: "https://www.stocksbrew.online/developers",
            documentation: "https://www.stocksbrew.online/developers",
            description: metadata.description,
          }),
        }}
      />
      <div className="mx-auto grid w-full max-w-[1360px] lg:grid-cols-[220px_minmax(0,800px)_220px]">
        <aside className="hidden px-6 py-10 lg:block" aria-label="Documentation navigation">
          <div className="sticky top-24">
            <Link href="/developers" className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface">Stocksbrew docs</Link>
            <p className="mt-1 text-[10px] text-on-surface-variant">Agents & developer access</p>
            <nav className="mt-7 space-y-5 text-[11px]">
              <div>
                <p className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">Get started</p>
                <div className="mt-2 space-y-1">
                  <a href="#overview" className="block border-l-2 border-landing-brand py-1.5 pl-3 font-semibold text-on-surface">Overview</a>
                  <a href="#quickstart" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">Quickstart</a>
                  <a href="#manual" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">Manual setup</a>
                </div>
              </div>
              <div>
                <p className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">Reference</p>
                <div className="mt-2 space-y-1">
                  <a href="#tools" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">MCP tools</a>
                  <a href="#rest" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">REST API</a>
                  <a href="#response" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">Response contract</a>
                  <a href="#auth" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">Auth & scopes</a>
                  <a href="#limits" className="block border-l-2 border-transparent py-1.5 pl-3 text-on-surface-variant hover:text-on-surface">Limits</a>
                </div>
              </div>
            </nav>
          </div>
        </aside>

        <article className="min-w-0 border-x border-outline-variant bg-surface">
          <header id="overview" className="scroll-mt-24 px-5 py-10 sm:px-10 sm:py-14 lg:px-12">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-on-surface-variant">
              <span className="font-semibold text-landing-brand">Docs</span><span>/</span><span>Agents</span><span>/</span><span>Overview</span>
            </div>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-on-surface sm:text-[2.75rem]">Stock market MCP server and API</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant">
              Give an AI agent current, structured Stocksbrew stock intelligence. Use remote MCP with OAuth or REST with a personal token.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-outline-variant py-4 text-[11px] sm:grid-cols-4">
              <div><span className="block font-semibold text-on-surface">Protocol</span><span className="text-on-surface-variant">MCP + REST</span></div>
              <div><span className="block font-semibold text-on-surface">Authentication</span><span className="text-on-surface-variant">OAuth or token</span></div>
              <div><span className="block font-semibold text-on-surface">Access</span><span className="text-on-surface-variant">Read-only</span></div>
              <div><span className="block font-semibold text-on-surface">Plan</span><span className="text-on-surface-variant">Stocksbrew Pro</span></div>
            </div>
          </header>

          <section id="quickstart" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Quickstart</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Connect with one prompt</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
              Paste this into the client you want to use. It includes the server URL, OAuth, and a verification step.
            </p>
            <AgentSetupPrompt className="mt-7" />
            <ol className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {[
                ["01", "Paste", "The agent adds the server or returns manual instructions."],
                ["02", "Approve", "Sign in to Stocksbrew and approve read-only access."],
                ["03", "Verify", "The agent retrieves the current NVDA record."],
              ].map(([number, title, detail]) => (
                <li key={number} className="grid gap-2 py-4 sm:grid-cols-[36px_150px_1fr] sm:gap-4">
                  <span className="font-mono text-[9px] font-bold text-landing-brand">{number}</span>
                  <span className="text-[12px] font-bold text-on-surface">{title}</span>
                  <span className="text-[12px] leading-relaxed text-on-surface-variant">{detail}</span>
                </li>
              ))}
            </ol>
          </section>

          <section id="manual" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Manual MCP setup</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">One remote server URL</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
              Add <code className="font-semibold text-on-surface">{mcpUrl}</code> as a remote MCP server. OAuth-capable clients will open the approval flow.
            </p>
            <CodeBlock label="Generic MCP configuration">{config}</CodeBlock>
            <div className="mt-6 border-l-2 border-landing-brand pl-4 text-[12px] leading-relaxed text-on-surface-variant">
              Use OAuth for interactive clients. Use a personal token for scripts or clients that require an <code>Authorization: Bearer</code> header.
            </div>
          </section>

          <section id="tools" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>MCP tools</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Available tools</h2>
            <div className="mt-6 overflow-x-auto border-y border-outline-variant">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead className="bg-surface-container-low/60 font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant">
                  <tr><th className="px-3 py-2.5 font-semibold">Tool</th><th className="px-3 py-2.5 font-semibold">Scope</th><th className="px-3 py-2.5 font-semibold">Returns</th></tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-[11px]">
                  {TOOLS.map(([name, scope, description]) => (
                    <tr key={name} className="align-top">
                      <td className="px-3 py-3"><code className="font-semibold text-landing-brand">{name}</code></td>
                      <td className="px-3 py-3 font-mono text-[9px] text-on-surface">{scope}</td>
                      <td className="px-3 py-3 leading-relaxed text-on-surface-variant">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="rest" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>REST API</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Use the same contract without MCP</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Create a personal token in Profile and send it as a Bearer token to <code>{base}/api/v1</code>.</p>
            <CodeBlock label="GET one stock">{curl}</CodeBlock>
            <div className="mt-6 overflow-x-auto border-y border-outline-variant">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <tbody className="divide-y divide-outline-variant">
                  {[
                    ["GET", "/stocks/search?q=...", "Search stocks"],
                    ["GET", "/stocks/{symbol}", "Get one stock"],
                    ["POST", "/compare", "Compare stocks"],
                    ["GET", "/market", "Get market context"],
                    ["GET", "/radar", "Get tracked stocks"],
                    ["GET", "/radar/changes", "Get tracked-stock changes"],
                  ].map(([method, path, detail]) => (
                    <tr key={path}><td className="w-16 py-3 font-mono text-[9px] font-bold text-landing-brand">{method}</td><td className="py-3 font-mono text-[10px] text-on-surface">{path}</td><td className="py-3 text-on-surface-variant">{detail}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="response" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Response contract</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Freshness is part of the response</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Responses include the schema version, as-of time, freshness, returned data, and usage.</p>
            <CodeBlock label="Example shape · values shortened">{response}</CodeBlock>
          </section>

          <section id="auth" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Authentication & scopes</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">OAuth for people. Personal tokens for code.</h2>
            <dl className="mt-6 divide-y divide-outline-variant border-y border-outline-variant text-[12px]">
              <div className="grid gap-2 py-4 sm:grid-cols-[170px_1fr]"><dt className="font-bold text-on-surface">OAuth + PKCE</dt><dd className="leading-relaxed text-on-surface-variant">For interactive clients. Stocksbrew handles sign-in, consent, and token refresh.</dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[170px_1fr]"><dt className="font-bold text-on-surface">Personal token</dt><dd className="leading-relaxed text-on-surface-variant">For scripts and local tools. Shown once and revocable in Profile.</dd></div>
              <div className="grid gap-2 py-4 sm:grid-cols-[170px_1fr]"><dt className="font-bold text-on-surface">Scopes</dt><dd className="font-mono text-[10px] leading-relaxed text-on-surface-variant">stocks:read · market:read · radar:read</dd></div>
            </dl>
          </section>

          <section id="limits" className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <SectionLabel>Limits & use</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">Usage and limits</h2>
            <ul className="mt-6 divide-y divide-outline-variant border-y border-outline-variant text-[12px] text-on-surface-variant">
              <li className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><strong className="text-on-surface">Monthly allowance</strong><span>{AGENT_MONTHLY_CALL_LIMIT} combined MCP tool calls or REST requests.</span></li>
              <li className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><strong className="text-on-surface">Burst limit</strong><span>{AGENT_PER_MINUTE_CALL_LIMIT} calls per minute. HTTP 429 includes Retry-After.</span></li>
              <li className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><strong className="text-on-surface">Entitlement</strong><span>Active Pro is checked on every authenticated request.</span></li>
              <li className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]"><strong className="text-on-surface">Not included</strong><span>Bulk extraction, mirroring, resale, redistribution, trading, or account writes.</span></li>
            </ul>
          </section>

          <footer className="border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
            <h2 className="text-xl font-extrabold text-on-surface">Reference links</h2>
            <div className="mt-5 grid gap-3 text-[12px] sm:grid-cols-2">
              <a href="/api/v1/openapi.json" className="font-semibold text-landing-brand">OpenAPI 3.1 →</a>
              <a href="/.well-known/oauth-protected-resource" className="font-semibold text-landing-brand">Protected resource metadata →</a>
              <a href="/.well-known/oauth-authorization-server" className="font-semibold text-landing-brand">Authorization server metadata →</a>
              <Link href="/legal/terms" className="font-semibold text-landing-brand">Agent terms →</Link>
            </div>
          </footer>
        </article>

        <aside className="hidden px-6 py-10 lg:block" aria-label="On this page">
          <div className="sticky top-24">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface">On this page</p>
            <nav className="mt-4 space-y-2 text-[10px] text-on-surface-variant">
              <a href="#quickstart" className="block hover:text-on-surface">Quickstart</a>
              <a href="#manual" className="block hover:text-on-surface">Manual setup</a>
              <a href="#tools" className="block hover:text-on-surface">MCP tools</a>
              <a href="#rest" className="block hover:text-on-surface">REST API</a>
              <a href="#response" className="block hover:text-on-surface">Response contract</a>
              <a href="#auth" className="block hover:text-on-surface">Authentication</a>
              <a href="#limits" className="block hover:text-on-surface">Limits</a>
            </nav>
            <div className="mt-7 border-y border-outline-variant py-4 text-[10px] leading-relaxed text-on-surface-variant">
              <p className="font-semibold text-on-surface">Remote MCP</p>
              <code className="mt-2 block break-all text-[9px] text-landing-brand">{mcpUrl}</code>
            </div>
            <Link href="/profile#agent-access" className="mt-5 inline-flex text-[11px] font-bold text-landing-brand">Manage access →</Link>
            <Link href="/agents" className="mt-2 block text-[10px] font-semibold text-on-surface-variant hover:text-on-surface">Why connect Stocksbrew</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
