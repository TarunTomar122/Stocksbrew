/**
 * Turning what the beacon sends into the few safe, low-cardinality values the
 * analytics store keeps. Pure, shared by the beacon route and the tests.
 *
 * Nothing that could identify a person survives this: paths lose their query
 * and hash, referrers keep only their host, free text is never accepted (the
 * search event carries the cleaned ticker-style query lib/product-analytics.ts
 * already sends), and every string is capped.
 */

/** The dynamic pages, most specific first: "/stock/NVDA/earnings/2026-08-27" -> "/stock/[symbol]/earnings/[date]". */
const ROUTES: Array<[RegExp, string]> = [
  [/^\/stock\/[^/]+\/research\/s\/[^/]+$/, "/stock/[symbol]/research/s/[shareId]"],
  [/^\/stock\/[^/]+\/research\/[^/]+$/, "/stock/[symbol]/research/[key]"],
  [/^\/stock\/[^/]+\/research$/, "/stock/[symbol]/research"],
  [/^\/stock\/[^/]+\/earnings\/[^/]+$/, "/stock/[symbol]/earnings/[date]"],
  [/^\/stock\/[^/]+\/moves\/[^/]+$/, "/stock/[symbol]/moves/[date]"],
  [/^\/stock\/[^/]+$/, "/stock/[symbol]"],
  [/^\/agents\/baskets\/[^/]+\/edit$/, "/agents/baskets/[id]/edit"],
  [/^\/agents\/baskets\/[^/]+$/, "/agents/baskets/[id]"],
  [/^\/agents\/theses\/[^/]+\/edit$/, "/agents/theses/[id]/edit"],
  [/^\/agents\/theses\/[^/]+$/, "/agents/theses/[id]"],
  [/^\/follow\/[^/]+\/copy$/, "/follow/[slug]/copy"],
  [/^\/follow\/[^/]+$/, "/follow/[slug]"],
  [/^\/calendar\/earnings\/[^/]+$/, "/calendar/earnings/[ticker]"],
  [/^\/markets\/[^/]+\/[^/]+$/, "/markets/[class]/[symbol]"],
  [/^\/markets\/[^/]+$/, "/markets/[class]"],
  [/^\/docs\/compare\/[^/]+$/, "/docs/compare/[slug]"],
  [/^\/docs\/[^/]+\/[^/]+$/, "/docs/[section]/[slug]"],
  [/^\/docs\/[^/]+$/, "/docs/[section]"],
  [/^\/compare\/[^/]+-vs-[^/]+$/, "/compare/[pair]"],
  [/^\/insiders\/[^/]+$/, "/insiders/[ticker]"],
  [/^\/movers\/[^/]+$/, "/movers/[date]"],
  [/^\/baskets\/[^/]+$/, "/baskets/[slug]"],
  [/^\/best\/[^/]+$/, "/best/[slug]"],
  [/^\/blog\/[^/]+$/, "/blog/[slug]"],
  [/^\/legal\/[^/]+$/, "/legal/[slug]"],
  [/^\/sectors\/[^/]+$/, "/sectors/[slug]"],
  [/^\/strategies\/[^/]+$/, "/strategies/[slug]"],
  [/^\/themes\/[^/]+$/, "/themes/[slug]"],
  [/^\/s\/[^/]+$/, "/s/[id]"],
];

const MAX_PATH = 120;

/** A clean path: no query, no hash, no trailing slash, at most 120 characters. Null for anything that is not a path. */
export function cleanPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let path = input.split(/[?#]/)[0]!.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  try {
    path = decodeURI(path);
  } catch {
    // keep it encoded
  }
  // Control characters and spaces never belong in one of our paths.
  path = path.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path.slice(0, MAX_PATH) || "/";
}

/** The page a path is an instance of ("/stock/[symbol]"); a static page is its own route. */
export function routeOf(path: string): string {
  for (const [re, route] of ROUTES) if (re.test(path)) return route;
  return path;
}

/**
 * Pages that belong to one account (a person's own basket or thesis): their id
 * could be matched to the account in the store, so only the route is kept.
 */
const OWN_ROUTES = new Set(["/agents/baskets/[id]", "/agents/baskets/[id]/edit", "/agents/theses/[id]", "/agents/theses/[id]/edit"]);

/** The path as stored: the path itself, or its route for a page that belongs to one account. */
export function storedPath(path: string): string {
  const route = routeOf(path);
  return OWN_ROUTES.has(route) ? route : path;
}

/** The ticker a stock page is about ("/stock/nvda/earnings/x" -> "NVDA"), or null. */
export function stockOf(path: string): string | null {
  const match = /^\/stock\/([^/]+)/.exec(path);
  if (!match) return null;
  const symbol = match[1]!.toUpperCase().replace(/^US_/, "");
  return /^[A-Z0-9.\-]{1,12}$/.test(symbol) ? symbol : null;
}

/** /admin is the owner's own page: never counted. */
export function isExcludedPath(path: string): boolean {
  return /^\/(admin|api|_next)(\/|$)/.test(path);
}

/**
 * Where a visit came from: the referrer's host without "www.", or null for a
 * direct visit or one from our own site. Only the host is ever kept.
 */
export function referrerHost(referrer: unknown, ownHosts: readonly string[] = []): string | null {
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  let host: string;
  try {
    const url = new URL(referrer);
    if (url.protocol === "android-app:") host = url.hostname;
    else if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    else host = url.hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host || host.length > 80 || !/^[a-z0-9.\-]+$/.test(host)) return null;
  const own = ownHosts.map((h) => h.toLowerCase().replace(/^www\./, ""));
  if (own.includes(host) || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

/** A UTM value: lower case, letters, digits and a few separators, at most 48 characters. */
export function cleanUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._\-+ ]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return clean || null;
}

/**
 * The key events the dashboard counts, by the name lib/product-analytics.ts (or
 * components/posthog-pageview.tsx) already sends to PostHog. Everything else
 * that passes through captureEvent is ignored by the beacon.
 */
export const KEY_EVENTS = {
  $pageview: "pageview",
  search_performed: "search",
  ask_question_asked: "ask",
  signin_started: "signin_started",
  user_signed_in: "signin_completed",
  user_signed_up: "signup_completed",
  stock_track_clicked: "stocks_added",
  import_saved: "stocks_added",
  agent_switched_on: "agent_on",
  basket_created: "basket_created",
  thesis_created: "thesis_created",
  proposal_decided: "proposal_decided",
  checkout_clicked: "checkout_started",
} as const;

export type KeyEventName = (typeof KEY_EVENTS)[keyof typeof KEY_EVENTS];
export const KEY_EVENT_NAMES: readonly KeyEventName[] = Array.from(new Set(Object.values(KEY_EVENTS)));

export function keyEventFor(posthogName: string): KeyEventName | null {
  return Object.prototype.hasOwnProperty.call(KEY_EVENTS, posthogName) ? KEY_EVENTS[posthogName as keyof typeof KEY_EVENTS] : null;
}

/** The few properties each key event may carry, already cleaned. Never free text, never an id of a person. */
export type EventProps = {
  /** search: the cleaned query (upper case, at most 40 characters: tickers and company names). */
  q?: string;
  /** search: whether it matched anything. */
  found?: boolean;
  /** proposal_decided: "accepted" | "dismissed". */
  decision?: "accepted" | "dismissed";
  /** agent_on: the template id; basket_created: its source kind. */
  kind?: string;
};

const SLUG_RE = /^[a-z0-9_\-]{1,40}$/;

export function cleanProps(event: KeyEventName, raw: unknown): EventProps {
  const props = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: EventProps = {};
  if (event === "search") {
    const q = typeof props.query === "string" ? props.query.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 40) : "";
    // Only what a person types to find a stock: letters, digits, spaces and the odd symbol in a company name.
    if (q && /^[A-Z0-9 .&'\-]+$/.test(q)) out.q = q;
    if (typeof props.found === "boolean") out.found = props.found;
  } else if (event === "proposal_decided") {
    if (props.decision === "accepted" || props.decision === "dismissed") out.decision = props.decision;
  } else if (event === "agent_on" || event === "basket_created") {
    const kind = typeof props.template === "string" ? props.template : typeof props.kind === "string" ? props.kind : "";
    if (SLUG_RE.test(kind.toLowerCase())) out.kind = kind.toLowerCase();
  }
  return out;
}
