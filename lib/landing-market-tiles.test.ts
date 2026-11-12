import { describe, expect, it } from "vitest";

import type { AgentLog, AgentLogEntry } from "@/lib/agent-log/types";
import { callsEntry, earningsEntry, filingsEntry, insidersEntry, movesEntry, premarketEntry, reviewEntry } from "@/lib/agent-log/words";
import { marketTiles } from "@/lib/landing-market-tiles";

const AT = "2026-11-11T12:30:00.000Z";

function log(entries: Array<AgentLogEntry | null>): AgentLog {
  return { day: "2026-11-11", when: "yesterday", lead: "", entries: entries.filter((entry): entry is AgentLogEntry => entry !== null) };
}

const words = (label: string) => label.split(/\s+/).length;

describe("marketTiles", () => {
  it("turns a full day into four figure tiles with short labels and the named stocks", () => {
    const tiles = marketTiles(
      log([
        premarketEntry({ at: AT, scanned: 72, bigMoves: 24, leader: { ticker: "COHR", pct: 9.3 } }),
        movesEntry({ at: AT, total: 30, explained: 17, screened: true, leader: { ticker: "CRWV", pct: 24.9 } }, "yesterday's", "/movers/2026-11-11"),
        earningsEntry({ at: AT, count: 11, beat: 7, missed: 3 }),
        reviewEntry({ at: AT, count: 175, withNews: 155 }, { at: AT, reviewed: 175, changes: [], heldAgainst: 0 }),
      ]),
    );
    expect(tiles.map((tile) => [tile.figure, tile.label])).toEqual([
      ["72", "stocks checked before the open"],
      ["17", "big moves explained"],
      ["7 of 11", "beat estimates"],
      ["175", "calls reviewed, none changed"],
    ]);
    expect(tiles[0]!.stocks).toEqual([{ ticker: "COHR", pct: 9.3 }]);
    expect(tiles[1]!.stocks[0]!.ticker).toBe("CRWV");
    for (const tile of tiles) expect(words(tile.label)).toBeLessThanOrEqual(5);
  });

  it("names the stocks whose call changed", () => {
    const [tile] = marketTiles(
      log([
        callsEntry({ at: AT, reviewed: 175, changes: [{ ticker: "AAOI", to: "Trim", trigger: "earnings" }], heldAgainst: 0 }),
        insidersEntry({ at: AT, trades: 120, buys: 3, biggest: { ticker: "KO", value: 2_000_000 } }),
      ]),
    );
    expect(tile).toMatchObject({ figure: "1", label: "call changed", stocks: [{ ticker: "AAOI", pct: null }] });
  });

  it("never leaves a lone tile: two or three checks make two tiles, one makes none", () => {
    const three = log([
      earningsEntry({ at: AT, count: 11, beat: 0, missed: 0 }),
      insidersEntry({ at: AT, trades: 120, buys: 0, biggest: null }),
      filingsEntry({ at: AT, companies: 400, count: 0, flagged: [] }),
      filingsEntry({ at: AT, companies: null, count: 40, flagged: [] }),
    ]);
    expect(marketTiles(three).map((tile) => tile.label)).toEqual(["earnings reports checked", "insider trades read"]);
    expect(marketTiles(log([earningsEntry({ at: AT, count: 11, beat: 7, missed: 3 })]))).toEqual([]);
    expect(marketTiles(null)).toEqual([]);
  });
});
