import { ALL_FREE_TOOLS } from "@/lib/free-tools-hub-data";

export type HubLink = {
  href: string;
  title: string;
  description: string;
  badge?: string;
  external?: boolean;
};

export const START_PATHS: HubLink[] = [
  {
    href: "/blog/stock-research-checklist-evidence-first",
    title: "Start with evidence",
    description: "Use a filings-first checklist, write the thesis and invalidation case, then add serious candidates to Watchlist.",
    badge: "Path A",
  },
  {
    href: "/compare/stocksbrew-vs-tickertape",
    title: "Picking a research stack",
    description: "Compare stocksbrew with Tickertape, Finviz, and other brief tools before you commit.",
    badge: "Path B",
  },
  {
    href: "/free-tools",
    title: "Try free tools first",
    description: "Run Should I Buy on a ticker, compare peers, then explore Heat, Screens, and the full free toolkit.",
    badge: "Path C",
  },
];

export const FREE_TOOLS: HubLink[] = ALL_FREE_TOOLS.map(({ href, title, description }) => ({
  href,
  title,
  description,
}));

export const COMPARISONS: HubLink[] = [
  {
    href: "/compare/stocksbrew-vs-finviz",
    title: "stocksbrew vs Finviz",
    description: "Compare Finviz screening with stocksbrew research and Watchlist tracking.",
  },
  {
    href: "/compare/stocksbrew-vs-tradingview",
    title: "stocksbrew vs TradingView",
    description: "Compare TradingView charts with stocksbrew research and Watchlist tracking.",
  },
  {
    href: "/compare/stocksbrew-vs-yahoo-finance",
    title: "stocksbrew vs Yahoo Finance",
    description: "Compare Yahoo Finance portfolio tracking with stocksbrew Watchlist.",
  },
  {
    href: "/compare/stocksbrew-vs-tickertape",
    title: "stocksbrew vs Tickertape",
    description: "US watchlist briefs vs Indian screeners. Which fits your market and workflow.",
  },
  {
    href: "/blog/finviz-vs-tradingview-vs-stocksbrew",
    title: "Finviz vs TradingView vs stocksbrew",
    description: "A source-backed workflow comparison covering screening, charting, monitoring, alerts, and cost.",
  },
  {
    href: "/compare",
    title: "All comparisons",
    description: "Every stocksbrew side-by-side in one place.",
  },
];

export const WORKFLOW_GUIDES: HubLink[] = [
  {
    href: "/blog/finviz-vs-tradingview-vs-stocksbrew",
    title: "A daily US market workflow",
    description: "A short way to check the market, your stocks, and the next events.",
  },
  {
    href: "/blog/track-stock-news-for-your-portfolio",
    title: "Track stock news",
    description: "Give filings and material company events priority over repeated headlines.",
  },
  {
    href: "/blog/watchlist-vs-portfolio-tracker",
    title: "Watchlist vs portfolio",
    description: "Keep research names separate from holdings so tracking stays clear.",
  },
  {
    href: "/blog/stock-news-catalyst-analysis",
    title: "Check a stock-news catalyst",
    description: "Verify what happened, when it happened, and whether it changes the business case.",
  },
  {
    href: "/blog/earnings-season-watchlist-playbook",
    title: "Earnings season playbook",
    description: "Prepare for a report, read the filing, and record what changed.",
  },
  {
    href: "/use-cases",
    title: "Research by investing style",
    description: "Dividend, swing, and earnings workflows mapped to stocksbrew tools.",
  },
  {
    href: "/should-i-buy",
    title: "Should I Buy checker",
    description: "A quick look at valuation, growth, quality, and momentum for any US ticker.",
  },
  {
    href: "/editorial-policy",
    title: "Editorial & comparison policy",
    description: "How sources, AI assistance, reviews, updates, conflicts, and corrections are handled.",
  },
];

export const WEEKLY_WORKFLOW = [
  {
    day: "Monday",
    task: "Read your Watchlist digest and scan the news timeline for movers.",
    href: "/watchlist",
  },
  {
    day: "Wednesday",
    task: "Check Market Heat for new ideas, then run Should I Buy on anything interesting.",
    href: "/heat",
  },
  {
    day: "Friday",
    task: "Review the earnings calendar and open Earnings Intel for names reporting soon.",
    href: "/earnings",
  },
];

export const GUIDES_FAQS = [
  {
    question: "Where should I start researching stocks?",
    answer:
      "Start with the evidence-first stock research checklist, then add up to three serious candidates or holdings to Watchlist for free. If you are comparing tools first, use the workflow comparison section on this page.",
  },
  {
    question: "What free tools does stocksbrew include?",
    answer:
      "Should I Buy, Compare Stocks, Portfolio Analyzer, Market Heat, Screens, News, Trump Logic, IPO calendar and more are listed on the free tools page. Watchlist tracking is free for up to three US tickers.",
  },
  {
    question: "How is this different from a screener site?",
    answer:
      "Screeners return tables of numbers. stocksbrew focuses on a short daily read for names you already care about, plus free checkers when you are exploring new ideas.",
  },
  {
    question: "Do I need a paid plan to use this hub?",
    answer:
      "No. Every tool linked from this page has a free tier. Pro adds unlimited Watchlist names, more alerts and detailed research.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. stocksbrew is research and education only. It is not a broker and does not provide personalized investment advice.",
  },
];
