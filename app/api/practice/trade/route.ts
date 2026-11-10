import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { placePracticeOrder } from "@/lib/practice-store";

export const dynamic = "force-dynamic";

/**
 * POST { symbol, side: "buy" | "sell", shares? | dollars? }
 * Paper money only. Fills at the latest stored daily close and writes to the
 * signed-in user's own practice account.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false, code: "unauthenticated", message: "Sign in to use a practice account." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, code: "invalid", message: "Send the order as JSON." }, { status: 400 });
  const side = body.side === "sell" ? "sell" : body.side === "buy" ? "buy" : null;
  if (!side || typeof body.symbol !== "string") {
    return NextResponse.json({ ok: false, code: "invalid", message: "Choose a ticker and buy or sell." }, { status: 400 });
  }
  const response = await placePracticeOrder(session.uid, {
    side,
    symbol: body.symbol,
    shares: typeof body.shares === "number" ? body.shares : undefined,
    dollars: typeof body.dollars === "number" ? body.dollars : undefined,
  });
  return NextResponse.json(response, { status: response.ok ? 200 : response.code === "unavailable" ? 503 : 422 });
}
