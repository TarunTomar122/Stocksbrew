/** Source-backed, editor-reviewed articles that are closest to stocksbrew's product expertise. */
export const researchBlogContent: Record<string, string> = {
  "how-to-analyze-earnings-report": `
<p><strong>Reviewed July 20, 2026.</strong> An earnings release is not a buy or sell signal. It is a new set of facts to compare with the prior quarter, your original thesis, and the expectations already embedded in the share price.</p>

<div class="sample-brief">
  <h4>Short answer</h4>
  <p>Start with the company’s earnings release and filing. Then compare revenue, margins, cash flow, guidance, risks, and management language with the previous quarter. Write down what improved, what weakened, and what would make the next quarter prove you wrong.</p>
</div>

<h2 id="source-first">Start With the Primary Record</h2>

<p>For US issuers, begin with the company’s latest release and filing through the <a href="https://www.sec.gov/search-filings" rel="noopener noreferrer">SEC company filing search</a>. The release is often furnished with a Form 8-K; the 10-Q provides the fuller quarterly financial statements and management discussion when it is filed. Use the <a href="https://www.sec.gov/edgar/sec-api-documentation" rel="noopener noreferrer">SEC company facts data</a> as a cross-check for reported financial line items.</p>

<p>Headlines, social posts, and even analyst summaries can help frame questions, but they should not be the source of a material number or claim. Save the release and filing before reading commentary.</p>

<h2 id="comparison-card">Build a Quarter-Over-Quarter Comparison Card</h2>

<p>Use the same fields every quarter. Consistency makes it easier to see whether the business is getting stronger, weaker, or merely different.</p>

<table>
  <thead><tr><th>Area</th><th>What changed?</th><th>Question to ask</th></tr></thead>
  <tbody>
    <tr><td>Revenue</td><td>Total revenue, segments, units, customers, or volume</td><td>Did the core driver improve, or did a one-off item make the comparison look better?</td></tr>
    <tr><td>Margins</td><td>Gross margin, operating margin, and the reason management gave</td><td>Is profitability improving because of durable operating leverage or a temporary benefit?</td></tr>
    <tr><td>Cash and balance sheet</td><td>Operating cash flow, capex, free cash flow, debt, and diluted shares</td><td>Did reported profit turn into cash, and can the company fund its plan?</td></tr>
    <tr><td>Guidance</td><td>Revenue, margin, expense, capital spending, or operating-metric outlook</td><td>What did management now say must happen next quarter?</td></tr>
    <tr><td>Risks and language</td><td>New risk factors, cautious phrasing, customer, supply, or regulatory detail</td><td>Did the explanation of the business change even when the headline numbers did not?</td></tr>
  </tbody>
</table>

<h2 id="revenue">1. Read Revenue for Demand, Not Just the Headline</h2>

<p>Start with the source of growth. Compare company-wide revenue with segment revenue, volume, units, subscribers, backlog, or customer additions when those measures are relevant. A company can beat a headline revenue estimate while the segment that supports the long-term thesis slows down.</p>

<p>Look for the explanation: price, volume, mix, acquisitions, currency, or timing. A good post-earnings note distinguishes those drivers instead of treating every percentage increase as equivalent.</p>

<h2 id="margins">2. Ask Why Margins Moved</h2>

<p>Gross margin shows the economics of what the company sells. Operating margin adds the cost of running the business. Compare both with the prior quarter and the same quarter a year earlier, then read management’s explanation for the change.</p>

<p>Margin expansion can be durable, but it can also come from a favorable product mix, delayed spending, a reserve release, or a cost that returns next quarter. The question is not whether the margin moved; it is whether the reason supports the longer-term case.</p>

<h2 id="cash">3. Reconcile Earnings With Cash and the Balance Sheet</h2>

<p>Net income is not the whole result. Review operating cash flow, capital expenditure, working-capital movements, debt maturities, interest expense, and diluted share count. This catches a common gap between an attractive adjusted-profit headline and the cash owners can actually claim.</p>

<p>There is no universal “good” ratio. Compare the company with its own history, its business model, and the demands of its industry.</p>

<h2 id="guidance">4. Treat Guidance as the Next Test</h2>

<p>Guidance tells you what management expects after the reported period. Record both the range and the assumptions behind it: demand, pricing, input costs, capacity, currency, capital spending, or a key product launch. A reported beat can matter less than lower forward guidance, and a reported miss can matter less than evidence that the next period is improving.</p>

<p>When management does not provide formal guidance, note the operating metrics and commentary it does provide. Do not fill the gap with a confident prediction.</p>

<h2 id="language">5. Compare Management Language and Risks</h2>

<p>Read the risk factors, management discussion, and prepared remarks with the prior quarter beside them. New language about demand, pricing pressure, customer concentration, regulation, competition, inventories, or cash needs is often more useful than a dramatic adjective in a conference-call headline.</p>

<p>Keep facts separate from interpretation. “Management reduced its revenue outlook” is a fact. “The company has permanently lost pricing power” is an interpretation that needs more evidence.</p>

<h2 id="price-reaction">6. Separate the Stock Reaction From the Business Result</h2>

<p>A stock can fall after good reported numbers or rise after weak ones because the market responds to expectations, guidance, valuation, positioning, and the outlook. Record the price reaction, but do not use it as proof of what the quarter means.</p>

<p>Ask two different questions: “What changed in the business?” and “What may the market have expected that was different?” The first belongs in the research record; the second is a hypothesis to test.</p>

<h2 id="watchlist-workflow">Turn the Report Into a Watchlist Decision</h2>

<ol>
  <li>Write three bullets: what improved, what weakened, and what remains uncertain.</li>
  <li>Update the thesis and explicit invalidation condition.</li>
  <li>Set the next event that will test the thesis: a guidance milestone, a filing, a product date, or the next report.</li>
  <li>Only then decide whether the stock remains a holding, a watchlist candidate, or a name to remove.</li>
</ol>

<p>For a pre-report workflow, use the <a href="/blog/earnings-season-watchlist-playbook">earnings watchlist playbook</a>. For broader primary-source research, use our <a href="/blog/stock-research-checklist-evidence-first">evidence-first stock research checklist</a>.</p>

<div class="cta-section">
  <h3>See What Changed After Earnings</h3>
  <p>Browse free Earnings Intel reports for a plain-English post-results read, then add the names you follow to Watchlist for ongoing context.</p>
  <a href="/calendar?type=earnings" class="cta-button">Browse Earnings Intel →</a>
</div>
`,

  "stock-research-checklist-evidence-first": `
<p><strong>Reviewed July 16, 2026.</strong> This is the checklist we use when turning a ticker into a research brief. It is designed to produce a decision you can explain later—not a price prediction.</p>

<div class="sample-brief">
  <h4>Research standard</h4>
  <p>Start with primary evidence, write down what would prove you wrong, and separate facts from interpretation. A score or AI summary can organize the work; it cannot replace the filings.</p>
</div>

<p>Most stock research fails before the first ratio is calculated. The investor begins with a conclusion—“this company will dominate AI”—and then collects facts that support it. A stronger process begins with a question: <em>what would have to be true for this investment to work, and what evidence would falsify that view?</em></p>

<h2 id="one-page-output">The one-page output</h2>

<p>Before opening ten tabs, create a one-page decision log with eight fields:</p>

<ol>
  <li><strong>Business in one sentence:</strong> how the company makes money and who pays it.</li>
  <li><strong>Thesis:</strong> the two or three developments that could make the business more valuable.</li>
  <li><strong>Variant view:</strong> what you believe that the current market price may not fully reflect.</li>
  <li><strong>Evidence:</strong> primary documents or data supporting each thesis point.</li>
  <li><strong>Risks:</strong> events that would damage the business, not merely move the share price.</li>
  <li><strong>Valuation:</strong> the expectations embedded in today's price.</li>
  <li><strong>Watch items:</strong> the next earnings date, filing, product milestone, or regulatory event.</li>
  <li><strong>Invalidation:</strong> the observable facts that would make you reduce or exit.</li>
</ol>

<p>If you cannot complete those fields in plain English, you do not yet understand the idea well enough to size it.</p>

<h2 id="step-1-business">1. Understand the business before the stock</h2>

<p>Read the company's latest annual report before relying on a summary. For US issuers, begin with the <a href="https://www.sec.gov/search-filings" rel="noopener noreferrer">SEC's company filing search</a>. Focus on the business description, segment data, customers, competition, risk factors, and management's discussion of results.</p>

<p>Write answers to five questions:</p>

<ul>
  <li>Which product or service produces the revenue?</li>
  <li>Is demand recurring, cyclical, project-based, or dependent on a few customers?</li>
  <li>What prevents a competitor from offering the same thing?</li>
  <li>Which input costs, regulations, or distribution partners matter most?</li>
  <li>What does the company have to reinvest to keep growing?</li>
</ul>

<p>A business can report fast revenue growth while becoming less valuable if that growth requires heavier discounts, rising stock compensation, or uneconomic capital spending. The income statement alone does not settle the question.</p>

<h2 id="step-2-economics">2. Trace the economics through three statements</h2>

<p>Use several years, not one quarter. The SEC's <a href="https://www.sec.gov/edgar/sec-api-documentation" rel="noopener noreferrer">company facts data</a> and filed 10-K/10-Q statements are the primary record.</p>

<table>
  <thead><tr><th>Question</th><th>Evidence to inspect</th><th>Common trap</th></tr></thead>
  <tbody>
    <tr><td>Is the core business growing?</td><td>Revenue by segment, units, customers, organic growth</td><td>Growth caused only by an acquisition</td></tr>
    <tr><td>Is growth becoming more profitable?</td><td>Gross and operating margin over time</td><td>“Adjusted” profit that excludes recurring costs</td></tr>
    <tr><td>Does profit become cash?</td><td>Operating cash flow, capex, free cash flow</td><td>Cash flow lifted by stretching payables</td></tr>
    <tr><td>Can the balance sheet absorb a shock?</td><td>Cash, debt maturity, interest expense, covenants</td><td>Comparing debt without considering lease or pension obligations</td></tr>
    <tr><td>Are owners being diluted?</td><td>Diluted share count and stock compensation</td><td>Celebrating buybacks while shares outstanding still rise</td></tr>
  </tbody>
</table>

<p>Do not reduce this step to a universal threshold. A 20% margin means something different for a software company and a grocery chain. Compare the company with its own history and a sensible peer group.</p>

<h2 id="step-3-management">3. Check what management said, did, and changed</h2>

<p>Read the last two earnings releases and calls. Compare guidance with subsequent results. Then review the proxy statement for incentives, related-party transactions, and executive pay. Insider transactions are filed through <a href="https://www.sec.gov/files/forms-3-4-5.pdf" rel="noopener noreferrer">Forms 3, 4, and 5</a>, but a sale is not automatically bearish: taxes, diversification, and scheduled plans matter.</p>

<p>The useful question is not “are insiders selling?” It is “does capital allocation match the story management tells?” Watch acquisitions, buybacks, debt issuance, and the per-share result of those choices.</p>

<h2 id="step-4-expectations">4. Treat valuation as an expectations test</h2>

<p>A low multiple is not proof of value, and a high multiple is not proof of overvaluation. Translate the price into operating expectations:</p>

<ul>
  <li>How quickly must revenue grow?</li>
  <li>What long-run margin does the price appear to require?</li>
  <li>How much reinvestment is needed to reach that outcome?</li>
  <li>What happens if growth or margins are merely average?</li>
</ul>

<p>Use at least three cases—bear, base, and bull—and change the operating assumptions, not just the target multiple. The goal is not a precise target price. It is to learn which assumption carries most of the valuation risk.</p>

<h2 id="step-5-disconfirm">5. Search for disconfirming evidence</h2>

<p>Spend a separate block of time trying to break the thesis. Search the risk factors for new language. Read a capable competitor's filings. Look for customer concentration, falling retention, working-capital stress, regulatory investigations, product delays, or a shrinking addressable market.</p>

<p>Keep two columns in the decision log: <strong>evidence for</strong> and <strong>evidence against</strong>. If the second column is empty, the research process is incomplete.</p>

<h2 id="step-6-monitor">6. Turn research into a monitoring plan</h2>

<p>Research goes stale. Define the handful of events that could change the thesis, then monitor those instead of refreshing the price:</p>

<ul>
  <li>next reporting date and guidance range;</li>
  <li>one or two operating metrics management must deliver;</li>
  <li>debt refinancing or regulatory milestones;</li>
  <li>your valuation or position-size limit;</li>
  <li>the explicit invalidation condition.</li>
</ul>

<p>Use <a href="/calendar?type=earnings">Earnings</a> for dates, <a href="/news">News</a> for ticker-specific developments, and <a href="/watchlist">Watchlist</a> to monitor calls and risk flags. These tools reduce the scanning burden; they do not change the underlying evidence standard.</p>

<h2 id="ai-boundary">Where AI helps—and where it should stop</h2>

<p>AI is useful for triage: grouping news, extracting stated risks, comparing two periods, and suggesting questions you may have missed. It can also hallucinate figures, confuse fiscal periods, or repeat an unsourced claim. Verify every material number against a filing or other primary source.</p>

<p>A safe division of labor is:</p>

<ul>
  <li><strong>AI:</strong> organize, summarize, flag changes, and maintain the watch list.</li>
  <li><strong>Primary sources:</strong> establish the facts.</li>
  <li><strong>You:</strong> decide assumptions, position size, and whether the risk fits your situation.</li>
</ul>

<h2 id="final-checklist">The final pre-buy check</h2>

<ol>
  <li>Can I explain the business and thesis without jargon?</li>
  <li>Did I read the latest 10-K, 10-Q, earnings release, and relevant proxy sections?</li>
  <li>Do reported earnings convert into cash over time?</li>
  <li>Which assumption matters most to valuation?</li>
  <li>What evidence would prove me wrong?</li>
  <li>What percentage of the portfolio can I lose without changing my life?</li>
  <li>Which event will make me review this decision?</li>
</ol>

<p>If one of those answers is missing, the next action is more research—not a trade.</p>

<div class="cta-section">
  <h3>Turn the checklist into a live watch list</h3>
  <p>Use Should I Buy for a structured first pass, then monitor the names that survive your research on Watchlist. Free for three stocks.</p>
  <a href="/screener" class="cta-button">Run a structured check →</a>
</div>
`,

  "finviz-vs-tradingview-vs-stocksbrew": `
<p><strong>Researched July 16, 2026.</strong> We compared the products by the jobs an investor needs done: finding ideas, analyzing price action, monitoring owned or watched names, and reacting to material changes. Competitor facts come from the companies' official feature and pricing pages. We did not receive payment or affiliate commissions for inclusion.</p>

<div class="sample-brief">
  <h4>Short answer</h4>
  <p><strong>Finviz</strong> is the fastest of the three for filtering US stocks and scanning a market map. <strong>TradingView</strong> is the clear choice for charts, technical alerts, and multi-asset analysis. <strong>stocksbrew</strong> is for maintaining context on a small US watchlist—calls, earnings, news, and alerts—after you already have names to follow.</p>
</div>

<p>These products overlap at the edges, but they are not substitutes for the same core job. Asking which one is “best” without naming the workflow produces a bad recommendation.</p>

<h2 id="method">How we compared them</h2>

<p>We used six decision factors and weighted none of them universally:</p>

<ol>
  <li><strong>Discovery:</strong> how quickly a user can reduce the market to a useful candidate list.</li>
  <li><strong>Charting:</strong> indicators, drawing, timeframes, strategy tooling, and alert flexibility.</li>
  <li><strong>Monitoring:</strong> whether a watchlist explains what changed or only reports prices.</li>
  <li><strong>Fundamental context:</strong> filings, statements, estimates, and business-quality signals.</li>
  <li><strong>Alerting:</strong> the types of conditions and delivery channels available.</li>
  <li><strong>Time cost:</strong> how much manual filtering remains after setup.</li>
</ol>

<p>We verified Finviz against its <a href="https://finviz.com/elite" rel="noopener noreferrer">official Elite page</a> and TradingView against its <a href="https://www.tradingview.com/features/" rel="noopener noreferrer">official feature overview</a>. stocksbrew details reflect the live product and <a href="/pricing">current pricing page</a>. Plans change, so use those linked pages for the final purchase decision.</p>

<h2 id="matrix">Decision matrix</h2>

<table>
  <thead><tr><th>Job</th><th>Finviz</th><th>TradingView</th><th>stocksbrew</th></tr></thead>
  <tbody>
    <tr><td>Screen US equities</td><td><strong>Best fit</strong>: dense filters, maps, presets</td><td>Strong global screeners with many fields</td><td>Curated screens, not a general-purpose screener</td></tr>
    <tr><td>Technical charting</td><td>Useful charts; Elite adds deeper tooling</td><td><strong>Best fit</strong>: Supercharts, Pine, strategy tests</td><td>Not a charting workspace</td></tr>
    <tr><td>Monitor a focused watchlist</td><td>Portfolio lists and event alerts</td><td>Watchlists and condition-based alerts</td><td><strong>Best fit</strong> when you want a written call and context per name</td></tr>
    <tr><td>Market overview</td><td><strong>Best fit</strong>: compact maps and groups</td><td>Custom heatmaps across asset classes</td><td>US Market Pulse, movers, sectors, and Reddit context</td></tr>
    <tr><td>Custom technical alerts</td><td>Price, news, filing, rating, insider, and screener alerts on Elite</td><td><strong>Best fit</strong>: price, drawings, Pine, app, email, webhook</td><td>Price zones and setup-change email alerts</td></tr>
    <tr><td>Portfolio accounting</td><td>Portfolio lists, not tax accounting</td><td>Not a portfolio accounting tool</td><td>Holdings context, not tax accounting or brokerage execution</td></tr>
  </tbody>
</table>

<h2 id="finviz">Choose Finviz when discovery is the bottleneck</h2>

<p>Finviz compresses a large amount of US equity data into scan-friendly tables and maps. Its official Elite page lists real-time quotes, extended-hours data, advanced/custom screener filters, ETF holdings, export/API access, and alerts for price, news, ratings, insider trades, SEC filings, portfolios, and screener matches.</p>

<p><strong>Strengths:</strong> very fast market breadth scan, excellent US screener ergonomics, compact fundamentals, and a map that makes sector leadership visible.</p>

<p><strong>Trade-offs:</strong> the density is the product, which can overwhelm a new investor. A screen produces candidates; it does not establish a thesis. Finviz currently focuses on NASDAQ, NYSE, and AMEX, according to its official FAQ.</p>

<p><strong>Best for:</strong> investors and traders who begin with rules such as market cap, margin, valuation, volume, or technical pattern and want a short list immediately.</p>

<h2 id="tradingview">Choose TradingView when the chart is the workspace</h2>

<p>TradingView's official feature page emphasizes multi-asset screeners, global market coverage, cloud alerts, drawing-tool alerts, Pine Script, strategy testing, and broker connections. It is much broader than a stock research site: the same workspace covers equities, ETFs, bonds, crypto, forex, and futures depending on data access.</p>

<p><strong>Strengths:</strong> chart quality, customization, multi-timeframe analysis, Pine automation, community scripts, and delivery through browser, email, app, or webhook.</p>

<p><strong>Trade-offs:</strong> the platform can become an instrument panel you tune forever. Community indicators vary in quality. A technically precise alert still does not explain whether an earnings miss changed the business thesis.</p>

<p><strong>Best for:</strong> users whose entry, exit, and risk process is expressed through charts or programmable technical conditions.</p>

<h2 id="stocksbrew">Choose stocksbrew when monitoring is the bottleneck</h2>

<p>stocksbrew begins after discovery. Add the stocks you own or seriously watch, then use Watchlist for a current add/hold/trim call, target and risk zones, news and earnings context, and email alerts. Market Pulse, Earnings Intel, Should I Buy, and Compare Stocks support the same focused US-equity workflow.</p>

<p><strong>Strengths:</strong> readable context per tracked name, fewer tabs, product features tied to a watchlist, and a free tier for three Watchlist stocks.</p>

<p><strong>Trade-offs:</strong> stocksbrew is not a brokerage, a tax-grade portfolio tracker, a professional charting package, or an unrestricted market screener. Its calls are decision support, not individualized investment advice.</p>

<p><strong>Best for:</strong> a busy US investor who already has a focused list and wants to know which name deserves attention today and why.</p>

<h2 id="price">Price is part of the workflow—not the ranking</h2>

<p>As checked on July 16, 2026, Finviz lists Elite at $39.50 monthly or $299.50 annually after its trial. TradingView has multiple plan and market-data combinations, so verify the total on its pricing page for your exchanges and alert limits. stocksbrew lists Pro at $9 per month or $99 per year, with three Watchlist stocks on the free tier.</p>

<p>Do not compare headline prices alone. The relevant cost is the cheapest plan that supports your actual alerts, market data, saved layouts, or watchlist size.</p>

<h2 id="workflows">Three sensible workflows</h2>

<h3>Fundamental investor with limited time</h3>
<ol>
  <li>Use Finviz once a week to screen for quality and valuation criteria.</li>
  <li>Read primary filings for the finalists.</li>
  <li>Add only serious candidates and holdings to stocksbrew Watchlist.</li>
  <li>Open TradingView only when price structure matters to sizing.</li>
</ol>

<h3>Technical swing trader</h3>
<ol>
  <li>Use Finviz or TradingView screeners for the setup.</li>
  <li>Use TradingView for chart confirmation and exact technical alerts.</li>
  <li>Use stocksbrew to check earnings, news, and narrative risk before holding through an event.</li>
</ol>

<h3>Long-term holder who hates dashboards</h3>
<ol>
  <li>Keep discovery rare and deliberate.</li>
  <li>Maintain the decision thesis in writing.</li>
  <li>Use Watchlist and earnings alerts for monitoring.</li>
  <li>Return to Finviz or TradingView only when a thesis event requires deeper analysis.</li>
</ol>

<h2 id="verdict">Verdict</h2>

<p>Pick <strong>Finviz</strong> if you need to find stocks. Pick <strong>TradingView</strong> if you need to analyze and automate charts. Pick <strong>stocksbrew</strong> if you need to maintain a small watchlist with written context. If you actively research individual US stocks, the most coherent stack is often Finviz for discovery, TradingView for charts, and stocksbrew for ongoing monitoring—using primary filings as the source of truth throughout.</p>

<p>Read our <a href="/docs/methodology">editorial and comparison methodology</a> for sourcing, corrections, and conflicts. You can also compare <a href="/docs/compare/stocksbrew-vs-finviz">stocksbrew vs Finviz</a> and <a href="/docs/compare/stocksbrew-vs-tradingview">stocksbrew vs TradingView</a> in more detail.</p>

<div class="cta-section">
  <h3>Try the monitoring layer</h3>
  <p>Add three US stocks to Watchlist free. Keep your screener and charting workflow; use stocksbrew to track what changes afterward.</p>
  <a href="/watchlist" class="cta-button">Open Watchlist →</a>
</div>
`,
};
