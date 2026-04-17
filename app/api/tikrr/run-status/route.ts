import { NextRequest, NextResponse } from "next/server";

import {
  assertTikrrApiKey,
  normalizeMarket,
  normalizeRunType,
  saveMaterializedDashboardView,
  saveRunStatus,
} from "@/lib/tikrr-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      apiKey?: string;
      market?: string;
      status?: string;
      runType?: string;
      startedAt?: string;
      completedAt?: string;
      stocksUpdated?: number;
      sectorsUpdated?: number;
      marketsUpdated?: number;
      errors?: unknown[];
    };

    assertTikrrApiKey(body.apiKey);
    const market = normalizeMarket(body.market);
    const runType = normalizeRunType(body.runType);

    await saveRunStatus({
      market,
      runType,
      payload: {
        status: String(body.status || ""),
        startedAt: body.startedAt || null,
        completedAt: body.completedAt || null,
        stocksUpdated: Number(body.stocksUpdated || 0),
        sectorsUpdated: Number(body.sectorsUpdated || 0),
        marketsUpdated: Number(body.marketsUpdated || 0),
        errors: Array.isArray(body.errors) ? body.errors : [],
      },
    });

    if (String(body.status || "").toLowerCase() === "completed") {
      await saveMaterializedDashboardView(market);
    }

    return NextResponse.json({ success: true, market, runType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = message === "Invalid apiKey" ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
