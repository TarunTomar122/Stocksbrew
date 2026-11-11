import { NextRequest, NextResponse } from "next/server";

import { clientAddress, createIpRateLimiter } from "@/lib/ip-rate-limit";
import { getTasteCard } from "@/lib/landing-taste";
import { parseTasteTickers, TASTE_RATE_LIMITED, type TasteCard } from "@/lib/landing-taste-shared";

/** 30 lookups a minute per visitor, per server instance: plenty for someone typing, not for a scraper. */
const takeLookup = createIpRateLimiter({ limit: 30, windowMs: 60_000 });

/**
 * GET /api/taste?t=NVDA,JPM,KO: the landing page's taste (lib/landing-taste.ts). Public and the same for everyone:
 * the call, today's move and the call's first reason with its source, never price levels. At most three tickers.
 */
export async function GET(req: NextRequest) {
  const allowed = takeLookup(clientAddress(req.headers));
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: TASTE_RATE_LIMITED },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(allowed.retryAfterSec) } },
    );
  }
  const tickers = parseTasteTickers(req.nextUrl.searchParams.get("t"));
  if (tickers.length === 0) return NextResponse.json({ error: "no_ticker" }, { status: 400 });

  let failed = false;
  const cards = await Promise.all(
    tickers.map((ticker) =>
      getTasteCard(ticker).catch(() => {
        failed = true;
        return null;
      }),
    ),
  );
  const found = cards.filter((card): card is TasteCard => card !== null);
  // Tickers we have no stock for, so the page can say so (a read that failed is not one of them).
  const missing = failed ? [] : tickers.filter((ticker) => !found.some((card) => card.ticker.toUpperCase() === ticker));
  if (failed && found.length === 0) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  return NextResponse.json(
    { cards: found, missing },
    // The same answer for everyone; a failed read is never kept at the edge.
    { headers: { "Cache-Control": failed ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
