import { NextRequest, NextResponse } from "next/server";

import {
  assertTikrrApiKey,
  normalizeMarket,
  normalizeRunType,
  saveMarketLatestAndHistory,
} from "@/lib/tikrr-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      apiKey?: string;
      market?: string;
      data?: Record<string, unknown>;
    };

    assertTikrrApiKey(body.apiKey);
    const market = normalizeMarket(body.market);
    const data = body.data || {};
    const runType = normalizeRunType(data.runType);

    await saveMarketLatestAndHistory({
      market,
      runType,
      data,
    });

    return NextResponse.json({ success: true, market });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = message === "Invalid apiKey" ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
