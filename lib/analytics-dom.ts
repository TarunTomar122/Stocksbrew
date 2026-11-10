/**
 * Click tracking declared in markup, so server components can say what a
 * click means without becoming client components.
 *
 *   <a data-track="screener_exported" data-track-format="csv">   one element
 *   <ul data-track-links="mover_opened" data-track-list="gainers"> every link inside
 *
 * `data-track-*` attributes become snake_case properties. Inside a
 * `data-track-links` container, a click on any link sends the container's
 * event with the link's `ticker` (from a /stock/X href) and `href` path added.
 * One listener (components/posthog-pageview.tsx) reads these; nothing here
 * sends anything itself.
 */

export type TrackedClick = { event: string; properties: Record<string, string | number | boolean> };

const EVENT_NAME = /^[a-z][a-z0-9_]{1,48}$/;

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** `dataset` of an element -> the event's properties (data-track-insight-id -> insight_id). */
export function propsFromDataset(dataset: Record<string, string | undefined>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(dataset)) {
    if (!key.startsWith("track") || key === "track" || key === "trackLinks" || raw === undefined) continue;
    const rest = key.slice("track".length);
    if (!rest) continue;
    const name = snake(rest.charAt(0).toLowerCase() + rest.slice(1));
    const value = raw.slice(0, 120);
    out[name] = value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) && value.length < 12 ? Number(value) : value;
  }
  return out;
}

/** "/stock/NVDA?x=1" -> "NVDA"; anything else -> null. */
export function tickerFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = /^(?:https?:\/\/[^/]+)?\/stock\/([^/?#]+)/i.exec(href);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!).toUpperCase().slice(0, 16);
  } catch {
    return match[1]!.toUpperCase().slice(0, 16);
  }
}

/** The path of an internal link, without the query (which can hold free text); external links -> their host. */
export function hrefTarget(href: string | null | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("#")) return href.slice(0, 60);
  if (href.startsWith("/")) return href.split(/[?#]/)[0]!.slice(0, 120);
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

/** The bits of a DOM element this reads; real elements satisfy it, and tests can pass plain objects. */
type ElementLike = {
  closest(selector: string): unknown;
  getAttribute(name: string): string | null;
  dataset?: Record<string, string | undefined>;
  tagName: string;
  parentElement: unknown;
  hasAttribute?(name: string): boolean;
};

/** What a click on `target` should send, or null. */
export function trackedClickFor(input: unknown): TrackedClick | null {
  const target = input as ElementLike | null;
  if (!target || typeof target.closest !== "function") return null;
  const own = target.closest("[data-track]") as ElementLike | null;
  if (own) {
    const event = own.getAttribute("data-track") ?? "";
    if (!EVENT_NAME.test(event)) return null;
    const properties = propsFromDataset(own.dataset ?? {});
    // A native <summary>: only count the click that opens it.
    if (own.tagName === "SUMMARY") {
      const details = own.parentElement as ElementLike | null;
      if (details && details.tagName === "DETAILS" && details.hasAttribute?.("open")) return null;
    }
    const href = own.getAttribute("href");
    if (href) {
      const ticker = tickerFromHref(href);
      if (ticker && properties.ticker === undefined) properties.ticker = ticker;
      const to = hrefTarget(href);
      if (to && properties.href === undefined) properties.href = to;
    }
    return { event, properties };
  }
  const link = target.closest("a[href]") as ElementLike | null;
  if (!link) return null;
  const container = link.closest("[data-track-links]") as ElementLike | null;
  if (!container) return null;
  const event = container.getAttribute("data-track-links") ?? "";
  if (!EVENT_NAME.test(event)) return null;
  const properties = propsFromDataset(container.dataset ?? {});
  const href = link.getAttribute("href");
  const ticker = tickerFromHref(href);
  if (ticker) properties.ticker = ticker;
  const to = hrefTarget(href);
  if (to) properties.href = to;
  // Which link in the container, when it says (data-track-target="action").
  const role = link.getAttribute("data-track-target");
  if (role) properties.target = role.slice(0, 40);
  return { event, properties };
}

/* ── returning visitors ─────────────────────────────────────────────────── */

export type VisitLog = { first: string; last: string };

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/**
 * Given what this browser remembers and today's UTC date (YYYY-MM-DD), the
 * log to store and, on the first visit of a later day, the `user_returned`
 * properties. A first-ever visit or a second visit the same day returns null.
 */
export function nextVisit(previous: VisitLog | null, today: string): { log: VisitLog; returned: { days_since_first: number; days_since_last: number } | null } {
  const valid = previous && /^\d{4}-\d{2}-\d{2}$/.test(previous.first) && /^\d{4}-\d{2}-\d{2}$/.test(previous.last) ? previous : null;
  if (!valid) return { log: { first: today, last: today }, returned: null };
  if (valid.last >= today) return { log: valid, returned: null };
  return {
    log: { first: valid.first, last: today },
    returned: {
      days_since_first: Math.max(0, dayNumber(today) - dayNumber(valid.first)),
      days_since_last: Math.max(0, dayNumber(today) - dayNumber(valid.last)),
    },
  };
}
