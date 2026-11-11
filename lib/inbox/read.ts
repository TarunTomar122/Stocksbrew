import type { Insight, TheRead } from "@/lib/insights";

import { isUnread } from "./merge";
import type { InboxItem } from "./types";

/**
 * The inbox's read, above the list: one headline on what is new since the
 * person last looked, then up to three cards on what the two weeks add up to
 * (calls that moved, what agents flagged, what investors and insiders did).
 * Counted from the items themselves, so every number is a row below. Pure.
 */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tickers of these items, first seen first, without repeats. */
function tickersOf(items: InboxItem[], max = 4): string[] {
  const out: string[] = [];
  for (const item of items) for (const ticker of item.tickers) if (!out.includes(ticker)) out.push(ticker);
  return out.slice(0, max);
}

/** What happened, in parts of one sentence: "our call moved on 3 of your stocks", "your agents flagged 2 things". */
function parts(items: InboxItem[], example: boolean): string[] {
  const count = (kind: InboxItem["kind"]) => items.filter((item) => item.kind === kind && !item.quiet).length;
  const whose = example ? "the example's" : "your";
  const out: string[] = [];
  const calls = count("call");
  if (calls > 0) out.push(`our call moved on ${calls} of ${whose} stocks`);
  const flags = count("agent");
  // "the example's" once is enough; after that it is "its".
  if (flags > 0) out.push(`${example && out.length > 0 ? "its" : whose} agents flagged ${flags} ${plural(flags, "thing", "things")}`);
  const alerts = count("alert");
  if (alerts > 0) out.push(`${alerts} ${plural(alerts, "price alert", "price alerts")} went off`);
  const reasons = count("reason");
  if (reasons > 0) out.push(`${reasons} ${plural(reasons, "reason for owning a stock", "reasons for owning stocks")} changed`);
  const filings = count("follow");
  if (filings > 0) out.push(`investors you follow filed ${filings} ${plural(filings, "report", "reports")}`);
  // One item per stock per day, so the same stock bought on two days is still one stock.
  const insiders = new Set(items.filter((item) => item.kind === "insider").flatMap((item) => item.tickers)).size;
  if (insiders > 0) out.push(`insiders bought ${insiders === 1 ? `one of ${whose} stocks` : `${insiders} of ${whose} stocks`}`);
  const strategies = count("strategy");
  if (strategies > 0) out.push(`${strategies} ${plural(strategies, "strategy", "strategies")} you follow rebalanced`);
  if (count("memo") > 0) out.push("your weekly memo is ready");
  return out;
}

function callsCard(items: InboxItem[], example: boolean): Insight | null {
  const calls = items.filter((item) => item.kind === "call");
  if (calls.length === 0) return null;
  const up = calls.filter((item) => item.tone === "up").length;
  const down = calls.filter((item) => item.tone === "down").length;
  const whose = example ? "the example's" : "your";
  const split =
    up > 0 && down > 0
      ? `: ${up} toward Buy more and ${down} toward Sell some`
      : up > 0
        ? calls.length === 1
          ? ", toward Buy more"
          : `, ${up === calls.length ? "all of them" : `${up} of them`} toward Buy more`
        : down > 0
          ? calls.length === 1
            ? ", toward Sell some"
            : `, ${down === calls.length ? "all of them" : `${down} of them`} toward Sell some`
          : "";
  // Lead with the stocks the change matters most for: the ones that moved toward selling.
  const ordered = [...calls.filter((item) => item.tone === "down"), ...calls.filter((item) => item.tone !== "down")];
  return {
    id: "inbox-calls",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: `Our call moved on ${calls.length === 1 ? `one of ${whose} stocks` : `${calls.length} of ${whose} stocks`} in the last two weeks${split}.`,
    tickers: tickersOf(ordered),
    figure: { value: String(calls.length), label: plural(calls.length, "call moved", "calls moved") },
  };
}

function agentsCard(items: InboxItem[], example: boolean): Insight | null {
  const flags = items.filter((item) => item.kind === "agent" && !item.quiet);
  const quiet = items.filter((item) => item.kind === "agent" && item.quiet);
  if (flags.length === 0 && quiet.length === 0) return null;
  const whose = example ? "The example's" : "Your";
  if (flags.length === 0) {
    return {
      id: "inbox-agents",
      tone: "flat",
      text: `${whose} agents checked ${quiet.length === 1 ? "once" : `on ${quiet.length} days`} in the last two weeks and found nothing that needs ${example ? "a look" : "you"}.`,
      figure: { value: "0", label: "things flagged" },
    };
  }
  // One finding is already a row in the list under the read, sentence and all: a card would say it twice (owner
  // rule 1). The headline counts it, the row tells it.
  if (flags.length === 1) return null;
  // The card carries the latest finding itself (its move, its sentence, its stock), not the count the headline
  // already says (Nov 11: "flagged 1 thing" three times over).
  const latest = flags[0]!;
  const finding = latest.text.replace(/^.*?\bagent flagged this:\s*/, "").trim() || latest.text;
  const move = signedMove(finding);
  return {
    id: "inbox-agents",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: finding,
    tickers: latest.tickers.slice(0, 4),
    figure: move
      ? { value: move.value, label: `latest of ${flags.length} flags`, tone: move.tone }
      : null,
  };
}

/**
 * The first percent move a sentence states, signed by its own words: "NVDA fell 5.47% in a day" is −5.47%. Null when
 * there is no percent, or when an unsigned one has no direction word to sign it.
 */
export function signedMove(text: string): { value: string; tone: "up" | "down" } | null {
  const match = /([+\-−]?)(\d+(?:\.\d+)?)%/.exec(text);
  if (!match) return null;
  const [, sign, digits] = match;
  const before = text.slice(0, match.index);
  let down: boolean;
  if (sign === "+") down = false;
  else if (sign) down = true;
  else {
    // The direction word nearest before the number, in the same sentence: "After a lower open, NVDA rose 4.2%" is up.
    const clause = before.split(/[.!?]\s/).pop() ?? before;
    const words = [...clause.matchAll(/\b(fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower|rose|rises|jumped|jumps|gained|gains|climbed|surged|soared|rallied|up|higher)\b/gi)];
    const last = words[words.length - 1]?.[1]?.toLowerCase();
    if (!last) return null;
    down = /^(?:fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower)$/.test(last);
  }
  return { value: `${down ? "−" : "+"}${digits}%`, tone: down ? "down" : "up" };
}

function investorsCard(items: InboxItem[]): Insight | null {
  const follow = items.filter((item) => item.kind === "follow");
  const insiders = items.filter((item) => item.kind === "insider");
  if (follow.length === 0 && insiders.length === 0) return null;
  const bought = tickersOf(insiders, 99);
  if (bought.length > 0 && bought.length >= follow.length) {
    return {
      id: "inbox-insiders",
      tone: "flat",
      text: `Insiders bought shares of ${bought.length === 1 ? bought[0] : `${bought.length} of your stocks`} in the last two weeks${follow.length > 0 ? `, and investors you follow filed ${follow.length} ${plural(follow.length, "report", "reports")}` : ""}.`,
      tickers: bought.slice(0, 4),
      figure: { value: String(bought.length), label: plural(bought.length, "stock insiders bought", "stocks insiders bought") },
    };
  }
  return {
    id: "inbox-follow",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: `Investors you follow filed ${follow.length} ${plural(follow.length, "report", "reports")} in the last two weeks.`,
    tickers: tickersOf(follow),
    figure: { value: String(follow.length), label: plural(follow.length, "report", "reports") },
  };
}

export function inboxRead(items: InboxItem[], seenAt: string | null, example: boolean): TheRead | null {
  if (items.length === 0) return null;
  const fresh = example || !seenAt ? items : items.filter((item) => isUnread(item, seenAt));
  // Two things at most, so the headline stays one short line; the cards and the list carry the rest.
  const said = parts(fresh, example).slice(0, 2);
  const headline = example
    ? said.length > 0
      ? `In the last two weeks, ${joinParts(said)}.`
      : "The example portfolio's agents checked and found nothing that needs a look."
    : said.length > 0
      ? `Since you last looked, ${joinParts(said)}.`
      : "Nothing new since you last looked.";
  const insights = [callsCard(items, example), agentsCard(items, example), investorsCard(items)].filter((card): card is Insight => card !== null);
  return { headline: capitalise(headline), insights };
}
