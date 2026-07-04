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
      { question: "Are free stock analysis tools any good?", answer: "Yes. Free tools like stocksbrew, Finviz, and Yahoo Finance provide institution-grade data at zero cost. The tradeoff is usually delayed data or limited features, but for most individual investors, free tools cover 80% of what you need." },
      { question: "What is the best free AI stock analysis tool?", answer: "stocksbrew offers the best free AI-powered stock analysis with personalized daily briefs, watchlist radar, and signal scoring. The free tier is generous and doesn't require a credit card." },
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
};

export function getSeoMeta(slug: string): SeoPostMeta | null {
  return seoPostMeta[slug] ?? null;
}
