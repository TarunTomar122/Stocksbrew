/**
 * How a run reads to a person. The evaluator in lib/agent-jobs.ts records
 * what it found; this turns a run into an agent reporting back: one verdict
 * ("Needs you", "Heads-up", "All quiet", "Couldn't check"), one sentence on
 * what happened, one on what to do, then the evidence as rows.
 *
 * Pure and client-safe. Runs recorded before findings carried structured
 * numbers are read back from their sentences, so old runs read the same way.
 */

import type { Insight, TheRead } from "@/lib/insights";
import { isNyseHoliday } from "@/lib/market-session";
import {
  jobDisplayName,
  shortDate,
  zoneOf,
  type AgentDecision,
  type AgentFacts,
  type AgentFinding,
  type AgentJob,
  type AgentRun,
  type AgentRunCounts,
  type AgentTrigger,
} from "@/lib/agent-jobs";

export type AgentVerdict = "act" | "look" | "quiet" | "blocked";

export const VERDICT_LABEL: Record<AgentVerdict, string> = {
  act: "Needs you",
  look: "Heads-up",
  quiet: "All quiet",
  blocked: "Couldn't check",
};

/** Lower comes first: what needs the person, then what is worth a look. */
export const VERDICT_RANK: Record<AgentVerdict, number> = { act: 0, look: 1, blocked: 2, quiet: 3 };

export type MoveRow = {
  ticker: string;
  change_pct: number | null;
  close: number | null;
  zone: "add" | "trim" | null;
  level: number | null;
};

export type DateRow = { ticker: string; date: string; when: string; time: string | null };

/**
 * One stock in a run's report, the way the email lists it too: its close and the move into it, and one short plain
 * line (the level it reached, or when it reports). One row per stock, so a stock that moved and reports soon is
 * said once.
 */
export type StockRow = {
  ticker: string;
  close: number | null;
  change_pct: number | null;
  zone: "add" | "trim" | null;
  /** One short sentence, or "" when the price and the move say it all. */
  line: string;
};

export type NoteRow = { title: string; detail: string; source: string; url: string | null; at: string };

export type RunView = {
  verdict: AgentVerdict;
  label: string;
  /** What happened, in one sentence. */
  headline: string;
  /** What to do about it, in one short sentence. */
  todo: string;
  moves: MoveRow[];
  /** How many moves the run counted, which can be more than it kept. */
  movesTotal: number;
  dates: DateRow[];
  datesTotal: number;
  /** Moves and report dates as one list, one row per stock, what matters most first. */
  rows: StockRow[];
  notes: NoteRow[];
  tickers: string[];
  tone: "up" | "down" | "flat";
  /** One line: what data it read and when it ran. */
  asOf: string;
};

export type RunLike = Pick<AgentRun, "decision" | "summary" | "findings" | "checked" | "day"> & {
  ran_at?: string;
  latest_close?: string | null;
  counts?: AgentRunCounts;
};

type JobLike = (Pick<AgentJob, "trigger"> & Partial<Pick<AgentJob, "scope">>) | null | undefined;

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/* ── small helpers ──────────────────────────────────────────────────────── */

function ms(day: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function daysBetween(from: string, to: string): number | null {
  const a = ms(from);
  const b = ms(to);
  return a == null || b == null ? null : Math.round((b - a) / 86_400_000);
}

function weekday(day: string): string {
  const value = ms(day);
  return value == null ? "" : WEEKDAY[new Date(value).getUTCDay()];
}

/** A past close relative to the day of the run: "today", "yesterday", "on Friday", "on Nov 6". */
export function pastWhen(date: string, runDay: string): string {
  const gap = daysBetween(date, runDay);
  if (gap === 0) return "today";
  if (gap === 1) return "yesterday";
  if (gap != null && gap > 1 && gap < 7) return `on ${weekday(date)}`;
  return `on ${shortDate(date)}`;
}

/** The close as a noun: "Friday's close (Nov 6)", "yesterday's close (Nov 6)". */
export function closeLabel(date: string, runDay: string): string {
  const gap = daysBetween(date, runDay);
  if (gap === 0) return `Today's close (${shortDate(date)})`;
  if (gap === 1) return `Yesterday's close (${shortDate(date)})`;
  // A weekend or a holiday between the close and the run is normal; past that the data is behind.
  if (gap != null && gap > 1 && gap <= 4) return `${weekday(date)}'s close (${shortDate(date)})`;
  return `Latest close we have: ${shortDate(date)}`;
}

/** A date ahead of the run: "today", "tomorrow", "Thursday", "Nov 20". */
export function aheadWhen(date: string, runDay: string): string {
  const gap = daysBetween(runDay, date);
  if (gap === 0) return "today";
  if (gap === 1) return "tomorrow";
  if (gap != null && gap > 1 && gap < 7) return weekday(date);
  return shortDate(date);
}

/** The market session before `day`: weekends and NYSE holidays skipped. */
export function sessionBefore(day: string): string {
  const value = ms(day);
  if (value == null) return day;
  const date = new Date(value);
  for (let step = 0; step < 10; step += 1) {
    date.setUTCDate(date.getUTCDate() - 1);
    const key = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !isNyseHoliday(key)) return key;
  }
  return date.toISOString().slice(0, 10);
}

function money(value: number): string {
  const whole = value >= 100 && Math.abs(value - Math.round(value)) < 0.005;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

export function signedPct(value: number, digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

function names(list: string[], max = 3): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(", ")} and ${list.length - max} more`;
}

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function capital(text: string): string {
  return text.replace(/^./, (char) => char.toUpperCase());
}

/** "latest Nov 6" in a run's own words back to a date, using the run's year. */
function dateFromShort(text: string, runDay: string): string | null {
  const match = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})/.exec(text);
  const year = Number(runDay.slice(0, 4));
  if (!match || !year) return null;
  const month = MONTH[match[1]];
  const runMonth = Number(runDay.slice(5, 7));
  const y = month > runMonth ? year - 1 : year;
  return `${y}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

/* ── reading a finding ──────────────────────────────────────────────────── */

/** A finding with its kind and numbers, read back from the text when it was recorded without them. */
export function structured(finding: AgentFinding): AgentFinding {
  if (finding.kind) return finding;
  const source = finding.source ?? "";
  if (source === "Earnings calendar") {
    const time = /before the open/.test(finding.detail) ? "bmo" : /after the close/.test(finding.detail) ? "amc" : null;
    return { ...finding, kind: "earnings", time };
  }
  if (/Congress/i.test(source)) return { ...finding, kind: "congress" };
  if (/form 4/i.test(source)) return { ...finding, kind: "insider" };
  if (/13F/i.test(source)) return { ...finding, kind: "filing" };
  const closeFrom = /Closed at \$([\d,]+(?:\.\d+)?)/.exec(finding.detail) ?? / to \$([\d,]+(?:\.\d+)?) on/.exec(finding.detail);
  const close = num(closeFrom?.[1]);
  const prev = num((/from \$([\d,]+(?:\.\d+)?)/i.exec(finding.detail) ?? /\(\$([\d,]+(?:\.\d+)?)\)/.exec(finding.detail))?.[1]);
  const move = /^([A-Z][A-Z0-9.-]*) (rose|fell) ([\d.]+)%/.exec(finding.headline);
  if (move) {
    const pct = Number(move[3]) * (move[2] === "fell" ? -1 : 1);
    return { ...finding, kind: /movers/.test(source) ? "mover" : "move", change_pct: pct, close: close ?? undefined, from_close: prev ?? undefined };
  }
  const level = /closed (above|below) \$([\d,]+(?:\.\d+)?)/.exec(finding.headline);
  if (level) return { ...finding, kind: "level", level: num(level[2]), close: close ?? undefined };
  const zone = /add zone, at or below \$([\d,]+(?:\.\d+)?)/.exec(finding.headline);
  if (zone) return { ...finding, kind: "level", zone: "add", level: num(zone[1]), close: close ?? undefined };
  return finding;
}

function moveRow(finding: AgentFinding, levels?: AgentFacts["levels"]): MoveRow {
  const ticker = finding.ticker ?? "";
  let zone = finding.zone ?? null;
  let level = zone ? finding.level ?? null : null;
  // Runs recorded before zones were stored: compare the close with today's levels.
  if (finding.zone === undefined && levels && finding.close != null) {
    const found = zoneOf(levels[ticker], finding.close, finding.from_close);
    zone = found?.zone ?? null;
    level = found?.level ?? null;
  }
  return { ticker, change_pct: finding.change_pct ?? null, close: finding.close ?? null, zone, level };
}

function zoneSentence(rows: MoveRow[]): string {
  const trim = rows.filter((row) => row.zone === "trim");
  const add = rows.filter((row) => row.zone === "add");
  const parts: string[] = [];
  if (trim.length === 1) parts.push(`${trim[0].ticker} went past its sell-some level (${money(trim[0].level ?? 0)})`);
  else if (trim.length > 1) parts.push(`${names(trim.map((row) => row.ticker))} went past their sell-some levels`);
  if (add.length === 1) parts.push(`${add[0].ticker} dropped to its buy-more level (${money(add[0].level ?? 0)})`);
  else if (add.length > 1) parts.push(`${names(add.map((row) => row.ticker))} dropped to their buy-more levels`);
  return parts.length ? `${capital(parts.join(", and "))}. Your call.` : "";
}

/** "below its $142.07 buy-more level", or "at" it when the close is the level to the cent. */
export function levelWhere(close: number, level: number, zone: "add" | "trim"): string {
  const where = money(close) === money(level) ? "at" : zone === "add" ? "below" : "above";
  return `${where} its ${money(level)} ${zone === "add" ? "buy-more" : "sell-some"} level`;
}

/** "Reports tomorrow before the open", "Reports Thursday", "Reports on Nov 20". */
export function reportLine(row: Pick<DateRow, "when" | "time">): string {
  const when = row.when === "today" || row.when === "tomorrow" || /^[A-Z][a-z]+day$/.test(row.when) ? row.when : `on ${row.when}`;
  return `Reports ${when}${row.time ? ` ${row.time}` : ""}`;
}

/** The scale words a big-move headline carries ("…in a day, about four times a normal day"), as a line of their own. */
function scaleWords(headline: string): string {
  const match = /\bin a day, (.+)$/.exec(headline.trim().replace(/\.$/, ""));
  return match ? capital(match[1]) : "";
}

/**
 * Moves and report dates as one list, one row per stock: a stock that reached a level of its call first, then the
 * biggest moves, then reports by date. A close from before the run's own session says its day; nothing else does.
 */
function stockRows(findings: AgentFinding[], moves: MoveRow[], dates: DateRow[], closeDate: string | null): StockRow[] {
  const out = new Map<string, StockRow & { at: string; order: number }>();
  moves.forEach((move, index) => {
    if (!move.ticker || out.has(move.ticker)) return;
    const finding = findings.find((entry) => entry.ticker === move.ticker && (entry.kind === "move" || entry.kind === "mover" || entry.kind === "level"));
    const at = finding?.at ?? "";
    let line = move.zone && move.level != null && move.close != null ? capital(levelWhere(move.close, move.level, move.zone)) : scaleWords(finding?.headline ?? "");
    if (closeDate && /^\d{4}-\d{2}-\d{2}/.test(at) && at < closeDate && finding?.kind !== "mover") {
      line = `Closed ${shortDate(at)}${line ? `, ${line.replace(/^./, (char) => char.toLowerCase())}` : ""}`;
    }
    out.set(move.ticker, { ticker: move.ticker, close: move.close, change_pct: move.change_pct, zone: move.zone, line, at, order: index });
  });
  for (const date of dates) {
    const said = reportLine(date);
    const row = out.get(date.ticker);
    if (row) {
      if (!/Reports /.test(row.line)) row.line = row.line ? `${row.line}, ${said.replace(/^R/, "r")}` : said;
      continue;
    }
    out.set(date.ticker, { ticker: date.ticker, close: null, change_pct: null, zone: null, line: said, at: date.date, order: out.size });
  }
  const rank = (row: StockRow) => (row.zone ? 0 : row.change_pct != null ? 1 : 2);
  return [...out.values()]
    .sort((a, b) => rank(a) - rank(b) || Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0) || a.order - b.order)
    .map(({ at: _at, order: _order, ...row }) => row);
}

/* ── one run ────────────────────────────────────────────────────────────── */

function countFrom(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : null;
}

function sourceFor(trigger: AgentTrigger | undefined, findings: AgentFinding[]): string {
  if (trigger?.type === "event") {
    if (trigger.event === "earnings_approaching") return "Earnings calendar";
    if (trigger.event === "congress_trade") return "Congressional disclosures";
    if (trigger.event === "insider_trade") return "SEC Form 4 filings";
    if (trigger.event === "fund_13f") return "SEC 13F filings";
    if (trigger.event === "sec_filing") return "SEC filings";
    if (trigger.event === "news") return "Headlines and their tone";
    if (trigger.event === "earnings_reported") return "Earnings reports";
    return "Today's movers";
  }
  return findings[0]?.source ?? "Daily closes";
}

const RAN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});

/** An instant as "Mon Nov 9, 3:34 PM ET". */
export function ranLabel(ranAt: string | undefined): string {
  if (!ranAt || !Number.isFinite(Date.parse(ranAt))) return "";
  const parts = Object.fromEntries(RAN.formatToParts(new Date(ranAt)).map((part) => [part.type, part.value]));
  return `${parts.weekday} ${parts.month} ${parts.day}, ${parts.hour}:${parts.minute} ${parts.dayPeriod} ET`;
}

/**
 * One run, the way an agent would report it. `levels` are the person's
 * research levels today; they are only used for runs that did not store
 * zones, so pass them for the latest run of a job and not for old ones.
 */
export function presentRun(
  run: RunLike,
  job: JobLike,
  options: {
    levels?: AgentFacts["levels"];
    /** A replayed day: say "on Nov 6" rather than "yesterday", since nobody was there to be told. */
    replay?: boolean;
  } = {},
): RunView {
  const trigger = job?.trigger;
  const counts = run.counts ?? {};
  const checkedText = run.checked.join(" · ");
  const read = run.findings.map(structured);
  const isPrice = (finding: AgentFinding) => finding.kind === "move" || finding.kind === "level";
  // A close older than the session before the run's newest close is a stock whose price stopped updating, not this
  // run's news (the inbox leaves it out the same way). Runs from before the evaluator dropped these still have them.
  const newest = run.latest_close || read.filter(isPrice).map((finding) => finding.at).sort().pop() || "";
  const floor = newest ? sessionBefore(newest) : "";
  const behind = floor ? read.filter((finding) => isPrice(finding) && /^\d{4}-\d{2}-\d{2}/.test(finding.at) && finding.at < floor) : [];
  const findings = behind.length ? read.filter((finding) => !behind.includes(finding)) : read;
  // Everything it found was a stale quote: nothing new happened, so it reads as a quiet run.
  if (behind.length && findings.length === 0 && run.decision === "notify") {
    return presentRun({ ...run, decision: "nothing", findings: [], counts: { ...counts, moves: 0, up: 0, down: 0 } }, job, options);
  }

  const moves = findings
    .filter((finding) => (finding.kind === "move" || finding.kind === "mover" || finding.kind === "level") && finding.ticker)
    .map((finding) => moveRow(finding, options.levels));
  const dates = findings
    .filter((finding) => finding.kind === "earnings" && finding.ticker)
    .map((finding) => ({
      ticker: finding.ticker ?? "",
      date: finding.at,
      when: aheadWhen(finding.at, run.day),
      time: finding.time === "bmo" ? "before the open" : finding.time === "amc" ? "after the close" : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  const notes = findings
    .filter((finding) => finding.kind !== "move" && finding.kind !== "mover" && finding.kind !== "level" && finding.kind !== "earnings")
    .map((finding) => ({ title: finding.headline, detail: finding.detail, source: finding.source, url: finding.url, at: finding.at }));

  // The close the run read: stored, or the newest move, or its own "latest Nov 6".
  const closeDate =
    run.latest_close ||
    newest ||
    (/latest (\w{3} \d{1,2})/.test(checkedText) ? dateFromShort(/latest (\w{3} \d{1,2})/.exec(checkedText)?.[1] ?? "", run.day) : null);
  const readsPrices = trigger ? trigger.type !== "event" : closeDate != null;
  const when = closeDate ? (options.replay ? `on ${shortDate(closeDate)}` : pastWhen(closeDate, run.day)) : "";

  const priced = counts.priced ?? countFrom(checkedText, /Daily closes for (\d+) names?/) ?? null;
  const movesTotal = Math.max(moves.length, (counts.moves ?? countFrom(run.summary, /^(\d+) names? (?:moved|met)/) ?? moves.length) - behind.length);
  const datesTotal = Math.max(dates.length, counts.earnings ?? countFrom(run.summary, /(\d+) names? reports? within a week/) ?? dates.length);
  const weekly = trigger?.type === "schedule" && trigger.cadence === "weekly";
  const threshold =
    counts.threshold ??
    (trigger?.type === "price" && trigger.rule === "moves_pct" ? trigger.pct ?? 5 : weekly ? 5 : 3);

  const zoned = moves.filter((row) => row.zone);
  const behindUp = behind.filter((finding) => (finding.change_pct ?? 0) > 0).length;
  const up = counts.up != null ? Math.max(0, counts.up - behindUp) : moves.length === movesTotal ? moves.filter((row) => (row.change_pct ?? 0) > 0).length : null;
  const down = counts.down != null ? Math.max(0, counts.down - (behind.length - behindUp)) : up != null ? movesTotal - up : null;
  const tone: RunView["tone"] = up != null && down != null && up !== down ? (up > down ? "up" : "down") : "flat";

  const ran = ranLabel(run.ran_at);
  const asOf = options.replay
    ? `${readsPrices && closeDate ? `Official close of ${shortDate(closeDate)}` : sourceFor(trigger, findings)} · replayed, not sent at the time`
    : [readsPrices && closeDate ? closeLabel(closeDate, run.day) : sourceFor(trigger, findings), ran ? `checked ${ran}` : `checked ${shortDate(run.day)}`].join(" · ");
  const tickers = [...new Set([...zoned.map((row) => row.ticker), ...moves.map((row) => row.ticker), ...dates.map((row) => row.ticker), ...findings.map((f) => f.ticker ?? "")])].filter(Boolean);

  const rows = stockRows(findings, moves, dates, closeDate ?? null);
  const base = { moves, movesTotal, dates, datesTotal, rows, notes, tickers, tone, asOf };
  const verdictOf = (decision: AgentDecision, act: boolean): AgentVerdict =>
    decision === "could_not_check" ? "blocked" : decision === "nothing" ? "quiet" : act ? "act" : "look";

  /* Couldn't check */
  if (run.decision === "could_not_check") {
    const reason = capital(run.summary.replace(/^Could not check:\s*/i, ""));
    const noNames = /no names to look at/i.test(run.summary);
    return {
      ...base,
      verdict: "blocked",
      label: VERDICT_LABEL.blocked,
      headline: noNames ? "There are no stocks for it to check yet." : reason,
      todo: noNames ? "Add a stock to your watchlist and it picks it up on the next check." : "It tries again on the next check. Nothing for you to do.",
    };
  }

  /* All quiet */
  if (run.decision === "nothing") {
    let headline = capital(run.summary.replace(/^Checked, nothing to do\.\s*/i, ""));
    if (/no new close since the last check/i.test(run.summary)) {
      headline = "No new close since the last check, so there was nothing new to read.";
    } else if (trigger?.type === "schedule" && priced != null) {
      headline = weekly
        ? `None of ${job?.scope?.kind === "tickers" ? "these" : "your"} ${priced} names moved ${threshold}% or more in the week to ${closeDate ? weekday(closeDate) : "the last close"}, and none reports in the week ahead.`
        : `None of ${job?.scope?.kind === "tickers" ? "these" : "your"} ${priced} names moved ${threshold}% or more ${when || "at the last close"}, and none reports this week.`;
    } else if (trigger?.type === "price" && priced != null && when) {
      if (trigger.rule === "moves_pct") {
        headline = priced === 1 ? `No move of ${threshold}% or more ${when}.` : `None of ${job?.scope?.kind === "tickers" ? "these" : "your"} ${priced} names moved ${threshold}% or more ${when}.`;
      } else if (trigger.rule === "enters_buy_zone") {
        headline = priced === 1 ? `It did not close at its buy-more level ${when}.` : `None of your ${priced} names closed at their buy-more levels ${when}.`;
      } else {
        headline = `It did not close ${trigger.rule === "crosses_above" ? "above" : "below"} ${money(trigger.level ?? 0)} ${when}.`;
      }
    }
    return { ...base, verdict: "quiet", label: VERDICT_LABEL.quiet, headline, todo: "Nothing to do." };
  }

  /* Something was found */
  const zoneLine = zoneSentence(zoned);
  let headline = run.summary;
  let todo = "";
  let act = zoned.length > 0;

  if (trigger?.type === "price" && (trigger.rule === "crosses_above" || trigger.rule === "crosses_below")) {
    const row = moves[0];
    const side = trigger.rule === "crosses_above" ? "above" : "below";
    headline = row
      ? `${row.ticker} closed ${side} ${money(trigger.level ?? 0)} ${when}${row.close != null ? `, at ${money(row.close)}` : ""}.`
      : run.summary;
    todo = "That is the level you set. Decide whether it changes your plan.";
    act = true;
  } else if (trigger?.type === "price" && trigger.rule === "enters_buy_zone") {
    const list = moves.map((row) => row.ticker);
    const one = moves[0];
    headline =
      list.length === 0
        ? run.summary
        : list.length === 1 && one && one.change_pct != null && one.close != null && one.level != null
        ? `${one.ticker} ${one.change_pct >= 0 ? "rose" : "fell"} ${Math.abs(one.change_pct).toFixed(1)}% to ${money(one.close)} ${when}, ${levelWhere(one.close, one.level, "add")}.`
        : list.length === 1
          ? `${list[0]} closed at its buy-more level ${when}${one?.close != null ? `, at ${money(one.close)}` : ""}.`
          : `${names(list)} closed at their buy-more levels ${when}.`;
    // The headline already names the stocks and the level, so the zone line is not said again.
    todo = "Our call says this is where to buy more. Your call.";
    act = true;
  } else if (moves.length > 0 && (trigger?.type === "schedule" || trigger?.type === "price" || !trigger)) {
    const lead = [...moves].sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0))[0];
    const span = weekly ? `in the week to ${closeDate ? weekday(closeDate) : "the last close"}` : when;
    const of = priced != null ? ` of ${job?.scope?.kind === "tickers" ? "these" : "your"} ${priced}` : "";
    headline =
      movesTotal === 1 && lead.change_pct != null
        ? `${lead.ticker} ${lead.change_pct >= 0 ? "rose" : "fell"} ${Math.abs(lead.change_pct).toFixed(1)}% ${span}${lead.close != null ? `, to ${money(lead.close)}` : ""}.`
        : `${movesTotal}${of} names moved ${threshold}% or more ${span}${
            up != null && down != null && up > 0 && down > 0 ? ` (${up} up, ${down} down)` : up === movesTotal ? ", all up" : down === movesTotal ? ", all down" : ""
          }${lead.change_pct != null ? `, led by ${lead.ticker} at ${signedPct(lead.change_pct)}` : ""}.`;
  } else if (dates.length > 0 && trigger?.type === "event") {
    const first = dates[0];
    const sameDay = dates.filter((row) => row.date === first.date).map((row) => row.ticker);
    headline =
      dates.length === sameDay.length
        ? `${names(sameDay)} ${sameDay.length === 1 ? "reports" : "report"} earnings ${first.when === "today" || first.when === "tomorrow" ? first.when : `on ${first.when}`}.`
        : `${dates.length} of your names report earnings soon, first ${names(sameDay)} ${first.when === "today" || first.when === "tomorrow" ? first.when : `on ${first.when}`}.`;
    todo = "Worth reading up before the numbers land.";
  }

  // What to do: a level hit first, then what is coming up.
  const extra: string[] = [];
  if (trigger?.type === "schedule" || !trigger) {
    if (datesTotal > 0 && dates.length === 0) {
      extra.push(`${datesTotal === 1 ? "One of your names reports" : `${datesTotal} of your names report`} ${weekly ? "in the week ahead" : "this week"}.`);
    } else if (datesTotal > 0) {
      const first = dates[0];
      const soon = first.when === "today" || first.when === "tomorrow" ? first.when : first.when.match(/^[A-Z][a-z]+day$/) ? first.when : `on ${first.when}`;
      extra.push(
        datesTotal === 1
          ? `${first.ticker} reports ${soon}.`
          : `${datesTotal} of your names report ${weekly ? "in the week ahead" : "this week"}, first ${names(dates.filter((row) => row.date === first.date).map((row) => row.ticker))} ${soon}.`,
      );
    }
    const trades = counts.trades ?? notes.filter((note) => /Congress/i.test(note.source)).length;
    if (trades > 0) extra.push(`${trades === 1 ? "A member of Congress" : `${trades} congressional disclosures`} traded your names.`);
    if (moves.length === 0 && extra.length > 0) {
      headline = extra.shift() ?? headline;
    }
  }
  if (!todo) todo = zoneLine || "No action needed.";
  else if (zoneLine && !(trigger?.type === "price" && trigger.rule === "enters_buy_zone")) todo = `${zoneLine} ${todo}`;
  if (extra.length) todo = `${todo} ${extra.join(" ")}`;
  if (!act && (trigger?.type === "event" && trigger.event !== "earnings_approaching") && todo === "No action needed.") {
    todo = "Worth a look.";
  }

  const verdict = verdictOf(run.decision, act);
  return { ...base, verdict, label: VERDICT_LABEL[verdict], headline, todo };
}

/* ── the page ───────────────────────────────────────────────────────────── */

export type JobStatus = {
  job: AgentJob;
  /** Its newest run, already presented. Null until it has run. */
  view: RunView | null;
  last: AgentRun | null;
};

/** Jobs in the order a person should read them: what needs them, then heads-ups, then quiet ones, then paused. */
export function orderJobs(jobs: AgentJob[], runsByJob: Map<string, AgentRun[]>, levels?: AgentFacts["levels"]): JobStatus[] {
  const rank = (status: JobStatus) => (!status.job.enabled ? 9 : status.view ? VERDICT_RANK[status.view.verdict] : 5);
  return jobs
    .map((job) => {
      const last = runsByJob.get(job.id)?.[0] ?? null;
      return { job, last, view: last ? presentRun(last, job, { levels }) : null };
    })
    .sort((a, b) => rank(a) - rank(b) || (b.last?.day ?? "").localeCompare(a.last?.day ?? "") || a.job.created_at.localeCompare(b.job.created_at));
}

/**
 * The read at the top of the page: what needs the person, then up to three
 * of the newest runs as sentences. Null with no runs, so nothing is padded.
 */
export function agentsRead(statuses: JobStatus[], today: string): TheRead | null {
  const ran = statuses.filter((status) => status.view && status.last);
  if (ran.length === 0) return null;
  const count = (verdict: AgentVerdict) => ran.filter((status) => status.view?.verdict === verdict).length;
  const act = count("act");
  const look = count("look");
  const on = statuses.filter((status) => status.job.enabled).length;
  const newest = ran.map((status) => status.last?.day ?? "").sort().pop() ?? "";
  const ranToday = ran.filter((status) => status.last?.day === today).length;

  const headline =
    act > 0
      ? `${act === 1 ? "One agent needs you" : `${act} agents need you`}${look ? `, and ${look === 1 ? "one has a heads-up" : `${look} have heads-ups`}` : ""}.`
      : look > 0
        ? `No action needed. ${look === 1 ? "One agent has a heads-up" : `${look} agents have heads-ups`}.`
        : "All quiet. No action needed.";

  const insights: Insight[] = ran
    .filter((status) => status.view?.verdict !== "quiet")
    .slice(0, 3)
    .map((status) => {
      const view = status.view as RunView;
      return {
        id: status.job.id,
        tone: view.tone,
        text: `${jobDisplayName(status.job.name)}: ${view.headline}`,
        soWhat: view.todo,
        tickers: view.tickers.slice(0, 4),
        action: { label: "Open", href: `#job-${status.job.id}` },
      } satisfies Insight;
    });

  const lastRun = ran
    .map((status) => status.last?.ran_at ?? "")
    .filter(Boolean)
    .sort()
    .pop();
  const checked = ranToday > 0 ? `${ranToday} checked today` : `last checked ${pastWhen(newest, today).replace(/^on /, "")}`;
  return {
    headline,
    insights,
    source: `${on} of ${statuses.length} ${statuses.length === 1 ? "agent" : "agents"} on · ${checked}`,
    asOf: lastRun ?? null,
  };
}
