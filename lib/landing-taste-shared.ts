import { leansAgainst } from "@/lib/call-evidence";
import type { CallWord } from "@/lib/stock-chart";

/** What the landing's taste shows for one ticker (lib/landing-taste.ts builds it, /api/taste sends it). */
export type TasteCard = {
  ticker: string;
  /** "US_NVDA": what /api/track takes when someone watches it. */
  instrumentId: string;
  name: string;
  /** The stock page's call, or null when there is no current one. */
  call: CallWord | null;
  dayPct: number | null;
  /** When the price was taken (ISO). */
  priceAt: string | null;
  /**
   * The call's reasons, most telling first, each with where it comes from (the stock page's "Why" lines). Empty
   * when we cannot back one. The page shows one per card (`pickLines`).
   */
  lines: TasteLine[];
};

export type TasteLine = { id: string; text: string; source: string };

// The same test the stock page's "Why" uses (lib/call-evidence.ts), so a card never shows a reason the page drops.
export { leansAgainst };

/**
 * One reason per card: the most telling line that agrees with the card's call and is not the same kind the cards
 * before it already showed (three "sales rose" lines in a row read like a template). Falls back to the first line
 * that agrees, then to nothing.
 */
export function pickLines(cards: ReadonlyArray<Pick<TasteCard, "lines" | "call">>): Array<TasteLine | null> {
  const used = new Set<string>();
  return cards.map((card) => {
    const agreeing = card.lines.filter((item) => !leansAgainst(item, card.call));
    const line = agreeing.find((item) => !used.has(item.id)) ?? agreeing[0] ?? null;
    if (line) used.add(line.id);
    return line;
  });
}

/** What /api/taste answers (and the landing says once) when one visitor looks up too many tickers in a minute. */
export const TASTE_RATE_LIMITED = "Too many lookups. Try again in a minute.";

/** At most this many tickers in the taste: enough to see a pattern, short enough to read in one go. */
export const TASTE_MAX = 3;

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** "nvda, JPM ,ko,nvda" -> ["NVDA", "JPM", "KO"]: upper case, valid, no repeats, at most TASTE_MAX. "brk-b" is BRK.B. */
export function parseTasteTickers(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\s,]+/)) {
    const ticker = part.trim().toUpperCase().replace(/[-/]/g, ".");
    if (!TICKER.test(ticker) || out.includes(ticker)) continue;
    out.push(ticker);
    if (out.length >= TASTE_MAX) break;
  }
  return out;
}

/** "About 730" from 726: rounded to ten, never above the real count by more than five. */
export function aboutCount(count: number): string | null {
  if (!Number.isFinite(count) || count < 20) return null;
  return `about ${Math.round(count / 10) * 10}`;
}

/**
 * When the move was measured, in New York time: "4:00 PM ET" today, "Nov 10, 4:00 PM ET" on another day.
 * Empty without a usable time.
 */
export function moveStamp(iso: string | null | undefined, now: Date = new Date()): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  const zone = "America/New_York";
  const time = at.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const day = (date: Date) => date.toLocaleDateString("en-US", { timeZone: zone, year: "numeric", month: "short", day: "numeric" });
  if (day(at) === day(now)) return `${time} ET`;
  const short = at.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" });
  return `${short}, ${time} ET`;
}
