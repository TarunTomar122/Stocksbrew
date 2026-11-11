import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { researchStore } from "@/lib/research/store";
import { cleanTicker, isReportKey, isStale, reportHref, sharedHref } from "@/lib/research/types";

/**
 * One saved report, for its owner.
 *
 * GET ?ticker=NVDA&key=20261110T153012Z: where a run is (the page polls this
 * when it was opened while a report was still being written).
 * PATCH { ticker, key, share }: turn the public link on or off.
 */

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return json(401, { code: "sign_in" });
  const ticker = cleanTicker(req.nextUrl.searchParams.get("ticker"));
  const key = req.nextUrl.searchParams.get("key");
  if (!ticker || !isReportKey(key)) return json(400, { code: "bad_request" });
  const report = await researchStore.get(session.uid, ticker, key).catch(() => null);
  if (!report) return json(404, { code: "not_found" });
  return json(200, {
    status: isStale(report) ? "failed" : report.status,
    steps: report.steps,
    href: reportHref(ticker, key),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return json(401, { code: "sign_in" });
  const body = (await req.json().catch(() => null)) as { ticker?: unknown; key?: unknown; share?: unknown } | null;
  const ticker = cleanTicker(body?.ticker);
  if (!ticker || !isReportKey(body?.key) || typeof body?.share !== "boolean") return json(400, { code: "bad_request" });
  try {
    const shareId = await researchStore.setShare(session.uid, ticker, body.key, body.share);
    return json(200, { share_id: shareId, href: shareId ? sharedHref(ticker, shareId) : null });
  } catch (error) {
    if (error instanceof Error && error.message === "research_not_found") return json(404, { code: "not_found" });
    console.error("research_share_failed", error);
    return json(500, { code: "failed", message: "The link could not be changed just now. Try again." });
  }
}
