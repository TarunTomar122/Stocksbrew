import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { getSearchIndex } from "@/lib/search";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.RADAR_IMAGE_EXTRACT_MODEL || "gpt-4o-mini";

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z.]/g, "");
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
    "Extract stock tickers from a brokerage/watchlist screenshot.",
    "Return strict JSON only: {\"tickers\":[\"AAPL\",\"MSFT\"]}.",
    "Rules:",
    "- US equity symbols only.",
    "- Uppercase 1-5 letters (allow BRK.B).",
    "- No words like BUY/SELL/USD/OPEN/CLOSE/TOTAL.",
    "- Max 30 symbols.",
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
          { type: "text", text: "Extract tickers from this image." },
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
  let tickers: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    tickers = Array.isArray(parsed?.tickers) ? parsed.tickers.map((t: unknown) => String(t)) : [];
  } catch {
    return NextResponse.json({ error: "invalid_model_output" }, { status: 502 });
  }

  const normalized = [...new Set(tickers.map(normalizeTicker).filter((t) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(t)))].slice(0, 30);
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
      };
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, tickers: normalized, matches });
}
