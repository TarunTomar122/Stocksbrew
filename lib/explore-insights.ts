/**
 * The Market today reads behind its share cards: the day's headline, the
 * biggest companies, and our call beside each stock a line names. Plain rules
 * over the rows the cards load.
 */
import type { Insight, TheRead } from "@/lib/insights";
import { sectorBreadth } from "@/lib/markets-insights";
import type { MarketsData } from "@/lib/markets-shared";
import { absPct, sessionName, signedPct } from "@/lib/read-format";

/**
 * Market today's share-card read: the desk brief's first three points. Without a
 * brief, the news read's lines that say something about a stock or a story (never its tone lines: "40% of
 * headlines read as good news" says what the coverage felt like, not what to do), under `fallbackHeadline`
 * (the sector takeaway) since the news read's own headline is a tone line too. Null with nothing to say.
 */
export function marketTodayRead(brief: TheRead | null | undefined, news: TheRead | null | undefined, fallbackHeadline: string | null = null): TheRead | null {
  if (brief && (brief.headline || brief.insights.length > 0)) return { ...brief, insights: brief.insights.slice(0, 3) };
  const lines = (news?.insights ?? []).filter((insight) => insight.id !== "balance" && insight.id !== "disagree").slice(0, 3);
  if (fallbackHeadline) return { headline: fallbackHeadline, insights: lines, asOf: news?.asOf ?? null };
  return null;
}

/* ── the biggest companies: the market-level view of single stocks ──────── */

export type GiantForRead = { symbol: string; name: string; day: number; cap: number };

/**
 * Market today's single-stock part: how the biggest companies did, since they
 * carry the most weight in the S&P 500. The day's biggest movers are the
 * list under the read (/explore#moves), so this never lists them.
 * Average weighted by company value; the one that pulled hardest is the
 * largest value-times-move. Null with fewer than five companies, and null
 * when `day` (the day the rows are priced on) is not `session` (the market's
 * current session): a read of yesterday's moves must not sit under today's.
 */
export function buildGiantsRead(
  rows: readonly GiantForRead[],
  dates: { day?: string | null; session?: string | null } = {},
): { line: string; insight: Insight } | null {
  if (dates.day && dates.session && dates.day !== dates.session) return null;
  const usable = rows.filter((row) => Number.isFinite(row.day) && Number.isFinite(row.cap) && row.cap > 0);
  if (usable.length < 5) return null;
  const total = usable.reduce((sum, row) => sum + row.cap, 0);
  const average = usable.reduce((sum, row) => sum + row.cap * row.day, 0) / total;
  const up = usable.filter((row) => row.day > 0).length;
  const puller = [...usable].sort((a, b) => Math.abs(b.cap * b.day) - Math.abs(a.cap * a.day))[0]!;
  const sameWay = Math.sign(puller.day) === Math.sign(average) && Math.abs(average) >= 0.05;
  // A size-weighted average is exactly the change in their combined value: say that, not "weighted".
  const moved = Math.abs(average) < 0.05 ? "were worth about the same together as the day before" : `${average > 0 ? "gained" : "lost"} ${Math.abs(average).toFixed(1)}% of their combined value`;
  const n = usable.length;
  // A size-weighted fall while most of them rose (or the reverse) needs saying, or the two numbers read as a mistake.
  const against = (average <= -0.05 && up > n / 2) || (average >= 0.05 && up < n / 2);
  const line = against
    ? `The ${n} biggest companies ${moved}, even though ${up} of them rose.`
    : `The ${n} biggest companies ${moved}; ${up} of the ${n} rose.`;
  const pull = Math.abs(average) < 0.05
    ? `${puller.name} (${signedPct(puller.day)}) moved the group the most.`
    : sameWay
    ? `${puller.name} (${signedPct(puller.day)}) did the most to ${average > 0 ? "lift" : "pull down"} the group.`
    : `${puller.name} (${signedPct(puller.day)}) moved the other way.`;
  // The card's sentence in fewer words than `line` (it also stands alone on the share card), so the card ends level
  // with its neighbours (owner rule 3).
  const flat = Math.abs(average) < 0.05;
  const together = `The ${n} biggest companies ${flat ? "were worth about the same together as the day before" : `${average > 0 ? "gained" : "lost"} ${Math.abs(average).toFixed(1)}% together`}`;
  const risers = up === 0 ? "none of them rose" : up === n ? `all ${n} rose` : `${up} of them rose`;
  const count = against ? `${together}, even though ${risers}.` : flat ? `${together}; ${risers}.` : `${together}, and ${risers}.`;
  return {
    line,
    insight: {
      id: "giants",
      tone: Math.abs(average) < 0.05 ? "flat" : average > 0 ? "up" : "down",
      text: `${count} ${pull}`,
      figure: Math.abs(average) < 0.05 ? { value: `${up} of ${n}`, label: "rose" } : { value: signedPct(average, 1), label: `the ${n} biggest, together` },
      soWhat: "They carry the most weight in the S&P 500.",
      tickers: [puller.symbol],
      action: { label: `${puller.name}'s report`, href: `/stock/${encodeURIComponent(puller.symbol)}` },
    },
  };
}

/**
 * Market today's headline: one idea and one number (owner rule 8), the S&P 500's day, with how the sectors went said
 * in words rather than as a second count ("The S&P 500 gained 1.31% today, with sectors split."). The cards under it
 * carry the other figures. Null without an S&P 500 price for the day.
 */
export function deskHeadline(data: MarketsData, now: Date = new Date()): string | null {
  const spx = data.assets.find((asset) => asset.id === "sp500") ?? data.assets.find((asset) => asset.id === "spy");
  const day = spx?.change.d1;
  if (!spx || typeof day !== "number" || !Number.isFinite(day)) return null;
  const breadth = sectorBreadth(data.assets);
  const { up, down, total } = breadth;
  const rose = day >= 0;
  const sectors =
    total < 8
      ? ""
      : up === total
        ? ", with every sector up"
        : down === total
          ? ", with every sector down"
          : rose && down > total / 2
            ? ", even though most sectors fell"
            : !rose && up > total / 2
              ? ", even though most sectors rose"
              : (rose ? up : down) >= total * 0.7
                ? `, with most sectors ${rose ? "up" : "down"}`
                : ", with sectors split";
  // A move that rounds to 0.00% is no gain or loss, and "even though most sectors fell" would have nothing to contrast.
  if (Math.abs(day) < 0.005) return `The S&P 500 was flat ${sessionName(spx.as_of, now)}.`;
  return `The S&P 500 ${rose ? "gained" : "lost"} ${absPct(day, 2)} ${sessionName(spx.as_of, now)}${sectors}.`;
}

/* ── a next step from our call ──────────────────────────────────────────── */

/** The card's one stock: its only ticker, or, unless `singleStock`, the first of several. */
function leadOf(insight: Insight, singleStock: boolean): string | null {
  const tickers = insight.tickers ?? [];
  if (tickers.length === 0 || (singleStock && tickers.length !== 1)) return null;
  return tickers[0] ?? null;
}

/**
 * The stocks whose call a read would say: the lead stock of each of its first three cards (all a read shows), when the
 * card has no "Watch next" line already. Three at most, so the lookup stays a few small reads.
 */
export function callLeads(read: TheRead | null | undefined, options: { singleStock?: boolean } = {}): string[] {
  if (!read) return [];
  const out = new Set<string>();
  for (const insight of read.insights.slice(0, 3)) {
    if (/\bWatch next:/.test(insight.soWhat ?? "")) continue;
    const lead = leadOf(insight, Boolean(options.singleStock));
    if (lead) out.add(lead);
  }
  return [...out];
}

/**
 * Each card that has no next step yet ends with our call on its stock, when we have one (owner rule 7: every insight
 * says what to do; judges, ship 44: "the count and the move lack a useful next step"). The call is open to everyone,
 * so this never shows a price level. A card about a report says the call going into it; any other says the call. A
 * card with no link of its own opens the stock, where the call's reasons are. Nothing is added without a real call,
 * and a stock's call is said once across the read.
 */
export function withCallNext(read: TheRead, calls: ReadonlyMap<string, string>, options: { singleStock?: boolean } = {}): TheRead {
  if (calls.size === 0) return read;
  const told = new Set<string>();
  const insights = read.insights.map((insight) => {
    if (/\bWatch next:/.test(insight.soWhat ?? "")) return insight;
    const lead = leadOf(insight, Boolean(options.singleStock));
    const call = lead ? calls.get(lead) : undefined;
    if (!lead || !call || told.has(lead)) return insight;
    told.add(lead);
    const line = insight.id === "report" ? `Our call going into it: ${call}.` : `Our call on ${lead}: ${call}.`;
    return {
      ...insight,
      soWhat: insight.soWhat ? `${insight.soWhat} ${line}` : line,
      action: insight.action ?? { label: `Our call on ${lead}`, href: `/stock/${encodeURIComponent(lead)}` },
    };
  });
  return { ...read, insights };
}
