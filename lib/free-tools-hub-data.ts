export type HubLink = {
  href: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  featured?: boolean;
};

export type FreeToolGroup = {
  title: string;
  description: string;
  tools: HubLink[];
};

export const FREE_TOOL_GROUPS: FreeToolGroup[] = [
  {
    title: "Pick & compare",
    description: "Run a quick read on a ticker, line up peers, or stress-test your book.",
    tools: [
      {
        href: "/should-i-buy",
        title: "Should I Buy?",
        description: "Free AI scorecard on any US ticker. Add winners to Radar in one click.",
        icon: "fact_check",
        accent: "#059669",
        featured: true,
      },
      {
        href: "/compare-stocks",
        title: "Compare stocks",
        description: "Line up 2–5 US tickers side by side with the best row highlighted.",
        icon: "compare_arrows",
        accent: "#2563eb",
        featured: true,
      },
      {
        href: "/portfolio",
        title: "Portfolio Analyzer",
        description: "Upload holdings and see concentration, overlap, and risk.",
        icon: "pie_chart",
        accent: "#7c3aed",
      },
    ],
  },
  {
    title: "Plan & size",
    description: "Calendars and calculators for entries, risk, and new listings.",
    tools: [
      {
        href: "/position-size-calculator",
        title: "Position size calculator",
        description: "Shares, dollar risk, and R:R from account size, risk %, and stop.",
        icon: "calculate",
        accent: "#0891b2",
      },
      {
        href: "/ipos",
        title: "IPO calendar",
        description: "Upcoming US listings and lock-up dates in one view.",
        icon: "calendar_month",
        accent: "#d97706",
      },
    ],
  },
  {
    title: "Scan the market",
    description: "Heat maps, screens, headlines, and macro reads — no login required.",
    tools: [
      {
        href: "/heat",
        title: "Market Heat",
        description: "Ranked list of names getting unusual attention today.",
        icon: "local_fire_department",
        accent: "#ea580c",
        featured: true,
      },
      {
        href: "/screens",
        title: "Screens",
        description: "Curated thematic screens updated with the market.",
        icon: "grid_view",
        accent: "#4f46e5",
      },
      {
        href: "/news",
        title: "US Stock Market News",
        description: "Current US stock headlines with ticker and sentiment filters.",
        icon: "newspaper",
        accent: "#64748b",
      },
      {
        href: "/trump-logic",
        title: "Trump Logic",
        description: "Truth Social mentions mapped to tickers, sentiment, and moves.",
        icon: "campaign",
        accent: "#dc2626",
      },
    ],
  },
];

export const ALL_FREE_TOOLS: HubLink[] = FREE_TOOL_GROUPS.flatMap((g) => g.tools);

export const FEATURED_FREE_TOOLS = ALL_FREE_TOOLS.filter((t) => t.featured);

export function getFreeToolByHref(href: string): HubLink | undefined {
  return ALL_FREE_TOOLS.find((t) => t.href === href);
}

export function getRelatedFreeTools(href: string, limit = 3): HubLink[] {
  const group = FREE_TOOL_GROUPS.find((g) => g.tools.some((t) => t.href === href));
  const pool = group ? group.tools.filter((t) => t.href !== href) : ALL_FREE_TOOLS.filter((t) => t.href !== href);
  return pool.slice(0, limit);
}

export const FREE_TOOLS_FAQS = [
  {
    question: "Are these tools really free?",
    answer:
      "Yes. Every tool on this page is free to use. Radar tracking is free for up to three US tickers; Pro unlocks unlimited names and deeper intel.",
  },
  {
    question: "Where should I start?",
    answer:
      "Try Should I Buy on a ticker you own, or open Market Pulse for today's movers. Compare stocks when you are deciding between two names.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. stocksbrew is research and education only. It is not a broker and does not provide personalized investment advice.",
  },
];
