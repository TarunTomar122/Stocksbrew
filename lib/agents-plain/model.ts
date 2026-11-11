import { generateText, Output } from "ai";
import { z } from "zod";

import { askModel } from "@/lib/ask-llm";

import { CANNOT_CODES, WATCH_KINDS, type ModelParse, type ModelReader } from "./parse";

/**
 * The model reader for requests the rules could not fully read. It uses the
 * same model and keys as Ask (lib/ask-llm.ts). The model only sorts the
 * request into the fixed watch kinds and copies stock names as written; every
 * sentence shown is written by lib/agents-plain/parse.ts from the result.
 */

const WATCH = z.object({
  kind: z.enum(WATCH_KINDS),
  stocks: z.array(z.string()).describe("Each stock exactly as the person wrote it: a ticker or a company name. Empty when none was named."),
  my_stocks: z.boolean().describe("True when they mean the stocks they own or track (\"anything I own\", \"my stocks\")."),
  any_stock: z.boolean().describe("True when they mean any stock at all (\"any fund filing\", \"any trade by Congress\")."),
  level: z.number().nullable().describe("price_below / price_above: the price in dollars."),
  pct: z.number().nullable().describe("daily_move: the size of the move in percent."),
  direction: z.enum(["up", "down", "both"]).nullable(),
  days_before: z.number().nullable().describe("earnings_before: how many days ahead."),
  weekday: z.number().nullable().describe("weekly_review: 1 = Monday … 5 = Friday, 0 or 6 for a weekend day."),
  side: z.enum(["buy", "sell"]).nullable().describe("When they asked only about buying or only about selling."),
  person: z.string().nullable().describe("A named member of Congress, fund or fund manager (\"Pelosi\", \"Bridgewater\", \"Cathie Wood\"), as written."),
});

const SCHEMA = z.object({
  watches: z.array(WATCH),
  cannot: z.array(
    z.object({
      quote: z.string().describe("The words from the request this is about, copied exactly."),
      reason: z.enum(CANNOT_CODES),
    }),
  ),
});

const SYSTEM = `You sort a person's request for stock alerts into a fixed list of watch kinds. You never write anything for the person to read.

Watch kinds:
- price_below / price_above: a stock closes below or above a dollar price. One price per watch.
- daily_move: a stock moves a percent or more from one day's close to the next.
- earnings_before: some days before a company reports earnings (days_before, default 3).
- earnings_out: when a company has reported earnings.
- fund_13f: a fund files its quarterly 13F holdings report (selling or buying by funds, hedge funds, institutions, named fund managers).
- congress_trade: a member of Congress discloses a trade.
- insider_trade: an executive, director or other insider reports a trade.
- movers_list: a stock is on the day's list of biggest movers.
- buy_zone: a stock reaches the price where our research says we would buy more.
- daily_check: a summary every market day.
- weekly_review: a summary once a week (weekday).

Rules:
- Use only these kinds. Anything else goes in "cannot" with the closest reason: news (headlines, announcements, FDA, mergers), intraday (real time, during the day), chart_signals (moving averages, RSI, volume, 52-week highs), fundamentals (P/E, revenue, valuation), analyst_ratings, call_change, dividends, trading (buy or sell for me, stop-loss), cost_basis (from what I paid), multi_day_move (a percent over a week or month), not_a_us_stock (crypto, forex, foreign markets), weekend, unclear, other.
- Copy stock names exactly as written. Never guess a ticker for a company that was not named. "it" or "them" refers to the stocks named earlier in the request.
- A request may hold several watches ("or", "and"). Make one watch per thing to watch.
- Never invent numbers. If no number was given, use null.`;

const TIMEOUT_MS = 12_000;

/** Null when no model is configured (or only the offline planner is), so the rules' reading stands. */
export function plainModelReader(): ModelReader | null {
  const llm = askModel();
  if (!llm || llm.via === "offline") return null;
  return async (text: string): Promise<ModelParse> => {
    const result = await generateText({
      model: llm.model,
      system: SYSTEM,
      prompt: `Request: ${JSON.stringify(text)}`,
      output: Output.object({ schema: SCHEMA }),
      maxOutputTokens: 800,
      providerOptions: (llm.via === "anthropic" ? { anthropic: { effort: "low" } } : { openai: { reasoningEffort: "low" } }) as never,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = SCHEMA.safeParse(result.output);
    if (!parsed.success) throw new Error("plain_agent_model_bad_output");
    return parsed.data as ModelParse;
  };
}
