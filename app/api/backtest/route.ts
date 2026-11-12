import { NextRequest, NextResponse } from "next/server";

import { runGatedBacktest } from "@/lib/backtest/gated";
import { holdingQuotes, setupSymbols, withQuotes } from "@/lib/backtest/quotes";
import { parseSetup } from "@/lib/backtest/setup";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  invalid_input: 400,
  missing_history: 422,
  not_enough_history: 422,
  unavailable: 503,
  limit_reached: 429,
};

/**
 * POST { holdings: [{symbol, weight}], start?, end?, rebalance?, benchmark?, cost_bps? }
 * Open to everyone and read-only apart from the usage counter. The viewer's
 * plan sets how far back a run may look and how many distinct setups run in a
 * day (lib/entitlements.ts: `backtest`, `backtest_history`).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_input", message: "Send the setup as JSON." } }, { status: 400 });
  }
  // Today's prices for the holding cards load beside the run, never after it.
  const [ran, quotes] = await Promise.all([runGatedBacktest(body), holdingQuotes(setupSymbols(body))]);
  const response = withQuotes(ran, quotes);
  return NextResponse.json(response, { status: response.ok ? 200 : STATUS[response.error.code] ?? 400 });
}

/** GET /api/backtest?t=AAPL:50,MSFT:50&from=2018-01-02&rb=quarterly: the same setup a shared link carries. */
export async function GET(req: NextRequest) {
  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  const setup = parseSetup(query);
  const [ran, quotes] = await Promise.all([runGatedBacktest(setup), holdingQuotes(setupSymbols(setup))]);
  const response = withQuotes(ran, quotes);
  return NextResponse.json(response, { status: response.ok ? 200 : STATUS[response.error.code] ?? 400 });
}
