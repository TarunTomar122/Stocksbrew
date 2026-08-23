import { NextRequest, NextResponse } from "next/server";

import { getPowerTrades } from "@/lib/power-trades";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") || 30);

  const result = await getPowerTrades(Number.isFinite(days) ? days : 30);
  return NextResponse.json(result);
}
