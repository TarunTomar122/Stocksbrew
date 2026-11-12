import { capitalize, daysFromToday, dayWords } from "@/lib/day-words";
import type { MemoItem } from "@/lib/memo/types";
import { shortDay } from "@/lib/memo/week";

/**
 * A memo card's figure and label as read today. The memo is stored with dates ("Nov 12", "ex-dividend Nov 19"),
 * since it is read again for weeks; the page says the next six days as words (owner, Nov 12: "say today"), so a
 * report today reads "Today" and a dividend on Thursday "ex-dividend Thursday". Only days from today on: a past
 * date in an old memo keeps its date. A card that ended "then one more" names the others instead, each with its
 * ticker (the card draws its logo) and its day when the memo's sentence gives one. Pure.
 */

export type NextUp = { ticker: string; when: string | null };

export type CardWords = {
  figure: string;
  label: string;
  /** The other stocks a "then N more" card covered, in order. */
  next: NextUp[];
  /** More than `next` names ("and 2 more"). */
  moreCount: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_TOKEN = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})\b/g;
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const THEN_MORE = /,\s*then (\w+) more$/;

/** "Nov 19" read against the memo's Monday: the year that puts it nearest that week (a December memo's "Jan 4"). */
export function isoOfToken(month: string, day: string, monday: string): string | null {
  const index = MONTHS.indexOf(month);
  const year = Number(monday.slice(0, 4));
  if (index < 0 || !Number.isFinite(year)) return null;
  const at = (y: number) => `${y}-${String(index + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  const base = Date.parse(`${monday}T12:00:00Z`);
  const options = [year - 1, year, year + 1].map(at).filter((iso) => Number.isFinite(Date.parse(`${iso}T12:00:00Z`)));
  options.sort((a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - base) - Math.abs(Date.parse(`${b}T12:00:00Z`) - base));
  return options[0] ?? null;
}

/** "today", "tomorrow" or the weekday for a day from today to six days on; null for any other day. */
export function aheadWords(iso: string, today: string): string | null {
  const gap = daysFromToday(iso, today);
  return gap !== null && gap >= 0 && gap <= 6 ? dayWords(iso, today) : null;
}

/** Every "Nov 19" in the text that falls in the next six days, said as a day word. */
function sayDays(text: string, monday: string, today: string): string {
  return text.replace(DAY_TOKEN, (token, month: string, day: string) => {
    const iso = isoOfToken(month, day, monday);
    return (iso && aheadWords(iso, today)) || token;
  });
}

function countOf(word: string): number {
  const n = COUNT_WORDS.indexOf(word.toLowerCase());
  return n >= 0 ? n : Number.isFinite(Number(word)) ? Number(word) : 0;
}

/** The days the item's sentence gives, in order, one per ticker; empty when they do not line up one to one. */
function daysInText(item: Pick<MemoItem, "text" | "tickers">, monday: string): string[] {
  const days = [...item.text.matchAll(DAY_TOKEN)].map((match) => isoOfToken(match[1]!, match[2]!, monday)).filter((iso): iso is string => Boolean(iso));
  return days.length === item.tickers.length ? days : [];
}

export function cardWords(item: Pick<MemoItem, "kind" | "card" | "text" | "tickers" | "asOf">, monday: string, today: string): CardWords | null {
  const card = item.card;
  if (!card) return null;
  let figure = card.figure;
  let label = card.label;
  let next: NextUp[] = [];
  let moreCount = 0;

  if (item.kind === "upcoming" || item.kind === "dividend") {
    // A report's figure is its day: "Nov 12" reads "Today".
    const only = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})$/.exec(figure);
    if (only) {
      const iso = isoOfToken(only[1]!, only[2]!, monday);
      const word = iso ? aheadWords(iso, today) : null;
      if (word) figure = capitalize(word);
    }
    const more = THEN_MORE.exec(label);
    if (more && item.tickers.length > 1) {
      label = label.replace(THEN_MORE, "");
      const days = daysInText(item, monday);
      next = item.tickers.slice(1).map((ticker, index) => {
        const iso = days[index + 1];
        return { ticker, when: iso ? capitalize(aheadWords(iso, today) ?? shortDay(iso)) : null };
      });
      moreCount = Math.max(0, countOf(more[1]!) - next.length);
    }
    label = sayDays(label, monday, today);
  } else if (item.kind === "move" && /^\d{4}-\d{2}-\d{2}$/.test(item.asOf)) {
    // "for ASTS on Tuesday": a move today or yesterday says so.
    const gap = daysFromToday(item.asOf, today);
    if (gap === 0 || gap === -1) label = label.replace(/ on [A-Z][a-z]+day$/, ` ${gap === 0 ? "today" : "yesterday"}`);
  }
  return { figure, label, next, moreCount };
}
