/** Formatting shared by the stock report. Server and client safe. */

import { wholeSentences } from "@/lib/plain-copy";

export function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function moneyFormatter(currency: string) {
  return (value: number) =>
    `${currency}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Whole-unit price for levels and targets; keeps cents under 10 so penny names stay readable. */
export function levelFormatter(currency: string) {
  return (value: number) =>
    Math.abs(value) < 10
      ? `${currency}${value.toFixed(2)}`
      : `${currency}${Math.round(value).toLocaleString("en-US")}`;
}

export function signedPct(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}%`;
}

export function plainPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function multiple(value: number): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)}×`;
}

export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-05" (or any ISO string starting that way) to "Nov 5, 2026". Parsed by hand so no timezone can shift the day. */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return withYear ? `${month} ${Number(match[3])}, ${match[1]}` : `${month} ${Number(match[3])}`;
}

/** "2026-06-01" to "June 2026". */
export function fmtMonth(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = names[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : "";
}

const ET = "America/New_York";

/** The calendar day in New York for a timestamp, as "2026-11-09". */
export function dayInET(iso: string | null | undefined): string {
  const date = new Date(iso ?? "");
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return parts;
}

/** "2:01 PM ET". Market times are always shown in New York time and labelled. */
export function fmtTimeET(iso: string | null | undefined): string {
  const date = new Date(iso ?? "");
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" })} ET`;
}

/** "Nov 9, 2:01 PM ET" for timestamps, "Nov 9, 2026" for plain dates. */
export function fmtStamp(iso: string | null | undefined): string {
  const text = String(iso ?? "");
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return fmtDate(text);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" });
  return `${day}, ${fmtTimeET(text)}`;
}

const SOURCE_NAMES: Record<string, string> = {
  stockanalysis: "StockAnalysis",
  nasdaq: "Nasdaq",
  finviz: "Finviz",
  yahoo: "Yahoo Finance",
  yahoo_chart: "Yahoo Finance",
  tradingview: "TradingView",
};

/** Provider ids from the facts pipeline to the names people know. */
export function sourceName(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim();
  if (!key) return "";
  return SOURCE_NAMES[key.toLowerCase()] ?? key;
}

export function capTier(marketCap: number | null | undefined): string | null {
  if (!fin(marketCap)) return null;
  // Plain words for the size bands (mega, large, mid, small, micro cap).
  if (marketCap >= 200e9) return "Very large company";
  if (marketCap >= 10e9) return "Large company";
  if (marketCap >= 2e9) return "Mid-size company";
  if (marketCap >= 300e6) return "Small company";
  return "Very small company";
}

/** "FY 2026" to "FY26"; "TTM" stays. Keeps six bars' worth of labels on a phone. */
export function shortPeriod(period: string): string {
  const match = /^FY\s*(\d{2})?(\d{2})$/i.exec(period.trim());
  return match ? `FY${match[2]}` : period.trim();
}

/** 1.2T / 345.6B / 12.3M with a currency sign. Negative values keep their sign. */
export function compactMoney(value: number, currency = "$"): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${currency}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Days between two ISO days (b minus a). */
export function daysBetween(a: string, b: string): number | null {
  const start = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/** "today", "tomorrow", "in 8 days", "3 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** Clip prose at a sentence end near `max` characters. */
export function clipText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const stop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return stop > max * 0.5 ? slice.slice(0, stop + 1) : `${slice.slice(0, slice.lastIndexOf(" "))}…`;
}

/** A per-share amount with the sign ahead of the currency: "−$0.21", "$7.91". */
export function perShare(value: number, currency = "$"): string {
  return `${value < 0 ? "−" : ""}${currency}${Math.abs(value).toFixed(2)}`;
}

/** Percent gap rounded to a whole number, without a signed zero. */
export function wholeGap(value: number): string {
  const rounded = Math.round(value);
  return rounded === 0 ? "0%" : `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

// The brief's opening sentence talking about the coverage instead of the company ("Recent company-specific coverage
// is thin for AA.", "Coverage is quiet: the latest article only reviews...", "...rather than treating stale headlines
// as a fresh catalyst."): it says nothing about the company, so it is not shown (owner rule 7: when a reason is not
// confirmed, write nothing).
const COVERAGE_ONLY =
  /\b(?:coverage|news) (?:is|was|remains) (?:thin|quiet|light|sparse|limited)\b|\b(?:offers|provides|contains|adds) (?:little|no) new\b|\bno new (?:company|operating)\b|\bcontains no [\w-]+(?:-specific)? development\b|\bstale headlines\b/i;
// Only a sentence about the coverage itself counts: "The deal adds no new debt" is a fact about the company.
const ABOUT_COVERAGE = /\b(?:coverage|articles?|headlines?|reporting)\b/i;

// "JPMorgan's fresh news centers on a partnership with OpenAI intended to improve coding..." (the brief describing
// the feed) said as what happened: "JPMorgan has a new partnership with OpenAI to improve coding...".
const NEWS_CENTERS_ON = /^([A-Z][\w.&-]*(?: [A-Z][\w.&-]*){0,3})['’]s (?:fresh |latest |recent |current |new )?(?:news|coverage) (?:centers|centres|focuses|is focused|is centered) on (a|an) (?!new\b)(.+)$/;
const BAD_NEWS = /\b(?:probe|investigation|lawsuit|suit|downgrade|recall|fine|charges?|loss|decline|drop|cut|layoffs?|outage|breach|sell-?off|warning|delay|scandal|halt|strike|shortfall|miss)\b/i;

/**
 * The brief's first sentence as a person would say it, or null when it only talks about the coverage. Narrow on
 * purpose: only the two shapes above are touched, and any other sentence comes back as it was.
 */
export function plainBriefLead(sentence: string | null | undefined): string | null {
  const text = (sentence ?? "").trim();
  if (!text) return null;
  // A sentence with a figure or a "but" carries a fact of its own ("Coverage is thin, but JPMorgan raised its dividend to
  // $1.50."), so it stays.
  if (COVERAGE_ONLY.test(text) && ABOUT_COVERAGE.test(text) && !/\d|,\s*but\b/.test(text)) return null;
  const match = NEWS_CENTERS_ON.exec(text);
  if (!match) return text;
  const rest = match[3]!.replace(/\bintended to\b/g, "to");
  // Bad news is something the company faces, not something it has: "Microsoft faces an antitrust probe."
  if (BAD_NEWS.test(rest.split(/[,;]/)[0]!)) return `${match[1]} faces ${match[2]} ${rest}`;
  return `${match[1]} has a new ${rest}`;
}

/**
 * The brief's lead and the rest of it, as "The news behind our call" shows them. The brief leads with its own first
 * sentence (what is happening to the company, in plain facts), not the engine's title; a sentence that only describes
 * the coverage is dropped and the next one leads (plainBriefLead). Without a body (an uncovered stock), the headline,
 * which is the body's first sentence there. "What changed" reads the same lead, so it never says it again.
 */
export function briefLeadOf(read: { body?: string | null; headline?: string | null } | null | undefined): { lead: string; rest: string } {
  const body = (read?.body ?? "").trim().replace(/\s+/g, " ");
  if (!body) return { lead: plainBriefLead(read?.headline) ?? "", rest: "" };
  const firstOf = (text: string) => (text ? wholeSentences(text, 1) : "");
  const restAfter = (text: string, first: string) => (first && text.startsWith(first) ? text.slice(first.length).trim() : first ? "" : text);
  let first = firstOf(body);
  let rest = restAfter(body, first);
  for (let guard = 0; guard < 2 && first && !plainBriefLead(first); guard += 1) {
    first = firstOf(rest);
    rest = restAfter(rest, first);
  }
  return { lead: plainBriefLead(first) ?? "", rest };
}
