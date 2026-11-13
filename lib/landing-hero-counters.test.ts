import { describe, expect, it } from "vitest";

import type { AgentLog, AgentLogEntry } from "@/lib/agent-log/types";

import { heroCounters } from "./landing-hero-counters";

function entry(source: AgentLogEntry["source"], figure: string, status: string): AgentLogEntry {
  return { source, at: "2026-11-12T23:00:00Z", time: "6:00 PM", figure, rest: "", kind: source, status, href: `/${source}`, quiet: false };
}

const log = (entries: AgentLogEntry[]): AgentLog => ({ day: "2026-11-12", when: "yesterday", lead: "", entries });

describe("heroCounters", () => {
  it("reads the counts the log's own lines say, most telling first", () => {
    const counters = heroCounters(
      log([entry("premarket", "113", "25 of 113 moving"), entry("moves", "30", "23 of 30 explained"), entry("earnings", "10", "7 beat, 2 missed"), entry("calls", "179", "2 of 178 changed")]),
    );
    expect(counters.map((counter) => [counter.figure, counter.label])).toEqual([
      ["178", "calls reviewed"],
      ["30", "big moves looked into"],
      ["113", "pre-open checks"],
    ]);
    for (const counter of counters) expect(counter.label.split(" ").length).toBeLessThanOrEqual(4);
  });

  it("leaves out a quiet filings line, which counts companies checked rather than filings read", () => {
    const quiet = { ...entry("filings", "500", "none new"), quiet: true };
    const counters = heroCounters(log([quiet, entry("calls", "175", "none of 175 changed"), entry("moves", "1", "1 of 1 explained"), entry("earnings", "3", "3 beat")]));
    expect(counters.map((counter) => counter.source)).toEqual(["calls", "moves", "earnings"]);
    expect(counters[1]!.label).toBe("big move looked into");
  });

  it("counts a quiet call review, and leaves out zero counts", () => {
    const counters = heroCounters(log([entry("calls", "175", "none of 175 changed"), entry("filings", "0", "0 read"), entry("earnings", "1", "1 beat"), entry("insiders", "42", "42 read")]));
    expect(counters.map((counter) => counter.label)).toEqual(["calls reviewed", "earnings report checked", "insider trades read"]);
  });

  it("shows nothing with fewer than three counts or no log", () => {
    expect(heroCounters(log([entry("calls", "175", "none of 175 changed")]))).toEqual([]);
    expect(heroCounters(null)).toEqual([]);
  });
});
