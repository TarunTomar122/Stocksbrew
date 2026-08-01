import { NextResponse } from "next/server";

import { getMarketDailyEditionCover } from "@/lib/market-daily-cover";
import { getMarketDailyEdition } from "@/lib/market-daily";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { date: string } }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return new NextResponse(null, { status: 404 });
  }

  const edition = await getMarketDailyEdition(params.date).catch(() => null);
  if (!edition) return new NextResponse(null, { status: 404 });

  const image = await getMarketDailyEditionCover(edition);
  if (!image) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(image.url, 307);
  response.headers.set("Cache-Control", "public, max-age=86400, s-maxage=7776000, stale-while-revalidate=86400");
  return response;
}
