import { NextResponse } from "next/server";

import { filterSearchEntries, getSearchIndexForApi } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const marketParam = String(searchParams.get("market") || "US").toUpperCase();
    const market = marketParam === "IN" ? "IN" : "US";
    const query = String(searchParams.get("q") || "").trim();
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
    const entries = await getSearchIndexForApi(market).catch(() => []);
    if (query) {
      return NextResponse.json({
        market,
        entries: filterSearchEntries(entries, query, limit),
        partial: true,
      });
    }
    return NextResponse.json({ market, entries });
  } catch {
    return NextResponse.json({ market: "US", entries: [] }, { status: 200 });
  }
}

