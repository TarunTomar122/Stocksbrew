import { NextRequest, NextResponse } from "next/server";

import { AgentDataError, addAgentStockToRadar, createAgentAlert } from "@/lib/agent-intelligence";
import { cleanTickerList } from "@/lib/ask-cards";
import { getSessionUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * The only place Ask changes anything. The copilot proposes; this runs when
 * the signed-in person presses Confirm on the card. The uid always comes from
 * the session, never from the request body.
 */

type TickerOutcome = { ticker: string; ok: boolean; message: string };

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "sign_in_required", message: "Sign in to save this." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === "add_to_watchlist") {
    const tickers = cleanTickerList(body?.tickers, 12);
    if (tickers.length === 0) return NextResponse.json({ error: "bad_request", message: "No tickers to add." }, { status: 400 });
    const results: TickerOutcome[] = [];
    // One at a time: each add is a transaction on the same user document.
    for (const ticker of tickers) {
      try {
        const added = await addAgentStockToRadar(session.uid, { ticker, market: "US", positionType: "watchlist" });
        results.push({ ticker, ok: true, message: added.already_tracked ? "Already in your stocks" : "Added to your watchlist" });
      } catch (error) {
        results.push({ ticker, ok: false, message: error instanceof AgentDataError ? error.message : "Could not add this one" });
      }
    }
    const added = results.filter((row) => row.ok).length;
    return NextResponse.json({ ok: added > 0, action, results }, { status: added > 0 ? 200 : 422 });
  }

  if (action === "create_price_alert") {
    const [ticker] = cleanTickerList([body?.ticker], 1);
    const condition = body?.condition === "above" ? "above" : body?.condition === "below" ? "below" : null;
    const target = Number(body?.target_price);
    if (!ticker || !condition || !Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: "bad_request", message: "An alert needs a ticker, above or below, and a price." }, { status: 400 });
    }
    try {
      await createAgentAlert(session.uid, { ticker, market: "US", kind: "price_threshold", condition, targetPrice: target });
      const results: TickerOutcome[] = [{ ticker, ok: true, message: `Alert set: email me when ${ticker} is ${condition} $${target.toFixed(2)}` }];
      return NextResponse.json({ ok: true, action, results });
    } catch (error) {
      const message = error instanceof AgentDataError ? error.message : "Could not set the alert";
      const status = error instanceof AgentDataError ? error.status : 500;
      if (!(error instanceof AgentDataError)) console.error("ask_action_failed", error);
      return NextResponse.json({ ok: false, action, results: [{ ticker, ok: false, message }] }, { status });
    }
  }

  return NextResponse.json({ error: "bad_request", message: "Unknown action." }, { status: 400 });
}
