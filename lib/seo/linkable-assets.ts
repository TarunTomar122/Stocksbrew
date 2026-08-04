/** Pages worth linking from Reddit, newsletters, and guest posts — backlink targets. */
export type LinkableAsset = {
  href: string;
  title: string;
  description: string;
  suggestedAnchor: string;
  outreachBlurb: string;
};

const BASE = "https://www.stocksbrew.online";

export const LINKABLE_ASSETS: LinkableAsset[] = [
  {
    href: "/blog/best-stock-analysis-apps-2026",
    title: "Best stock analysis apps in 2026",
    description: "Source-reviewed workflow comparison with current pricing, limitations, and a same-ticker test.",
    suggestedAnchor: "best stock analysis apps in 2026",
    outreachBlurb:
      "A workflow-first comparison of stock analysis apps, with current pricing, official sources, honest limits, and a test readers can repeat: " +
      `${BASE}/blog/best-stock-analysis-apps-2026`,
  },
  {
    href: "/blog/stock-analysis-app-checklist",
    title: "Stock analysis app checklist",
    description: "A 12-point scorecard for freshness, evidence, risks, monitoring, price, and safety.",
    suggestedAnchor: "stock analysis app checklist",
    outreachBlurb:
      "This 12-point checklist is useful before a stock research app trial ends—especially the stale-data and missing-data tests: " +
      `${BASE}/blog/stock-analysis-app-checklist`,
  },
  {
    href: "/should-i-buy",
    title: "Free Should I Buy checker",
    description: "AI scorecard for any US ticker — valuation, growth, quality, momentum.",
    suggestedAnchor: "free Should I Buy stock checker",
    outreachBlurb:
      "If you want a quick read on a single ticker, this free checker scores valuation, growth, quality, and momentum: " +
      `${BASE}/should-i-buy`,
  },
  {
    href: "/radar",
    title: "Watchlist — stock research and alerts",
    description: "Daily buy/hold/sell stances on your watchlist with portfolio health.",
    suggestedAnchor: "stocksbrew Watchlist",
    outreachBlurb:
      "For ongoing stock monitoring, Watchlist keeps current calls, earnings, news and alerts on your names: " +
      `${BASE}/radar`,
  },
  {
    href: "/heat",
    title: "Market heatmap",
    description: "Sector and stock heatmap for US markets.",
    suggestedAnchor: "free stock market heatmap",
    outreachBlurb:
      "Free sector heatmap if you want a quick visual on what's moving: " +
      `${BASE}/heat`,
  },
  {
    href: "/blog/how-to-build-stock-watchlist",
    title: "How to build a stock watchlist",
    description: "Step-by-step watchlist workflow for retail investors.",
    suggestedAnchor: "how to build a stock watchlist",
    outreachBlurb:
      "Solid primer on building a watchlist that actually leads to decisions (not a 200-ticker junk drawer): " +
      `${BASE}/blog/how-to-build-stock-watchlist`,
  },
  {
    href: "/blog/buy-hold-sell-signals-explained",
    title: "Buy, hold, sell signals explained",
    description: "What stance-based signals mean and how to use them without overtrading.",
    suggestedAnchor: "buy hold sell signals",
    outreachBlurb:
      "Useful breakdown of buy/hold/sell signals vs dumb price alerts: " +
      `${BASE}/blog/buy-hold-sell-signals-explained`,
  },
  {
    href: "/compare/stocksbrew-vs-finviz",
    title: "stocksbrew vs Finviz",
    description: "Screener vs daily watchlist intelligence — honest comparison.",
    suggestedAnchor: "stocksbrew vs Finviz",
    outreachBlurb:
      "If you use Finviz for screening but still don't know what to *do* with the list, this comparison is fair: " +
      `${BASE}/compare/stocksbrew-vs-finviz`,
  },
  {
    href: "/guides",
    title: "Stock research guide hub",
    description: "Free tools, workflows, and comparisons in one place.",
    suggestedAnchor: "stock research guide",
    outreachBlurb:
      "Hub that ties free tools + weekly workflow together: " +
      `${BASE}/guides`,
  },
];

export const REDDIT_OUTREACH_TEMPLATES = [
  {
    title: "r/investing — answering 'how do you track your watchlist?'",
    body:
      "I keep a short watchlist (15–20 names max) with a written thesis per ticker. For daily monitoring I use a brief that filters news to just those tickers instead of scrolling market-wide feeds. Free Should I Buy checker is handy when something new hits my screen: https://www.stocksbrew.online/should-i-buy — happy to share the watchlist template I use if useful.",
  },
  {
    title: "r/stocks — earnings season prep",
    body:
      "Before earnings I write down what would make me add vs exit for each holding — stops me from reacting to the headline number alone. This playbook on prepping a watchlist for earnings season helped me structure it: https://www.stocksbrew.online/blog/earnings-season-watchlist-playbook",
  },
  {
    title: "Bogleheads forum — tool stack for US equities",
    body:
      "For US names I screen with Finviz, then track stance changes on a small Watchlist (3 free). Not a broker — just buy/hold/sell calls with context. Comparison vs Yahoo portfolio tracking if anyone's evaluating: https://www.stocksbrew.online/compare/stocksbrew-vs-yahoo-finance",
  },
] as const;
