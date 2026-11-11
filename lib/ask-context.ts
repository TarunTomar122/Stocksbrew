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
 *
 * The one import is a type (the card shapes), so this file still adds nothing
 * at runtime.
 */

import type { AskCard } from "@/lib/ask-cards";

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

/**
 * Questions the Ask panel offers for an item, contextQuestion first. They stay to what the item's own lookup and
 * Ask's stock tools cover (the stock's news, risks and return against the S&P 500, in lib/next-steps.ts's wording;
 * the person's own portfolio for portfolio and memo). The example portfolio gets only its own question.
 */
export function contextSuggestions(context: AskContext): string[] {
  const ticker = context.ticker ?? "";
  const first = contextQuestion(context);
  switch (context.kind) {
    case "stock":
      return [first, `What is the latest news on ${ticker}?`, `How has ${ticker} done against the S&P 500 this year?`, `What are the biggest risks for ${ticker} right now?`];
    case "research":
    case "reason":
    case "brief":
      return [first, `What is the latest news on ${ticker}?`, `How has ${ticker} done against the S&P 500 this year?`];
    case "portfolio":
    case "memo":
      return context.example ? [first] : [first, "What changed in my portfolio since yesterday?", "Which of my holdings has the weakest call right now?"];
    case "agent":
      return [first];
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

/* ── the pinned card at the top of a conversation ───────────────────────── */

/** Where the item lives in the app, for the pinned card's link back. Same places the links into Ask come from. */
export function contextHref(context: AskContext): { href: string; label: string } {
  const ticker = context.ticker ?? "";
  switch (context.kind) {
    case "stock":
      return { href: `/stock/${encodeURIComponent(ticker)}`, label: `Open ${ticker}` };
    case "research":
      return { href: `/stock/${encodeURIComponent(ticker)}/research/${context.id}`, label: "Open the report" };
    case "reason":
    case "portfolio":
      return { href: "/portfolio", label: "Open My stocks" };
    case "memo":
      return { href: "/portfolio/memo", label: "Open the memo" };
    case "brief":
      return { href: "/briefing", label: "Open Today" };
    case "agent":
      return { href: `/agents?job=${context.id}`, label: "Open the agent" };
  }
}

export type ContextPin = {
  /** Shown with a logo when there is one. */
  ticker: string | null;
  /** "NVIDIA Corp" or "This week's memo". */
  title: string;
  /** One sentence about the item, taken from the card the server opened, or null before that card exists. */
  summary: string | null;
};

function sentence(text: string | null | undefined): string | null {
  const clean = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  return clean || null;
}

/**
 * The pinned card's words. The title and summary come from the card the server opened for the first question (the
 * same lookup the answer starts from), so nothing here is written for the pin. Before that card exists, the title is
 * the ticker or the item's name and there is no summary.
 */
export function contextPin(context: AskContext, opened: AskCard | null): ContextPin {
  const ticker = context.ticker;
  const fallbackTitle =
    context.kind === "memo"
      ? context.example
        ? "The example portfolio's memo"
        : "This week's memo"
      : context.kind === "portfolio"
        ? context.example
          ? "The example portfolio"
          : "My stocks"
        : context.kind === "agent"
          ? "Your agent"
          : context.kind === "research"
            ? `${ticker} research report`
            : (ticker ?? "");
  const base: ContextPin = { ticker, title: fallbackTitle, summary: null };
  if (!opened) return base;
  switch (opened.card) {
    case "quote":
      return {
        ticker: opened.ticker,
        title: opened.name ?? opened.ticker,
        summary: sentence(opened.headline),
      };
    case "research":
      return { ticker: opened.ticker, title: `${opened.name} research report`, summary: sentence(opened.headline) ?? sentence(opened.summary[0]) };
    case "reasons": {
      const row = opened.rows.find((entry) => entry.ticker === ticker) ?? (opened.rows.length === 1 ? opened.rows[0] : null);
      return row ? { ...base, summary: sentence(`${row.verdict_words}. ${row.headline}`) } : base;
    }
    case "memo":
      return { ...base, summary: sentence(opened.focus?.text) ?? sentence(opened.top_line) };
    case "briefing_item":
      return { ticker: opened.ticker, title: opened.name || opened.ticker, summary: sentence(opened.headline) };
    case "agents": {
      const row = opened.rows.find((entry) => entry.id === opened.focus) ?? null;
      return row ? { ...base, title: row.name, summary: sentence(row.last_run?.summary) ?? sentence(row.watches) } : base;
    }
    case "portfolio":
      return { ...base, summary: sentence(opened.needs_attention[0]?.text) };
    default:
      return base;
  }
}
