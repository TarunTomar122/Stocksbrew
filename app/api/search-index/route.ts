import { NextResponse } from "next/server";

import { getSearchIndex } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const marketParam = String(searchParams.get("market") || "US").toUpperCase();
    const market = marketParam === "IN" ? "IN" : "US";
    const entries = await getSearchIndex(market).catch(() => []);
    return NextResponse.json({ market, entries });
  } catch {
    return NextResponse.json({ market: "US", entries: [] }, { status: 200 });
  }
}

