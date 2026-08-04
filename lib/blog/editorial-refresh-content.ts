export const editorialRefreshBlogContent: Record<string, string> = {
  "watchlist-vs-portfolio-tracker": `
<div class="blog-meta">Updated August 2026 · 9 min read</div>

<p>A watchlist and a portfolio can contain the same ticker, but they answer different questions. A watchlist asks, “Should I spend more time on this company?” A portfolio tracker asks, “What do I own, what is it worth, and where is my money concentrated?”</p>

<p>Mixing those jobs creates a list that is hard to trust. A stock you saved after reading one article sits beside a holding that affects your actual return. Its price move looks equally urgent even though the decision is completely different.</p>

<h2 id="difference">The difference in one table</h2>

<div class="table-scroll"><table>
  <thead><tr><th></th><th>Watchlist</th><th>Portfolio tracker</th></tr></thead>
  <tbody>
    <tr><td><strong>Main job</strong></td><td>Research possible investments</td><td>Record and review investments you own</td></tr>
    <tr><td><strong>Useful fields</strong></td><td>Reason for watching, valuation, next event, unanswered question</td><td>Shares, cost basis, allocation, return, income</td></tr>
    <tr><td><strong>Typical action</strong></td><td>Research, wait, or remove</td><td>Hold, add, trim, or sell</td></tr>
    <tr><td><strong>Biggest risk</strong></td><td>Collecting tickers without a reason</td><td>Missing concentration or performance problems</td></tr>
  </tbody>
</table></div>

<p>Your broker is usually the source of truth for positions and transactions. A watchlist does not need to copy that ledger. It should preserve the reason a company earned your attention and tell you when new evidence deserves another look.</p>

<h2 id="watchlist">What belongs on a useful watchlist</h2>

<p>Start each ticker with one written reason. It can be short: “margin recovery after a weak product cycle,” or “good business, valuation still too high.” If you cannot remember why a ticker is there, remove it.</p>

<p>Then keep four pieces of context:</p>

<ul>
  <li><strong>The open question.</strong> What still needs to be true before you would invest?</li>
  <li><strong>The next useful event.</strong> An earnings report, investor day, product launch, regulatory decision, or filing.</li>
  <li><strong>The business evidence.</strong> Revenue, margins, free cash flow, balance-sheet risk, and the segment driving the result.</li>
  <li><strong>The price assumption.</strong> The valuation or expected return that would make further research worthwhile.</li>
</ul>

<p>This makes a watchlist a research queue rather than a second portfolio. It also gives alerts a purpose. A headline matters when it answers the open question or changes an assumption, not merely because the ticker appeared in the news.</p>

<h2 id="portfolio">What a portfolio tracker must get right</h2>

<p>A portfolio tracker needs accurate holdings first. That means shares, transactions, cost basis, cash, dividends, and current value. It should also show allocation by company, sector, and asset class so one successful position does not quietly become most of the portfolio.</p>

<p>The right allocation depends on the investor. The SEC’s Investor.gov explains that asset allocation is personal and depends on time horizon and risk tolerance. It also notes that diversification spreads money among investments to reduce risk; it does not guarantee against loss. That is a better starting point than copying a universal position-size rule from the internet.</p>

<p>Returns also need a benchmark and a consistent period. FINRA recommends looking beyond one impressive number and considering fees, risk, and the time used to calculate performance. A tracker that cannot explain its return calculation can produce a precise-looking answer that is still misleading.</p>

<h2 id="using-both">A clean way to use both</h2>

<ol>
  <li><strong>Keep the broker or portfolio tracker as the holdings ledger.</strong> Do not make a research app your only transaction record.</li>
  <li><strong>Use the watchlist for questions.</strong> Add fewer companies and write why each one is there.</li>
  <li><strong>Separate owned from watching.</strong> The same event may require a portfolio decision for one group and more research for the other.</li>
  <li><strong>Review by event, not by habit.</strong> Earnings, filings, guidance changes, and material company news deserve attention. Ordinary price noise often does not.</li>
  <li><strong>Delete freely.</strong> A shorter watchlist makes the remaining alerts more useful.</li>
</ol>

<p>Stocksbrew’s <a href="/radar">Watchlist</a> is built for the monitoring side of that workflow. Search a US stock, review its financials and market context, then add it to Watchlist if you want ongoing research. Keep your broker or portfolio tracker for the transaction record.</p>

<div class="cta-section">
  <h3>Track the stocks you still have questions about</h3>
  <p>Search any US stock, then add the ones you care about to Watchlist.</p>
  <a href="/stocks" class="cta-button">Search a stock →</a>
</div>

<div class="source-note"><strong>Sources and method.</strong> This guide separates research monitoring from holdings accounting using the product capabilities reviewed on August 4, 2026. Portfolio-risk guidance was checked against <a href="https://www.investor.gov/introduction-investing/getting-started/asset-allocation" rel="nofollow">Investor.gov’s asset allocation and diversification guide</a> and <a href="https://www.finra.org/investors/investing/investing-basics/evaluating-performance" rel="nofollow">FINRA’s guide to evaluating investment performance</a>. Product features can change; verify current capabilities before relying on any tool as a financial record.</div>
`,

  "earnings-season-watchlist-playbook": `
<div class="blog-meta">Updated August 2026 · 10 min read</div>

<p>An earnings watchlist should help you answer one question: what changed in the business? The share-price reaction comes later. If you begin with the after-hours chart, it is easy to treat a beat as good, a miss as bad, and miss the part of the report that will matter next quarter.</p>

<p>The useful work happens before the release. Write down what the company needs to prove, then compare that note with the filing, the earnings release, and management’s new guidance.</p>

<h2 id="before">Before the report</h2>

<p>For each holding or serious candidate, keep a small earnings card:</p>

<ul>
  <li><strong>Report date and time.</strong> Confirm it on the company’s investor-relations site. Third-party calendars can change.</li>
  <li><strong>Two operating measures.</strong> Choose the numbers that explain the business, such as cloud growth, store sales, units shipped, bookings, or gross margin.</li>
  <li><strong>Current guidance.</strong> Save the range management previously gave, not only the analyst consensus.</li>
  <li><strong>One risk.</strong> Name the assumption most likely to fail.</li>
  <li><strong>One decision rule.</strong> Write what would make you research further, reduce a holding, or remove a candidate.</li>
</ul>

<p>Keep the list short. Revenue and EPS belong on it, but they rarely explain a quarter alone. A retailer can beat EPS by cutting costs while demand weakens. A software company can grow revenue while cash collection deteriorates. The operating measure tells you where to look.</p>

<h2 id="release">When the release arrives</h2>

<p>Read the company material before commentary. For a US issuer, the earnings release is often attached to a Form 8-K. Investor.gov explains that 8-Ks report specified material events and that investors should pay attention to the filing date, reporting period, and relevant item. The quarterly financial statements and management discussion appear in the 10-Q; the annual version is the 10-K.</p>

<p>Review the report in this order:</p>

<ol>
  <li><strong>Guidance.</strong> Did management raise, hold, cut, or withdraw it?</li>
  <li><strong>Revenue and operating measures.</strong> Did the business perform as expected, and why?</li>
  <li><strong>Margins.</strong> Was profitability helped by durable economics or temporary cuts?</li>
  <li><strong>Cash flow and balance sheet.</strong> Did reported profit turn into cash? Did debt, inventory, or receivables become more concerning?</li>
  <li><strong>Share count and one-off items.</strong> Check whether buybacks, stock compensation, restructuring, tax, or accounting effects changed per-share results.</li>
</ol>

<p>Now compare those facts with your pre-report card. This is the moment to update the research, before the market’s explanation becomes your explanation.</p>

<h2 id="reaction">How to read the price reaction</h2>

<p>A stock can fall after a strong quarter when expectations were higher than the published consensus. It can rise after weak results when the feared outcome was worse. The reaction tells you about expectations; the filing tells you about the company.</p>

<p>Ask three separate questions:</p>

<ul>
  <li>Did the company’s results change the long-term business case?</li>
  <li>Did the new outlook change the valuation you are willing to pay?</li>
  <li>Did the price move create a better expected return, or reveal a risk you had missed?</li>
</ul>

<p>Do not force an immediate action. A report can be important without making the stock an immediate buy or sell.</p>

<h2 id="next-day">The next-day review</h2>

<p>Update the watchlist note with five lines: what beat or missed, what management changed, what drove margins, what happened to cash flow, and which assumption now matters most. Link to the filing so you can check the original evidence later.</p>

<p>For holdings, also check whether the position still fits the portfolio’s risk. For candidates, decide whether the report answered the open question. Remove a ticker when the reason for watching it is gone; a watchlist is not an archive.</p>

<p>Stocksbrew’s <a href="/earnings">earnings calendar</a> and <a href="/radar">Watchlist</a> can keep the relevant dates and subsequent research with the stocks you follow. For a deeper financial review, use the <a href="/blog/earnings-report-analysis-template">earnings report analysis template</a>.</p>

<div class="cta-section">
  <h3>Keep earnings research with the stock</h3>
  <p>Add a US stock to Watchlist and follow what changes around its next report.</p>
  <a href="/radar" class="cta-button">Open Watchlist →</a>
</div>

<div class="source-note"><strong>Sources and method.</strong> Filing guidance was checked on August 4, 2026 against Investor.gov’s explainers on <a href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read-8" rel="nofollow">reading an 8-K</a> and <a href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read" rel="nofollow">reading 10-K and 10-Q reports</a>. Verify report dates and company guidance on the issuer’s investor-relations site and SEC EDGAR. This is a research workflow, not investment advice.</div>
`,

  "track-stock-news-for-your-portfolio": `
<div class="blog-meta">Updated August 2026 · 9 min read</div>

<p>The hard part of following stock news is not finding more headlines. It is knowing which event changes something you believed about a company.</p>

<p>A useful system starts with the stocks you own and the questions you are tracking. It gives primary sources priority, sends fewer alerts, and keeps enough context to explain why an item matters.</p>

<h2 id="what-matters">News that usually deserves attention</h2>

<p>For a US stock, these events are worth checking first:</p>

<ul>
  <li><strong>Earnings and guidance.</strong> New results, a changed outlook, or an unexpected operating metric.</li>
  <li><strong>SEC filings.</strong> Material 8-K events, quarterly 10-Qs, annual 10-Ks, ownership filings, and proxy statements.</li>
  <li><strong>Capital decisions.</strong> Debt, equity issuance, buybacks, dividends, acquisitions, or asset sales.</li>
  <li><strong>Leadership and control.</strong> A CEO or CFO departure, auditor change, restatement, investigation, or governance issue.</li>
  <li><strong>Business evidence.</strong> A major customer, product, regulatory decision, supply problem, or segment disclosure that changes revenue, margins, or risk.</li>
</ul>

<p>A price-target reiteration or an article that repeats yesterday’s move may be relevant to sentiment, but it rarely deserves the same urgency as a filing or guidance change.</p>

<h2 id="sources">Build the source order first</h2>

<p>Use company investor relations and SEC EDGAR as the first layer. The SEC provides company submissions and XBRL company facts through public APIs. Its structured-disclosure feeds update throughout weekdays, which makes them useful for monitoring new filings without repeatedly searching the site.</p>

<p>Add a trusted news service for reporting and context. Then use specialist research, analyst notes, and investor discussion to find questions the primary material may not answer. Social posts can surface an issue quickly, but they should lead back to evidence rather than become the evidence.</p>

<p>This order prevents a common failure: reading a confident summary that names the wrong company, uses an old event, or turns a market-wide move into a company-specific cause.</p>

<h2 id="alerts">Choose alerts by consequence</h2>

<p>Split alerts into three levels:</p>

<div class="table-scroll"><table>
  <thead><tr><th>Level</th><th>Examples</th><th>What to do</th></tr></thead>
  <tbody>
    <tr><td><strong>Immediate</strong></td><td>Guidance withdrawal, major filing, accounting issue, acquisition, unexpected executive exit</td><td>Open the primary source and check the thesis</td></tr>
    <tr><td><strong>Review today</strong></td><td>Earnings, analyst downgrade with new evidence, material product or regulatory news</td><td>Read when you can compare it with prior expectations</td></tr>
    <tr><td><strong>Digest</strong></td><td>Interviews, repeat coverage, ordinary price commentary</td><td>Include only if it adds context</td></tr>
  </tbody>
</table></div>

<p>The point is not to predict the next price move. It is to protect your attention. An immediate alert should be rare enough that you still trust it.</p>

<h2 id="workflow">A short routine that scales</h2>

<ol>
  <li><strong>Follow only holdings and real candidates.</strong> Every extra ticker creates more low-value alerts.</li>
  <li><strong>Write the open question for each stock.</strong> News becomes relevant when it answers that question.</li>
  <li><strong>Scan once, investigate selectively.</strong> Read the source for material events; leave repeated coverage in the digest.</li>
  <li><strong>Update the note.</strong> Record the new fact, its source, and which assumption changed.</li>
  <li><strong>Remove stale names.</strong> If you would not spend ten minutes researching it today, it probably does not need alerts.</li>
</ol>

<p>Stocksbrew’s <a href="/radar">Watchlist</a> follows the US stocks you choose and keeps their financials, news, market context, and AI research together. It is useful as the interpretation layer; the linked filing or original report remains the evidence.</p>

<div class="cta-section">
  <h3>Follow the stocks you actually care about</h3>
  <p>Search a US stock and add it to Watchlist for ongoing research.</p>
  <a href="/stocks" class="cta-button">Search a stock →</a>
</div>

<div class="source-note"><strong>Sources and method.</strong> Filing-monitoring details were checked on August 4, 2026 against the SEC’s <a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" rel="nofollow">EDGAR API documentation</a> and <a href="https://www.sec.gov/data-research/structured-data/structured-disclosure-rss-feeds" rel="nofollow">structured-disclosure RSS feed documentation</a>. The event hierarchy reflects an editorial review of the disclosures described in Investor.gov’s <a href="https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read-8" rel="nofollow">Form 8-K guide</a>. Always check the original filing or company statement before acting on a summary.</div>
`,
};
