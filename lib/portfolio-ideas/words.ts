import { CALL_PLAIN } from "@/lib/plain-copy";
import { fmtPct, joinList } from "@/lib/xray";

import type { CallWord, IdeasSubject } from "./types";

/** "$4,210", rounded to the dollar; amounts over $1,000 to the nearest $10 so they do not read as exact. */
export function usd(value: number): string {
  const abs = Math.abs(value);
  const rounded = abs >= 1000 ? Math.round(abs / 10) * 10 : Math.round(abs);
  return `$${rounded.toLocaleString("en-US")}`;
}

/** "$4.4T", "$310B", "$8.2B": a company's size. */
export function capWords(value: number): string {
  const tidy = (n: number, digits: number) => n.toFixed(digits).replace(/\.0$/, "");
  if (value >= 1e12) return `$${tidy(value / 1e12, value >= 1e13 ? 0 : 1)}T`;
  if (value >= 1e9) return `$${tidy(value / 1e9, value >= 1e11 ? 0 : 1)}B`;
  return `$${Math.round(value / 1e6)}M`;
}

export function signedPct(value: number): string {
  const whole = Math.round(value);
  return `${whole > 0 ? "+" : whole < 0 ? "−" : ""}${Math.abs(whole)}%`;
}

export function sharesWord(count: number): string {
  return count === 1 ? "share" : "shares";
}

export function callPlain(call: CallWord | null): string | null {
  return call ? CALL_PLAIN[call] : null;
}

/** "this portfolio" for the example, "your portfolio" for the person's own. */
export function portfolioWord(subject: IdeasSubject): string {
  return subject === "example" ? "this portfolio" : "your portfolio";
}

export { fmtPct, joinList };
