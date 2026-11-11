import { fin, money, signedPct } from "@/lib/insight-format";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import type { ExplainedMove } from "@/lib/seo/family-data";
import { causeBucket, longDay, moveHref } from "@/lib/seo/families";
import type { ChartPoint } from "@/lib/stock-chart";

/**
 * Numbers and reads for the "why it moved" pages. The reason itself is the
 * stored, sourced explanation; every number around it (the close, the S&P
 * 500 that day, what the stock did next, how a day's reasons split) comes
 * from stored prices and counts, by rule.
 */

export type DayClose = { close: number; pct: number };

/** The close on `day` and its change from the close before, or null when the series does not hold that day. */
export function closeOn(series: readonly ChartPoint[] | undefined, day: string): DayClose | null {
  if (!series) return null;
  const index = series.findIndex((point) => point.date === day);
  if (index < 1) return null;
  const close = series[index]!.close;
  const before = series[index - 1]!.close;
  if (!fin(close) || !fin(before) || before <= 0) return null;
  return { close, pct: (close / before - 1) * 100 };
}

/** The change from the close on `day` to the latest close after it, or null when no later close is held. */
export function sinceClose(series: readonly ChartPoint[] | undefined, day: string): { pct: number; date: string; close: number } | null {
  if (!series || series.length === 0) return null;
  const at = series.find((point) => point.date === day);
  const last = series[series.length - 1]!;
  if (!at || last.date <= day || !fin(at.close) || at.close <= 0) return null;
  return { pct: (last.close / at.close - 1) * 100, date: last.date, close: last.close };
}

function stampET(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
}

export function buildMoveRead(input: {
  move: ExplainedMove;
  close: DayClose | null;
  spyClose: DayClose | null;
  since: { pct: number; date: string; close: number } | null;
  call: { word: string; at: string | null } | null;
}): TheRead {
  const { move, close, spyClose, since, call } = input;
  const day = longDay(move.day);
  const spy = spyClose ? `, against ${signedPct(spyClose.pct)} for the S&P 500` : "";
  const time = stampET(move.priceAsOf);
  const headline = close
    ? `${move.ticker} closed ${close.pct >= 0 ? "up" : "down"} ${Math.abs(close.pct).toFixed(1)}% on ${day}${spy}.`
    : `${move.ticker} was ${move.pct >= 0 ? "up" : "down"} ${Math.abs(move.pct).toFixed(1)}%${time ? ` at ${time}` : ""} on ${day}${spy}.`;

  const sinceInsight: Insight | null = since
    ? {
        id: "since",
        tone: since.pct > 0.05 ? "up" : since.pct < -0.05 ? "down" : "flat",
        text: `Since that close ${move.ticker} is ${signedPct(since.pct)}, at ${money(since.close)} on ${longDay(since.date)}.`,
        soWhat:
          close && Math.sign(since.pct) !== Math.sign(close.pct) && Math.abs(since.pct) >= 1
            ? "The move has partly reversed."
            : close && Math.sign(since.pct) === Math.sign(close.pct) && Math.abs(since.pct) >= 1
              ? "The move has carried on."
              : undefined,
      }
    : null;

  const sourcesInsight: Insight = {
    id: "sources",
    tone: "flat",
    text: `The reason rests on ${move.sources.length} cited ${move.sources.length === 1 ? "source" : "sources"}${move.confidence ? `, with ${move.confidence.toLowerCase()} confidence that it explains the move` : ""}.`,
  };

  let callInsight: Insight | null = null;
  if (call) {
    const after = call.at ? call.at.slice(0, 10) >= move.day : false;
    callInsight = {
      id: "call",
      tone: call.word === "Add" ? "up" : call.word === "Trim" ? "down" : "flat",
      text: call.at
        ? `Our call on ${move.ticker} is ${call.word}, dated ${longDay(call.at.slice(0, 10))}${after ? ", written after this move" : ", before this move"}.`
        : `Our call on ${move.ticker} is ${call.word}.`,
      action: { label: "Full report", href: `/stock/${encodeURIComponent(move.ticker)}` },
    };
  }

  return { headline, insights: pickInsights([sinceInsight, callInsight, sourcesInsight], 3), asOf: move.researchedAt };
}

export function buildMoversDayRead(input: { day: string; moves: readonly ExplainedMove[]; spyClose: DayClose | null }): TheRead | null {
  const { moves, day } = input;
  if (moves.length === 0) return null;
  const up = moves.filter((move) => move.pct >= 0);
  const down = moves.filter((move) => move.pct < 0);
  const headline = `On ${longDay(day)} we found the reason for ${moves.length} big ${moves.length === 1 ? "move" : "moves"}: ${up.length} up, ${down.length} down${input.spyClose ? `, with the S&P 500 ${signedPct(input.spyClose.pct)}` : ""}.`;

  const buckets = new Map<string, ExplainedMove[]>();
  for (const move of moves) {
    const bucket = causeBucket(move.cause);
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), move]);
  }
  const [topBucket, members] = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  const causes: Insight | null =
    members.length >= 2
      ? {
          id: "causes",
          tone: "flat",
          text: `${topBucket.charAt(0).toUpperCase()}${topBucket.slice(1)} explained ${members.length} of the ${moves.length} moves.`,
          tickers: members.slice(0, 6).map((move) => move.ticker),
        }
      : null;

  const best = up.length ? up.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = down.length ? down.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const biggest = (move: ExplainedMove | null, id: string): Insight | null =>
    move
      ? {
          id,
          tone: move.pct >= 0 ? "up" : "down",
          text: `${move.ticker} ${move.pct >= 0 ? "rose" : "fell"} ${Math.abs(move.pct).toFixed(1)}%: ${move.headline.replace(/\.$/, "")}.`,
          tickers: [move.ticker],
          action: { label: "Why", href: moveHref(move.ticker, move.day) },
        }
      : null;

  return { headline, insights: pickInsights([biggest(best, "best"), biggest(worst, "worst"), causes], 3), asOf: moves.map((move) => move.researchedAt ?? "").sort().pop() || null };
}

