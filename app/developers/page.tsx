import type { Metadata } from "next";
import Link from "next/link";

import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { AGENT_MONTHLY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "Stocksbrew MCP Server and Stock API for AI Agents",
  description: "Connect Claude Code, Hermes, OpenClaw, or your own agent to stock research, Radar, changes, and alerts through MCP or REST.",
  keywords: ["stock market MCP server", "Hermes stock market data", "OpenClaw stock alerts", "AI agent stock API", "MCP finance"],
  alternates: { canonical: "/developers" },
};

const TOOLS = [
  ["search_stocks", "stocks:read", "Find a ticker or company."],
  ["get_stock_intelligence", "stocks:read", "Read baseline data, detailed research when available, freshness, and the next action."],
  ["compare_stocks", "stocks:read", "Compare two to five stocks."],
  ["get_market_brief", "market:read", "Read the current market, sectors, and movers."],
  ["get_my_radar", "radar:read", "Read the authorized member's Radar."],
  ["get_radar_changes", "radar:read", "Read unseen Radar changes from an optional cursor."],
  ["add_to_radar", "radar:write", "Track a stock and queue or refresh missing research."],
  ["remove_from_radar", "radar:write", "Stop tracking a stock."],
  ["get_my_alerts", "alerts:read", "Read active alert rules."],
  ["create_alert", "alerts:write", "Create a price threshold email alert."],
  ["delete_alert", "alerts:write", "Deactivate an alert rule."],
] as const;

const ENDPOINTS = [
  ["GET", "/stocks/search?q=CCL", "Search stocks"],
  ["GET", "/stocks/CCL", "Read stock intelligence and research state"],
  ["POST", "/compare", "Compare stocks"],
  ["GET", "/market", "Read market context"],
  ["GET", "/radar?limit=50&offset=0", "Read Radar"],
  ["POST", "/radar", "Add to Radar"],
  ["DELETE", "/radar", "Remove from Radar"],
  ["GET", "/radar/changes?since=<cursor>", "Read changes"],
  ["GET", "/alerts?ticker=NVDA", "Read alert rules"],
  ["POST", "/alerts", "Create a price alert"],
  ["DELETE", "/alerts", "Deactivate an alert"],
] as const;

function Label({ children }: { children: string }) {
  return <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] text-landing-brand">{children}</p>;
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-5 overflow-hidden border-y border-outline-variant bg-surface-container-low/40">
      <div className="border-b border-outline-variant px-4 py-2 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{label}</div>
      <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[10px] leading-[1.75] text-on-surface">{children}</pre>
    </div>
  );
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-outline-variant px-5 py-10 sm:px-10 lg:px-12">
      <Label>{label}</Label>
      <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-on-surface">{title}</h2>
      {children}
    </section>
  );
}

export default function DevelopersPage() {
  const base = publicAppUrl();
  const mcpUrl = `${base}/api/mcp`;
  const baseline = `{
  "instrument": { "ticker": "CCL", "name": "Carnival" },
  "market_data": { "price": 27.81 },
  "coverage": {
    "status": "baseline_only",
    "tracked_in_radar": false,
    "has_baseline_data": true,
    "has_detailed_call": false,
    "next_action": {
      "action": "ask_to_add_to_radar",
      "tool": "add_to_radar"
    }
  }
}`;
  const alert = `POST ${base}/api/v1/alerts
Authorization: Bearer $STOCKSBREW_TOKEN
Content-Type: application/json

{
  "ticker": "NVDA",
  "kind": "price_threshold",
  "condition": "below",
  "target_price": 190
}`;

  return (
    <main className="min-w-0 flex-grow bg-surface">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "WebAPI", name: "Stocksbrew agent API",
        url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers",
        description: metadata.description,
      }) }} />
      <article className="mx-auto min-w-0 max-w-[920px] border-x border-outline-variant bg-surface">
        <header id="overview" className="px-5 py-10 sm:px-10 sm:py-14 lg:px-12">
          <Label>Agent API</Label>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-on-surface sm:text-[2.75rem]">Research, Radar, and alerts for your agent</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant">
            Connect Claude Code, Hermes, OpenClaw, or your own client through remote MCP with OAuth. Scripts can use the matching REST API with a personal token.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-4 border-y border-outline-variant py-4 text-[11px] sm:grid-cols-4">
            <div><strong className="block">Protocol</strong><span className="text-on-surface-variant">MCP + REST</span></div>
            <div><strong className="block">Auth</strong><span className="text-on-surface-variant">OAuth or token</span></div>
            <div><strong className="block">Permissions</strong><span className="text-on-surface-variant">Scoped reads + writes</span></div>
            <div><strong className="block">Plan</strong><span className="text-on-surface-variant">Included with Pro</span></div>
          </div>
          <p className="mt-4 text-[11px] text-on-surface-variant">Stocksbrew exposes research workflow actions. It cannot place trades or move money.</p>
        </header>

        <Section id="quickstart" label="Quickstart" title="Connect with one prompt">
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Paste this into your agent. It includes OAuth, safe confirmation rules, and a verification task.</p>
          <AgentSetupPrompt className="mt-7" />
          <ol className="mt-7 divide-y divide-outline-variant border-y border-outline-variant text-[12px]">
            <li className="py-3"><strong>1. Connect.</strong> Add <code>{mcpUrl}</code> as a remote MCP server.</li>
            <li className="py-3"><strong>2. Approve.</strong> Sign in and choose only the permissions the agent needs.</li>
            <li className="py-3"><strong>3. Verify.</strong> Ask: “Show my Radar and explain anything that changed today.”</li>
          </ol>
        </Section>

        <Section id="clients" label="Client setup" title="Claude Code, Hermes, OpenClaw, and REST">
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">OAuth-capable clients open the Stocksbrew approval screen. Reconnect an older client if it needs Radar or alert write scopes.</p>
          <Code label="Claude Code">{`claude mcp add --transport http stocksbrew ${mcpUrl}`}</Code>
          <Code label="Hermes MCP configuration">{`{
  "mcpServers": {
    "stocksbrew": { "url": "${mcpUrl}", "auth": "oauth" }
  }
}`}</Code>
          <Code label="OpenClaw">{`openclaw mcp add stocksbrew --url ${mcpUrl} --auth oauth
openclaw mcp login stocksbrew
openclaw mcp doctor stocksbrew --probe`}</Code>
          <Code label="REST">{`curl -H "Authorization: Bearer $STOCKSBREW_TOKEN" \\
  "${base}/api/v1/stocks/NVDA"`}</Code>
        </Section>

        <Section id="recipes" label="Common recipes" title="The jobs agents can do">
          <div className="mt-6 divide-y divide-outline-variant border-y border-outline-variant text-[12px]">
            <div className="py-4"><strong>Answer about any covered stock.</strong><p className="mt-1 text-on-surface-variant">Call <code>get_stock_intelligence</code>. Baseline data remains available when the detailed brief is missing.</p></div>
            <div className="py-4"><strong>Queue missing research.</strong><p className="mt-1 text-on-surface-variant">Read <code>coverage.next_action</code>, ask the user, then call <code>add_to_radar</code>. Recheck the same stock later.</p></div>
            <div className="py-4"><strong>Report only new Radar changes.</strong><p className="mt-1 text-on-surface-variant">Call <code>get_radar_changes</code> with the last cursor. Save the returned cursor only after delivery succeeds.</p></div>
            <div className="py-4"><strong>Create or review price alerts.</strong><p className="mt-1 text-on-surface-variant">Ask before any write, then use the alert tools. Earnings, RSI, call, anomaly, and news updates come through Radar changes.</p></div>
          </div>
          <Code label="Missing research response">{baseline}</Code>
          <Code label="Create a price alert over REST">{alert}</Code>
        </Section>

        <Section id="channels" label="Chat delivery" title="Telegram, WhatsApp, and Discord">
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
            Hermes or OpenClaw owns the chat connection and schedule. Stocksbrew supplies research and Radar changes. Ask your agent to poll changes, message only when something important changed, and retain the cursor after a successful send.
          </p>
          <Code label="Scheduled agent instruction">{`Check my Stocksbrew Radar every morning.
Message me only when earnings, a directive, a risk, or a tracked price level changed.
Keep the returned cursor for the next check.`}</Code>
        </Section>

        <Section id="tools" label="MCP reference" title="Eleven explicit tools">
          <div className="mt-6 overflow-x-auto border-y border-outline-variant">
            <table className="w-full min-w-[650px] text-left text-[11px]">
              <thead className="bg-surface-container-low/60 font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant"><tr><th className="px-3 py-2.5">Tool</th><th className="px-3 py-2.5">Scope</th><th className="px-3 py-2.5">Job</th></tr></thead>
              <tbody className="divide-y divide-outline-variant">{TOOLS.map(([name, scope, detail]) => <tr key={name}><td className="px-3 py-3 font-mono font-semibold text-landing-brand">{name}</td><td className="px-3 py-3 font-mono text-[9px]">{scope}</td><td className="px-3 py-3 text-on-surface-variant">{detail}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>

        <Section id="rest" label="REST reference" title="The same workflow without MCP">
          <p className="mt-3 text-[13px] text-on-surface-variant">Every path is under <code>{base}/api/v1</code>.</p>
          <div className="mt-6 overflow-x-auto border-y border-outline-variant"><table className="w-full min-w-[620px] text-left text-[11px]"><tbody className="divide-y divide-outline-variant">{ENDPOINTS.map(([method, path, detail]) => <tr key={`${method}${path}`}><td className="w-20 py-3 font-mono font-bold text-landing-brand">{method}</td><td className="py-3 font-mono text-[10px]">{path}</td><td className="py-3 text-on-surface-variant">{detail}</td></tr>)}</tbody></table></div>
          <Link href="/api/v1/openapi.json" className="mt-5 inline-flex text-[12px] font-bold text-landing-brand">OpenAPI 3.1 JSON →</Link>
        </Section>

        <Section id="coverage" label="Coverage states" title="Missing research stays explicit">
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">Agents should treat <code>coverage.status</code> as factual and <code>coverage.next_action</code> as the recovery instruction.</p>
          <Code label="Stable states">{`ready · queued · running · baseline_only · no_sources · failed · unavailable`}</Code>
        </Section>

        <Section id="auth" label="Authentication and scopes" title="Grant the smallest useful permission set">
          <dl className="mt-6 divide-y divide-outline-variant border-y border-outline-variant text-[12px]">
            <div className="py-4"><dt className="font-bold">Research</dt><dd className="mt-1 font-mono text-[10px] text-on-surface-variant">stocks:read · market:read</dd></div>
            <div className="py-4"><dt className="font-bold">Radar companion</dt><dd className="mt-1 font-mono text-[10px] text-on-surface-variant">+ radar:read</dd></div>
            <div className="py-4"><dt className="font-bold">Full assistant</dt><dd className="mt-1 font-mono text-[10px] text-on-surface-variant">+ radar:write · alerts:read · alerts:write</dd></div>
          </dl>
          <p className="mt-4 text-[12px] text-on-surface-variant">Mutating tools are marked as writes. Clients should confirm before calling them. Remove and delete operations are also marked destructive.</p>
        </Section>

        <Section id="limits" label="Errors and limits" title="Predictable failure behavior">
          <ul className="mt-6 divide-y divide-outline-variant border-y border-outline-variant text-[12px] text-on-surface-variant">
            <li className="py-3"><strong className="text-on-surface">Allowance:</strong> {AGENT_MONTHLY_CALL_LIMIT} MCP or REST calls per month.</li>
            <li className="py-3"><strong className="text-on-surface">Burst:</strong> {AGENT_PER_MINUTE_CALL_LIMIT} calls per minute. HTTP 429 includes Retry-After.</li>
            <li className="py-3"><strong className="text-on-surface">Errors:</strong> <code>stock_not_found</code>, <code>invalid_alert_kind</code>, <code>profile_not_ready</code>, <code>forbidden_scope</code>, <code>subscription_required</code>, <code>rate_limited</code>.</li>
            <li className="py-3"><strong className="text-on-surface">Excluded:</strong> trading, brokerage access, bulk extraction, resale, and redistribution.</li>
          </ul>
        </Section>

        <footer className="border-t border-outline-variant px-5 py-10 text-[12px] sm:px-10 lg:px-12">
          <Link href="/profile#agent-access" className="font-bold text-landing-brand">Manage agent access →</Link>
          <Link href="/agents" className="ml-6 font-bold text-landing-brand">See the product page →</Link>
        </footer>
      </article>
    </main>
  );
}
