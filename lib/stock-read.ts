/**
 * "The read": the stored AI brief reduced to the four things the stock page
 * shows: the verdict, three reasons, what would change the call, and when it
 * was written. Pure reshaping of text the brief pipeline already stored;
 * nothing is generated here.
 */

import { ANALYST_FIRMS, firmIsSubject } from "@/lib/analyst-firms";
import { callWord, type CallWord } from "@/lib/stock-chart";
import type { CallStabilityStateDoc, DirectiveStability, StockIntelligenceDoc } from "@/lib/stock";
import { todayET } from "@/lib/calendar-shared";
import { withoutVagueChange } from "@/lib/call-basis";
import { plainRuleChange } from "@/lib/rule-copy";

export { plainRuleChange };

/**
 * The reason the screener job writes for this company from its own numbers
 * (backend/call_reason.py `compose_company_reason`, stored on the
 * `tm_screener_snapshot` row). Used under the call only when it was written
 * for the same call the brief shows now.
 */
export type CompanyReason = {
  text: string;
  call: CallWord | null;
  source?: string | null;
  /** The last close the screener job wrote this reason from (its snapshot's `price_history_to`), YYYY-MM-DD. */
  asOf?: string | null;
};

export type StockRead = {
  call: CallWord | null;
  /** The action in the brief's own words, e.g. "Hold here". */
  actionLabel: string | null;
  /** Two sentences on why this call: the company reason when it matches the call, else the brief's `call_reason`, else the template summary. */
  actionSummary: string | null;
  headline: string | null;
  /** The longer narrative paragraph, when it adds to the headline. */
  body: string | null;
  reasons: string[];
  changers: string[];
  confidence: "low" | "medium" | "high" | null;
  horizon: string | null;
  zones: { addBelow: number | null; addAbove: number | null; trimAbove: number | null };
  writtenAt: string | null;
  articleCount: number | null;
  sourceCount: number | null;
  /** When `actionSummary` is the company reason: the day of the data it was written from, which can be newer than the call. */
  reasonAsOf?: string | null;
  /** The brief says its call changed since the previous one; `from` is the call before, when the call ledger confirms it. */
  changed: { reason: string | null; from: CallWord | null } | null;
  /** The day the call took its current value (YYYY-MM-DD): the steady call's own date, else the call ledger's. */
  since: string | null;
  /** What would change the call, from the rule that holds it steady. Null until the steady call is published. */
  whatWouldChange: string | null;
  /** Today's review leaned toward this other call and the steady call held. */
  heldAgainst: CallWord | null;
  /** The steady call's own start day (YYYY-MM-DD), only while calls are held steady; null otherwise. */
  steadySince: string | null;
  /**
   * Which way the steady call itself moved on `steadySince` (+1 up, -1 down, 0 when it made no move that day, as
   * for a call it started from), the way backend/call_stability.py `_last_direction` counts it. Null when only the
   * call ledger can say.
   */
  steadyStep: -1 | 0 | 1 | null;
  /** The stories the brief was written from (its timeline), so each fact can link the one behind it. */
  sources?: ReadSource[];
};

/** One story behind the brief: its headline, link and publisher. */
export type ReadSource = { title: string; url: string; source: string };

/** The brief's stories with a real link, newest first as stored, at most `max`, each link once. */
export function readSources(timeline: unknown, max = 12): ReadSource[] {
  const out: ReadSource[] = [];
  const seen = new Set<string>();
  for (const event of Array.isArray(timeline) ? timeline : []) {
    const row = (event ?? {}) as { title?: unknown; article_url?: unknown; source_name?: unknown };
    const title = clean(row.title);
    const url = clean(row.article_url);
    if (!title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ title, url, source: clean(row.source_name) });
    if (out.length >= max) break;
  }
  return out;
}

type Evidence = { text?: unknown; type?: unknown };

/** `call_reason` is the stock-specific line the pipeline writes under the call (backend/call_reason.py). */
type LooseDirective = NonNullable<StockIntelligenceDoc["directive_v2"]> & { evidence?: Evidence[]; call_reason?: unknown };

type LooseIntelligence = StockIntelligenceDoc & {
  evidence_history?: { article_count?: unknown; source_count?: unknown };
};

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Append `item` unless the list already says it (same text, or one contains the other). */
function pushDistinct(list: string[], item: unknown): void {
  const text = clean(item);
  if (!text) return;
  const key = norm(text);
  if (!key) return;
  for (const existing of list) {
    const other = norm(existing);
    if (other === key) return;
    // One sentence restating part of another. Short fragments are exempt: a
    // three-letter word is "contained" in almost anything.
    const [short, long] = key.length <= other.length ? [key, other] : [other, key];
    if (short.length >= 20 && long.includes(short)) return;
  }
  list.push(text);
}

function positive(value: unknown): number | null {
  return fin(value) && value > 0 ? value : null;
}

/** The company reason, when it was written from the numbers for the call the brief shows. */
const MONTH_INDEX: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * Drops a forward-looking sentence whose date has passed ("The Nov 17 report decides what we do" on Nov 18),
 * so a stalled snapshot never shows yesterday's plan as today's. `today` is a New York YYYY-MM-DD.
 */
export function dropPastDatedSentences(text: string, today: string): string {
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(now)) return text;
  // Split only where a sentence ends and a new one starts, so "3.3%" never splits.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  const kept = sentences.filter((sentence) => {
    const match = /\bThe ([A-Z][a-z]{2}) (\d{1,2}) report\b/.exec(sentence);
    if (!match || MONTH_INDEX[match[1]!] === undefined) return true;
    const year = Number(today.slice(0, 4));
    let date = Date.UTC(year, MONTH_INDEX[match[1]!]!, Number(match[2]));
    // A December report named in January is last year's; one named more than six months back is next year's.
    if (date - now > 180 * 86_400_000) date = Date.UTC(year - 1, MONTH_INDEX[match[1]!]!, Number(match[2]));
    if (now - date > 180 * 86_400_000) date = Date.UTC(year + 1, MONTH_INDEX[match[1]!]!, Number(match[2]));
    return date >= now;
  });
  return kept.join(" ").trim();
}

export function matchingCompanyReason(reason: CompanyReason | null | undefined, call: CallWord | null, today: string = todayET()): string | null {
  if (!reason || !call || reason.call !== call || reason.source !== "company") return null;
  // Older snapshot rows end on a condition nobody can check ("if they slow sharply"); that sentence goes.
  return dropPastDatedSentences(withoutVagueChange(clean(reason.text)), today) || null;
}

// "What would change our mind" items that say nothing about the company: sector or market-wide lines, and the
// engine's shared "Revisit if ..." templates (the company reason already says what would change the call).
const MARKET_WIDE = /\b(?:breadth|sector|market leadership|the (?:broader |wider )?market|risk appetite|rates? (?:rise|rises|stay high))\b|^revisit (?:only )?if\b/i;

/**
 * The call before the current one, from the call ledger (lib/stock-chart.ts `callChanges`): the latest switch
 * into `call`, only when it happened within a week of the brief, so an old switch is never passed off as
 * the change this brief reports. Null when the ledger does not confirm it.
 */
export function previousCall(
  changes: ReadonlyArray<{ date: string; from: CallWord | null; to: CallWord }>,
  call: CallWord | null,
  writtenAt: string | null,
): CallWord | null {
  if (!call) return null;
  const last = [...changes].reverse().find((change) => change.from);
  if (!last || last.to !== call || !last.from || last.from === call) return null;
  const written = writtenAt ? Date.parse(writtenAt) : NaN;
  const switched = Date.parse(`${last.date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(written) || !Number.isFinite(switched)) return null;
  const days = (written - switched) / 86_400_000;
  return days >= -1 && days <= 7 ? last.from : null;
}

/**
 * The day the current call began. The steady call carries its own date; without it the call ledger says when the
 * call last switched to what it is now (or when coverage began, if it never switched). A ledger that has not caught
 * up with this brief yet (its last call differs) gives the brief's own day.
 */
export function callSince(
  changes: ReadonlyArray<{ date: string; from: CallWord | null; to: CallWord }>,
  call: CallWord | null,
  options: { stabilitySince?: unknown; stabilityTrigger?: unknown; writtenAt?: string | null } = {},
): string | null {
  const own = clean(options.stabilitySince);
  const last = changes.length ? changes[changes.length - 1] : null;
  const ledger = call && last && last.to === call && /^\d{4}-\d{2}-\d{2}/.test(last.date) ? last.date.slice(0, 10) : null;
  // "start" is only the day the steady call was switched on; the ledger knows how long the call really stood.
  if (/^\d{4}-\d{2}-\d{2}$/.test(own) && !(clean(options.stabilityTrigger) === "start" && ledger && ledger < own)) return own;
  if (!call) return null;
  if (ledger) return ledger;
  // No ledger at all (empty, or its read failed): we don't know how long the call stood, so no "since".
  if (changes.length === 0) return null;
  const written = clean(options.writtenAt);
  return /^\d{4}-\d{2}-\d{2}/.test(written) ? todayET(Date.parse(written)) : null;
}

// The state version the backend decides from (backend/call_stability.py `VERSION`); any other it ignores, and so do we.
const STABILITY_VERSION = "stability-1";
const STABILITY_TRIGGERS = new Set(["start", "confirmed", "earnings", "guidance", "move", "market"]);

/**
 * The steady call's stored state (`tm_call_stability/{id}`) in the brief's `directive_v2.stability` shape, for a brief
 * written before the steady call was published (most briefs are rebuilt only every few days). Only when the state's
 * call is the call the brief shows: if they differ the brief is behind the steady call, and the page keeps the
 * brief as it is rather than mix the two. "What would change it" and "the latest data leans the other way" are
 * written with the day's prices and vote, which the state does not keep, so they stay empty.
 */
const STEP_RANK: Record<string, number> = { Trim: 0, Hold: 1, Add: 2 };

/**
 * Which way the steady call moved on `since`, from its own changes (backend `_last_direction`): a state seeded or
 * started on that day made no move, so the rule treats a fall or a market drop as able to move it inside the hold.
 */
export function stepFromState(state: CallStabilityStateDoc | null | undefined, since: string): -1 | 0 | 1 {
  const changes = Array.isArray(state?.changes) ? (state!.changes as Array<Record<string, unknown> | null>) : [];
  const last = changes.length ? changes[changes.length - 1] : null;
  if (!last || clean(last.date) !== since) return 0;
  const from = STEP_RANK[clean(last.from)];
  const to = STEP_RANK[clean(last.to)];
  if (from === undefined || to === undefined || from === to) return 0;
  return to > from ? 1 : -1;
}

export function stabilityFromState(state: CallStabilityStateDoc | null | undefined, call: CallWord | null): DirectiveStability | null {
  if (!state || !call || state.version !== STABILITY_VERSION || state.call !== call) return null;
  const since = clean(state.since);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const trigger = clean(state.since_trigger);
  const setOn = clean(state.levels?.set_on);
  return {
    version: STABILITY_VERSION,
    since,
    since_reason: clean(state.since_reason) || null,
    trigger: STABILITY_TRIGGERS.has(trigger) ? (trigger as DirectiveStability["trigger"]) : null,
    what_would_change: null,
    levels_set_on: /^\d{4}-\d{2}-\d{2}$/.test(setOn) ? setOn : null,
    held_against_vote: null,
    vote: null,
  };
}

/** True when every story the brief was written from only quotes this company (a bank or broker) as the analyst. */
export function writtenFromOtherCompaniesNews(doc: { instrument_id?: unknown; timeline?: unknown } | null | undefined): boolean {
  const ticker = clean(doc?.instrument_id).replace(/^[A-Z]+_/, "");
  if (!ticker || !ANALYST_FIRMS.has(ticker)) return false;
  const events: unknown[] = Array.isArray(doc?.timeline) ? doc.timeline : [];
  const titles = events.map((event) => clean((event as { title?: unknown } | null)?.title)).filter(Boolean);
  return titles.length > 0 && titles.every((title) => !firmIsSubject(ticker, title));
}

export function buildStockRead(
  intelligence: StockIntelligenceDoc | null | undefined,
  options: {
    companyReason?: CompanyReason | null;
    callChanges?: ReadonlyArray<{ date: string; from: CallWord | null; to: CallWord }>;
    /** The steady call's stored state, used only when the brief carries no `stability` of its own. */
    steadyState?: CallStabilityStateDoc | null;
  } = {},
): StockRead | null {
  if (!intelligence) return null;
  const doc = intelligence as LooseIntelligence;
  const directive = (doc.directive_v2 ?? null) as LooseDirective | null;
  const evidence = Array.isArray(directive?.evidence) ? directive.evidence : [];

  const reasons: string[] = [];
  for (const item of evidence) if (clean(item.type) !== "risk") pushDistinct(reasons, item.text);
  for (const driver of doc.visual_cards?.drivers ?? []) pushDistinct(reasons, driver.detail || driver.label);
  for (const point of doc.key_points ?? []) pushDistinct(reasons, point);
  pushDistinct(reasons, doc.visual_summary?.why_it_matters);

  const ownStability = directive?.stability ?? null;
  const stability = ownStability ?? stabilityFromState(options.steadyState, callWord(directive?.stance));
  const whatWouldChange = plainRuleChange(clean(stability?.what_would_change)) || null;
  const changers: string[] = [];
  for (const item of evidence) if (clean(item.type) === "risk") pushDistinct(changers, item.text);
  for (const card of doc.visual_cards?.risk_cards ?? []) pushDistinct(changers, card.trigger || card.detail || card.risk);
  // With the steady call these two are the rule's own sentence, which the call block shows on its own.
  if (!whatWouldChange) {
    pushDistinct(changers, directive?.invalidation);
    pushDistinct(changers, directive?.watch_out);
  }
  pushDistinct(changers, doc.visual_summary?.what_to_watch);
  pushDistinct(changers, doc.risk);

  const headline = clean(doc.headline) || clean(doc.thesis) || clean(doc.visual_summary?.what_changed) || null;
  // A brief written only from stories that quote this bank as the analyst ("JPMorgan says Strategy could face...")
  // narrates other companies' news: leave its paragraph out. The pipeline no longer feeds it such stories.
  const offTopic = writtenFromOtherCompaniesNews(doc);
  const bodyText = offTopic ? "" : clean(doc.today_brief) || clean(doc.body) || clean(doc.visual_summary?.what_changed);
  const body = bodyText && (!headline || norm(bodyText) !== norm(headline)) ? bodyText : null;
  const actionLabel = clean(directive?.action?.label) || null;
  // The company reason first (its own numbers and what would change the call), then the brief's
  // stock-specific line, then the shared template that older briefs carry.
  const companyReason = matchingCompanyReason(options.companyReason, callWord(directive?.stance));
  const actionSummary = companyReason || clean(directive?.call_reason) || clean(directive?.action?.summary) || null;
  // With a reason about the company, sector-wide lines ("Technology breadth remains weak") say less than it does.
  // Short labels only: a longer sentence that mentions the sector is usually about the company itself.
  const shownChangers = companyReason ? changers.filter((item) => !(MARKET_WIDE.test(item) && (item.length <= 70 || /^revisit/i.test(item)))) : changers;

  if (!headline && !body && !actionLabel && reasons.length === 0) return null;

  const confidenceRaw = clean(directive?.confidence).toLowerCase();
  const zones = directive?.zones ?? {};
  return {
    call: callWord(directive?.stance),
    actionLabel,
    actionSummary,
    reasonAsOf: companyReason ? options.companyReason?.asOf ?? null : null,
    headline,
    body,
    reasons: reasons.slice(0, 3),
    changers: shownChangers.slice(0, 3),
    confidence:
      confidenceRaw === "high" ? "high" : confidenceRaw === "medium" || confidenceRaw === "med" ? "medium" : confidenceRaw === "low" ? "low" : null,
    horizon: clean(directive?.horizon) || null,
    zones: {
      addBelow: positive(zones.accumulate_below),
      addAbove: positive(zones.breakout_above),
      trimAbove: positive(zones.trim_above),
    },
    writtenAt: clean(doc.generated_at) || null,
    // Those stories are not about the company, so they are not counted as its news either.
    articleCount: offTopic ? null : positive(doc.evidence_history?.article_count) ?? positive(doc.news_count),
    sourceCount: offTopic ? null : positive(doc.evidence_history?.source_count) ?? positive(doc.source_count),
    changed: directive?.changed_from_previous
      ? {
          reason: readableChangeReason(directive.change_reason),
          from: previousCall(options.callChanges ?? [], callWord(directive?.stance), clean(doc.generated_at) || null),
        }
      : null,
    since: callSince(options.callChanges ?? [], callWord(directive?.stance), {
      stabilitySince: stability?.since,
      stabilityTrigger: stability?.trigger,
      writtenAt: clean(doc.generated_at) || null,
    }),
    whatWouldChange,
    heldAgainst: stability?.held_against_vote ? heldVote(stability.vote, callWord(directive?.stance)) : null,
    steadySince: /^\d{4}-\d{2}-\d{2}$/.test(clean(stability?.since)) ? clean(stability?.since) : null,
    // From the state when we read it; a brief's own stability carries no changes, but "start" means the rule made no
    // move that day. Otherwise the call ledger's switch on that day stands in (the caller's `lastStepOn`).
    steadyStep: !stability
      ? null
      : ownStability
        ? clean(ownStability.trigger) === "start"
          ? 0
          : null
        : stepFromState(options.steadyState, clean(stability.since)),
    // Stories about other companies are not this brief's evidence either.
    sources: offTopic ? [] : readSources((doc as { timeline?: unknown }).timeline),
  };
}

function heldVote(vote: unknown, call: CallWord | null): CallWord | null {
  const word = vote === "Add" || vote === "Hold" || vote === "Trim" ? vote : null;
  return word && word !== call ? word : null;
}

/** The pipeline sometimes records its own bookkeeping as the reason a call changed. That is not for readers. */
function readableChangeReason(value: unknown): string | null {
  const reason = clean(value);
  if (!reason || /shadow policy|prior directive|\bdirective\b|policy differs/i.test(reason)) return null;
  return reason;
}

/**
 * Phrases a publisher's bot wall or error page leaves behind. A brief that
 * quotes one was written from a page that never loaded, so its headline and
 * reasons are not about the company at all.
 */
const BLOCKED_PAGE_MARKERS = [
  /human verification/i,
  /verify (?:that )?you are (?:a )?human/i,
  /are you a robot/i,
  /enable javascript/i,
  /access (?:to this page (?:has been|is) )?denied/i,
  /unusual (?:traffic|activity) from your/i,
  /checking your browser/i,
  /page requests? .{0,40}verification/i,
  /\b(?:403|404) (?:forbidden|not found)\b/i,
];

/** True when the read's own text shows it was written from a blocked or broken page. */
export function readLooksBroken(read: StockRead): boolean {
  const texts = [read.headline, read.body, read.actionSummary, read.changed?.reason ?? null, ...read.reasons, ...read.changers];
  return texts.some((text) => typeof text === "string" && BLOCKED_PAGE_MARKERS.some((marker) => marker.test(text)));
}
