import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/copy-button";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { FactList, PageSection, Prose, SideTocPage, TEXT_LINK } from "@/components/docs/side-toc";
import { PageHead, StatStrip, Tag } from "@/components/oa/kit";
import {
  AGENT_ACCESS_TOKEN_TTL_SECONDS,
  AGENT_ACCESS_VERSION,
  AGENT_DAILY_CALL_LIMIT,
  AGENT_MAX_ACTIVE_TOKENS,
  AGENT_PER_MINUTE_CALL_LIMIT,
  AGENT_REFRESH_TOKEN_TTL_SECONDS,
  AGENT_SCOPES,
} from "@/lib/agent-access-config";
import { AGENT_SETUP_PROMPT } from "@/lib/agent-setup-prompt";
import { loadToolReference, type ToolReference } from "@/lib/docs/developer-tools";
import { API_ERRORS, COVERAGE_STATES, SCOPE_INFO, TOOL_GROUPS, TOOL_REST, TOOL_SCOPE } from "@/lib/docs/developers";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "developers"], "stocksbrew API, MCP server and CLI");

export const metadata: Metadata = {
  title: "Developers: stocksbrew API, MCP server and CLI",
  description:
    "Connect Claude Code, Codex, Cursor or your own script to stocksbrew: a remote MCP server, a REST API and a CLI over the same 15 tools. Quickstart, auth, rate limits and the full tool reference.",
  keywords: ["stock market MCP server", "stock research API", "MCP finance", "AI agent stock API", "stocksbrew CLI"],
  alternates: { canonical: "/developers" },
  openGraph: {
    title: "stocksbrew for developers: API, MCP server and CLI",
    description: "One set of tools, three ways in. Stock research, your portfolio and alerts for your own agent or script.",
    url: `${SITE_URL}/developers`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

const API = `${SITE_URL}/api/v1`;
const MCP = `${SITE_URL}/api/mcp`;

const TOC = [
  { id: "quickstart", label: "Quickstart" },
  { id: "auth", label: "Auth and tokens" },
  { id: "limits", label: "Rate limits" },
  { id: "responses", label: "What comes back" },
  { id: "tools", label: "Tool reference" },
  { id: "errors", label: "Errors" },
  { id: "prompts", label: "Example prompts" },
  { id: "cli", label: "CLI" },
  { id: "rules", label: "What it is not for" },
];

const PROMPTS: { title: string; prompt: string; uses: string }[] = [
  {
    title: "Morning check",
    prompt: "Read my stocksbrew portfolio changes since yesterday's close. For each change tell me what happened, the source and its time. If nothing changed, say so in one line.",
    uses: "get_radar_changes, get_my_radar",
  },
  {
    title: "One stock, properly",
    prompt: "Give me the current stocksbrew read on NVDA: the call, the zones, the top two drivers and the main risk. Quote the as_of time. If research is missing, tell me what is available and ask before adding it to my portfolio.",
    uses: "get_stock_intelligence, add_to_radar (only after a yes)",
  },
  {
    title: "Before earnings",
    prompt: "Which of my holdings report in the next seven days? For each, pull the full stock detail and summarise what the report has to show, using only fields that are present.",
    uses: "get_my_radar, get_stock_detail",
  },
  {
    title: "A comparison",
    prompt: "Compare MSFT, GOOGL and AMZN on valuation, growth and one-year return using stocksbrew. Put the numbers in a table and note any field that came back empty.",
    uses: "compare_stocks",
  },
  {
    title: "A price alert",
    prompt: "Set a stocksbrew alert for AAPL below 200. Show me exactly what you are about to create and wait for my yes.",
    uses: "create_alert (after confirmation), get_my_alerts",
  },
  {
    title: "What is moving",
    prompt: "From stocksbrew's Explore data, list today's names with a news spike and a confirmed reason. Leave out any mover without one.",
    uses: "get_explore, get_market_brief",
  },
];

function duration(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} days`;
  if (seconds % 3600 === 0) return `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`;
  return `${Math.round(seconds / 60)} minutes`;
}

function curlFor(tool: ToolReference): string {
  const route = TOOL_REST[tool.name];
  const lines = [`curl -s ${route.method === "GET" ? "" : `-X ${route.method} `}"${API}${route.example.path}" \\`, `  -H "Authorization: Bearer $STOCKSBREW_TOKEN"`];
  if (route.example.body) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`);
    lines.push(`  -d '${JSON.stringify(route.example.body)}'`);
  }
  return lines.join("\n");
}

function ToolCard({ tool }: { tool: ToolReference }) {
  const route = TOOL_REST[tool.name];
  const scope = TOOL_SCOPE[tool.name];
  return (
    <article id={tool.name} className="oa-surface scroll-mt-24 border border-oa-border bg-oa-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-oa-border px-4 py-2.5">
        <h4 className="oa-mono text-[14.5px] font-medium text-oa-fg">
          <a href={`#${tool.name}`} className="rounded hover:underline">
            {tool.name}
          </a>
        </h4>
        <span className="text-[13.5px] text-oa-muted-fg">{tool.title}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <Tag tone="neutral">{scope}</Tag>
          {tool.readOnly ? <Tag>read</Tag> : <Tag tone="primary">{tool.destructive ? "write · removes" : "write"}</Tag>}
        </span>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-pretty text-[14.5px] leading-6 text-oa-fg/90">{tool.description}</p>
        {tool.params.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px] leading-5">
              <thead>
                <tr>
                  {["Argument", "Type", "", "Notes"].map((cell, index) => (
                    <th key={index} scope="col" className="oa-caption border-b border-oa-border py-1.5 pr-4">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tool.params.map((param) => (
                  <tr key={param.name} className="border-b border-oa-border last:border-b-0">
                    <td className="oa-mono whitespace-nowrap py-1.5 pr-4 align-top text-oa-fg">{param.name}</td>
                    <td className="oa-mono whitespace-nowrap py-1.5 pr-4 align-top text-oa-muted-fg">{param.type}</td>
                    <td className="whitespace-nowrap py-1.5 pr-4 align-top text-oa-muted-fg">{param.required ? "required" : "optional"}</td>
                    <td className="min-w-[12rem] py-1.5 align-top text-oa-fg/85">
                      {[param.description, param.constraints].filter(Boolean).join(". ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13.5px] text-oa-muted-fg">No arguments.</p>
        )}
        <p className="oa-mono text-[12.5px] leading-5 text-oa-muted-fg">
          REST: <span className="text-oa-fg">{route.method}</span> /api/v1{route.path}
          {route.note ? <span className="font-sans"> · {route.note.replace(/`/g, "")}</span> : null}
        </p>
        <details className="group/curl">
          <summary className="oa-mono inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-[12px] uppercase tracking-[0.06em] text-oa-label outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open/curl:rotate-90">›</span>
            curl example
          </summary>
          <CodeBlock label="curl" code={curlFor(tool)} className="mt-2" />
        </details>
      </div>
    </article>
  );
}

export default async function DevelopersPage() {
  // Read from the running MCP server definition. If that ever fails we say so instead of showing a stale list.
  const tools = await loadToolReference().catch(() => [] as ToolReference[]);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const readCount = tools.filter((tool) => tool.readOnly).length;

  const claudeCode = `claude mcp add --transport http stocksbrew ${MCP}\n# then run /mcp inside Claude Code and sign in when the browser opens`;
  const mcpJson = JSON.stringify({ mcpServers: { stocksbrew: { url: MCP, headers: { Authorization: "Bearer YOUR_STOCKSBREW_TOKEN" } } } }, null, 2);
  const restQuick = `export STOCKSBREW_TOKEN="sbp.…"   # create one under Account, shown once\n\ncurl -s "${API}/stocks/NVDA" \\\n  -H "Authorization: Bearer $STOCKSBREW_TOKEN"`;
  const cliQuick = `npm install -g stocksbrew-cli\nexport STOCKSBREW_TOKEN="sbp.…"\n\nstocksbrew stock NVDA\nstocksbrew search "nvidia"\nstocksbrew market`;
  const rateHeaders = `HTTP/1.1 429 Too Many Requests\nRetry-After: 60\nCache-Control: no-store\n\n{"error":"minute_limit","message":"Per-minute agent limit of ${AGENT_PER_MINUTE_CALL_LIMIT} calls reached."}`;
  const usageShape = `"usage": { "used": 12, "remaining": ${AGENT_DAILY_CALL_LIMIT - 12}, "limit": ${AGENT_DAILY_CALL_LIMIT}, "period": "day" }`;

  return (
    <SideTocPage
      toc={TOC}
      footer={
        <>
          <a href="/api/v1/openapi.json" className={TEXT_LINK}>
            OpenAPI 3.1 JSON
          </a>
          <br />
          <a href="/profile#agent-access" className={TEXT_LINK}>
            Your tokens
          </a>
        </>
      }
    >
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebAPI",
            name: "stocksbrew API and MCP server",
            description: "Stock research, portfolio and alert tools for a person's own agent or script. No trading or brokerage access.",
            url: `${SITE_URL}/developers`,
            documentation: `${SITE_URL}/developers`,
            provider: { "@type": "Organization", name: "stocksbrew", url: SITE_URL },
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Developers", path: "/developers" },
          ]),
        ]}
      />
      <PageHead
        label="Developers"
        title="API, MCP server and CLI"
        lede="Plug stocksbrew into your agent or your own script. One set of tools, three ways in: a remote MCP server for agents, a REST API for code, and a CLI for a terminal. Reads your research and your portfolio. Cannot trade."
        actions={
          <a
            href="/profile#agent-access"
            className="inline-flex h-9 items-center rounded-lg bg-oa-primary px-3.5 text-[14px] font-medium text-oa-primary-fg outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
          >
            Get a token
          </a>
        }
      />

      <StatStrip
        className="mb-8"
        stats={[
          { label: "Tools", value: tools.length > 0 ? tools.length : "n/a", sub: tools.length > 0 ? `${readCount} read, ${tools.length - readCount} write` : "could not load the list" },
          { label: "Per day", value: AGENT_DAILY_CALL_LIMIT, sub: "calls, resets at midnight UTC" },
          { label: "Per minute", value: AGENT_PER_MINUTE_CALL_LIMIT, sub: "calls" },
          { label: "Plan", value: "Pro", sub: "required for every call" },
        ]}
      />

      <div className="flex flex-col gap-9">
        <PageSection
          id="quickstart"
          title="Quickstart"
          lede="Pick the one that matches what you are connecting. All three reach the same tools and count against the same allowance."
          className="!border-t-0 !pt-0"
        >
          <h3 className="text-[16.5px] font-medium text-oa-fg">1. An agent, over MCP with OAuth</h3>
          <Prose>
            The MCP server is at <code className="oa-mono rounded bg-oa-bg px-1 text-[0.9em]">{MCP}</code>. It speaks streamable HTTP and uses OAuth, so your token never
            goes into the conversation. In Claude Code:
          </Prose>
          <CodeBlock label="Claude Code" code={claudeCode} />
          <Prose>
            In a client with an MCP settings screen (Cursor, Codex, the Claude and ChatGPT web apps), add a remote server with that URL and approve the sign-in. Or paste
            this prompt into a coding agent and let it do the setup:
          </Prose>
          <CodeBlock label="Connect with one prompt" code={AGENT_SETUP_PROMPT} />

          <h3 className="mt-2 text-[16.5px] font-medium text-oa-fg">2. A client that wants a bearer header</h3>
          <Prose>
            Create a personal token under{" "}
            <a href="/profile#agent-access" className={TEXT_LINK}>
              Account
            </a>{" "}
            and put it in the client&apos;s config. Keep the config file out of version control.
          </Prose>
          <CodeBlock label="mcp.json" code={mcpJson} />

          <h3 className="mt-2 text-[16.5px] font-medium text-oa-fg">3. Your own code, over REST</h3>
          <Prose>
            Every path is under <code className="oa-mono rounded bg-oa-bg px-1 text-[0.9em]">{API}</code> and takes the same token.
          </Prose>
          <CodeBlock label="curl" code={restQuick} />

          <h3 className="mt-2 text-[16.5px] font-medium text-oa-fg">4. A terminal</h3>
          <CodeBlock label="shell" code={cliQuick} />
        </PageSection>

        <PageSection id="auth" title="Auth and tokens" lede="Every call needs a bearer token that belongs to an account with an active Pro plan. There are two kinds.">
          <FactList
            rows={[
              [
                "OAuth access token",
                <>
                  Issued when you approve a client in the browser. Starts with <code className="oa-mono">sbo.</code> and lasts {duration(AGENT_ACCESS_TOKEN_TTL_SECONDS)}. The
                  client renews it with a refresh token (<code className="oa-mono">sbr.</code>, {duration(AGENT_REFRESH_TOKEN_TTL_SECONDS)}, single use: each refresh returns a
                  new one).
                </>,
              ],
              [
                "Personal token",
                <>
                  Created by you under Account. Starts with <code className="oa-mono">sbp.</code>, does not expire, and carries all six scopes. Up to {AGENT_MAX_ACTIVE_TOKENS}{" "}
                  active at once. Shown once at creation: we store a SHA-256 hash of the secret and cannot show it again.
                </>,
              ],
              ["Revoking", "Revoke a personal token under Account and it stops working on the next call. If a token is exposed, revoke it and create another."],
              ["When Pro ends", "Calls return pro_required. Tokens are not deleted, so they work again if the plan is renewed."],
            ]}
          />

          <h3 className="text-[16.5px] font-medium text-oa-fg">Scopes</h3>
          <Prose>An OAuth client asks for scopes and you see them on the consent screen before you approve. Grant the smallest set that does the job.</Prose>
          <div className="oa-surface overflow-x-auto border border-oa-border bg-oa-card">
            <table className="w-full border-collapse text-left text-[14px] leading-6">
              <thead>
                <tr>
                  {["Scope", "Allows", "Tools"].map((cell) => (
                    <th key={cell} scope="col" className="oa-caption border-b border-oa-border bg-oa-bg px-3 py-2 first:pl-4 last:pr-4">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AGENT_SCOPES.map((scope) => (
                  <tr key={scope} className="border-b border-oa-border last:border-b-0">
                    <td className="oa-mono whitespace-nowrap px-3 py-2 pl-4 align-top text-[13px] text-oa-fg">
                      {scope}
                      {SCOPE_INFO[scope].writes ? <span className="ml-2 text-oa-primary">write</span> : null}
                    </td>
                    <td className="min-w-[14rem] px-3 py-2 align-top text-oa-fg/85">{SCOPE_INFO[scope].text}</td>
                    <td className="oa-mono min-w-[12rem] px-3 py-2 pr-4 align-top text-[12.5px] text-oa-muted-fg">
                      {Object.entries(TOOL_SCOPE)
                        .filter(([, needed]) => needed === scope)
                        .map(([name]) => name)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-[16.5px] font-medium text-oa-fg">OAuth, for client authors</h3>
          <FactList
            rows={[
              ["Flow", "Authorization code with PKCE. S256 is required. Public clients only: the token endpoint takes no client secret."],
              ["Discovery", <code key="d" className="oa-mono break-all text-[13px]">{SITE_URL}/.well-known/oauth-authorization-server</code>],
              ["Protected resource", <code key="p" className="oa-mono break-all text-[13px]">{SITE_URL}/.well-known/oauth-protected-resource</code>],
              ["Registration", "Dynamic client registration is open. Redirect URIs must be https, or http on localhost."],
              ["401 challenge", "An unauthenticated call returns WWW-Authenticate with the resource metadata URL, so a compliant client can start the flow on its own."],
            ]}
          />
        </PageSection>

        <PageSection id="limits" title="Rate limits" lede="Two limits, counted per account across MCP, REST and the CLI together. Every call counts, including one that returns an error from our data.">
          <FactList
            rows={[
              ["Daily", `${AGENT_DAILY_CALL_LIMIT} calls per day. The day is a UTC day: the counter resets at 00:00 UTC.`],
              ["Burst", `${AGENT_PER_MINUTE_CALL_LIMIT} calls per minute, by clock minute.`],
              ["When you hit one", "HTTP 429 with a Retry-After header in seconds: 60 for the minute limit, the time until midnight UTC for the daily limit. Over MCP the tool returns an error result with the same code."],
              ["Knowing where you stand", "Every successful response carries a usage object. Today's count is also shown under Account."],
            ]}
          />
          <CodeBlock label="in every successful response" code={usageShape} />
          <CodeBlock label="over the limit" code={rateHeaders} />
        </PageSection>

        <PageSection id="responses" title="What comes back" lede="Every tool returns one JSON object. Over MCP it arrives as structured content and as text. Over REST it is the response body, never cached.">
          <FactList
            rows={[
              [<code key="1" className="oa-mono">schema_version</code>, `The contract date, currently ${AGENT_ACCESS_VERSION}.`],
              [<code key="2" className="oa-mono">as_of</code>, "The time of the freshest input behind the response. Null when there is nothing to date."],
              [<code key="3" className="oa-mono">freshness</code>, "status, age_hours and a relative label. Use it to tell the person how old the data is."],
              [<code key="4" className="oa-mono">notice</code>, "A short standing notice: informational use, data may be delayed or wrong, not advice, not a broker."],
              [<code key="5" className="oa-mono">usage</code>, "Calls used and remaining today."],
              ["the data", "The tool's own fields beside those. A field we do not hold is null or an empty list. It is never filled with a guess."],
            ]}
          />
          <h3 className="text-[16.5px] font-medium text-oa-fg">Research states</h3>
          <Prose>
            <code className="oa-mono rounded bg-oa-bg px-1 text-[0.9em]">get_stock_intelligence</code> returns{" "}
            <code className="oa-mono rounded bg-oa-bg px-1 text-[0.9em]">coverage.status</code> and <code className="oa-mono rounded bg-oa-bg px-1 text-[0.9em]">coverage.next_action</code>.
            Treat the status as fact and the next action as the instruction for what to do about it.
          </Prose>
          <FactList rows={COVERAGE_STATES.map((item) => [<code key={item.state} className="oa-mono">{item.state}</code>, item.meaning])} />
        </PageSection>

        <PageSection
          id="tools"
          title="Tool reference"
          lede="Each tool has the same name over MCP and a route over REST."
        >
          {tools.length === 0 ? (
            <p className="oa-surface border border-oa-border bg-oa-card px-4 py-6 text-[15px] leading-6 text-oa-fg">
              We could not read the tool list from the server just now. The machine-readable list is in the{" "}
              <a href="/api/v1/openapi.json" className={TEXT_LINK}>
                OpenAPI document
              </a>
              , and an MCP client can always ask the server for it.
            </p>
          ) : (
            TOOL_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="text-[16.5px] font-medium text-oa-fg">{group.title}</h3>
                  <p className="text-[14px] text-oa-muted-fg">{group.blurb}</p>
                </div>
                {group.tools.map((name) => {
                  const tool = byName.get(name);
                  return tool ? <ToolCard key={name} tool={tool} /> : null;
                })}
              </div>
            ))
          )}
        </PageSection>

        <PageSection id="errors" title="Errors" lede="REST errors are JSON with error and message. Over MCP the same code arrives in an error result. Match on the code, not the message.">
          <div className="oa-surface overflow-x-auto border border-oa-border bg-oa-card">
            <table className="w-full border-collapse text-left text-[14px] leading-6">
              <thead>
                <tr>
                  {["Code", "HTTP", "Meaning"].map((cell) => (
                    <th key={cell} scope="col" className="oa-caption border-b border-oa-border bg-oa-bg px-3 py-2 first:pl-4 last:pr-4">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {API_ERRORS.map((error) => (
                  <tr key={error.code} className="border-b border-oa-border last:border-b-0">
                    <td className="oa-mono whitespace-nowrap px-3 py-1.5 pl-4 align-top text-[13px] text-oa-fg">{error.code}</td>
                    <td className="oa-mono px-3 py-1.5 align-top text-[13px] tabular-nums text-oa-muted-fg">{error.status}</td>
                    <td className="min-w-[16rem] px-3 py-1.5 pr-4 align-top text-oa-fg/85">{error.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageSection>

        <PageSection id="prompts" title="Example prompts" lede="Things to say to an agent once it is connected. Each one is answerable from the tools listed under it.">
          <div className="grid gap-3 md:grid-cols-2">
            {PROMPTS.map((item) => (
              <div key={item.title} className="flex flex-col">
                <CodeBlock label={item.title} code={item.prompt} className="[&_pre]:whitespace-pre-wrap [&_pre]:font-sans [&_pre]:text-[14px] [&_pre]:leading-6 flex-1" />
                <p className="oa-mono mt-1 px-1 text-[11.5px] leading-4 text-oa-muted-fg">uses {item.uses}</p>
              </div>
            ))}
          </div>
          <Prose className="!text-[14.5px] !leading-6 text-oa-muted-fg">
            Two habits worth building into any prompt: ask the agent to quote <code className="oa-mono">as_of</code>, and tell it to say not enough current evidence when a field
            is empty instead of filling the gap.
          </Prose>
        </PageSection>

        <PageSection id="cli" title="CLI" lede="A thin client for the REST API, for a terminal or a shell script. It prints the JSON response.">
          <FactList
            rows={[
              ["Install", <code key="i" className="oa-mono">npm install -g stocksbrew-cli</code>],
              ["Needs", "Node 18 or newer."],
              [<code key="a" className="oa-mono">stocksbrew stock SYMBOL</code>, "The current read on one stock (get_stock_intelligence)."],
              [<code key="b" className="oa-mono">stocksbrew search QUERY</code>, "Find a ticker by name (search_stocks)."],
              [<code key="c" className="oa-mono">stocksbrew market</code>, "The market brief (get_market_brief)."],
              [<code key="d" className="oa-mono">stocksbrew explore</code>, "The Explore sections (get_explore)."],
              [<code key="e" className="oa-mono">stocksbrew openapi</code>, "Print the OpenAPI document. The only command that needs no token."],
              ["Token", <>Set <code className="oa-mono">STOCKSBREW_TOKEN</code> or pass <code className="oa-mono">--token</code>. Prefer the environment variable so the token stays out of your shell history.</>],
              ["Exit code", "0 on success, 2 when the request fails. The error is printed to stderr as JSON."],
            ]}
          />
          <Prose className="!text-[14.5px] !leading-6 text-oa-muted-fg">
            The CLI covers the read tools above. Portfolio and alert tools are available over MCP and REST.
          </Prose>
        </PageSection>

        <PageSection id="rules" title="What it is not for" lede="The same limits as the rest of the product, plus a few that apply to programmatic access.">
          <ul className="flex max-w-[41rem] flex-col gap-2">
            {[
              "No trading. There is no tool that places, changes or cancels an order, and no brokerage connection behind the API.",
              "Personal use: your own agents, scripts and internal workflows. Not for serving another product's users.",
              "No bulk download, mirroring, resale or redistribution of our data or of results derived from it.",
              "Write tools change your account. A well-behaved agent asks you before calling one, and the tool descriptions tell it to.",
              "An agent can combine our output with its own guesses. Check the as_of time and the source before you act on an answer.",
            ].map((item) => (
              <li key={item} className="relative pl-5 text-pretty text-[15.5px] leading-7 text-oa-fg/90">
                <span aria-hidden="true" className="absolute left-0 top-[12px] h-[5px] w-[5px] rounded-full bg-oa-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Prose className="!text-[14.5px] !leading-6 text-oa-muted-fg">
            The full terms are in the{" "}
            <a href="/legal/terms" className={TEXT_LINK}>
              terms of service
            </a>
            . How tokens and account data are handled is on{" "}
            <a href="/security" className={TEXT_LINK}>
              Security
            </a>
            . Looking for agents that watch your stocks inside the app, with no code? That is{" "}
            <a href="/agents" className={TEXT_LINK}>
              Agents
            </a>
            .
          </Prose>
        </PageSection>
      </div>
    </SideTocPage>
  );
}
