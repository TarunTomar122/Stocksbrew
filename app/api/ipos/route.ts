import { NextRequest, NextResponse } from "next/server";
import { getIpos } from "@/lib/ipos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start_date") || undefined;
  const endDate = searchParams.get("end_date") || undefined;

  const events = await getIpos(startDate, endDate);
  return NextResponse.json({ count: events.length, events });
}
