import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getSearchIndex } from "@/lib/search";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.RADAR_IMAGE_EXTRACT_MODEL || "gpt-4o-mini";

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z.]/g, "");
}

function toMaybeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const imageDataUrl = typeof body?.image_data_url === "string" ? body.image_data_url : "";
  const market = body?.market === "IN" ? "IN" : "US";
  if (!imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "openai_key_missing" }, { status: 500 });
  }

  const model = process.env.TRACE_MONEY_LLM_MODEL || DEFAULT_MODEL;
  const system = [
    "Extract stock positions from a brokerage/watchlist screenshot.",
    "Return strict JSON only:",
    "{\"positions\":[{\"ticker\":\"AAPL\",\"quantity\":10,\"market_value\":1850,\"average_cost\":150}]}",
    "Rules:",
    "- US/IN equity symbols only.",
    "- Uppercase 1-5 letters (allow BRK.B).",
    "- No words like BUY/SELL/USD/OPEN/CLOSE/TOTAL.",
    "- quantity/market_value/average_cost can be null if not visible.",
    "- Max 30 positions.",
  ].join("\n");

  const payload = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract positions from this image." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  };

  const resp = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return NextResponse.json({ error: "openai_failed", detail: txt.slice(0, 240) }, { status: 502 });
  }

  const data = await resp.json();
  let raw = String(data?.choices?.[0]?.message?.content || "").trim();
  if (raw.startsWith("```")) {
    const lines = raw.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines[lines.length - 1] === "```") lines.pop();
    raw = lines.join("\n").trim();
  }
  let positions: Array<{
    ticker: string;
    quantity?: number | null;
    market_value?: number | null;
    average_cost?: number | null;
  }> = [];
  let tickers: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    positions = Array.isArray(parsed?.positions)
      ? parsed.positions
          .filter((p: unknown) => p && typeof p === "object")
          .map((p: unknown) => {
            const row = p as Record<string, unknown>;
            return {
              ticker: String(row.ticker || ""),
              quantity: toMaybeNumber(row.quantity),
              market_value: toMaybeNumber(row.market_value),
              average_cost: toMaybeNumber(row.average_cost),
            };
          })
      : [];
    tickers = Array.isArray(parsed?.tickers)
      ? parsed.tickers.map((t: unknown) => String(t))
      : positions.map((p) => p.ticker);
  } catch {
    return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
  }

  const normalized = [...new Set(tickers.map(normalizeTicker).filter((t) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(t)))].slice(0, 30);
  const byTickerHolding = new Map<
    string,
    { quantity?: number | null; market_value?: number | null; average_cost?: number | null; source: "screenshot" }
  >();
  for (const position of positions.slice(0, 30)) {
    const ticker = normalizeTicker(position.ticker);
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)) continue;
    byTickerHolding.set(ticker, {
      quantity: position.quantity ?? null,
      market_value: position.market_value ?? null,
      average_cost: position.average_cost ?? null,
      source: "screenshot",
    });
  }
  const index = await getSearchIndex(market);
  const byTicker = new Map(index.map((e) => [String(e.ticker).toUpperCase(), e]));

  const matches = normalized
    .map((t) => {
      const found = byTicker.get(t);
      if (!found) return null;
      return {
        instrument_id: found.instrument_id,
        ticker: found.ticker,
        name: found.name,
        holding: byTickerHolding.get(t),
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    ok: true,
    tickers: normalized,
    positions: normalized.map((ticker) => ({ ticker, ...(byTickerHolding.get(ticker) || {}) })),
    matches,
  });
}
