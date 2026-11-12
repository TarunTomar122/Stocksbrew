import type { FilingFilter } from "@/lib/agent-events-filings";
import { parseJobDraft, type AgentJob, type AgentJobDraft, type AgentTrigger } from "@/lib/agent-jobs";
import type { FilingGroup } from "@/lib/filings-shared";
import type { ResearchWatch } from "@/lib/research/types";

/**
 * "What to watch next" to agents: for each line of a research report's watch
 * list, the one agent we can actually run that watches it, set up for this
 * stock. Fixed rules over the agent templates (lib/agent-jobs.ts), never the
 * model: a line that names insider buying gets the insider-trades agent, a line
 * that names the next 10-Q gets the filings agent, and a line about cost trends
 * or demand gets nothing, because no agent can check that.
 *
 * Every suggestion is a draft that passed parseJobDraft, the same check the
 * agents API runs, so a tap saves exactly what is shown. Pure: the report page
 * and the tests share it.
 */

export const MAX_WATCH_AGENTS = 4;

export type WatchAgentSuggestion = {
  /** Stable per stock and rule, for React keys and analytics. */
  id: string;
  template: string;
  /** What the agent watches, in a few words: "Insider trades in MP". */
  label: string;
  draft: AgentJobDraft;
  /** The watch lines (by position) this agent covers. */
  items: number[];
};

type Rule = {
  test: (text: string) => boolean;
  build: (ctx: { ticker: string; text: string; price: number | null }) => { template: string; label: string; trigger: Record<string, unknown> } | null;
};

/** The words without citation markers or extra spaces. */
function plain(text: string): string {
  return text.replace(/\[S\d+\]/g, " ").replace(/\s+/g, " ").trim();
}

/** A trade in the stock itself: "sells shares", "bought stock". */
const SHARE_TRADE = String.raw`(?:buys?|bought|buying|sells?|sold|selling|purchas\w*)\b[^.;]{0,20}\b(?:shares|stock)`;

// "Insider" in a research line is the insider-trades sense; an executive needs a share trade next to it.
const INSIDER = new RegExp(String.raw`(?<!\bindustry )\binsiders?\b|\bform 4\b|\b(?:executives?|directors?|officers?|ceo|cfo)\b[^.;]{0,40}\b${SHARE_TRADE}`, "i");
// Congress only when it trades: "Congress extends the tax credit" is policy, which no agent watches. So is "trade"
// on its own ("new trade tariffs", "a trade deal"): only "trades" and "trading in/of" mean dealing in shares.
const CONGRESS = new RegExp(
  String.raw`\b(?:congress(?:ional)?|senators?|lawmakers?|members of the house)\b[^.;]{0,60}\b(?:trades\b(?!\s+(?:deals?|wars?|polic\w*|tariffs?|restrictions?|rules?|agreements?|talks)\b)|trading (?:in|of)\b|disclos\w*|${SHARE_TRADE})`,
  "i",
);
const FUNDS = /\b13F\b|\bhedge funds?\b|\binstitutional (?:holders?|investors?|ownership|buying|selling)\b|\bfund (?:holdings|filings|managers?)\b|\bfunds? we (?:follow|track)\b/i;

/** Which SEC forms a line names. "Next quarterly filing" is the 10-Q; a share offering is an S-1. */
function formsIn(text: string): FilingGroup[] | null {
  const forms = new Set<FilingGroup>();
  if (/\b10-?Q\b|\bquarterly filings?\b|\bquarterly report filed\b/i.test(text)) forms.add("10-Q");
  if (/\b10-?K\b|\bannual (?:report|filing)s?\b/i.test(text)) forms.add("10-K");
  if (/\b8-?K\b/i.test(text)) forms.add("8-K");
  if (/\bS-1\b|\b(?:share|stock|equity) (?:offering|sale|issuance)s?\b|\bnew shares\b/i.test(text)) forms.add("S-1");
  if (/\b13[DG]\b|\b13D\/G\b|\bstakes? (?:above|over|of more than) 5%/i.test(text)) forms.add("13D/G");
  if (forms.size > 0) return [...forms];
  return /\bSEC filings?\b|\bnew filings?\b|\bregulatory filings?\b/i.test(text) ? [] : null;
}

const EARNINGS = /\bearnings\b|\bquarterly (?:results|report|update)s?\b|\b(?:next|coming|upcoming|fourth|third|second|first)[- ]quarter(?:ly)? (?:results|report)s?\b|\b(?:next|coming|upcoming) (?:results|report)\b|\bQ[1-4] (?:results|report|print)\b|\b(?:raises?|cuts?|lowers?|reaffirms?|updates?|its|full-year|annual|revenue|sales|production)\s+(?:\d{4}\s+)?guidance\b|\bresults (?:on|due)\b/i;

/**
 * "the stock falls below $45", "MP closes above $60": the stock's own price, never "$3.4 million", "$600 million of
 * cash" or "NdPr above $60 a kilogram". The subject must be the stock, its shares or its ticker.
 */
function priceIn(text: string, ticker: string): { above: boolean; level: number } | null {
  const symbol = ticker.replace(/\./g, "\\.");
  const pattern = new RegExp(
    String.raw`\b(?:stock|shares|share price|stock price|${symbol})\b[^.;$]{0,30}?\b(below|under|beneath|above|over|past)\s+\$(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,6}(?:\.\d{1,2})?)(?![\d.,]*\d)(?!\s*(?:[mbk]\b|mn\b|bn\b|million|billion|thousand|trillion))(?!\s*(?:per|a|an)\s+(?!share\b)[a-z])`,
    "i",
  );
  const match = pattern.exec(text);
  if (!match) return null;
  const level = Number(match[2]!.replace(/,/g, ""));
  return Number.isFinite(level) && level > 0 ? { above: /above|over|past/i.test(match[1]!), level } : null;
}
const DAY_MOVE = /\b(\d{1,2}(?:\.\d)?)%\s+(?:or more\s+)?(?:in a|in one|on a single|in a single)\s+(?:day|session)\b/i;
const NEWS = /\bnews (?:flow|tone|coverage|sentiment)\b|\bheadlines? (?:turn|get|grow)\b|\bmedia coverage\b/i;
const CALL = /\bour call\b|\bstocksbrew'?s? call\b/i;
const BUY_LEVEL = /\bbuy[- ]more (?:level|price|zone)\b/i;
const SELL_LEVEL = /\bsell[- ]some (?:level|price|zone)\b/i;

function formsLabel(ticker: string, forms: FilingGroup[]): string {
  if (forms.length === 0) return `New ${ticker} SEC filings`;
  if (forms.length === 1 && forms[0] === "S-1") return `Share offerings by ${ticker}`;
  if (forms.length === 1 && forms[0] === "13D/G") return `Big stakes in ${ticker}`;
  const named = forms.filter((form) => form !== "S-1" && form !== "13D/G");
  const list = named.length > 0 ? named : forms;
  const words = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${ticker}'s next ${words}`;
}

/** In priority order: the first rule a line matches is the one agent it gets. */
const RULES: Rule[] = [
  { test: (text) => INSIDER.test(text), build: ({ ticker }) => ({ template: "insider-trade", label: `Insider trades in ${ticker}`, trigger: {} }) },
  { test: (text) => CONGRESS.test(text), build: ({ ticker }) => ({ template: "congress-trade", label: `Congress trades in ${ticker}`, trigger: {} }) },
  { test: (text) => FUNDS.test(text), build: ({ ticker }) => ({ template: "fund-filing", label: `Funds buying or selling ${ticker}`, trigger: {} }) },
  {
    test: (text) => formsIn(text) !== null,
    build: ({ ticker, text }) => {
      const forms = formsIn(text) ?? [];
      const filings: FilingFilter | undefined = forms.length > 0 ? { forms } : undefined;
      return { template: "sec-filing", label: formsLabel(ticker, forms), trigger: filings ? { filings } : {} };
    },
  },
  { test: (text) => EARNINGS.test(text), build: ({ ticker }) => ({ template: "earnings-ahead", label: `3 days before ${ticker} reports`, trigger: { days_before: 3 } }) },
  {
    test: (text) => /\$\d/.test(text),
    build: ({ ticker, text, price }) => {
      const found = priceIn(text, ticker);
      // Only a price the stock could plausibly reach from here.
      if (!found || price === null || price <= 0 || found.level < price * 0.4 || found.level > price * 2.5) return null;
      const shown = `$${found.level.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(found.level) ? 0 : 2, maximumFractionDigits: 2 })}`;
      return {
        template: "price-level",
        label: `${ticker} ${found.above ? "above" : "below"} ${shown}`,
        trigger: { rule: found.above ? "crosses_above" : "crosses_below", level: found.level },
      };
    },
  },
  {
    test: (text) => DAY_MOVE.test(text),
    build: ({ ticker, text }) => {
      const pct = Number(DAY_MOVE.exec(text)?.[1]);
      if (!(pct >= 1 && pct <= 50)) return null;
      return { template: "big-move", label: `${ticker} moves ${pct}% in a day`, trigger: { pct } };
    },
  },
  { test: (text) => BUY_LEVEL.test(text), build: ({ ticker }) => ({ template: "buy-zone", label: `${ticker} at its buy-more level`, trigger: {} }) },
  { test: (text) => SELL_LEVEL.test(text), build: ({ ticker }) => ({ template: "sell-zone", label: `When to sell some ${ticker}`, trigger: {} }) },
  { test: (text) => CALL.test(text), build: ({ ticker }) => ({ template: "call-change", label: `Our call on ${ticker} changes`, trigger: {} }) },
  { test: (text) => NEWS.test(text), build: ({ ticker }) => ({ template: "news", label: `The news on ${ticker} turns`, trigger: { news: "any" } }) },
];

function triggerKey(trigger: AgentTrigger): string {
  return JSON.stringify(Object.entries(trigger).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The agents a report's watch list maps to, at most one per line and each agent once, in the order of the
 * lines, capped at MAX_WATCH_AGENTS. `hidden` is hiddenTemplateIds() from the server; `price` is the last
 * price, which a price-level suggestion needs to tell a share price from any other dollar figure.
 */
export function suggestWatchAgents(input: {
  ticker: string;
  watch: ResearchWatch[];
  price?: number | null;
  hidden?: string[];
  max?: number;
}): WatchAgentSuggestion[] {
  const ticker = input.ticker.trim().toUpperCase();
  const out: WatchAgentSuggestion[] = [];
  const max = input.max ?? MAX_WATCH_AGENTS;
  input.watch.forEach((item, index) => {
    const text = plain(item?.text ?? "");
    if (!text) return;
    for (const rule of RULES) {
      if (!rule.test(text)) continue;
      const built = rule.build({ ticker, text, price: input.price ?? null });
      if (!built) continue;
      const parsed = parseJobDraft(
        { template: built.template, name: built.label, trigger: built.trigger, scope: { kind: "tickers", tickers: [ticker] } },
        { hidden: input.hidden ?? [] },
      );
      if (!parsed.ok) continue;
      const id = `${parsed.draft.template}:${triggerKey(parsed.draft.trigger)}`;
      const same = out.find((suggestion) => suggestion.id === id);
      if (same) same.items.push(index);
      else if (out.length < max) out.push({ id, template: parsed.draft.template, label: built.label, draft: parsed.draft, items: [index] });
      return;
    }
  });
  return out;
}

/* ── is it already watched ─────────────────────────────────────────────── */

export type WatchStatus = "new" | "watching" | "paused";

type ExistingJob = Pick<AgentJob, "template" | "trigger" | "scope" | "enabled">;

function filingsCover(have: FilingFilter | undefined, want: FilingFilter | undefined): boolean {
  if (!have) return true;
  if (!want || have.major || want.major) return false;
  const forms = have.forms ?? [];
  const wanted = want.forms ?? [];
  if (!wanted.every((form) => forms.includes(form))) return false;
  // An agent that watches only some 8-K items does not watch every 8-K.
  return !(have.items?.length && wanted.includes("8-K") && !want.items?.length);
}

/** Whether an agent the person has already watches what the suggestion would. */
export function jobCovers(job: ExistingJob, suggestion: Pick<WatchAgentSuggestion, "draft">, ticker: string, tracksTicker: boolean): boolean {
  const want = suggestion.draft;
  if (job.template !== want.template) return false;
  const symbol = ticker.toUpperCase();
  const inScope =
    job.scope.kind === "any" || (job.scope.kind === "tickers" && job.scope.tickers.some((item) => item.toUpperCase() === symbol)) || (job.scope.kind === "watchlist" && tracksTicker);
  if (!inScope) return false;
  const have = job.trigger;
  const wanted = want.trigger;
  if (have.type === "event" && wanted.type === "event") {
    if (have.event !== wanted.event) return false;
    if (have.event === "sec_filing") return filingsCover(have.filings, wanted.filings);
    if (have.event === "news") return !have.news || have.news === "any" || have.news === wanted.news;
    if (have.event === "call_change") return !have.to || have.to === wanted.to;
    return true;
  }
  if (have.type === "price" && wanted.type === "price") {
    if (have.rule !== wanted.rule) return false;
    if (have.rule === "moves_pct") return (have.pct ?? 5) <= (wanted.pct ?? 5);
    if (have.rule === "crosses_above" || have.rule === "crosses_below") {
      const a = have.level ?? 0;
      const b = wanted.level ?? 0;
      return b > 0 && Math.abs(a - b) <= b * 0.01;
    }
    return true;
  }
  return have.type === wanted.type;
}

/** "watching" when a running agent already covers it, "paused" when only a paused one does, else "new". */
export function watchStatus(suggestion: Pick<WatchAgentSuggestion, "draft">, jobs: ExistingJob[], ticker: string, tracksTicker: boolean): WatchStatus {
  const covering = jobs.filter((job) => jobCovers(job, suggestion, ticker, tracksTicker));
  if (covering.some((job) => job.enabled)) return "watching";
  return covering.length > 0 ? "paused" : "new";
}
