/** Search-intent guides for the financial metrics shown on stock pages. */
export const financialMetricsBlogContent: Record<string, string> = {
  "what-is-a-good-pe-ratio": `
<div class="article-summary">
  <h2>The short answer</h2>
  <p>A good P/E ratio is a price you can defend using the company’s growth, earnings quality, financial risk, and closest peers. There is no universal cutoff. Start with the multiple, then investigate what the market must believe for that multiple to make sense.</p>
</div>

<p>The price-to-earnings ratio is usually the first valuation number an investor sees. It is also one of the easiest to misuse. A stock at 12 times earnings can be a bargain, a declining business, or a company sitting near peak profits. A stock at 40 times earnings can be wildly expensive or reasonably priced if earnings can compound for years.</p>

<p>The useful question is not “Is 20 a good P/E?” It is: <strong>What growth, durability, and risk are embedded in this P/E, and are those assumptions believable?</strong></p>

<h2>What does the P/E ratio mean?</h2>

<div class="sample-brief">
  <h4>P/E ratio formula</h4>
  <p><strong>Price-to-earnings ratio = share price ÷ earnings per share</strong></p>
  <p>If a stock trades at $60 and earned $3 per diluted share over the relevant period, its P/E ratio is 20. Investors are paying $20 for each $1 of reported annual earnings.</p>
</div>

<p>The <a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC’s financial statement guide</a> uses the same basic calculation. The arithmetic is simple. Choosing the right earnings and interpreting the result take more work.</p>

<p>P/E is an equity multiple. The price belongs to common shareholders, and EPS is the earnings attributed to those shareholders. That makes the numerator and denominator conceptually consistent. It also means P/E is affected by interest expense, taxes, capital structure, accounting choices, and changes in the diluted share count.</p>

<h2>Trailing P/E vs forward P/E</h2>

<div class="table-scroll">
<table>
  <thead><tr><th>Version</th><th>Earnings used</th><th>Strength</th><th>Main weakness</th></tr></thead>
  <tbody>
    <tr><td>Trailing P/E</td><td>Usually the last four reported quarters</td><td>Based on results the company has already reported</td><td>Can describe a business that has already changed</td></tr>
    <tr><td>Forward P/E</td><td>Expected earnings for a future fiscal period</td><td>Closer to what the current price is trying to value</td><td>Depends on estimates that may be wrong or stale</td></tr>
  </tbody>
</table>
</div>

<p>Use both. If trailing P/E is 35 and forward P/E is 24, analysts expect earnings to rise. That drop can reflect genuine growth, an easy comparison, cost cuts, or optimistic estimates. Open the latest earnings materials and find the bridge.</p>

<p>The opposite pattern deserves attention too. A forward multiple above the trailing multiple can signal an expected earnings decline. For cyclical companies, that can happen near the top of a profit cycle, precisely when the trailing P/E looks unusually low.</p>

<h2>So what is a good P/E ratio?</h2>

<p>Run five comparisons in order.</p>

<h3>1. Compare the company with itself</h3>

<p>Look at the company’s P/E across several years and ask why today differs. A higher multiple may be supported by faster recurring growth, better margins, a cleaner balance sheet, or less cyclical revenue. It may also reflect excitement that has moved faster than the business.</p>

<p>Historical comparison works only when the company is still economically similar. A major acquisition, divestiture, accounting change, new business model, or permanent margin shift can make the old range irrelevant.</p>

<h3>2. Compare the closest peers</h3>

<p>The SEC notes that desirable financial ratios vary by industry. A supermarket, bank, chip designer, regulated utility, and subscription software company should not share one P/E benchmark. Their margins, reinvestment needs, balance sheets, and exposure to economic cycles are too different.</p>

<p>Build a peer group around business economics rather than a broad sector label. Compare a cloud software company with businesses that have similar recurring revenue and margins. Compare a memory-chip producer with similarly cyclical suppliers, not every company described as “technology.”</p>

<h3>3. Match the multiple with growth</h3>

<p>Higher expected growth can justify a higher P/E because future earnings may become much larger than the current denominator. Three checks keep that logic honest:</p>

<ul>
  <li><strong>Duration:</strong> how many years can the company plausibly sustain the growth?</li>
  <li><strong>Cost:</strong> how much capital, dilution, or margin sacrifice is required?</li>
  <li><strong>Per share:</strong> is EPS growing because the business improved, because shares were repurchased, or both?</li>
</ul>

<p>The PEG ratio divides P/E by an expected earnings growth rate. It can be a quick comparison, but it inherits every weakness in the growth estimate. A forecast of 25% growth is not a fact merely because it appears in a spreadsheet.</p>

<h3>4. Test earnings quality</h3>

<p>A P/E ratio is only as useful as its earnings denominator. Compare net income with operating cash flow and free cash flow over several years. Read the reconciliation between GAAP and adjusted earnings. Check whether a tax benefit, asset sale, restructuring charge, or unusually favorable commodity price changed the period.</p>

<p>Also inspect the diluted share count. A company can grow total earnings while issuing enough stock that each share receives much less of the benefit. Our guide to <a href="/blog/free-cash-flow-vs-net-income">free cash flow vs net income</a> shows how to investigate the most common gaps.</p>

<h3>5. Account for risk and interest rates</h3>

<p>A predictable business can support a higher multiple than a fragile company with the same expected growth. Customer concentration, debt maturities, regulatory exposure, cyclicality, and the probability of technological disruption all affect what investors should be willing to pay.</p>

<p>Interest rates matter because investors compare future corporate earnings with returns available elsewhere, and because the discount rate applied to distant cash flows changes. Highly valued long-duration growth can be especially sensitive when required returns rise.</p>

<h2>Why P/E ratios differ by sector</h2>

<div class="table-scroll">
<table>
  <thead><tr><th>Business type</th><th>Why its P/E may differ</th><th>Extra metric to check</th></tr></thead>
  <tbody>
    <tr><td>Software</td><td>Recurring revenue, high gross margin, and long growth runways can support higher multiples</td><td>Free cash flow, stock-based compensation, retention</td></tr>
    <tr><td>Retail</td><td>Thin margins and intense competition often limit the multiple</td><td>Comparable sales, inventory, operating margin</td></tr>
    <tr><td>Banks</td><td>Balance-sheet structure and credit costs drive earnings</td><td>Price/book, return on equity, loan losses</td></tr>
    <tr><td>Energy and materials</td><td>Commodity prices can make earnings highly cyclical</td><td>Mid-cycle cash flow, production cost, net debt</td></tr>
    <tr><td>Industrials</td><td>Capital intensity, backlog quality, and cycle position matter</td><td>EV/EBITDA, free cash flow, return on capital</td></tr>
  </tbody>
</table>
</div>

<p>Do not turn the table into a fixed sector scorecard. Compare the company with relevant peers using the same date, earnings period, and definition. Sector averages can be pulled upward by a handful of expensive companies and distorted when loss-making firms are excluded.</p>

<h2>When a low P/E is a warning</h2>

<p>A low multiple often appears before reported earnings fully reflect a problem. Check for:</p>

<ul>
  <li>profits near the top of a commodity or inventory cycle;</li>
  <li>a major customer leaving or bringing production in-house;</li>
  <li>temporary tax benefits or asset-sale gains;</li>
  <li>debt that makes common equity unusually risky;</li>
  <li>shrinking revenue, weak orders, or deteriorating margins;</li>
  <li>a business whose product is becoming obsolete.</li>
</ul>

<p>This is the classic value trap: the denominator records yesterday’s profits while the price anticipates tomorrow’s decline.</p>

<h2>When a high P/E can make sense</h2>

<p>A high P/E has a better foundation when the company has a long reinvestment runway, strong returns on incremental capital, durable demand, rising or stable margins, a resilient balance sheet, and credible per-share earnings growth. Even then, the price can already require near-perfect execution.</p>

<p>Write down the earnings implied by a more ordinary future multiple. If a $100 stock trades at 40 times current EPS, what EPS would support the same price at 25 times earnings? The answer is $4. The company must double EPS from $2.50 to $4 merely for the price to remain $100 at that lower multiple.</p>

<h2>When P/E does not work</h2>

<p>P/E becomes unhelpful when earnings are negative, close to zero, temporarily inflated, or economically disconnected from cash generation. It can also make peer comparison messy when companies use very different amounts of debt.</p>

<p>The <a href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples">CFA Institute’s overview of valuation multiples</a> explains why other measures can fit different situations:</p>

<ul>
  <li><strong>Price/sales:</strong> useful when earnings are negative, but blind to cost structure and margin quality.</li>
  <li><strong>EV/EBITDA:</strong> useful for comparing operating businesses with different debt levels, but it ignores capital spending and working-capital needs.</li>
  <li><strong>Price/free cash flow:</strong> ties price to cash available after investment, but one year can be distorted by working capital or unusual spending.</li>
  <li><strong>Discounted cash flow:</strong> makes long-term assumptions explicit, but small assumption changes can create large valuation changes.</li>
</ul>

<h2>A 60-second P/E checklist</h2>

<ol>
  <li>Confirm whether the displayed P/E is trailing or forward.</li>
  <li>Check whether EPS is positive and representative.</li>
  <li>Compare the multiple with the company’s own history.</li>
  <li>Compare it with economically similar peers.</li>
  <li>Connect the premium or discount to growth, margins, and risk.</li>
  <li>Reconcile earnings with free cash flow.</li>
  <li>Use a second valuation method.</li>
  <li>Write the assumption that would make the current price too high.</li>
</ol>

<div class="source-note">
  <strong>Method and definitions:</strong> see the <a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC Beginner’s Guide to Financial Statements</a>, the <a href="https://www.investor.gov/introduction-investing/investing-basics/glossary/price-earnings-pe-ratio">Investor.gov P/E glossary</a>, and the <a href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples">CFA Institute review of price and enterprise-value multiples</a>. Ratios on data platforms can use different periods and adjustments, so verify the definition before comparing them.
</div>

<div class="cta-section">
  <h3>Check the multiple in context</h3>
  <p>Open a US stock page to see forward P/E beside growth, margins, cash, debt, free cash flow, and return on capital.</p>
  <a class="cta-button" href="/stocks">Browse US stock fundamentals →</a>
</div>
`,

  "free-cash-flow-vs-net-income": `
<div class="article-summary">
  <h2>The short answer</h2>
  <p>Net income tells you the profit recognized under accounting rules. Free cash flow estimates the cash left after operations and capital spending. Neither should be read alone. The reconciliation between them often reveals more than either headline.</p>
</div>

<p>A company can report record profit and weak cash flow in the same quarter. Another can report modest net income while cash pours in. Both situations can be legitimate. Both can also warn that the simple earnings story is incomplete.</p>

<p>To understand free cash flow vs net income, follow the financial statements in sequence: profit is calculated on the income statement, reconciled to operating cash flow, then reduced by investment in long-lived assets.</p>

<h2>Net income: the accounting profit</h2>

<p>Net income is revenue minus the expenses recognized during the period, including the direct cost of sales, operating expenses, interest, taxes, depreciation, and other gains or losses. It appears near the bottom of the income statement and feeds into earnings per share.</p>

<p>Accrual accounting tries to match economic activity with the period when it occurred. A company can recognize a sale before collecting the cash. It can record depreciation expense years after paying cash for a machine. That timing work makes net income useful, but it keeps net income from being the same thing as cash generated.</p>

<h2>Free cash flow: the cash after investment</h2>

<div class="sample-brief">
  <h4>A common investor formula</h4>
  <p><strong>Free cash flow = cash flow from operating activities − capital expenditures</strong></p>
  <p>Capital expenditures usually mean cash spent on property, plant, and equipment. A company may publish a different non-GAAP definition, so read its reconciliation and use a consistent formula.</p>
</div>

<p>Free cash flow is not a required subtotal under US GAAP. It is calculated from statement items. That makes the label less standardized than net income. Some companies subtract purchases of property and equipment. Others adjust for asset sales, acquisitions, finance leases, or other items.</p>

<p>For comparison work, calculate a plain version yourself and then examine any company-adjusted version separately.</p>

<h2>A simple free cash flow vs net income example</h2>

<div class="table-scroll">
<table>
  <thead><tr><th>Step</th><th>Amount</th><th>What happened</th></tr></thead>
  <tbody>
    <tr><td>Net income</td><td>$100m</td><td>Profit recognized for the period</td></tr>
    <tr><td>Add depreciation</td><td>+$30m</td><td>Expense reduced profit but did not use cash this period</td></tr>
    <tr><td>Increase in receivables</td><td>−$20m</td><td>Some recognized sales have not been collected</td></tr>
    <tr><td>Increase in payables</td><td>+$10m</td><td>Some expenses have not yet been paid</td></tr>
    <tr><td>Operating cash flow</td><td>$120m</td><td>Cash generated by operations</td></tr>
    <tr><td>Capital expenditures</td><td>−$50m</td><td>Cash invested in long-lived assets</td></tr>
    <tr><td>Free cash flow</td><td>$70m</td><td>Cash remaining after that investment</td></tr>
  </tbody>
</table>
</div>

<p>The $30 million gap between net income and free cash flow has an explanation. Depreciation helped operating cash flow, working capital used some cash, and new investment used more. The analysis starts with that bridge.</p>

<h2>Why free cash flow and net income differ</h2>

<h3>1. Depreciation and amortization</h3>

<p>A company usually pays cash for a long-lived asset upfront, then recognizes depreciation or amortization expense over time. The expense lowers net income without using cash in the current period, so it is added back in the operating section of an indirect cash flow statement.</p>

<p>That add-back does not make the cost imaginary. Equipment wears out, data centers need upgrades, and acquired technology can lose value. Capital expenditures help show how much fresh cash the business is putting back into its asset base.</p>

<h3>2. Working capital</h3>

<p>Revenue can be recognized before a customer pays. Inventory can be purchased before it is sold. Suppliers can be paid after an expense is recorded. These timing differences move through receivables, inventory, payables, deferred revenue, and other working-capital accounts.</p>

<p>A growing company may consume cash as inventory and receivables rise. That can be sensible if the cash converts later. Warning signs include receivables growing much faster than sales, inventory rising while demand weakens, or a cash shortfall that repeats without a clear growth payoff.</p>

<h3>3. Capital expenditures</h3>

<p>Capital expenditures do not reduce net income immediately. They appear as investing cash outflows and are expensed gradually through depreciation. A factory, telecom network, airline fleet, or cloud infrastructure build can therefore create a large gap between profit and free cash flow.</p>

<p>Separate maintenance spending from growth spending when the evidence allows it. Maintenance capex keeps the existing earnings engine running. Growth capex is intended to create new capacity or revenue. Companies rarely disclose a perfect split, so avoid pretending the estimate is exact.</p>

<h3>4. Stock-based compensation</h3>

<p>Stock-based compensation lowers net income and is commonly added back in operating cash flow because it is a non-cash expense during the period. Shareholders still bear an economic cost when new shares dilute their ownership.</p>

<p>For companies with large stock awards, track free cash flow alongside diluted shares and the cash spent on repurchases. A buyback that merely offsets employee issuance is different from a genuine reduction in share count.</p>

<h3>5. One-time and non-operating items</h3>

<p>Asset sales, impairments, litigation, restructuring, tax changes, and acquisition costs can affect one measure differently from the other. Read the cash flow statement and footnotes before removing an item. “One-time” costs that appear every year are part of the economics.</p>

<h2>Which matters more for investors?</h2>

<p>Use the metric that answers the question, then confirm it with the other one.</p>

<div class="table-scroll">
<table>
  <thead><tr><th>Question</th><th>Start here</th><th>Then check</th></tr></thead>
  <tbody>
    <tr><td>Is the company profitable under accounting rules?</td><td>Net income and operating margin</td><td>Adjusted items and tax effects</td></tr>
    <tr><td>Did operations produce cash?</td><td>Operating cash flow</td><td>Working-capital movements</td></tr>
    <tr><td>What cash remained after asset investment?</td><td>Free cash flow</td><td>Maintenance vs growth capex</td></tr>
    <tr><td>Can it fund debt repayment, dividends, or buybacks?</td><td>Multi-year free cash flow</td><td>Cash balance, maturities, and cyclicality</td></tr>
    <tr><td>Are reported earnings high quality?</td><td>Net income-to-cash reconciliation</td><td>Receivables, inventory, SBC, and footnotes</td></tr>
  </tbody>
</table>
</div>

<p>For an established, asset-light company, persistent free cash flow close to or above net income can support the quality of reported earnings. For a capital-heavy growth project, weak current free cash flow may be expected. The burden is to show that the spending can earn an acceptable return.</p>

<h2>Can net income be positive while free cash flow is negative?</h2>

<p>Yes. Common reasons include a large factory build, inventory accumulation, slower customer collections, or a temporary working-capital swing. Ask four questions:</p>

<ol>
  <li>Where exactly did the cash go?</li>
  <li>Was the use temporary, recurring, or discretionary?</li>
  <li>What return should the investment produce?</li>
  <li>Can the balance sheet fund it if the payoff takes longer?</li>
</ol>

<p>Negative free cash flow is more concerning when the core business is mature, the cash burn repeats, debt is rising, and management cannot connect spending to measurable future capacity or demand.</p>

<h2>Can free cash flow be positive while net income is negative?</h2>

<p>Also yes. Large non-cash depreciation, amortization, or stock compensation can push accounting earnings below zero while operations generate cash. Customer prepayments can help too. The result deserves the same skepticism: check whether the cash source is durable and whether dilution or deferred obligations are accumulating elsewhere.</p>

<h2>Free cash flow conversion</h2>

<div class="sample-brief">
  <h4>One useful quality check</h4>
  <p><strong>Free cash flow conversion = free cash flow ÷ net income</strong></p>
  <p>Use several years, not one quarter. The ratio becomes unstable when net income is tiny or negative, and comparisons work best among similar businesses.</p>
</div>

<p>A multi-year conversion rate can reveal whether earnings regularly arrive as cash. It is a diagnostic tool rather than a pass/fail score. A company funding a new plant and a mature software company should not have the same expected conversion.</p>

<h2>Common analysis mistakes</h2>

<ul>
  <li><strong>Using one year:</strong> working capital and capital spending can make a single period unusually strong or weak.</li>
  <li><strong>Treating every add-back as free:</strong> depreciation and stock compensation represent real economic costs even when they are non-cash today.</li>
  <li><strong>Ignoring acquisitions:</strong> standard free cash flow often excludes acquisition spending even when acquisitions are a recurring growth strategy.</li>
  <li><strong>Comparing mixed definitions:</strong> one platform may use trailing figures while another uses a fiscal year or company-adjusted measure.</li>
  <li><strong>Skipping the balance sheet:</strong> a business can report positive free cash flow and still face debt maturities or restricted cash.</li>
</ul>

<h2>A five-year cash-quality review</h2>

<ol>
  <li>Chart revenue, net income, operating cash flow, capex, and free cash flow.</li>
  <li>Mark acquisitions, restructurings, and major capacity projects.</li>
  <li>Compare cumulative net income with cumulative free cash flow.</li>
  <li>Inspect receivables, inventory, payables, and deferred revenue.</li>
  <li>Track diluted share count and stock-based compensation.</li>
  <li>Read management’s explanation in MD&amp;A and the footnotes.</li>
  <li>Decide whether the gap reflects growth investment, timing, or weak economics.</li>
</ol>

<p>The SEC explains that the operating section of the cash flow statement reconciles net income with cash generated or used by operations, while investing activities include purchases of long-term assets. That bridge is the primary evidence. A chart helps you find the question; the filing helps you answer it.</p>

<div class="source-note">
  <strong>Primary-source guide:</strong> the <a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC Beginner’s Guide to Financial Statements</a> explains the relationship between net income, operating cash flow, investing cash flows, and footnotes. For valuation context, the <a href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples">CFA Institute’s multiples review</a> distinguishes operating cash flow, free cash flow to equity, and EBITDA. Company definitions can vary, so verify each calculation against the latest filing.
</div>

<div class="cta-section">
  <h3>See profit and free cash flow together</h3>
  <p>Open any covered US stock to compare five-year revenue, profit, free cash flow, margins, cash, and debt on one page.</p>
  <a class="cta-button" href="/stocks">Explore stock financials →</a>
</div>
`,

  "gross-margin-vs-operating-margin-vs-net-margin": `
<div class="article-summary">
  <h2>The short answer</h2>
  <p>Gross margin shows the economics of the product. Operating margin shows the cost of running the business around it. Net margin shows what remained after interest, taxes, and non-operating items. Read the three as a bridge, not as competing scores.</p>
</div>

<p>Revenue says how much a company sold. Profit margins show how much of each sales dollar survived at different levels of the income statement. That makes the pattern across gross margin, operating margin, and net margin more useful than any isolated percentage.</p>

<p>When margins move in different directions, they point to the part of the business that changed.</p>

<h2>The income statement as a margin bridge</h2>

<div class="table-scroll">
<table>
  <thead><tr><th>Starting with revenue</th><th>What is subtracted</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td>Revenue</td><td>Direct cost of goods or services</td><td>Gross profit</td></tr>
    <tr><td>Gross profit</td><td>Research, sales, administration, and other operating expenses</td><td>Operating income</td></tr>
    <tr><td>Operating income</td><td>Interest, taxes, and non-operating items</td><td>Net income</td></tr>
  </tbody>
</table>
</div>

<p>The exact labels vary by company and industry. Banks and insurers use specialized statements. Some service companies do not report a distinct gross-profit subtotal. Always check the filing rather than forcing every company into the same template.</p>

<h2>Gross margin: are the product economics improving?</h2>

<div class="sample-brief">
  <h4>Gross margin formula</h4>
  <p><strong>Gross margin = (revenue − cost of revenue) ÷ revenue</strong></p>
  <p>A company with $1 billion of revenue and $600 million of direct costs has $400 million of gross profit and a 40% gross margin.</p>
</div>

<p>Gross margin measures what remains after the cost directly associated with delivering the product or service. Depending on the business, direct costs can include materials, manufacturing labor, freight, cloud infrastructure, content costs, payment processing, or customer support.</p>

<p>A rising gross margin can come from:</p>

<ul>
  <li>higher prices;</li>
  <li>a shift toward higher-margin products or services;</li>
  <li>lower input, freight, or hosting costs;</li>
  <li>better factory utilization or production yields;</li>
  <li>less discounting;</li>
  <li>accounting classification changes that need verification.</li>
</ul>

<p>A falling gross margin can signal weaker pricing, input inflation, a less profitable sales mix, excess capacity, launch costs, inventory charges, or intense competition. Read management’s margin bridge and segment disclosures to identify the cause.</p>

<h2>Operating margin: can the company run efficiently?</h2>

<div class="sample-brief">
  <h4>Operating margin formula</h4>
  <p><strong>Operating margin = operating income ÷ revenue</strong></p>
  <p>If the company above spends $250 million on research, sales, and administration, it has $150 million of operating income and a 15% operating margin.</p>
</div>

<p>Operating margin includes the costs required to build, sell, and manage the business. For a software company, research and sales spending can be large even when gross margin is high. For a retailer, gross margin may be modest but efficient logistics and store operations can still produce a sound operating margin.</p>

<p>The gap between gross margin and operating margin is where the company’s operating model lives. Track:</p>

<ul>
  <li>research and development as a percentage of revenue;</li>
  <li>sales and marketing efficiency;</li>
  <li>general and administrative leverage;</li>
  <li>restructuring and acquisition-related costs;</li>
  <li>stock-based compensation included in operating expenses.</li>
</ul>

<p>Operating leverage appears when revenue grows faster than operating expenses and operating margin rises. That can be powerful, but cost cuts are not automatically durable. Ask whether the company preserved product development, customer service, and the capacity needed for future growth.</p>

<h2>Net margin: what reached common shareholders?</h2>

<div class="sample-brief">
  <h4>Net profit margin formula</h4>
  <p><strong>Net margin = net income ÷ revenue</strong></p>
  <p>If interest, taxes, and other items reduce the example company’s $150 million operating income to $105 million, its net margin is 10.5%.</p>
</div>

<p>Net margin includes financing and tax effects. A heavily indebted company can have a healthy operating margin and a weak net margin because interest consumes much of the operating profit. A one-time tax benefit or asset sale can push net margin above the level implied by normal operations.</p>

<p>For valuation, net income matters because it belongs to common shareholders and feeds EPS. For operating comparison, net margin can become noisy when companies use different debt levels, tax structures, or non-operating investments.</p>

<h2>Gross margin vs operating margin vs net margin</h2>

<div class="table-scroll">
<table>
  <thead><tr><th>Margin</th><th>Best question</th><th>Common distortion</th></tr></thead>
  <tbody>
    <tr><td>Gross margin</td><td>Are the product or service economics improving?</td><td>Different cost classifications across companies</td></tr>
    <tr><td>Operating margin</td><td>Does the business gain efficiency as it grows?</td><td>Restructuring, stock compensation, and adjusted figures</td></tr>
    <tr><td>Net margin</td><td>What portion of sales became accounting profit?</td><td>Interest, taxes, asset sales, and one-time gains or losses</td></tr>
  </tbody>
</table>
</div>

<h2>How to read margins when they disagree</h2>

<h3>Gross margin rises, operating margin falls</h3>

<p>The product economics improved, but operating expenses grew faster. The company may be hiring engineers, spending on distribution, entering a new market, or losing cost discipline. Look for a measurable return on the spending.</p>

<h3>Operating margin rises, gross margin falls</h3>

<p>Management cut or controlled operating expenses enough to offset weaker product economics. That can protect near-term profit, but continued gross-margin erosion may eventually overwhelm the savings.</p>

<h3>Operating margin is stable, net margin falls</h3>

<p>The core operation may be steady while interest expense, taxes, foreign exchange, investment losses, or another non-operating item worsens. Open the balance sheet and debt footnote.</p>

<h3>All three margins rise</h3>

<p>Pricing, mix, delivery costs, and operating efficiency may all be improving. Confirm that the change was not created by a temporary shortage, cost capitalization, one-time benefit, or unusually favorable demand.</p>

<h3>All three margins fall</h3>

<p>The business may face price competition, input inflation, underused capacity, weaker mix, or operating deleverage. Compare the decline with peers to separate a company problem from an industry cycle.</p>

<h2>What is a good profit margin?</h2>

<p>A good margin is durable, supported by the business model, and strong relative to relevant peers and the company’s own history. One universal percentage does not work.</p>

<div class="table-scroll">
<table>
  <thead><tr><th>Business model</th><th>Why normal margins differ</th><th>Useful context</th></tr></thead>
  <tbody>
    <tr><td>Subscription software</td><td>Low replication cost can create high gross margins</td><td>Retention, sales efficiency, stock compensation</td></tr>
    <tr><td>Grocery and mass retail</td><td>High volume and intense price competition create thin margins</td><td>Inventory turns, comparable sales, operating discipline</td></tr>
    <tr><td>Semiconductors</td><td>Product mix, yields, utilization, and cycles move margins</td><td>Inventory, capacity, customer concentration</td></tr>
    <tr><td>Manufacturing</td><td>Materials, labor, freight, and factory utilization matter</td><td>Backlog, incremental margin, capital spending</td></tr>
    <tr><td>Advertising platforms</td><td>Scaled digital distribution can support high margins</td><td>Traffic-acquisition costs, regulation, product investment</td></tr>
  </tbody>
</table>
</div>

<p>Use the median of a carefully selected peer set when possible. Averages can be distorted by outliers. Compare the same fiscal period and the same definition, especially when one company emphasizes adjusted operating margin while another reports GAAP.</p>

<h2>Margin level vs margin trend</h2>

<p>The level describes the current economics. The trend describes direction. A company with a 30% operating margin falling toward 25% may deserve more investigation than a company improving from 10% to 14%, even though the first still has the higher level.</p>

<p>Chart at least five annual periods plus recent quarters. Annual data reveal the longer structure. Quarterly data reveal inflections, but seasonality can make sequential comparison misleading. Compare holiday retailers with the same quarter a year earlier.</p>

<h2>Use incremental margin to study scaling</h2>

<div class="sample-brief">
  <h4>Incremental operating margin</h4>
  <p><strong>Change in operating income ÷ change in revenue</strong></p>
  <p>If revenue rises by $100 million and operating income rises by $25 million, the incremental operating margin is 25%. This shows how much of the new revenue became additional operating profit.</p>
</div>

<p>Incremental margin can reveal operating leverage before the headline margin changes dramatically. Use normal periods and investigate acquisitions, currency, and restructuring that make the comparison less clean.</p>

<h2>Margins do not equal cash flow</h2>

<p>All three margins come from the income statement. They do not show when customers paid, how inventory moved, or how much cash was spent on equipment. A company can expand net margin while free cash flow falls because receivables, inventory, or capital expenditures consume cash.</p>

<p>Pair the margin chart with the <a href="/blog/free-cash-flow-vs-net-income">free cash flow vs net income</a> bridge and the balance sheet. Then connect profitability to valuation using the guide to <a href="/blog/what-is-a-good-pe-ratio">what makes a P/E ratio reasonable</a>.</p>

<h2>Common margin-analysis mistakes</h2>

<ul>
  <li><strong>Comparing unrelated industries:</strong> business models produce structurally different margins.</li>
  <li><strong>Mixing gross profit and gross margin:</strong> gross profit is an amount; gross margin is a percentage of revenue.</li>
  <li><strong>Mixing GAAP and adjusted margins:</strong> inspect every excluded cost and its recurrence.</li>
  <li><strong>Ignoring product mix:</strong> total revenue can rise while a shift toward lower-margin sales weakens economics.</li>
  <li><strong>Using one quarter:</strong> seasonality, launches, shutdowns, and restructuring can distort a short period.</li>
  <li><strong>Skipping segments:</strong> one profitable unit can hide deterioration elsewhere.</li>
  <li><strong>Assuming higher is always better:</strong> underinvestment can lift current margin while weakening future growth.</li>
</ul>

<h2>A practical margin checklist</h2>

<ol>
  <li>Verify each subtotal in the latest filing.</li>
  <li>Chart gross, operating, and net margin together.</li>
  <li>Compare annual trends and seasonally matched quarters.</li>
  <li>Identify price, volume, mix, input-cost, and utilization effects.</li>
  <li>Measure operating-expense growth against revenue growth.</li>
  <li>Explain the gap between operating and net income.</li>
  <li>Compare with economically similar peers.</li>
  <li>Check free cash flow and return on invested capital.</li>
  <li>Write what could reverse the current margin trend.</li>
</ol>

<p>The <a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC’s financial statement guide</a> describes the income statement as a staircase from revenue through direct costs, operating expenses, interest, taxes, and net income. That staircase is the cleanest way to understand why the three margins differ.</p>

<div class="source-note">
  <strong>Definitions and verification:</strong> use the <a href="https://www.sec.gov/about/reports-publications/investorpubsbegfinstmtguide">SEC Beginner’s Guide to Financial Statements</a> for the income-statement structure and operating-margin formula, then verify company-specific classifications in its latest 10-K or 10-Q through <a href="https://www.sec.gov/search-filings">SEC EDGAR</a>. The <a href="https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/market-based-valuation-price-enterprise-value-multiples">CFA Institute</a> explains why profitability and growth affect justified valuation multiples.
</div>

<div class="cta-section">
  <h3>Follow the margin trend</h3>
  <p>Open a covered US stock to compare gross, operating, and profit margins across five years and the latest trailing period.</p>
  <a class="cta-button" href="/stocks">Browse margin charts →</a>
</div>
`,
};
