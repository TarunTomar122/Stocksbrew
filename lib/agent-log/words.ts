import { nyDayOf, nyTime } from "./time";
import type { AgentLog, AgentLogEntry, AgentLogSource } from "./types";

/**
 * The agent log's words: each source's stored facts become one line ("72" + "stocks checked before the open; …"),
 * and the day's lines become a log with one lead sentence. Pure plain rules over real counts: a source with nothing
 * to count, or whose work is not from the day, gives no line, and nothing here invents a number.
 */

/* ── facts, as read from the store (lib/agent-log/read.ts) ──────────────── */

export type PremarketFacts = { at: string; scanned: number; bigMoves: number; leader: { ticker: string; pct: number } | null };
/** `withNews`: how many of the briefs had fresh news to read (the rest were brought up to date on prices alone). */
export type BriefsFacts = { at: string; count: number; withNews: number | null };
export type CallChange = { ticker: string; to: "Add" | "Hold" | "Trim"; trigger: string | null };
export type CallsFacts = { at: string; reviewed: number; changes: CallChange[]; heldAgainst: number };
/**
 * `screened`: the total is every big move the day's run looked into (the live `US__latest` list). Once that list
 * has moved on to a later day only the dated copy is left, which keeps the explained moves alone, so there is no
 * honest "of N looked into" any more.
 */
export type MovesFacts = { at: string; total: number; explained: number; screened: boolean; leader: { ticker: string; pct: number } | null };
export type FlaggedFiling = { ticker: string; what: string };
export type FilingsFacts = { at: string; companies: number | null; count: number; flagged: FlaggedFiling[] };
export type InsidersFacts = { at: string; trades: number; buys: number; biggest: { ticker: string; value: number } | null };
export type EarningsFacts = { at: string; count: number; beat: number; missed: number };
export type AgentRunsFacts = { at: string; runs: number; found: number };

export type AgentLogFacts = {
  premarket?: PremarketFacts | null;
  briefs?: BriefsFacts | null;
  calls?: CallsFacts | null;
  moves?: MovesFacts | null;
  filings?: FilingsFacts | null;
  insiders?: InsidersFacts | null;
  earnings?: EarningsFacts | null;
  agents?: AgentRunsFacts | null;
};

/** Most lines the log shows. */
export const MAX_ENTRIES = 7;
/** A premarket move this size or more counts as a gap worth naming. */
export const PREMARKET_GAP_PCT = 3;

/* ── small words ─────────────────────────────────────────────────────────── */

const count = (value: number) => Math.round(value).toLocaleString("en-US");

const pct = (value: number) => `${Math.abs(value).toFixed(1)}%`;

function moved(ticker: string, change: number): string {
  return `${ticker}, ${change >= 0 ? "up" : "down"} ${pct(change)}`;
}

function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `$${Math.round(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const CALL_WORDS: Record<CallChange["to"], string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

const TRIGGER_WORDS: Record<string, string> = {
  earnings: "after its results",
  guidance: "after it changed its outlook",
  move: "after a big move of its own",
  market: "after the market sell-off",
};

const valid = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

function entry(source: AgentLogSource, at: string, figure: number, rest: string, href: string, row: { kind: string; status: string }, quiet = false): AgentLogEntry | null {
  const time = nyTime(at);
  if (!time) return null;
  return { source, at, time, figure: count(figure), rest, href, quiet, kind: row.kind, status: row.status };
}

/* ── one line per source ─────────────────────────────────────────────────── */

export function premarketEntry(facts: PremarketFacts): AgentLogEntry | null {
  if (!valid(facts.scanned)) return null;
  const big = Math.max(0, Math.round(facts.bigMoves));
  const leader = big > 0 ? facts.leader : null;
  const found =
    big === 0
      ? `none was moving ${PREMARKET_GAP_PCT}% or more`
      : `${count(big)} ${big === 1 ? "was" : "were"} moving ${PREMARKET_GAP_PCT}% or more${leader ? `, led by ${moved(leader.ticker, leader.pct)}` : ""}`;
  return entry("premarket", facts.at, facts.scanned, `${facts.scanned === 1 ? "stock" : "stocks"} checked before the open; ${found}.`, "/premarket", {
    kind: "Premarket",
    status: big > 0 ? `${count(big)} of ${count(facts.scanned)} moving` : `${count(facts.scanned)} checked`,
  });
}

function briefsWords(facts: BriefsFacts): string {
  const news = facts.withNews != null && facts.withNews >= 0 && facts.withNews <= facts.count ? Math.round(facts.withNews) : null;
  const tail = news === null || news === facts.count ? "" : news === 0 ? ", none with fresh news" : `, ${count(news)} with fresh news`;
  return `stock ${facts.count === 1 ? "brief" : "briefs"} brought up to date${tail}`;
}

export function briefsEntry(facts: BriefsFacts): AgentLogEntry | null {
  if (!valid(facts.count)) return null;
  return entry("briefs", facts.at, facts.count, `${briefsWords(facts)}.`, "/screener", { kind: "Briefs", status: `${count(facts.count)} updated` });
}

function changeWords(change: CallChange): string {
  const why = change.trigger ? TRIGGER_WORDS[change.trigger] : undefined;
  return `${change.ticker} to ${CALL_WORDS[change.to]}${why ? ` ${why}` : ""}`;
}

/**
 * What happened to the calls, after a count of them or of the briefs: "none changed" or "1 changed: AAOI to Sell
 * some after its results". Calls the rule held against the day's read are not counted out loud: that is how the
 * rule works, not news (owner rule 8).
 */
function callWords(facts: CallsFacts, standalone: boolean): { text: string; one: string | null } {
  const changes = facts.changes.filter((change) => change.ticker && CALL_WORDS[change.to]);
  if (changes.length === 0) return { text: standalone ? "none changed" : "no call changed", one: null };
  const named = changes.slice(0, 2).map(changeWords);
  const more = changes.length > 2 ? [`${count(changes.length - 2)} more`] : [];
  const noun = standalone ? "" : changes.length === 1 ? " call" : " calls";
  return { text: `${count(changes.length)}${noun} changed: ${joinAnd([...named, ...more])}`, one: changes.length === 1 ? changes[0]!.ticker : null };
}

/** The rail row for the calls: how many changed when any did, else how many were looked at. */
function callsRow(facts: CallsFacts, looked: number): { kind: string; status: string } {
  const changed = facts.changes.filter((change) => change.ticker && CALL_WORDS[change.to]).length;
  return changed > 0
    ? { kind: "Calls", status: `${count(changed)} of ${count(facts.reviewed)} changed` }
    : { kind: "Calls", status: `${count(Math.max(looked, facts.reviewed))} checked, none changed` };
}

const callsHref = (one: string | null) => (one ? `/stock/${encodeURIComponent(one)}` : "/screener");

export function callsEntry(facts: CallsFacts): AgentLogEntry | null {
  if (!valid(facts.reviewed)) return null;
  const words = callWords(facts, true);
  return entry("calls", facts.at, facts.reviewed, `${facts.reviewed === 1 ? "call" : "calls"} reviewed; ${words.text}.`, callsHref(words.one), callsRow(facts, facts.reviewed));
}

/**
 * The briefs and the calls come out of the same run, about the same stocks: one line for both, so the log does not
 * show the same count at the same time twice (owner rule 1).
 */
export function reviewEntry(briefs: BriefsFacts, calls: CallsFacts): AgentLogEntry | null {
  if (!valid(briefs.count)) return callsEntry(calls);
  if (!valid(calls.reviewed)) return briefsEntry(briefs);
  const words = callWords(calls, false);
  const at = Date.parse(calls.at) > Date.parse(briefs.at) ? calls.at : briefs.at;
  return entry("calls", at, briefs.count, `${briefsWords(briefs)}; ${words.text}.`, callsHref(words.one), callsRow(calls, briefs.count));
}

export function movesEntry(facts: MovesFacts, whose: string, href: string): AgentLogEntry | null {
  // Moves looked into without a reason we could confirm are not news (owner rule 7): no line.
  if (!valid(facts.total) || !valid(facts.explained)) return null;
  const total = Math.max(facts.total, facts.explained);
  const leader = facts.leader;
  // The leader is named without its figure: the mover row's change is from when the reason was researched, and a
  // live quote elsewhere on the page has moved on since.
  const biggest = leader ? `, including ${leader.ticker}'s, the biggest` : "";
  if (!facts.screened) {
    return entry("moves", facts.at, facts.explained, `big ${facts.explained === 1 ? "move" : "moves"} explained with a reason we could confirm${biggest}.`, href, {
      kind: "Big moves",
      status: `${count(facts.explained)} explained`,
    });
  }
  const reasons = facts.explained === 1 ? "has a reason we could confirm" : "have a reason we could confirm";
  return entry("moves", facts.at, total, `of ${whose} biggest moves looked into; ${count(facts.explained)} ${reasons}${biggest}.`, href, {
    kind: "Big moves",
    status: `${count(facts.explained)} of ${count(total)} explained`,
  });
}

export function filingsEntry(facts: FilingsFacts): AgentLogEntry | null {
  if (!valid(facts.count)) {
    if (!valid(facts.companies)) return null;
    return entry("filings", facts.at, facts.companies, `companies checked for new SEC filings; none had filed anything new.`, "/filings", { kind: "Filings", status: "none new" }, true);
  }
  const flagged = facts.flagged.filter((filing) => filing.ticker && filing.what);
  const noun = facts.count === 1 ? "new SEC filing" : "new SEC filings";
  if (flagged.length === 0) return entry("filings", facts.at, facts.count, `${noun} read; none was big enough to flag.`, "/filings", { kind: "Filings", status: `${count(facts.count)} read` });
  const named = flagged.slice(0, 2).map((filing) => `${filing.what} at ${filing.ticker}`);
  const verb = flagged.length === 1 ? "was" : "were";
  const tail = flagged.length > 2 ? `, including ${joinAnd(named)}` : `: ${joinAnd(named)}`;
  return entry(
    "filings",
    facts.at,
    facts.count,
    `${noun} read; ${count(flagged.length)} ${verb} big enough to flag${tail}.`,
    "/filings",
    { kind: "Filings", status: `${count(flagged.length)} of ${count(facts.count)} flagged` },
  );
}

export function insidersEntry(facts: InsidersFacts): AgentLogEntry | null {
  if (!valid(facts.trades)) return null;
  const buys = Math.max(0, Math.round(facts.buys));
  const noun = facts.trades === 1 ? "insider trade" : "insider trades";
  if (buys === 0) return entry("insiders", facts.at, facts.trades, `${noun} read from Form 4 filings; none was a buy on the open market.`, "/insiders", { kind: "Insiders", status: `${count(facts.trades)} read` });
  const biggest = facts.biggest && valid(facts.biggest.value) ? `, the largest ${money(facts.biggest.value)} at ${facts.biggest.ticker}` : "";
  return entry(
    "insiders",
    facts.at,
    facts.trades,
    `${noun} read from Form 4 filings; ${count(buys)} ${buys === 1 ? "was a buy" : "were buys"} on the open market${biggest}.`,
    "/insiders",
    { kind: "Insiders", status: `${count(buys)} of ${count(facts.trades)} buys` },
  );
}

export function earningsEntry(facts: EarningsFacts): AgentLogEntry | null {
  if (!valid(facts.count)) return null;
  const parts = [facts.beat > 0 ? `${count(facts.beat)} beat` : null, facts.missed > 0 ? `${count(facts.missed)} missed` : null].filter((part): part is string => part !== null);
  const tail = parts.length ? `; ${joinAnd(parts)}` : "";
  return entry("earnings", facts.at, facts.count, `earnings ${facts.count === 1 ? "report" : "reports"} checked against estimates${tail}.`, "/calendar", {
    kind: "Earnings",
    status: parts.length ? parts.join(", ") : `${count(facts.count)} checked`,
  });
}

export function agentsEntry(facts: AgentRunsFacts): AgentLogEntry | null {
  if (!valid(facts.runs)) return null;
  const found = Math.max(0, Math.round(facts.found));
  const tail = found === 0 ? "none found anything to report" : `${count(found)} found something to report`;
  return entry("agents", facts.at, facts.runs, `${facts.runs === 1 ? "agent" : "agents"} set up by members ran ${facts.runs === 1 ? "its" : "their"} checks; ${tail}.`, "/agents", {
    kind: "Agents",
    status: `${count(found)} of ${count(facts.runs)} flagged`,
  });
}

/* ── the day ─────────────────────────────────────────────────────────────── */

/** Which lines make the cut when there are more than MAX_ENTRIES, most telling first. Quiet checks go first. */
const PRIORITY: AgentLogSource[] = ["moves", "calls", "filings", "earnings", "briefs", "premarket", "insiders", "agents"];

/** The lead's phrase for a line: what was done, as a verb phrase. */
function leadPhrase(line: AgentLogEntry, facts: AgentLogFacts): string | null {
  switch (line.source) {
    case "moves":
      return facts.moves ? `found the reason for ${count(facts.moves.explained)} big ${facts.moves.explained === 1 ? "move" : "moves"}` : null;
    case "calls": {
      if (!facts.calls) return `brought ${line.figure} stock ${line.figure === "1" ? "brief" : "briefs"} up to date`;
      const changed = facts.calls.changes.length;
      return `reviewed ${count(facts.calls.reviewed)} ${facts.calls.reviewed === 1 ? "call" : "calls"}${changed > 0 ? ` and changed ${count(changed)}` : ""}`;
    }
    case "filings":
      return line.quiet ? null : `read ${line.figure} SEC ${line.figure === "1" ? "filing" : "filings"}`;
    case "earnings":
      return `checked ${line.figure} earnings ${line.figure === "1" ? "report" : "reports"}`;
    case "briefs":
      return `brought ${line.figure} stock ${line.figure === "1" ? "brief" : "briefs"} up to date`;
    case "premarket":
      return `checked ${line.figure} ${line.figure === "1" ? "stock" : "stocks"} before the open`;
    case "insiders":
      return `read ${line.figure} insider ${line.figure === "1" ? "trade" : "trades"}`;
    case "agents":
      return line.figure === "1" ? "ran 1 agent a member set up" : `ran ${line.figure} agents members set up`;
  }
}

function capitalise(text: string): string {
  return text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

/**
 * The day's log: every source with something real to say, at most MAX_ENTRIES (quiet checks and lower-priority
 * lines are dropped first), oldest first, with one lead sentence from the three most telling lines. Null when no
 * source has a line.
 *
 * `when` is "today", "yesterday" or a weekday; `ongoing` is true while the day's work is still going on (the lead
 * then says "so far").
 */
export function buildAgentLog(input: { day: string; when: string; ongoing: boolean; facts: AgentLogFacts; movesHref: string }): AgentLog | null {
  const { facts, when } = input;
  const whose = when === "today" ? "today's" : when === "yesterday" ? "yesterday's" : `${when}'s`;
  // Only work done on the day itself: a job's timestamp from another day is stale, not this day's log.
  const onDay = (line: AgentLogEntry | null): line is AgentLogEntry => line !== null && nyDayOf(line.at) === input.day;
  const lines = [
    facts.premarket ? premarketEntry(facts.premarket) : null,
    facts.briefs && facts.calls ? reviewEntry(facts.briefs, facts.calls) : facts.briefs ? briefsEntry(facts.briefs) : facts.calls ? callsEntry(facts.calls) : null,
    facts.moves ? movesEntry(facts.moves, whose, input.movesHref) : null,
    facts.filings ? filingsEntry(facts.filings) : null,
    facts.insiders ? insidersEntry(facts.insiders) : null,
    facts.earnings ? earningsEntry(facts.earnings) : null,
    facts.agents ? agentsEntry(facts.agents) : null,
  ].filter(onDay);
  if (lines.length === 0 || lines.every((line) => line.quiet)) return null;

  const rank = (line: AgentLogEntry) => (line.quiet ? 100 : 0) + PRIORITY.indexOf(line.source);
  const kept = [...lines].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_ENTRIES);
  const phrases = kept
    .filter((line) => !line.quiet)
    .map((line) => leadPhrase(line, facts))
    .filter((phrase): phrase is string => Boolean(phrase))
    .slice(0, 3);
  if (phrases.length === 0) return null;
  const opener = when === "today" ? (input.ongoing ? "So far today, the agent" : "Today the agent") : `${capitalise(when)} the agent`;
  const lead = `${opener} ${joinAnd(phrases)}.`;
  return {
    day: input.day,
    when,
    lead,
    entries: kept.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source)),
  };
}

/** The whole line as one sentence, for screen readers and tests: "72 stocks checked before the open; …". */
export function entrySentence(line: Pick<AgentLogEntry, "figure" | "rest">): string {
  return `${line.figure} ${line.rest}`;
}
