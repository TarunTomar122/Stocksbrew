import { auditNumbers, collectNumbers } from "@/lib/ask-cards";
import type { ResearchAudit, ResearchBody, ResearchPoint, ResearchWatch } from "@/lib/research/types";

/**
 * The numbers check. Every figure in the written report must match a number
 * in the evidence the writer was given (lib/ask-cards.ts decides what counts
 * as a figure and how much rounding a match allows). A sentence holding a
 * figure that matches nothing is removed whole, not edited: a wrong number in
 * a right-looking sentence is the thing this product must never print.
 *
 * It also drops citation markers that name no source, keeps "what to watch"
 * dates to dates that appear in the evidence, and turns em dashes into commas
 * (house style).
 */

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"“'(\[$])/;
const CITE = /\[\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*\]/g;

export type CheckInput = {
  body: ResearchBody;
  /** Everything the writer saw: the facts and the source list. */
  evidence: unknown;
  sourceIds: ReadonlySet<string>;
  /** ISO days that appear in the evidence. */
  dates: ReadonlySet<string>;
};

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** "[S1, S3]" to "[S1][S3]", unknown ids dropped. Returns the text and how many were dropped. */
export function cleanCitations(text: string, sourceIds: ReadonlySet<string>): { text: string; dropped: number } {
  let dropped = 0;
  const out = text.replace(CITE, (_whole, ids: string) => {
    const kept: string[] = [];
    for (const id of ids.split(/\s*[,;]\s*/)) {
      if (sourceIds.has(id) && !kept.includes(id)) kept.push(id);
      else if (!sourceIds.has(id)) dropped += 1;
    }
    return kept.map((id) => `[${id}]`).join("");
  });
  return { text: out, dropped };
}

/** Text without citation markers, so "[S12]" is never read as the figure 12. */
function withoutCitations(text: string): string {
  return text.replace(CITE, " ").replace(/\[S\d+\]/g, " ");
}

function tidy(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Every number in the evidence, except the ones inside dates, links and
 * source ids: "2026-11-19" must not make "19%" look sourced, and neither may
 * an accession number in a URL or the 12 in "S12".
 */
export function evidenceNumbers(evidence: unknown): number[] {
  const strip = (value: unknown, depth = 0): unknown => {
    if (depth > 14 || value == null) return value;
    if (typeof value === "string") {
      return value
        .replace(/https?:\/\/\S+|\/[a-z][\w/?=&.%-]*/gi, " ")
        .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?/g, " ")
        .replace(/\bS\d+\b/g, " ");
    }
    if (Array.isArray(value)) return value.map((item) => strip(item, depth + 1));
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        // Ids and links carry numbers that are not facts.
        if (key === "id" || key === "url" || key === "source" || key === "source_id") continue;
        out[key] = strip(item, depth + 1);
      }
      return out;
    }
    return value;
  };
  const out = collectNumbers(strip(evidence));
  // "$89.0 billion" inside a filing passage is 89e9 as well as 89.0, so "$89 billion" in the text traces to it.
  const scaled = (value: unknown, depth = 0): void => {
    if (depth > 14 || value == null) return;
    if (typeof value === "string") {
      for (const match of value.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion|bn|mn|tn|[kmbt])\b/gi)) {
        const base = Number(match[1]!.replace(/,/g, ""));
        const scale = SCALES[match[2]!.toLowerCase()];
        if (Number.isFinite(base) && scale) out.push(base * scale);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach((item) => scaled(item, depth + 1));
    else if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => scaled(item, depth + 1));
  };
  scaled(strip(evidence));
  return out;
}

/** Sentences about the report's own inputs rather than the company. */
export const MECHANICS = /\b(?:the|our) evidence\b|\bour (?:data|data table|sources)\b|\bthe data (?:shows?|gives?|has|lists?)\b|\bin the data\b/i;

const SCALES: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12, t: 1e12 };

export function checkReport(input: CheckInput): { body: ResearchBody; audit: ResearchAudit } {
  const known = evidenceNumbers(input.evidence);
  const audit: ResearchAudit = { checked: 0, traced: 0, removed: [], citations_dropped: 0 };

  /** The text with every sentence whose figures do not all trace removed. Empty when nothing survives. */
  const keep = (raw: string): string => {
    const cleaned = cleanCitations(tidy(raw), input.sourceIds);
    audit.citations_dropped += cleaned.dropped;
    const kept: string[] = [];
    for (const sentence of splitSentences(tidy(cleaned.text))) {
      // Writing about our inputs ("the evidence does not give", "our data table") is not writing about the company.
      if (MECHANICS.test(sentence)) {
        audit.removed.push(sentence.slice(0, 300));
        continue;
      }
      const result = auditNumbers(withoutCitations(sentence), [known]);
      audit.checked += result.checked;
      audit.traced += result.traced;
      if (result.untraced.length > 0) {
        audit.removed.push(sentence.slice(0, 300));
        continue;
      }
      kept.push(sentence);
    }
    return kept.join(" ").trim();
  };

  const paragraphs = (list: string[]): string[] => list.map(keep).filter((text) => /[a-z]/i.test(text));
  const points = (list: ResearchPoint[]): ResearchPoint[] =>
    list.flatMap((point) => {
      const title = tidy(keep(point.title).replace(/\[S\d+\]/g, ""));
      const text = keep(point.text);
      return title && text ? [{ title, text }] : [];
    });
  const watch = (list: ResearchWatch[]): ResearchWatch[] =>
    list.flatMap((item) => {
      const text = keep(item.text);
      if (!text) return [];
      const date = item.date && input.dates.has(item.date.slice(0, 10)) ? item.date.slice(0, 10) : null;
      return [{ date, text }];
    });

  const headline = tidy(keep(input.body.headline).replace(/\[S\d+\]/g, ""));
  const body: ResearchBody = {
    headline,
    summary: paragraphs(input.body.summary).slice(0, 5),
    business: paragraphs(input.body.business),
    drivers: paragraphs(input.body.drivers),
    bull: points(input.body.bull),
    bear: points(input.body.bear),
    valuation: paragraphs(input.body.valuation),
    numbers: paragraphs(input.body.numbers),
    ownership: paragraphs(input.body.ownership),
    risks: points(input.body.risks),
    change: paragraphs(input.body.change),
    watch: watch(input.body.watch),
  };
  audit.removed = audit.removed.slice(0, 40);
  return { body, audit };
}
