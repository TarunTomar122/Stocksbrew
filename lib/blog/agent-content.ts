export const agentBlogContent: Record<string, string> = {
  "how-to-connect-ai-agent-stock-market-data-mcp": `
<p>Ask an AI about a stock without giving it a data source and the answer often starts with a broad company summary. The model may reason well, but the freshness and structure of its stock context can be unclear. A useful stock agent needs current, timestamped fields before it writes the answer.</p>

<p>The <a href="https://modelcontextprotocol.io/docs/getting-started/intro" rel="noopener noreferrer">Model Context Protocol</a>, usually shortened to MCP, is an open standard for connecting AI applications to external systems. An MCP server can expose a small set of tools with clear inputs and outputs. A compatible client can discover those tools, choose the right one for the question, and use the result in its answer.</p>

<p>This guide explains the workflow using the scoped <a href="/agents">Stocksbrew agent connection</a> as a concrete example. It is written for individual investors and developers who want useful research, Watchlist, and alert automation without giving an agent trading access.</p>

<h2 id="what-mcp-changes">What MCP changes for stock research</h2>

<p>Without a tool connection, an agent has three weak options: answer from memory, ask you to paste data, or scrape a page. None is a dependable research workflow. Training knowledge can be stale. Copying data is slow. Scraped pages are difficult to interpret consistently and can hide the timestamp that matters most.</p>

<p>An MCP tool call is more explicit. The agent can ask for <code>get_stock_intelligence</code> with a ticker, and the server can return a structured object containing the current call, target context, risks, fundamentals, and freshness. The agent does not have to guess which number belongs to which label.</p>

<p>The important design choice is not “give the agent everything.” It is to expose a bounded research contract:</p>

<ul>
  <li>A stock lookup tool for resolving company names and tickers.</li>
  <li>A single-stock tool for current intelligence and evidence.</li>
  <li>A comparison tool for evaluating a short list of candidates.</li>
</ul>

<p>Those three tools cover the core stock lookup job. The same connection also exposes the full stock-page detail, Explore sections, Market Daily history, curated screens, and account-scoped Watchlist and alert tools in the developer reference.</p>

<h2 id="connection-flow">The connection flow in plain English</h2>

<h3>1. Add the remote MCP server</h3>

<p>In a compatible client, add the Stocksbrew remote MCP URL. The exact settings screen differs between Claude Code, Cursor, Codex, and other clients, and MCP support can change between product versions. The server address itself remains the same:</p>

<div class="sample-brief">
  <h4>Stocksbrew MCP endpoint</h4>
  <p><code>https://www.stocksbrew.online/api/mcp</code></p>
</div>

<p>If the client supports OAuth for remote MCP, it can open the Stocksbrew approval screen. If it expects a static Bearer credential, a Pro member can create a personal token from Profile.</p>

<h3>2. Approve narrow scopes</h3>

<p>The setup prompt asks for stock and market reads. Watchlist and alert permissions are separate and optional. Stocksbrew does not expose trading, brokerage, or money-movement tools.</p>

<p>This separation matters. Approve only clients you trust, grant the smallest useful scope set, require confirmation before Watchlist or alert changes, and revoke credentials that are exposed.</p>

<h3>3. Ask for a research outcome</h3>

<p>You do not need to tell the agent which tool to call every time. Give it a concrete job and enough boundaries. For example:</p>

<blockquote>Compare NVDA, AMD, and AVGO on valuation, growth, quality, momentum, and target room. Tell me where the evidence is strongest and what could invalidate the conclusion.</blockquote>

<p>A capable MCP client can discover the comparison tool, call it with the three tickers, and use the structured result to produce the requested analysis.</p>

<h2 id="data-contract">What a responsible stock-data contract should include</h2>

<p>Connecting an agent to data is easy. Helping the agent interpret the data responsibly is harder. A useful response contract should carry context that prevents silent mistakes.</p>

<h3>An as-of timestamp</h3>

<p>Market information has a half-life. A price, target, news synthesis, or earnings setup can be reasonable at one moment and misleading later. The response should state when its underlying information was captured or generated.</p>

<h3>A freshness classification</h3>

<p>A timestamp is precise, but a freshness label helps the agent act on it. Stocksbrew responses classify the data and include its approximate age. The agent can then say that a result is aging or stale instead of presenting it as live.</p>

<h3>A stable schema version</h3>

<p>Scripts and agents need to know when a contract changes. A schema version makes that visible and gives developers a point to test against.</p>

<h3>Clear limits</h3>

<p>A consumer research plan should not behave like an unlimited market-data redistribution license. Bounded list sizes, daily usage, and per-minute limits keep the interface useful for personal workflows without turning it into an extraction endpoint.</p>

<h2 id="use-cases">Four useful agent workflows</h2>

<h3>Review one stock before making a decision</h3>

<p>Ask the agent to separate the current call, target room, drivers, risks, and evidence that would change the view. This is better than asking “Should I buy?” because it forces the answer to show its structure and uncertainty. You can use the same framework alongside the <a href="/blog/stock-research-checklist-evidence-first">evidence-first stock research checklist</a>.</p>

<h3>Compare candidates consistently</h3>

<p>An agent is useful when it applies the same dimensions across every candidate. Ask it to compare two to five stocks on valuation, growth, quality, momentum, returns, targets, and technical context. Then ask it to identify missing data instead of filling gaps with confident prose.</p>

<h3>Audit freshness and missing fields</h3>

<p>Ask the agent to show the as-of time, identify any aging fields, and separate missing data from negative data. This makes the limits of the answer visible before you rely on its conclusion.</p>

<h3>Build an internal research automation</h3>

<p>Developers can use the matching REST API when MCP is not the right fit. For example, an internal script can retrieve one current stock record or a small comparison before a research meeting. The <a href="/developers">developer guide and OpenAPI description</a> document the endpoints.</p>

<h2 id="safety">What the agent should not be allowed to do</h2>

<p>Research tools and workflow actions deserve different scopes. Stocksbrew can update Watchlist and alert rules with permission. It cannot place a trade, move money, or access a brokerage account.</p>

<p>You should also keep a human review step between an agent answer and any financial decision. An external agent can combine Stocksbrew data with its own memory, prompts, and other tools. Stocksbrew does not control the resulting answer. Verify timestamps, assumptions, and primary sources before acting.</p>

<h2 id="mcp-vs-rest">MCP or REST API: which should you use?</h2>

<p>Use MCP when you want an interactive agent to discover tools and decide which one fits the conversation. Use REST when you are building a deterministic script, a scheduled internal workflow, or a client that does not support MCP.</p>

<p>Both interfaces use the same bounded research layer and the same Pro allowance. That keeps the answer consistent whether it came through a conversation or a small piece of code.</p>

<div class="cta-section">
  <h3>Give your AI current stock context</h3>
  <p>Connect through the hosted MCP server or use the same structured stock contract through REST.</p>
  <a class="cta-button" href="/agents">See Stocksbrew for Agents →</a>
</div>
`,

  "stock-research-prompts-for-ai-agents": `
<p>A broad prompt produces a broad answer. “Analyze this stock” gives an AI agent too much freedom to choose the time horizon, evidence, comparison set, and definition of risk. The result may sound polished while hiding the parts you actually needed to decide.</p>

<p>Better stock-research prompts specify the job, the evidence to retrieve, and the shape of the answer. When the agent can use a scoped stock-market MCP server, it can retrieve current structured context instead of answering only from memory.</p>

<p>Below are five reusable prompts for Claude Code, Cursor, Codex, or another tool-connected agent. They are designed around <a href="/agents">Stocksbrew for Agents</a>, but the prompt patterns work with any trustworthy research data source.</p>

<h2 id="before-you-prompt">Before you prompt: set three boundaries</h2>

<p>Tell the agent the time horizon, the decision you are preparing, and what it must not assume. A long-term investor reviewing a holding has a different question from someone comparing two candidates before earnings.</p>

<p>A useful preamble is:</p>

<blockquote>Use current tool data and show the as-of time. Separate facts from interpretation. Call out missing or stale information. Do not give a trade instruction; give me the evidence, risks, and conditions that would change the conclusion.</blockquote>

<p>That one paragraph improves nearly every research prompt below.</p>

<h2 id="single-stock">1. The structured single-stock review</h2>

<blockquote>Review MSFT for a 12-to-24-month holding period. Use the current stock-intelligence tool. Organize the answer into: current call, price and target room, business drivers, valuation, quality, growth, momentum, catalysts, risks, and invalidation conditions. Show the as-of time and flag any weak or missing evidence.</blockquote>

<p>This prompt prevents the agent from collapsing every dimension into a single bullish or bearish label. It also makes the invalidation conditions explicit: what would have to change for the current view to stop making sense?</p>

<h2 id="comparison">2. The apples-to-apples comparison</h2>

<blockquote>Compare NVDA, AMD, and AVGO using the same fields for every company: valuation, growth, quality, momentum, one-year return, target upside, technical context, and the strongest risk. Rank the evidence quality separately from the investment attractiveness. Do not treat a missing field as zero.</blockquote>

<p>The last sentence is important. Missing data is not bad data; it is unknown data. The agent should preserve that distinction. Use a short comparison list because a five-stock table is easier to audit than a fifty-stock ranking.</p>

<h2 id="bull-bear">3. The bull case, bear case, and decision hinge</h2>

<blockquote>For TSLA, build the strongest evidence-backed bull case and bear case from the current Stocksbrew context. Then identify the three decision hinges that would move a neutral investor toward either side. Distinguish company fundamentals from market sentiment and price momentum.</blockquote>

<p>This prompt is useful when a stock attracts strong narratives. Asking for the strongest version of both sides reduces the chance that the agent simply mirrors the tone of your question.</p>

<h2 id="freshness-audit">4. The freshness and evidence audit</h2>

<blockquote>Review the current Stocksbrew record for META. Show the as-of time and freshness for the response. List any missing, aging, or weak fields. Then tell me which parts of the conclusion depend on those fields and what primary source I should verify next.</blockquote>

<p>This prompt checks the quality of the context before debating the conclusion. Missing evidence should stay missing; the agent should not smooth over it with confident prose.</p>

<h2 id="evidence-gap">5. The evidence-gap follow-up</h2>

<blockquote>Review AAPL using current Stocksbrew stock intelligence. After the first answer, identify the three claims supported by the strongest evidence and the three claims supported by the weakest evidence. Do not fill any gap from memory without labeling it as outside the Stocksbrew response.</blockquote>

<p>This keeps tool output separate from model interpretation. It is especially useful when a polished summary makes every claim sound equally certain.</p>

<h2 id="earnings">Bonus: the pre-earnings risk checklist</h2>

<blockquote>Review AMZN ahead of its next earnings event. Using current stock intelligence, list the key operating drivers, valuation sensitivity, major risks, and the evidence to check immediately after the report. Do not predict the exact price move.</blockquote>

<p>The goal is preparation, not a point forecast. A checklist lets you compare the reported result with the assumptions that mattered before the event. For a broader manual workflow, use the <a href="/blog/how-to-analyze-earnings-report">earnings report analysis guide</a>.</p>

<h2 id="follow-ups">Follow-up prompts that improve the answer</h2>

<p>The first answer should start a research process, not end it. Useful follow-ups include:</p>

<ul>
  <li>“Which conclusion depends on the weakest data?”</li>
  <li>“What evidence would make you reverse this ranking?”</li>
  <li>“Separate facts returned by the tool from your interpretation.”</li>
  <li>“Which number is most sensitive to a stale timestamp?”</li>
  <li>“What primary source should I verify next?”</li>
  <li>“Rewrite this as a checklist I can use after earnings.”</li>
</ul>

<p>These follow-ups make uncertainty visible. They are more useful than asking the model to become “more confident.”</p>

<h2 id="avoid">Prompts to avoid</h2>

<p>Avoid prompts such as “Tell me the best stock,” “What will double next?” or “Should I buy this today?” They hide your time horizon and risk tolerance, encourage false precision, and invite the agent to convert incomplete research into a directive.</p>

<p>Also avoid asking for hundreds of tickers at once. Bounded comparison sets are easier to audit and less likely to turn a personal research tool into an accidental bulk-data workflow.</p>

<h2 id="connection">How to give the prompts current context</h2>

<p>A prompt alone does not make an answer current. The agent needs a data connection. Stocksbrew Pro members can add the hosted MCP URL to a compatible client or create a personal token for the REST API. The stock connection covers search, concise intelligence, full stock-page detail, comparisons, Explore sections, Market Daily history, and curated screens.</p>

<p>Every successful response includes a schema version, as-of time, freshness information, an informational-use notice, and current usage. The agent cannot trade or access a brokerage; Watchlist and alert changes require their explicit write scopes.</p>

<div class="cta-section">
  <h3>Use these prompts with current Stocksbrew data</h3>
  <p>Connect Claude Code, Cursor, Codex, or another compatible client to current calls, targets, drivers, risks, and freshness.</p>
  <a class="cta-button" href="/agents">Connect your AI agent →</a>
</div>
`,
};
