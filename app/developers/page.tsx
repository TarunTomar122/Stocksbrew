import type { Metadata } from "next";
import Link from "next/link";

import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { AGENT_DAILY_CALL_LIMIT, AGENT_PER_MINUTE_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

export const metadata: Metadata = {
  title: "Stocksbrew MCP Server and Stock API for AI Agents",
  description: "Connect Claude Code, Hermes, OpenClaw or your own agent to Stocksbrew stock detail, Explore, Market Daily history, screens, Watchlist changes and alerts through MCP or REST.",
  keywords: ["stock market MCP server", "Hermes stock market data", "OpenClaw stock alerts", "AI agent stock API", "MCP finance"],
  alternates: { canonical: "/developers" },
};

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-5xl sm:leading-[1.04]";
const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

const TOOLS = [
  ["search_stocks", "stocks:read", "Find a ticker or company."],
  ["get_stock_intelligence", "stocks:read", "Read baseline data, detailed research when available, freshness, and the next action."],
  ["get_stock_detail", "stocks:read", "Read the full materialized stock page, including facts, history, business questions, earnings, news and Reddit context."],
  ["compare_stocks", "stocks:read", "Compare two to five stocks."],
  ["get_market_brief", "market:read", "Read the current market, sectors, and movers."],
  ["get_market_history", "market:read", "Read the last seven published Market Daily editions."],
  ["get_explore", "market:read", "Read the Explore page sections and current discovery data."],
  ["get_screens", "market:read", "Read curated screens and every current match."],
  ["get_my_radar", "radar:read", "Read the authorized member's Watchlist."],
  ["get_radar_changes", "radar:read", "Read unseen Watchlist changes from an optional cursor."],
  ["add_to_radar", "radar:write", "Track a stock and queue or refresh missing research."],
  ["remove_from_radar", "radar:write", "Stop tracking a stock."],
  ["get_my_alerts", "alerts:read", "Read active alert rules."],
  ["create_alert", "alerts:write", "Create a price threshold email alert."],
  ["delete_alert", "alerts:write", "Deactivate an alert rule."],
] as const;

const ENDPOINTS = [
  ["GET", "/stocks/search?q=CCL", "Search stocks"],
  ["GET", "/stocks/CCL", "Read stock intelligence and research state"],
  ["GET", "/stocks/CCL/detail", "Read full stock-page detail"],
  ["POST", "/compare", "Compare stocks"],
  ["GET", "/market", "Read market context"],
  ["GET", "/market/history?days=7", "Read Market Daily history"],
  ["GET", "/explore", "Read Explore sections"],
  ["GET", "/screens", "Read curated screens"],
  ["GET", "/radar?limit=50&offset=0", "Read Watchlist"],
  ["POST", "/radar", "Add to Watchlist"],
  ["DELETE", "/radar", "Remove from Watchlist"],
  ["GET", "/radar/changes?since=<cursor>", "Read changes"],
  ["GET", "/alerts?ticker=NVDA", "Read alert rules"],
  ["POST", "/alerts", "Create a price alert"],
  ["DELETE", "/alerts", "Deactivate an alert"],
] as const;

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[18px] border border-oa-border bg-oa-bg">
      <div className="oa-mono border-b border-oa-border px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">
        {label}
      </div>
      <pre className="oa-mono overflow-x-auto whitespace-pre p-4 text-[12.5px] leading-relaxed text-oa-fg/80">
        {children}
      </pre>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-5 pt-12">
      <div>
        <h2 className={H2}>{title}</h2>
        {sub ? <p className="mt-1.5 max-w-[620px] text-sm leading-relaxed text-oa-muted-fg">{sub}</p> : null}
      </div>
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
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebAPI",
            name: "Stocksbrew agent API",
            url: "https://www.stocksbrew.online/developers",
            documentation: "https://www.stocksbrew.online/developers",
            description: metadata.description,
          }),
        }}
      />
      <div className="mx-auto w-full max-w-[56rem] px-4 pb-20 sm:px-6">
        <header className="pb-4 pt-10 sm:pt-16">
          <p className={EYEBROW}>Agent API</p>
          <h1 className={`mt-4 ${H1}`}>Plug stocksbrew into your agent</h1>
          <p className="mt-4 max-w-[600px] text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
            Connect Claude Code, Hermes, OpenClaw or your own client through remote MCP with OAuth. Scripts can use the matching REST API with a personal token.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[22px] border border-oa-border bg-oa-bg p-5 sm:grid-cols-4 sm:p-6">
            {[
              ["Protocol", "MCP + REST"],
              ["Auth", "OAuth or token"],
              ["Permissions", "Scoped reads + writes"],
              ["Plan", "Included with Pro"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] leading-4 text-oa-muted-fg">{label}</dt>
                <dd className="truncate text-sm font-medium tabular-nums text-oa-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-oa-muted-fg">
            Stocksbrew exposes research workflow actions. It cannot place trades or move money.
          </p>
        </header>

        <Section id="quickstart" title="Connect with one prompt" sub="Paste this into your agent. It includes OAuth, safe confirmation rules, and a verification task.">
          <AgentSetupPrompt />
          <ol className="flex flex-col rounded-[18px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {([
              ["Connect", <>Add <code className="oa-mono text-[13px]">{mcpUrl}</code> as a remote MCP server.</>],
              ["Approve", "Sign in and choose only the permissions the agent needs."],
              ["Verify", "Ask: Show my Watchlist and explain anything that changed today."],
            ] as [string, React.ReactNode][]).map(([label, body], i) => (
              <li key={label as string} className="flex items-baseline gap-3 border-b border-oa-border py-3 last:border-b-0 text-sm">
                <span className="oa-mono shrink-0 text-xs tabular-nums text-oa-muted-fg">0{i + 1}</span>
                <span className="font-medium text-oa-fg">{label}.</span>
                <span className="text-oa-muted-fg">{body}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="clients" title="Client setup" sub="OAuth-capable clients open the Stocksbrew approval screen. Reconnect an older client if it needs Watchlist or alert write scopes.">
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

        <Section id="recipes" title="Common recipes" sub="The jobs agents can do.">
          <div className="flex flex-col rounded-[22px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {[
              ["Answer about any covered stock.", "Call get_stock_intelligence. Baseline data remains available when the detailed brief is missing."],
              ["Read full stock evidence.", "Call get_stock_detail for the stock page's financial history, business questions, price history, technicals, earnings, news, Reddit context and materialized source documents."],
              ["Understand the broader market.", "Call get_explore, get_market_history and get_screens. Market history returns seven published US editions by default and marks shorter history as not enough current evidence."],
              ["Queue missing research.", "Read coverage.next_action, ask the user, then call add_to_radar. Recheck the same stock later."],
              ["Report only new Watchlist changes.", "Call get_radar_changes with the last cursor. Save the returned cursor only after delivery succeeds."],
              ["Create or review price alerts.", "Ask before any write, then use the alert tools. Earnings, RSI, call, anomaly and news updates come through Watchlist changes."],
            ].map(([title, body]) => (
              <div key={title} className="border-b border-oa-border py-4 last:border-b-0">
                <p className="text-sm font-medium text-oa-fg">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-oa-muted-fg">{body}</p>
              </div>
            ))}
          </div>
          <Code label="Missing research response">{baseline}</Code>
          <Code label="Create a price alert over REST">{alert}</Code>
        </Section>

        <Section id="channels" title="Chat delivery" sub="Telegram, WhatsApp, and Discord. Hermes or OpenClaw owns the chat connection and schedule. Stocksbrew supplies research and Watchlist changes. Ask your agent to poll changes, message only when something important changed and retain the cursor after a successful send.">
          <Code label="Scheduled agent instruction">{`Check my Stocksbrew Watchlist every morning.
Message me only when earnings, a directive, a risk, or a tracked price level changed.
Keep the returned cursor for the next check.`}</Code>
        </Section>

        <Section id="tools" title="MCP reference" sub="Fifteen explicit tools.">
          <div className="overflow-hidden rounded-[18px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="oa-mono bg-oa-bg text-[10px] uppercase tracking-[0.1em] text-oa-muted-fg">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">Scope</th>
                  <th className="px-4 py-2.5 font-medium">Job</th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map(([name, scope, detail]) => (
                  <tr key={name} className="border-t border-oa-border">
                    <td className="oa-mono px-4 py-3 text-oa-fg">{name}</td>
                    <td className="px-4 py-3"><span className="oa-mono rounded-full bg-oa-accent px-2 py-0.5 text-[10px] text-oa-muted-fg">{scope}</span></td>
                    <td className="px-4 py-3 text-oa-muted-fg">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="rest" title="REST reference" sub={<>Every path is under <code className="oa-mono text-[13px]">{base}/api/v1</code>.</>}>
          <div className="overflow-hidden rounded-[18px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <tbody>
                {ENDPOINTS.map(([method, path, detail]) => (
                  <tr key={`${method}${path}`} className="border-t border-oa-border first:border-t-0">
                    <td className="oa-mono w-20 px-4 py-3 font-medium text-oa-fg">{method}</td>
                    <td className="oa-mono px-4 py-3 text-oa-fg/80">{path}</td>
                    <td className="px-4 py-3 text-oa-muted-fg">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/api/v1/openapi.json" className="group mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-oa-primary hover:underline underline-offset-4">
            OpenAPI 3.1 JSON
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
          </Link>
        </Section>

        <Section id="coverage" title="Coverage states" sub="Missing research stays explicit. Agents should treat coverage.status as factual and coverage.next_action as the recovery instruction.">
          <div className="flex flex-wrap gap-2">
            {["ready", "queued", "running", "baseline_only", "no_sources", "failed", "unavailable"].map((state) => (
              <span key={state} className="oa-mono rounded-full border border-oa-border bg-oa-bg px-3 py-1.5 text-xs text-oa-muted-fg">
                {state}
              </span>
            ))}
          </div>
        </Section>

        <Section id="auth" title="Authentication and scopes" sub="Grant the smallest useful permission set. Mutating tools are marked as writes; clients should confirm before calling them. Remove and delete operations are also marked destructive.">
          <div className="flex flex-col rounded-[22px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {[
              ["Research", "stocks:read · market:read"],
              ["Watchlist companion", "+ radar:read"],
              ["Full assistant", "+ radar:write · alerts:read · alerts:write"],
            ].map(([tier, scopes]) => (
              <div key={tier} className="flex flex-col gap-1 border-b border-oa-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-oa-fg">{tier}</p>
                <p className="oa-mono text-xs text-oa-muted-fg">{scopes}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="limits" title="Errors and limits" sub="Predictable failure behavior.">
          <div className="flex flex-col rounded-[22px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            {[
              ["Allowance", `${AGENT_DAILY_CALL_LIMIT} MCP or REST calls per day. The counter resets at UTC midnight.`],
              ["Burst", `${AGENT_PER_MINUTE_CALL_LIMIT} calls per minute. HTTP 429 includes Retry-After.`],
              ["Errors", "stock_not_found, invalid_alert_kind, profile_not_ready, forbidden_scope, subscription_required, rate_limited."],
              ["Excluded", "Trading, brokerage access, bulk extraction, resale, and redistribution."],
            ].map(([label, body]) => (
              <div key={label} className="flex flex-col gap-1 border-b border-oa-border py-4 last:border-b-0 sm:flex-row sm:gap-6">
                <p className="w-24 shrink-0 text-sm font-medium text-oa-fg">{label}</p>
                <p className="text-sm leading-relaxed text-oa-muted-fg">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <footer className="mt-14 flex flex-wrap gap-3">
          <Link
            href="/profile#agent-access"
            className="inline-flex h-10 items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Manage agent access
          </Link>
          <Link
            href="/agents"
            className="inline-flex h-10 items-center rounded-full border border-oa-border bg-oa-card px-5 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
          >
            See the product page
          </Link>
        </footer>
      </div>
    </main>
  );
}
