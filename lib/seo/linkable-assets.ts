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
    title: "Radar — AI watchlist calls",
    description: "Daily buy/hold/sell stances on your watchlist with portfolio health.",
    suggestedAnchor: "stocksbrew Radar",
    outreachBlurb:
      "For ongoing watchlist monitoring (not just one-off screens), Radar gives daily buy/hold/sell calls on your names: " +
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
      "For US names I screen with Finviz, then track stance changes on a small Radar list (3 free). Not a broker — just buy/hold/sell calls with context. Comparison vs Yahoo portfolio tracking if anyone's evaluating: https://www.stocksbrew.online/compare/stocksbrew-vs-yahoo-finance",
  },
] as const;
