import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";

import {
  blogPostCard,
  compareCard,
  docsGuideCard,
  docsSectionCard,
  followProfileCard,
  legalCard,
  marketAssetCard,
  marketClassCard,
  notFoundCard,
  pageCard,
  stockCard,
  strategyCard,
  themeCard,
  versusCard,
} from "@/lib/og/data";
import { renderOgCard } from "@/lib/og/render";
import type { OgCard } from "@/lib/og/types";
import { isOgPageKey } from "@/lib/og/url";

/**
 * Share cards by path. See `lib/og/url.ts` for the address scheme: every
 * segment names something we look up, never text we draw as given.
 *
 *   /api/og/stock/NVDA            /api/og/compare/NVDA,AMD
 *   /api/og/follow/<slug>         /api/og/strategy/<slug>     /api/og/theme/<slug>
 *   /api/og/market/<class>        /api/og/market/<class>/<id>
 *   /api/og/docs/<section>[/<slug>]   /api/og/blog/<slug>
 *   /api/og/versus/<slug>         /api/og/legal/<slug>
 *   /api/og/page/<key>            (briefing, markets, signals, pricing, ...)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { card: string[] } };

const SLUG = /^[a-z0-9][a-z0-9-]{0,100}$/i;

function seg(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

async function resolve(parts: string[]): Promise<OgCard | null> {
  const [family, a, b] = [seg(parts[0]).toLowerCase(), seg(parts[1]), seg(parts[2])];
  switch (family) {
    case "stock":
      return a ? stockCard(a) : null;
    case "compare":
      return a ? compareCard(a) : null;
    case "follow":
      return SLUG.test(a) ? followProfileCard(a.toLowerCase()) : null;
    case "strategy":
      return SLUG.test(a) ? strategyCard(a.toLowerCase()) : null;
    case "theme":
      return SLUG.test(a) ? themeCard(a.toLowerCase()) : null;
    case "market":
      if (!SLUG.test(a)) return null;
      return b ? marketAssetCard(a, b.slice(0, 40)) : marketClassCard(a);
    case "docs":
      if (!a) return pageCard("docs");
      if (!SLUG.test(a)) return null;
      return b && SLUG.test(b) ? docsGuideCard(a, b) : docsSectionCard(a);
    case "blog":
      if (!a) return pageCard("blog");
      return SLUG.test(a) ? blogPostCard(a) : null;
    case "versus":
      return SLUG.test(a) ? versusCard(a.toLowerCase()) : null;
    case "legal":
      return SLUG.test(a) ? legalCard(a.toLowerCase()) : null;
    case "page":
      return isOgPageKey(a) ? pageCard(a) : null;
    default:
      return null;
  }
}

/**
 * The built spec, shared for five minutes. Some sources are big documents
 * that the data cache cannot hold (a strategy with its full backtest), so the
 * small spec is what gets cached, keyed by the card's path.
 */
const resolveCached = unstable_cache(async (key: string) => resolve(key.split("/")), ["og-card-spec-v5"], { revalidate: 300 });

export async function GET(request: NextRequest, { params }: Params) {
  const parts = (params.card ?? []).slice(0, 4);
  let card: OgCard | null = null;
  try {
    card = await resolveCached(parts.map(seg).join("/"));
  } catch (error) {
    console.error("og: card failed", parts.join("/"), error);
  }
  // Dev only: the spec as JSON, to check the words and numbers without decoding a PNG.
  if (process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("format") === "json") {
    return Response.json(card ? { ...card, logo: undefined, row: undefined } : null);
  }
  try {
    // Something we could not find still gets a real card (the home card), so a
    // share never shows a broken image; it is cached briefly in case it appears.
    if (!card) return await renderOgCard(notFoundCard(), { cacheControl: "public, max-age=300, s-maxage=600" });
    return await renderOgCard(card);
  } catch (error) {
    console.error("og: render failed", parts.join("/"), error);
    return new Response("Could not draw this card", { status: 500, headers: { "cache-control": "no-store" } });
  }
}

