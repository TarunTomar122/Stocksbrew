/**
 * "The read": the stored AI brief reduced to the four things the stock page
 * shows: the verdict, three reasons, what would change the call, and when it
 * was written. Pure reshaping of text the brief pipeline already stored;
 * nothing is generated here.
 */

import { callWord, type CallWord } from "@/lib/stock-chart";
import type { StockIntelligenceDoc } from "@/lib/stock";

export type StockRead = {
  call: CallWord | null;
  /** The action in the brief's own words, e.g. "Hold here". */
  actionLabel: string | null;
  /** One or two sentences on what to do. */
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
  /** The brief says its call changed since the previous one. */
  changed: { reason: string | null } | null;
};

type Evidence = { text?: unknown; type?: unknown };

type LooseDirective = NonNullable<StockIntelligenceDoc["directive_v2"]> & { evidence?: Evidence[] };

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

export function buildStockRead(intelligence: StockIntelligenceDoc | null | undefined): StockRead | null {
  if (!intelligence) return null;
  const doc = intelligence as LooseIntelligence;
  const directive = (doc.directive_v2 ?? null) as LooseDirective | null;
  const evidence = Array.isArray(directive?.evidence) ? directive.evidence : [];

  const reasons: string[] = [];
  for (const item of evidence) if (clean(item.type) !== "risk") pushDistinct(reasons, item.text);
  for (const driver of doc.visual_cards?.drivers ?? []) pushDistinct(reasons, driver.detail || driver.label);
  for (const point of doc.key_points ?? []) pushDistinct(reasons, point);
  pushDistinct(reasons, doc.visual_summary?.why_it_matters);

  const changers: string[] = [];
  for (const item of evidence) if (clean(item.type) === "risk") pushDistinct(changers, item.text);
  for (const card of doc.visual_cards?.risk_cards ?? []) pushDistinct(changers, card.trigger || card.detail || card.risk);
  pushDistinct(changers, directive?.invalidation);
  pushDistinct(changers, directive?.watch_out);
  pushDistinct(changers, doc.visual_summary?.what_to_watch);
  pushDistinct(changers, doc.risk);

  const headline = clean(doc.headline) || clean(doc.thesis) || clean(doc.visual_summary?.what_changed) || null;
  const bodyText = clean(doc.today_brief) || clean(doc.body) || clean(doc.visual_summary?.what_changed);
  const body = bodyText && (!headline || norm(bodyText) !== norm(headline)) ? bodyText : null;
  const actionLabel = clean(directive?.action?.label) || null;
  const actionSummary = clean(directive?.action?.summary) || null;

  if (!headline && !body && !actionLabel && reasons.length === 0) return null;

  const confidenceRaw = clean(directive?.confidence).toLowerCase();
  const zones = directive?.zones ?? {};
  return {
    call: callWord(directive?.stance),
    actionLabel,
    actionSummary,
    headline,
    body,
    reasons: reasons.slice(0, 3),
    changers: changers.slice(0, 3),
    confidence:
      confidenceRaw === "high" ? "high" : confidenceRaw === "medium" || confidenceRaw === "med" ? "medium" : confidenceRaw === "low" ? "low" : null,
    horizon: clean(directive?.horizon) || null,
    zones: {
      addBelow: positive(zones.accumulate_below),
      addAbove: positive(zones.breakout_above),
      trimAbove: positive(zones.trim_above),
    },
    writtenAt: clean(doc.generated_at) || null,
    articleCount: positive(doc.evidence_history?.article_count) ?? positive(doc.news_count),
    sourceCount: positive(doc.evidence_history?.source_count) ?? positive(doc.source_count),
    changed: directive?.changed_from_previous ? { reason: readableChangeReason(directive.change_reason) } : null,
  };
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
