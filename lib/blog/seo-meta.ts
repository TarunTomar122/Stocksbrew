export type SeoPostMeta = {
  primaryKeyword: string;
  secondaryKeywords: string[];
  author: string;
  faqs: { question: string; answer: string }[];
};

export const seoPostMeta: Record<string, SeoPostMeta> = {
  "free-stock-market-analysis-tools": {
    primaryKeyword: "free stock market analysis tools",
    secondaryKeywords: [
      "best free stock analysis websites",
      "free stock market analysis software",
      "stock market tools free",
      "free stock research tools",
      "best free investing tools 2026",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is the best free stock market analysis tool?", answer: "The best free tool depends on your needs. stocksbrew offers the best free daily market intelligence with AI-powered briefs. Finviz has the best free stock screener. TradingView offers the best free charting." },
      { question: "Are free stock analysis tools any good?", answer: "Yes. Free tools like stocksbrew, Finviz, and Yahoo Finance provide useful market data at zero cost. The tradeoff is usually delayed data or limited features, but for most individual investors, free tools cover 80% of what you need." },
      { question: "What is the best free AI stock analysis tool?", answer: "stocksbrew offers stock analysis with personalized daily briefs, a three-stock Watchlist, and signal scoring. The free tier doesn't require a credit card." },
      { question: "Can you do stock analysis for free?", answer: "Yes. You can combine stocksbrew for daily intelligence, Finviz for screening, TradingView for charting, and Yahoo Finance for portfolio tracking. This stack covers daily monitoring, research, and analysis at zero cost." },
    ],
  },
  "stock-research-busy-professionals": {
    primaryKeyword: "stock research for busy professionals",
    secondaryKeywords: [
      "daily stock research routine",
      "stock market analysis for working professionals",
      "how to research stocks with a full time job",
      "quick stock analysis routine",
      "investing while working full time",
    ],
    author: "Tarat",
    faqs: [
      { question: "How can busy professionals research stocks?", answer: "The key is automation. Use AI tools like stocksbrew for daily briefs, set brokerage alerts for 5%+ moves, and do a 15-minute weekly deep-dive on Sundays. Total time: 10 minutes per day." },
      { question: "What is the best stock research routine for working people?", answer: "A 10-minute daily routine: 5 minutes for an AI market brief in the morning, 2 minutes for a midday check, and 3 minutes for an evening review. Supplement with a 15-minute Sunday deep-dive weekly." },
      { question: "Do I need to check stocks every day?", answer: "You don't need to check prices every day, but you should review market intelligence daily. A daily brief takes 5 minutes and keeps you informed without the anxiety of watching price ticks." },
    ],
  },
  "ai-stock-analysis-comparison": {
    primaryKeyword: "AI stock analysis comparison",
    secondaryKeywords: [
      "best AI stock analysis tools 2026",
      "AI stock analysis tools compared",
      "Prospero vs Danelfin vs stocksbrew",
      "AI stock picker comparison",
      "stock analysis AI tools review",
    ],
    author: "Tarat",
    faqs: [
      { question: "Which AI stock analysis tool is best?", answer: "The best tool depends on your needs. stocksbrew is best for daily market intelligence with personalized briefs. Prospero is best for AI stock picks with a track record. TrendSpider is best for automated technical analysis." },
      { question: "Is AI stock analysis worth it?", answer: "Yes, when used correctly. AI is excellent at information processing, pattern recognition, and sentiment analysis. It's not good at predicting stock prices. Use AI for intelligence and monitoring, not for trading decisions." },
      { question: "How much do AI stock analysis tools cost?", answer: "Prices range from free (stocksbrew, Seeking Alpha basic) to $108/month (TrendSpider). Most quality tools fall in the $9-50/month range. Many offer free tiers that cover basic needs." },
    ],
  },
  "how-to-analyze-a-stock-before-buying": {
    primaryKeyword: "how to analyze a stock before buying",
    secondaryKeywords: [
      "stock analysis checklist",
      "how to evaluate a stock",
      "stock research before buying",
      "beginner stock analysis",
      "fundamental analysis checklist",
    ],
    author: "Tarat",
    faqs: [
      { question: "What should I check before buying a stock?", answer: "Check four dimensions: business quality (revenue growth, margins, free cash flow, debt), valuation (P/E, PEG, P/S ratios), technicals (trend, support/resistance, RSI), and sentiment (analyst consensus, news sentiment, social sentiment). If 3 out of 4 look good, it's worth a position." },
      { question: "How long should I research a stock before buying?", answer: "15 minutes covers the basics with the right tools. Check fundamentals (5 min), valuation (3 min), technicals (3 min), and sentiment (3 min). For larger positions, spend an additional 30 minutes reading the most recent earnings call transcript." },
      { question: "What are the most important metrics for stock analysis?", answer: "Revenue growth rate, operating margin, free cash flow, P/E ratio, and debt-to-equity. These five metrics cover the majority of what professional analysts examine. Beyond these, check the stock's trend (50-day and 200-day moving averages) and sentiment." },
    ],
  },
  "best-stock-portfolio-tracker-free-2026": {
    primaryKeyword: "best stock portfolio tracker free",
    secondaryKeywords: [
      "free portfolio tracker 2026",
      "best free investment tracker",
      "stock portfolio tracking app free",
      "free portfolio management tools",
      "track my stocks for free",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is the best free portfolio tracker?", answer: "For intelligent monitoring, stocksbrew offers AI-powered daily briefs for your watchlist. For traditional tracking, Yahoo Finance is the most comprehensive free option. For simplicity, Google Finance is clean and ad-free." },
      { question: "Is there a free app to track stock portfolio?", answer: "Yes. stocksbrew (AI intelligence), Yahoo Finance (comprehensive tracking), Google Finance (simple), and Sharesight (tax-focused) all offer free tiers. Most brokerages also include free portfolio tracking in their apps." },
      { question: "What features should a portfolio tracker have?", answer: "Look for: performance metrics (total return, dividend-adjusted), allocation views (sector, asset class), news and alerts per holding, and earnings calendar. AI-powered tools like stocksbrew add sentiment analysis and buy/hold/sell signals." },
    ],
  },
  "how-to-read-stock-charts-beginners": {
    primaryKeyword: "how to read stock charts for beginners",
    secondaryKeywords: [
      "stock chart reading guide",
      "candlestick chart tutorial",
      "understanding stock charts",
      "beginner chart analysis",
      "stock chart basics",
    ],
    author: "Tarat",
    faqs: [
      { question: "How do beginners read stock charts?", answer: "Start with candlestick charts. Green candles mean the price closed higher than it opened; red means it closed lower. Look for the trend (up, down, sideways), support and resistance levels, and volume. The 50-day and 200-day moving averages show the medium and long-term trend." },
      { question: "What are the most important indicators for beginners?", answer: "Three indicators cover most situations: moving averages (50-day and 200-day for trend), RSI (Relative Strength Index for overbought/oversold conditions), and volume (to confirm price moves). You don't need more than these to make informed decisions." },
      { question: "What does high volume on a stock chart mean?", answer: "High volume means many shares are being traded. A price move on high volume is more reliable than one on low volume. A breakout above resistance on 2x average volume is a strong signal. A breakout on low volume is weak and may reverse." },
    ],
  },
  "stock-market-for-beginners-2026": {
    primaryKeyword: "stock market for beginners 2026",
    secondaryKeywords: [
      "how to start investing in stocks",
      "stock market basics for beginners",
      "investing for beginners guide",
      "how does the stock market work",
      "beginner investing guide 2026",
    ],
    author: "Tarat",
    faqs: [
      { question: "How do I start investing in the stock market?", answer: "Open a brokerage account (Fidelity, Schwab, or Robinhood), fund it with money you won't need for 3+ years, and start with an S&P 500 index fund like VOO or SPY. As you learn more, you can add individual stocks." },
      { question: "How much money do I need to start investing?", answer: "Most brokerages have no minimum deposit. You can start with $1. The important thing is to start early and invest consistently, even if it's small amounts. Dollar-cost averaging $100/month into an index fund builds real wealth over time." },
      { question: "Is the stock market safe for beginners?", answer: "Index funds that hold hundreds of stocks are relatively safe over 10+ year periods. Individual stocks are riskier. The biggest risk for beginners is emotional decisions — panic selling during dips or chasing hot stocks. Start with index funds and add individual stocks as you learn." },
    ],
  },
  "how-to-build-a-stock-portfolio-from-scratch": {
    primaryKeyword: "how to build a stock portfolio from scratch",
    secondaryKeywords: [
      "building a stock portfolio beginner",
      "how to create an investment portfolio",
      "stock portfolio allocation guide",
      "diversified stock portfolio how to",
      "starting a stock portfolio from zero",
    ],
    author: "Tarat",
    faqs: [
      { question: "How many stocks should a beginner own?", answer: "Start with an S&P 500 index fund (which holds 500 stocks). When adding individual stocks, aim for 10-20 across at least 5 sectors. No single stock should exceed 5-10% of your total portfolio." },
      { question: "What is a good portfolio allocation for beginners?", answer: "A simple starting allocation: 80% stocks (split between a US index fund, international fund, and individual stocks) and 20% bonds. Adjust based on your age and risk tolerance. Younger investors can hold more stocks; older investors need more bonds." },
      { question: "How do I diversify my stock portfolio?", answer: "Diversify across three dimensions: asset class (stocks, bonds, cash), geography (US, international, emerging markets), and sector (technology, healthcare, financials, consumer, industrial). Index funds handle the first two automatically. For individual stocks, spread across at least 5 different sectors." },
    ],
  },
  "when-to-sell-a-stock": {
    primaryKeyword: "when to sell a stock",
    secondaryKeywords: [
      "when to sell stocks for profit",
      "selling stocks strategy",
      "when to exit a stock position",
      "stock sell signals",
      "when should I sell my stocks",
    ],
    author: "Tarat",
    faqs: [
      { question: "When should you sell a stock?", answer: "Sell when: your original investment thesis is broken, the valuation has become extreme, insiders are selling aggressively, fundamentals are deteriorating (3+ quarters of declining revenue/margins), or the position has grown too large (over 10% of portfolio)." },
      { question: "Should I sell a stock that is down?", answer: "Not automatically. If your thesis is intact and the decline is due to market-wide selling, holding or even adding is rational. If the decline is due to deteriorating fundamentals or a broken thesis, sell. Price alone is never a reason to sell." },
      { question: "Should I sell a stock that is up 100%?", answer: "Consider trimming (selling half) to lock in gains and reduce position size. Letting winners run is important, but if a single stock is now 15%+ of your portfolio, concentration risk is real. Sell enough to bring it back to 5-10% and redeploy elsewhere." },
    ],
  },
  "buy-hold-sell-signals-explained": {
    primaryKeyword: "buy hold sell signals",
    secondaryKeywords: [
      "stock buy sell signals",
      "hold sell buy recommendations stocks",
      "AI stock signals explained",
      "when to buy hold or sell a stock",
      "stock trading signals for beginners",
    ],
    author: "Tarat",
    faqs: [
      { question: "What are buy hold sell signals?", answer: "Buy, hold, and sell signals are structured recommendations that tell you what action to consider on a stock. Unlike raw price alerts, they combine fundamentals, news, sentiment, and technical context so you know why a stance changed." },
      { question: "Are buy sell signals accurate?", answer: "No signal is guaranteed. Good signals are explainable — they show the evidence behind the call and update when conditions change. Use them as decision support, not as automatic trade instructions." },
      { question: "What is the difference between price alerts and buy hold sell signals?", answer: "Price alerts fire when a number crosses a threshold. Buy/hold/sell signals fire when the investment case changes — earnings miss, sentiment shift, valuation stretch, or technical breakdown — often before a large price move." },
    ],
  },
  "watchlist-vs-portfolio-tracker": {
    primaryKeyword: "watchlist vs portfolio tracker",
    secondaryKeywords: [
      "stock watchlist vs portfolio",
      "difference between watchlist and portfolio",
      "portfolio tracker vs watchlist app",
      "how to track stocks you don't own yet",
      "investment watchlist management",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is the difference between a watchlist and a portfolio?", answer: "A watchlist tracks stocks you are researching or waiting to buy. A portfolio tracks positions you already own with cost basis, allocation, and performance. Mixing them creates decision noise." },
      { question: "How many stocks should be on a watchlist?", answer: "Most investors do best with 10–30 names on an active watchlist — enough opportunity without losing focus. Your owned portfolio is usually smaller: 10–20 positions." },
      { question: "Do I need a separate watchlist app?", answer: "If your broker watchlist has no thesis notes, news filtering, or stance updates, a dedicated tool like stocksbrew Watchlist helps you monitor candidates without treating them like owned positions." },
    ],
  },
  "earnings-season-watchlist-playbook": {
    primaryKeyword: "earnings season watchlist",
    secondaryKeywords: [
      "how to prepare watchlist for earnings",
      "earnings season investing strategy",
      "track earnings dates for my stocks",
      "earnings calendar portfolio",
      "what to do before earnings report",
    ],
    author: "Tarat",
    faqs: [
      { question: "How do I prepare my watchlist for earnings season?", answer: "Two weeks before your holdings report: note consensus estimates, your thesis, and what would surprise you. Set alerts for report dates. After each print, update whether you still want to own or watch the name." },
      { question: "Should I buy a stock right before earnings?", answer: "Usually no unless you have a specific catalyst thesis and accept binary risk. Most retail investors do better waiting for the reaction and guidance call before sizing a position." },
      { question: "How do I track earnings for only my stocks?", answer: "Use a watchlist-aware calendar — stocksbrew Watchlist flags reporting dates on names you track, instead of scrolling a market-wide earnings calendar." },
    ],
  },
  "stock-market-information-overload": {
    primaryKeyword: "stock market information overload",
    secondaryKeywords: [
      "too much stock market news",
      "how to filter stock news",
      "investing without information overload",
      "stock research productivity",
      "reduce investing anxiety",
    ],
    author: "Tarat",
    faqs: [
      { question: "How do I stop feeling overwhelmed by stock market news?", answer: "Limit inputs to one daily brief, one screener session per week, and alerts only on your watchlist. Delete general market Twitter lists and turn off broker push notifications except for price triggers you set." },
      { question: "How much stock news should I read per day?", answer: "Five to ten minutes is enough for most holders. Read news filtered to your tickers, not the entire market. Deep dives belong on weekends, not every morning." },
      { question: "What tools reduce investing information overload?", answer: "AI briefs (stocksbrew), filtered news per watchlist, and stance-based alerts replace scrolling Finviz heatmaps, Reddit, and three newsletters with one workflow." },
    ],
  },
  "portfolio-health-check-guide": {
    primaryKeyword: "portfolio health check",
    secondaryKeywords: [
      "how to check portfolio health",
      "portfolio risk assessment retail investor",
      "portfolio diversification check",
      "investment portfolio review checklist",
      "portfolio diagnosis tool",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is a portfolio health check?", answer: "A structured review of concentration, sector tilt, valuation risk, and position quality — not just total return. It answers whether your portfolio could survive a sector drawdown or earnings miss." },
      { question: "How often should I review my portfolio health?", answer: "A light check monthly and a deeper review quarterly. After large market moves or when a single position grows past 10% of the portfolio, run an extra check." },
      { question: "What metrics matter for portfolio health?", answer: "Top five: largest position weight, sector concentration, number of correlated tech/growth names, average valuation of holdings, and how many positions have deteriorating fundamentals." },
    ],
  },
  "stock-market-heatmap-tools": {
    primaryKeyword: "stock market heatmap tools",
    secondaryKeywords: [
      "free stock heatmap",
      "market heatmap tool",
      "finviz heatmap alternative",
      "sector heatmap stocks",
      "stock market visualization tools",
    ],
    author: "Tarat",
    faqs: [
      { question: "What is the best free stock market heatmap?", answer: "Finviz is fastest for broad market overview. TradingView offers the best multi-timeframe customization. stocksbrew adds watchlist personalization and AI briefs alongside its heatmap view." },
      { question: "How do you read a stock heatmap?", answer: "Green blocks mean prices are up, red means down. Block size usually reflects market cap or weight. Sector groupings show rotation — when tech is all green and energy is red, money is flowing between sectors." },
      { question: "Can a heatmap replace a watchlist?", answer: "No. Heatmaps show the whole market at a glance. Watchlists track your specific names with thesis and stance. Use heatmaps for context, watchlists for decisions." },
    ],
  },
  "how-to-use-stock-alerts-effectively": {
    primaryKeyword: "how to use stock alerts",
    secondaryKeywords: [
      "stock alert fatigue",
      "best stock alert setup",
      "portfolio alerts without spam",
      "stock price alert strategy",
      "smart stock notifications",
    ],
    author: "Tarat",
    faqs: [
      { question: "How many stock alerts should I set?", answer: "Set alerts only at levels that would change your decision — entry, stop, and target. For a 15-stock watchlist, that is typically 2–3 alerts per name, not every 1% move." },
      { question: "What is alert fatigue in investing?", answer: "Alert fatigue happens when you receive so many notifications that you ignore all of them — including important ones. Fix it by batching into a daily brief and disabling real-time noise." },
      { question: "Are AI stock alerts better than price alerts?", answer: "AI alerts add context — news sentiment, earnings proximity, sector moves — so fewer notifications carry more meaning. Price alerts are still useful for exact entry and exit levels." },
    ],
  },
};

export function getSeoMeta(slug: string): SeoPostMeta | null {
  const meta = seoPostMeta[slug];
  return meta ? { ...meta, author: "Tarun Tomar" } : null;
}
