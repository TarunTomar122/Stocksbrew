/**
 * The free stock widget: a small card other sites put in an iframe (/embed/stock/<T>), and the snippet they paste.
 * Pure, so the card's HTML, the snippet and the address rules are pinned by tests (stock-widget.test.ts). The data
 * comes from lib/embed/stock-widget-data.ts; the route is app/embed/stock/[...parts]/route.ts.
 *
 * Why the snippet carries a plain link under the iframe: what is inside an iframe belongs to our domain, so it gives
 * the page that embeds it no link to us. The visible <a> outside the iframe is what counts as a backlink.
 *
 * The card is public and anonymous: our call and its reason are free on every stock, price levels are not, so no
 * level or zone is ever drawn (the reason goes through levelFree before it gets here).
 */

import { levelFree, whole } from "@/lib/og/format";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { LOGO_FALLBACK_INK, logoFallbackColor, logoInitials } from "@/lib/stock-logo-sources";

export type WidgetTheme = "light" | "dark";
export type WidgetCall = "Add" | "Hold" | "Trim";

/** The production address: snippets always point here, whatever host the builder page was opened on. */
export const WIDGET_ORIGIN = "https://www.stocksbrew.online";

/** The stock the /widgets builder opens on when its address names none. */
export const DEFAULT_WIDGET_SYMBOL = "NVDA";

/** Sizes offered on /widgets. The card fills whatever box it is given; these are the boxes it was drawn for. */
export const WIDGET_SIZES = [
  { id: "small", label: "Small", width: 300, height: 236 },
  { id: "medium", label: "Medium", width: 360, height: 222 },
  { id: "wide", label: "Full width", width: "100%", height: 208 },
] as const;
export type WidgetSizeId = (typeof WIDGET_SIZES)[number]["id"];

export function widgetSize(id: string | null | undefined) {
  return WIDGET_SIZES.find((size) => size.id === id) ?? WIDGET_SIZES[1];
}

/** A ticker as the widget takes it: "brk.b" -> "BRK.B". Null for anything that is not one. */
export function widgetSymbol(raw: string | null | undefined): string | null {
  let text = String(raw ?? "").trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    return null;
  }
  const symbol = text.trim().toUpperCase();
  if (!symbol || symbol.length > 16 || !/^[A-Z0-9][A-Z0-9.-]*$/.test(symbol)) return null;
  return symbol;
}

/**
 * The widget's address parts after /embed/stock/: [symbol] or [symbol, theme]. The theme is a path segment, not a
 * query, so the address stays a plain page for the crawler guard (lib/crawler-guard.ts refuses query strings to
 * crawlers) and for the cache. Null for anything else, which the route answers with 404.
 */
export function parseEmbedPath(parts: readonly string[] | null | undefined): { symbol: string; theme: WidgetTheme } | null {
  if (!parts || parts.length < 1 || parts.length > 2) return null;
  const symbol = widgetSymbol(parts[0]);
  if (!symbol) return null;
  if (parts.length === 1) return { symbol, theme: "light" };
  const theme = parts[1]!.toLowerCase();
  return theme === "dark" || theme === "light" ? { symbol, theme } : null;
}

/** The widget's path: /embed/stock/NVDA, /embed/stock/NVDA/dark. Light is the default, so it has no segment. */
export function widgetPath(symbol: string, theme: WidgetTheme = "light"): string {
  return `/embed/stock/${encodeURIComponent(symbol)}${theme === "dark" ? "/dark" : ""}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The code a site owner pastes: the iframe, then a plain link to the stock page outside it (the backlink). Keep the
 * link on by default; `link: false` exists only so the builder can show what the bare iframe would be.
 */
export function widgetSnippet(input: { symbol: string; theme?: WidgetTheme; size?: WidgetSizeId; origin?: string; link?: boolean }): string {
  const symbol = widgetSymbol(input.symbol) ?? "NVDA";
  const origin = (input.origin ?? WIDGET_ORIGIN).replace(/\/+$/, "");
  const size = widgetSize(input.size);
  const src = `${origin}${widgetPath(symbol, input.theme ?? "light")}`;
  const title = `${symbol} stock price and our call`;
  // A percentage is not a valid width attribute (some editors strip it), so full width goes in the style.
  const width = typeof size.width === "number" ? `width="${size.width}" ` : "";
  const style = typeof size.width === "number" ? "border:0;max-width:100%" : "border:0;width:100%";
  const iframe = `<iframe src="${escapeHtml(src)}" ${width}height="${size.height}" style="${style}" loading="lazy" title="${escapeHtml(title)}"></iframe>`;
  if (input.link === false) return iframe;
  const href = `${origin}/stock/${encodeURIComponent(symbol)}`;
  return `${iframe}\n<p style="font:12px/1.5 sans-serif;margin:4px 0 0"><a href="${escapeHtml(href)}">${escapeHtml(symbol)} stock price and forecast</a> by stocksbrew</p>`;
}

/** The longest reason the card shows: three lines at the small size, and one sentence of 15 words at most (the
 * owner's word budget for a card line). */
export const WIDGET_REASON_MAX = 110;
export const WIDGET_REASON_WORDS = 15;

/**
 * The one line on why we hold the call: the first candidate (the thesis, then the call's reason) that has no price
 * level or zone in it (levelFree) and fits whole, or its first sentence does. Null when none does: the card then
 * shows the call alone rather than a cut sentence.
 */
export function widgetReason(...candidates: Array<string | null | undefined>): string | null {
  const fits = (line: string | null): line is string => Boolean(line) && line!.split(/\s+/).length <= WIDGET_REASON_WORDS;
  for (const candidate of candidates) {
    const clean = levelFree(candidate);
    if (!clean) continue;
    const line = whole(clean, WIDGET_REASON_MAX);
    if (fits(line)) return line;
    // The whole text fit the length but not the word budget: its first sentence may.
    const first = whole(clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“($])/)[0], WIDGET_REASON_MAX);
    if (first !== line && fits(first) && first.length >= 20) return first;
  }
  return null;
}

/* ── the card ──────────────────────────────────────────────────────────── */

export type WidgetStock = {
  symbol: string;
  /** Short company name ("NVIDIA"), or null when we only hold the ticker. */
  name: string | null;
  /** "$188.42", or null when we have no price. */
  price: string | null;
  /** Today's move in percent, or null. */
  dayPct: number | null;
  /** "today", "yesterday", "on Friday": the day the move is from ("" when unknown). */
  dayLabel: string;
  call: WidgetCall | null;
  /** One level-free sentence on why, or null. */
  reason: string | null;
  /** Closes for the sparkline, oldest first (at least two), or null. */
  spark: number[] | null;
  /** "3 months" */
  sparkLabel: string | null;
  sparkPct: number | null;
  /** Logo URL (same origin), or null for the lettered tile. */
  logo: string | null;
};

const CALL_TONE: Record<WidgetCall, "up" | "flat" | "down"> = { Add: "up", Hold: "flat", Trim: "down" };

/** "+2.3%" / "−1.2%" / "0.0%" with a real minus sign. */
export function widgetPct(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(1));
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}

function toneOf(value: number | null | undefined): "up" | "down" | "flat" {
  if (typeof value !== "number" || !Number.isFinite(value) || Number(value.toFixed(1)) === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** The sparkline's path in a w×h box, or null for fewer than two usable points. */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 2): string | null {
  const points = values.filter((value) => Number.isFinite(value) && value > 0);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const step = (w - pad * 2) / (points.length - 1);
  return points
    .map((value, index) => {
      const x = pad + index * step;
      // A flat series is a level line through the middle, not one lying on the floor.
      const y = span > 0 ? pad + (h - pad * 2) * (1 - (value - min) / span) : h / 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
}

/**
 * Light and dark, the site's "brew" tokens (app/globals.css .oa-app), as plain CSS variables. The page says
 * `color-scheme: light dark` whatever the theme: a frame whose colour scheme differs from the page around it gets an
 * opaque canvas (white on a dark site, black on a light one), which shows in the card's rounded corners. Accepting
 * both lets the frame take the host page's scheme, so the canvas stays transparent. Every colour here is explicit.
 */
const THEMES: Record<WidgetTheme, string> = {
  light: "--bg:#fffdf9;--fg:#1c1915;--muted:#564f44;--border:rgba(28,25,21,.12);--wash:rgba(28,25,21,.04);--primary:#9a4816;--up:#1f6b45;--down:#b3261e;--flat:#564f44",
  dark: "--bg:#1f1b16;--fg:#f2ecdf;--muted:#beb5a6;--border:rgba(242,236,223,.14);--wash:rgba(242,236,223,.05);--primary:#d9843f;--up:#58c98a;--down:#f0796b;--flat:#beb5a6",
};

const MARK =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 56 56" fill="none"><path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke="currentColor" stroke-width="7.5" stroke-linecap="round"/><path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke="currentColor" stroke-width="7.5" stroke-linecap="round"/></svg>';

const ARROW: Record<"up" | "down" | "flat", string> = {
  up: '<svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10"><path d="M5 1.5 9 8H1z" fill="currentColor"/></svg>',
  down: '<svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10"><path d="M5 8.5 1 2h8z" fill="currentColor"/></svg>',
  flat: "",
};

const CSS = `*{box-sizing:border-box;margin:0}
html,body{height:100%;background:transparent}
body{font:14px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--fg);-webkit-font-smoothing:antialiased}
a.card{display:flex;flex-direction:column;gap:10px;height:100%;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:inherit;text-decoration:none;overflow:hidden}
a.card:hover{border-color:color-mix(in srgb,var(--fg) 30%,transparent)}
a.card:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.top{display:flex;align-items:center;gap:10px;min-width:0}
.logo{position:relative;overflow:hidden;width:36px;height:36px;border-radius:8px;flex:none;background:var(--wash);object-fit:cover}
.logo::after{content:attr(data-i);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--lb);color:${LOGO_FALLBACK_INK};font:600 13px/1 ui-monospace,monospace}
.id{min-width:0;flex:1}
.tk{font-weight:650;font-size:15px;letter-spacing:-.01em}
.nm{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.px{text-align:right;flex:none;font-variant-numeric:tabular-nums}
.pr{font-weight:650;font-size:17px;letter-spacing:-.01em}
.mv{font-size:12.5px;color:var(--muted);white-space:nowrap}
.mv b{font-weight:600}
.up{color:var(--up)}.down{color:var(--down)}.flat{color:var(--flat)}
.spark{flex:1 1 34px;min-height:26px;position:relative}
.spark svg{position:absolute;inset:0;width:100%;height:100%}
.call{font-size:13px;line-height:18px;color:var(--fg)}
.pill{display:inline-block;margin-right:6px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;line-height:20px;vertical-align:1px;white-space:nowrap}
.pill.up{background:color-mix(in srgb,var(--up) 14%,transparent)}
.pill.down{background:color-mix(in srgb,var(--down) 14%,transparent)}
.pill.flat{background:color-mix(in srgb,var(--flat) 14%,transparent)}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)}
.brand{display:inline-flex;align-items:center;gap:5px;color:var(--fg);font-weight:600;letter-spacing:-.01em}
.brand svg{color:var(--primary)}
.nf p{margin:auto 0;color:var(--muted);font-size:13px}
.nf .foot{margin-top:0}`;

function page(input: { title: string; theme: WidgetTheme; canonical: string; body: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(input.title)}</title><link rel="canonical" href="${escapeHtml(input.canonical)}"><style>:root{${THEMES[input.theme]};color-scheme:light dark}${CSS}</style></head><body>${input.body}</body></html>`;
}

/** The card's full HTML document. `origin` is used for the canonical and the link out; images stay same-origin. */
export function renderStockWidget(stock: WidgetStock, theme: WidgetTheme, origin: string = WIDGET_ORIGIN): string {
  const href = `${origin}/stock/${encodeURIComponent(stock.symbol)}`;
  const tone = toneOf(stock.dayPct);
  const pct = widgetPct(stock.dayPct);
  // A logo that fails to load shows the ticker's lettered tile (the ::after below only draws on a broken image).
  const logo = stock.logo
    ? `<img class="logo" src="${escapeHtml(stock.logo)}" alt="" width="36" height="36" data-i="${escapeHtml(logoInitials(stock.symbol))}" style="--lb:${logoFallbackColor(stock.symbol)}">`
    : "";
  const name = stock.name && stock.name.toUpperCase() !== stock.symbol ? `<div class="nm">${escapeHtml(stock.name)}</div>` : "";
  const price = stock.price
    ? `<div class="px"><div class="pr">${escapeHtml(stock.price)}</div>${
        pct ? `<div class="mv"><b class="${tone}">${ARROW[tone]} ${escapeHtml(pct)}</b> ${escapeHtml(stock.dayLabel)}</div>` : ""
      }</div>`
    : "";
  const sparkTone = toneOf(stock.sparkPct);
  const d = stock.spark ? sparkPath(stock.spark, 300, 34) : null;
  const spark = d
    ? `<div class="spark"><svg viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--${sparkTone === "flat" ? "muted" : sparkTone})" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg></div>`
    : "";
  const call = stock.call
    ? `<p class="call"><span class="pill ${CALL_TONE[stock.call]}">${escapeHtml(CALL_PLAIN[stock.call])}</span>${stock.reason ? escapeHtml(stock.reason) : ""}</p>`
    : "";
  const sparkPct = widgetPct(stock.sparkPct);
  const sparkNote = d && stock.sparkLabel && sparkPct ? `<span>${escapeHtml(sparkPct)} in ${escapeHtml(stock.sparkLabel)}</span>` : "";
  // The card's own link says where the visit came from (?ref is allowed past the crawler guard); the canonical and the
  // snippet's backlink stay plain.
  const body = `<a class="card" href="${escapeHtml(`${href}?ref=widget`)}" target="_blank" rel="noopener" title="${escapeHtml(`Open the full ${stock.symbol} report on stocksbrew`)}"><div class="top">${logo}<div class="id"><div class="tk">${escapeHtml(stock.symbol)}</div>${name}</div>${price}</div>${spark}${call}<div class="foot"><span class="brand">${MARK}stocksbrew</span>${sparkNote}</div></a>`;
  return page({ title: `${stock.symbol} stock price and our call`, theme, canonical: href, body });
}

/** The card for a ticker we do not have: a short line and a way to look it up. Served with 404. */
export function renderWidgetNotFound(symbol: string | null, theme: WidgetTheme, origin: string = WIDGET_ORIGIN): string {
  const href = `${origin}/screener`;
  // "Can't show", not "don't have": a store that fails quietly looks the same as an unknown ticker from here.
  const line = symbol ? `We can't show ${escapeHtml(symbol)} right now. Check the ticker.` : "That isn't a ticker we know.";
  const body = `<a class="card nf" href="${escapeHtml(href)}" target="_blank" rel="noopener"><p>${line}</p><div class="foot"><span class="brand">${MARK}stocksbrew</span><span>Find a stock</span></div></a>`;
  return page({ title: "Stock not found", theme, canonical: href, body });
}
