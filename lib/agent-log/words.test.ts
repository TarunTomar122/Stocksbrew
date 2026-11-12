import { describe, expect, it } from "vitest";

import { batchTime, nyDayBounds, nyInstant, nyTime, previousWeekday, whenWord } from "./time";
import {
  MAX_ENTRIES,
  agentsEntry,
  briefsEntry,
  buildAgentLog,
  callsEntry,
  earningsEntry,
  entrySentence,
  filingsEntry,
  insidersEntry,
  movesEntry,
  premarketEntry,
  type AgentLogFacts,
} from "./words";

const DAY = "2026-11-11";
// 7:30 AM, 10:11 AM, 12:20 PM ... New York (EST, UTC-5).
const at = (hhmm: string) => `${DAY}T${hhmm}:00+00:00`;

const sentence = (line: { figure: string; rest: string } | null) => (line ? entrySentence(line) : null);

describe("agent log time", () => {
  it("bounds a New York day in UTC across the clock change", () => {
    expect(nyDayBounds("2026-11-11")).toEqual(["2026-11-11T05:00:00", "2026-11-12T05:00:00"]);
    expect(nyDayBounds("2026-07-01")).toEqual(["2026-07-01T04:00:00", "2026-07-02T04:00:00"]);
    expect(nyInstant("2026-11-10", 17 * 60)).toBe("2026-11-10T22:00:00");
  });

  it("formats times and names the day", () => {
    expect(nyTime("2026-11-11T12:30:18.22+00:00")).toBe("7:30 AM");
    expect(nyTime("2026-11-11T21:31:00Z")).toBe("4:31 PM");
    expect(nyTime("not a time")).toBe("");
    expect(previousWeekday("2026-11-09")).toBe("2026-11-06");
    expect(whenWord("2026-11-11", "2026-11-11")).toBe("today");
    expect(whenWord("2026-11-10", "2026-11-11")).toBe("yesterday");
    expect(whenWord("2026-11-06", "2026-11-09")).toBe("Friday");
  });
});

describe("agent log lines", () => {
  it("says what was checked before the open and what led", () => {
    expect(sentence(premarketEntry({ at: at("12:30"), scanned: 72, bigMoves: 24, leader: { ticker: "COHR", pct: 9.29 } }))).toBe(
      "72 stocks checked before the open; 24 were moving 3% or more, led by COHR, up 9.3%.",
    );
    expect(sentence(premarketEntry({ at: at("12:30"), scanned: 40, bigMoves: 0, leader: null }))).toBe("40 stocks checked before the open; none was moving 3% or more.");
    expect(premarketEntry({ at: at("12:30"), scanned: 0, bigMoves: 0, leader: null })).toBeNull();
  });

  it("says the calls held without counting the ones the rule held, and names a change with its reason", () => {
    expect(sentence(callsEntry({ at: at("17:11"), reviewed: 146, changes: [], heldAgainst: 49 }))).toBe(
      "146 calls reviewed; none changed.",
    );
    expect(sentence(callsEntry({ at: at("17:11"), reviewed: 741, changes: [], heldAgainst: 0 }))).toBe("741 calls reviewed; none changed.");
    const one = callsEntry({ at: at("21:10"), reviewed: 743, changes: [{ ticker: "AAOI", to: "Trim", trigger: "earnings" }], heldAgainst: 3 });
    expect(sentence(one)).toBe("743 calls reviewed; 1 changed: AAOI to Sell some after its results.");
    expect(one?.href).toBe("/stock/AAOI");
    const many = callsEntry(
      {
        at: at("21:10"),
        reviewed: 743,
        changes: [
          { ticker: "AAOI", to: "Trim", trigger: "earnings" },
          { ticker: "NVDA", to: "Hold", trigger: "confirmed" },
          { ticker: "TSLA", to: "Add", trigger: "move" },
        ],
        heldAgainst: 0,
      },
    );
    expect(sentence(many)).toBe("743 calls reviewed; 3 changed: AAOI to Sell some after its results, NVDA to Keep and 1 more.");
  });

  it("counts moves only when a reason was confirmed", () => {
    expect(sentence(movesEntry({ at: at("14:58"), total: 30, explained: 15, screened: true, leader: { ticker: "CRWV", pct: 18.9 } }, "today's", "/explore#moves"))).toBe(
      "30 of today's biggest moves looked into; 15 have a reason we could confirm, including CRWV's, the biggest.",
    );
    expect(movesEntry({ at: at("14:58"), total: 30, explained: 0, screened: true, leader: null }, "today's", "/explore#moves")).toBeNull();
    // A merged count is never smaller than what it explains.
    expect(movesEntry({ at: at("14:58"), total: 10, explained: 12, screened: true, leader: null }, "today's", "/explore#moves")?.figure).toBe("12");
    // Only the dated copy left (it keeps the explained moves alone): no "of N looked into".
    expect(sentence(movesEntry({ at: at("14:58"), total: 15, explained: 15, screened: false, leader: { ticker: "CRWV", pct: 18.9 } }, "yesterday's", "/movers/2026-11-11"))).toBe(
      "15 big moves explained with a reason we could confirm, including CRWV's, the biggest.",
    );
  });

  it("names the filings worth flagging, and a quiet check as quiet", () => {
    const one = filingsEntry({ at: at("17:20"), companies: 769, count: 12, flagged: [{ ticker: "LRN", what: "an activist stake" }] });
    expect(sentence(one)).toBe("12 new SEC filings read; 1 was big enough to flag: an activist stake at LRN.");
    expect(
      sentence(
        filingsEntry({
          at: at("21:31"),
          companies: 769,
          count: 1212,
          flagged: [
            { ticker: "X", what: "a new material agreement" },
            { ticker: "Y", what: "an annual report" },
            { ticker: "Z", what: "a share offering" },
          ],
        }),
      ),
    ).toBe("1,212 new SEC filings read; 3 were big enough to flag, including a new material agreement at X and an annual report at Y.");
    expect(sentence(filingsEntry({ at: at("21:31"), companies: 769, count: 40, flagged: [] }))).toBe("40 new SEC filings read; none was big enough to flag.");
    const quiet = filingsEntry({ at: at("17:20"), companies: 769, count: 0, flagged: [] });
    expect(quiet?.quiet).toBe(true);
    expect(sentence(quiet)).toBe("769 companies checked for new SEC filings; none had filed anything new.");
    expect(filingsEntry({ at: at("17:20"), companies: null, count: 0, flagged: [] })).toBeNull();
  });

  it("words insiders, earnings, briefs and members' agents", () => {
    expect(sentence(insidersEntry({ at: at("16:22"), trades: 85, buys: 34, biggest: { ticker: "CRH", value: 569_700 } }))).toBe(
      "85 insider trades read from Form 4 filings; 34 were buys on the open market, the largest $570K at CRH.",
    );
    expect(sentence(insidersEntry({ at: at("16:22"), trades: 3, buys: 0, biggest: null }))).toBe("3 insider trades read from Form 4 filings; none was a buy on the open market.");
    expect(sentence(earningsEntry({ at: at("23:00"), count: 25, beat: 14, missed: 9 }))).toBe("25 earnings reports checked against estimates; 14 beat and 9 missed.");
    expect(sentence(earningsEntry({ at: at("23:00"), count: 2, beat: 0, missed: 0 }))).toBe("2 earnings reports checked against estimates.");
    expect(sentence(briefsEntry({ at: at("17:11"), count: 146, withNews: 121 }))).toBe("146 stock briefs brought up to date, 121 with fresh news.");
    expect(sentence(briefsEntry({ at: at("17:11"), count: 146, withNews: null }))).toBe("146 stock briefs brought up to date.");
    expect(sentence(briefsEntry({ at: at("17:11"), count: 9, withNews: 9 }))).toBe("9 stock briefs brought up to date.");
    expect(sentence(agentsEntry({ at: "2026-11-11T11:19:08.554Z", runs: 3, found: 1 }))).toBe("3 agents set up by members ran their checks; 1 found something to report.");
    expect(sentence(agentsEntry({ at: "2026-11-11T11:19:08.554Z", runs: 1, found: 0 }))).toBe("1 agent set up by members ran its checks; none found anything to report.");
    expect(buildAgentLog({ day: DAY, when: "today", ongoing: false, facts: { agents: { at: at("11:19"), runs: 1, found: 0 } }, movesHref: "/explore#moves" })?.lead).toBe(
      "Today the agent ran 1 agent a member set up.",
    );
    expect(agentsEntry({ at: at("11:19"), runs: 0, found: 0 })).toBeNull();
  });
});

describe("the day's log", () => {
  const facts: AgentLogFacts = {
    premarket: { at: at("12:30"), scanned: 72, bigMoves: 24, leader: { ticker: "COHR", pct: 9.29 } },
    briefs: { at: at("17:11"), count: 146, withNews: 121 },
    calls: { at: at("17:11"), reviewed: 146, changes: [], heldAgainst: 49 },
    moves: { at: at("14:58"), total: 30, explained: 15, screened: true, leader: { ticker: "CRWV", pct: 18.9 } },
    filings: { at: at("17:20"), companies: 769, count: 12, flagged: [{ ticker: "LRN", what: "an activist stake" }] },
    insiders: null,
    earnings: null,
    agents: { at: "2026-11-11T11:19:08.554Z", runs: 3, found: 1 },
  };

  it("leads with the three most telling lines and lists the rest oldest first", () => {
    const log = buildAgentLog({ day: DAY, when: "today", ongoing: true, facts, movesHref: "/explore#moves" });
    expect(log?.lead).toBe("So far today, the agent found the reason for 15 big moves, reviewed 146 calls and read 12 SEC filings.");
    // The briefs and the calls from the same run are one line.
    expect(log?.entries.map((line) => line.source)).toEqual(["agents", "premarket", "moves", "calls", "filings"]);
    expect(log?.entries.map((line) => line.time)).toEqual(["6:19 AM", "7:30 AM", "9:58 AM", "12:11 PM", "12:20 PM"]);
    expect(sentence(log!.entries[3]!)).toBe("146 stock briefs brought up to date, 121 with fresh news; no call changed.");
    expect(buildAgentLog({ day: DAY, when: "today", ongoing: false, facts, movesHref: "/explore#moves" })?.lead.startsWith("Today the agent found")).toBe(true);
    expect(buildAgentLog({ day: "2026-11-10", when: "yesterday", ongoing: false, facts: { briefs: { at: "2026-11-10T21:00:00Z", count: 9, withNews: null } }, movesHref: "/movers/2026-11-10" })?.lead).toBe(
      "Yesterday the agent brought 9 stock briefs up to date.",
    );
  });

  it("names a changed call on the shared briefs line", () => {
    const log = buildAgentLog({
      day: DAY,
      when: "today",
      ongoing: false,
      facts: { briefs: facts.briefs, calls: { at: at("21:10"), reviewed: 146, changes: [{ ticker: "AAOI", to: "Trim", trigger: "earnings" }], heldAgainst: 3 } },
      movesHref: "/explore#moves",
    });
    expect(log?.entries.map(sentence)).toEqual(["146 stock briefs brought up to date, 121 with fresh news; 1 call changed: AAOI to Sell some after its results."]);
    expect(log?.entries[0]?.href).toBe("/stock/AAOI");
    expect(log?.lead).toBe("Today the agent reviewed 146 calls and changed 1.");
  });

  it("skips stale and empty sources and never shows a log of quiet checks alone", () => {
    const stale = buildAgentLog({
      day: DAY,
      when: "today",
      ongoing: true,
      facts: { ...facts, premarket: { ...facts.premarket!, at: "2026-11-10T12:30:00Z" }, moves: { ...facts.moves!, explained: 0 } },
      movesHref: "/explore#moves",
    });
    expect(stale?.entries.some((line) => line.source === "premarket" || line.source === "moves")).toBe(false);
    expect(buildAgentLog({ day: DAY, when: "today", ongoing: true, facts: {}, movesHref: "/explore#moves" })).toBeNull();
    expect(
      buildAgentLog({ day: DAY, when: "today", ongoing: true, facts: { filings: { at: at("17:20"), companies: 769, count: 0, flagged: [] } }, movesHref: "/explore#moves" }),
    ).toBeNull();
  });

  it("keeps at most seven lines, quiet checks last in line", () => {
    const full: AgentLogFacts = {
      ...facts,
      filings: { at: at("17:20"), companies: 769, count: 0, flagged: [] },
      insiders: { at: at("16:22"), trades: 85, buys: 34, biggest: { ticker: "CRH", value: 569_700 } },
      earnings: { at: at("23:00"), count: 25, beat: 14, missed: 9 },
    };
    const log = buildAgentLog({ day: DAY, when: "today", ongoing: false, facts: full, movesHref: "/explore#moves" });
    expect(log?.entries).toHaveLength(MAX_ENTRIES);
    // Every source has its line (the briefs and calls share one); the quiet filings check is the one that would go first.
    expect(log?.entries.map((line) => line.source).sort()).toEqual(["agents", "calls", "earnings", "filings", "insiders", "moves", "premarket"]);
  });
});

describe("batch time", () => {
  it("takes the time nine in ten records were done, not a straggler", () => {
    const stamps = [...Array.from({ length: 145 }, () => "2026-11-11T15:07:02+00:00"), "2026-11-11T17:11:02+00:00"];
    expect(batchTime(stamps)).toBe("2026-11-11T15:07:02+00:00");
    expect(batchTime(["2026-11-11T17:11:02+00:00"])).toBe("2026-11-11T17:11:02+00:00");
    expect(batchTime([])).toBe("");
  });
});
