import { describe, expect, it } from "vitest";

import type { BriefingPosition } from "@/lib/briefing";
import { whyItMoved } from "@/lib/briefing-face";
import type { ResultRead } from "@/lib/results/types";
import {
  buildSinceVisit,
  callEvents,
  dayInstant,
  fits,
  insiderEvents,
  insiderInstant,
  isBigMove,
  lookedAtWords,
  nextReport,
  moveLine,
  nextVisits,
  readVisits,
  reasonEvents,
  reasonLead,
  resultEvents,
  SINCE_MAX_CARDS,
  sinceWindow,
  toldElsewhere,
  visitStart,
  windowMove,
  type SinceInputs,
} from "@/lib/since-visit";

// Thursday Nov 12 2026, 1:00 PM New York.
const NOW = new Date("2026-11-12T18:00:00Z");
const TODAY = "2026-11-12";
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function position(ticker: string, extra: Partial<BriefingPosition> = {}): BriefingPosition {
  return {
    instrument_id: `US_${ticker}`,
    ticker,
    name: `${ticker} Inc`,
    relation: "holding",
    price: 100,
    day_change_pct: 1.2,
    price_as_of: NOW.toISOString(),
    stance: "hold",
    call_summary: null,
    watch_out: null,
    add_below: null,
    breakout_above: null,
    trim_above: null,
    earnings_date: null,
    earnings_time: null,
    pre_earnings_headline: null,
    ...extra,
  };
}

/** Weekday closes ending on `last`, flat at 100 with ±1% swings, then `tail` closes appended. */
function series(last: string, tail: number[] = []): Array<{ date: string; close: number }> {
  const days: string[] = [];
  const cursor = new Date(`${last}T12:00:00Z`);
  while (days.length < 80) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const closes = days.map((_, index) => (index % 2 === 0 ? 100 : 101));
  const out = days.map((date, index) => ({ date, close: closes[index]! }));
  // Replace the last closes with the tail, so the series still ends on `last`.
  tail.forEach((close, index) => {
    out[out.length - tail.length + index]!.close = close;
  });
  return out;
}

describe("visits", () => {
  it("reads only real stamps", () => {
    expect(readVisits(undefined)).toEqual({ last_at: null, prev_at: null });
    expect(readVisits({ last_at: "nope", prev_at: hoursAgo(5) })).toEqual({ last_at: null, prev_at: hoursAgo(5) });
  });

  it("moves last to prev, but not within half an hour", () => {
    expect(nextVisits({ last_at: null, prev_at: null }, NOW)).toEqual({ last_at: NOW.toISOString(), prev_at: null });
    expect(nextVisits({ last_at: hoursAgo(5), prev_at: hoursAgo(30) }, NOW)).toEqual({ last_at: NOW.toISOString(), prev_at: hoursAgo(5) });
    expect(nextVisits({ last_at: hoursAgo(0.25), prev_at: hoursAgo(30) }, NOW)).toBeNull();
    // A stamp from the future (a skewed clock) is not moved either.
    expect(nextVisits({ last_at: new Date(NOW.getTime() + 60_000).toISOString(), prev_at: null }, NOW)).toBeNull();
  });

  it("starts at the last visit, or the one before when the last is this same sitting", () => {
    expect(visitStart({ last_at: null, prev_at: null }, NOW)).toBeNull();
    expect(visitStart({ last_at: hoursAgo(20), prev_at: hoursAgo(50) }, NOW)).toBe(hoursAgo(20));
    // The page reloaded ten minutes after the post: still the visit before, so the changes stay on screen.
    expect(visitStart({ last_at: hoursAgo(1 / 6), prev_at: hoursAgo(20) }, NOW)).toBe(hoursAgo(20));
    expect(visitStart({ last_at: hoursAgo(1 / 6), prev_at: null }, NOW)).toBeNull();
  });
});

describe("sinceWindow", () => {
  it("hides with no visit or one under three hours ago", () => {
    expect(sinceWindow(null, NOW)).toBeNull();
    expect(sinceWindow(hoursAgo(2.9), NOW)).toBeNull();
    expect(sinceWindow(hoursAgo(3), NOW)).not.toBeNull();
  });

  it("says the day in words", () => {
    // 7:30 AM New York today.
    expect(sinceWindow("2026-11-12T12:30:00Z", NOW)?.title).toBe("Since you looked this morning");
    expect(sinceWindow("2026-11-12T12:30:00Z", new Date("2026-11-12T22:00:00Z"))?.quiet).toBe("Nothing changed on your stocks since this morning");
    // 9 AM New York today, seen at 9 PM: still this morning; 2 PM: earlier today.
    expect(sinceWindow("2026-11-12T19:00:00Z", new Date("2026-11-13T01:00:00Z"))?.title).toBe("Since you looked earlier today");
    expect(sinceWindow(hoursAgo(24), NOW)?.title).toBe("Since you looked yesterday");
    expect(sinceWindow(hoursAgo(24), NOW)?.quiet).toBe("Nothing changed on your stocks since yesterday");
    expect(sinceWindow("2026-11-09T15:00:00Z", NOW)?.title).toBe("Since Monday");
    expect(sinceWindow("2026-11-03T15:00:00Z", NOW)?.title).toBe("Since Nov 3");
  });

  it("caps at two weeks", () => {
    const window = sinceWindow(hoursAgo(24 * 30), NOW)!;
    expect(window.capped).toBe(true);
    expect(window.title).toBe("In the last two weeks");
    expect(window.from).toBe(NOW.getTime() - 14 * 86_400_000);
    expect(window.fromDay).toBe("2026-10-29");
  });
});

describe("call changes", () => {
  const from = Date.parse(hoursAgo(48)); // Tue 1 PM New York
  it("gives the net change with its day", () => {
    const events = callEvents({ NVDA: [{ date: "2026-11-11", from: "Hold", to: "Add" }] }, from, TODAY);
    expect(events).toEqual([expect.objectContaining({ ticker: "NVDA", kind: "call", line: "Call moved Keep → Buy more yesterday", score: 100 })]);
  });
  it("skips a change and its reversal, and changes before the window", () => {
    expect(
      callEvents({ NVDA: [{ date: "2026-11-11", from: "Hold", to: "Add" }, { date: "2026-11-12", from: "Add", to: "Hold" }] }, from, TODAY),
    ).toEqual([]);
    expect(callEvents({ NVDA: [{ date: "2026-11-09", from: "Hold", to: "Add" }] }, from, TODAY)).toEqual([]);
    // A change dated the visit's own day may already have been seen: not shown again.
    expect(callEvents({ NVDA: [{ date: "2026-11-10", from: "Hold", to: "Add" }] }, from, TODAY)).toEqual([]);
  });
  it("ranks a move to or from Sell some higher", () => {
    expect(callEvents({ TSLA: [{ date: "2026-11-12", from: "Hold", to: "Trim" }] }, from, TODAY)[0]).toMatchObject({ line: "Call moved Keep → Sell some today", score: 110 });
  });
  it("counts a day-dated change at the end of its New York day", () => {
    expect(new Date(dayInstant("2026-11-11")!).toISOString()).toBe("2026-11-12T04:59:00.000Z");
  });
});

describe("reason checks", () => {
  const from = Date.parse(hoursAgo(48));
  it("says a reason broke, in the person's own words when short", () => {
    const events = reasonEvents(
      { ASTS: { verdict: "broken", history: [{ day: "2026-11-01", verdict: "holds" }, { day: "2026-11-11", verdict: "broken" }], reason: "margins expanding", kind: "growth" } },
      from,
    );
    expect(events).toEqual([expect.objectContaining({ ticker: "ASTS", kind: "reason", line: "Your reason “margins expanding” broke" })]);
  });
  it("says it recovered, and skips a reason first checked inside the window", () => {
    expect(
      reasonEvents({ ASTS: { verdict: "holds", history: [{ day: "2026-11-01", verdict: "weaker" }, { day: "2026-11-11", verdict: "holds" }], reason: null, kind: "growth" } }, from)[0]?.line,
    ).toBe("Your growth reason holds again");
    expect(reasonEvents({ ASTS: { verdict: "broken", history: [{ day: "2026-11-12", verdict: "broken" }], reason: null, kind: null } }, from)).toEqual([]);
  });
  it("names a long reason by its kind", () => {
    expect(reasonLead("every big cloud company is still buying their chips", "growth")).toBe("Your growth reason");
    expect(reasonLead(null, null)).toBe("Your reason");
  });
});

describe("results", () => {
  it("gives the headline figure for a report after the visit", () => {
    const from = Date.parse(hoursAgo(30));
    const events = resultEvents(
      [
        { ticker: "NBIS", reportDate: "2026-11-12", session: "bmo", fact: "Missed by 12%" },
        { ticker: "OLD", reportDate: "2026-11-09", session: "amc", fact: "Beat by 3%" },
      ],
      from,
      TODAY,
    );
    expect(events).toEqual([expect.objectContaining({ ticker: "NBIS", kind: "results", line: "Missed by 12% in today's report" })]);
    const older = resultEvents([{ ticker: "SMR", reportDate: "2026-11-05", session: "amc", fact: "In line" }], Date.parse("2026-11-04T12:00:00Z"), TODAY);
    expect(older[0]?.line).toBe("The Nov 5 report was in line");
  });
});

describe("big moves", () => {
  it("measures from the first close after the visit, against the usual day", () => {
    // Usual day about 1%. Visit Tue 6 PM New York, so the first price after it is Wed's close (101); now 88.
    const closes = series("2026-11-11");
    const from = Date.parse("2026-11-10T23:00:00Z");
    const move = windowMove(closes, from, 88, NOW.toISOString())!;
    expect(move.sessions).toBe(1);
    expect(move.pct).toBeCloseTo(-12.87, 1);
    expect(isBigMove(move)).toBe(true);
    expect(moveLine(move, null).line).toMatch(/^Down 13%, \d+× its usual day$/);
  });

  it("needs both the size and the multiple of the usual move", () => {
    const closes = series("2026-11-11");
    const from = Date.parse("2026-11-10T23:00:00Z");
    expect(isBigMove(windowMove(closes, from, 103, NOW.toISOString()))).toBe(false);
    // Visit Thu Nov 5 after the close: measured from Fri's close over four sessions, a 4% move is under 2.5 × 1% × √4.
    const week = Date.parse("2026-11-05T22:00:00Z");
    const move = windowMove(closes, week, 104, NOW.toISOString())!;
    expect(move.sessions).toBe(4);
    expect(isBigMove(move)).toBe(false);
  });

  it("never measures from before the visit", () => {
    const closes = series("2026-11-11");
    // Visit Wed 1 PM: from Wed's close, not Tue's. Visit Wed 6 PM: the next close is today's, still to come.
    expect(windowMove(closes, Date.parse("2026-11-11T18:00:00Z"), 88, NOW.toISOString())?.sessions).toBe(1);
    expect(windowMove(closes, Date.parse("2026-11-11T23:00:00Z"), 88, NOW.toISOString())).toBeNull();
  });

  it("gives no figure for a visit during the window's only session", () => {
    // Visit Thursday 11 AM New York, price now Thursday: the person saw part of today's move already.
    expect(windowMove(series("2026-11-11"), Date.parse("2026-11-12T16:00:00Z"), 88, NOW.toISOString())).toBeNull();
  });

  it("skips a stock whose stored closes stop before the visit", () => {
    // History ends Monday; the visit was Wednesday evening: the figure would include moves before the visit.
    const stale = series("2026-11-09");
    expect(windowMove(stale, Date.parse("2026-11-11T23:00:00Z"), 80, NOW.toISOString())).toBeNull();
  });

  it("uses a confirmed reason only when it fits and today's move carries it", () => {
    const move = { pct: -9.1, sessions: 1, usual: 2, ratio: 4.5 };
    expect(moveLine(move, { line: "Guidance cut on weaker cloud demand.", todayPct: -9.1 })).toEqual({ line: "Down 9.1%: Guidance cut on weaker cloud demand", withReason: true });
    expect(moveLine(move, { line: "Guidance cut on weaker cloud demand.", todayPct: 2 }).withReason).toBe(false);
    expect(moveLine(move, { line: "A very long confirmed reason that goes on and on past the word budget for sure.", todayPct: -9 }).withReason).toBe(false);
    expect(moveLine({ pct: 12.4, sessions: 4, usual: 2, ratio: 3.1 }, null).line).toBe("Up 12% over 4 sessions");
  });
});

describe("insiders", () => {
  it("reads the Form 4 job's zone-less times as New York", () => {
    expect(new Date(insiderInstant("2026-11-12T06:02:52")!).toISOString()).toBe("2026-11-12T11:02:00.000Z");
    expect(insiderInstant("2026-11-12T06:02:52Z")).toBe(Date.parse("2026-11-12T06:02:52Z"));
  });
  it("keeps buys from $100K and sales from $1M, grouped per stock", () => {
    const from = Date.parse(hoursAgo(30));
    const events = insiderEvents(
      [
        { symbol: "COHR", side: "buy", value: 997_400, role: "CEO, Director", insider: "A", filed_at: "2026-11-12T06:02:52" },
        { symbol: "COHR", side: "buy", value: 222_885, role: "Director", insider: "B", filed_at: "2026-11-12T06:01:02" },
        { symbol: "SMCI", side: "buy", value: 49_940, role: "Director", insider: "C", filed_at: "2026-11-12T06:01:02" },
        { symbol: "MSFT", side: "sell", value: 900_000, role: "CFO", insider: "D", filed_at: "2026-11-12T06:01:02" },
        { symbol: "TSM", side: "buy", value: 299_880, role: "Director", insider: "E", filed_at: "2026-11-09T06:15:09" },
      ],
      from,
    );
    expect(events).toEqual([expect.objectContaining({ ticker: "COHR", kind: "insider", line: "2 insiders bought $1.2M of shares" })]);
  });
});

describe("buildSinceVisit", () => {
  const window = sinceWindow(hoursAgo(24), NOW);
  const positions = ["NVDA", "TSLA", "COHR", "AMD", "META", "MSFT", "AAPL", "ORCL"].map((ticker) => position(ticker));
  const inputs: SinceInputs = {
    calls: {
      NVDA: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
      TSLA: [{ date: "2026-11-12", from: "Hold", to: "Trim" }],
      AMD: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
      META: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
      MSFT: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
      AAPL: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
      ORCL: [{ date: "2026-11-12", from: "Hold", to: "Add" }],
    },
    insiders: [
      { symbol: "COHR", side: "buy", value: 997_400, role: "CEO", insider: "A", filed_at: "2026-11-12T06:02:52" },
      { symbol: "NVDA", side: "buy", value: 997_400, role: "CEO", insider: "A", filed_at: "2026-11-12T06:02:52" },
    ],
  };

  it("hides with no window", () => {
    expect(buildSinceVisit({ window: null, positions, inputs, now: NOW })).toBeNull();
  });

  it("gives one card per stock, its most important change, at most six, Sell some first", () => {
    const view = buildSinceVisit({ window, positions, inputs, now: NOW })!;
    expect(view.title).toBe("Since you looked yesterday");
    expect(view.cards).toHaveLength(SINCE_MAX_CARDS);
    expect(view.cards[0]).toMatchObject({ ticker: "TSLA", line: "Call moved Keep → Sell some today", href: "/stock/TSLA" });
    const nvda = view.cards.find((card) => card.ticker === "NVDA");
    expect(nvda?.kind).toBe("call");
    expect(new Set(view.cards.map((card) => card.ticker)).size).toBe(view.cards.length);
    for (const card of view.cards) expect(fits(card.line)).toBe(card.line);
  });

  it("leaves out stocks Do today already shows, and calls on stocks the plan does not cover", () => {
    const view = buildSinceVisit({
      window,
      positions: [position("NVDA"), position("TSLA", { covered: false }), position("COHR")],
      inputs,
      exclude: new Set(["NVDA"]),
      now: NOW,
    })!;
    expect(view.cards.map((card) => card.ticker)).toEqual(["COHR"]);
  });

  it("is an empty view (the quiet line) when nothing changed", () => {
    const view = buildSinceVisit({ window, positions, inputs: {}, now: NOW })!;
    expect(view.cards).toEqual([]);
    expect(view.quiet).toBe("Nothing changed on your stocks since yesterday");
    expect(view.complete).toBe(true);
    expect(view.quiet_ok).toBe(true);
    const partial = buildSinceVisit({ window, positions, inputs: {}, complete: false, now: NOW })!;
    expect([partial.complete, partial.quiet_ok]).toEqual([false, false]);
  });

  it("leaves a big move that Why it moved explains to that module", () => {
    const closes = series("2026-11-11");
    const moving = [position("NBIS", { price: 80, day_change_pct: -20 })];
    const base = { window, positions: moving, inputs: { series: { NBIS: closes } }, now: NOW };
    // The visit was Wednesday 1 PM, so the move runs from Wednesday's close: one session.
    expect(buildSinceVisit(base)!.cards[0]?.line).toMatch(/^Down 2\d%, \d+× its usual day$/);
    const long = new Map([["NBIS", { line: "Nebius plunges as capacity delays and massive spending cloud the outlook for the year.", todayPct: -20 }]]);
    const left = buildSinceVisit({ ...base, told: new Set(long.keys()) })!;
    expect(left.cards).toEqual([]);
    // The move is told below, so "Nothing changed" would be wrong.
    expect(left.quiet_ok).toBe(false);

  });

  it("keeps an agent's level finding only while the price is still past the level and Buy more levels does not show it", () => {
    const runs: SinceInputs["agentRuns"] = [
      {
        ran_at: hoursAgo(20),
        job_name: "Names entering their add zone",
        findings: [
          { ticker: "MSFT", headline: "MSFT closed in its add zone", kind: "level", close: 521.13, level: 530.61, zone: "add" },
          { ticker: "AMZN", headline: "AMZN closed in its add zone", kind: "level", close: 266.17, level: 266.93, zone: "add" },
          { ticker: "META", headline: "META closed in its add zone", kind: "level", close: 628.77, level: 641.37, zone: "add" },
          { ticker: "MU", headline: "MU rose 11.89% in the last session", kind: "move", change_pct: 11.89 } as never,
        ],
      },
    ];
    const view = buildSinceVisit({
      window,
      positions: [
        position("MSFT", { price: 523.4, stance: "accumulate" }),
        position("AMZN", { price: 269.03, stance: "accumulate" }),
        position("META", { price: 623.49, stance: "accumulate" }),
        position("MU"),
      ],
      inputs: { agentRuns: runs },
      told: new Set(["META"]),
      now: NOW,
    })!;
    expect(view.cards.map((card) => [card.ticker, card.line])).toEqual([["MSFT", "Closed under its $530.61 buy-more level"]]);
  });
});

describe("quality-pass cases", () => {
  const window = sinceWindow(hoursAgo(24), NOW);

  it("never says a report is out before it is, or without a figure", () => {
    const from = Date.parse(hoursAgo(24));
    // Today after the close is 4 PM; NOW is 1 PM.
    expect(resultEvents([{ ticker: "CBRS", reportDate: TODAY, session: "amc", fact: "Beat by 5%" }], from, TODAY, NOW.getTime())).toEqual([]);
    expect(resultEvents([{ ticker: "NBIS", reportDate: TODAY, session: "bmo", fact: null }], from, TODAY, NOW.getTime())).toEqual([]);
  });

  it("leaves a lesser change on a stock another module tells to that module, but not a call change", () => {
    const positions = [position("NVDA"), position("TSLA")];
    const inputs: SinceInputs = {
      calls: { TSLA: [{ date: "2026-11-12", from: "Hold", to: "Trim" }] },
      insiders: [{ symbol: "NVDA", side: "sell", value: 2_000_000, role: "CFO", insider: "A", filed_at: "2026-11-12T08:00:00" }],
    };
    const reasons = new Map([
      ["NVDA", { line: "A long confirmed reason about supply that does not fit on the card at all here.", todayPct: -8 }],
      ["TSLA", { line: "Another long confirmed reason that does not fit on the card either, by a mile.", todayPct: -6 }],
    ]);
    const view = buildSinceVisit({ window, positions, inputs, told: new Set(reasons.keys()), now: NOW })!;
    expect(view.cards.map((card) => card.ticker)).toEqual(["TSLA"]);
  });

  it("does not put a reason that cites another figure beside the window's move", () => {
    const move = { pct: -12, sessions: 3, usual: 2, ratio: 3.5 };
    expect(moveLine(move, { line: "Shares fell 5% after the guidance cut.", todayPct: -9 }).withReason).toBe(false);
  });
});

describe("level findings and the call", () => {
  it("drops a buy-more level finding beside a Keep or Sell some call", () => {
    const runs: SinceInputs["agentRuns"] = [
      { ran_at: hoursAgo(20), job_name: "Add zone", findings: [{ ticker: "SPCX", headline: "SPCX closed in its add zone", kind: "level", close: 139.75, level: 142.07, zone: "add" }] },
    ];
    const window = sinceWindow(hoursAgo(24), NOW);
    for (const stance of ["trim", "hold"]) {
      const view = buildSinceVisit({ window, positions: [position("SPCX", { price: 141.63, stance })], inputs: { agentRuns: runs }, now: NOW })!;
      expect(view.cards).toEqual([]);
    }
  });
});

describe("council round 1", () => {
  it("shortens an overlong results line to its figure, or gives no card", () => {
    const from = Date.parse(hoursAgo(24));
    const long = "Beat by 9.5%, revenue up 31% on a year ago and guidance raised for the full year";
    expect(resultEvents([{ ticker: "NBIS", reportDate: TODAY, session: "bmo", fact: long }], from, TODAY, NOW.getTime())[0]?.line).toBe("Beat by 9.5%");
    const endless = "Revenue up 31 percent on a year ago with guidance raised for the full year ahead";
    expect(resultEvents([{ ticker: "NBIS", reportDate: TODAY, session: "bmo", fact: endless }], from, TODAY, NOW.getTime())).toEqual([]);
  });

  it("names when they last looked and their next report not on the page", () => {
    const window = sinceWindow(hoursAgo(24), NOW)!;
    expect(lookedAtWords(window, NOW)).toBe("Yesterday, 1:00 PM ET");
    expect(lookedAtWords(sinceWindow(hoursAgo(4), NOW)!, NOW)).toBe("Today, 9:00 AM ET");
    const positions = [
      position("CBRS", { earnings_date: TODAY, earnings_time: "amc" }),
      position("NBIS", { earnings_date: TODAY, earnings_time: "bmo" }),
      position("XPEV", { earnings_date: "2026-11-16", earnings_time: "bmo" }),
    ];
    // NBIS already reported this morning; CBRS is skipped (Do today names it).
    expect(nextReport(positions, new Set(["CBRS"]), NOW)).toEqual({ ticker: "XPEV", line: "XPEV reports Monday before the open" });
    expect(nextReport(positions, new Set(), NOW)?.line).toBe("CBRS reports today after the close");
  });
});

describe("told elsewhere", () => {
  it("leaves a big move on a stock in the top news to that story", () => {
    const window = sinceWindow(hoursAgo(24), NOW);
    const base = { window, positions: [position("NVDA", { price: 80, day_change_pct: -20 })], inputs: { series: { NVDA: series("2026-11-11") } }, now: NOW };
    expect(buildSinceVisit(base)!.cards).toHaveLength(1);
    const told = buildSinceVisit({ ...base, told: new Set(["NVDA"]) })!;
    expect([told.cards.length, told.quiet_ok]).toEqual([0, false]);
  });
});

describe("council round 3", () => {
  it("never lets a move claim a stock another module shows, even with a reason that fits", () => {
    const window = sinceWindow(hoursAgo(24), NOW);
    const base = { window, positions: [position("NBIS", { price: 80, day_change_pct: -20 })], inputs: { series: { NBIS: series("2026-11-11") } }, now: NOW };
    const short = new Map([["NBIS", { line: "Capacity delays hit the outlook.", todayPct: -20 }]]);
    expect(buildSinceVisit({ ...base, told: new Set(short.keys()) })!.cards).toEqual([]);
    expect(buildSinceVisit({ ...base, told: new Set(["NBIS"]) })!.cards).toEqual([]);
  });

  it("counts a report with no session time only on a day after the visit's day", () => {
    // Visit today at 9 AM New York; NOW is 1 PM. A timed report today after the visit counts; an untimed one does not.
    const from = Date.parse("2026-11-12T14:00:00Z");
    const untimed = { ticker: "NBIS", reportDate: TODAY, session: null, fact: "Beat by 5%" };
    expect(resultEvents([untimed], from, TODAY, Date.parse("2026-11-12T22:00:00Z"))).toEqual([]);
    expect(resultEvents([untimed], Date.parse("2026-11-11T14:00:00Z"), TODAY, Date.parse("2026-11-12T22:00:00Z"))).toHaveLength(1);
    expect(resultEvents([{ ...untimed, session: "amc" }], from, TODAY, Date.parse("2026-11-12T22:00:00Z"))).toHaveLength(1);
  });
});

describe("a results card in Why it moved", () => {
  it("keeps a big move from claiming the stock, as the page builds it", () => {
    const window = sinceWindow(hoursAgo(24), NOW);
    const nbis = position("NBIS", { price: 80, day_change_pct: -20 });
    // The page's own "Why it moved" read, with NBIS told by its results card.
    const read: ResultRead = {
      ticker: "NBIS",
      company: "Nebius",
      reportDate: TODAY,
      session: "bmo",
      period: null,
      eps: { actual: -0.5, expected: -0.3, verdict: "miss", surprisePct: -66, source: "Nasdaq", asOf: null },
      revenue: null,
      guidance: null,
      move: null,
      call: null,
      reportHref: null,
      sources: [],
    } as unknown as ResultRead;
    const moved = whyItMoved({ items: [], positions: [nbis], results: [read], exclude: new Set(), today: TODAY, resultFact: () => "Missed by 66%" });
    expect(moved).toEqual([expect.objectContaining({ ticker: "NBIS", kind: "results" })]);
    const told = toldElsewhere({ topNews: [], moved, levels: [], week: [] });
    const view = buildSinceVisit({ window, positions: [nbis], inputs: { series: { NBIS: series("2026-11-11") } }, told, now: NOW })!;
    expect(view.cards).toEqual([]);
    expect(view.quiet_ok).toBe(false);
    // The same move with nothing else on the page is a card.
    expect(buildSinceVisit({ window, positions: [nbis], inputs: { series: { NBIS: series("2026-11-11") } }, now: NOW })!.cards[0]?.kind).toBe("move");
  });
});
