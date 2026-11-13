/**
 * How a recipe's replay, an agent's quiet runs and an agent's dated history are said. Every run of every agent ends
 * in a decision; a quiet one is said as what it checked ("Checked NVDA filings: nothing new"), one line per day.
 * Pure: safe on the client.
 */

import { absoluteDay, capitalize, dayWords } from "@/lib/day-words";
import { presentRun } from "@/lib/agent-jobs-present";
import type { AgentDecision, AgentEvaluation, AgentFinding, AgentJob, AgentReplay, AgentRun, AgentScope, AgentTrigger } from "@/lib/agent-jobs";

/* ── what an agent checked, in a few words ──────────────────────────────── */

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** "NVDA", "NVDA and AMD", "your 12 stocks", "your stocks", "every stock". */
export function scopeWords(scope: AgentScope, tracked: number | null = null): string {
  if (scope.kind === "any") return "every stock";
  if (scope.kind === "tickers") {
    const list = scope.tickers;
    if (list.length <= 2) return list.join(" and ");
    if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]}`;
    return `${list.length} stocks`;
  }
  return tracked ? `your ${tracked} stocks` : "your stocks";
}

/**
 * What one run of this agent looked at, as the quiet line says it: "Checked NVDA filings", "Checked Berkshire
 * Hathaway's 13F filings", "Checked NVDA's closes for a 5% move". Leads every quiet line on the agent's page.
 */
export function checkedWhat(job: { trigger: AgentTrigger; scope: AgentScope }, tracked: number | null = null): string {
  const { trigger, scope } = job;
  const who = scopeWords(scope, tracked);
  const whose = scope.kind === "tickers" && scope.tickers.length === 1 ? possessive(scope.tickers[0]!) : who;
  if (trigger.type === "schedule") return `Checked ${who}`;
  if (trigger.type === "price") {
    if (trigger.rule === "moves_pct") return `Checked ${whose} closes for a ${trigger.pct ?? 5}% move`;
    if (trigger.rule === "enters_buy_zone") return `Checked ${whose} closes against the buy-more level`;
    if (trigger.rule === "enters_sell_zone") return `Checked ${whose} closes and our call`;
    return `Checked ${whose} closes`;
  }
  switch (trigger.event) {
    case "fund_13f":
      return trigger.who ? `Checked ${possessive(trigger.who.name)} 13F filings` : "Checked new 13F filings";
    case "congress_trade":
      return trigger.who ? `Checked ${possessive(trigger.who.name)} disclosures` : scope.kind === "any" ? "Checked Congress trades" : `Checked Congress trades in ${who}`;
    case "insider_trade":
      return `Checked insider filings in ${who}`;
    case "earnings_approaching":
    case "earnings_reported":
      return `Checked ${whose} report date`;
    case "sec_filing":
      return `Checked ${who} filings`;
    case "filing_risks":
      return `Checked ${who} filings for new risks`;
    case "news":
      return `Checked the news on ${who}`;
    case "call_change":
      return `Checked our call on ${who}`;
    default:
      return `Checked ${who} on the movers list`;
  }
}

/** A quiet or blocked run as one line: "Checked NVDA filings: nothing new", "Couldn't check: the earnings calendar…". */
export function quietLine(job: { trigger: AgentTrigger; scope: AgentScope }, run: Pick<AgentEvaluation, "decision" | "summary">, tracked: number | null = null): string {
  if (run.decision === "could_not_check") {
    const why = run.summary.replace(/^Could not check:\s*/i, "").replace(/\.$/, "");
    return `Couldn't check: ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  }
  return `${checkedWhat(job, tracked)}: nothing new`;
}

/* ── an agent's dated history ───────────────────────────────────────────── */

export type HistoryRow = {
  /** The newest day of the row. */
  day: string;
  /** "Today", "Yesterday", "Monday", "Oct 30"; a run of quiet days reads "Monday – yesterday". */
  label: string;
  /** How many checks the row stands for: quiet days in a row that said the same are one row (owner rule 1). */
  checks: number;
  decision: AgentDecision;
  text: string;
  /** Stocks the run named, for their logos (at most three). */
  tickers: string[];
};

/**
 * One row per check, newest first: what it sent, or what it checked when it had nothing to say. Quiet checks in a row
 * that say the same thing are one dated row ("Monday – yesterday · 3 checks"), so no sentence repeats down the list.
 */
export function historyRows(runs: readonly AgentRun[], job: Pick<AgentJob, "trigger" | "scope">, today: string, tracked: number | null = null): HistoryRow[] {
  const rows = [...runs]
    .sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at))
    .filter((run, index, list) => list.findIndex((other) => other.day === run.day) === index)
    .map((run) => {
      const view = run.decision === "notify" ? presentRun(run, job) : null;
      // A run whose only findings were stale quotes reads as quiet (presentRun decides that).
      const decision: AgentDecision = view && view.verdict === "quiet" ? "nothing" : run.decision;
      return {
        day: run.day,
        label: capitalize(dayWords(run.day, today)) || run.day,
        checks: 1,
        decision,
        text: decision === "notify" && view ? view.headline : quietLine(job, { ...run, decision }, tracked),
        tickers: [...new Set(run.findings.map((finding) => finding.ticker).filter((ticker): ticker is string => Boolean(ticker)))].slice(0, 3),
      };
    });
  const out: Array<HistoryRow & { oldest: string }> = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.decision !== "notify" && row.decision === last.decision && row.text === last.text) {
      last.checks += 1;
      last.oldest = row.day;
      last.label = `${capitalize(dayWords(row.day, today)) || row.day} – ${dayWords(last.day, today) || last.day}`;
      continue;
    }
    out.push({ ...row, oldest: row.day });
  }
  return out.map(({ oldest: _oldest, ...row }) => row);
}

/** How many history rows show before "Show N more". */
export const HISTORY_ROWS = 8;

/* ── today's quiet line on /agent ───────────────────────────────────────── */

export type TodayRun = { decision: "notify" | "nothing" | "could_not_check" | "propose"; line?: string };

/**
 * The one line /agent's record shows for today's quiet checks, across every kind of agent: "4 agents checked, nothing
 * needs you."; "Checked NVDA filings: nothing new." when one agent ran; "3 other agents checked, nothing else needs
 * you." beside one that found something; "3 agents checked, nothing needs you; 1 couldn't check." when the rest only
 * could not read their source. Null when none of today's checks was quiet.
 */
export function todayQuietText(runs: readonly TodayRun[]): string | null {
  const quiet = runs.filter((run) => run.decision === "nothing");
  if (quiet.length === 0) return null;
  const found = runs.some((run) => run.decision === "notify" || run.decision === "propose");
  const blocked = runs.filter((run) => run.decision === "could_not_check").length;
  const agents = (count: number) => `${count} ${count === 1 ? "agent" : "agents"}`;
  if (found) return `${quiet.length} other ${quiet.length === 1 ? "agent" : "agents"} checked, nothing else needs you.`;
  if (blocked > 0) return `${agents(quiet.length)} checked, nothing needs you; ${blocked} couldn't check.`;
  if (quiet.length === 1 && quiet[0]!.line) return `${quiet[0]!.line}.`;
  return `${agents(quiet.length)} checked, nothing needs you.`;
}

/* ── a recipe's replay, for the sheet ───────────────────────────────────── */

export type ReplaySent = {
  day: string;
  /** "Yesterday", "Monday", "Oct 19". */
  label: string;
  headline: string;
  /** A second line from the first finding (its reason, its bracket, the risk in the company's words), or null. */
  detail: string | null;
  tickers: string[];
  href: string | null;
  /** A one-stock move: the close it moved to and the move, shown as the row's figure. */
  close: number | null;
  change_pct: number | null;
};

export type ReplayView = {
  from: string;
  to: string;
  /** "Oct 16 to Nov 12". */
  span: string;
  sessions: number;
  sent: ReplaySent[];
  quiet: number;
  unchecked: number;
  /** What it read over the four weeks, one line each: counts added up across the days, the rest as of the last day. */
  checked: string[];
  /** A quiet replay in one line: what it read, or what it is waiting for ("Next report: NVDA on Nov 17."). */
  quietLine: string;
  /** The replay's caveats, one line each. */
  notes: string[];
};

const SUMMED = /^(.+?) (dated|filed|compared on) (.+): ([\d,]+)$/;

/** Labels that start with an ordinary word, lowered inside a sentence; a name ("Berkshire Hathaway's") keeps its capital. */
const COMMON_START = /^(Insider|Congressional|Filings|Buys|Trades|Daily)\b/;

/**
 * Four quiet weeks in one line: the report it is waiting for, else the records it read ("Insider filings: 772 in
 * 20 market days." / "No 13F filings from Berkshire Hathaway in 20 market days."), else that it had nothing to tell.
 */
export function quietSummary(checked: readonly string[], sessions: number): string {
  const next = checked.find((line) => /^Next report: /.test(line));
  if (next) return `${next}.`;
  const days = `${sessions} market ${sessions === 1 ? "day" : "days"}`;
  // The last count is the narrowest (the stock's own buys after every insider filing read), so it leads.
  for (const line of [...checked].reverse()) {
    const match = SUMMED.exec(line);
    if (!match) continue;
    const label = COMMON_START.test(match[1]!) ? `${match[1]!.charAt(0).toLowerCase()}${match[1]!.slice(1)}` : match[1]!;
    const count = Number(match[4]!.replace(/,/g, ""));
    return count === 0 ? `No ${label} in ${days}.` : `${match[1]}: ${count.toLocaleString("en-US")} in ${days}.`;
  }
  return `Nothing to tell in ${days}.`;
}

/** "Insider filings dated Nov 12: 78" over twenty days becomes "Insider filings dated Oct 16 to Nov 12: 1,034". */
export function checkedOverall(runs: ReadonlyArray<Pick<AgentEvaluation, "checked">>, span: string): string[] {
  const sums = new Map<string, { verb: string; total: number }>();
  const latest: string[] = [];
  const order: string[] = [];
  runs.forEach((run, index) => {
    for (const line of run.checked) {
      const match = SUMMED.exec(line);
      if (match) {
        const key = match[1]!;
        const held = sums.get(key);
        if (!held) order.push(`sum:${key}`);
        sums.set(key, { verb: match[2]!, total: (held?.total ?? 0) + Number(match[4]!.replace(/,/g, "")) });
      } else if (index === 0 && !latest.includes(line)) {
        latest.push(line);
        order.push(`line:${line}`);
      }
    }
  });
  return order.map((entry) => {
    if (entry.startsWith("line:")) return entry.slice(5);
    const key = entry.slice(4);
    const held = sums.get(key)!;
    return `${key} ${held.verb} ${span}: ${held.total.toLocaleString("en-US")}`;
  });
}

/**
 * The second line of a day it would have spoken: a move's reason (its close and size are the row's figure, never
 * said again), a disclosure's bracket, the new risk in the company's words.
 */
function detailOf(finding: AgentFinding | undefined): string | null {
  if (!finding) return null;
  if (finding.kind === "move" || finding.kind === "level") return finding.reason ?? null;
  // A report date's line repeats the row's day; only when in the day it comes is worth keeping.
  if (finding.kind === "earnings" && /^Scheduled for /.test(finding.detail ?? "")) {
    return / before the open/.test(finding.detail) ? "Before the open." : / after the close/.test(finding.detail) ? "After the close." : null;
  }
  // A filing's own line only says when it was filed and that the link opens it: the row's day and link say both.
  if (finding.form && /^Filed with the SEC\b/.test(finding.detail ?? "")) {
    const also = /It also covers ([^.]+)\./.exec(finding.detail);
    return also ? `Also covers ${also[1]}.` : null;
  }
  const said = (finding.detail ?? "").replace(/\s*Filings report a bracket, never an exact amount\.?/, "").trim();
  return said || null;
}

/** The replay as the sheet shows it: the days it would have spoken, newest first, and what it checked. */
export function replayView(replay: Pick<AgentReplay, "from" | "to" | "sessions" | "runs" | "counts" | "notes">, today: string): ReplayView {
  const span = `${absoluteDay(replay.from, today)} to ${absoluteDay(replay.to, today)}`;
  const sent = replay.runs
    .filter((run) => run.decision === "notify")
    .map((run) => {
      const first = run.findings[0];
      return {
        day: run.day,
        label: capitalize(dayWords(run.day, today)) || run.day,
        // The row's figure shows the move, so the sentence keeps only what it adds ("NVDA fell, about three times a normal day").
        headline:
          run.findings.length === 1 && first
            ? first.change_pct != null && first.close != null
              ? first.headline
                  .replace(/ (rose|fell) [\d.]+% in a day/, " $1")
                  .replace(/ and closed (up|down) [\d.]+%/, "")
                  .replace(/; (up|down) [\d.]+% after hours at \$[\d,.]+/, "")
              : first.headline
            : run.summary.replace(/\.$/, ""),
        detail: run.findings.length === 1 ? detailOf(first) : null,
        tickers: [...new Set(run.findings.map((finding) => finding.ticker).filter((ticker): ticker is string => Boolean(ticker)))].slice(0, 3),
        href: first?.url ?? null,
        close: run.findings.length === 1 && first?.close != null ? first.close : null,
        change_pct: run.findings.length === 1 && first?.change_pct != null ? first.change_pct : null,
      };
    });
  const checked = checkedOverall(replay.runs, span).filter((line) => !/^(Names in scope|Investor):/.test(line));
  return {
    from: replay.from,
    to: replay.to,
    span,
    sessions: replay.sessions,
    sent,
    quiet: replay.counts.nothing,
    unchecked: replay.counts.could_not_check,
    checked,
    quietLine: quietSummary(checked, replay.sessions),
    // The first note says what a replay is; the sheet already says so in its own words.
    notes: replay.notes.slice(1).filter((note) => !/names you track today/.test(note)),
  };
}
