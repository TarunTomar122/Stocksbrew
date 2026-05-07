export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  date: string;
  readTime: string;
};

export const allBlogPosts: BlogPost[] = [
  {
    slug: "what-is-ai-market-brief",
    title: "What Is an AI Market Brief and Why You Need One in 2026",
    description: "Traditional market briefs are manual, slow, and generic. AI briefs are personalized, instant, and actionable. Here's why they matter.",
    category: "intelligence",
    tags: ["ai", "market-brief", "productivity"],
    date: "2026-05-07",
    readTime: "10 min read",
  },
  {
    slug: "daily-market-intelligence-guide",
    title: "Daily Market Intelligence: The Complete Guide for 2026",
    description: "What daily market intelligence actually means, why it matters, and how to get it without spending hours researching.",
    category: "intelligence",
    tags: ["market-intelligence", "daily", "strategy"],
    date: "2026-05-07",
    readTime: "12 min read",
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
    slug: "ai-stock-alerts-vs-price-alerts",
    title: "AI Stock Alerts: How Smart Alerts Beat Price Alerts",
    description: "Price alerts are dumb. AI alerts understand context: earnings, RSI, sector rotation, and fundamental changes.",
    category: "tools",
    tags: ["ai", "alerts", "trading"],
    date: "2026-05-07",
    readTime: "10 min read",
  },
  {
    slug: "best-market-intelligence-tools-2026",
    title: "Best Market Intelligence Tools in 2026 (Honest Comparison)",
    description: "10 tools compared: Finviz, TradingView, Seeking Alpha, tikrr, and more. Honest pros, cons, and pricing.",
    category: "comparison",
    tags: ["tools", "comparison", "pricing"],
    date: "2026-05-07",
    readTime: "15 min read",
  },
  {
    slug: "ai-stock-analysis-what-works",
    title: "AI Stock Analysis in 2026: What Actually Works",
    description: "Cutting through the AI hype. What AI can and can't do for stock analysis, and how to use it wisely.",
    category: "intelligence",
    tags: ["ai", "analysis", "strategy"],
    date: "2026-05-07",
    readTime: "10 min read",
  },
  {
    slug: "free-market-intelligence-tools",
    title: "The Best Free Market Intelligence Tools You're Not Using",
    description: "Free tools across 10 competitors. What's actually useful at $0, and where the gaps are.",
    category: "tools",
    tags: ["free", "tools", "comparison"],
    date: "2026-05-07",
    readTime: "12 min read",
  },
  {
    slug: "tikrr-vs-finviz",
    title: "tikrr vs Finviz: Which Market Intelligence Tool Is Right for You?",
    description: "Finviz dominates screening. tikrr owns daily intelligence. They solve different problems. Here's how to pick.",
    category: "comparison",
    tags: ["comparison", "finviz", "tools"],
    date: "2026-05-07",
    readTime: "12 min read",
  },
];
