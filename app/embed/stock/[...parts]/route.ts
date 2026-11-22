import { parseEmbedPath, renderStockWidget, renderWidgetNotFound, widgetPath, WIDGET_ORIGIN } from "@/lib/embed/stock-widget";
import { loadWidgetStock } from "@/lib/embed/stock-widget-data";

/**
 * The free stock widget other sites put in an iframe: /embed/stock/NVDA (light) and /embed/stock/NVDA/dark.
 * A plain HTML document with inline CSS and no script, so it costs the host page about 5 KB plus the logo.
 *
 * - Framing: any site may frame /embed/* (next.config.js leaves frame-ancestors off for these paths only).
 * - Never indexed (noindex here and in the page), canonical to the stock page, so it never competes with it.
 * - Cached: Varnish keeps it five minutes (middleware.ts, lib/edge-cache-policy.ts); browsers a minute. A card built
 *   from a failed read is kept 30 seconds; a ticker we could not look up at all is a 503, never stored, so Varnish
 *   keeps serving the last good card (stale-if-error) rather than telling every host site we don't have NVDA.
 * - Crawler guard: an iframe load is Sec-Fetch-Dest: iframe, which lib/crawler-guard.ts does not count as a page load.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex",
};

export async function GET(request: Request, { params }: { params: { parts?: string[] } }) {
  const parts = params.parts ?? [];
  const parsed = parseEmbedPath(parts);
  const fallbackTheme = parts[1]?.toLowerCase() === "dark" ? "dark" : "light";
  if (!parsed) {
    return new Response(renderWidgetNotFound(null, fallbackTheme, WIDGET_ORIGIN), {
      status: 404,
      headers: { ...HEADERS, "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  }

  // One address per widget (/embed/stock/nvda/DARK -> /embed/stock/NVDA/dark), so the cache holds one copy of each.
  const canonicalPath = widgetPath(parsed.symbol, parsed.theme);
  const url = new URL(request.url);
  if (url.pathname !== canonicalPath) {
    return new Response(null, {
      status: 308,
      headers: { Location: `${canonicalPath}${url.search}`, "Cache-Control": "public, max-age=3600, s-maxage=3600", "X-Robots-Tag": "noindex" },
    });
  }

  const loaded = await loadWidgetStock(parsed.symbol);
  if (loaded.kind === "unavailable") {
    return new Response("The stock widget is unavailable for a moment.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30", "X-Robots-Tag": "noindex" },
    });
  }
  if (loaded.kind === "missing") {
    return new Response(renderWidgetNotFound(parsed.symbol, parsed.theme, WIDGET_ORIGIN), {
      status: 404,
      headers: { ...HEADERS, "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  }
  return new Response(renderStockWidget(loaded.stock, parsed.theme, WIDGET_ORIGIN), {
    status: 200,
    headers: {
      ...HEADERS,
      "Cache-Control": loaded.partial ? "public, max-age=30, s-maxage=30" : "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
      Link: `<${WIDGET_ORIGIN}/stock/${encodeURIComponent(loaded.stock.symbol)}>; rel="canonical"`,
    },
  });
}
