import { NextResponse } from "next/server";

import { getEarningsDayReportCached, latestReportFor } from "@/lib/earnings-day";
import { cleanReportTicker, earningsDayHref, isReportDay } from "@/lib/earnings-day-shared";

/**
 * GET /api/earnings-day?ticker=QLYS[&date=2026-11-09]
 *
 * The earnings report for a stock: the given date, or the latest one. Public,
 * like the report page: it is built from the company's own filing and holds no
 * price levels. 404 when there is no report.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = cleanReportTicker(url.searchParams.get("ticker"));
  const date = url.searchParams.get("date");
  if (!ticker || (date !== null && !isReportDay(date))) {
    return NextResponse.json({ error: "Pass a ticker like ?ticker=AAPL, and optionally a date like &date=2026-11-09." }, { status: 400 });
  }
  const report = await (date ? getEarningsDayReportCached(ticker, date) : latestReportFor(ticker)).catch(() => null);
  if (!report) return NextResponse.json({ error: `No earnings report for ${ticker}${date ? ` on ${date}` : ""}.` }, { status: 404 });
  return NextResponse.json(
    { report, url: `https://www.stocksbrew.online${earningsDayHref(report.ticker, report.event_date)}` },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } },
  );
}
