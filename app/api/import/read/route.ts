import { NextRequest, NextResponse } from "next/server";

import { loadReadFacts, MAX_READ_STOCKS } from "@/lib/import/read";
import { findTicker } from "@/lib/import/resolve";
import { getImportDirectory } from "@/lib/import/server";

/**
 * POST /api/import/read: tickers in, what we think of each one out (the call,
 * a one-line reason with levels removed, sector, today's move, next
 * earnings). Open to everyone and read-only: it writes nothing and does not
 * look at who is asking. Share counts never come here; the browser weights
 * the mix itself.
 *
 * Body: { tickers: string[] } (up to 40).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tickers?: unknown } | null;
  const raw = Array.isArray(body?.tickers) ? body!.tickers : null;
  if (!raw || raw.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (raw.length > MAX_READ_STOCKS) return NextResponse.json({ error: "too_many", max: MAX_READ_STOCKS }, { status: 400 });
  const directory = await getImportDirectory();
  if (directory.byTicker.size === 0) return NextResponse.json({ error: "directory_unavailable" }, { status: 503 });
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length > 12) continue;
    const entry = findTicker(directory, item);
    if (entry) ids.push(entry.instrument_id);
    else unknown.push(item.trim().toUpperCase().slice(0, 12));
  }
  const facts = await loadReadFacts(ids, directory);
  return NextResponse.json({ ...facts, unknown }, { headers: { "Cache-Control": "no-store" } });
}
