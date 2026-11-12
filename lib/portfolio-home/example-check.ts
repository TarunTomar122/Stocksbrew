import { shortDate, type AgentDecision, type AgentFinding, type AgentJobDraft, type AgentRunCounts, type AgentScope, type AgentTrigger } from "@/lib/agent-jobs";
import { agentHref, describeWatch, nextCheckFor, runDetailFromDoc, runTickers, stampWords } from "@/lib/agent-watch";
import { capitalize, dayPossessive, daysFromToday, onDayWords } from "@/lib/day-words";
import type { AgentsSource } from "@/lib/portfolio-home/log";
import { countWord } from "@/lib/read-format";

/**
 * The example agents' latest checks as My stocks and the landing show them
 * to a visitor: what each agent checked, when (New York time), what it found
 * with its evidence and source, what it decided ("nothing to report" is an
 * answer), and when it checks next. Built only from the runs the after-close
 * runner stored (tm_agent_runs, ./example-check-server.ts reads them); with no
 * recent run there is nothing to show, never a made-up one. Pure.
 */

/** A stored run, cut down to what the check card reads. JSON-safe: it is cached for every visitor. */
export type StoredCheck = {
  job_id: string;
  day: string;
  ran_at: string;
  decision: AgentDecision;
  summary: string;
  findings: Array<Pick<AgentFinding, "ticker" | "headline" | "detail" | "source" | "url" | "at"> & Partial<Pick<AgentFinding, "kind" | "change_pct" | "close">>>;
  /** Every finding the run stored, when more were kept than `findings` holds. */
  findingCount?: number;
  checked: string[];
  latest_close: string | null;
  counts: AgentRunCounts | null;
};

export type ExampleAgentDef = { id: string; ask: string; trigger: AgentTrigger };

export type CheckView = {
  id: string;
  /** The rule, as a person would ask for it. */
  ask: string;
  day: string;
  /** "Nov 10 at 5:41 PM ET". */
  when: string;
  ranAt: string;
  decision: AgentDecision;
  /** What it found, in one sentence: the finding, or "Nothing to report" with why. */
  outcome: string;
  /** What it looked at, in one sentence. */
  checked: string;
  /** The evidence, at most MAX_SHOWN, each with its source. */
  findings: StoredCheck["findings"];
  /** Findings past the ones shown. */
  more: number;
  /** What it decided to do, as a sentence ("It stayed quiet. Nothing needed you."). */
  decided: string;
  /** YYYY-MM-DD of its next after-close check, only when the run log proves the runner is checking it. */
  next: string | null;
  /** The stocks it looked at, when the rule names them (a watchlist rule reads whatever is tracked that night). */
  stocks: string[];
  /** The stocks its findings name, in order. */
  flagged: string[];
};

export type ExampleChecksView = {
  /** The check to lead with: the newest one that found something, else the newest. */
  featured: CheckView;
  /** The other agents' newest checks, in the order the agents are listed. */
  others: CheckView[];
  /** The stocks the agents watch. */
  tickers: string[];
};

/** Evidence lines shown per check; the rest are counted. */
export const MAX_SHOWN = 3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const CLOSE_LINE = /^Closed at (\$[\d,.]+) on ([A-Z][a-z]{2} \d{1,2}), ([−+-])([\d.]+)% on the day before \((\$[\d,.]+)\)\.$/;

/** A price rule's evidence in plain words: "Closed at $168.89 on Nov 10, down 5.47% from $178.67 the day before." */
function evidenceWords(detail: string): string {
  const match = CLOSE_LINE.exec(detail.trim());
  if (!match) return detail;
  const [, close, day, sign, pct, prev] = match;
  return `Closed at ${close} on ${day}, ${sign === "+" ? "up" : "down"} ${pct}% from ${prev} the day before.`;
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return !trimmed || /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The evaluator writes for a person's own list ("your names"); the example's stocks are "these stocks". */
function forExample(text: string): string {
  return plainStocks(text.replace(/\byour names\b/gi, "these stocks").replace(/\bof yours\b/gi, "of these").replace(/, and you were already told\b/g, ", which it had already said"));
}

/** The evaluator's own words made plain for anyone: "names" are stocks, and "Checked, nothing to do." is left out. */
function plainStocks(text: string): string {
  return (
    text
      .replace(/^Checked, nothing to do\.\s*/i, "")
      .replace(/\byour names\b/gi, "your stocks")
      // Only the evaluator's own counting phrases: a filing or news headline may say "name" and mean it.
      .replace(/\b(the \d+|\d+|all|The one|the one) names?\b/g, (_whole, lead: string) => `${lead} ${/^(the one|The one|1)$/.test(lead) ? "stock" : "stocks"}`)
      .replace(/^Names in scope\b/, "Stocks watched")
  );
}

function stocksWord(n: number): string {
  return n === 1 ? "one stock" : `${countWord(n).toLowerCase()} stocks`;
}

/** Whose stocks a check is about: the example's ("these stocks") or the person's own ("your names" as written). */
export type CheckAudience = "example" | "mine";

function wordsFor(audience: CheckAudience): (text: string) => string {
  return audience === "example" ? forExample : plainStocks;
}

function outcomeOf(run: StoredCheck, trigger: AgentTrigger | undefined, today: string, audience: CheckAudience = "example"): string {
  const say = wordsFor(audience);
  if (run.decision === "could_not_check") return sentence(say(run.summary.replace(/^Could not check:\s*/i, "It could not check: "))) || "It could not check this time.";
  if (trigger?.type === "price" && trigger.rule === "moves_pct") {
    const pct = trigger.pct ?? 5;
    if (run.decision === "notify" && run.findings.length > 1) {
      return `${countWord(run.findings.length)} stocks moved ${pct}% or more in a day: ${run.findings.map((finding) => finding.ticker).filter(Boolean).join(", ")}.`;
    }
    if (run.decision === "nothing") {
      const priced = run.counts?.priced ?? 0;
      const on = run.latest_close ? onDayWords(run.latest_close, today) || `on ${shortDate(run.latest_close)}` : "";
      if (run.latest_close && priced === 1) return `Nothing to report. The one stock with a new close did not move ${pct}% or more ${on}.`;
      if (run.latest_close && priced > 1) {
        return `Nothing to report. None of the ${stocksWord(priced)} moved ${pct}% or more ${on}.`;
      }
      return "Nothing to report. There was no new close to check.";
    }
  }
  if (run.decision === "nothing") {
    const why = sentence(say(run.summary));
    return why ? `Nothing to report. ${why}` : "Nothing to report.";
  }
  return sentence(say(run.summary)) || "It found something to tell you.";
}

function checkedOf(run: StoredCheck, trigger: AgentTrigger | undefined, watched: number, today: string, audience: CheckAudience = "example"): string {
  const say = wordsFor(audience);
  const these = audience === "example" ? "these" : "your";
  if (trigger?.type === "event" && trigger.event === "earnings_approaching") {
    const days = trigger.days_before ?? 3;
    return `Report dates for ${watched > 0 ? `the ${stocksWord(watched)}` : `${audience === "example" ? "these" : "your"} stocks`} over the next ${days === 1 ? "day" : `${days} days`}.`;
  }
  if (trigger?.type === "price") {
    const priced = run.counts?.priced ?? null;
    const names = run.counts?.names ?? watched;
    const which =
      names <= 0
        ? `${these} stocks`
        : priced == null || priced === names
          ? `the ${stocksWord(names)}`
          : `${countWord(priced).toLowerCase()} of the ${stocksWord(names)}`;
    if (!run.latest_close) return `Closing prices for ${which}.`;
    // "Yesterday's closing prices", "Monday's" within the week; "Nov 3 closing prices" before.
    const gap = daysFromToday(run.latest_close, today);
    const day = gap !== null && Math.abs(gap) <= 6 ? capitalize(dayPossessive(run.latest_close, today)) : shortDate(run.latest_close);
    return `${day} closing prices for ${which}.`;
  }
  if (trigger?.type === "event" && trigger.event === "sec_filing") {
    const all = /^SEC filings from (.+?): (\d+) filings? across/.exec(run.checked[0] ?? "");
    const mine = /, (\d+) filings? from them/.exec(run.checked[1] ?? "");
    if (all && mine) {
      // What was checked, not how many filings the whole market made (owner rule 8). A watchlist rule's own count
      // of stocks is not stored; without one the sentence says "your stocks".
      return `SEC filings from ${all[1]} for ${watched > 0 ? `${these} ${stocksWord(watched)}` : `${these} stocks`}.`;
    }
    return `New SEC filings from ${these} stocks.`;
  }
  const lines = run.checked.filter((line) => !/^Names in scope/i.test(line)).map((line) => say(line));
  return lines.length > 0 ? sentence(lines.join("; ")) : "Its sources for the day.";
}

const DECIDED: Record<AgentDecision, string> = {
  notify: "It decided to tell you.",
  nothing: "It stayed quiet. Nothing needed you.",
  could_not_check: "It said it couldn't check, rather than guess.",
};

/** The stored runs as the sources for nextCheckFor (lib/agent-watch.ts). */
function asSourceRuns(runs: StoredCheck[]): AgentsSource["runs"] {
  return runs.map((run) => ({ job_id: run.job_id, job_name: "", day: run.day, ran_at: run.ran_at, decision: run.decision, summary: run.summary }));
}

function newer(a: StoredCheck, b: StoredCheck): boolean {
  return a.day > b.day || (a.day === b.day && a.ran_at > b.ran_at);
}

/**
 * One agent's newest run among `runs` (up to `today`), shaped for the page, or null when it has none.
 * `stocks` are the stocks its rule names; `total` overrides their count when only the count is known.
 */
export function checkView(
  agent: ExampleAgentDef,
  runs: StoredCheck[],
  today: string,
  options: { stocks: string[]; audience: CheckAudience; total?: number | null; enabled?: boolean },
): CheckView | null {
  const own = runs.filter((run) => run.job_id === agent.id && DAY.test(run.day) && run.day <= today);
  const latest = own.reduce<StoredCheck | null>((best, run) => (!best || newer(run, best) ? run : best), null);
  if (!latest) return null;
  const shown = latest.decision === "notify" ? latest.findings.slice(0, MAX_SHOWN).map((finding) => ({ ...finding, detail: evidenceWords(finding.detail) })) : [];
  const total = latest.counts?.names ?? options.total ?? options.stocks.length;
  return {
    id: agent.id,
    ask: agent.ask,
    day: latest.day,
    when: stampWords(latest.ran_at || null, latest.day, today),
    ranAt: latest.ran_at,
    decision: latest.decision,
    outcome: outcomeOf(latest, agent.trigger, today, options.audience),
    checked: checkedOf(latest, agent.trigger, total, today, options.audience),
    findings: shown,
    more: latest.decision === "notify" ? Math.max(0, (latest.findingCount ?? latest.findings.length) - shown.length) : 0,
    decided: DECIDED[latest.decision],
    next: nextCheckFor({ enabled: options.enabled ?? true, trigger: agent.trigger }, asSourceRuns(own), today),
    stocks: options.stocks,
    flagged: latest.decision === "notify" ? runTickers(latest.findings) : [],
  };
}

type OwnJob = AgentsSource["jobs"][number];

/**
 * A person's own agent's newest stored run as an opened check, or null when it has not run (or its run was read
 * without the detail). The rule is the agent's own words (lib/agent-watch.ts describeWatch).
 */
export function ownCheckView(job: OwnJob, runs: AgentsSource["runs"], today: string): CheckView | null {
  const stored: StoredCheck[] = runs
    .filter((run) => run.job_id === job.id && run.detail)
    .map((run) => ({
      job_id: run.job_id,
      day: run.day,
      ran_at: run.ran_at,
      decision: run.decision,
      summary: run.summary,
      findings: run.detail!.findings,
      findingCount: run.detail!.findingCount,
      checked: run.detail!.checked,
      latest_close: run.detail!.latest_close,
      counts: run.detail!.counts,
    }));
  if (stored.length === 0 || !job.trigger) return null;
  const scope: AgentScope | undefined = job.scope;
  const stocks = scope?.kind === "tickers" ? scope.tickers.map((ticker) => ticker.toUpperCase()) : [];
  // The next check is proven from all of this job's runs, the ones read without detail too.
  const view = checkView({ id: job.id, ask: describeWatch(job), trigger: job.trigger }, stored, today, { stocks, audience: "mine", enabled: job.enabled });
  if (!view) return null;
  return { ...view, next: nextCheckFor(job, runs.filter((run) => run.job_id === job.id), today) };
}

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

function listAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length <= 3) return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  return `${items.slice(0, 3).join(", ")} and ${items.length - 3} more`;
}

export type CheckSteps = {
  /** A question for Ask about this check, with the item it starts from (lib/ask-context.ts). */
  ask: { question: string; context: string };
  /** Where to change the rule: the person's own agent. None for the example (the panel offers one "Set one up"). */
  change: { label: string; href: string } | null;
};

/**
 * The two steps under an opened check: ask about it, and change the watch. A person's own check opens its agent
 * in Ask (`agent:<id>`); the example's opens the stock it flagged, or the example portfolio.
 */
export function checkSteps(view: Pick<CheckView, "id" | "day" | "decision" | "flagged">, audience: CheckAudience): CheckSteps {
  const whose = audience === "mine" ? "my agent" : "the example's agent";
  const on = DAY.test(view.day) ? ` on ${shortDate(view.day)}` : "";
  const flagged = view.flagged.filter((ticker) => TICKER.test(ticker));
  const question =
    view.decision === "notify" && flagged.length > 0
      ? `Why did ${whose} flag ${listAnd(flagged)}${on}, and does it need ${audience === "mine" ? "me" : "attention"}?`
      : view.decision === "notify"
        ? `What did ${whose} find${on}, and does it need ${audience === "mine" ? "me" : "attention"}?`
        : view.decision === "could_not_check"
          ? `Why couldn't ${whose} check${on}, and is anything missed?`
          : `What did ${whose} check${on}, and what would make it speak up?`;
  if (audience === "mine") {
    return { ask: { question, context: `agent:${view.id}` }, change: { label: "Change this watch", href: agentHref(view.id) } };
  }
  return {
    ask: { question, context: flagged.length === 1 ? `stock:${flagged[0]}` : "ex.portfolio" },
    change: null,
  };
}

/**
 * Each example agent's newest run, shaped for the page, or null when none has run in the window the
 * loader read (then the page shows nothing about them). `today` is the New York day.
 */
export function shapeExampleChecks(input: { agents: ExampleAgentDef[]; runs: StoredCheck[]; tickers: string[] }, today: string): ExampleChecksView | null {
  const views = input.agents
    .map((agent) => checkView(agent, input.runs, today, { stocks: input.tickers, audience: "example" }))
    .filter((view): view is CheckView => view !== null);
  if (views.length === 0) return null;
  const newestDay = views.reduce((day, view) => (view.day > day ? view.day : day), "");
  // The newest day's check that found something, else one that checked and found nothing, else whatever ran.
  const rank: Record<AgentDecision, number> = { notify: 0, nothing: 1, could_not_check: 2 };
  const featured = views.filter((view) => view.day === newestDay).sort((a, b) => rank[a.decision] - rank[b.decision])[0]!;
  return { featured, others: views.filter((view) => view !== featured), tickers: input.tickers };
}

/** A stored run document, cut down; null for anything that is not one of `uid`'s runs. */
export function storedCheckFromDoc(data: Record<string, unknown> | undefined, uid: string): StoredCheck | null {
  if (!data || data.uid !== uid) return null;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const decision = data.decision;
  const jobId = text(data.job_id);
  const day = text(data.day);
  if (!jobId || !DAY.test(day) || (decision !== "notify" && decision !== "nothing" && decision !== "could_not_check")) return null;
  // Every finding: the example's findings are matched to the cards by the stocks they name.
  const detail = runDetailFromDoc(data, Number.POSITIVE_INFINITY);
  return {
    job_id: jobId,
    day,
    ran_at: text(data.ran_at),
    decision,
    summary: text(data.summary),
    findings: detail.findings,
    findingCount: detail.findingCount,
    checked: detail.checked,
    latest_close: detail.latest_close,
    counts: detail.counts,
  };
}

/**
 * When the check ran, said the way a person would, from `now` (New York time): "last night", "this
 * morning", "this evening", "today", "yesterday", "on Monday" within the week or "on Nov 3".
 */
export function ranWords(ranAt: string, day: string, now: Date = new Date()): string {
  const at = new Date(ranAt);
  const clock = (date: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  };
  const today = clock(now).day;
  if (Number.isNaN(at.getTime())) return DAY.test(day) ? onDayWords(day, today) || `on ${shortDate(day)}` : "recently";
  const ran = clock(at);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDay = yesterday.toISOString().slice(0, 10);
  if (ran.day === today) {
    if (ran.hour < 5) return "last night";
    if (ran.hour < 12) return "this morning";
    if (ran.hour >= 17) return "this evening";
    return "today";
  }
  if (ran.day === yesterdayDay && ran.hour >= 17) return "last night";
  return onDayWords(ran.day, today) || `on ${shortDate(ran.day)}`;
}

/**
 * The example agents and their runs as an AgentsSource (lib/portfolio-home/log.ts), for matching a finding to the
 * example agent that watches it. Null with no runs: an agent that has never run is not claimed to be watching.
 */
export function exampleAgentsSource(agents: Array<{ id: string; draft: Pick<AgentJobDraft, "name" | "trigger" | "scope"> }>, runs: StoredCheck[]): AgentsSource | null {
  const ids = new Set(agents.map((agent) => agent.id));
  const own = runs.filter((run) => ids.has(run.job_id));
  if (own.length === 0) return null;
  return {
    jobs: agents.map((agent) => ({ id: agent.id, name: agent.draft.name, enabled: true, trigger: agent.draft.trigger, scope: agent.draft.scope })),
    runs: own.map((run) => ({
      ...asSourceRuns([run])[0]!,
      tickers: run.decision === "notify" ? runTickers(run.findings) : [],
      // What it found, for the agent rows' stock chips (lib/portfolio-home/agent-lines.ts).
      detail: { findings: run.findings, findingCount: run.findingCount ?? run.findings.length, checked: run.checked, latest_close: run.latest_close, counts: run.counts },
    })),
  };
}

/* ── one flagged move, tied to what comes next ─────────────────────────── */

/** A move an agent flagged on one stock: its size and the day it closed there. */
/** `close`: the price the flagged move ended at, from the run's own evidence, or null when it did not say. */
export type FlaggedMove = { ticker: string; pct: number; day: string; close: number | null };

/** The close a price finding ended at: its own field, else its evidence line ("Closed at $168.89 on Nov 10, ..."). */
export function findingClose(finding: { close?: number | null; detail?: string | null }): number | null {
  if (typeof finding.close === "number" && Number.isFinite(finding.close) && finding.close > 0) return finding.close;
  const match = /^Closed at \$([\d,]+(?:\.\d+)?)\b/.exec((finding.detail ?? "").trim());
  const value = match ? Number(match[1]!.replace(/,/g, "")) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** A flag older than this many days is not "lately": nothing is tied to it. */
const FLAG_MAX_DAYS = 5;


/**
 * The newest move the agents flagged on a single stock, from the checks as shown (featured first): its ticker, its
 * move and the close it was on. Null when no check found exactly one stock's move with a number. Pure.
 */
export function flaggedMove(checks: Pick<ExampleChecksView, "featured" | "others"> | null | undefined, today?: string): FlaggedMove | null {
  if (!checks) return null;
  for (const view of [checks.featured, ...checks.others]) {
    if (view.decision !== "notify") continue;
    const moves = view.findings.filter((finding) => finding.ticker && typeof finding.change_pct === "number" && Number.isFinite(finding.change_pct));
    if (moves.length !== 1 || view.more > 0) continue;
    const finding = moves[0]!;
    const day = DAY.test(finding.at ?? "") ? finding.at! : view.day;
    if (today && DAY.test(today) && DAY.test(day) && (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000 > FLAG_MAX_DAYS) return null;
    return { ticker: finding.ticker!.toUpperCase(), pct: finding.change_pct!, day, close: findingClose(finding) };
  }
  return null;
}

/** "$168.89", "$1,234.50". */
function priceWords(price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Within this many percent of a call level, the close is "near" it. */
const NEAR_LEVEL_PCT = 3;

/**
 * Where the close sits against the call's own level: ", below the buy-more level", ", near the sell-some level", or
 * nothing when it is far from it. Only a level the reader may see is passed in (lib/entitlements: signed out, none).
 */
function levelWords(close: number, level: { call: "Buy more" | "Sell some"; price: number }): string {
  if (!Number.isFinite(level.price) || level.price <= 0) return "";
  const away = ((close - level.price) / level.price) * 100;
  if (level.call === "Buy more") return away <= 0 ? ", below the buy-more level" : away <= NEAR_LEVEL_PCT ? ", near the buy-more level" : "";
  return away >= 0 ? ", above the sell-some level" : away >= -NEAR_LEVEL_PCT ? ", near the sell-some level" : "";
}

/**
 * "Your agent flagged NVDA's 5.5% drop to $168.89 on Nov 10.": the flag as the briefing's card and the inbox's read
 * both say it, word for word, ending on the price the move took it to (judges, ship 50). With `today` (a page rendered
 * at request time) the day is said in words, "yesterday" or "on Tuesday" (lib/day-words.ts); without it, the close's
 * own date, for anything cached or stored. With a call level the reader may see, where the close sits against it:
 * "...to $168.89 on Nov 10, below the buy-more level." Never a level a signed-out reader could not see: the caller
 * passes none.
 */
export function flagWords(
  flag: Pick<FlaggedMove, "ticker" | "pct" | "day"> & { close?: number | null },
  level: { call: "Buy more" | "Sell some"; price: number } | null = null,
  today: string | null = null,
): string {
  const when = DAY.test(flag.day) ? ` ${(today && onDayWords(flag.day, today)) || `on ${shortDate(flag.day)}`}` : "";
  const close = typeof flag.close === "number" && Number.isFinite(flag.close) && flag.close > 0 ? flag.close : null;
  const to = close !== null ? ` to ${priceWords(close)}` : "";
  const near = close !== null && level ? levelWords(close, level) : "";
  return `Your agent flagged ${flag.ticker}'s ${Math.abs(flag.pct).toFixed(1)}% ${flag.pct < 0 ? "drop" : "jump"}${to}${when}${near}.`;
}

/** The one step after a flag with a report ahead, said the same on the briefing and in the inbox. */
export function flagReportStep(ticker: string): string {
  return `Check our call on ${ticker} before the report.`;
}

/**
 * The step after a flag on My stocks, in the words the briefing's card and the inbox's read use for it: "Check our
 * call on NVDA before the report." with a report in the next two weeks, else "Check our call on NVDA.".
 */
export function flagStep(ticker: string, reportAhead: boolean): string {
  return reportAhead ? flagReportStep(ticker) : `Check our call on ${ticker}.`;
}

/** Where that step goes: the stock's page at our call (components/stock-report/report.tsx `#call`). */
export function callHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}#call`;
}

/** A report soon enough to be the step after a flagged move. */
const STEP_REPORT_DAYS = 14;

/** "5.9%", "16%": as the briefing's earnings card says a usual report move. */
function usualWord(value: number): string {
  return Math.abs(value) >= 10 ? `${Math.round(Math.abs(value))}%` : `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * The step after a flagged move, from real data only: "NVDA reports on Tuesday after the close, and a report usually
 * moves it about 3.2%. Check our call on it before then." With no report in the next two weeks, the step is the call
 * itself. `when` is the report day in words ("on Tuesday", lib/earnings-season.ts whenWords). Pure.
 */
export function flagStepWords(input: {
  ticker: string;
  report: { day: string; when: string; session: string } | null;
  usualPct: number | null;
  today: string;
}): string {
  const { ticker, report } = input;
  const gap = report && DAY.test(report.day) && DAY.test(input.today) ? Math.round((Date.parse(`${report.day}T12:00:00Z`) - Date.parse(`${input.today}T12:00:00Z`)) / 86_400_000) : null;
  // A report today only counts after the close: before the open it may already be out, and "before then" is gone.
  const ahead = gap !== null && (gap >= 1 || (gap === 0 && report?.session === "after the close"));
  if (report && gap !== null && ahead && gap <= STEP_REPORT_DAYS) {
    const usual = input.usualPct !== null && Number.isFinite(input.usualPct) && input.usualPct > 0 ? `, and a report usually moves it about ${usualWord(input.usualPct)}` : "";
    return `${ticker} reports ${report.when}${report.session ? ` ${report.session}` : ""}${usual}. Check our call on it before then.`;
  }
  return `Check our call on ${ticker} before you act on the move.`;
}

/**
 * The example agents' newest day as the agent log's Agents row (lib/agent-log/words.ts withOwnAgents): how many ran
 * that day, how many flagged something, when the last one ran, and the stocks they flagged with the move each found.
 * The row opens My stocks, where the example's agents are. Null without a run. Pure.
 */
export function exampleAgentRuns(checks: Pick<ExampleChecksView, "featured" | "others"> | null | undefined): {
  at: string;
  runs: number;
  found: number;
  stocks: Array<{ ticker: string; pct: number | null }>;
  href: string;
} | null {
  if (!checks) return null;
  const views = [checks.featured, ...checks.others];
  const day = views.reduce((newest, view) => (view.day > newest ? view.day : newest), "");
  const ran = views.filter((view) => view.day === day && view.decision !== "could_not_check" && !Number.isNaN(Date.parse(view.ranAt)));
  if (ran.length === 0) return null;
  const at = ran.map((view) => view.ranAt).sort((a, b) => Date.parse(a) - Date.parse(b)).pop()!;
  const stocks: Array<{ ticker: string; pct: number | null }> = [];
  for (const view of ran) {
    if (view.decision !== "notify") continue;
    for (const ticker of view.flagged) {
      if (stocks.some((stock) => stock.ticker === ticker)) continue;
      const finding = view.findings.find((entry) => entry.ticker?.toUpperCase() === ticker && typeof entry.change_pct === "number" && Number.isFinite(entry.change_pct));
      stocks.push({ ticker, pct: finding ? finding.change_pct! : null });
    }
  }
  return { at, runs: ran.length, found: ran.filter((view) => view.decision === "notify").length, stocks, href: "/portfolio" };
}
