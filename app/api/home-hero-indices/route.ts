import { NextResponse } from "next/server";

import { getHeroIndices } from "@/lib/hero-indices";
import { getCurrentMarket } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const market = getCurrentMarket();
    const indices = await getHeroIndices(market);
    return NextResponse.json({ market, indices });
  } catch {
    return NextResponse.json({ market: "US", indices: [] });
  }
}
