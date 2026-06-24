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
    href: "/learn",
    title: "New to research",
    description: "Start with beginner guides, then add 3 tickers to Radar and turn on your email digest.",
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
    href: "/compare/stocksbrew-vs-tickertape",
    title: "stocksbrew vs Tickertape",
    description: "US watchlist briefs vs Indian screeners. Which fits your market and workflow.",
  },
  {
    href: "/blog/stocksbrew-vs-finviz",
    title: "stocksbrew vs Finviz",
    description: "Static screener tables vs AI briefs and Radar alerts on your names.",
  },
  {
    href: "/blog/best-market-intelligence-tools-2026",
    title: "Best market brief tools (2026)",
    description: "Roundup of research stacks for investors who want a daily read, not another dashboard.",
  },
];

export const WORKFLOW_GUIDES: HubLink[] = [
  {
    href: "/blog/daily-market-intelligence-guide",
    title: "Daily market intelligence guide",
    description: "How to build a 10-minute morning read without opening six tabs.",
  },
  {
    href: "/blog/track-stock-news-for-your-portfolio",
    title: "Track news without noise",
    description: "Filter headlines to your watchlist so you only see what moves your stocks.",
  },
  {
    href: "/blog/stay-updated-on-stocks-without-checking-daily",
    title: "Stay updated without checking daily",
    description: "Digest-first workflow: Radar briefs and alerts instead of refreshing quotes.",
  },
  {
    href: "/use-cases",
    title: "Research by investing style",
    description: "Dividend, swing, and earnings workflows mapped to stocksbrew tools.",
  },
  {
    href: "/should-i-buy",
    title: "Should I Buy checker",
    description: "Free AI scorecard on any US ticker. Add to Radar if you like the call.",
  },
  {
    href: "/learn",
    title: "Learn library (50 guides)",
    description: "Fundamentals, portfolio building, and strategy from beginner to advanced.",
  },
];

export const WEEKLY_WORKFLOW = [
  {
    day: "Monday",
    task: "Read your Radar digest and scan the news timeline for watchlist movers.",
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
      "Add up to three tickers to Radar for free, read each daily brief, and use the Learn guides for fundamentals. If you are comparing tools first, start with the comparison section on this page.",
  },
  {
    question: "What free tools does stocksbrew include?",
    answer:
      "Should I Buy, Compare Stocks, Portfolio Analyzer, Market Heat, Screens, News, Trump Logic, IPO calendar, and more — all listed on the free tools page. Radar tracking is free for up to three US tickers.",
  },
  {
    question: "How is this different from a screener site?",
    answer:
      "Screeners return tables of numbers. stocksbrew focuses on a short daily read for names you already care about, plus free checkers when you are exploring new ideas.",
  },
  {
    question: "Do I need a paid plan to use this hub?",
    answer:
      "No. Every tool linked from this page has a free tier. Pro adds unlimited Radar names, more alerts, and deeper intel.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. stocksbrew is research and education only. It is not a broker and does not provide personalized investment advice.",
  },
];
