import { NextResponse } from "next/server";

import { AgentDataError, getStockAgentIntelligence } from "@/lib/agent-intelligence";
import { getSessionUser } from "@/lib/auth-server";

export async function GET(_: Request, { params }: { params: { symbol: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(
      await getStockAgentIntelligence({ ticker: params.symbol, market: "US", uid: user.uid }),
    );
  } catch (error) {
    if (error instanceof AgentDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Could not load this stock" }, { status: 500 });
  }
}
