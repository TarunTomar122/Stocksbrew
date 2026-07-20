import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "Stocksbrew for Agents & Developers",
  description: "Connect Stocksbrew Pro intelligence to MCP agents or the read-only developer API.",
  keywords: ["stock market API", "stock MCP server", "AI agent tools", "stock intelligence API", "MCP finance"],
  alternates: { canonical: "/developers" },
  openGraph: {
    title: "Stocksbrew MCP & Developer API",
    description: "A read-only interface for stock intelligence, market context, comparisons, and private Radar data.",
    url: "https://www.stocksbrew.online/developers",
  },
};

const TOOLS = [
  ["search_stocks", "Resolve a ticker or company name."],
  ["get_stock_intelligence", "Calls, zones, target context, drivers, risks, scores, and freshness."],
  ["compare_stocks", "Side-by-side intelligence for two to five stocks."],
  ["get_market_brief", "Market sentiment, macro context, sectors, and movers."],
  ["get_my_radar", "The authorized member's private tracked-stock workspace."],
  ["get_radar_changes", "Fresh changes and upcoming events on Radar."],
] as const;

export default function DevelopersPage() {
  const base = publicAppUrl();
  const mcpUrl = `${base}/api/mcp`;
  const curl = `curl -H "Authorization: Bearer $STOCKSBREW_TOKEN" \\
  "${base}/api/v1/stocks/NVDA"`;
  return (
    <main className="flex-grow bg-background">
      <div className="mx-auto w-full max-w-[1040px] px-4 py-10 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-landing-brand">Stocksbrew for Agents</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-on-surface sm:text-5xl">Put the Stocksbrew research layer inside your agent.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant">
            Pro members can connect an MCP client or call a small, read-only API for current stock intelligence, market context, and their private Radar.
          </p>
          <AgentClientLogos compact className="mt-5" />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/profile" className="rounded-full bg-landing-brand px-5 py-2.5 text-[13px] font-bold text-white">Create a token</Link>
            <Link href="/agents" className="rounded-full border border-outline-variant px-5 py-2.5 text-[13px] font-semibold text-on-surface">See agent examples</Link>
            <Link href="/subscribe" className="rounded-full border border-outline-variant px-5 py-2.5 text-[13px] font-semibold text-on-surface">Get Pro</Link>
          </div>
        </header>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">Remote MCP</p>
            <h2 className="mt-2 text-lg font-bold text-on-surface">One URL, six tools</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">Add this URL to any Streamable HTTP MCP client. OAuth-capable clients will open the Stocksbrew approval screen.</p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-[#07110c] p-4 text-[11px] text-[#9ff7bd]">{mcpUrl}</pre>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">REST API</p>
            <h2 className="mt-2 text-lg font-bold text-on-surface">The same contract without MCP</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">Use a personal token as a Bearer token. Responses include structured data, freshness, usage, and an informational-use notice.</p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-[#07110c] p-4 text-[11px] leading-relaxed text-[#9ff7bd]">{curl}</pre>
          </div>
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-3">
          {[
            ["OAuth for people", "Give an OAuth-capable client the MCP URL. Stocksbrew handles sign-in, consent, scopes, short-lived access tokens, and rotating refresh tokens."],
            ["Personal tokens for code", "Create a token in Profile when a script, local tool, or client needs an Authorization: Bearer header. The secret is shown once."],
            ["One quota", `MCP tool calls and REST requests share the same ${AGENT_MONTHLY_CALL_LIMIT}-call monthly allowance and ${AGENT_PER_MINUTE_CALL_LIMIT}-call burst limit.`],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-outline-variant bg-surface p-5">
              <h2 className="text-[15px] font-bold text-on-surface">{title}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-extrabold text-on-surface">Available tools</h2>
          <div className="mt-4 divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant bg-surface">
            {TOOLS.map(([name, description]) => (
              <div key={name} className="grid gap-1 p-4 sm:grid-cols-[220px_1fr] sm:gap-4">
                <code className="text-[12px] font-semibold text-landing-brand">{name}</code>
                <p className="text-[13px] text-on-surface-variant">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["Allowance", `${AGENT_MONTHLY_CALL_LIMIT} tool or API calls each month`],
            ["Burst limit", `${AGENT_PER_MINUTE_CALL_LIMIT} calls per minute`],
            ["Access", "Read-only and tied to an active Pro account"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-outline-variant bg-surface p-5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">{title}</p>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed text-on-surface">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">Response contract</p>
            <h2 className="mt-2 text-lg font-bold text-on-surface">Built for agents that need to know when data was true.</h2>
            <ul className="mt-4 space-y-2 text-[12px] leading-relaxed text-on-surface-variant">
              <li>• <code className="text-on-surface">schema_version</code> for contract changes</li>
              <li>• <code className="text-on-surface">as_of</code> and freshness status on data responses</li>
              <li>• Explicit informational-use notice</li>
              <li>• Current quota usage on successful calls</li>
              <li>• Bounded lists and predictable tool-specific objects</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">Safety boundary</p>
            <h2 className="mt-2 text-lg font-bold text-on-surface">Research access, not brokerage access.</h2>
            <ul className="mt-4 space-y-2 text-[12px] leading-relaxed text-on-surface-variant">
              <li>• No trading, account, alert, or Radar write tools</li>
              <li>• No bulk-universe or raw-history endpoints</li>
              <li>• No raw article bodies or provider credentials</li>
              <li>• Pro entitlement checked on every authenticated request</li>
              <li>• Per-token scopes for stocks, market, and private Radar</li>
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold text-on-surface">Personal developer use</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
            Pro access is for your own agents, scripts, and internal workflows. Bulk extraction, mirroring, resale, redistribution, and serving Stocksbrew data to another product&apos;s users are not included. Contact us before building a commercial integration.
          </p>
          <p className="mt-3 text-[12px] text-on-surface-variant">
            Machine-readable API description: <a className="font-semibold text-landing-brand" href="/api/v1/openapi.json">OpenAPI 3.1</a>.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-[12px]">
            <a href="/.well-known/oauth-protected-resource" className="font-semibold text-landing-brand">Protected resource metadata</a>
            <a href="/.well-known/oauth-authorization-server" className="font-semibold text-landing-brand">Authorization server metadata</a>
            <Link href="/legal/terms" className="font-semibold text-landing-brand">Agent terms</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
