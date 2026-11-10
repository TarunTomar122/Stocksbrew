/**
 * The product's five places, in the order a day goes: read what happened,
 * check what you own, look for the next idea, see what others did, and set
 * something to watch it for you.
 */
export type NavIcon =
  | "ask"
  | "briefing"
  | "portfolio"
  | "explore"
  | "follow"
  | "agents"
  | "markets"
  | "strategies"
  | "backtest"
  | "calendar"
  | "news"
  | "filings"
  | "practice"
  | "screener"
  | "themes"
  | "signals"
  | "compare"
  | "docs"
  | "api";

export type NavItem = {
  label: string;
  href: string;
  /** Path prefixes that light this item up, besides its own href. */
  match: string[];
  icon: NavIcon;
};

/** The copilot sits above the five places, the way "new chat" does. */
export const ASK_ITEM: NavItem = { label: "Ask", href: "/ask", match: [], icon: "ask" };

export const NAV_ITEMS: NavItem[] = [
  { label: "Briefing", href: "/briefing", match: [], icon: "briefing" },
  { label: "Portfolio", href: "/watchlist", match: ["/portfolio"], icon: "portfolio" },
  { label: "Explore", href: "/explore", match: ["/stock"], icon: "explore" },
  { label: "Follow", href: "/follow", match: ["/insiders"], icon: "follow" },
  { label: "Agents", href: "/agents", match: [], icon: "agents" },
];

/** Second-level places, grouped the way the sidebar shows them. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Research",
    items: [
      { label: "The wire", href: "/news", match: [], icon: "news" },
      { label: "Calendar", href: "/calendar", match: [], icon: "calendar" },
      { label: "Screener", href: "/screener", match: [], icon: "screener" },
      { label: "Themes", href: "/themes", match: [], icon: "themes" },
      { label: "Signals", href: "/signals", match: [], icon: "signals" },
      { label: "Markets", href: "/markets", match: [], icon: "markets" },
      { label: "Filings", href: "/filings", match: [], icon: "filings" },
      { label: "Compare", href: "/compare", match: [], icon: "compare" },
    ],
  },
  {
    label: "Test ideas",
    items: [
      { label: "Strategies", href: "/strategies", match: [], icon: "strategies" },
      { label: "Backtest", href: "/backtest", match: [], icon: "backtest" },
      { label: "Practice account", href: "/practice", match: [], icon: "practice" },
    ],
  },
  {
    label: "More",
    items: [
      { label: "Docs", href: "/docs", match: [], icon: "docs" },
      { label: "Developers", href: "/developers", match: [], icon: "api" },
    ],
  },
];

function hits(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...item.match].some((prefix) => hits(prefix, pathname));
}

/**
 * Pages a visitor reads before using the product. They get the marketing top
 * bar instead of the app sidebar (components/oa/chrome-switch.tsx).
 */
const MARKETING_PREFIXES = ["/pricing", "/docs", "/about", "/security", "/legal", "/blog"];

export function isMarketingPath(pathname: string): boolean {
  return pathname === "/" || MARKETING_PREFIXES.some((prefix) => hits(prefix, pathname));
}

/** The marketing bar's links: the five places, then what a visitor asks next. */
export const MARKETING_LINKS: NavItem[] = [
  ...NAV_ITEMS,
  { label: "Pricing", href: "/pricing", match: [], icon: "docs" },
  { label: "Docs", href: "/docs", match: [], icon: "docs" },
];
