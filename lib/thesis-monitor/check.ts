/**
 * One check of a thesis on one day. Pure: tonight's figures and filings go in with the last check's state, the next
 * state comes out (lines judged, events recorded, the status rolled up).
 *
 * - Each line is judged with the conditions engine and its guards (lib/thesis-watch/conditions.ts judgeConditions and
 *   nextConditionRecords): once per report, only after SEC accepted it, a re-stamped old figure waits, a broken line
 *   stays broken while the next figure is awaited, a price line clears only 1% past.
 * - A report's figures judged for the first time are one event per line ("NVDA's Q3: revenue growth 62%, above your
 *   40%."); a daily line (price, dividend, P/E) that flips is one event.
 * - A company's 10-K or 10-Q that added or dropped risks (tm_filing_changes) is one event, once per filing (by its
 *   accession), quoting the company's own heading.
 * - What was on file the day a company joined is recorded as `baseline`: context, never news.
 * - The status rolls up by `rollUp`, whose rules are written down there.
 */

import { quote, recordLine } from "@/lib/filing-changes/words";
import type { Comparison } from "@/lib/filing-changes/diff";
import type { FilingChangesDoc } from "@/lib/filing-changes/store";
import {
  conditionKey,
  figureText,
  formatValue,
  isConditionMetric,
  judgeConditions,
  METRICS,
  nextConditionRecords,
  shortDay,
  type Condition,
  type ConditionInputs,
  type ConditionRecord,
} from "@/lib/thesis-watch/conditions";

import {
  EVENTS_MAX,
  HISTORY_MAX,
  SEEN_MAX,
  STATUS_WORDS,
  THESIS_STATE_VERSION,
  wordCount,
  type ThesisCounts,
  type ThesisEvent,
  type ThesisHistoryRow,
  type ThesisLine,
  type ThesisRisk,
  type ThesisBase,
  type ThesisState,
  type ThesisStatus,
} from "./model";

/** A filing that added risks this many days ago or less puts the thesis under strain. */
export const RISK_DAYS = 14;
/** What was on file the day a company joined is kept as context when it is at most this old. */
export const BASELINE_DAYS = 120;
const EVENT_MAX_WORDS = 15;
const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/* ── the rollup ─────────────────────────────────────────────────────────── */

export type LineVerdict = {
  ticker: string;
  status: "holds" | "broken" | "unknown";
};

export type Rollup = {
  status: ThesisStatus;
  counts: ThesisCounts;
  affected: string[];
};

/**
 * The thesis status from its lines and the risk filings in the window. The rules, in order:
 * 1. Broken: more than half of all its lines broke (a line still waiting for its figure counts as not broken).
 * 2. Under strain: at least one line broke, or a company's 10-K or 10-Q in the last RISK_DAYS added risks.
 * 3. Waiting for figures: no line has a figure judged yet.
 * 4. Holds: otherwise (every judged line holds, and no new risks).
 * Affected: the companies with a broken line, then those with new risks, each once.
 */
export function rollUp(
  lines: readonly LineVerdict[],
  risks: ReadonlyArray<Pick<ThesisRisk, "ticker">>,
): Rollup {
  const holds = lines.filter((line) => line.status === "holds").length;
  const broke = lines.filter((line) => line.status === "broken").length;
  const counts: ThesisCounts = {
    lines: lines.length,
    holds,
    broke,
    waiting: lines.length - holds - broke,
  };
  const affected = [
    ...new Set([
      ...lines
        .filter((line) => line.status === "broken")
        .map((line) => line.ticker),
      ...risks.map((risk) => risk.ticker),
    ]),
  ];
  const status: ThesisStatus =
    broke * 2 > lines.length
      ? "broken"
      : broke > 0 || risks.length > 0
        ? "strain"
        : holds === 0
          ? "waiting"
          : "holds";
  return { status, counts, affected };
}

/* ── words ──────────────────────────────────────────────────────────────── */

function conditionOf(record: ConditionRecord): Condition | null {
  const [metric, op, value] = record.key.split(":");
  if (!isConditionMetric(metric) || (op !== "above" && op !== "below"))
    return null;
  const line = Number(value);
  return Number.isFinite(line) ? { metric, op, value: line } : null;
}

/** "NVDA's Q3: revenue growth 62%, above your 40%." / "VRT's Q3: gross margin 31%, under your 35%." */
export function reportSentence(
  ticker: string,
  record: ConditionRecord,
): string | null {
  const condition = conditionOf(record);
  if (
    !condition ||
    record.now === null ||
    (record.status !== "holds" && record.status !== "broken")
  )
    return null;
  const when =
    record.report_quarter ??
    (record.report_date ? shortDay(record.report_date) : null);
  const lead = when ? `${ticker}'s ${when}` : ticker;
  const holds = record.status === "holds";
  const side =
    condition.op === "above"
      ? holds
        ? "above"
        : "under"
      : holds
        ? "under"
        : "over";
  const nowText = figureText(condition.metric, record.now, condition.value);
  const line = formatValue(condition.metric, condition.value);
  const figure =
    condition.metric === "eps_surprise"
      ? record.now < 0
        ? `EPS missed the estimate by ${nowText.replace("−", "")}`
        : `EPS beat the estimate by ${nowText}`
      : `${METRICS[condition.metric].words} ${nowText}`;
  return `${lead}: ${figure}, ${side} your ${line}.`;
}

/** Two lines judged on one report with one verdict: "NVDA's Q2: both lines hold, revenue growth 83% and gross margin 75%." */
export function reportPairSentence(
  ticker: string,
  records: readonly ConditionRecord[],
): string | null {
  const parts = records.map((record) => {
    const condition = conditionOf(record);
    if (!condition || record.now === null) return null;
    const nowText = figureText(condition.metric, record.now, condition.value);
    if (condition.metric === "eps_surprise")
      return record.now < 0
        ? `an EPS miss of ${nowText.replace("−", "")}`
        : `an EPS beat of ${nowText}`;
    return `${METRICS[condition.metric].words} ${nowText}`;
  });
  if (parts.length !== 2 || parts.some((part) => part === null)) return null;
  const first = records[0]!;
  const when =
    first.report_quarter ??
    (first.report_date ? shortDay(first.report_date) : null);
  const lead = when ? `${ticker}'s ${when}` : ticker;
  return `${lead}: both lines ${first.status === "holds" ? "hold" : "broke"}, ${parts[0]} and ${parts[1]}.`;
}

/** A daily line that turned: "NVDA closed at $150, under your $155." / "NVDA is back over your $155 line at $160." */
function flipSentence(ticker: string, record: ConditionRecord): string | null {
  const condition = conditionOf(record);
  if (!condition || record.now === null) return null;
  if (record.status === "broken")
    return record.line.startsWith(ticker)
      ? record.line
      : `${ticker}: ${lowerFirst(record.line)}`;
  const nowText = figureText(condition.metric, record.now, condition.value);
  const side = condition.op === "above" ? "over" : "under";
  return `${ticker}'s ${METRICS[condition.metric].words.replace(/^the /, "")} is back ${side} your ${formatValue(condition.metric, condition.value)} line at ${nowText}.`;
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function statusSentence(
  status: ThesisStatus,
  counts: ThesisCounts,
  risks: readonly ThesisRisk[],
): string {
  if (status === "broken" || (status === "strain" && counts.broke > 0))
    return `Now ${STATUS_WORDS[status].toLowerCase()}: ${counts.broke} of ${counts.lines} lines broke.`;
  if (status === "strain")
    return `Now under strain: ${risks[0]?.ticker ?? "a company"} filed new risks.`;
  if (status === "holds")
    return `Holds again: ${counts.holds} of ${counts.lines} lines hold.`;
  return "Waiting for figures on every line.";
}

/** Within the word budget, or null (a sentence that would run over is not recorded half-said). */
function fits(text: string | null): string | null {
  return text && wordCount(text) <= EVENT_MAX_WORDS ? text : null;
}

/* ── filings ────────────────────────────────────────────────────────────── */

function comparisonsOf(doc: FilingChangesDoc): Comparison[] {
  const seen = new Set<string>();
  return [doc.latest, ...doc.history]
    .filter((entry) => {
      if (seen.has(entry.filing.accession)) return false;
      seen.add(entry.filing.accession);
      return true;
    })
    .sort((a, b) => b.filing.filed.localeCompare(a.filing.filed));
}

/** A comparison worth recording: it added or dropped a risk (a partial 10-Q's repeats are not news). */
function moves(entry: Comparison): boolean {
  return (
    entry.status === "changes" && entry.added.length + entry.dropped.length > 0
  );
}

function filingEvent(
  ticker: string,
  entry: Comparison,
  day: string,
  baseline: boolean,
): ThesisEvent | null {
  // "MU's new 10-Q …" is news; what was on file when the thesis started is not new.
  const line = recordLine(ticker, entry);
  const text = fits(
    baseline && line ? line.replace(`${ticker}'s new `, `${ticker}'s `) : line,
  );
  if (!text) return null;
  const lead = entry.added[0] ?? entry.dropped[0] ?? null;
  const quoted = lead ? quote(lead, EVENT_MAX_WORDS - 1) : null;
  return {
    key: `filing:${ticker}:${entry.filing.accession}`,
    kind: "filing",
    day: baseline ? entry.filing.filed : day,
    at: entry.filing.filed,
    ticker,
    text,
    detail:
      lead && quoted?.fits
        ? `${entry.added[0] ? "New" : "Dropped"}: “${quoted.text}”`
        : null,
    verdict: null,
    source: `SEC ${entry.filing.form}, filed ${shortDay(entry.filing.filed)}`,
    href: entry.filing.url,
    ...(baseline ? { baseline: true } : {}),
  };
}

/** The newest filing per company in the window that added risks. */
export function risksOf(
  docs: readonly FilingChangesDoc[],
  tickers: ReadonlySet<string>,
  day: string,
): ThesisRisk[] {
  const out: ThesisRisk[] = [];
  for (const doc of docs) {
    if (!tickers.has(doc.ticker)) continue;
    const entry = comparisonsOf(doc).find((comparison) => {
      const age = daysBetween(comparison.filing.filed, day);
      return (
        comparison.status === "changes" &&
        comparison.added.length > 0 &&
        age >= 0 &&
        age <= RISK_DAYS
      );
    });
    if (!entry) continue;
    const first = quote(entry.added[0]!, EVENT_MAX_WORDS - 1);
    out.push({
      ticker: doc.ticker,
      form: entry.filing.form,
      filed: entry.filing.filed,
      accession: entry.filing.accession,
      added: entry.added.length,
      first: first.fits ? first.text : null,
      url: entry.filing.url,
    });
  }
  return out.sort(
    (a, b) =>
      b.filed.localeCompare(a.filed) || a.ticker.localeCompare(b.ticker),
  );
}

/* ── the check ──────────────────────────────────────────────────────────── */

export type ThesisCheckInput = {
  uid: string;
  basketId: string;
  day: string;
  now: Date;
  /** The thesis's lines. Lines on companies no longer in `tickers` are not checked. */
  lines: readonly ThesisLine[];
  /** The companies the basket holds now. */
  tickers: readonly string[];
  /** Tonight's figures by ticker; a company missing here could not be read and keeps its last records. */
  inputs: ReadonlyMap<string, ConditionInputs>;
  /** The companies' filing comparisons; null when they could not be read (the last risks stand, nothing is recorded). */
  filings: readonly FilingChangesDoc[] | null;
  previous: ThesisState | null;
  /** Which thesis this is: a state from an earlier thesis on the same basket is not this one's. */
  spec: { created_at: string; version: number };
};

/** The status as it stood before `day`: a second check on the same day is judged against the day before, not itself. */
function baseOf(previous: ThesisState | null, day: string): ThesisBase | null {
  if (!previous) return null;
  if (previous.day < day)
    return {
      status: previous.status,
      status_since: previous.status_since,
      previous_status: previous.previous_status,
    };
  return previous.base;
}

export function checkThesis(input: ThesisCheckInput): ThesisState {
  const { day, spec } = input;
  // Lines taken off and put back are a new thesis: the old one's records, events and filings are not its history.
  const previous = input.previous && input.previous.spec_created_at === spec.created_at ? input.previous : null;
  // The person changed the lines since the last check: what the change does to the status is theirs, not news.
  const edited = previous !== null && previous.spec_version !== spec.version;
  const inBasket = new Set(input.tickers);
  const active = input.lines.filter((line) => inBasket.has(line.ticker));
  // A company counts as known once it has records: one whose figures were missing the night it joined is still joining.
  const known = new Set((previous?.lines ?? []).filter((line) => line.records.length > 0).map((line) => line.ticker));
  const prevRecords = new Map(
    (previous?.lines ?? []).map((line) => [line.ticker, line.records]),
  );
  const events: ThesisEvent[] = [];
  const verdicts: LineVerdict[] = [];
  const lines: ThesisState["lines"] = [];

  for (const line of active) {
    const before = prevRecords.get(line.ticker) ?? [];
    const figures = input.inputs.get(line.ticker) ?? null;
    let records: ConditionRecord[];
    if (figures) {
      records = nextConditionRecords(
        before,
        judgeConditions(line.conditions, figures, day, before),
        day,
      );
    } else {
      // Not read tonight: the last records stand, so an outage never flips the status (and asks for a review) by itself.
      const keys = new Set(line.conditions.map(conditionKey));
      records = before.filter((record) => keys.has(record.key));
    }
    lines.push({ ticker: line.ticker, records });
    for (const condition of line.conditions) {
      const record = records.find(
        (entry) => entry.key === conditionKey(condition),
      );
      verdicts.push({
        ticker: line.ticker,
        status: record?.status ?? "unknown",
      });
    }
    const joined = !known.has(line.ticker);
    // A report's figures: one event per report and verdict, two lines on the same report said in one sentence.
    const reported = new Map<string, ConditionRecord[]>();
    for (const record of records) {
      const metric = record.metric;
      if (
        !metric ||
        METRICS[metric].timing !== "report" ||
        !record.report_date ||
        (record.status !== "holds" && record.status !== "broken")
      )
        continue;
      const fresh = record.checked_on === day;
      // A company joining: its latest judged report is what was on file, kept as context.
      if (
        !fresh &&
        !(joined && daysBetween(record.report_date, day) <= BASELINE_DAYS)
      )
        continue;
      const group = `${record.report_date}|${record.status}|${fresh}`;
      reported.set(group, [...(reported.get(group) ?? []), record]);
    }
    for (const together of reported.values()) {
      const pair =
        together.length > 1
          ? fits(reportPairSentence(line.ticker, together))
          : null;
      for (const group of pair
        ? [together]
        : together.map((record) => [record])) {
        const first = group[0]!;
        const fresh = first.checked_on === day;
        const text = pair ?? fits(reportSentence(line.ticker, first));
        if (!text) continue;
        events.push({
          key: `report:${line.ticker}:${group.map((record) => record.key).join("+")}:${first.report_date}`,
          kind: "report",
          day: fresh ? day : first.report_date!,
          at: first.report_date!,
          ticker: line.ticker,
          text,
          detail: null,
          verdict: first.status as "holds" | "broken",
          source: group.map((record) => record.source).join("; "),
          href: first.href,
          ...(fresh ? {} : { baseline: true }),
        });
      }
    }
    for (const record of records) {
      const metric = record.metric;
      if (!metric) continue;
      const timing = METRICS[metric].timing;
      if (timing === "report") {
        continue;
      } else if (timing === "daily" && !joined) {
        const old = before.find((entry) => entry.key === record.key);
        const was = old?.status;
        if (
          (was === "holds" || was === "broken") &&
          (record.status === "holds" || record.status === "broken") &&
          was !== record.status
        ) {
          const text = fits(flipSentence(line.ticker, record));
          if (text)
            events.push({
              key: `line:${line.ticker}:${record.key}:${day}`,
              kind: "line",
              day,
              at: record.as_of ?? day,
              ticker: line.ticker,
              text,
              detail: null,
              verdict: record.status,
              source: record.source,
              href: record.href,
            });
        }
      }
    }
  }

  // Filings: each recorded once by its accession; what was on file when a company joined is context.
  const seen = new Set(previous?.seen_filings ?? []);
  const activeTickers = new Set(active.map((line) => line.ticker));
  const nextSeen: string[] = [...(previous?.seen_filings ?? [])];
  for (const doc of input.filings ?? []) {
    if (!activeTickers.has(doc.ticker)) continue;
    const entries = comparisonsOf(doc);
    // A company that just joined, or whose filings this thesis has never seen (its record appeared after it joined).
    const joined = !known.has(doc.ticker) || !entries.some((entry) => seen.has(entry.filing.accession));
    let baselined = false;
    for (const entry of entries) {
      const accession = entry.filing.accession;
      if (seen.has(accession)) continue;
      seen.add(accession);
      nextSeen.push(accession);
      if (!moves(entry)) continue;
      const age = daysBetween(entry.filing.filed, day);
      // An older filing that only now reached the record (a 10-K filled in later) is context, not news.
      if (joined || age > RISK_DAYS) {
        // Only the newest change on file, and only when it is recent enough to matter.
        if (baselined || age > BASELINE_DAYS) continue;
        baselined = true;
        const event = filingEvent(doc.ticker, entry, day, true);
        if (event) events.push(event);
      } else {
        const event = filingEvent(doc.ticker, entry, day, false);
        if (event) events.push(event);
      }
    }
  }

  // Filings not read tonight: the risks still inside the window stand, so a failed read never moves the status.
  const risks = input.filings
    ? risksOf(input.filings, activeTickers, day)
    : (previous?.risks ?? []).filter((risk) => activeTickers.has(risk.ticker) && daysBetween(risk.filed, day) <= RISK_DAYS);
  const rolled = rollUp(verdicts, risks);
  const base = edited ? null : baseOf(previous, day);
  const changed = base !== null && base.status !== rolled.status;
  // Where the status stands: moved tonight, carried on, or (after the person's own edit) restarted without news.
  const carried = base ?? (edited && previous!.status === rolled.status ? { status_since: previous!.status_since, previous_status: previous!.previous_status } : null);
  const statusKey = `status:${day}`;
  if (changed) {
    events.push({
      key: statusKey,
      kind: "status",
      day,
      at: day,
      ticker: null,
      text: statusSentence(rolled.status, rolled.counts, risks),
      detail: null,
      verdict: null,
      source: "Your thesis check",
      href: null,
      status: rolled.status,
    });
  }

  // New events replace stored ones with the same key; a status change undone the same day is taken back out.
  const fresh = new Map(events.map((event) => [event.key, event]));
  const kept = (previous?.events ?? []).filter(
    (event) => !fresh.has(event.key) && !(event.key === statusKey && !changed),
  );
  // Newest day first; within a day the status change leads, then its evidence, newest source first.
  const allEvents = [...events, ...kept]
    .sort(
      (a, b) =>
        b.day.localeCompare(a.day) ||
        Number(b.kind === "status") - Number(a.kind === "status") ||
        b.at.localeCompare(a.at) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, EVENTS_MAX);

  const sources = [
    ...new Set(
      lines.flatMap((line) =>
        line.records
          .filter((record) => record.status !== "unknown" && record.source)
          .map((record) => record.source),
      ),
    ),
  ].slice(0, 6);
  const row: ThesisHistoryRow = {
    day,
    status: rolled.status,
    holds: rolled.counts.holds,
    broke: rolled.counts.broke,
    waiting: rolled.counts.waiting,
    sources,
  };
  const history = [
    ...(previous?.history ?? []).filter((entry) => entry.day !== day),
    row,
  ]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-HISTORY_MAX);

  return {
    version: THESIS_STATE_VERSION,
    uid: input.uid,
    basket_id: input.basketId,
    day,
    checked_at: input.now.toISOString(),
    spec_created_at: spec.created_at,
    spec_version: spec.version,
    base,
    status: rolled.status,
    status_since: changed || !carried ? day : carried.status_since,
    previous_status: changed ? base!.status : (carried?.previous_status ?? null),
    counts: rolled.counts,
    affected: rolled.affected,
    lines,
    risks,
    seen_filings: nextSeen.slice(-SEEN_MAX),
    events: allEvents,
    history,
  };
}
