import { NextRequest, NextResponse } from "next/server";

import {
  assertTikrrApiKey,
  normalizeRunType,
  normalizeSectorId,
  saveSectorLatestAndHistory,
} from "@/lib/tikrr-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      apiKey?: string;
      sectorId?: string;
      data?: Record<string, unknown>;
    };

    assertTikrrApiKey(body.apiKey);
    const sectorId = normalizeSectorId(body.sectorId);
    const data = body.data || {};
    const runType = normalizeRunType(data.runType);

    await saveSectorLatestAndHistory({
      sectorId,
      runType,
      data,
    });

    return NextResponse.json({ success: true, sectorId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = message === "Invalid apiKey" ? 401 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
