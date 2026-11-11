/** Formatting for the share cards. Pure, so tests can pin it. */

import type { OgTone } from "@/lib/og/types";

const TZ = "America/New_York";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "+4.3%" / "−1.2%" with a real minus sign. */
export function ogSignedPct(value: number | null | undefined, digits = 1): string | null {
  if (!finite(value)) return null;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

export function ogTone(value: number | null | undefined, band = 0): OgTone {
  if (!finite(value) || Math.abs(value) <= band) return "flat";
  return value > 0 ? "up" : "down";
}

/** "$188.42", "$1,204", "$0.8123". */
export function ogPrice(value: number | null | undefined): string | null {
  if (!finite(value) || value <= 0) return null;
  const digits = value >= 1000 ? 0 : value >= 1 ? 2 : 4;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** "Nov 10" (and the year when it is not this year). Accepts YYYY-MM-DD or an ISO time. */
export function ogDayLabel(value: string | null | undefined, now: Date = new Date()): string | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(day.getTime())) return null;
  const sameYear = day.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : TZ,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(day);
}

/** "Nov 2014": for the start of a long record. */
export function ogMonthLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(day.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "numeric" }).format(day);
}

/** "Nov 10, 4:05 PM ET" from an ISO time; just the day for a bare date. */
export function ogStamp(value: string | null | undefined, now: Date = new Date()): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return ogDayLabel(value, now);
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  const day = ogDayLabel(value, now);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(time);
  return `${day}, ${clock} ET`;
}

/** Uppercase eyebrow: "Signals · Nov 10". */
export function ogEyebrow(label: string, day?: string | null): string {
  return day ? `${label} · ${day}` : label;
}

/** Join the parts of a footnote that exist. */
export function ogFootnote(...parts: Array<string | null | undefined | false>): string | null {
  const kept = parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  return kept.length ? kept.join(" · ") : null;
}

/** The last `sessions` closes, for a sparkline, and the change across them. */
export function ogWindow(closes: number[], sessions: number): { values: number[]; pct: number | null } {
  const values = closes.filter((value) => finite(value) && value > 0).slice(-sessions);
  if (values.length < 2) return { values: [], pct: null };
  const first = values[0]!;
  const last = values[values.length - 1]!;
  return { values, pct: (last / first - 1) * 100 };
}

/** Thin a long series to about `points` values, always keeping the last. */
export function ogThin(values: number[], points = 90): number[] {
  if (values.length <= points) return values;
  const step = values.length / points;
  const out: number[] = [];
  for (let i = 0; i < points - 1; i++) out.push(values[Math.floor(i * step)]!);
  out.push(values[values.length - 1]!);
  return out;
}

/** A read's headline without its trailing call sentence, which the card shows as a pill. */
export function withoutCallSentence(headline: string): string {
  return headline.replace(/\s*Our call(?: on \S+)?: (?:Add|Hold|Trim)\.\s*$/i, "").trim();
}

/**
 * Gating: add/trim levels are for covered stocks only, and a card is public.
 * Drop any sentence that names a price level or a zone, keep the rest.
 */
export function levelFree(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // Split only where a sentence ends and the next begins, so "$178.60" stays whole.
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  const kept = sentences.filter((sentence) => !/\$\s?\d|\b\d{2,}(?:\.\d+)?\s?(?:usd|dollars)\b|\b(?:add|buy|trim|sell)\s+(?:below|above|under|over|near|at)\b|\bzone\b|\btarget\b/i.test(sentence));
  const out = kept.join(" ").trim();
  return out.length >= 12 ? out : null;
}

/** The longest headline and supporting line the read card draws whole (lib/og/cards.tsx ReadCard). */
export const OG_HEADLINE_MAX = 140;
export const OG_LINE_MAX = 130;

/**
 * A sentence that fits the card whole: the text itself, or its first sentence,
 * or null. Cards never cut a sentence off with an ellipsis (owner rule: no
 * truncation), so a line too long to fit is left out instead.
 */
export function whole(text: string | null | undefined, max: number): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const first = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“($])/)[0]!.trim();
  return first.length <= max && first.length >= 20 ? first : null;
}

/** Up to `max` supporting lines that fit whole, in the read's own order. */
export function wholeLines(lines: Array<{ text: string; tone: OgTone }>, max = 2): Array<{ text: string; tone: OgTone }> {
  const out: Array<{ text: string; tone: OgTone }> = [];
  for (const line of lines) {
    const text = whole(line.text, OG_LINE_MAX);
    if (text) out.push({ text, tone: line.tone });
    if (out.length >= max) break;
  }
  return out;
}
