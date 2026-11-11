import type { Metadata } from "next";

import { pageLd, pageMetadata } from "@/lib/seo/page-meta";

/**
 * Titles, descriptions, share cards and breadcrumbs for the portfolio tools,
 * the basket builder, the agents box and the two market pages, in one place
 * so they can be read side by side and tested for length (titles 50
 * characters or less before " · stocksbrew", descriptions 155 or less).
 *
 * The portfolio tools are indexed: a visitor who is not signed in (and every
 * crawler) sees the example portfolio, never anyone's holdings, and the card
 * draws that same example.
 *
 * /explore and /markets aim at different searches. /explore is "stock market
 * today": how the day went and why. /markets is the price board: levels for
 * indices, yields, oil, gold, currencies and crypto.
 */

type Crumb = { name: string; path: string };

export type ToolPageSeo = {
  title: string;
  description: string;
  /** The share card under /api/og. */
  card: string[];
  alt: string;
  daily?: boolean;
  crumbs: Crumb[];
  keywords?: string[];
};

const MY_STOCKS: Crumb = { name: "My stocks", path: "/portfolio" };

export const TOOL_PAGE_SEO = {
  "/portfolio": {
    title: "Portfolio overview: what changed and what's next",
    description:
      "What changed in your stocks this week, the earnings report that matters most, your next dividend, and the trim or tax idea worth a look.",
    card: ["portfolio", "home"],
    alt: "What stood out in the example portfolio this week",
    daily: true,
    crumbs: [MY_STOCKS],
  },
  "/portfolio/memo": {
    title: "Weekly portfolio memo against the S&P 500",
    description:
      "A short memo on your whole portfolio every week: how it did against the S&P 500 and why, what changed, what could hurt and what is worth a look.",
    card: ["portfolio", "memo"],
    alt: "This week's memo on the example portfolio",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Weekly memo", path: "/portfolio/memo" }],
  },
  "/portfolio/xray": {
    title: "ETF overlap checker: what you really own",
    description:
      "Add what is inside your ETFs to the stocks you bought: your real stake in each company and sector, and how much your funds overlap, from SEC filings.",
    card: ["portfolio", "xray"],
    alt: "What the example portfolio really owns once its funds are opened up",
    daily: true,
    crumbs: [MY_STOCKS, { name: "What you really own", path: "/portfolio/xray" }],
  },
  "/portfolio/dividends": {
    title: "Dividend planner: your next 12 months of income",
    description:
      "What your stocks should pay you over the next twelve months, month by month: announced dividends with pay dates, the rest estimated from last year.",
    card: ["portfolio", "dividends"],
    alt: "What the example portfolio should pay in dividends over the next year",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Dividends", path: "/portfolio/dividends" }],
  },
  "/portfolio/stress": {
    title: "Portfolio stress test: Covid, 2022 and tariffs",
    description:
      "How your stocks did in real market shocks: the Covid crash, the 2022 rate-hike slide, the 2023 bank scare and the 2025 tariff shock, against the S&P 500.",
    card: ["portfolio", "stress"],
    alt: "How the example portfolio did in past market shocks",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Stress test", path: "/portfolio/stress" }],
  },
  "/portfolio/earnings": {
    title: "Earnings calendar for the stocks you own",
    description:
      "Every earnings report coming for your stocks in the next six weeks, with the date and time, the estimate, and how each stock moved after past reports.",
    card: ["portfolio", "earnings"],
    alt: "The earnings reports coming for the example portfolio",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Earnings season", path: "/portfolio/earnings" }],
  },
  "/portfolio/goal": {
    title: "Investment goal planner: will you get there?",
    description:
      "Will your portfolio reach your goal in time? Thousands of replays of your holdings' real monthly returns, with your monthly savings added.",
    card: ["portfolio", "goal"],
    alt: "Whether the example portfolio reaches its goal in time",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Goal planner", path: "/portfolio/goal" }],
  },
  "/portfolio/ideas": {
    title: "Rebalancing and tax-loss harvesting ideas",
    description:
      "Where to sell some or buy more when one company or sector is too big, the tax on each sale, and losses you could sell to cut your tax bill.",
    card: ["portfolio", "ideas"],
    alt: "Rebalancing ideas for the example portfolio",
    daily: true,
    crumbs: [MY_STOCKS, { name: "Rebalancing ideas", path: "/portfolio/ideas" }],
  },
  "/baskets/new": {
    title: "Build a stock basket in plain English",
    description:
      "Describe the stocks you want in your own words, like cheap banks or AI power stocks under $50B. See every company that fits and a backtest.",
    card: ["page", "baskets"],
    alt: "Build a stock basket by describing it in your own words",
    crumbs: [{ name: "Baskets", path: "/baskets/new" }],
  },
  "/agents": {
    title: "Stock agents: alerts you describe in plain English",
    description:
      "Tell an agent what to watch in your own words: a price, a big move, an earnings report, a filing. Replay it on the last four weeks before it starts.",
    card: ["page", "agents"],
    alt: "What an example agent would have told you over the last four weeks",
    daily: true,
    crumbs: [{ name: "Agents", path: "/agents" }],
  },
  "/explore": {
    title: "Stock market today: every sector, yields and oil",
    description:
      "How the US stock market did today in three plain points, then every sector and what moved across yields, oil, gold and crypto.",
    card: ["page", "explore"],
    alt: "Today's read of the US stock market",
    daily: true,
    crumbs: [{ name: "Market today", path: "/explore" }],
    keywords: ["stock market today", "why is the stock market up today", "why is the stock market down today", "sector performance today", "market movers today"],
  },
  "/markets": {
    title: "Market prices: indices, yields, oil, gold, crypto",
    description:
      "Levels and changes for US indices and ETFs, Treasury yields, oil and gold, currencies, crypto, options readings and prediction market odds in one place.",
    card: ["page", "markets"],
    alt: "Market levels today: indices, rates, commodities, currencies and crypto",
    daily: true,
    crumbs: [{ name: "Markets", path: "/markets" }],
    keywords: ["treasury yields today", "oil price today", "gold price today", "bitcoin price today", "dollar index", "fed rate odds"],
  },
} satisfies Record<string, ToolPageSeo>;

export type ToolPagePath = keyof typeof TOOL_PAGE_SEO;

export function toolPageMetadata(path: ToolPagePath, options: { noindex?: boolean } = {}): Metadata {
  const page: ToolPageSeo = TOOL_PAGE_SEO[path];
  return pageMetadata({ ...page, path, noindex: options.noindex });
}

export function toolPageLd(path: ToolPagePath): Record<string, unknown>[] {
  const page: ToolPageSeo = TOOL_PAGE_SEO[path];
  return pageLd({ name: page.title, description: page.description, path, crumbs: page.crumbs });
}
