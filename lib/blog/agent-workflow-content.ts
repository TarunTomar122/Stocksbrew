export const agentWorkflowBlogContent: Record<string, string> = {
  "hermes-agent-stock-market-data-watchlist": `
<p>Hermes Agent can reason about a stock, but useful investment research needs a current data source, explicit timestamps, and a way to remember what the investor follows. A remote stock market MCP server gives Hermes a small set of named tools for that job. The agent can search a ticker, read current stock intelligence, inspect a watchlist, notice changes, and manage alert rules without receiving brokerage access.</p>

<p>This guide uses <a href="/agents">Stocksbrew for Agents</a> as the concrete data layer. The same design applies to any careful financial MCP integration: facts come from tools, coverage gaps remain visible, account changes require narrow scopes, and the human confirms writes.</p>

<h2 id="what-you-get">What Hermes can do after the connection</h2>
<ul>
  <li>Answer questions about any supported US ticker using available price, fundamentals, technicals, scores, and market context.</li>
  <li>Read the detailed Stocksbrew call, target, drivers, and risks when research exists.</li>
  <li>Explain that a detailed brief is missing without pretending that baseline data is a completed brief.</li>
  <li>Ask before adding a stock to Watchlist, then queue or refresh research through the same action.</li>
  <li>Read holdings and watched stocks, review changes since a saved cursor, and create or deactivate alert rules.</li>
</ul>

<p>Stocksbrew exposes no trading tools. Hermes cannot place an order, connect a brokerage, or move money through this integration.</p>

<h2 id="connect">Connect Hermes Agent to Stocksbrew MCP</h2>
<p>Add the remote Streamable HTTP MCP endpoint to the Hermes configuration. Use OAuth so the user sees the requested permissions and can revoke the connection later.</p>

<pre><code>{
  "mcpServers": {
    "stocksbrew": {
      "url": "https://www.stocksbrew.online/api/mcp",
      "auth": "oauth"
    }
  }
}</code></pre>

<p>Restart or reload Hermes after saving the MCP configuration, then complete the browser approval flow. Product versions can differ, so check the current <a href="https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md" rel="noopener noreferrer">Hermes MCP documentation</a> if the settings shape in your installed release is different.</p>

<h3>Verify the connection</h3>
<blockquote>Show my Stocksbrew Watchlist. Then explain anything that changed today. Include the response timestamp and freshness.</blockquote>

<p>A successful answer proves more than tool discovery. It verifies authentication, the <code>radar:read</code> scope, and access to the current member's Watchlist. If Hermes lists tools but cannot call them, reconnect and inspect the OAuth scopes granted to the client.</p>

<h2 id="permissions">Choose the smallest permission set</h2>
<p>Start with the job, then grant the scopes needed for it:</p>
<ul>
  <li><strong>Research only:</strong> <code>stocks:read</code> and <code>market:read</code>.</li>
  <li><strong>Watchlist companion:</strong> add <code>radar:read</code>.</li>
  <li><strong>Full research assistant:</strong> add <code>radar:write</code>, <code>alerts:read</code>, and <code>alerts:write</code>.</li>
</ul>

<p>Old personal tokens and old OAuth grants may contain only the original read scopes. Reconnect Hermes or issue a new token before expecting write tools to appear.</p>

<h2 id="any-stock">Ask Hermes about a stock outside Watchlist</h2>
<p>A stock should not need to be in a watchlist before an agent can say anything useful. The stock intelligence tool first returns the available baseline record. It also returns a <code>coverage</code> object that distinguishes the factual state of generated research.</p>

<pre><code>{
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
}</code></pre>

<p>The response lets Hermes answer the immediate question with honest limits. It can discuss current price position and available metrics, then ask whether the user wants a deeper brief.</p>

<blockquote><strong>User:</strong> What do we know about CCL?<br/><br/><strong>Hermes:</strong> CCL is trading at $27.81. Stocksbrew has baseline price, technical, and fundamental context, but the detailed research brief is missing. Want me to add CCL to Watchlist and queue the brief?</blockquote>

<p>After the user says yes, Hermes calls <code>add_to_radar</code>. The action is idempotent. If the ticker is already tracked but research is missing or failed, the same call can request a refresh without creating a duplicate Watchlist row.</p>

<h2 id="research-state">Handle queued, running, and failed research</h2>
<p>Generated research is asynchronous. Hermes should read the state instead of promising that a brief exists immediately. Stable states include <code>ready</code>, <code>queued</code>, <code>running</code>, <code>baseline_only</code>, <code>no_sources</code>, <code>failed</code>, and <code>unavailable</code>.</p>

<ul>
  <li><strong>queued or running:</strong> give the baseline answer and offer to check again later.</li>
  <li><strong>no_sources:</strong> explain that a usable brief could not be created from available sources.</li>
  <li><strong>failed:</strong> ask before refreshing through <code>add_to_radar</code>.</li>
  <li><strong>ready:</strong> use the detailed call and retain its as-of and freshness fields.</li>
</ul>

<p>This prevents the worst agent failure mode in financial research: converting missing data into confident prose.</p>

<h2 id="radar">Turn Watchlist into a daily research checkpoint</h2>
<p><code>get_my_radar</code> returns tracked stocks. <code>get_radar_changes</code> is the better tool for a recurring check because it accepts a cursor and returns only newer attention items.</p>

<blockquote>Every weekday before the open, check my Stocksbrew Watchlist using the saved cursor. Summarize only new earnings, directive changes, risk changes, and tracked price levels. Save the new cursor only after the summary succeeds.</blockquote>

<p>Cursor handling matters. Save the returned cursor after delivery, not before. If sending fails, keeping the old cursor allows the next run to see the same items again. Stable item IDs let the agent deduplicate changes that share a timestamp.</p>

<h2 id="alerts">Create stock alerts through conversation</h2>
<p>Hermes can create and deactivate price threshold email alerts. Earnings, RSI extremes, call changes, anomalies, and news updates come through <code>get_radar_changes</code>. Hermes should confirm the exact action before a write.</p>

<blockquote><strong>User:</strong> Alert me when NVDA falls below $190.<br/><br/><strong>Hermes:</strong> I can create a below-$190 email alert for NVDA. Create it?<br/><br/><strong>User:</strong> yes</blockquote>

<p>Hermes then calls <code>create_alert</code> and reports the returned alert ID, active state, condition, and delivery type. <code>get_my_alerts</code> reads configured rules. It does not claim to be a stream of already delivered messages.</p>

<h2 id="rest">Use REST when MCP is not the right fit</h2>
<p>A scheduled script can use the same operations through REST with a personal token. This is useful when Hermes is part of a larger deterministic automation or when its MCP release has a transport issue.</p>

<pre><code>curl -H "Authorization: Bearer $STOCKSBREW_TOKEN" \
  "https://www.stocksbrew.online/api/v1/radar/changes?since=YOUR_CURSOR"</code></pre>

<p>Keep personal tokens out of chat and logs. Store them in the agent's secret mechanism, rotate exposed credentials, and use OAuth for interactive clients whenever possible.</p>

<h2 id="troubleshooting">Hermes troubleshooting checklist</h2>
<ul>
  <li>Confirm the endpoint is exactly <code>https://www.stocksbrew.online/api/mcp</code>.</li>
  <li>Confirm the installed Hermes version supports remote MCP and OAuth.</li>
  <li>Reconnect if new Watchlist or alert tools are absent from an older grant.</li>
  <li>Check whether the Pro subscription is active.</li>
  <li>Respect HTTP 429 and the returned retry delay.</li>
  <li>Keep baseline data and generated research clearly separated in the answer.</li>
</ul>

<div class="cta-section"><h3>Connect Hermes to current stock research</h3><p>Stocksbrew Pro includes stock intelligence, Watchlist, changes, and alerts through MCP or REST.</p><a class="cta-button" href="/agents">See Stocksbrew for Agents →</a></div>
`,

  "openclaw-stock-alerts-telegram-whatsapp-discord": `
<p>OpenClaw can connect an AI agent to Telegram, WhatsApp, Discord, and other channels. Stocksbrew can supply the stock research behind those conversations through MCP. The useful architecture is simple: OpenClaw owns the channel and schedule, while Stocksbrew owns the research, Watchlist state, change cursor, and alert rules.</p>

<p>This separation keeps channel credentials out of Stocksbrew and keeps financial permissions narrow. The agent can read research and manage a watchlist without receiving a brokerage connection or any ability to trade.</p>

<h2 id="architecture">How the integration works</h2>
<pre><code>Telegram / WhatsApp / Discord
              ↓
           OpenClaw
              ↓
        Stocksbrew MCP
              ↓
 Research, Watchlist, changes, alerts</code></pre>

<p>Stocksbrew does not directly send Telegram, WhatsApp, or Discord messages. OpenClaw routes the result through the channels you configure. Current Stocksbrew alert rules deliver by email. Chat updates come from a scheduled OpenClaw job that polls <code>get_radar_changes</code>.</p>

<h2 id="connect">Connect Stocksbrew MCP to OpenClaw</h2>
<p>Add the remote MCP server, complete OAuth, and probe the connection. Check the current <a href="https://docs.openclaw.ai/cli/mcp" rel="noopener noreferrer">OpenClaw MCP documentation</a> if your installed CLI differs.</p>

<pre><code>openclaw mcp add stocksbrew \
  --url https://www.stocksbrew.online/api/mcp \
  --auth oauth

openclaw mcp login stocksbrew
openclaw mcp doctor stocksbrew --probe</code></pre>

<p>During approval, choose the smallest useful scopes. A read-only morning summary needs stock, market, and Watchlist reads. Adding stocks or managing alert rules requires the corresponding write scopes.</p>

<h3>Connection verification prompt</h3>
<blockquote>Show my Stocksbrew Watchlist and explain anything that changed today. Include the response timestamp and keep the returned cursor for the next check.</blockquote>

<h2 id="channel">Connect your chat channel</h2>
<p>OpenClaw supports channel-specific configuration. Follow its current setup for Telegram, WhatsApp, or Discord, then send a test message through that channel before adding the scheduled stock job. This verifies the outbound route independently from the financial data connection.</p>

<p>A clean setup proves two paths separately:</p>
<ol>
  <li>OpenClaw can call the Stocksbrew tools and receive current data.</li>
  <li>OpenClaw can deliver a plain test message to the selected channel.</li>
</ol>

<p>Only after both work should you schedule a combined Watchlist check. That makes failures easier to diagnose.</p>

<h2 id="schedule">Schedule a useful Watchlist update</h2>
<blockquote>Check my Stocksbrew Watchlist every weekday before the US market opens. Use the saved cursor. Message me only when earnings, a directive, a risk, or a tracked price level changed. Keep the message under 10 lines. Save the new cursor only after the message is delivered.</blockquote>

<p>The cursor prevents a daily agent from reading the entire watchlist as if everything were new. The delivery rule prevents notification fatigue. The agent should stay quiet when no material attention items exist.</p>

<h2 id="cursor">Use Watchlist cursors correctly</h2>
<p><code>get_radar_changes</code> returns attention items and a cursor. Treat the cursor as opaque even if it currently resembles a timestamp.</p>

<pre><code>{
  "attention_items": [
    {
      "item_id": "directive:NVDA:2026-08-01T10:30:00Z",
      "ticker": "NVDA",
      "kind": "directive_change",
      "occurred_at": "2026-08-01T10:30:00Z",
      "summary": "Call changed from Hold to Accumulate"
    }
  ],
  "cursor": "2026-08-01T10:30:00Z"
}</code></pre>

<ol>
  <li>Call the tool with the last successfully delivered cursor.</li>
  <li>Filter or summarize the unseen items.</li>
  <li>Send the channel message.</li>
  <li>Persist the new cursor only after delivery succeeds.</li>
  <li>Back off on rate limits and server errors.</li>
</ol>

<p>If delivery fails after the tool call, retaining the old cursor makes the next run replay the items. Stable <code>item_id</code> values provide a second deduplication key.</p>

<h2 id="missing-research">Handle a ticker with no detailed brief</h2>
<p>OpenClaw can still answer with current baseline data. The response says whether detailed research exists and provides a machine-readable next action.</p>

<blockquote><strong>User:</strong> Why is CCL moving?<br/><br/><strong>Agent:</strong> Stocksbrew has current price, technical, and fundamental context for CCL. Its detailed brief is not ready. Want me to add CCL to Watchlist and queue research?</blockquote>

<p>The agent asks because adding a stock changes the member's Watchlist. After confirmation, <code>add_to_radar</code> queues or refreshes research. A later scheduled check can revisit the ticker when the coverage state moves from queued or running to ready.</p>

<h2 id="alerts">Stock alerts and chat updates are different</h2>
<p>A Stocksbrew alert is a price rule such as “NVDA below $190.” Current alert delivery is email. Earnings, RSI, call, anomaly, and news updates are produced by polling Watchlist changes and routing a summary to a channel.</p>

<p>OpenClaw can still manage alert rules conversationally:</p>
<blockquote><strong>User:</strong> Create an alert when NVDA drops below $190.<br/><br/><strong>Agent:</strong> I can create a below-$190 email alert. Should I create it?</blockquote>

<p>After confirmation, the agent calls <code>create_alert</code>. It can later list active rules with <code>get_my_alerts</code> or deactivate one with <code>delete_alert</code>.</p>

<h2 id="permissions">Recommended OpenClaw permissions</h2>
<ul>
  <li><strong>Channel summary only:</strong> <code>stocks:read</code>, <code>market:read</code>, and <code>radar:read</code>.</li>
  <li><strong>Research assistant:</strong> add <code>radar:write</code> so confirmed additions can queue research.</li>
  <li><strong>Alert assistant:</strong> add <code>alerts:read</code> and <code>alerts:write</code>.</li>
</ul>

<p>Stocksbrew mutations are reversible and scoped. The MCP descriptions mark write and destructive operations. The agent should still ask before every change. Revoke the OAuth connection from Profile if a device or OpenClaw installation is no longer trusted.</p>

<h2 id="security">Operational safety checklist</h2>
<ul>
  <li>Keep Telegram, WhatsApp, and Discord credentials inside OpenClaw's supported secret storage.</li>
  <li>Use OAuth for interactive Stocksbrew access. Never paste personal tokens into a chat.</li>
  <li>Send summaries only to destinations you control.</li>
  <li>Do not describe a queued brief as completed research.</li>
  <li>Do not convert research output into an automatic trade.</li>
  <li>Log the last successful cursor, not every failed attempt.</li>
</ul>

<h2 id="rest">REST fallback</h2>
<p>If a particular OpenClaw release cannot complete remote MCP OAuth, a deterministic integration can use the REST endpoints with a personal token stored as a secret. The same Watchlist, change, and alert operations are available. MCP remains the easier conversational option because the client can discover the tools and their schemas.</p>

<div class="cta-section"><h3>Give OpenClaw current stock context</h3><p>Connect Stocksbrew research, Watchlist, changes, and alerts, then route the useful results through your own channels.</p><a class="cta-button" href="/agents">See Stocksbrew for Agents →</a></div>
`,

  "ai-agent-stock-watchlist-radar-alerts": `
<p>An AI stock watchlist becomes useful after it stops behaving like a list of tickers. The agent needs to answer questions about any covered stock, distinguish available facts from missing research, remember what the investor follows, and return only changes worth reviewing.</p>

<p>This guide describes that architecture using <a href="/agents">Stocksbrew Watchlist and agent access</a>. It covers the domain model, MCP tools, REST endpoints, research states, cursor handling, alert permissions, and failure behavior needed for a dependable personal stock agent.</p>

<h2 id="mental-model">The smallest useful mental model</h2>
<pre><code>Ask about a stock
→ read what exists
→ show the research state
→ add to Watchlist with confirmation
→ queue research
→ check changes with a cursor
→ create alerts with confirmation</code></pre>

<p>This is enough for a real workflow. A generic “stock action” tool would make permissions, confirmation, and audit logs harder to understand. Explicit tools let the agent discover the exact job and let the user grant only the relevant scope.</p>

<h2 id="tools">Use explicit tools for explicit jobs</h2>
<p>A complete personal stock agent can use eleven Stocksbrew MCP tools:</p>
<ul>
  <li><code>search_stocks</code></li>
  <li><code>get_stock_intelligence</code></li>
  <li><code>compare_stocks</code></li>
  <li><code>get_market_brief</code></li>
  <li><code>get_my_radar</code></li>
  <li><code>get_radar_changes</code></li>
  <li><code>add_to_radar</code></li>
  <li><code>remove_from_radar</code></li>
  <li><code>get_my_alerts</code></li>
  <li><code>create_alert</code></li>
  <li><code>delete_alert</code></li>
</ul>

<p>The first four answer research questions. The next four manage the watchlist and incremental changes. The final three manage alert configuration. There are no brokerage or trading tools.</p>

<h2 id="any-stock">Make every supported stock answerable</h2>
<p>The most common bad design is returning a hard error whenever a generated brief is absent. That makes the agent useless for newly discovered stocks. A better response returns the baseline record and a separate coverage object.</p>

<pre><code>{
  "schema_version": "2026-08-01",
  "instrument": { "ticker": "CCL", "name": "Carnival" },
  "market_data": { "price": 27.81 },
  "coverage": {
    "status": "baseline_only",
    "tracked_in_radar": false,
    "has_baseline_data": true,
    "has_detailed_call": false,
    "has_pro_scores": true,
    "research_job": null,
    "next_action": {
      "action": "ask_to_add_to_radar",
      "tool": "add_to_radar"
    }
  }
}</code></pre>

<p>The agent can answer from the factual baseline, label the missing brief, and ask whether the user wants deeper monitoring. This keeps a missing field from being mistaken for a negative signal.</p>

<h2 id="research-state">Model generated research as state</h2>
<p>Research generation is asynchronous and can fail. Treat it as a small state machine:</p>
<ul>
  <li><strong>baseline_only:</strong> factual stock data exists, detailed research does not.</li>
  <li><strong>queued:</strong> the request was accepted.</li>
  <li><strong>running:</strong> a worker is generating the brief.</li>
  <li><strong>ready:</strong> detailed research can be used.</li>
  <li><strong>no_sources:</strong> the system could not find enough usable source material.</li>
  <li><strong>failed:</strong> processing failed and can be retried with confirmation.</li>
  <li><strong>unavailable:</strong> the stock has no usable baseline record.</li>
</ul>

<p>Return a machine-readable <code>next_action</code> with the state. The agent writes the conversational wording. The server remains the authority on what action is valid.</p>

<h2 id="idempotency">Make add-to-Watchlist idempotent</h2>
<p>Agents retry. Networks time out. A user can ask twice. Adding a stock to Watchlist should not create duplicate rows or double-count the watchlist. The same action can safely refresh missing or failed research for an already tracked stock.</p>

<p>This avoids a separate “request research” tool and matches the human product: following the stock is the durable reason to spend work generating a brief.</p>

<h2 id="changes">Return changes instead of a repeated dashboard</h2>
<p>A recurring agent should not narrate the full Watchlist every morning. <code>get_radar_changes</code> accepts a saved cursor and returns only attention items after that point.</p>

<pre><code>{
  "attention_items": [
    {
      "item_id": "earnings:AMD:2026-08-01T09:00:00Z",
      "ticker": "AMD",
      "kind": "earnings",
      "occurred_at": "2026-08-01T09:00:00Z",
      "summary": "Earnings are due within 24 hours"
    }
  ],
  "cursor": "2026-08-01T09:00:00Z"
}</code></pre>

<p>Treat the cursor as opaque. Persist it only after the summary or channel message succeeds. Keep item IDs for deduplication. Back off on HTTP 429 and transient 5xx errors.</p>

<h2 id="alerts">Separate Watchlist changes from alert rules</h2>
<p>Watchlist changes are an incremental read for earnings, RSI extremes, call changes, anomalies, news, and tracked price events. Custom email alert rules currently support price thresholds.</p>

<p>The agent should confirm the exact rule before writing:</p>
<blockquote><strong>User:</strong> Tell me when MSFT enters the buy zone.<br/><br/><strong>Agent:</strong> I can create a price alert using the current zone threshold. Should I create that email alert?</blockquote>

<p>After confirmation, return the alert ID and normalized configuration. Listing alerts should return active rules, not imply that it is a history of delivered notifications.</p>

<h2 id="scopes">Design scopes around user intent</h2>
<ul>
  <li><code>stocks:read</code> for stock search, intelligence, and comparison.</li>
  <li><code>market:read</code> for the current market brief.</li>
  <li><code>radar:read</code> for the member's watchlist and changes.</li>
  <li><code>radar:write</code> for adding and removing tracked stocks.</li>
  <li><code>alerts:read</code> for configured alert rules.</li>
  <li><code>alerts:write</code> for creating and deactivating rules.</li>
</ul>

<p>A research-only client does not need writes. A daily companion needs Watchlist read. A full assistant needs all six. Keep trading outside the system entirely.</p>

<h2 id="mcp-rest">Keep MCP and REST behavior aligned</h2>
<p>MCP works well for conversational discovery. REST works well for deterministic scripts and clients without MCP support. Both should call the same domain operations and share validation, scopes, quotas, errors, and response field names.</p>

<p>REST parity prevents the research workflow from being locked to one model client. It also makes integrations easier to test with simple HTTP requests before introducing an agent.</p>

<h2 id="errors">Return recoverable errors</h2>
<p>Use stable codes such as <code>stock_not_found</code>, <code>invalid_alert_kind</code>, <code>email_required</code>, <code>profile_not_ready</code>, <code>forbidden_scope</code>, <code>subscription_required</code>, and <code>rate_limited</code>. Include a retry delay when time can resolve the problem.</p>

<p>Do not use errors for normal research states. “Brief not generated” belongs in <code>coverage</code>. “Ticker does not exist” belongs in an error.</p>

<h2 id="prompt">A practical daily prompt</h2>
<blockquote>Check my Stocksbrew Watchlist using the saved cursor. Tell me only what changed in earnings, directive, risk, or tracked price levels. For any stock with queued research, check whether it is ready. Do not change Watchlist or alerts without asking. Save the cursor only after this report succeeds.</blockquote>

<p>This prompt has a bounded job, a factual source, a clear silence condition, and safe mutation rules. It is much easier to audit than “watch the market and tell me what matters.”</p>

<h2 id="checklist">Production checklist</h2>
<ul>
  <li>Every response carries schema version, request ID, as-of time, freshness, usage, and notice fields.</li>
  <li>Missing research returns baseline data and coverage state.</li>
  <li>Watchlist mutations are idempotent and account counters remain atomic.</li>
  <li>Alert writes validate ticker, kind, threshold, condition, and ownership.</li>
  <li>OAuth grants are narrow, visible, refreshable, and revocable.</li>
  <li>Write tools are annotated and their descriptions require confirmation.</li>
  <li>Cursor persistence happens only after successful delivery.</li>
  <li>No tool can place a trade or access a brokerage.</li>
</ul>

<div class="cta-section"><h3>Build your stock agent on a real research loop</h3><p>Stocksbrew Pro includes stock intelligence, Watchlist, changes, research generation, and alert tools through MCP and REST.</p><a class="cta-button" href="/agents">See Stocksbrew for Agents →</a></div>
`,
};
