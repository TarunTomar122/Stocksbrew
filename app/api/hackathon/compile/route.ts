import { NextRequest, NextResponse } from "next/server";
import { compileThesis, normalizeThesisDraft } from "@/hackathon/compiler";
import { seedEvidence } from "@/hackathon/seed";
import { assessEvidence, updateThesisScore } from "@/hackathon/tracker";
import type { ThesisDraft } from "@/hackathon/types";

export const maxDuration = 30;
const LLM_COMPILE_TIMEOUT_MS = 12_000;
const OPENAI_MODEL = "gpt-5.6-luna";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface CompileResponse {
  thesis: ThesisDraft;
  score: ReturnType<typeof updateThesisScore>;
  evidence: typeof seedEvidence;
  assessments: ReturnType<typeof assessEvidence>;
  _source: "llm" | "fallback";
  _llmError?: string;
}

const SYSTEM_PROMPT = `You are a financial thesis compiler. Your job is to take a short retail-investor thesis text (1-3 sentences) and expand it into a structured JSON thesis draft.

Output ONLY valid JSON matching this schema:

{
  "title": "string (max 72 chars, derived from thesis)",
  "summary": "string (max 180 chars, crisp 1-2 sentence distillation)",
  "horizonMonths": number (12=1yr, 24=2yr, default 12 if unclear),
  "sectors": ["Semiconductors", "Technology", ...],
  "beneficiaryTickers": ["NVDA", ...],
  "riskTickers": ["AMD", ...],
  "entities": [
    {
      "name": "string",
      "type": "company" | "sector" | "theme" | "product" | "metric",
      "ticker": "string (uppercase, optional)",
      "role": "beneficiary" | "risk" | "signal-owner" (optional),
      "description": "string"
    }
  ],
  "drivers": [
    {
      "id": "driver_0",
      "label": "string (short, max 84 chars)",
      "description": "string (explains the driver, 1-2 sentences)",
      "polarity": "bullish" | "bearish",
      "category": "demand" | "supply" | "pricing" | "competition" | "regulation" | "profitability",
      "weight": number (must sum to 1.0 across all drivers),
      "horizon": "short" | "medium" | "long",
      "trackedEntityNames": ["NVIDIA", "TSMC", ...],
      "evidenceKeywords": ["capex", "demand", ...]
    }
  ],
  "disproofConditions": [
    {
      "id": "disproof_driver_0",
      "condition": "string (what would disprove this driver)",
      "driverId": "driver_0",
      "threshold": "string (e.g. driver score falls below 35%)",
      "horizon": "short" | "medium" | "long",
      "signals": ["string"]
    }
  ],
  "evidenceHooks": [
    {
      "id": "hook_confirm_driver_0",
      "label": "string",
      "driverId": "driver_0",
      "kind": "confirming" | "disconfirming",
      "entityNames": ["NVIDIA"],
      "keywords": ["string"],
      "sourceTypes": ["transcript", "filing", "reported-news", "industry-data", "macro", "market-data"]
    }
  ]
}

Rules:
- AT LEAST 2 drivers, mixing bull and bear perspectives.
- Weights across all drivers MUST sum to exactly 1.0. Distribute proportionally by conviction.
- Exactly 1 disproofCondition per driver, with driverId matching the driver's id.
- Exactly 2 evidenceHooks per driver (one confirming, one disconfirming), with driverId matching.
- IDs must follow patterns: "driver_0", "driver_1"; "disproof_driver_0"; "hook_confirm_driver_0", "hook_disconfirm_driver_0".
- beneficiaryTickers: companies that directly benefit if thesis plays out.
- riskTickers: competitors or companies that pose a risk to the thesis.
- Include entities for every company, sector, theme, product mentioned or clearly implied.
- Be conservative about tickers — only include actual stock tickers.
- For very short inputs, fill in reasonable inferred details; do not return sparse structures.
- horizonMonths: use "structural"/"secular" -> 24, "near term"/"this year" -> 6, mention of "2 year" -> 24, otherwise 12.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }
  return trimmed;
}

async function callOpenAI(rawText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("LLM compile timed out")), LLM_COMPILE_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Compile this thesis into the structured JSON format:\n\n${rawText}`,
          },
        ],
        reasoning_effort: "low",
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: { message?: string } }).error?.message || "OpenAI request failed")
          : `OpenAI request failed (${response.status})`;
      throw new Error(message);
    }

    const llmText =
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { choices?: unknown[] }).choices)
        ? String(
            ((payload as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message?.content ?? "")
          )
        : "";

    if (!llmText.trim()) {
      throw new Error("OpenAI returned an empty completion");
    }

    return llmText;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const bodyText =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.rawText === "string"
          ? body.rawText
          : "";

    if (!bodyText.trim()) {
      return NextResponse.json(
        { error: "Missing required field: text or rawText (non-empty thesis string)" },
        { status: 400 }
      );
    }

    const rawText = bodyText.trim();
    const title = typeof body.title === "string" ? body.title.trim() || undefined : undefined;

    function buildResponse(thesis: ThesisDraft, source: "llm" | "fallback", llmError?: string) {
      const assessments = assessEvidence(thesis, seedEvidence);
      const score = updateThesisScore(thesis, assessments);
      return NextResponse.json<CompileResponse>({
        thesis,
        score,
        evidence: seedEvidence,
        assessments,
        _source: source,
        _llmError: llmError,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      const fallback = compileThesis(rawText, title);
      return buildResponse(fallback, "fallback", "OPENAI_API_KEY not configured");
    }

    try {
      const llmText = await callOpenAI(rawText);

      const jsonStr = extractJson(llmText);
      const parsed = JSON.parse(jsonStr);

      const now = new Date().toISOString();
      const raw: ThesisDraft = {
        id: parsed.id || `thesis_${Date.now()}`,
        title: parsed.title || title || "",
        rawText,
        summary: parsed.summary || "",
        horizonMonths: parsed.horizonMonths || 12,
        sectors: parsed.sectors || [],
        beneficiaryTickers: parsed.beneficiaryTickers || [],
        riskTickers: parsed.riskTickers || [],
        entities: parsed.entities || [],
        drivers: parsed.drivers || [],
        disproofConditions: parsed.disproofConditions || [],
        evidenceHooks: parsed.evidenceHooks || [],
        createdAt: parsed.createdAt || now,
        updatedAt: now,
      };

      const normalized = normalizeThesisDraft(raw);

      if (normalized.drivers.length === 0) {
        throw new Error("LLM produced zero valid drivers");
      }

      return buildResponse(normalized, "llm");
    } catch (llmError) {
      const errMsg = llmError instanceof Error ? llmError.message : String(llmError);
      console.warn("[hackathon/compile] LLM failed, falling back to deterministic compiler:", errMsg);

      const fallback = compileThesis(rawText, title);
      return buildResponse(fallback, "fallback", errMsg);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
