import type { AgentLog, AgentLogEntry, AgentLogStock } from "@/lib/agent-log/types";

/**
 * The landing's market check as figure tiles: one big figure, a label of five words or fewer, and the stocks the run
 * named as logos (owner rules 3 and 8). Read from the agent log's own entries (lib/agent-log/words.ts writes their
 * `figure` and `status`), so a tile says the same number the briefing's rail does. Pure.
 */

export type MarketTile = {
  source: AgentLogEntry["source"];
  /** "72", "7 of 11". */
  figure: string;
  /** Five words at most: "big moves explained". */
  label: string;
  href: string;
  stocks: AgentLogStock[];
};

/** Most useful first; the first four that ran make the row. */
const ORDER: AgentLogEntry["source"][] = ["premarket", "moves", "earnings", "calls", "insiders", "filings", "briefs"];

/** The numbers in a status line, as written ("1,212"). */
function numbers(status: string): string[] {
  return status.match(/\d[\d,]*/g) ?? [];
}

const plural = (figure: string, one: string, many: string) => (figure === "1" ? one : many);

function tileFor(entry: AgentLogEntry): MarketTile | null {
  const stocks = entry.stocks ?? [];
  const base = { source: entry.source, href: entry.href, stocks };
  const [first, second] = numbers(entry.status);
  switch (entry.source) {
    case "premarket":
      return { ...base, figure: entry.figure, label: `${plural(entry.figure, "stock", "stocks")} checked before the open` };
    case "moves":
      // "17 of 30 explained" or "17 explained": the explained count is the news.
      return first ? { ...base, figure: first, label: plural(first, "big move explained", "big moves explained") } : null;
    case "earnings": {
      const beat = /(\d[\d,]*) beat/.exec(entry.status)?.[1];
      if (beat) return { ...base, figure: `${beat} of ${entry.figure}`, label: "beat estimates" };
      return { ...base, figure: entry.figure, label: plural(entry.figure, "earnings report checked", "earnings reports checked") };
    }
    case "calls":
      // "2 of 175 changed" names the changed stocks; "none of 175 changed" is the count looked at.
      if (entry.status.startsWith("none")) return first ? { ...base, figure: first, label: "calls reviewed, none changed" } : null;
      return first && second ? { ...base, figure: first, label: plural(first, "call changed", "calls changed") } : null;
    case "insiders":
      if (/buys$/.test(entry.status) && first) return { ...base, figure: first, label: plural(first, "insider buy found", "insider buys found") };
      return { ...base, figure: entry.figure, label: "insider trades read" };
    case "filings":
      if (/flagged$/.test(entry.status) && first) return { ...base, figure: first, label: plural(first, "filing worth flagging", "filings worth flagging") };
      return /read$/.test(entry.status) ? { ...base, figure: entry.figure, label: "SEC filings read" } : null;
    case "briefs":
      return { ...base, figure: entry.figure, label: plural(entry.figure, "stock brief updated", "stock briefs updated") };
    default:
      return null;
  }
}

/**
 * Four tiles, or two when only two or three checks ran (a row of tiles never ends beside an empty slot, owner rule
 * 4), or none when fewer than two did: one figure alone does not make the point.
 */
export function marketTiles(log: AgentLog | null): MarketTile[] {
  if (!log) return [];
  const tiles: MarketTile[] = [];
  for (const source of ORDER) {
    const entry = log.entries.find((item) => item.source === source && !item.quiet);
    const tile = entry ? tileFor(entry) : null;
    if (tile) tiles.push(tile);
  }
  if (tiles.length >= 4) return tiles.slice(0, 4);
  if (tiles.length >= 2) return tiles.slice(0, 2);
  return [];
}
