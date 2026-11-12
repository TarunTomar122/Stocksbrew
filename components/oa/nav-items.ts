/**
 * The product's five places, named for what you get there: your agent's
 * running notes on your stocks (and the agents it runs), what happened today,
 * what you own, research a stock, and see what big investors did. Every page in the
 * app belongs to exactly one place, so one place is always lit, and each
 * place lists its pages as sections (the sidebar under the lit place, the
 * strip and its "More" menu under the phone top bar).
 *
 * Routes never change here: only names, grouping and which item lights up. /ask has no section of its own: the
 * "Ask a question" button above the places is its one way in (owner, Nov 12: "why is ask in two places"), and it
 * lights up on /ask (components/ask/ask-panel-host.tsx).
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
  | "premarket"
  | "inbox"
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
    // The signed-in home: the agent's running notes on your stocks, then the agents it runs and everything they found.
    label: "Your agent",
    short: "Agent",
    href: "/agent",
    match: [],
    icon: "agents",
    blurb: "Notes from your agent on your stocks, and what it watches for you",
    sections: [section("Notes", "/agent", "agents"), section("Agents", "/agents", "alerts"), section("Inbox", "/inbox", "inbox")],
  },
  {
    label: "Today",
    short: "Today",
    href: "/briefing",
    match: [],
    icon: "today",
    blurb: "What moved, why, and what is coming up",
    sections: [
      section("Briefing", "/briefing", "briefing"),
      section("Premarket", "/premarket", "premarket"),
      // Market today is the one read of the day's moves; each past day's page (/movers/2026-11-10) lights it too.
      section("Market today", "/explore", "explore", ["/movers"]),
      section("Signals", "/signals", "signals"),
      section("News", "/news", "news"),
      section("Calendar", "/calendar", "calendar"),
    ],
  },
  {
    label: "My stocks",
    short: "My stocks",
    href: "/portfolio",
    match: ["/import"],
    icon: "portfolio",
    blurb: "What you own and watch, and how it is doing",
    // The overview first (with the holdings editor as its tabs), then the tools in the order you would use them:
    // see what you have, plan ahead, act.
    sections: [
      section("Overview", "/portfolio", "portfolio", ["/import"]),
      section("Weekly memo", "/portfolio/memo", "briefing", [], "Your stocks"),
      section("Analysis", "/portfolio/xray", "portfolio", [], "Your stocks"),
      section("Earnings season", "/portfolio/earnings", "calendar", [], "Plan ahead"),
      section("Dividends", "/portfolio/dividends", "calendar", [], "Plan ahead"),
      section("Goal planner", "/portfolio/goal", "backtest", [], "Plan ahead"),
      section("Rebalancing ideas", "/portfolio/ideas", "filings", [], "Act"),
      section("Taxes", "/portfolio/taxes", "filings", [], "Act"),
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

/**
 * The phone strip's order: the section you are on first, then the ones after it, then the ones before it, so the
 * current page and its next neighbours are the pills that fit. With no current section (a stock page), the place's
 * own order.
 */
export function stripOrder(place: NavPlace | NavItem[], current: NavItem | null): NavItem[] {
  const items = Array.isArray(place) ? place : place.sections;
  const at = current ? items.indexOf(current) : -1;
  if (at <= 0) return items;
  return [...items.slice(at), ...items.slice(0, at)];
}

/** The views of My stocks' overview page (components/portfolio/my-stocks-tabs.tsx draws them as tabs from lg up). */
export type MyStocksView = "overview" | "holdings" | "watching" | "alerts";

/**
 * My stocks' own tabs as phone strip pills. Below lg the strip is the page's one level of navigation, so the tabs
 * join it instead of drawing a second bar under it (owner, Nov 11: "Overview" twice on a phone).
 */
export const MY_STOCKS_VIEW_ITEMS: ReadonlyArray<NavItem & { view: MyStocksView }> = [
  { view: "overview", label: "Overview", href: "/portfolio", match: ["/import"], icon: "portfolio" },
  { view: "holdings", label: "Holdings", href: "/portfolio?tab=holdings", match: [], icon: "portfolio" },
  { view: "watching", label: "Watching", href: "/portfolio?tab=watching", match: [], icon: "portfolio" },
  { view: "alerts", label: "Alerts", href: "/portfolio?tab=alerts", match: [], icon: "alerts" },
];

/** Premarket's own address: a section the nav shows only before the open (components/oa/use-premarket-open.ts). */
export const PREMARKET_HREF = "/premarket";

/** A place's sections as the nav shows them now: Premarket only while the premarket session is on. */
export function sectionsNow<T extends NavItem>(sections: readonly T[], premarketOpen: boolean): T[] {
  return premarketOpen ? [...sections] : sections.filter((item) => item.href !== PREMARKET_HREF);
}

/** The pills of a place's phone strip: its sections, with My stocks' overview split into its tabs. */
export function stripItems(place: NavPlace, premarketOpen = false): NavItem[] {
  if (place.href !== "/portfolio") return sectionsNow(place.sections, premarketOpen);
  return [...MY_STOCKS_VIEW_ITEMS, ...place.sections.filter((item) => item.href !== "/portfolio")];
}

/**
 * The strip pill that is lit: the section the path sits in, or on My stocks' overview page the tab on show
 * (`view`, read from the address in the browser; the overview when unknown).
 */
export function stripCurrent(place: NavPlace, pathname: string, view: MyStocksView | null): NavItem | null {
  const section = sectionFor(pathname, place);
  if (place.href !== "/portfolio" || section?.href !== "/portfolio") return section;
  const shown = pathname === "/portfolio" ? view ?? "overview" : "overview";
  return MY_STOCKS_VIEW_ITEMS.find((item) => item.view === shown) ?? null;
}

/** Which My stocks view an address shows (the same reading as lib/portfolio-shared.ts `myStocksTab`). */
export function myStocksViewOf(search: string): MyStocksView {
  const params = new URLSearchParams(search);
  const tab = (params.get("tab") ?? "").toLowerCase();
  if (tab === "watching" || tab === "alerts") return tab;
  if (tab === "holdings" || tab === "positions" || tab === "analytics") return "holdings";
  if (params.get("reasons") === "1") return "holdings";
  return "overview";
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
 * bar instead of the app sidebar (components/oa/app-chrome-shell.tsx).
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
