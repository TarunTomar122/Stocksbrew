import { describe, expect, it } from "vitest";

import {
  gappers,
  openingHeadline,
  premarketInputFrom,
  premarketRead,
  premarketWhen,
  type CueInput,
} from "@/lib/premarket-read";

const cue = (id: string, label: string, group: string, change_pct: number, region = "US futures"): CueInput => ({
  id,
  label,
  ticker: id,
  region,
  group,
  price: 100,
  previous_close: 100,
  change_pct,
});

// From tm_premarket_opening/US__latest on Nov 11, 2026.
const CUES: CueInput[] = [
  cue("US_OPEN_ES", "S&P 500 futures", "futures", 0.86),
  cue("US_OPEN_NQ", "Nasdaq 100 futures", "futures", 1.9),
  cue("US_OPEN_RTY", "Russell 2000 futures", "futures", 0.76),
  cue("US_OPEN_NIKKEI", "Nikkei 225", "asia", 1.37, "Japan"),
  cue("US_OPEN_KOSPI", "KOSPI", "asia", 2.54, "South Korea"),
  cue("US_OPEN_HSI", "Hang Seng", "asia", -0.98, "Hong Kong"),
  cue("US_OPEN_STOXX", "Euro Stoxx 50", "europe", 0.65, "Europe"),
  cue("US_OPEN_VIX", "VIX", "macro", -4.57, "Macro"),
];

// 12:30 UTC = 7:30 AM ET on a Wednesday.
const GENERATED = "2026-11-11T12:30:18+00:00";
const at = (iso: string) => new Date(iso);

describe("premarketWhen", () => {
  it("is live between 4:00 and 9:30 ET with today's numbers", () => {
    expect(premarketWhen(GENERATED, at("2026-11-11T14:05:00Z"))).toEqual({ phase: "live", today: true, weekday: "Wednesday", note: null });
  });
  it("says this morning's premarket and that the market is open after 9:30", () => {
    expect(premarketWhen(GENERATED, at("2026-11-11T15:00:00Z")).note).toBe("This is this morning's premarket. The market is open now.");
  });
  it("says the market is closed after 4 PM and names an earlier day", () => {
    expect(premarketWhen(GENERATED, at("2026-11-11T22:00:00Z")).note).toBe("This is this morning's premarket. The market is closed now.");
    expect(premarketWhen(GENERATED, at("2026-11-12T06:00:00Z")).note).toBe("This is the premarket from Wednesday, Nov 11. The market is closed now.");
    expect(premarketWhen(GENERATED, at("2026-11-12T10:00:00Z")).note).toBe(
      "Today's premarket numbers are not in yet, so this is the premarket from Wednesday, Nov 11.",
    );
  });
});

describe("the read", () => {
  it("leads with where futures point, in the present before the bell and the past after", () => {
    expect(openingHeadline(CUES, { phase: "live", today: true })).toBe("Futures point to a higher open, led by Nasdaq 100 futures up 1.9%.");
    expect(openingHeadline(CUES, { phase: "open", today: true })).toBe("This morning, futures pointed to a higher open, led by Nasdaq 100 futures up 1.9%.");
    expect(openingHeadline([cue("US_OPEN_ES", "S&P 500 futures", "futures", 0.1), cue("US_OPEN_NQ", "Nasdaq 100 futures", "futures", -0.05)], { phase: "live", today: true })).toBe(
      "Futures point to a flat open: S&P 500 futures are up 0.1%.",
    );
    expect(openingHeadline([], { phase: "live", today: true })).toBeNull();
    // An earlier day's numbers are never told in the present tense, even before the bell.
    expect(openingHeadline(CUES, { phase: "live", today: false, weekday: "Friday" })).toBe("On Friday, futures pointed to a higher open, led by Nasdaq 100 futures up 1.9%.");
  });

  it("puts a story on a gap only when it is big enough, and keeps each side to its own direction", () => {
    const news = [
      { ticker: "MRVL", tape_line: "ETFs bought $222.6 million of Marvell shares Monday." },
      { ticker: "APP", tape_line: "AppLovin shares rose 61% in a week." },
    ];
    const up = gappers([{ ticker: "MRVL", name: "Marvell Technology Inc.", gap_pct: 8.65 }, { ticker: "ZTS", gap_pct: -1.5 }], "up", news);
    expect(up).toEqual([{ ticker: "MRVL", name: "Marvell Technology", pct: 8.65, price: null, reason: "ETFs bought $222.6 million of Marvell shares Monday." }]);
    const down = gappers([{ ticker: "APP", name: "AppLovin", gap_pct: -1.33 }], "down", news);
    expect(down[0]!.reason).toBeNull();
  });

  it("never pins a gap on a story that went the other way (DELL, Nov 11)", () => {
    const row = [{ ticker: "DELL", name: "Dell Technologies Inc.", gap_pct: 7.2 }];
    expect(gappers(row, "up", [{ ticker: "DELL", tape_line: "Dell fell 12% in a week on AI server margin worries." }])[0]!.reason).toBeNull();
    // A story from a gap the other way is skipped, and the next story for the stock that fits is used.
    const news = [
      { ticker: "DELL", tape_line: "Dell shares slipped on a downgrade.", gap_pct: -3.1 },
      { ticker: "DELL", tape_line: "Dell jumped after it raised its AI server forecast.", gap_pct: 7.2 },
    ];
    expect(gappers(row, "up", news)[0]!.reason).toBe("Dell jumped after it raised its AI server forecast.");
    // A story that names no direction is fine either way.
    expect(gappers(row, "up", [{ ticker: "DELL", tape_line: "Dell signed a $5 billion server deal with xAI." }])[0]!.reason).toBe(
      "Dell signed a $5 billion server deal with xAI.",
    );
    expect(gappers([{ ticker: "DELL", gap_pct: -4 }], "down", [{ ticker: "DELL", tape_line: "Dell rose 9% after earnings." }])[0]!.reason).toBeNull();
    expect(gappers(row, "up", [{ ticker: "DELL", tape_line: "Dell shares are down 5% this month on margin worries." }])[0]!.reason).toBeNull();
  });

  it("builds findings from the cues and the gappers", () => {
    const input = premarketInputFrom(
      { generated_at: GENERATED, global_cues: CUES, news: [] },
      {
        gappers_up: [
          { ticker: "COHR", name: "Coherent Corp.", pre_market_change_pct: 9.29 },
          { ticker: "MRVL", name: "Marvell Technology Inc.", pre_market_change_pct: 8.65 },
          { ticker: "STX", name: "Seagate Technology Holdings plc", pre_market_change_pct: 8.26 },
        ],
        gappers_down: [{ ticker: "ZTS", name: "Zoetis Inc.", pre_market_change_pct: -1.56 }],
        sector_summary: [{ sector: "Technology", count: 26, avg_gap_pct: 3.46 }],
      },
    );
    const read = premarketRead(input, { phase: "live", today: true, note: null })!;
    expect(read.headline).toBe("Futures point to a higher open, led by Nasdaq 100 futures up 1.9%.");
    expect(read.insights.map((insight) => insight.text)).toEqual([
      "Asia and Europe mostly rose overnight, led by KOSPI up 2.54%. Hang Seng was the exception, down 0.98%.",
      "Coherent, Marvell Technology and Seagate Technology lead the early gainers. Technology stocks are up 3.5% on average before the bell.",
      "The selling is light: no stock we follow is down more than 1.6% before the bell.",
    ]);
    expect(read.asOf).toBe(GENERATED);
    const after = premarketRead(input, { phase: "open", today: true, note: null })!;
    expect(after.insights[1]!.text).toBe(
      "Coherent, Marvell Technology and Seagate Technology led the early gainers. Technology stocks were up 3.5% on average before the bell.",
    );
  });

  it("uses the report's own gappers when the movers are from another day", () => {
    const input = premarketInputFrom(
      { generated_at: GENERATED, premarket: { top_gainers: [{ ticker: "COHR", gap_pct: 9.29 }] } },
      { date: "2026-11-10", gappers_up: [{ ticker: "OLD", pre_market_change_pct: 5 }] },
    );
    expect(input.up.map((row) => row.ticker)).toEqual(["COHR"]);
  });

  it("has no read without numbers", () => {
    expect(premarketRead(premarketInputFrom(null, null), { phase: "live", today: true, note: null })).toBeNull();
  });
});
