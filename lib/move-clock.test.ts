import { describe, expect, it } from "vitest";

import { briefingRead } from "@/lib/briefing-read";
import type { BriefingGroup, GroupedSections } from "@/lib/briefing-groups";
import type { BriefingItem } from "@/lib/briefing";
import { staleMoveClock } from "@/lib/move-clock";
import { buildMoversRead, type MoverForRead } from "@/lib/signals-insights";

// Wed Nov 11 2026, New York is UTC−5.
const at = (clock: string) => Date.parse(`2026-11-11T${clock}:00-05:00`);
const OPEN_SNAPSHOT = "2026-11-11T14:58:00.000Z"; // 9:58 AM ET

describe("staleMoveClock", () => {
  it("names the quote time once it is more than two hours behind during the session", () => {
    expect(staleMoveClock(OPEN_SNAPSHOT, at("15:00"))).toBe("9:58 AM");
    expect(staleMoveClock(OPEN_SNAPSHOT, at("11:58"))).toBeNull();
    expect(staleMoveClock(OPEN_SNAPSHOT, at("11:59"))).toBe("9:58 AM");
  });

  it("measures against the close once the market has shut, and never flags a closing quote", () => {
    expect(staleMoveClock(OPEN_SNAPSHOT, at("19:00"))).toBe("9:58 AM");
    expect(staleMoveClock("2026-11-11T14:30:00-05:00", at("19:00"))).toBeNull();
    expect(staleMoveClock("2026-11-11T16:05:00-05:00", at("19:00"))).toBeNull();
  });

  it("leaves other days, bare dates, future stamps and junk alone", () => {
    expect(staleMoveClock("2026-11-10T14:58:00.000Z", at("15:00"))).toBeNull();
    expect(staleMoveClock("2026-11-11", at("15:00"))).toBeNull();
    expect(staleMoveClock("2026-11-11T20:30:00.000Z", at("15:00"))).toBeNull();
    expect(staleMoveClock("not a time", at("15:00"))).toBeNull();
    expect(staleMoveClock(null, at("15:00"))).toBeNull();
  });

  it("writes afternoon times in the afternoon", () => {
    expect(staleMoveClock("2026-11-11T12:05:00-05:00", at("15:30"))).toBe("12:05 PM");
  });
});

function item(over: Partial<BriefingItem>): BriefingItem {
  return {
    id: "move-crwv",
    kind: "price_move",
    ticker: "CRWV",
    name: "CoreWeave",
    relation: "market",
    headline: "CoreWeave is up 23.9%",
    why: "CoreWeave raises its forecast as AI demand and capacity strengthen.",
    reason_status: "confirmed",
    day_change_pct: 23.9,
    as_of: OPEN_SNAPSHOT,
    needs_you: true,
    ...over,
  } as BriefingItem;
}

function grouped(items: BriefingItem[]): GroupedSections {
  const groups = items.map(
    (row) =>
      ({
        key: row.ticker,
        ticker: row.ticker,
        name: row.name,
        relation: "market",
        call: null,
        day_change_pct: row.day_change_pct,
        price: null,
        as_of: row.as_of,
        headerMove: null,
        lines: [{ item: row }],
        items: [row],
        needs_you: true,
      }) as unknown as BriefingGroup,
  );
  return { needs_you: groups, worth_knowing: [], coming_up: [], settled: [] } as unknown as GroupedSections;
}

const MARKET = {
  mode: "market" as const,
  date: "2026-11-11",
  portfolio: null,
  quiet: { names: [] },
  market: {
    indices: [{ name: "S&P 500", price: 6900, change_pct: 1.39, as_of: "2026-11-11T20:03:00.000Z" }],
    gainers: [],
    losers: [],
    as_of: OPEN_SNAPSHOT,
  },
} as unknown as Parameters<typeof briefingRead>[0];

describe("the market briefing with an old movers snapshot", () => {
  it("leads with the move's own time and keeps the live index on its own clock", () => {
    const read = briefingRead(MARKET, grouped([item({})]), null, at("15:00"));
    expect(read?.headline).toMatch(/^By 9:58 AM, CoreWeave (was up|rose) 23\.9%/);
    expect(read?.headline).not.toMatch(/ is up /);
    const index = read?.insights.find((insight) => insight.id === "index");
    expect(index?.text).toBe("As of 3:03 PM ET, the S&P 500 is up 1.39%.");
  });

  it("says nothing about time when the moves are fresh", () => {
    const fresh = item({ as_of: "2026-11-11T19:50:00.000Z" });
    const read = briefingRead(MARKET, grouped([fresh]), null, at("15:00"));
    expect(read?.headline).not.toMatch(/^By /);
  });

  it("dates every row that carries an old move", () => {
    const second = item({ id: "move-nbis", ticker: "NBIS", name: "Nebius Group", day_change_pct: 17.3, why: "Nebius shares climb on strong demand." });
    const read = briefingRead(MARKET, grouped([item({}), second]), null, at("15:00"));
    const row = read?.insights.find((insight) => insight.tickers?.[0] === "NBIS");
    expect(row?.text).toMatch(/9:58 AM/);
    expect(row?.figure).toMatchObject({ label: "at 9:58 AM" });
  });
});

describe("the movers read on /signals", () => {
  const movers: MoverForRead[] = [
    { ticker: "CRWV", name: "CoreWeave", pct: 23.9, explained: true, cause: "Earnings", headline: "CoreWeave raises its forecast", priceAsOf: OPEN_SNAPSHOT },
    { ticker: "NBIS", name: "Nebius Group", pct: 17.3, explained: true, cause: "Earnings", headline: "Nebius results beat", priceAsOf: OPEN_SNAPSHOT },
  ];

  it("puts the time in front of an old headline and dates the read by the quotes", () => {
    const read = buildMoversRead(movers, "2026-11-11T16:30:00.000Z", at("15:00"));
    expect(read?.headline).toMatch(/^By 9:58 AM, /);
    expect(read?.asOf).toBe(OPEN_SNAPSHOT);
  });

  it("keeps a company name capitalised behind the time", () => {
    const read = buildMoversRead([movers[0]!], null, at("15:00"));
    expect(read?.headline).toMatch(/^By 9:58 AM, CoreWeave moved most/);
  });

  it("dates the headline by the moves it names, not by some other row's old quote", () => {
    const fresh = movers.map((mover) => ({ ...mover, priceAsOf: "2026-11-11T20:01:00.000Z" }));
    const other: MoverForRead = { ticker: "SNXX", name: null, pct: 31.6, explained: false, cause: null, headline: null, priceAsOf: "2026-11-11T16:29:00.000Z" };
    const read = buildMoversRead([...fresh, other], null, at("15:30"));
    expect(read?.headline).toMatch(/^Earnings reports lifted CoreWeave and Nebius\.$/);
    // The read's own time is still the oldest quote under it.
    expect(read?.asOf).toBe("2026-11-11T16:29:00.000Z");
  });

  it("keeps the timed headline short: drops the names in brackets, then the part after the colon", () => {
    const chips: MoverForRead[] = ["AAA", "BBB", "CCC"].map((ticker, at) => ({
      ticker,
      name: `${ticker} Semiconductor Holdings Incorporated`,
      industry: "Semiconductors",
      pct: 12 - at,
      explained: true,
      cause: "Earnings",
      headline: "Results beat",
      priceAsOf: OPEN_SNAPSHOT,
    }));
    const read = buildMoversRead(chips, null, at("15:00"));
    expect(read?.headline).toMatch(/^By 9:58 AM, chip stocks led the gainers/);
    expect(read!.headline.split(/\s+/).length).toBeLessThanOrEqual(18);
  });

  it("does not lower-case an acronym", () => {
    const one: MoverForRead[] = [{ ticker: "AIQ", name: "AI Quantum", pct: 9, explained: false, cause: null, headline: null, priceAsOf: OPEN_SNAPSHOT }];
    expect(buildMoversRead(one, null, at("15:00"))?.headline).toMatch(/^By 9:58 AM, AI Quantum moved most/);
  });

  it("does not let a leftover quote from an earlier day date the list", () => {
    const mixed = [...movers, { ...movers[0]!, ticker: "OLD", priceAsOf: "2026-11-10T15:00:00.000Z" }];
    const read = buildMoversRead(mixed.map((mover) => (mover.ticker === "OLD" ? mover : { ...mover, priceAsOf: "2026-11-11T20:01:00.000Z" })), null, at("15:30"));
    expect(read?.asOf).toBe("2026-11-11T20:01:00.000Z");
  });

  it("leaves a fresh headline as it was", () => {
    const read = buildMoversRead(movers, null, at("10:30"));
    expect(read?.headline).not.toMatch(/^By /);
  });
});
