/**
 * The call block in the stock header: the call word on its own as the heading (Buy more, Keep, Sell some), then one
 * line under it with the call's own price and where today's price sits against it, in plain words. When the
 * viewer's plan does not show levels, the line says what the call is waiting for without the number and points once
 * to the full report. Call words are plain letters (Buy more, Keep, Sell some); a word with anything else in it is
 * never matched. A word said twice at the start ("Wait wait for a dip") is said once. Pure, so it is tested on its own.
 */

import type { CallLevel } from "@/lib/call-level";

// The plain actions (lib/plain-copy.ts) that start with their own call word, said without it.
const WITHOUT_WORD: Record<string, string> = {
  "keep what you own, don't buy more now": "Keep what you own, but don't buy more for now.",
  // One instruction under the word (owner rule 9): never "Buy more" over "wait for a dip".
  "buy more on a dip, not here": "Buy more on a dip, not at today's price.",
  "sell some if it rises": "Take some profit if the price rises.",
};

function asSentence(text: string): string | null {
  // "Wait wait for a dip" (an action that already starts with the word it is joined to) reads "Wait for a dip".
  const trimmed = text.trim().replace(/^([a-z']+)\s+\1\b/i, "$1");
  if (!trimmed) return null;
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

export function callMeaning(callWord: string | null, callAction: string | null): string | null {
  if (!callAction) return null;
  if (!callWord || !/^[a-z ]+$/i.test(callWord) || !new RegExp(`^${callWord}\\b`, "i").test(callAction)) return asSentence(callAction);
  const known = WITHOUT_WORD[callAction.trim().replace(/[.!]+$/, "").toLowerCase()];
  if (known) return known;
  const rest = callAction.slice(callWord.length).replace(/^[\s,.;:—–-]+/, "").trim();
  return rest ? asSentence(rest) : null;
}

// The default meanings (lib/plain-copy.ts CALL_MEANING and the engine's plain labels) under their call word. Null
// where the meaning only says the call again ("We'd buy more" under Buy more).
const UNDER_WORD: Record<string, ((today: string) => string) | null> = {
  "we'd buy more": null,
  "we'd sell some": null,
  "a good price to buy more": (today) => `${today} is a good price to buy more at.`,
  "we'd keep it, not buy more": () => "Keep what you own, but don't buy more for now.",
  "we'd sell some, not buy more": () => "Don't add to it at this price.",
  "don't buy more at this price": () => "Don't buy more at this price.",
};

/** What a hidden level is, without its number: which call it goes with and whether today's price has reached it. */
export type HiddenLevel = { label: CallLevel["label"]; reached: boolean };

export type CallLine = {
  /** The line under the call word. */
  text: string;
  /**
   * Set when the call has a price this plan does not show: what the page's one lock is called ("The price we'd buy
   * JPM at comes with a free account."). The call column never says it; the lock beside it does.
   */
  gate: string | null;
};

function pctAway(level: number, price: number): string {
  const away = Math.abs((level - price) / price) * 100;
  return `${away >= 10 ? Math.round(away) : away.toFixed(1)}%`;
}

/** "We'd buy more below" said as the instruction it is ("Buy more below"), so the line and the word above it agree. */
function instruction(label: CallLevel["label"]): string {
  return label.replace(/^We'd b/, "B").replace(/^We'd s/, "S");
}

/**
 * The line under the call word, one instruction that goes with it (owner rule 9: "Buy more" beside "wait for a dip"
 * read as two). With the level: "Buy more below $330.00, 3.9% under today's $343.37." Without it on this plan: the
 * same instruction without the number ("Buy more on a dip to our buy price, which is under today's $343.37.": today's
 * price is never said as if it were the level) and the gate, never the number.
 * With no level at all: what the call means, when that says more than the word.
 */
export function callLine(input: {
  callWord: string | null;
  callAction: string | null;
  level: CallLevel | null;
  hidden: HiddenLevel | null;
  /** Today's price, or null without a usable quote. */
  price: number | null;
  money: (value: number) => string;
  /** "anon" when signed out: the price then comes with a free account. */
  plan: string;
  /** Names the stock in the gate ("The price we'd buy JPM at"). */
  ticker?: string;
}): CallLine | null {
  const { level, hidden, price, money } = input;
  const today = price != null && price > 0 ? `today's ${money(price)}` : null;
  if (level) {
    const head = `${instruction(level.label)} ${money(level.price)}`;
    if (!today || price == null) return { text: `${head}.`, gate: null };
    const below = level.label === "We'd buy more below";
    const reached = below ? price <= level.price : price >= level.price;
    if (Math.abs(level.price - price) / price < 0.005) return { text: `${head}, right about ${today}.`, gate: null };
    if (reached) return { text: `${head}, and ${today} is already ${below ? "under" : "over"} it.`, gate: null };
    return { text: `${head}, ${pctAway(level.price, price)} ${below ? "under" : "over"} ${today}.`, gate: null };
  }
  if (hidden) {
    const at = today ?? "today's price";
    const text =
      hidden.label === "We'd buy more below"
        ? hidden.reached
          ? `Buy more at ${at}, already under our buy price.`
          : `Buy more on a dip to our buy price, which is under ${at}.`
        : hidden.label === "We'd buy more above"
          ? hidden.reached
            ? `Buy more at ${at}, already over our buy price.`
            : `Buy more once it climbs to our buy price, which is over ${at}.`
          : hidden.reached
            ? `Sell some at ${at}, already over our sell price.`
            : `Sell some if it rises to our sell price, which is over ${at}.`;
    const stock = input.ticker ? `${input.ticker} ` : "";
    const what = hidden.label === "We'd sell some above" ? `The price we'd sell ${stock}at` : `The price we'd buy ${stock}at`;
    return { text, gate: input.plan === "anon" ? `${what} comes with a free account.` : `${what} is in the full report.` };
  }
  const action = (input.callAction ?? "").trim();
  if (!action) return null;
  const key = action.replace(/[.!]+$/, "").toLowerCase();
  if (key in UNDER_WORD) {
    const say = UNDER_WORD[key];
    if (!say) return null;
    const text = say(today ? today.charAt(0).toUpperCase() + today.slice(1) : "Today's price");
    // Never a Buy more heading over a line that says not to buy more.
    if (/^buy more$/i.test(input.callWord ?? "") && /\b(?:don't|not) (?:buy more|add)\b/i.test(text)) return null;
    return { text, gate: null };
  }
  const meaning = callMeaning(input.callWord, input.callAction);
  return meaning ? { text: meaning, gate: null } : null;
}
