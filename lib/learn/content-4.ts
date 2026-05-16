export const posts_31_40: Record<string, string> = {
  "sector-rotation-strategy": `
<h2>Money Never Sits Still</h2>
<p><strong>Sector rotation</strong> is the movement of investment capital from one industry sector to another as the economy moves through different phases of the business cycle. Different sectors naturally outperform at different points in the cycle. Understanding this pattern helps you position your portfolio ahead of the shift rather than reacting after it happens.</p>

<h2>The Business Cycle and Sector Behavior</h2>
<p>The economy moves through four phases, and each favors different sectors:</p>

<h3>1. Early Cycle (Recovery)</h3>
<p>Coming out of a recession. Interest rates are low, credit is easing, and consumer confidence is rebuilding.</p>
<ul>
  <li><strong>Winners:</strong> Consumer Discretionary (people start spending again), Financials (lending picks up), Industrials (businesses invest in capacity).</li>
  <li><strong>Losers:</strong> Utilities, Consumer Staples (defensive sectors that outperformed during the recession get sold as risk appetite returns).</li>
</ul>

<h3>2. Mid Cycle (Expansion)</h3>
<p>The longest phase. The economy is growing steadily, corporate profits are strong, employment is rising.</p>
<ul>
  <li><strong>Winners:</strong> Technology (businesses invest in productivity), Industrials, Energy (demand is strong).</li>
  <li><strong>Losers:</strong> Defensive sectors underperform as risk appetite remains high.</li>
</ul>

<h3>3. Late Cycle (Overheating)</h3>
<p>Growth is peaking. Inflation rises. The Fed starts raising rates to cool things down. Capacity constraints appear.</p>
<ul>
  <li><strong>Winners:</strong> Energy (commodity prices rise with inflation), Materials, Healthcare (defensive).</li>
  <li><strong>Losers:</strong> Technology and Consumer Discretionary (higher rates hurt growth stock valuations).</li>
</ul>

<h3>4. Recession (Contraction)</h3>
<p>Economic activity contracts. Profits fall. Unemployment rises. The Fed cuts rates.</p>
<ul>
  <li><strong>Winners:</strong> Utilities (people still need electricity), Consumer Staples (people still buy toothpaste and groceries), Healthcare (non-discretionary).</li>
  <li><strong>Losers:</strong> Consumer Discretionary (luxury spending falls), Industrials, Financials (loan losses rise), Real Estate.</li>
</ul>

<h2>Implementing Sector Rotation</h2>
<p>You don't need to time the exact cycle turn - that's nearly impossible. Instead:</p>
<ul>
  <li><strong>Monitor the signals</strong> - Interest rate direction, yield curve shape, manufacturing PMI, unemployment rate, consumer confidence. These tell you where we are in the cycle.</li>
  <li><strong>Overweight, don't go all-in</strong> - Tilt your portfolio 10-15% toward favored sectors rather than making binary bets. If the rotation doesn't play out immediately, you're still diversified.</li>
  <li><strong>Use sector ETFs</strong> - State Street's Select Sector SPDRs (XLK, XLF, XLE, XLV, etc.) let you target specific sectors easily and cheaply.</li>
  <li><strong>Don't fight the Fed</strong> - When the Fed is cutting rates, it favors aggressive positioning. When the Fed is hiking, favor defense. This simple rule has been profitable for decades.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>Different sectors lead in different phases of the economic cycle. Capital constantly rotates.</li>
  <li>Early cycle favors cyclicals (consumer, financials). Late cycle favors defensives and commodities.</li>
  <li>Overweight favored sectors by 10-15% rather than making all-or-nothing bets. Use sector ETFs for easy implementation.</li>
</ul>
`,

  "options-trading-basics": `
<h2>Rights, Not Obligations</h2>
<p>An <strong>option</strong> is a contract that gives the buyer the right - but not the obligation - to buy or sell an underlying asset at a specific price (the strike price) by a specific date (expiration). Options are powerful tools that can be used for speculation, hedging, or generating income. But they're also complex and risky if used improperly.</p>

<h2>Calls and Puts: The Building Blocks</h2>
<ul>
  <li><strong>Call option</strong> - Gives the buyer the right to buy shares at the strike price. You buy calls when you're bullish - you expect the stock to go up. If the stock rises above the strike price plus the premium you paid, you profit. If it doesn't, the option expires worthless and you lose only the premium.</li>
  <li><strong>Put option</strong> - Gives the buyer the right to sell shares at the strike price. You buy puts when you're bearish - you expect the stock to fall. Or when you want to protect (hedge) a long stock position. If the stock falls below the strike price, you profit.</li>
</ul>

<h2>Key Option Terminology</h2>
<ul>
  <li><strong>Strike price</strong> - The price at which the option can be exercised.</li>
  <li><strong>Expiration date</strong> - The last day the option contract is valid. Options lose value as expiration approaches (theta decay).</li>
  <li><strong>Premium</strong> - The price you pay to buy an option. It's determined by the stock price, strike price, time to expiration, volatility, and interest rates.</li>
  <li><strong>In-the-money (ITM)</strong> - The option has intrinsic value. For a call: stock price > strike price. For a put: stock price < strike price.</li>
  <li><strong>Out-of-the-money (OTM)</strong> - No intrinsic value. The option's entire value is time and volatility premium. Most options bought by speculators expire OTM and worthless.</li>
</ul>

<h2>Basic Option Strategies</h2>

<h3>Covered Call (Income Strategy)</h3>
<p>You own 100 shares of a stock and sell a call option against those shares. You collect the premium. If the stock stays below the strike price, you keep the premium and your shares. If the stock rises above the strike, your shares get called away - you keep the premium plus the gain up to the strike price, but you miss out on gains above the strike.</p>
<p>This is a conservative strategy for generating extra income on stocks you'd be willing to sell at a higher price anyway.</p>

<h3>Protective Put (Hedging Strategy)</h3>
<p>You own 100 shares and buy a put option. If the stock crashes, the put gains value, offsetting some or all of your stock losses. It's like buying insurance - you pay a premium for downside protection.</p>

<h3>Cash-Secured Put (Entry Strategy)</h3>
<p>You sell a put option with enough cash in your account to buy the stock if assigned. You collect the premium. If the stock stays above the strike, you keep the premium. If it falls below, you buy the stock at the strike price (which you were willing to do anyway), and you effectively bought it at a discount because of the premium you collected.</p>

<h2>Why Most Option Buyers Lose</h2>
<p>Buying options is hard because you need three things to go right: the stock has to move in your direction, it has to move enough to overcome the premium, and it has to do it before expiration. Options sellers, on the other hand, benefit from time decay - they profit if the stock does nothing or moves only modestly.</p>

<h2>Key Takeaways</h2>
<ul>
  <li>Calls = right to buy (bullish). Puts = right to sell (bearish or hedging).</li>
  <li>Options have time decay - they lose value every day as expiration approaches. This makes option buying difficult.</li>
  <li>Covered calls and cash-secured puts are conservative strategies for income and better entry prices.</li>
</ul>
`,

  "understanding-yield-curve": `
<h2>The Bond Market's Crystal Ball</h2>
<p>The <strong>yield curve</strong> is a graph showing the interest rates (yields) on bonds of the same credit quality but different maturities. Typically, it plots US Treasury yields from 1-month to 30-year maturities. The shape of the curve is one of the most reliable predictors of where the economy is headed.</p>

<h2>The Three Shapes of the Yield Curve</h2>

<h3>Normal (Upward Sloping)</h3>
<p>Longer-term bonds yield more than shorter-term bonds. This is the normal state of affairs - investors demand higher yields to lock up their money for longer periods, compensating for inflation risk and uncertainty. A normal curve signals healthy economic expectations.</p>

<h3>Flat</h3>
<p>Short-term and long-term yields are roughly equal. The market is uncertain - it sees roughly equal odds of expansion and contraction. A flattening curve often precedes an inversion. It's the yellow warning light on the economic dashboard.</p>

<h3>Inverted (Downward Sloping)</h3>
<p>Short-term bonds yield MORE than long-term bonds. This is abnormal - it means investors are so worried about the near-term outlook that they're willing to accept lower yields for longer maturities just to lock in a safe return. <strong>An inverted yield curve has preceded every US recession since 1955.</strong> The most common measure is the 2-year vs. 10-year Treasury spread.</p>
<p>The warning: when the 2-year yield rises above the 10-year yield, a recession typically follows within 6-24 months. It's not perfectly timed, but it's the most reliable macro warning signal we have.</p>

<h2>Why Does an Inversion Predict Recession?</h2>
<p>An inverted curve crushes bank lending - the core of the economy. Banks borrow short-term (deposits) and lend long-term (mortgages, business loans). Their profit comes from the spread between short and long rates. When that spread turns negative, lending becomes unprofitable, credit tightens, businesses can't expand, and economic activity slows.</p>

<h2>How to Use the Yield Curve in Investing</h2>
<ul>
  <li><strong>Inversion doesn't mean sell everything immediately</strong> - Stocks often continue rising for months after inversion. But it means caution is warranted: trim extreme risk positions, raise some cash, focus on quality.</li>
  <li><strong>Watch for the "un-inversion"</strong> - When the curve steepens back to normal, it often happens because short-term rates are falling fast (the Fed is cutting aggressively). This is when recession fears peak - and historically, it's been a good time to start adding risk.</li>
  <li><strong>Don't use it as a short-term timing tool</strong> - The lead time between inversion and recession is unpredictable. Use the curve as a risk management signal, not a market-timing trigger.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>An inverted yield curve (2-year > 10-year) has preceded every US recession since 1955.</li>
  <li>It works by crushing bank lending profitability, which tightens credit and slows the economy.</li>
  <li>Use it as a yellow/red warning light - raise quality, reduce leverage, build cash. Don't panic-sell everything.</li>
</ul>
`,

  "how-to-analyze-earnings-reports": `
<h2>Earnings Season Is Opportunity Season</h2>
<p>Four times a year, public companies report their financial results, and stock prices swing dramatically. <strong>Earnings reports</strong> are the most important recurring events for stock investors - they're the report card that confirms or challenges your investment thesis. Knowing how to read them efficiently gives you an edge.</p>

<h2>Beyond the Headline Numbers</h2>
<p>The financial media focuses on two numbers: <strong>EPS (earnings per share) vs. estimates</strong> and <strong>revenue vs. estimates</strong>. These matter, but they're just the starting point. The real story is usually in the details:</p>

<h3>Revenue Quality</h3>
<ul>
  <li><strong>Organic vs. acquired growth</strong> - Did revenue grow because the core business is expanding, or because the company bought another company? Organic growth is higher quality.</li>
  <li><strong>Same-store sales</strong> (for retailers) - Are existing stores selling more, or is growth just from opening new locations? Same-store sales reveal true demand.</li>
  <li><strong>Revenue per user/customer</strong> - Are customers spending more over time? This is the best signal of product strength.</li>
</ul>

<h3>Margin Trends</h3>
<p>Revenue growth is great, but if margins are shrinking, it means the company is spending more to generate that revenue - discounts, marketing, higher costs. Key metrics:</p>
<ul>
  <li><strong>Gross margin</strong> - Are input costs rising? Is pricing power holding?</li>
  <li><strong>Operating margin</strong> - Is the company achieving operating leverage (revenue growing faster than expenses)?</li>
</ul>

<h3>Guidance: The Forward-Looking Signal</h3>
<p>Companies provide <strong>guidance</strong> - their own forecast for the next quarter or year. When a company beats earnings estimates but <strong>cuts guidance</strong>, the stock can drop sharply because the market cares more about the future than the past. Raise guidance = bullish. Cut guidance = bearish. This is often the single most important part of the report.</p>

<h2>The Conference Call: Where the Real Insight Lives</h2>
<p>After the numbers are released, management holds a conference call with analysts. This is where you hear the tone, the nuance, and the unscripted comments. Listen for:</p>
<ul>
  <li><strong>Management's tone</strong> - Are they confident and specific, or defensive and vague?</li>
  <li><strong>Analyst questions</strong> - What are the pros worried about? The Q&A reveals what the smartest people in the room are focused on.</li>
  <li><strong>New metrics or framing</strong> - When management suddenly emphasizes a new metric, it's often because the old one no longer looks good.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>EPS and revenue vs. estimates are just the starting point. Dig into organic growth, margins, and guidance.</li>
  <li>Guidance changes often matter more than the actual results. Markets price the future.</li>
  <li>Listen to the conference call Q&A. That's where the real insight comes out.</li>
</ul>
`,

  "value-investing-principles": `
<h2>The Timeless Framework</h2>
<p><strong>Value investing</strong> is the discipline of buying assets for less than they're worth. It was formalized by Benjamin Graham in the 1930s and refined by his most famous student, Warren Buffett. While the specific techniques have evolved, the core principles remain unchanged - and they remain the most reliable path to long-term investment success.</p>

<h2>Margin of Safety: The Most Important Concept</h2>
<p>Graham's central insight: <strong>never pay full price</strong>. If you estimate a company is worth $100 per share, don't pay $95. Pay $60 or $70. The gap between your purchase price and intrinsic value is your <strong>margin of safety</strong>. It protects you from being wrong (which you will be, sometimes) and amplifies your returns when you're right.</p>
<p>Think of it like engineering a bridge: if the maximum expected load is 10 tons, you build it to hold 30 tons. The extra capacity is the margin of safety. Investing works the same way.</p>

<h2>Mr. Market: Your Bipolar Business Partner</h2>
<p>Graham's famous allegory imagines the stock market as "Mr. Market" - a business partner who shows up every day offering to buy your shares or sell you his at wildly different prices. Some days he's euphoric and offers high prices. Other days he's depressed and offers low prices.</p>
<p>The key insight: <strong>you don't have to trade with Mr. Market</strong>. He's there to serve you, not to guide you. When he offers a ridiculously low price, buy. When he offers a ridiculously high price, sell. The rest of the time, ignore him. The market is a voting machine in the short run but a weighing machine in the long run - eventually, prices reflect intrinsic value.</p>

<h2>Modern Value Investing: Beyond P/B and P/E</h2>
<p>Graham's original metrics - buying stocks below book value or at single-digit P/Es - worked brilliantly in an era when most companies were asset-heavy industrials. Today, the most valuable companies are asset-light (software, platforms, brands), so book value is less relevant.</p>
<p>Buffett's evolution was crucial: he shifted from buying "cigar butt" companies (cheap but mediocre) to buying <strong>wonderful companies at fair prices</strong>. The best value investments today are companies with durable competitive advantages (moats), high returns on capital, and competent management - trading at reasonable valuations.</p>

<h2>Practical Value Investing Checklist</h2>
<ol>
  <li><strong>Does the company have a durable competitive advantage?</strong> Can competitors easily replicate what it does?</li>
  <li><strong>Is management competent and shareholder-friendly?</strong> Do they allocate capital wisely? Do they own significant stock?</li>
  <li><strong>Are the financials strong?</strong> Consistent revenue growth, high margins, high ROE, manageable debt, strong free cash flow.</li>
  <li><strong>Is the stock undervalued?</strong> P/E below historical average? PEG ratio below 1.5? DCF valuation showing significant upside?</li>
  <li><strong>What's the margin of safety?</strong> Is there at least a 20-30% discount to your estimate of intrinsic value?</li>
</ol>

<h2>Key Takeaways</h2>
<ul>
  <li>Margin of safety is the single most important concept - never pay full price for anything.</li>
  <li>Mr. Market is emotional and irrational. Exploit his mood swings, don't follow them.</li>
  <li>Modern value investing means buying great companies at fair prices, not mediocre companies at cheap prices.</li>
</ul>
`,

  "garp-strategy": `
<h2>The Middle Way</h2>
<p><strong>Growth at a Reasonable Price (GARP)</strong> is an investment strategy that blends growth and value principles. GARP investors seek companies with above-average earnings growth but refuse to pay the nosebleed multiples that pure growth investors accept. It's the sensible middle ground - you get the upside of growth without the downside of extreme overvaluation.</p>

<h2>The PEG Ratio: The GARP Investor's Tool</h2>
<p>The <strong>PEG ratio</strong> (Price/Earnings ÷ Growth rate) is the signature metric of GARP investing. It adjusts the P/E ratio for growth - a company trading at 30x earnings might be expensive if it's growing at 10%, but cheap if it's growing at 40%.</p>
<p>Rule of thumb: <strong>PEG below 1.0 is potentially undervalued. PEG above 2.0 is expensive.</strong> But like all rules of thumb, it needs context - the earnings growth rate used in the calculation is typically analyst estimates, which can be wrong.</p>

<h2>What GARP Investors Look For</h2>
<ul>
  <li><strong>Consistent earnings growth of 10-20% annually</strong> - Not the explosive 50%+ growth of speculative growth stocks, but strong enough to compound wealth over time.</li>
  <li><strong>PEG ratio below 1.5</strong> - You're paying a reasonable price for the growth you're getting.</li>
  <li><strong>Sustainable competitive advantage</strong> - The growth isn't a one-time event. The company has something that keeps competitors at bay.</li>
  <li><strong>Solid balance sheet</strong> - Low to moderate debt. The company can fund its growth without depending on constant borrowing.</li>
  <li><strong>Positive earnings surprises</strong> - The company consistently beats earnings estimates, suggesting the market is underestimating its growth potential.</li>
</ul>

<h2>GARP in Practice</h2>
<p>GARP lives in the space between deep value (buying very cheap, possibly troubled companies) and aggressive growth (buying very expensive, high-growth companies). It avoids the value trap (cheap for good reason - the business is declining) and the growth trap (paying 60x earnings for a company whose growth slows to 15%).</p>
<p>Many of the best-performing stocks of the last decade were GARP stocks at some point: Apple when it traded at 12-15x earnings but was growing earnings at 15-20%, Microsoft during its cloud transition, Visa and Mastercard for most of their public histories.</p>

<h2>Key Takeaways</h2>
<ul>
  <li>GARP = Growth at a Reasonable Price. The middle ground between value and growth.</li>
  <li>The PEG ratio (P/E ÷ growth rate) is the key metric. PEG below 1.0-1.5 suggests undervaluation.</li>
  <li>Look for 10-20% earnings growth, sustainable competitive advantage, and reasonable valuations.</li>
</ul>
`,

  "technical-indicators-deep-dive": `
<h2>Beyond Price and Volume</h2>
<p>While price and volume tell the primary story, <strong>technical indicators</strong> add quantitative precision. They turn subjective observations ("the stock looks overbought") into measurable signals. Used correctly, they help time entries and exits with more discipline than gut feel alone.</p>

<h2>RSI (Relative Strength Index): Overbought/Oversold</h2>
<p>RSI measures the speed and magnitude of recent price changes on a 0-100 scale. The standard period is 14 days. Traditional interpretations:</p>
<ul>
  <li><strong>Above 70</strong> - Overbought. The stock has risen too far, too fast. A pullback is likely (but not guaranteed - in strong trends, stocks can stay overbought for weeks).</li>
  <li><strong>Below 30</strong> - Oversold. The stock has fallen excessively. A bounce is likely.</li>
  <li><strong>Divergence</strong> - If price makes a new high but RSI makes a lower high, momentum is weakening. This is one of the most powerful RSI signals.</li>
</ul>
<p>RSI works best in range-bound markets. In strong trending markets, overbought/oversold signals can come too early.</p>

<h2>MACD: Trend Following and Momentum</h2>
<p>The <strong>Moving Average Convergence Divergence (MACD)</strong> combines two moving averages to generate signals:</p>
<ul>
  <li><strong>MACD Line</strong> - The difference between the 12-period and 26-period exponential moving averages.</li>
  <li><strong>Signal Line</strong> - A 9-period EMA of the MACD line.</li>
  <li><strong>Histogram</strong> - The difference between the MACD line and signal line. Shows momentum strength.</li>
</ul>
<p>Key signals:</p>
<ul>
  <li><strong>MACD crosses above signal line</strong> - Bullish. Momentum is shifting upward.</li>
  <li><strong>MACD crosses below signal line</strong> - Bearish. Momentum is shifting downward.</li>
  <li><strong>MACD crosses above/below zero</strong> - The 12-period moving average crosses the 26-period. A crossover above zero confirms an uptrend; below zero confirms a downtrend.</li>
  <li><strong>Divergence</strong> - Price makes a new high, MACD doesn't. Momentum weakening. Often precedes reversals.</li>
</ul>

<h2>Bollinger Bands: Volatility Envelope</h2>
<p>Bollinger Bands consist of a 20-period moving average with upper and lower bands set at 2 standard deviations above and below. They measure volatility:</p>
<ul>
  <li><strong>Bands contract (squeeze)</strong> - Volatility is low. Low volatility is typically followed by high volatility. A squeeze signals a potentially large move coming - direction unknown.</li>
  <li><strong>Bands expand</strong> - Volatility is high. After expansion, volatility typically contracts.</li>
  <li><strong>Price touches lower band</strong> - Potentially oversold. Price tends to revert to the middle band (20-period MA).</li>
  <li><strong>Price walks the band</strong> - In a strong trend, price can "walk" the upper or lower band for extended periods. Don't blindly fade these moves.</li>
</ul>

<h2>How to Combine Indicators</h2>
<p>The biggest mistake is stacking too many indicators. More isn't better - it's confusing. A clean setup:</p>
<ul>
  <li><strong>Price + volume</strong> - Always. This is the primary data.</li>
  <li><strong>2 moving averages</strong> - 50-DMA and 200-DMA for trend direction.</li>
  <li><strong>1 momentum oscillator</strong> - RSI or MACD (not both - they're correlated). Use for entry/exit timing.</li>
  <li>That's it. Three tools, maximum. If you need more, you probably don't understand the ones you have.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>RSI identifies overbought/oversold conditions and momentum divergences.</li>
  <li>MACD tracks trend direction and momentum with moving average crossovers.</li>
  <li>Use at most 2-3 indicators. Price, volume, and one momentum oscillator is sufficient.</li>
</ul>
`,

  "momentum-investing-strategies": `
<h2>Winners Keep Winning</h2>
<p><strong>Momentum investing</strong> is based on the empirical observation that stocks that have outperformed recently tend to continue outperforming in the near term, and stocks that have underperformed tend to continue underperforming. It's one of the most robust market anomalies - documented across decades, countries, and asset classes.</p>

<h2>The Academic Evidence</h2>
<p>The landmark 1993 study by Jegadeesh and Titman found that buying stocks with the best 6-month returns and holding them for 6 months generated significant excess returns. Follow-up studies confirmed the effect across global markets. Momentum isn't a fluke - it's a persistent market inefficiency driven by investor psychology (underreaction to news, then overreaction as trends attract more buyers).</p>

<h2>Types of Momentum</h2>
<ul>
  <li><strong>Price momentum</strong> - Stocks with the strongest relative performance over the past 6-12 months. This is the classic academic definition.</li>
  <li><strong>Earnings momentum</strong> - Stocks where analysts are raising earnings estimates. Positive estimate revisions tend to be followed by more positive revisions (the "earnings revision cascade").</li>
  <li><strong>Relative strength</strong> - How a stock performs compared to the broader market. A stock rising 5% while the market falls 3% is showing exceptional relative strength.</li>
</ul>

<h2>Implementing a Momentum Strategy</h2>
<ol>
  <li><strong>Define your universe</strong> - Start with a broad set (S&P 500, or top 1000 by market cap). Momentum works best with liquid, widely followed stocks.</li>
  <li><strong>Rank by momentum</strong> - Use 6-month or 12-month total return (excluding the most recent month to avoid short-term reversal effects).</li>
  <li><strong>Buy the top quintile</strong> - The top 20% of your ranked universe. Hold 15-25 positions for diversification.</li>
  <li><strong>Rebalance regularly</strong> - Monthly or quarterly. Momentum signals decay - you need to refresh the ranking.</li>
  <li><strong>Cut losers quickly</strong> - If a stock drops out of the top quintile, sell it. Momentum investors have no loyalty - the exit criteria is math, not emotion.</li>
</ol>

<h2>The Risks of Momentum</h2>
<ul>
  <li><strong>Momentum crashes</strong> - Periodically, momentum strategies suffer sharp drawdowns (often 20-40%). These typically happen at market turning points, when beaten-down value stocks surge and momentum stocks reverse. The strategy recovers, but the drawdowns are painful.</li>
  <li><strong>High turnover</strong> - Momentum portfolios trade frequently, which generates short-term capital gains taxes. Best implemented in tax-advantaged accounts.</li>
  <li><strong>Whipsaws</strong> - In choppy, directionless markets, momentum signals flip frequently, generating losing trades. Momentum works best in trending markets.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>Momentum is one of the most robust market anomalies - stocks that have done well tend to keep doing well.</li>
  <li>Rank by 6-12 month return, buy the top performers, rebalance quarterly, and cut losers ruthlessly.</li>
  <li>Momentum experiences periodic crashes (20-40% drawdowns). Manage position sizes accordingly.</li>
</ul>
`,

  "evaluating-management-quality": `
<h2>The People Behind the Ticker</h2>
<p>Warren Buffett famously said he looks for three things in an investment: "a wonderful business, run by able and honest managers, available at a sensible price." Most investors focus on the first and third and neglect the second. But management quality is often the difference between a great business that compounds for decades and a great business that destroys itself.</p>

<h2>Track Record: The Most Honest Resume</h2>
<p>Look at what the CEO has actually done, not what they say they'll do:</p>
<ul>
  <li><strong>Capital allocation history</strong> - Have acquisitions created or destroyed value? Have buybacks been well-timed (buying when the stock was cheap) or poorly timed (buying at all-time highs)?</li>
  <li><strong>Return on invested capital (ROIC)</strong> - Has the company consistently earned returns above its cost of capital? If not, management is destroying value with every dollar reinvested.</li>
  <li><strong>Prior roles</strong> - A CEO who previously ran another company into the ground is unlikely to have suddenly become competent. Past behavior is the best predictor of future behavior.</li>
  <li><strong>During crises</strong> - How did management handle the 2008 financial crisis, the 2020 pandemic, or the 2022 bear market? Did they panic and cut R&D, or did they invest through the downturn to emerge stronger?</li>
</ul>

<h2>Insider Ownership: Skin in the Game</h2>
<p>The single best signal of management alignment with shareholders is <strong>significant insider ownership</strong>. When the CEO owns 5%, 10%, or 20% of the company's stock, their incentives are perfectly aligned with yours. When the stock goes up, they get rich. When it goes down, they feel the pain directly.</p>
<p>Conversely, CEOs who own essentially no stock while collecting massive cash compensation are playing with other people's money. Their incentives are to keep the stock price stable enough to collect bonuses, not to maximize long-term value.</p>
<p>Check insider ownership in the proxy statement (DEF 14A filing on the SEC website). Look for meaningful ownership - not just options that vest over time, but actual purchased shares.</p>

<h2>Communication: Honesty and Clarity</h2>
<ul>
  <li><strong>Do they acknowledge mistakes?</strong> - The best CEOs openly discuss what went wrong and what they learned. CEOs who never admit errors are either delusional or dishonest.</li>
  <li><strong>Do they use plain language?</strong> - Obfuscation and jargon usually hide bad news. If you can't understand what the CEO is saying in the annual letter, it's probably intentional.</li>
  <li><strong>Are they consistent?</strong> - Do their actions match their words? If they talk about "long-term value creation" while selling personal shares every quarter, the words are meaningless.</li>
</ul>

<h2>Red Flags in Management</h2>
<ul>
  <li><strong>Excessive compensation</strong> - CEO pay disconnected from performance. Look at the compensation discussion in the proxy statement.</li>
  <li><strong>High executive turnover</strong> - If CFOs, COOs, and other senior leaders keep leaving, something is wrong internally.</li>
  <li><strong>Related-party transactions</strong> - The company does business with entities controlled by executives or their families. Self-dealing is rarely good for shareholders.</li>
  <li><strong>Accounting aggressiveness</strong> - Consistently "beating" estimates by exactly one penny, frequent "one-time" charges, or revenue recognition that seems generous.</li>
</ul>

<h2>Key Takeaways</h2>
<ul>
  <li>Management quality can make or break an investment. It deserves as much attention as the business itself.</li>
  <li>High insider ownership is the strongest signal of alignment. Look for it in the proxy statement.</li>
  <li>Honest communication, good capital allocation, and crisis handling reveal management's true character.</li>
</ul>
`,

  "corporate-governance": `
<h2>Who's Really in Charge?</h2>
<p><strong>Corporate governance</strong> refers to the system of rules, practices, and processes by which a company is directed and controlled. Good governance protects shareholders. Bad governance enriches insiders at shareholders' expense. Understanding governance helps you avoid companies where you're treated as a piggy bank rather than a partner.</p>

<h2>The Board of Directors: Your Representatives</h2>
<p>The board is elected by shareholders to oversee management and represent their interests. A good board:</p>
<ul>
  <li><strong>Has a majority of independent directors</strong> - Directors who are not company employees, not related to executives, and have no material business relationships with the company. Independent directors can push back against a bad CEO without fear of losing their jobs.</li>
  <li><strong>Separates CEO and Chairman roles</strong> - When the CEO is also the Chairman of the board, there's nobody to hold the CEO accountable. An independent chair provides crucial oversight.</li>
  <li><strong>Includes relevant expertise</strong> - A tech company's board should include people who understand technology. A bank's board should include people who understand risk management.</li>
  <li><strong>Has diversity of thought</strong> - Boards filled with the CEO's friends and former colleagues are rubber stamps, not watchdogs.</li>
</ul>

<h2>Shareholder Rights: What You Actually Control</h2>
<p>As a common shareholder, you have specific rights:</p>
<ul>
  <li><strong>Voting rights</strong> - Elect directors, approve auditors, vote on major corporate actions (mergers, charter amendments). Most votes are one share, one vote.</li>
  <li><strong>Proxy voting</strong> - You vote by "proxy" (online or by mail) rather than attending the annual meeting in person. Your broker sends you a proxy statement before each annual meeting. <strong>Vote your shares</strong> - most individual investors don't, which concentrates power with large institutions.</li>
  <li><strong>Shareholder proposals</strong> - Shareholders can submit proposals for a vote, though these are usually advisory (non-binding).</li>
</ul>

<h2>Dual-Class Shares: The Governance Red Flag</h2>
<p>Some companies (especially tech companies and media companies) have <strong>dual-class share structures</strong> where certain shares get 10 votes each while common shares get 1 vote. This allows founders to retain control even after selling most of their economic stake.</p>
<p>Examples: Facebook (Mark Zuckerberg controls ~58% of voting power with ~13% economic ownership), Alphabet (Google), Snap (public shareholders have zero voting rights).</p>
<p>Dual-class shares aren't automatically bad - founders like Zuckerberg and the Google founders built extraordinary companies. But they concentrate power in a way that leaves ordinary shareholders with no recourse if things go wrong. Evaluate dual-class companies with extra scrutiny.</p>

<h2>Key Takeaways</h2>
<ul>
  <li>Good governance means a company is run for shareholders, not for insiders.</li>
  <li>Look for independent boards, separated CEO/Chair roles, and one-share-one-vote structures.</li>
  <li>Dual-class shares concentrate power - approach these companies with extra caution.</li>
</ul>
`,
};

export default posts_31_40;
