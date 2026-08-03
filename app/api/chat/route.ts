import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { tavily } from "@tavily/core";
import { getUserDoc } from "@/lib/watchlist";
import { getWatchlistView, type WatchlistRow } from "@/lib/watchlist-view";
import { getInstrumentLabels, resolveInstrumentByTicker } from "@/lib/instrument-resolver";
import { getStockIntelligenceDoc, getStockIntelPro } from "@/lib/stock";
import { llmApiKey, llmApiUrl, llmModel } from "@/lib/server-llm";

export const maxDuration = 60;

const TAVILY_TIMEOUT_MS = 12_000;

const chatProvider = createOpenAI({
  baseURL: llmApiUrl().replace(/\/chat\/completions$/, ""),
  apiKey: llmApiKey(),
});

async function getSessionUser(req: NextRequest) {
  try {
    const cookie = req.cookies.get("tikrr_session")?.value;
    if (!cookie) return null;
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    return decoded;
  } catch {
    return null;
  }
}

async function resolveInstrumentId(ticker: string, market: "US" | "IN"): Promise<string> {
  const normalized = ticker.trim().toUpperCase();
  if (normalized.startsWith("US_") || normalized.startsWith("IN_")) {
    return normalized;
  }
  const match = await resolveInstrumentByTicker(normalized, market).catch(() => null);
  return match?.instrument_id ?? `${market}_${normalized}`;
}

type ChatToolBudget = {
  web_search: number;
  get_stock_intelligence: number;
};

const TOOL_LIMITS: ChatToolBudget = {
  web_search: 1,
  get_stock_intelligence: 1,
};

function countToolCalls(steps: Array<{ toolResults: Array<{ toolName: string }> }>): ChatToolBudget {
  const counts: ChatToolBudget = { web_search: 0, get_stock_intelligence: 0 };
  for (const step of steps) {
    for (const result of step.toolResults) {
      if (result.toolName === "web_search") counts.web_search += 1;
      if (result.toolName === "get_stock_intelligence") counts.get_stock_intelligence += 1;
    }
  }
  return counts;
}

type SpilloverRow = { ticker: string; sector_label?: string; industry_label?: string };

function flattenMessageText(message: UIMessage | undefined): string {
  if (!message?.parts) return "";
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function extractLastSuggestedAddTicker(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const text = flattenMessageText(message).toUpperCase();
    if (!text) continue;
    const addMatch = text.match(/\bADD\s+([A-Z]{1,6})\b/);
    if (addMatch?.[1]) return addMatch[1];
    const boldMatch = text.match(/\*\*ADD\s+([A-Z]{1,6})\*\*/);
    if (boldMatch?.[1]) return boldMatch[1];
  }
  return null;
}

function shouldForceWebSearch(latestUserText: string): boolean {
  const text = latestUserText.toLowerCase();
  if (!text) return false;
  return /news|research|sentiment|latest|happening|headlines|today|web|search/.test(text);
}

type ChatIntent =
  | "market_ideas"
  | "sentiment_research"
  | "single_ticker_news"
  | "portfolio_action"
  | "follow_up_explain";

function detectIntent(latestUserText: string): ChatIntent {
  const text = latestUserText.toLowerCase();
  if (/ignore my radar|stocks to buy|5 suggestions|top picks|market ideas/.test(text)) {
    return "market_ideas";
  }
  if (/sentiment|research|news based|latest news|headlines|what's happening/.test(text)) {
    return "sentiment_research";
  }
  if (/buy|add|trim|sell|hold|should i|can i buy/.test(text)) {
    return "portfolio_action";
  }
  if (/why|how|grow|thesis|explain/.test(text)) {
    return "follow_up_explain";
  }
  return "single_ticker_news";
}

function extractTickerFromText(text: string, trackedTickers: string[], fallbackTicker: string | null): string | null {
  const upper = text.toUpperCase();
  const direct = upper.match(/\b[A-Z]{2,6}\b/g) || [];
  for (const token of direct) {
    if (trackedTickers.includes(token)) return token;
  }
  if (direct.length > 0) return direct[0] || null;
  if (/\bit\b|\bthat stock\b|\bthis one\b/i.test(text) && fallbackTicker) return fallbackTicker;
  return fallbackTicker;
}

const NVDA_CHIP_HIGH = new Set([
  "NVDA", "AMD", "MU", "AVGO", "TSM", "INTC", "MRVL", "QCOM", "ASML", "ARM",
  "ON", "LRCX", "KLAC", "AMAT", "SMCI", "MCHP", "TXN",
]);

const AI_CAPEX_MEDIUM = new Set([
  "MSFT", "GOOGL", "GOOG", "AMZN", "META", "ORCL", "CRM", "PLTR", "SNOW", "NOW",
]);

function tierNvdaSpillover(row: SpilloverRow): "high" | "medium" | "low" {
  const ticker = row.ticker.toUpperCase();
  const industry = (row.industry_label || "").toLowerCase();
  if (NVDA_CHIP_HIGH.has(ticker)) return "high";
  if (/semiconductor|chip|memory|foundry|wafer|equipment/.test(industry)) return "high";
  if (AI_CAPEX_MEDIUM.has(ticker)) return "medium";
  if (/software|internet|cloud|platform|search|advertising/.test(industry)) return "medium";
  if (row.sector_label === "Communication Services") return "medium";
  if (row.sector_label === "Technology") return "low";
  return "low";
}

function buildNvdaImpactMap(rows: SpilloverRow[]) {
  const tiers: Record<"high" | "medium" | "low", string[]> = { high: [], medium: [], low: [] };
  for (const row of rows) {
    tiers[tierNvdaSpillover(row)].push(row.ticker);
  }
  for (const key of Object.keys(tiers) as Array<keyof typeof tiers>) {
    tiers[key].sort();
  }
  return tiers;
}

function compactRowsForPrompt(
  rows: Array<{
    ticker: string;
    position_type: string;
    sector_label?: string;
    price: number | null;
    day_change_pct: number | null;
    scores: { overall: number | null } | null;
    ai_directive?: { stance?: string; text?: string; trigger?: string };
    directive_v2?: { title?: string; priority?: string; trigger?: string; holding_status?: string };
    brief_tile?: { micro?: string };
    holding?: {
      quantity?: number | null;
      market_value?: number | null;
      computed_market_value?: number | null;
      portfolio_weight_pct?: number | null;
      average_cost?: number | null;
      unrealized_gain_pct?: number | null;
      source?: string;
    };
  }>,
) {
  return rows.map((r) => ({
    t: r.ticker,
    pos: r.position_type === "holding" ? "H" : "W",
    sector: r.sector_label || undefined,
    px: r.price,
    chg: r.day_change_pct,
    score: r.scores?.overall,
    stance: r.ai_directive?.stance,
    directive: r.ai_directive?.text?.slice(0, 120),
    trigger: r.ai_directive?.trigger,
    micro: r.brief_tile?.micro?.slice(0, 80),
    d2: r.directive_v2
      ? {
          t: r.directive_v2.title?.slice(0, 80),
          p: r.directive_v2.priority,
          tr: r.directive_v2.trigger,
          hs: r.directive_v2.holding_status,
        }
      : undefined,
    holding: r.holding
      ? {
          q: r.holding.quantity ?? null,
          mv: r.holding.market_value ?? null,
          cmv: r.holding.computed_market_value ?? null,
          w: r.holding.portfolio_weight_pct ?? null,
          ac: r.holding.average_cost ?? null,
          ug: r.holding.unrealized_gain_pct ?? null,
          src: r.holding.source ?? null,
        }
      : undefined,
  }));
}

async function tavilySearch(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { error: "TAVILY_API_KEY is not configured." };
  }
  const tvly = tavily({ apiKey });
  const searchPromise = tvly
    .search(query, {
      searchDepth: "basic",
      includeImages: false,
      includeAnswer: false,
      maxResults: 3,
    })
    .then((response) =>
      response.results.map((r) => ({
        title: r.title,
        content: r.content,
        url: r.url,
      })),
    );
  const timeoutPromise = new Promise<{ error: string }>((resolve) => {
    setTimeout(
      () => resolve({ error: "Search timed out. Answer from radar Pulse and rows." }),
      TAVILY_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([searchPromise, timeoutPromise]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return { error: msg };
  }
}

function extractAddCandidates(portfolio: unknown, tracked: Set<string>) {
  if (!portfolio || typeof portfolio !== "object") return [];
  const suggestions = (portfolio as Record<string, unknown>).suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      ticker: String(item.ticker || "").toUpperCase(),
      market: item.market,
      why: String(item.why || item.headline || "").trim(),
      overall_score: item.overall_score,
    }))
    .filter((item) => item.ticker && !tracked.has(item.ticker))
    .slice(0, 6);
}

async function buildRadarContext(uid: string) {
  const userDoc = await getUserDoc(uid);
  const watchlistView = await getWatchlistView(uid).catch(() => null);

  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const watchlistPositions =
    userDoc?.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? userDoc.watchlist_positions
      : {};
  const watchlistHoldings =
    userDoc?.watchlist_holdings && typeof userDoc.watchlist_holdings === "object"
      ? userDoc.watchlist_holdings
      : {};
  const radar = userDoc?.radar_v1 || {};
  const materializedRows = (watchlistView?.rows || radar.rows || []) as WatchlistRow[];

  const trackedSet = new Set(tracked);
  const materializedById = new Map(
    materializedRows
      .filter((row) => trackedSet.has(row.instrument_id))
      .map((row) => [row.instrument_id, row] as const),
  );

  const needsSearchFallback = tracked.some((id) => !materializedById.has(id));
  const instrumentLabels = needsSearchFallback
    ? await getInstrumentLabels(tracked.filter((id) => !materializedById.has(id))).catch(() => new Map())
    : new Map<string, { ticker: string; name: string }>();

  const rows = tracked.map((instrumentId) => {
    const materialized = materializedById.get(instrumentId);
    if (materialized) {
      return {
        ...materialized,
        position_type:
          watchlistPositions[instrumentId] === "holding" ? ("holding" as const) : ("watchlist" as const),
        holding:
          watchlistPositions[instrumentId] === "holding"
            ? (materialized.holding ??
              ((watchlistHoldings[instrumentId] as Record<string, unknown> | undefined) || undefined))
            : undefined,
      };
    }
    const fallback = instrumentLabels.get(instrumentId);
    const ticker = fallback?.ticker || instrumentId.split("_").slice(1).join("_");
    const market = instrumentId.startsWith("IN_") ? ("IN" as const) : ("US" as const);
    return {
      instrument_id: instrumentId,
      ticker,
      position_type:
        watchlistPositions[instrumentId] === "holding" ? ("holding" as const) : ("watchlist" as const),
      market,
      sector_label: "",
      industry_label: "",
      price: null,
      day_change_pct: null,
      scores: { overall: null, verdict: null },
      ai_directive: undefined,
      brief_tile: { micro: "Syncing analysis.", vibe: "wild" as const },
      holding:
        watchlistPositions[instrumentId] === "holding"
          ? ((watchlistHoldings[instrumentId] as Record<string, unknown> | undefined) || undefined)
          : undefined,
    };
  });

  const portfolio = watchlistView?.portfolio ?? radar.portfolio ?? null;
  const mappedRows = rows.map((r) => ({
    ticker: r.ticker,
    instrument_id: r.instrument_id,
    market: r.market,
    position_type: r.position_type,
    sector_label: "sector_label" in r ? r.sector_label : "",
    industry_label: "industry_label" in r ? r.industry_label : "",
    price: "price" in r ? r.price : null,
    day_change_pct: "day_change_pct" in r ? r.day_change_pct : null,
    scores: "scores" in r ? r.scores : null,
    ai_directive: "ai_directive" in r ? r.ai_directive : undefined,
    brief_tile: "brief_tile" in r ? r.brief_tile : undefined,
    attention_score: "attention_score" in r ? r.attention_score : undefined,
    suggested_action: "suggested_action" in r ? r.suggested_action : undefined,
    directive_v2: "directive_v2" in r ? r.directive_v2 : undefined,
    holding: "holding" in r ? r.holding : undefined,
  }));
  const trackedTickerSet = new Set(mappedRows.map((r) => r.ticker.toUpperCase()));

  return {
    tracked_count: tracked.length,
    holdings_count: rows.filter((r) => r.position_type === "holding").length,
    watchlist_count: rows.filter((r) => r.position_type === "watchlist").length,
    tracked_tickers: [...trackedTickerSet].sort(),
    rows: mappedRows,
    nvda_earnings_impact_if_miss: buildNvdaImpactMap(mappedRows),
    add_candidates_not_on_radar: extractAddCandidates(portfolio, trackedTickerSet),
    brief: watchlistView?.brief ?? radar.brief ?? null,
    pulse: watchlistView?.pulse ?? radar.pulse ?? null,
    portfolio,
  };
}

export async function POST(req: NextRequest) {
  const decoded = await getSessionUser(req);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = decoded.uid;
  const body = await req.json();
  const { messages } = body as { messages: UIMessage[] };
  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const latestUserText = flattenMessageText(latestUserMessage);
  const lastSuggestedAddTicker = extractLastSuggestedAddTicker(messages);
  const intent = detectIntent(latestUserText);

  const radarContext = await buildRadarContext(uid);
  const trackedTickers = radarContext.rows.map((r) => r.ticker).filter(Boolean);
  const resolvedTicker = extractTickerFromText(latestUserText, trackedTickers, lastSuggestedAddTicker);
  const forceWebSearch = shouldForceWebSearch(latestUserText) || intent === "sentiment_research";

  let researchPayload: unknown = null;
  if (forceWebSearch) {
    const queryTicker = resolvedTicker || "US stocks";
    researchPayload = await tavilySearch(`${queryTicker} stock latest news sentiment analyst outlook`);
  }

  let stockIntelPayload: unknown = null;
  if (
    resolvedTicker &&
    (intent === "portfolio_action" || intent === "follow_up_explain" || intent === "single_ticker_news")
  ) {
    const market = resolvedTicker.startsWith("IN_") ? "IN" : "US";
    const instrumentId = await resolveInstrumentId(resolvedTicker, market);
    const [intel, pro] = await Promise.all([
      getStockIntelligenceDoc(instrumentId, market),
      getStockIntelPro(instrumentId, market),
    ]);
    stockIntelPayload = {
      instrument_id: instrumentId,
      headline: intel?.headline,
      body: intel?.body ?? intel?.today_brief,
      thesis: intel?.thesis,
      catalyst: intel?.catalyst,
      risk: intel?.risk,
      directive: intel?.directive_v2,
      overall_score: intel?.overall_score ?? pro?.overall?.score,
      overall_label: intel?.overall_label ?? pro?.overall?.verdict,
      key_points: intel?.key_points,
      comparative_context: intel?.comparative_context,
      scorecard: pro ? { pillars: pro.pillars, overall: pro.overall, catalysts: pro.catalysts } : null,
    };
  }

  const systemPrompt = `You are stocksbrew assistant with deterministic workflows. Follow the intent contract exactly.

Intent: ${intent}
User message: ${JSON.stringify(latestUserText)}
Resolved ticker: ${JSON.stringify(resolvedTicker)}

Rules:
- Never expose internal field names or tool mechanics.
- Never repeat the same directive sentence from previous turns.
- If research_payload is present, ground claims in it and include 2 source links in markdown.
- Never invent numeric growth forecasts. Use ranges only when present in data.
- If holdings are present, prioritize highest portfolio weights first and mention impact on entered portfolio value.
- Do not imply full brokerage sync; treat holdings as user-entered and potentially partial.
- If user asks market ideas (ignore radar), provide exactly 5 stocks with this format per stock:
  1) Ticker + thesis
  2) Risk (1 line)
  3) Base/Upside/Downside target (explicit numbers or "N/A from current data")

Return concise markdown only.

radar_context:
${JSON.stringify({
  tracked_count: radarContext.tracked_count,
  holdings_count: radarContext.holdings_count,
  watchlist_count: radarContext.watchlist_count,
  tracked_tickers: trackedTickers,
  add_candidates_not_on_radar: radarContext.add_candidates_not_on_radar,
  rows_compact: compactRowsForPrompt(radarContext.rows),
  portfolio_meta: radarContext.portfolio,
  pulse: radarContext.pulse,
  brief: radarContext.brief,
})}

research_payload:
${JSON.stringify(researchPayload)}

stock_intel_payload:
${JSON.stringify(stockIntelPayload)}`;

  try {
    const result = streamText({
      model: chatProvider(llmModel("gpt-5.6-luna")),
      providerOptions: { openai: { reasoningEffort: "low" } },
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: "Failed to generate response." }, { status: 500 });
  }
}
