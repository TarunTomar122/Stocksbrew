import { Verdict } from "@/components/oa/kit/tone";
import type { BriefingItem } from "@/lib/briefing";
import { moodWord, sentenceOutcome, type ToneWord } from "@/lib/tone";

import { toneText } from "./format";

/** Kinds whose figure is a signed price change: coloured by sign, the usual finance way. */
const SIGNED: ReadonlySet<BriefingItem["kind"]> = new Set(["price_move", "earnings_reported"]);

/**
 * Beat, Missed or In line from the first sentence of the post-earnings report,
 * which leads the item's why. Later sentences are advice about what to watch
 * ("avoid if guidance is cut"), so they are not read.
 */
function earningsOutcome(item: BriefingItem): ToneWord | null {
  // A sentence ends at . ! or ? before a capital, but not after "Inc." or "U.S.", so "Apple Inc. beat" stays whole.
  const first = item.why.trim().split(/(?<!\b(?:Inc|Corp|Co|Ltd|Plc|U\.S|U\.K|vs|No|St))[.!?]\s+(?=[A-Z])/)[0] ?? "";
  return sentenceOutcome(first, "results");
}

/**
 * The good-or-bad word for an item whose figure is not a price change: a single
 * congressional buy or sell, the mood of a Reddit spike, a filing or a chart
 * event read as positive or negative, a research call moved up or down, an earnings
 * report that beat or missed. Null
 * when there is nothing to judge.
 */
export function verdictFor(item: BriefingItem): ToneWord | null {
  if (item.kind === "earnings_reported") return earningsOutcome(item);
  if (item.tone !== "up" && item.tone !== "down") return null;
  const tone = item.tone;
  switch (item.kind) {
    case "congress_trade":
      // One trade: the metric is the verb. Several: the tone is only the newest, so no verdict.
      return item.metric === "Bought" || item.metric === "Sold" ? { tone, word: item.metric } : null;
    case "discussion_spike":
    case "technical":
      return moodWord(tone === "up" ? "bullish" : "bearish");
    case "filing":
      return { tone, word: tone === "up" ? "Positive" : "Negative" };
    case "call_changed":
      // The headline names both calls; the chip says which way it moved.
      return { tone, word: tone === "up" ? "Upgraded" : "Downgraded" };
    default:
      return null;
  }
}

/**
 * The figure beside an item's headline. Price changes keep their red or green;
 * a price level or a count stays in normal ink (a green price reads as "up");
 * an item whose good or bad is not in a number gets a verdict chip instead.
 */
export function ItemMetric({ item, className = "" }: { item: BriefingItem; className?: string }) {
  const signed = SIGNED.has(item.kind) && Boolean(item.metric);
  const verdict = signed ? null : verdictFor(item);
  if (verdict) return <Verdict tone={verdict.tone}>{verdict.word}</Verdict>;
  if (!item.metric) return null;
  const color = signed ? toneText(item.tone) : "text-oa-fg";
  return <span className={`oa-mono whitespace-nowrap font-medium tabular-nums ${color} ${className}`}>{item.metric}</span>;
}
