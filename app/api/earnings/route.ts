import { NextRequest, NextResponse } from "next/server";
import { getEarnings, type EarningsEvent } from "@/lib/earnings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") || "US";
  const startDate = searchParams.get("start_date") || undefined;
  const endDate = searchParams.get("end_date") || undefined;

  const events = await getEarnings(market, startDate, endDate);
  return NextResponse.json({ count: events.length, events });
}
