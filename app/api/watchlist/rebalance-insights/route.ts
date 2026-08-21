import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { buildPortfolioBook, type PortfolioBookRow } from "@/lib/portfolio-book";
import { deriveResearchMix, type MixWeights, sanitizeMixWeights } from "@/lib/portfolio-mix";
import { llmApiKey, llmApiUrl, llmHeaders, llmModel } from "@/lib/server-llm";
import { loadRadarRowsForUser } from "@/lib/radar-rows";

export const runtime = "nodejs";

type Move = {
  instrument_id: string;
  reason: string;
};

type InsightResponse = {
  distribution: MixWeights;
  current_score: number | null;
  projected_score: number | null;
  to_holdings: Move[];
  to_watchlist: Move[];
};

function score(row: PortfolioBookRow): number {
  return typeof row.scores.overall === "number" ? row.scores.overall : 50;
}

function stance(row: PortfolioBookRow): string {
  return row.directive_v2?.stance ?? row.ai_directive?.stance ?? row.scores.verdict ?? "watch";
}

function fallbackReason(row: PortfolioBookRow, direction: "holdings" | "watchlist"): string {
  const call = row.directive_v2?.action?.summary || row.ai_directive?.action?.summary || row.directive_v2?.rationale || row.ai_directive?.rationale;
  if (typeof call === "string" && call.trim()) return call.trim();
  const value = Math.round(score(row));
  return direction === "holdings"
    ? `Score ${value} and a ${stance(row)} call make this a stronger candidate to own.`
    : `Score ${value} and a ${stance(row)} call make this a weaker fit for the core holdings.`;
}

function candidateContext(rows: PortfolioBookRow[]) {
  return rows.map((row) => ({
    instrument_id: row.instrument_id,
    ticker: row.ticker,
    name: row.name,
    sector: row.sector_label,
    score: row.scores.overall,
    valuation: row.scores.valuation,
    growth: row.scores.growth,
    quality: row.scores.quality,
    momentum: row.scores.momentum,
    call: stance(row),
    price: row.price,
    day_change_pct: row.day_change_pct,
    target_upside_pct: row.target_upside_pct,
    rationale:
      row.directive_v2?.rationale || row.ai_directive?.rationale || row.directive_v2?.action?.summary || row.ai_directive?.action?.summary || null,
  }));
}

function portfolioScore(rows: PortfolioBookRow[]): number | null {
  if (!rows.length) return null;
  return Math.round((rows.reduce((sum, row) => sum + score(row), 0) / rows.length) * 10) / 10;
}

function scoreSummary(holdings: PortfolioBookRow[], watchlist: PortfolioBookRow[], toHoldings: Move[], toWatchlist: Move[]) {
  const watchlistIds = new Set(toHoldings.map((move) => move.instrument_id));
  const holdingIds = new Set(toWatchlist.map((move) => move.instrument_id));
  const projected = [
    ...holdings.filter((row) => !holdingIds.has(row.instrument_id)),
    ...watchlist.filter((row) => watchlistIds.has(row.instrument_id)),
  ];
  return { current_score: portfolioScore(holdings), projected_score: projected.length ? portfolioScore(projected) : portfolioScore(holdings) };
}

function validDistribution(rows: PortfolioBookRow[], input: unknown): MixWeights {
  const fallback = deriveResearchMix(rows).weights;
  const clean = sanitizeMixWeights(rows, input);
  if (!rows.length || Object.values(clean).reduce((sum, value) => sum + value, 0) !== 100) return fallback;
  return clean;
}

function parseMoves(content: string): InsightResponse | null {
  try {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<InsightResponse>;
    const read = (value: unknown): Move[] =>
      Array.isArray(value)
        ? value
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
            .map((item) => ({ instrument_id: String(item.instrument_id || ""), reason: String(item.reason || "") }))
            .filter((item) => item.instrument_id && item.reason)
        : [];
    return {
      distribution: parsed.distribution ?? {},
      current_score: null,
      projected_score: null,
      to_holdings: read(parsed.to_holdings),
      to_watchlist: read(parsed.to_watchlist),
    };
  } catch {
    return null;
  }
}

async function generateInsights(holdings: PortfolioBookRow[], watchlist: PortfolioBookRow[]): Promise<InsightResponse> {
  const fallback = (): InsightResponse => ({
    distribution: deriveResearchMix(holdings).weights,
    to_holdings: watchlist
      .filter((row) => score(row) >= 75 || stance(row) === "accumulate")
      .sort((a, b) => score(b) - score(a))
      .slice(0, 5)
      .map((row) => ({ instrument_id: row.instrument_id, reason: fallbackReason(row, "holdings") })),
    to_watchlist: holdings
      .filter((row) => score(row) <= 55 || stance(row) === "trim" || stance(row) === "avoid")
      .sort((a, b) => score(a) - score(b))
      .slice(0, 5)
      .map((row) => ({ instrument_id: row.instrument_id, reason: fallbackReason(row, "watchlist") })),
    ...scoreSummary(
      holdings,
      watchlist,
      watchlist
        .filter((row) => score(row) >= 75 || stance(row) === "accumulate")
        .sort((a, b) => score(b) - score(a))
        .slice(0, 5)
        .map((row) => ({ instrument_id: row.instrument_id, reason: fallbackReason(row, "holdings") })),
      holdings
        .filter((row) => score(row) <= 55 || stance(row) === "trim" || stance(row) === "avoid")
        .sort((a, b) => score(a) - score(b))
        .slice(0, 5)
        .map((row) => ({ instrument_id: row.instrument_id, reason: fallbackReason(row, "watchlist") })),
    ),
  });

  const apiKey = llmApiKey();
  if (!apiKey || (!holdings.length && !watchlist.length)) return fallback();

  const prompt = `You are the portfolio research assistant for StocksBrew. Decide only two things for this user's tracked stocks:
1. Which watchlist names are worth moving into holdings.
2. Which holdings are worth moving back to the watchlist.

Return JSON only in this exact shape: {"distribution":{"holding-id":25},"to_holdings":[{"instrument_id":"...","reason":"..."}],"to_watchlist":[{"instrument_id":"...","reason":"..."}]}

Rules:
- Distribution must include only holdings, include every holding, use integer percentages, and sum exactly to 100.
- Use only the supplied instrument_id values and never invent a stock.
- Return at most 5 per list. Return an empty list when there is no clear move.
- Reasons must be one plain sentence of 12 to 24 words, based only on the supplied scores, call, price move, or rationale.
- Explain the portfolio consequence, not what a metric means. Avoid trade commands, certainty, hype, and financial advice.
- Do not put the same stock in both lists.

HOLDINGS:
${JSON.stringify(candidateContext(holdings))}

WATCHLIST:
${JSON.stringify(candidateContext(watchlist))}`;

  try {
    const response = await fetch(llmApiUrl(), {
      method: "POST",
      headers: llmHeaders(apiKey),
      body: JSON.stringify({
        model: llmModel(),
        reasoning_effort: "low",
        max_completion_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return concise, grounded portfolio research. Output JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return fallback();
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallback();
    const parsed = parseMoves(content);
    if (!parsed) return fallback();

    const holdingIds = new Set(holdings.map((row) => row.instrument_id));
    const watchlistIds = new Set(watchlist.map((row) => row.instrument_id));
    const toHoldings = parsed.to_holdings
      .filter((move) => watchlistIds.has(move.instrument_id))
      .slice(0, 5);
    const selected = new Set(toHoldings.map((move) => move.instrument_id));
    return {
      distribution: validDistribution(holdings, parsed.distribution),
      ...scoreSummary(holdings, watchlist, toHoldings, parsed.to_watchlist
        .filter((move) => holdingIds.has(move.instrument_id) && !selected.has(move.instrument_id))
        .slice(0, 5)),
      to_holdings: toHoldings,
      to_watchlist: parsed.to_watchlist
        .filter((move) => holdingIds.has(move.instrument_id) && !selected.has(move.instrument_id))
        .slice(0, 5),
    };
  } catch {
    return fallback();
  }
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const payload = await loadRadarRowsForUser(session.uid);
  const book = buildPortfolioBook(payload?.rows ?? []);
  const result = await generateInsights(
    book.filter((row) => row.position_type === "holding"),
    book.filter((row) => row.position_type === "watchlist"),
  );
  return NextResponse.json(result);
}
