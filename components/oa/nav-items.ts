/**
 * The product's five places, named for what you get there, in the order a
 * day goes: what happened today, what you own, research a stock, see what
 * big investors did, and set something to watch for you. Every page in the
 * app belongs to exactly one place, so one place is always lit, and each
 * place lists its pages as sections (the sidebar under the lit place, the
 * strip under the phone top bar).
 *
 * Routes never change here: only names, grouping and which item lights up.
 */
export type NavIcon =
  | "ask"
  | "today"
  | "alerts"
  | "briefing"
  | "portfolio"
  | "explore"
  | "research"
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
  | "movers"
  | "sectors"
  | "compare"
  | "docs"
  | "api";

export type NavItem = {
  label: string;
  href: string;
  /** Path prefixes that light this item up, besides its own href. */
  match: string[];
  icon: NavIcon;
  /** A sub-heading the sidebar prints above this section (the first of a run). */
  group?: string;
};

export type NavPlace = NavItem & {
  /** The phone tab bar's word for the place (fits a fifth of 390px). */
  short: string;
  /** One line on what you get there (link titles, the marketing bar). */
  blurb: string;
  sections: NavItem[];
};

const section = (label: string, href: string, icon: NavIcon, match: string[] = [], group?: string): NavItem => ({
  label,
  href,
  match,
  icon,
  ...(group ? { group } : {}),
});

export const PLACES: NavPlace[] = [
  {
    label: "Today",
    short: "Today",
    href: "/briefing",
    match: [],
    icon: "today",
    blurb: "What moved, why, and what is coming up",
    sections: [
      section("Briefing", "/briefing", "briefing"),
      section("Market today", "/explore", "explore"),
      section("Why stocks moved", "/movers", "movers"),
      section("Signals", "/signals", "signals"),
      section("News", "/news", "news"),
      section("Calendar", "/calendar", "calendar"),
    ],
  },
  {
    label: "My stocks",
    short: "My stocks",
    href: "/portfolio",
    match: ["/watchlist", "/import"],
    icon: "portfolio",
    blurb: "What you own and watch, and how it is doing",
    // The overview first, then the tools in the order you would use them: see what you have, plan ahead, act.
    sections: [
      section("Overview", "/portfolio", "portfolio"),
      section("Portfolio", "/watchlist", "portfolio", ["/import"], "Your stocks"),
      section("Weekly memo", "/portfolio/memo", "briefing", [], "Your stocks"),
      section("What you own", "/portfolio/xray", "portfolio", [], "Your stocks"),
      section("Earnings season", "/portfolio/earnings", "calendar", [], "Plan ahead"),
      section("Dividends", "/portfolio/dividends", "calendar", [], "Plan ahead"),
      section("Goal planner", "/portfolio/goal", "backtest", [], "Plan ahead"),
      section("Stress test", "/portfolio/stress", "backtest", [], "Plan ahead"),
      section("Rebalancing ideas", "/portfolio/ideas", "filings", [], "Act"),
      section("Taxes", "/watchlist/tax", "filings", [], "Act"),
      section("Practice account", "/practice", "practice", [], "Act"),
    ],
  },
  {
    label: "Research",
    short: "Research",
    href: "/screener",
    match: ["/stock"],
    icon: "research",
    blurb: "Find a stock and read everything about it",
    sections: [
      section("Find stocks", "/screener", "screener"),
      section("Best stock lists", "/best", "screener"),
      section("Build a basket", "/baskets/new", "themes", ["/baskets"]),
      section("Sectors", "/sectors", "sectors"),
      section("Compare", "/compare", "compare"),
      section("Markets", "/markets", "markets"),
      section("Filings", "/filings", "filings"),
      section("Ask", "/ask", "ask"),
      section("Themes", "/themes", "themes", [], "Test ideas"),
      section("Strategies", "/strategies", "strategies", [], "Test ideas"),
      section("Backtest", "/backtest", "backtest", [], "Test ideas"),
    ],
  },
  {
    label: "Follow investors",
    short: "Investors",
    href: "/follow",
    match: [],
    icon: "follow",
    blurb: "What funds, Congress and insiders bought and sold",
    sections: [
      section("Funds and Congress", "/follow", "follow"),
      section("Insiders", "/insiders", "follow"),
    ],
  },
  {
    label: "Alerts & agents",
    short: "Alerts",
    href: "/agents",
    match: [],
    icon: "alerts",
    blurb: "Agents that watch the market and email you",
    sections: [section("Agents", "/agents", "agents")],
  },
];

/** The five places, for callers that only need the top level. */
export const NAV_ITEMS: NavItem[] = PLACES;

/** Pages a visitor checks before signing up: the sidebar's quiet footer and the marketing bar. */
export const MORE_LINKS: NavItem[] = [
  { label: "Pricing", href: "/pricing", match: [], icon: "docs" },
  { label: "Docs", href: "/docs", match: [], icon: "docs" },
  { label: "Developers", href: "/developers", match: [], icon: "api" },
];

function hits(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The length of the longest prefix of `item` that matches, or -1. */
function matchLength(item: NavItem, pathname: string): number {
  let best = -1;
  for (const prefix of [item.href, ...item.match]) if (hits(prefix, pathname) && prefix.length > best) best = prefix.length;
  return best;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return matchLength(item, pathname) >= 0;
}

/** The place a path belongs to: the one with the longest matching prefix across its own and its sections' paths. */
export function placeFor(pathname: string): NavPlace | null {
  let best: NavPlace | null = null;
  let bestLength = -1;
  for (const place of PLACES) {
    const length = Math.max(matchLength(place, pathname), ...place.sections.map((item) => matchLength(item, pathname)));
    if (length > bestLength) {
      best = place;
      bestLength = length;
    }
  }
  return bestLength >= 0 ? best : null;
}

/** The section a path sits in, inside its place (null on a stock page, which has no section of its own). */
export function sectionFor(pathname: string, place: NavPlace | null = placeFor(pathname)): NavItem | null {
  if (!place) return null;
  let best: NavItem | null = null;
  let bestLength = -1;
  for (const item of place.sections) {
    const length = matchLength(item, pathname);
    if (length > bestLength) {
      best = item;
      bestLength = length;
    }
  }
  return best;
}

/** The icon of the section (or place) that owns a path: page titles and link lists use it, so a place looks the same everywhere. */
export function iconFor(pathname: string): NavIcon | null {
  const place = placeFor(pathname);
  return sectionFor(pathname, place)?.icon ?? place?.icon ?? null;
}

export type Crumb = { label: string; href: string };

const MARKET_CLASS_NAMES: Record<string, string> = {
  indices: "Indices",
  rates: "Treasury yields",
  commodities: "Commodities",
  fx: "Currencies",
  crypto: "Crypto",
  etfs: "Funds",
  futures: "Futures",
};

/**
 * The way back from a deep page, from its place down to its parent page:
 * "Research › NVDA" on an NVDA move page, "Follow investors › Funds and
 * Congress" on a fund page. Empty on a place's or a section's own page (the
 * sidebar and the phone strip already say where you are), null outside the
 * app's places (docs, the 404 page).
 */
export function trailFor(pathname: string): Crumb[] | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const place = placeFor(path);
  if (!place) return null;
  const current = sectionFor(path, place);
  if (path === place.href || (current && path === current.href)) return [];

  const trail: Crumb[] = [{ label: place.label, href: place.href }];
  if (current && current.href !== place.href) trail.push({ label: current.label, href: current.href });

  const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments[0] === "stock" && segments[1] && segments.length > 2) {
    const ticker = segments[1].toUpperCase();
    const stockHref = `/stock/${encodeURIComponent(ticker)}`;
    trail.push({ label: ticker, href: stockHref });
    if (segments[2] === "earnings") trail.push({ label: "Earnings", href: `/calendar/earnings/${encodeURIComponent(ticker)}` });
    if (segments[2] === "research" && segments.length > 3) trail.push({ label: "Long research report", href: `${stockHref}/research` });
  }
  if (segments[0] === "markets" && segments[1] && segments.length > 2) {
    trail.push({ label: MARKET_CLASS_NAMES[segments[1]] ?? segments[1], href: `/markets/${encodeURIComponent(segments[1])}` });
  }
  return trail;
}

/**
 * Pages a visitor reads before using the product. They get the marketing top
 * bar instead of the app sidebar (components/oa/chrome-switch.tsx).
 */
const MARKETING_PREFIXES = ["/pricing", "/docs", "/about", "/security", "/legal", "/blog"];

export function isMarketingPath(pathname: string): boolean {
  return pathname === "/" || MARKETING_PREFIXES.some((prefix) => hits(prefix, pathname));
}

/** The marketing bar's links: the five places by their short names, then pricing and docs. */
export const MARKETING_LINKS: NavItem[] = [
  ...PLACES.map((place) => ({ label: place.short, href: place.href, match: [], icon: place.icon })),
  MORE_LINKS[0],
  MORE_LINKS[1],
];
