/**
 * Where a question came from. A link into Ask can carry one item (a stock, a
 * research report, a saved reason, this week's memo, a briefing line, an
 * agent, the portfolio) so the first answer starts from that item's evidence
 * instead of from nothing.
 *
 * The link holds ids only, never text: `/ask?q=...&ctx=research:NVDA:20261110T153012Z`.
 * The server re-reads the item for the signed-in person (lib/ask-tools-mine.ts),
 * so a made-up or someone else's id finds nothing. Pure, no server imports: the
 * page, the client and the route all read this file.
 *
 * Grammar, one per kind:
 * - `stock:NVDA`
 * - `research:NVDA:20261110T153012Z`
 * - `reason:NVDA`
 * - `memo` or `memo:<item id>` (this week's memo, one line of it)
 * - `brief:NVDA:2026-11-10:<item id>` (one line of a day's briefing)
 * - `agent:<job id>`
 * - `portfolio`
 * An `ex.` prefix (`ex.portfolio`, `ex.memo`, `ex.reason:NVDA`) says the
 * question came from the example portfolio, so Ask may answer about the
 * example when the person has no portfolio of their own, and says so.
 */

export const ASK_CONTEXT_KINDS = ["stock", "research", "reason", "memo", "brief", "agent", "portfolio"] as const;
export type AskContextKind = (typeof ASK_CONTEXT_KINDS)[number];

export type AskContext = {
  kind: AskContextKind;
  ticker: string | null;
  /** Report key, memo line id, briefing line id or agent id. */
  id: string | null;
  /** Briefing day, YYYY-MM-DD. */
  day: string | null;
  /** The question came from the example portfolio. */
  example: boolean;
};

/** Longest `ctx` value accepted. Ids only, so anything longer is not one of ours. */
export const ASK_CONTEXT_MAX = 200;

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;
const REPORT_KEY = /^\d{8}T\d{6}Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Same shapes as lib/agent-jobs.ts (AGENT_JOB_ID_RE) and lib/briefing.ts (BRIEFING_ITEM_ID_RE); copied so this file stays import-free.
const JOB_ID = /^[a-z0-9]{6,24}$/;
const BRIEF_ITEM = /^[A-Za-z0-9_-]{3,160}$/;
/** Memo line ids look like "call:AAPL:2026-11-05" or "week". */
const MEMO_ITEM = /^[A-Za-z0-9:._-]{1,120}$/;
/** Kinds the example portfolio can be the subject of. */
const EXAMPLE_KINDS: ReadonlySet<AskContextKind> = new Set(["portfolio", "memo", "reason"]);

function cleanTicker(raw: string | undefined): string | null {
  const symbol = (raw ?? "").trim().toUpperCase();
  return TICKER.test(symbol) ? symbol : null;
}

/** Read a `ctx` value. Null for anything that is not exactly one of the shapes above. */
export function parseAskContext(raw: unknown): AskContext | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text || text.length > ASK_CONTEXT_MAX) return null;
  let example = false;
  if (text.startsWith("ex.")) {
    example = true;
    text = text.slice(3);
  }
  const [kind, ...rest] = text.split(":");
  const base = { ticker: null, id: null, day: null, example };
  let parsed: AskContext | null = null;
  switch (kind) {
    case "stock": {
      const ticker = rest.length === 1 ? cleanTicker(rest[0]) : null;
      parsed = ticker ? { ...base, kind, ticker } : null;
      break;
    }
    case "reason": {
      const ticker = rest.length === 1 ? cleanTicker(rest[0]) : null;
      parsed = ticker ? { ...base, kind, ticker } : null;
      break;
    }
    case "research": {
      const ticker = rest.length === 2 ? cleanTicker(rest[0]) : null;
      parsed = ticker && REPORT_KEY.test(rest[1]!) ? { ...base, kind, ticker, id: rest[1]! } : null;
      break;
    }
    case "memo": {
      const id = rest.join(":");
      if (rest.length === 0) parsed = { ...base, kind };
      else parsed = MEMO_ITEM.test(id) ? { ...base, kind, id } : null;
      break;
    }
    case "brief": {
      const ticker = rest.length >= 3 ? cleanTicker(rest[0]) : null;
      const day = rest[1] ?? "";
      const id = rest.slice(2).join(":");
      parsed = ticker && DAY.test(day) && BRIEF_ITEM.test(id) ? { ...base, kind, ticker, day, id } : null;
      break;
    }
    case "agent": {
      parsed = rest.length === 1 && JOB_ID.test(rest[0]!) ? { ...base, kind, id: rest[0]! } : null;
      break;
    }
    case "portfolio": {
      parsed = rest.length === 0 ? { ...base, kind } : null;
      break;
    }
    default:
      return null;
  }
  if (parsed && parsed.example && !EXAMPLE_KINDS.has(parsed.kind)) return null;
  return parsed;
}

/** What goes into a link. The inverse of parseAskContext for every value it accepts. */
export function formatAskContext(context: AskContext): string {
  const prefix = context.example ? "ex." : "";
  switch (context.kind) {
    case "stock":
    case "reason":
      return `${prefix}${context.kind}:${context.ticker}`;
    case "research":
      return `${prefix}research:${context.ticker}:${context.id}`;
    case "memo":
      return context.id ? `${prefix}memo:${context.id}` : `${prefix}memo`;
    case "brief":
      return `${prefix}brief:${context.ticker}:${context.day}:${context.id}`;
    case "agent":
      return `${prefix}agent:${context.id}`;
    case "portfolio":
      return `${prefix}portfolio`;
  }
}

/** Build one from parts, checked: null when the parts do not make a valid context. */
export function askContext(kind: AskContextKind, parts: { ticker?: string | null; id?: string | null; day?: string | null; example?: boolean } = {}): AskContext | null {
  const draft: AskContext = {
    kind,
    ticker: parts.ticker ? parts.ticker.trim().toUpperCase() : null,
    id: parts.id ?? null,
    day: parts.day ?? null,
    example: Boolean(parts.example),
  };
  return parseAskContext(formatAskContext(draft));
}

/** "your NVDA research report": what the page says Ask is starting from. */
export function contextLabel(context: AskContext): string {
  const ticker = context.ticker ?? "";
  switch (context.kind) {
    case "stock":
      return `what we have on ${ticker}`;
    case "research":
      return `your ${ticker} research report`;
    case "reason":
      return context.example ? `the example portfolio's reason for owning ${ticker}` : `your reason for owning ${ticker}`;
    case "memo":
      if (context.example) return context.id ? "a line in the example portfolio's memo" : "the example portfolio's memo";
      return context.id ? "a line in this week's memo" : "this week's memo";
    case "brief":
      return `your briefing on ${ticker}`;
    case "agent":
      return "one of your agents";
    case "portfolio":
      return context.example ? "the example portfolio" : "your stocks";
  }
}

/** A question to start with when a link carries an item but no question. Filled in, never sent by itself. */
export function contextQuestion(context: AskContext): string {
  const ticker = context.ticker ?? "";
  switch (context.kind) {
    case "stock":
      return `What matters most for ${ticker} right now?`;
    case "research":
      return `What are the main points of my ${ticker} report, and has anything changed since?`;
    case "reason":
      return context.example ? `Is the reason for owning ${ticker} still holding up?` : `Is my reason for owning ${ticker} still holding up?`;
    case "memo":
      return context.id ? "Tell me more about this." : "What should I take from this week's memo?";
    case "brief":
      return `Why does this matter for ${ticker}?`;
    case "agent":
      return "What has this agent found lately?";
    case "portfolio":
      return context.example ? "How is the example portfolio doing this week?" : "How is my portfolio doing this week?";
  }
}

export type ContextCall = { tool: string; input: Record<string, unknown> };

/**
 * The lookup that opens the item, run by the server before the model writes.
 * The same tools the model can call, so the card, the numbers check and the
 * scoping to the signed-in person are the same as for any other lookup.
 */
export function contextToolCall(context: AskContext): ContextCall {
  switch (context.kind) {
    case "stock":
      return { tool: "get_stock", input: { ticker: context.ticker } };
    case "research":
      return { tool: "get_my_research", input: { ticker: context.ticker, key: context.id } };
    case "reason":
      return { tool: "get_my_reasons", input: { ticker: context.ticker } };
    case "memo":
      return { tool: "get_my_week", input: context.id ? { item_id: context.id } : {} };
    case "brief":
      return { tool: "open_briefing_item", input: { ticker: context.ticker, day: context.day, item_id: context.id } };
    case "agent":
      return { tool: "get_my_agents", input: { job_id: context.id } };
    case "portfolio":
      return { tool: "get_my_portfolio", input: {} };
  }
}
