/**
 * The "new SEC filing" agent event: a stock in scope filed a form with the
 * SEC since the last check, optionally only some forms (8-K, 10-K, 10-Q, S-1,
 * 13D/G) and, for an 8-K, only some items (1.01 a deal, 2.02 results, 5.02 an
 * officer change, ...). Form 4 is the insider-trade agent, not this one.
 *
 * Pure: the rows come from `tm_agent_filings` (backend/agentdata/sec_filings.py)
 * through lib/agent-events-data.ts. Each filing is placed on the day anyone
 * could have read it (`filingKnownDay`), so a replay day never sees a filing
 * that was accepted after that day's check.
 */

import type { AgentEvaluation, AgentFinding, AgentScope } from "@/lib/agent-jobs";
import { FILING_GROUPS, type Filing, type FilingGroup } from "@/lib/filings-shared";

/* ── what a filing watch can ask for ────────────────────────────────────── */

export type FilingFilter = {
  /** Only these form groups. With `items` and no forms, 8-K is implied. */
  forms?: FilingGroup[];
  /** 8-K items, like "1.01". An 8-K must carry at least one of them. */
  items?: string[];
  /** "Something big": see MAJOR_ITEMS and `isMajorFiling`. Overrides forms and items. */
  major?: boolean;
};

/** The SEC's 8-K item titles, in plain words (same table as backend/agentdata/sec_filings.py). */
export const ITEM_WORDS: Record<string, string> = {
  "1.01": "a new material agreement",
  "1.02": "a material agreement ending",
  "1.03": "bankruptcy or receivership",
  "1.05": "a material cybersecurity incident",
  "2.01": "an acquisition or sale of assets",
  "2.02": "quarterly results",
  "2.03": "new debt",
  "2.04": "debt coming due early",
  "2.05": "restructuring or exit costs",
  "2.06": "a material impairment",
  "3.01": "a delisting notice",
  "3.02": "an unregistered sale of shares",
  "3.03": "a change to shareholder rights",
  "4.01": "a change of auditor",
  "4.02": "past results that can no longer be relied on",
  "5.01": "a change in control",
  "5.02": "a director or executive change",
  "5.03": "a bylaw or fiscal year change",
  "5.07": "shareholder vote results",
  "7.01": "an investor presentation or other public disclosure",
  "8.01": "another material event",
};

/**
 * 8-K items that count as "something big". Left out on purpose, measured on
 * the covered universe from Oct 13 to Nov 10, 2026: 2.02 results (552 filings,
 * and the earnings agents already cover them), 5.02 director or officer
 * changes (147 filings, mostly board seats and pay plans, often twice a month
 * at one company), 7.01 and 8.01 (presentations, bond deals), 9.01 exhibits.
 */
export const MAJOR_ITEMS = ["1.01", "1.02", "1.03", "1.05", "2.01", "2.05", "2.06", "3.01", "4.01", "4.02", "5.01"] as const;

/** Which 8-K item names the filing in one line: the most newsworthy one first. */
const ITEM_ORDER = ["1.03", "4.02", "1.05", "5.01", "2.01", "3.01", "2.02", "2.05", "2.06", "1.01", "1.02", "5.02", "4.01", "2.03", "2.04", "3.02", "3.03", "5.07", "5.03", "8.01", "7.01"];

const ITEM_RE = /^\d\.\d{2}$/;

/** Untrusted input to a filter, or undefined when it asks for nothing in particular. */
export function cleanFilingFilter(raw: unknown): FilingFilter | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  if (input.major === true) return { major: true };
  const forms = Array.isArray(input.forms)
    ? FILING_GROUPS.filter((group) => (input.forms as unknown[]).some((form) => String(form).toUpperCase() === group))
    : [];
  const items = Array.isArray(input.items)
    ? [...new Set((input.items as unknown[]).map((item) => String(item).trim()).filter((item) => ITEM_RE.test(item) && item in ITEM_WORDS))].sort()
    : [];
  if (items.length > 0 && !forms.includes("8-K")) forms.unshift("8-K");
  if (forms.length === 0) return undefined;
  return items.length > 0 ? { forms, items } : { forms };
}

/** Whether "any stock" makes sense for this filter: only the rare forms (offerings, big stakes). */
export function filingFilterAllowsAnyStock(filter: FilingFilter | undefined): boolean {
  return Boolean(filter?.forms?.length) && !filter?.major && filter!.forms!.every((form) => form === "S-1" || form === "13D/G");
}

/* ── facts ──────────────────────────────────────────────────────────────── */

export type FilingFact = {
  id: string;
  ticker: string;
  company: string;
  /** The exact SEC form, like "8-K/A" or "SCHEDULE 13G". */
  form: string;
  group: FilingGroup;
  amendment: boolean;
  /** Item codes, 8-K only. */
  items: string[];
  /** Acceptance time at the SEC, ISO UTC. */
  filed_at: string;
  /** The market day anyone could first have read it: see `filingKnownDay`. */
  day: string;
  url: string;
};

/** After this time (New York) a filing is read by the next day's check. The after-close run starts at 5:30 PM. */
export const FILING_CUTOFF_MINUTES_ET = 17 * 60;

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYY-MM-DD" and minutes after midnight, New York time. */
export function etClock(iso: string): { day: string; minutes: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(ET_PARTS.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** The New York day a filing counts for: its own day, or the next one when it was accepted after the cutoff. */
export function filingKnownDay(filedAt: string, cutoffMinutes = FILING_CUTOFF_MINUTES_ET): string | null {
  const clock = etClock(filedAt);
  if (!clock) return null;
  return clock.minutes >= cutoffMinutes ? nextDay(clock.day) : clock.day;
}

/** A normalized filing (lib/filings-shared.ts `normalizeFiling`) as the agent reads it. */
export function filingFact(filing: Filing): FilingFact | null {
  const day = filingKnownDay(filing.filedAt);
  if (!day) return null;
  return {
    id: filing.id,
    ticker: filing.ticker,
    company: filing.company,
    form: filing.form,
    group: filing.group,
    amendment: filing.amendment,
    items: filing.items.map((item) => item.code),
    filed_at: filing.filedAt,
    day,
    url: filing.url,
  };
}

/* ── matching ───────────────────────────────────────────────────────────── */

function passiveStake(filing: Pick<FilingFact, "form">): boolean {
  return /13G/i.test(filing.form);
}

/** A deal, an acquisition, a restatement, an annual report, a share offering or an activist stake. */
export function isMajorFiling(filing: FilingFact): boolean {
  if (filing.amendment) return false;
  if (filing.group === "10-K" || filing.group === "S-1") return true;
  if (filing.group === "13D/G") return /13D/i.test(filing.form);
  if (filing.group === "8-K") return filing.items.some((item) => (MAJOR_ITEMS as readonly string[]).includes(item));
  return false;
}

export function matchesFilingFilter(filing: FilingFact, filter: FilingFilter | undefined): boolean {
  if (filter?.major) return isMajorFiling(filing);
  const forms = filter?.forms ?? [];
  // With no filter, a fund's routine passive-stake update (13G) is not news about the company.
  if (forms.length === 0) return !passiveStake(filing);
  if (!forms.includes(filing.group)) return false;
  if (filing.group === "8-K" && filter?.items?.length) return filing.items.some((item) => filter.items!.includes(item));
  return true;
}

/* ── words ──────────────────────────────────────────────────────────────── */

const FORM_WORDS: Record<FilingGroup, string> = {
  "8-K": "an 8-K",
  "10-K": "an annual report (10-K)",
  "10-Q": "a quarterly report (10-Q)",
  "S-1": "a share offering (S-1)",
  "13D/G": "a report of a stake above 5% (13D or 13G)",
};

function joinWith(parts: string[], word: "or" | "and"): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

function joinOr(parts: string[]): string {
  return joinWith(parts, "or");
}

/** What the watch is for, after "files": "an 8-K about a new material agreement", "anything". */
export function filingFilterPhrase(filter: FilingFilter | undefined, short = false): string {
  if (filter?.major) return short ? "something big" : "something big: a deal, an acquisition, a restatement, an annual report, a share offering or an activist stake";
  const forms = filter?.forms ?? [];
  if (forms.length === 0) return "anything with the SEC";
  return joinOr(
    forms.map((form) => {
      if (form === "8-K" && filter?.items?.length) return `an 8-K about ${joinOr(filter.items.map((item) => ITEM_WORDS[item] ?? `item ${item}`))}`;
      return FORM_WORDS[form];
    }),
  );
}

/**
 * The watch after "when": "NVDA files an 8-K", or for stake reports, which
 * an investor files about the company, "an investor reports a stake ... in TSLA".
 */
export function filingWhen(filter: FilingFilter | undefined, who: string, anyCompany: boolean): string {
  const forms = filter?.forms ?? [];
  if (!filter?.major && forms.length === 1 && forms[0] === "13D/G") {
    return `an investor reports a stake of more than 5% in ${anyCompany ? "any company" : who} (13D or 13G)`;
  }
  return `${anyCompany ? "any company" : who} files ${filingFilterPhrase(filter)}`;
}

/** "New 8-K", "Something big filed", "New SEC filing": the trigger in a few words. */
export function filingTriggerLabel(filter: FilingFilter | undefined): string {
  if (filter?.major) return "Files something big";
  const forms = filter?.forms ?? [];
  if (forms.length === 0) return "New SEC filing";
  if (forms.length === 1 && forms[0] === "8-K" && filter?.items?.length === 1) return `8-K: ${ITEM_WORDS[filter.items[0]]?.replace(/^an? /, "") ?? filter.items[0]}`;
  return `New ${forms.join(" or ")}`;
}

function leadItem(items: string[]): string | null {
  return ITEM_ORDER.find((code) => items.includes(code)) ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : day;
}

function timeLabel(iso: string): string {
  const clock = etClock(iso);
  if (!clock) return "";
  const hour = Math.floor(clock.minutes / 60);
  const minute = clock.minutes % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} ET`;
}

/** The finding's headline: what was filed, in plain words. */
export function filingHeadline(filing: FilingFact): string {
  const t = filing.ticker;
  if (filing.group === "10-K") return filing.amendment ? `${t} amended its annual report (10-K/A)` : `${t} filed its annual report (10-K)`;
  if (filing.group === "10-Q") return filing.amendment ? `${t} amended its quarterly report (10-Q/A)` : `${t} filed its quarterly report (10-Q)`;
  if (filing.group === "S-1") return filing.amendment ? `${t} updated its share offering (S-1/A)` : `${t} filed to sell new shares (S-1)`;
  if (filing.group === "13D/G") {
    const active = /13D/i.test(filing.form);
    const kind = active ? "an active stake" : "a passive stake";
    return filing.amendment ? `An investor updated ${kind} of more than 5% in ${t} (${active ? "13D/A" : "13G/A"})` : `An investor reported ${kind} of more than 5% in ${t} (${active ? "13D" : "13G"})`;
  }
  const lead = leadItem(filing.items);
  const form = filing.amendment ? "an amended 8-K" : "an 8-K";
  return lead ? `${t} filed ${form} on ${ITEM_WORDS[lead]}` : `${t} filed ${form}`;
}

export function filingFinding(filing: FilingFact): AgentFinding {
  const when = `${dayLabel(etClock(filing.filed_at)?.day ?? filing.day)}${timeLabel(filing.filed_at) ? ` at ${timeLabel(filing.filed_at)}` : ""}`;
  const lead = leadItem(filing.items);
  const others = filing.items.filter((item) => item !== lead && item !== "9.01" && ITEM_WORDS[item]).map((item) => ITEM_WORDS[item]);
  const also = others.length ? ` It also covers ${joinWith(others, "and")}.` : "";
  return {
    ticker: filing.ticker,
    headline: filingHeadline(filing),
    detail: `Filed with the SEC on ${when}.${also} The link opens the original filing.`,
    source: "SEC EDGAR",
    url: filing.url,
    at: etClock(filing.filed_at)?.day ?? filing.day,
    kind: "filing",
    form: filing.form,
  };
}

/* ── the evaluator ──────────────────────────────────────────────────────── */

function inWindow(day: string, since: string | null, until: string): boolean {
  if (!day || day > until) return false;
  return since == null ? day === until : day > since;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function names(list: string[], max = 4): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(", ")} and ${list.length - max} more`;
}

function span(since: string | null, day: string): string {
  if (since == null || nextDay(since) === day) return dayLabel(day);
  return `${dayLabel(nextDay(since))} to ${dayLabel(day)}`;
}

/**
 * Filings in scope that match the filter and became readable after `since`
 * and on or before `day`. Newest first, one finding per filing.
 */
export function evaluateFilingEvent(
  filter: FilingFilter | undefined,
  scope: AgentScope,
  facts: { filings?: FilingFact[]; available: { filings?: boolean } },
  options: { day: string; since: string | null; tickers: string[] },
  maxFindings: number,
): AgentEvaluation {
  const { day, since, tickers } = options;
  const when = span(since, day);
  if (!facts.available.filings) {
    return { decision: "could_not_check", summary: "Could not check: SEC filings were not available.", findings: [], checked: ["SEC filings: unavailable"] };
  }
  const anyStock = scope.kind === "any";
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  const inSpan = (facts.filings ?? []).filter((filing) => inWindow(filing.day, since, day));
  const mine = anyStock ? inSpan : inSpan.filter((filing) => wanted.has(filing.ticker));
  const hits = mine.filter((filing) => matchesFilingFilter(filing, filter));
  const what = filingFilterPhrase(filter, true);
  const checked = [
    `SEC filings from ${when}: ${plural(inSpan.length, "filing")} across the companies we cover`,
    anyStock ? "Names in scope: any" : `Names in scope: ${tickers.length}, ${plural(mine.length, "filing")} from them`,
  ];
  if (hits.length === 0) {
    const none = anyStock ? `No company we cover filed ${what} on ${when}.` : mine.length > 0 && filter
      ? `${plural(mine.length, "filing")} from your names on ${when}, none of them ${what}.`
      : `None of your names filed ${what} on ${when}.`;
    return { decision: "nothing", summary: `Checked, nothing to do. ${none}`, findings: [], checked };
  }
  const ordered = [...hits].sort((a, b) => Number(isMajorFiling(b)) - Number(isMajorFiling(a)) || b.filed_at.localeCompare(a.filed_at) || a.ticker.localeCompare(b.ticker));
  const findings = ordered.slice(0, maxFindings).map(filingFinding);
  const companies = [...new Set(ordered.map((filing) => filing.ticker))];
  const summary =
    hits.length === 1
      ? `${findings[0].headline}, on ${dayLabel(findings[0].at)}.`
      : `${plural(hits.length, "new SEC filing")} from ${names(companies)}.`;
  return { decision: "notify", summary, findings, checked };
}

/** What a replay of this watch cannot know, said plainly. */
export function filingReplayNotes(): string[] {
  return [
    "SEC filings are placed on the day they were accepted. One accepted after 5 PM New York time counts for the next day's check.",
  ];
}
