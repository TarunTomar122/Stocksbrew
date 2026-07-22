export type BlogPost = {
  slug: string;
  title: string;
  seoTitle?: string;
  description: string;
  category: string;
  tags: string[];
  date: string;
  updated?: string;
  readTime: string;
  faqs?: { question: string; answer: string }[];
};

export const allBlogPosts: BlogPost[] = [
  {
    slug: "best-stock-analysis-apps-2026",
    title: "Best Stock Analysis Apps in 2026: An Honest Workflow Comparison",
    seoTitle: "Best Stock Analysis Apps in 2026",
    description: "Compare the best stock analysis apps for US investors by data freshness, research depth, charts, screening, monitoring, price, and real workflow fit.",
    category: "comparison",
    tags: ["stock-analysis-app", "US-stocks", "comparison", "2026", "research-tools"],
    date: "2026-07-22",
    readTime: "18 min read",
    faqs: [
      {
        question: "What is the best stock analysis app in 2026?",
        answer: "There is no universal winner. Stocksbrew fits investors who want a current interpreted read and ongoing monitoring; Stock Analysis fits clean financial data; Finviz fits screening; TradingView fits charts; TIKR fits long financial history; Koyfin fits dashboards; and Seeking Alpha fits a large library of analyst opinion.",
      },
      {
        question: "What is the difference between a stock analysis app and a trading app?",
        answer: "A stock analysis app helps you investigate a company, compare evidence, and monitor a thesis. A trading app is primarily built to place and manage orders. Some products do both, but execution convenience is not the same as research quality.",
      },
      {
        question: "How should I test a stock analysis app before paying?",
        answer: "Run the same familiar ticker through every candidate. Check the quote timestamp, latest filing and earnings context, valuation definition, peer comparison, risks, missing-data handling, watchlist workflow, and total time required to reach a defensible conclusion.",
      },
    ],
  },
  {
    slug: "us-stock-market-analysis-daily-workflow-2026",
    title: "US Stock Market Analysis: A Practical Daily Workflow for 2026",
    seoTitle: "US Stock Market Analysis: Daily 2026 Workflow",
    description: "A repeatable US stock market analysis workflow covering pre-market context, sectors, movers, earnings, filings, valuation, risks, and post-close review.",
    category: "guides",
    tags: ["US-stock-market-analysis", "daily-workflow", "market-research", "2026", "US-stocks"],
    date: "2026-07-22",
    readTime: "17 min read",
    faqs: [
      {
        question: "What should a daily US stock market analysis include?",
        answer: "Start with index and sector direction, then examine breadth, meaningful movers, scheduled events, earnings, and the specific stocks you own or follow. Separate the market-wide read from company-specific evidence and record the as-of time for every fast-moving input.",
      },
      {
        question: "What is the best time to analyze the US stock market?",
        answer: "Use three short checkpoints rather than watching continuously: before the open for overnight and pre-market context, after the first hour for confirmed participation, and after the close for final prices, filings, earnings, and thesis changes.",
      },
      {
        question: "Which sources should US stock investors verify?",
        answer: "Use SEC EDGAR and company investor-relations pages for filings and official releases. Treat aggregators, analyst targets, social posts, and AI summaries as interpretation layers that should preserve timestamps and link back to primary evidence.",
      },
    ],
  },
  {
    slug: "stock-analysis-app-checklist",
    title: "How to Choose a Stock Analysis App: A 12-Point Test",
    seoTitle: "How to Choose a Stock Analysis App",
    description: "Use this 12-point test to evaluate any stock analysis app for freshness, evidence, valuation, risks, monitoring, pricing, safety, and daily usability.",
    category: "guides",
    tags: ["stock-analysis-app", "buyer-checklist", "stock-research", "app-comparison", "investing-tools"],
    date: "2026-07-22",
    readTime: "15 min read",
    faqs: [
      {
        question: "What features should a stock analysis app have?",
        answer: "At minimum, look for timestamped prices, financial statements, valuation definitions, peer comparison, earnings and filing context, explicit risks, missing-data handling, and a watchlist or alert workflow that brings you back when something important changes.",
      },
      {
        question: "Are buy, hold, and sell ratings enough to choose an app?",
        answer: "No. A label is useful only when the app shows the evidence, time horizon, price context, assumptions, risks, and conditions that could invalidate it. Test whether you can audit the conclusion instead of merely reading it.",
      },
      {
        question: "How much should a stock analysis app cost?",
        answer: "Pay for the bottleneck it actually removes. Free tools can cover filings, basic financials, charts, and screening. A paid app earns its fee when it reliably saves research time, adds a useful interpretation or monitoring layer, and is used often enough to justify the subscription.",
      },
    ],
  },
  {
    slug: "how-to-connect-ai-agent-stock-market-data-mcp",
    title: "How to Connect an AI Agent to Stock Market Data with MCP",
    seoTitle: "Connect an AI Agent to Stock Market Data with MCP",
    description: "A practical guide to giving Claude Code, Cursor, Codex, or your own agent current, read-only stock intelligence through an MCP server or API.",
    category: "guides",
    tags: ["MCP", "AI-agents", "stock-data", "API", "stock-research"],
    date: "2026-07-20",
    readTime: "11 min read",
  },
  {
    slug: "stock-research-prompts-for-ai-agents",
    title: "7 Stock Research Prompts for Claude, Cursor, Codex, and AI Agents",
    seoTitle: "7 Stock Research Prompts for AI Agents",
    description: "Reusable prompts for single-stock reviews, comparisons, market context, earnings preparation, and private watchlist monitoring with current tool data.",
    category: "guides",
    tags: ["AI-agents", "prompts", "Claude", "Cursor", "Codex", "stock-research"],
    date: "2026-07-20",
    readTime: "10 min read",
  },
  {
    slug: "how-to-analyze-earnings-report",
    title: "How to Analyze an Earnings Report: What Changed vs. Last Quarter",
    seoTitle: "Analyze an Earnings Report",
    description:
      "A practical earnings-analysis checklist for revenue, margins, cash, guidance, risks, and management language—using primary filings instead of hot takes.",
    category: "guides",
    tags: ["earnings", "earnings-report", "guidance", "filings", "stock-research"],
    date: "2026-07-20",
    readTime: "13 min read",
  },
  {
    slug: "stock-research-checklist-evidence-first",
    title: "How to Research a Stock: An Evidence-First Checklist",
    seoTitle: "How to Research a Stock",
    description:
      "A repeatable stock research workflow built around filings, earnings, valuation, risks, and a written decision log—not hot takes or price predictions.",
    category: "guides",
    tags: ["stock-research", "checklist", "filings", "risk", "guide"],
    date: "2026-07-16",
    readTime: "14 min read",
  },
  {
    slug: "finviz-vs-tradingview-vs-stocksbrew",
    title: "Finviz vs TradingView vs stocksbrew: Which Research Workflow Fits?",
    seoTitle: "Finviz vs TradingView vs stocksbrew",
    description:
      "A source-backed comparison of screening, charting, watchlist monitoring, alerts, and cost—plus the workflow where using all three makes sense.",
    category: "comparison",
    tags: ["finviz", "tradingview", "stocksbrew", "comparison", "methodology"],
    date: "2026-07-16",
    readTime: "15 min read",
  },
  {
    slug: "ai-stock-analysis-comparison",
    title: "Best AI Stock Analysis Apps in 2026: What Is Actually Grounded?",
    seoTitle: "Best AI Stock Analysis Apps in 2026",
    description:
      "Compare AI stock analysis apps by their market-data connection, timestamps, evidence, explainability, workflow, safety, limitations, and current pricing.",
    category: "comparison",
    tags: ["AI-stock-analysis-app", "AI-investing", "comparison", "2026", "grounded-AI"],
    date: "2026-07-15",
    updated: "2026-07-22",
    readTime: "18 min read",
    faqs: [
      {
        question: "What is the best AI stock analysis app in 2026?",
        answer: "The best fit depends on the job. Stocksbrew focuses on current structured US-stock context and monitoring; Barebone focuses on mobile agentic research; TrendSpider Sidekick focuses on chart-aware active-investor workflows; Danelfin focuses on quantitative scores; and Seeking Alpha combines AI tools with contributor research and quant ratings.",
      },
      {
        question: "Why can a general AI chatbot give stale stock analysis?",
        answer: "A language model cannot guarantee current market facts unless the chat has access to a current source and actually retrieves it. A grounded stock app should expose the data timestamp, preserve missing fields, and separate retrieved facts from model interpretation.",
      },
      {
        question: "Can an AI stock analysis app predict stock prices?",
        answer: "No app can reliably guarantee a future price. Treat forecasts, targets, and scores as scenarios or estimates. Prefer tools that show assumptions, evidence, uncertainty, and invalidation conditions over products promising certain returns.",
      },
    ],
  },
  {
    slug: "stock-market-heatmap-tools",
    title: "Best Free Stock Market Heatmap Tools in 2026",
    description:
      "We reviewed 8 free heatmap tools — Finviz, TradingView, stocksbrew, and more — for speed, sector views, and watchlist personalization.",
    category: "tools",
    tags: ["heatmap", "tools", "free", "comparison"],
    date: "2026-07-15",
    readTime: "10 min read",
  },
  {
    slug: "how-to-use-stock-alerts-effectively",
    title: "Stock Price Alerts: How to Set Alerts That Lead to Better Decisions",
    seoTitle: "Set Better Stock Price Alerts",
    description:
      "Set price, earnings, and thesis alerts for your watchlist without letting notifications run your investing decisions.",
    category: "guides",
    tags: ["stock-alerts", "price-alerts", "earnings", "watchlist", "guide"],
    date: "2026-07-15",
    updated: "2026-07-20",
    readTime: "9 min read",
  },
  {
    slug: "buy-hold-sell-signals-explained",
    title: "Buy, Hold, Sell Signals Explained: What They Are and How to Use Them",
    seoTitle: "Buy, Hold, Sell Signals Explained",
    description:
      "Buy/hold/sell signals are more than price alerts. Learn what they mean, how AI generates them, and a weekly workflow that avoids overtrading.",
    category: "guides",
    tags: ["signals", "buy-hold-sell", "strategy", "ai", "guide"],
    date: "2026-07-15",
    readTime: "11 min read",
  },
  {
    slug: "watchlist-vs-portfolio-tracker",
    title: "Watchlist vs Portfolio Tracker: Why You Need Both",
    seoTitle: "Watchlist vs Portfolio Tracker",
    description:
      "Mixing stocks you own with stocks you might buy creates chaos. Here's how to separate watchlists from portfolios and which tools handle each job.",
    category: "guides",
    tags: ["watchlist", "portfolio", "tracking", "workflow", "guide"],
    date: "2026-07-15",
    readTime: "10 min read",
  },
  {
    slug: "earnings-season-watchlist-playbook",
    title: "Earnings Watchlist: How to Prepare for Reports and Review What Changed",
    seoTitle: "Earnings Watchlist Checklist",
    description:
      "A step-by-step earnings-watchlist workflow for holdings and candidates—from pre-report preparation to a disciplined post-results review.",
    category: "guides",
    tags: ["earnings", "watchlist", "season", "strategy", "guide"],
    date: "2026-07-15",
    updated: "2026-07-20",
    readTime: "12 min read",
  },
  {
    slug: "stock-market-information-overload",
    title: "Stock Market Information Overload: A System That Actually Works",
    seoTitle: "Stock Market Information Overload",
    description:
      "Too much news, too little clarity. Cut the noise with a four-principle information diet and a low-tool stack for busy investors.",
    category: "guides",
    tags: ["productivity", "news", "workflow", "anxiety", "guide"],
    date: "2026-07-15",
    readTime: "10 min read",
  },
  {
    slug: "portfolio-health-check-guide",
    title: "Portfolio Health Check: A 20-Minute Quarterly Review",
    seoTitle: "Portfolio Health Check Guide",
    description:
      "Performance is not health. Use this checklist for concentration, sector tilt, fundamentals, and catalyst risk — with a simple A–D grading rubric.",
    category: "intelligence",
    tags: ["portfolio", "health", "risk", "diversification", "guide"],
    date: "2026-07-15",
    readTime: "11 min read",
  },
  {
    slug: "ai-stock-watchlist-vs-traditional",
    title: "AI Stock Watchlists vs Traditional Watchlists: What's Better?",
    description: "Traditional watchlists are just lists. AI watchlists add intelligence, scoring, and alerts. Here's how they compare.",
    category: "tools",
    tags: ["ai", "watchlist", "comparison"],
    date: "2026-05-07",
    readTime: "10 min read",
  },
  {
    slug: "best-market-intelligence-tools-2026",
    title: "Best Tools for Portfolio Briefs & Watchlist Intel in 2026",
    description:
      "10 tools compared: Finviz, TradingView, Seeking Alpha, stocksbrew, and more—with honest pros, cons, and pricing.",
    category: "comparison",
    tags: ["tools", "comparison", "pricing"],
    date: "2026-05-07",
    readTime: "15 min read",
  },
  {
    slug: "stocksbrew-vs-finviz",
    title: "stocksbrew vs Finviz: Portfolio Briefs vs Screeners",
    description:
      "Finviz excels at screening; stocksbrew focuses on personalized buy, hold, and sell calls per holding. Different jobs. Here is how to pick.",
    category: "comparison",
    tags: ["comparison", "finviz", "tools"],
    date: "2026-05-07",
    readTime: "12 min read",
  },
  {
    slug: "track-stock-news-for-your-portfolio",
    title: "How to Track Stock News for Your Portfolio (Without Drowning in Noise)",
    seoTitle: "Track Stock News Without the Noise",
    description: "Most investors either ignore portfolio news or get buried in it. Here's a system to track only the news that matters for your holdings.",
    category: "guides",
    tags: ["portfolio", "news", "tracking", "guide"],
    date: "2026-05-17",
    readTime: "12 min read",
  },
  {
    slug: "earnings-calendar-for-my-watchlist",
    title: "Earnings Calendar for Your Watchlist: How to Never Miss a Report",
    seoTitle: "Earnings Calendar for Your Watchlist",
    description: "Stop checking generic earnings calendars. Here's how to track earnings dates for only the stocks you care about.",
    category: "guides",
    tags: ["earnings", "calendar", "watchlist", "guide"],
    date: "2026-05-17",
    readTime: "10 min read",
  },
  {
    slug: "stay-updated-on-stocks-without-checking-daily",
    title: "How to Follow Stocks Without Checking Every Day",
    seoTitle: "Follow Stocks Without Checking Daily",
    description:
      "A practical watchlist-alert routine for following earnings, price zones, and thesis changes without staring at tickers.",
    category: "guides",
    tags: ["productivity", "alerts", "automation", "guide"],
    date: "2026-05-17",
    updated: "2026-07-20",
    readTime: "10 min read",
  },
  {
    slug: "best-free-stock-alert-tools-2026",
    title: "Best Free Stock Alert Tools in 2026 (Reviewed by Use Case)",
    description: "We reviewed 8 free stock alert tools so you don't have to. Here's what actually works at $0.",
    category: "tools",
    tags: ["free", "alerts", "tools", "comparison"],
    date: "2026-05-17",
    readTime: "14 min read",
  },
  {
    slug: "free-stock-market-analysis-tools",
    title: "Best Free Stock Market Analysis Tools in 2026: A $0 Research Stack",
    seoTitle: "Best Free Stock Market Analysis Tools in 2026",
    description:
      "Build a free US-stock research stack with official filings, financials, screening, charts, dashboards, watchlist monitoring, and clear upgrade limits.",
    category: "tools",
    tags: ["free-stock-analysis", "stock-market-tools", "US-stocks", "2026", "research-stack"],
    date: "2026-05-28",
    updated: "2026-07-22",
    readTime: "17 min read",
    faqs: [
      {
        question: "What is the best free stock market analysis tool?",
        answer: "No single free product is best at every job. SEC EDGAR is the primary source for US filings, Stock Analysis is strong for clean financial tables, Finviz for screening, TradingView for charts, Koyfin for dashboards, TIKR for fundamental research, and Stocksbrew for an interpreted US-stock watchlist workflow.",
      },
      {
        question: "Can I analyze stocks well without paying for an app?",
        answer: "Yes. A free stack can cover filings, financial history, screening, charts, market context, and basic monitoring. Paying becomes useful when you need higher limits, deeper history, exports, specialized data, or a reliable interpretation and alert layer that saves recurring time.",
      },
      {
        question: "What are the common limits of free stock analysis apps?",
        answer: "Typical limits include delayed exchange data, fewer alerts, shorter financial history, smaller watchlists, ads, limited exports, and restricted AI usage. Always check the live plan page because limits and pricing change.",
      },
    ],
  },
  {
    slug: "stock-research-busy-professionals",
    title: "Stock Research for Busy Professionals: A 5-Minute Daily Routine",
    seoTitle: "Stock Research for Busy Professionals",
    description:
      "A practical stock research system for people with full-time jobs. 10 minutes per day, no screen time during work hours.",
    category: "guides",
    tags: ["productivity", "routine", "guide", "busy-professionals"],
    date: "2026-05-28",
    readTime: "9 min read",
  },
  {
    slug: "daily-stock-market-analysis-routine",
    title: "A 10-Minute Daily Stock Market Analysis Routine for Busy Investors",
    description:
      "A practical daily routine for analyzing the stock market in 10 minutes. Perfect for busy professionals who want to stay on top of their portfolio.",
    category: "guides",
    tags: ["routine", "productivity", "daily", "guide"],
    date: "2026-06-01",
    readTime: "8 min read",
  },
  {
    slug: "stock-picks-vs-stock-screeners",
    title: "Stock Picks vs Stock Screeners: What Busy Investors Actually Need",
    seoTitle: "Stock Picks vs Stock Screeners",
    description:
      "Stock screeners give you lists. Stock picks give you decisions. Here's when to use each and the hybrid approach that works best.",
    category: "guides",
    tags: ["stock-picks", "screeners", "comparison", "guide"],
    date: "2026-06-01",
    readTime: "10 min read",
  },
  {
    slug: "sector-rotation-tracking-tools",
    title: "Sector Rotation Tracking: The Smart Investor's Guide to Market Trends",
    description:
      "Track where smart money is flowing with sector rotation analysis. Tools and techniques for staying ahead of market trends.",
    category: "intelligence",
    tags: ["sector-rotation", "market-trends", "tools", "guide"],
    date: "2026-06-01",
    readTime: "11 min read",
  },
  {
    slug: "earnings-predictions-ai-vs-analyst",
    title: "Earnings Predictions: AI vs Wall Street Analysts in 2026",
    description:
      "Who predicts earnings better? We compare AI-powered earnings forecasts against traditional Wall Street analyst predictions.",
    category: "comparison",
    tags: ["earnings", "ai", "analysts", "comparison", "prediction"],
    date: "2026-06-01",
    readTime: "12 min read",
  },

  {
    slug: "ai-stock-sentiment-analysis-tools",
    title: "AI Stock Sentiment Analysis: How to Read Market Mood in 2026",
    description:
      "Market sentiment drives prices. Learn how AI-powered sentiment analysis tools track investor mood across news, social media, and earnings calls to give you an edge.",
    category: "intelligence",
    tags: ["sentiment", "ai", "market-mood", "analysis"],
    date: "2026-06-02",
    readTime: "12 min read",
  },
  {
    slug: "track-insider-trading-free",
    title: "How to Track Insider Trading for Free in 2026",
    description:
      "Insider buying and selling is one of the strongest market signals. Here are the best free tools to track insider trades and interpret what they mean for your portfolio.",
    category: "guides",
    tags: ["insider-trading", "free-tools", "signals", "portfolio"],
    date: "2026-06-02",
    readTime: "9 min read",
  },
  {
    slug: "stock-market-daily-newsletter-free",
    title: "5 Best Free Stock Market Daily Newsletters in 2026",
    description:
      "Get daily stock market intelligence delivered to your inbox without spending a dime. We reviewed 15 free newsletters and ranked the top 5 for actionable insights.",
    category: "comparison",
    tags: ["newsletter", "daily-brief", "free", "curation"],
    date: "2026-06-02",
    readTime: "11 min read",
  },
  {
    slug: "market-breadth-analysis-guide",
    title: "Market Breadth Analysis: A Complete Beginner's Guide for 2026",
    description:
      "What is market breadth and why does it matter? Learn how to use advance-decline lines, new highs/lows, and breadth indicators to gauge the real health of the stock market.",
    category: "intelligence",
    tags: ["market-breadth", "indicators", "beginner-guide", "analysis"],
    date: "2026-06-02",
    readTime: "13 min read",
  },
  {
    slug: "how-to-read-stock-heat-map",
    title: "How to Read a Stock Heat Map: A Complete Guide",
    description: "Stock heat maps turn market data into color-coded visuals. Learn how to read them spot sector rotation, and find trading opportunities in seconds.",
    category: "guides",
    tags: ["heat-map", "visualization", "guide", "beginners"],
    date: "2026-05-27",
    readTime: "10 min read",
  },
  {
    slug: "stock-analysis-beginners-technical-vs-fundamental",
    title: "Technical vs Fundamental Analysis: What Every Beginner Needs to Know",
    description: "Two schools of stock analysis, one clear breakdown. Learn the difference between technical and fundamental analysis, when to use each, and which matters more.",
    category: "guides",
    tags: ["beginners", "technical-analysis", "fundamental-analysis", "guide"],
    date: "2026-05-27",
    readTime: "12 min read",
  },
  {
    slug: "free-stock-screeners-indian-investors",
    title: "Best Free Stock Screeners for Indian Investors in 2026",
    description: "Find the best stocks to invest in with free screeners built for Indian markets. Compare Screener.in, Tickertape, TradingView, and tikrr.",
    category: "comparison",
    tags: ["india", "screener", "free", "comparison", "tools"],
    date: "2026-05-27",
    readTime: "12 min read",
  },
  {
    slug: "how-to-build-stock-watchlist",
    title: "How to Build a Stock Watchlist That Actually Works",
    seoTitle: "How to Build a Stock Watchlist",
    description: "A watchlist isn't a wishlist. Learn how to build, maintain, and use a stock watchlist that helps you spot opportunities without the noise.",
    category: "guides",
    tags: ["watchlist", "beginners", "strategy", "guide"],
    date: "2026-05-27",
    readTime: "10 min read",
  },
  {
    slug: "portfolio-rebalancing-guide-retail-investors",
    title: "Portfolio Rebalancing: The Complete Guide for Retail Investors",
    description: "When and how to rebalance your portfolio. Learn calendar-based, threshold-based, and hybrid rebalancing strategies plus tools that automate it.",
    category: "guides",
    tags: ["portfolio", "rebalancing", "strategy", "risk-management"],
    date: "2026-05-27",
    readTime: "12 min read",
  },
  {
    slug: "how-to-analyze-a-stock-before-buying",
    title: "How to Analyze a Stock Before Buying: A Step-by-Step Guide",
    description:
      "Before you buy any stock, run it through this checklist. Covers fundamentals, technicals, valuation, and sentiment analysis in a practical framework.",
    category: "guides",
    tags: ["analysis", "beginners", "fundamentals", "valuation", "guide"],
    date: "2026-06-10",
    readTime: "14 min read",
  },
  {
    slug: "best-stock-portfolio-tracker-free-2026",
    title: "Best Free Stock Portfolio Trackers in 2026 (Reviewed by Use Case)",
    description:
      "We reviewed 10 free portfolio trackers so you don't have to. From AI-powered briefs to brokerage tools, here are the ones worth using.",
    category: "tools",
    tags: ["portfolio", "tracker", "free", "tools", "comparison"],
    date: "2026-06-10",
    readTime: "12 min read",
  },
  {
    slug: "how-to-read-stock-charts-beginners",
    title: "How to Read Stock Charts: A Beginner's Visual Guide",
    description:
      "Stock charts look complicated but they're not. Learn candlestick patterns, support and resistance, volume, and the 3 indicators that matter most.",
    category: "guides",
    tags: ["charts", "technical-analysis", "beginners", "guide"],
    date: "2026-06-12",
    readTime: "13 min read",
  },
  {
    slug: "stock-market-for-beginners-2026",
    title: "Stock Market for Beginners: The Complete 2026 Starter Guide",
    description:
      "Everything a beginner needs to know about the stock market in one guide. How stocks work, how to start investing, and the mistakes to avoid.",
    category: "guides",
    tags: ["beginners", "investing", "stocks", "education", "guide"],
    date: "2026-06-12",
    readTime: "15 min read",
  },
  {
    slug: "how-to-build-a-stock-portfolio-from-scratch",
    title: "How to Build a Stock Portfolio from Scratch in 2026",
    description:
      "Starting from zero? Here's how to build a diversified stock portfolio step by step. Covers allocation, diversification, position sizing, and when to add or remove stocks.",
    category: "guides",
    tags: ["portfolio", "diversification", "beginners", "strategy", "guide"],
    date: "2026-06-15",
    readTime: "14 min read",
  },
  {
    slug: "when-to-sell-a-stock",
    title: "When to Sell a Stock: 7 Signals That Say It's Time",
    description:
      "Knowing when to sell is harder than knowing when to buy. Here are 7 data-backed signals that indicate it may be time to exit a position.",
    category: "intelligence",
    tags: ["selling", "strategy", "signals", "risk-management", "guide"],
    date: "2026-06-15",
    readTime: "11 min read",
  },
];

// These legacy posts remain reachable for existing links, but they are broad,
// overlapping, or comparison-heavy pages that have not yet met the current
// source and review standard. Keep them out of discovery surfaces until edited.
const LEGACY_NOINDEX_BLOG_SLUGS = new Set([
  "stock-market-heatmap-tools",
  "ai-stock-watchlist-vs-traditional",
  "best-market-intelligence-tools-2026",
  "stocksbrew-vs-finviz",
  "best-free-stock-alert-tools-2026",
  "daily-stock-market-analysis-routine",
  "sector-rotation-tracking-tools",
  "earnings-predictions-ai-vs-analyst",
  "ai-stock-sentiment-analysis-tools",
  "track-insider-trading-free",
  "stock-market-daily-newsletter-free",
  "market-breadth-analysis-guide",
  "how-to-read-stock-heat-map",
  "stock-analysis-beginners-technical-vs-fundamental",
  "free-stock-screeners-indian-investors",
  "portfolio-rebalancing-guide-retail-investors",
  "how-to-analyze-a-stock-before-buying",
  "best-stock-portfolio-tracker-free-2026",
  "how-to-read-stock-charts-beginners",
  "stock-market-for-beginners-2026",
  "how-to-build-a-stock-portfolio-from-scratch",
  "when-to-sell-a-stock",
]);

export function isIndexableBlogPost(slug: string): boolean {
  return !LEGACY_NOINDEX_BLOG_SLUGS.has(slug);
}

export const indexableBlogPosts = allBlogPosts.filter((post) => isIndexableBlogPost(post.slug));
