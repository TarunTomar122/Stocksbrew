import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { buildPortfolioBook } from "@/lib/portfolio-book";
import { buildRebalancePlan } from "@/lib/portfolio-organize-server";
import { loadRadarRowsForUser } from "@/lib/radar-rows";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  let forceRefresh = url.searchParams.get("refresh") === "1";
  let strategyId = url.searchParams.get("strategy") || "balanced";
  if (!forceRefresh) {
    try {
      const body = await req.json();
      forceRefresh = body?.refresh === true;
      if (typeof body?.strategy === "string" && body.strategy.trim()) {
        strategyId = body.strategy.trim();
      }
    } catch {
      // empty body is fine
    }
  }

  const payload = await loadRadarRowsForUser(session.uid);
  const book = buildPortfolioBook(payload?.rows ?? []);
  const plan = await buildRebalancePlan(session.uid, book, { forceRefresh, strategyId });

  return NextResponse.json(plan);
}
