export const agentBlogContent: Record<string, string> = {
  "how-to-connect-ai-agent-stock-market-data-mcp": `
<p>AI agents are much more useful when they can retrieve current, structured information instead of relying on whatever happened to be in their training data. For stock research, that means giving the agent a controlled way to ask for a ticker, a market brief, a comparison, or changes across a watchlist.</p>

<p>The <a href="https://modelcontextprotocol.io/docs/getting-started/intro" rel="noopener noreferrer">Model Context Protocol</a>, usually shortened to MCP, is an open standard for connecting AI applications to external systems. An MCP server can expose a small set of tools with clear inputs and outputs. A compatible client can discover those tools, choose the right one for the question, and use the result in its answer.</p>

<p>This guide explains the workflow using the read-only <a href="/agents">Stocksbrew agent connection</a> as a concrete example. It is written for individual investors and developers who want useful research automation without giving an agent trading access.</p>

<h2 id="what-mcp-changes">What MCP changes for stock research</h2>

<p>Without a tool connection, an agent has three weak options: answer from memory, ask you to paste data, or scrape a page. None is a dependable research workflow. Training knowledge can be stale. Copying data is slow. Scraped pages are difficult to interpret consistently and can hide the timestamp that matters most.</p>

<p>An MCP tool call is more explicit. The agent can ask for <code>get_stock_intelligence</code> with a ticker, and the server can return a structured object containing the current call, target context, risks, fundamentals, and freshness. The agent does not have to guess which number belongs to which label.</p>

<p>The important design choice is not “give the agent everything.” It is to expose a bounded research contract:</p>

<ul>
  <li>A stock lookup tool for resolving company names and tickers.</li>
  <li>A single-stock tool for current intelligence and evidence.</li>
  <li>A comparison tool for evaluating a short list of candidates.</li>
  <li>A market tool for current sentiment, macro context, sectors, and movers.</li>
  <li>Private Radar tools for a signed-in member's tracked names and changes.</li>
</ul>

<p>That is enough for useful agent workflows while avoiding a bulk data-export surface.</p>

<h2 id="connection-flow">The connection flow in plain English</h2>

<h3>1. Add the remote MCP server</h3>

<p>In a compatible client, add the Stocksbrew remote MCP URL. The exact settings screen differs between Claude Code, Cursor, Codex, and other clients, and MCP support can change between product versions. The server address itself remains the same:</p>

<div class="sample-brief">
  <h4>Stocksbrew MCP endpoint</h4>
  <p><code>https://www.stocksbrew.online/api/mcp</code></p>
</div>

<p>If the client supports OAuth for remote MCP, it can open the Stocksbrew approval screen. If it expects a static Bearer credential, a Pro member can create a personal token from Profile.</p>

<h3>2. Approve narrow read scopes</h3>

<p>The connection asks only for the scopes needed to read stock intelligence, market context, or the member's private Radar. Stocksbrew does not expose trading, portfolio-editing, or alert-creation tools through this interface.</p>

<p>This separation matters. Reading a research workspace is a much smaller risk than allowing an agent to take financial actions. Even with read-only access, you should approve only clients you trust and revoke credentials that are exposed.</p>

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

<p>A consumer research plan should not behave like an unlimited market-data redistribution license. Bounded list sizes, monthly usage, and per-minute limits keep the interface useful for personal workflows without turning it into an extraction endpoint.</p>

<h2 id="use-cases">Four useful agent workflows</h2>

<h3>Review one stock before making a decision</h3>

<p>Ask the agent to separate the current call, target room, drivers, risks, and evidence that would change the view. This is better than asking “Should I buy?” because it forces the answer to show its structure and uncertainty. You can use the same framework alongside the <a href="/blog/stock-research-checklist-evidence-first">evidence-first stock research checklist</a>.</p>

<h3>Compare candidates consistently</h3>

<p>An agent is useful when it applies the same dimensions across every candidate. Ask it to compare two to five stocks on valuation, growth, quality, momentum, returns, targets, and technical context. Then ask it to identify missing data instead of filling gaps with confident prose.</p>

<h3>Prepare a Radar review</h3>

<p>A Pro member can ask what changed across private Radar, which names need attention, and which events are approaching. The result is a starting point for review—not an instruction to trade.</p>

<h3>Build an internal research automation</h3>

<p>Developers can use the matching REST API when MCP is not the right fit. For example, an internal script might fetch the market brief before generating a private morning note, or retrieve a small comparison before a scheduled research meeting. The <a href="/developers">developer guide and OpenAPI description</a> document the endpoints.</p>

<h2 id="safety">What the agent should not be allowed to do</h2>

<p>Research tools and action tools deserve different risk models. Stocksbrew's agent interface is deliberately read-only. It cannot place a trade, move money, edit holdings, change Radar, or create an alert.</p>

<p>You should also keep a human review step between an agent answer and any financial decision. An external agent can combine Stocksbrew data with its own memory, prompts, and other tools. Stocksbrew does not control the resulting answer. Verify timestamps, assumptions, and primary sources before acting.</p>

<h2 id="mcp-vs-rest">MCP or REST API: which should you use?</h2>

<p>Use MCP when you want an interactive agent to discover tools and decide which one fits the conversation. Use REST when you are building a deterministic script, a scheduled internal workflow, or a client that does not support MCP.</p>

<p>Both interfaces use the same bounded research layer and the same Pro allowance. That keeps the answer consistent whether it came through a conversation or a small piece of code.</p>

<div class="cta-section">
  <h3>Give your agent a real research layer</h3>
  <p>Stocksbrew Pro includes the hosted MCP server, personal developer tokens, six read-only tools, and the matching REST API.</p>
  <a class="cta-button" href="/agents">See Stocksbrew for Agents →</a>
</div>
`,

  "stock-research-prompts-for-ai-agents": `
<p>A broad prompt produces a broad answer. “Analyze this stock” gives an AI agent too much freedom to choose the time horizon, evidence, comparison set, and definition of risk. The result may sound polished while hiding the parts you actually needed to decide.</p>

<p>Better stock-research prompts specify the job, the evidence to retrieve, and the shape of the answer. When the agent can use a read-only stock-market MCP server, it can retrieve current structured context instead of answering only from memory.</p>

<p>Below are seven reusable prompts for Claude Code, Cursor, Codex, or another tool-connected agent. They are designed around the six tools available through <a href="/agents">Stocksbrew for Agents</a>, but the prompt patterns work with any trustworthy research data source.</p>

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

<h2 id="radar-review">4. The private Radar attention review</h2>

<blockquote>Read my Radar and the latest Radar changes. Group tracked stocks into: needs attention now, upcoming event, healthy but worth monitoring, and quiet. For every name in the first two groups, explain what changed, why it matters, and the next piece of evidence I should verify.</blockquote>

<p>This turns a list of tickers into a review queue. It is particularly useful before earnings season or after a volatile market session. Keep the output informational: the agent should surface attention, not make trades.</p>

<h2 id="market-to-stock">5. The market-to-stock context prompt</h2>

<blockquote>Get today's US market brief. Summarize sentiment, macro context, sector leadership, and the biggest movers. Then explain how that backdrop changes the interpretation of AAPL's current setup. Separate market-wide pressure from company-specific evidence.</blockquote>

<p>A stock rarely moves in isolation. This prompt makes the agent retrieve the market context first and then connect it to one company. The separation between broad and company-specific evidence helps avoid inventing a catalyst for a move driven by the whole sector.</p>

<h2 id="earnings">6. The pre-earnings risk checklist</h2>

<blockquote>Review AMZN ahead of its next earnings event. Using current stock intelligence and my Radar context, list what the market appears to expect, the key operating drivers, valuation sensitivity, major risks, and the evidence to check immediately after the report. Do not predict the exact price move.</blockquote>

<p>The goal is preparation, not a point forecast. A checklist lets you compare the reported result with the assumptions that mattered before the event. For a broader manual workflow, use the <a href="/blog/how-to-analyze-earnings-report">earnings report analysis guide</a>.</p>

<h2 id="thesis-change">7. The thesis-change monitor</h2>

<blockquote>For every holding on my Radar, write one sentence describing the current thesis and one sentence describing the most important invalidation risk. Compare that with the latest Radar changes. Return only names where new evidence touches the thesis or invalidation risk.</blockquote>

<p>This is a disciplined way to reduce notification noise. Price movement alone does not always change a thesis. The prompt asks the agent to connect new evidence to the reason you care about the stock.</p>

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

<p>A prompt alone does not make an answer current. The agent needs a live tool connection. Stocksbrew Pro members can add the hosted MCP URL to a compatible client or create a personal token for the REST API. The connection provides six read-only tools for stock search, intelligence, comparisons, the market brief, private Radar, and Radar changes.</p>

<p>Every successful response includes a schema version, as-of time, freshness information, an informational-use notice, and current usage. The agent cannot trade or edit Radar through these tools.</p>

<div class="cta-section">
  <h3>Use these prompts with your own Stocksbrew context</h3>
  <p>Connect Claude Code, Cursor, Codex, or another compatible client to current calls, targets, market context, and private Radar.</p>
  <a class="cta-button" href="/agents">Connect your AI agent →</a>
</div>
`,
};
