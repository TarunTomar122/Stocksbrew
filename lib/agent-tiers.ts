import {
  AGENT_DAILY_CALL_LIMIT,
  AGENT_FREE_DAILY_CALL_LIMIT,
  publicAppUrl,
} from "@/lib/agent-access-config";
import { AgentPlanError } from "@/lib/agent-errors";
import { limitFor, redactLevels, redactOurLevels } from "@/lib/entitlements";
import type { AgentToolName } from "@/lib/agent-intelligence";

/**
 * Free vs Pro for the API, the MCP server and the CLI. Enforced in the dispatcher (executeAgentTool), so MCP, REST
 * and the CLI all read this one list.
 *
 * Any signed-in account can get a token. Free gets what the pipeline writes once for everyone (search, the
 * call, compare, filings, the market, Explore, screens) plus the account's own watchlist, at
 * AGENT_FREE_DAILY_CALL_LIMIT calls a day. None of them runs a model. They follow the app's own line
 * (lib/entitlements.ts): price zones and the whole brief only on the stocks a Free account covers, two stocks per
 * comparison.
 *
 * Pro adds what costs us per call or is the product itself: the full stock-page dump (get_stock_detail, about
 * sixteen reads and every source doc), the change feed, alerts, the portfolio x-ray, dividends, stress and copy
 * tests, idea baskets and the plain-words reader (a model call each time), at AGENT_DAILY_CALL_LIMIT a day.
 *
 * Pure: no server imports, so the pricing and docs pages can read it.
 */

export type AgentPlan = "free" | "pro";

export const FREE_AGENT_TOOLS = [
  "search_stocks",
  "get_stock_intelligence",
  "compare_stocks",
  "get_filing_changes",
  "get_market_brief",
  "get_market_history",
  "get_explore",
  "get_screens",
  "get_my_radar",
  "add_to_radar",
  "remove_from_radar",
] as const satisfies readonly AgentToolName[];

const FREE_TOOLS: ReadonlySet<string> = new Set(FREE_AGENT_TOOLS);

/** How many stocks one comparison may hold on Free: the same two as the Compare page. */
export const FREE_AGENT_COMPARE_LIMIT = limitFor("compare", "free");

export function isFreeAgentTool(tool: string): boolean {
  return FREE_TOOLS.has(tool);
}

export function agentDailyLimit(plan: AgentPlan): number {
  return plan === "pro" ? AGENT_DAILY_CALL_LIMIT : AGENT_FREE_DAILY_CALL_LIMIT;
}

/** Where a Free account goes to upgrade, as a full URL a model can pass on. */
export function agentUpgradeUrl(): string {
  return `${publicAppUrl()}/pricing`;
}

/** The free-tier allowance in one line, for error messages. */
function freeLine(): string {
  return `Free includes ${FREE_AGENT_TOOLS.length} tools (market data, our call on any stock and your own watchlist) and ${AGENT_FREE_DAILY_CALL_LIMIT} calls a day.`;
}

/**
 * Throws AgentPlanError when the plan does not include this tool, or these arguments. Runs before the call is
 * counted, so a refused call never spends the allowance.
 */
export function requireAgentPlan(plan: AgentPlan, tool: AgentToolName, args: Record<string, unknown> = {}): void {
  if (plan === "pro") return;
  const url = agentUpgradeUrl();
  if (!isFreeAgentTool(tool)) {
    throw new AgentPlanError(
      `${tool} is part of stocksbrew Pro. ${freeLine()} Pro opens every tool, ${AGENT_DAILY_CALL_LIMIT} calls a day: ${url}`,
      url,
    );
  }
  if (tool === "compare_stocks" && Array.isArray(args.tickers)) {
    const unique = new Set(args.tickers.map((ticker) => String(ticker).trim().toUpperCase()).filter(Boolean));
    if (unique.size > FREE_AGENT_COMPARE_LIMIT) {
      throw new AgentPlanError(
        `Free compares ${FREE_AGENT_COMPARE_LIMIT} stocks at a time. Compare ${FREE_AGENT_COMPARE_LIMIT}, or go Pro for up to 5: ${url}`,
        url,
      );
    }
  }
}

/** The message when a Free account's calls for the day are used. */
export function freeDailyLimitMessage(): string {
  return `That is today's ${AGENT_FREE_DAILY_CALL_LIMIT} free calls used. They reset at 00:00 UTC. Pro opens every tool, ${AGENT_DAILY_CALL_LIMIT} calls a day: ${agentUpgradeUrl()}`;
}

/** Fields that hold our price levels: the zones, and the older directive's add, trim and break triggers. */
const LEVEL_KEYS: ReadonlySet<string> = new Set([
  "zones",
  "levels",
  "levels_set_on",
  "add_on",
  "trim_on",
  "breaks_if",
  "trigger_value",
  "accumulate_below",
  "breakout_above",
  "trim_above",
  "near_term_resistance",
]);

/**
 * A value with our price levels taken out, for a stock the account does not cover: every level field is dropped and
 * every sentence that pairs a price with level words or one of our level phrases ("buy more below") is cut
 * (redactLevels, redactOurLevels). A string with nothing left is null.
 */
export function stripLevelsDeep<T>(value: T): T {
  if (typeof value === "string") return (redactLevels(redactOurLevels(value, "")) ?? null) as T;
  if (Array.isArray(value)) return value.map((item) => stripLevelsDeep(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (LEVEL_KEYS.has(key)) continue;
      out[key] = stripLevelsDeep(item);
    }
    return out as T;
  }
  return value;
}
