import { describe, expect, it } from "vitest";

import {
  EPISODES,
  buildStressRead,
  closeOnOrBefore,
  episodeCloses,
  episodeSentence,
  lengthWords,
  ratioShort,
  ratioWords,
  runEpisode,
  runStressTest,
  signedPct,
  weightHoldings,
  windowWords,
  type Episode,
  type EpisodeCloses,
} from "@/lib/stress-test";

const FALL: Episode = { id: "fall", name: "test slide", start: "2022-01-03", end: "2022-01-10", what: "A test.", kind: "fall" };
const RISE: Episode = { id: "rise", name: "test rally", start: "2022-02-01", end: "2022-02-08", what: "A test.", kind: "rise" };

/** Closes for a symbol at the two episodes' edges. */
function closes(points: Record<string, [number, number] | null>, first = "2014-11-10", fund = false): EpisodeCloses {
  const out: EpisodeCloses = { fund, first, last: "2026-11-10", points: {} };
  const eps: Record<string, Episode> = { fall: FALL, rise: RISE };
  for (const [id, pair] of Object.entries(points)) {
    const ep = eps[id]!;
    out.points[id] = pair ? { start: { date: ep.start, close: pair[0] }, end: { date: ep.end, close: pair[1] } } : { start: null, end: null };
  }
  return out;
}

describe("closeOnOrBefore", () => {
  const series = { dates: ["2020-03-18", "2020-03-19", "2020-03-20", "2020-03-23"], closes: [10, 11, 12, 13] };
  it("takes the close on the day", () => {
    expect(closeOnOrBefore(series, "2020-03-19")).toEqual({ date: "2020-03-19", close: 11 });
  });
  it("falls back to the last close before a gap of a few days", () => {
    expect(closeOnOrBefore(series, "2020-03-22")).toEqual({ date: "2020-03-20", close: 12 });
  });
  it("gives nothing before the series starts or after a long gap", () => {
    expect(closeOnOrBefore(series, "2020-03-01")).toBeNull();
    expect(closeOnOrBefore(series, "2020-04-30")).toBeNull();
  });
});

describe("episodeCloses", () => {
  it("marks a stock that listed after an episode began as missing its start", () => {
    const series = { dates: ["2020-09-30", "2020-10-01"], closes: [10, 10.5] };
    const result = episodeCloses(series, EPISODES);
    expect(result.first).toBe("2020-09-30");
    expect(result.points["covid-crash"]).toEqual({ start: null, end: null });
  });
});

describe("weightHoldings", () => {
  it("weights by value and leaves out holdings without one", () => {
    const out = weightHoldings([
      { ticker: "aaa", name: "A", value: 300 },
      { ticker: "BBB", name: "B", value: 100 },
      { ticker: "CCC", name: "C", value: null },
    ]);
    expect(out.basis).toBe("value");
    expect(out.holdings.map((h) => [h.ticker, h.weight])).toEqual([
      ["AAA", 75],
      ["BBB", 25],
    ]);
    expect(out.unvalued).toEqual(["CCC"]);
  });
  it("counts every holding the same when none has a value", () => {
    const out = weightHoldings([
      { ticker: "A", name: "A", value: null },
      { ticker: "B", name: "B", value: 0 },
    ]);
    expect(out.basis).toBe("count");
    expect(out.holdings.map((h) => h.weight)).toEqual([50, 50]);
  });
  it("adds up a ticker listed twice", () => {
    const out = weightHoldings([
      { ticker: "A", name: "A", value: 100 },
      { ticker: "a", name: "A", value: 100 },
      { ticker: "B", name: "B", value: 200 },
    ]);
    expect(out.holdings.map((h) => h.weight)).toEqual([50, 50]);
  });
});

describe("runEpisode", () => {
  const market = closes({ fall: [100, 80], rise: [100, 110] });
  it("weights each holding's return and compares it with the market", () => {
    const map = new Map([
      ["AAA", closes({ fall: [50, 30] })], // -40%
      ["BBB", closes({ fall: [10, 9] })], // -10%
    ]);
    const result = runEpisode(FALL, [
      { ticker: "AAA", name: "Alpha", weight: 50 },
      { ticker: "BBB", name: "Beta", weight: 50 },
    ], map, market);
    expect(result.portfolio).toBeCloseTo(-25, 6);
    expect(result.market).toBeCloseTo(-20, 6);
    expect(result.ratio).toBeCloseTo(1.25, 3);
    expect(result.covered).toBe(100);
    expect(result.worst?.ticker).toBe("AAA");
    expect(result.best?.ticker).toBe("BBB");
    expect(result.driver?.ticker).toBe("AAA");
    expect(ratioWords(result)).toBe("fell about 1.3 times as much as the S&P 500");
  });

  it("lists a holding that was not trading yet and never fills it with the index", () => {
    const map = new Map([
      ["OLD", closes({ fall: [100, 90] })],
      ["NEW", closes({ fall: null }, "2023-06-01")],
    ]);
    const result = runEpisode(FALL, [
      { ticker: "OLD", name: "Old Co", weight: 80 },
      { ticker: "NEW", name: "New Co", weight: 20 },
    ], map, market);
    expect(result.covered).toBe(80);
    // The covered 80% is reweighted to the whole: -10%, not -10% x 0.8 + index x 0.2.
    expect(result.portfolio).toBeCloseTo(-10, 6);
    const missing = result.moves.find((move) => move.ticker === "NEW")!;
    expect(missing.status).toBe("not-yet");
    expect(missing.pct).toBeNull();
    expect(result.moves.at(-1)?.ticker).toBe("NEW");
    expect(episodeSentence(result)).toContain("New Co was not trading yet, so this covers the other 80% of the portfolio");
  });

  it("gives no portfolio figure when less than half of it was trading", () => {
    const map = new Map([["OLD", closes({ fall: [100, 90] })]]);
    const result = runEpisode(FALL, [
      { ticker: "OLD", name: "Old Co", weight: 30 },
      { ticker: "GONE", name: "Gone Co", weight: 70 },
    ], map, market);
    expect(result.portfolio).toBeNull();
    expect(result.ratio).toBeNull();
    expect(result.moves.find((move) => move.ticker === "GONE")?.status).toBe("no-history");
    expect(episodeSentence(result)).toBe("Only 30% of this portfolio had prices for these dates, too little to give a figure for the whole.");
  });

  it("names the fund that did the most damage, and the single stock behind it", () => {
    const map = new Map([
      ["VOO", closes({ fall: [100, 80] }, "2014-11-10", true)], // -20% at 70%: -14 points
      ["XOM", closes({ fall: [100, 70] })], // -30% at 30%: -9 points
    ]);
    const result = runEpisode(FALL, [
      { ticker: "VOO", name: "Vanguard S&P 500 ETF", weight: 70 },
      { ticker: "XOM", name: "Exxon Mobil", weight: 30 },
    ], map, market);
    expect(result.driver?.ticker).toBe("VOO");
    expect(result.stockDriver?.ticker).toBe("XOM");
    expect(episodeSentence(result)).toBe("Lost 23% while the S&P 500 fell 20%; of the single stocks, Exxon Mobil did the most damage, down 30%.");
  });

  it("calls a series that starts with the stored history missing prices, not 'not trading yet'", () => {
    const bench = { ...closes({ fall: null }, "2022-01-05") };
    const map = new Map([["AAPL", closes({ fall: null }, "2022-01-05")]]);
    const result = runEpisode(FALL, [{ ticker: "AAPL", name: "Apple", weight: 100 }], map, bench);
    expect(result.moves[0]!.status).toBe("no-history");
    expect(episodeSentence(result)).toBe("We have no prices around these dates for these holdings.");
    // The whole episode is out of reach of the S&P 500 series, so the test leaves it out.
    expect(runStressTest(weightHoldings([{ ticker: "AAPL", name: "Apple", value: 1 }]), map, bench, [FALL, RISE]).episodes.map((e) => e.episode.id)).toEqual(["rise"]);
  });

  it("never shows 'covers 100%' while a tiny holding is missing, and keeps 49.6% under half", () => {
    const map = new Map([
      ["A", closes({ fall: [100, 90] })],
      ["EBAY", closes({ fall: null }, "2023-01-01")],
    ]);
    const tiny = runEpisode(FALL, [
      { ticker: "A", name: "A", weight: 99.7 },
      { ticker: "EBAY", name: "eBay", weight: 0.3 },
    ], map, market);
    // "eBay" keeps its lower-case first letter at the start of a sentence.
    expect(episodeSentence(tiny)).toContain(" eBay was not trading yet");
    expect(episodeSentence(tiny)).toContain("covers the other 99% of the portfolio");
    const half = runEpisode(FALL, [
      { ticker: "A", name: "A", weight: 49.6 },
      { ticker: "B", name: "B", weight: 50.4 },
    ], map, market);
    expect(half.portfolio).toBeNull();
    expect(episodeSentence(half, "your portfolio")).toMatch(/^Only 49% of your portfolio had prices/);
  });

  it("skips the ratio when the market barely moved", () => {
    const flat = closes({ fall: [100, 99] });
    const map = new Map([["A", closes({ fall: [100, 97] })]]);
    const result = runEpisode(FALL, [{ ticker: "A", name: "A", weight: 100 }], map, flat);
    expect(result.ratio).toBeNull();
    expect(ratioShort(result)).toBeNull();
  });
});

describe("ratio words", () => {
  it("covers holding up, falling as much and rising in a fall", () => {
    expect(ratioWords({ portfolio: -10, market: -20, ratio: 0.5 })).toBe("fell about half as much as the S&P 500");
    expect(ratioWords({ portfolio: -19, market: -20, ratio: 0.95 })).toBe("fell about as much as the S&P 500");
    expect(ratioWords({ portfolio: 3, market: -20, ratio: -0.15 })).toBe("rose while the S&P 500 fell");
    expect(ratioWords({ portfolio: -14, market: -20, ratio: 0.7 })).toBe("fell about 70% as much as the S&P 500");
    expect(ratioWords({ portfolio: -1, market: -20, ratio: 0.05 })).toBe("barely fell while the S&P 500 fell 20%");
    expect(ratioShort({ portfolio: -28, market: -20, ratio: 1.4 })).toBe("1.4× the S&P's move");
    expect(ratioWords({ portfolio: -40, market: -20, ratio: 2 })).toBe("fell about twice as much as the S&P 500");
    expect(ratioWords({ portfolio: -60, market: -20, ratio: 3 })).toBe("fell about 3 times as much as the S&P 500");
    // A flat portfolio is flat, whichever way the market went.
    expect(ratioShort({ portfolio: 0.02, market: 52, ratio: 0.0004 })).toBe("Flat, S&P rose");
    expect(ratioWords({ portfolio: 0.02, market: 52, ratio: 0.0004 })).toBe("was flat while the S&P 500 rose 52%");
  });
});

describe("buildStressRead", () => {
  const market = closes({ fall: [100, 75], rise: [100, 120] });
  const map = new Map([
    ["NVDA", closes({ fall: [100, 50], rise: [100, 160] })],
    ["XOM", closes({ fall: [100, 90], rise: [100, 105] })],
  ]);
  const input = weightHoldings([
    { ticker: "NVDA", name: "NVIDIA", value: 600 },
    { ticker: "XOM", name: "Exxon Mobil", value: 400 },
  ]);
  const result = runStressTest(input, map, market, [FALL, RISE]);

  it("leads with the worst episode and the stock that did the most damage", () => {
    const read = buildStressRead(result, { example: true })!;
    expect(read.headline).toBe("In the test slide this portfolio would have lost 34%, against 25% for the S&P 500; NVIDIA did the most damage, down 50%.");
    expect(read.headlineTickers).toEqual(["NVDA"]);
  });

  it("speaks to the signed-in person as 'your portfolio' and includes the rally", () => {
    const read = buildStressRead(result, { example: false })!;
    expect(read.headline.startsWith("In the test slide your portfolio would have lost 34%")).toBe(true);
    const rise = read.insights.find((insight) => insight.id === "rise-rise");
    expect(rise?.text).toBe("In the test rally it would have gained 38%, against 20% for the S&P 500, led by NVIDIA, up 60%.");
  });

  it("says which part of the portfolio the headline covers, and why the rest is missing", () => {
    const partial = new Map([
      ...map,
      ["PLTR", closes({ fall: null, rise: null }, "2023-01-01")],
      ["ARKK", { fund: true, first: null, last: null, points: {} } as EpisodeCloses],
    ]);
    const weighted = weightHoldings([
      { ticker: "NVDA", name: "NVIDIA", value: 600 },
      { ticker: "XOM", name: "Exxon Mobil", value: 200 },
      { ticker: "PLTR", name: "Palantir", value: 100 },
      { ticker: "ARKK", name: "ARK Innovation", value: 100 },
    ]);
    const out = runStressTest(weighted, partial, market, [FALL, RISE]);
    const read = buildStressRead(out, { example: false })!;
    expect(read.headline.startsWith("In the test slide the 80% of your portfolio we have prices for would have lost")).toBe(true);
    expect(episodeSentence(out.episodes[0]!)).toContain(
      "Palantir was not trading yet and we have no prices around these dates for ARK Innovation, so this covers the other 80% of the portfolio.",
    );
  });

  it("does not contradict itself for a portfolio that rose in every sell-off", () => {
    const FALL2: Episode = { ...FALL, id: "fall2", name: "second slide" };
    const m = { ...closes({ fall: [100, 80] }), points: { fall: { start: { date: FALL.start, close: 100 }, end: { date: FALL.end, close: 80 } }, fall2: { start: { date: FALL.start, close: 100 }, end: { date: FALL.end, close: 90 } } } };
    const gold = { ...closes({ fall: [100, 105] }), points: { fall: { start: { date: FALL.start, close: 100 }, end: { date: FALL.end, close: 105 } }, fall2: { start: { date: FALL.start, close: 100 }, end: { date: FALL.end, close: 102 } } } };
    const out = runStressTest(weightHoldings([{ ticker: "GLD", name: "Gold", value: 1 }]), new Map([["GLD", gold]]), m, [FALL, FALL2]);
    const read = buildStressRead(out, { example: true })!;
    expect(read.headline).toBe("This portfolio did not lose money in any of the two sell-offs; in the test slide it would have gained 5% while the S&P 500 fell 20%.");
    expect(read.insights[0]!.text).toBe("Across the two sell-offs, this portfolio rose while the S&P 500 fell, and it did better than the market in every one of them.");
  });

  it("returns nothing when no episode can be measured", () => {
    const empty = runStressTest(weightHoldings([{ ticker: "ZZZ", name: "Z", value: 1 }]), new Map(), market, [FALL]);
    expect(buildStressRead(empty, { example: true })).toBeNull();
  });
});

describe("formatting", () => {
  it("writes windows, lengths and signed percentages", () => {
    expect(windowWords("2020-02-19", "2020-03-23")).toBe("Feb 19 to Mar 23, 2020");
    expect(windowWords("2025-04-02", "2025-04-08")).toBe("Apr 2 to 8, 2025");
    expect(windowWords("2018-12-20", "2019-01-04")).toBe("Dec 20, 2018 to Jan 4, 2019");
    expect(lengthWords("2025-04-02", "2025-04-08")).toBe("6 days");
    expect(lengthWords("2020-02-19", "2020-03-23")).toBe("5 weeks");
    expect(lengthWords("2022-01-03", "2022-10-12")).toBe("9 months");
    expect(signedPct(-31.4)).toBe("−31%");
    expect(signedPct(-3.44)).toBe("−3.4%");
    expect(signedPct(2)).toBe("+2%");
    expect(signedPct(null)).toBe("n/a");
  });

  it("keeps every episode inside the stored history and in order", () => {
    for (const episode of EPISODES) {
      expect(episode.start >= "2014-11-10").toBe(true);
      expect(episode.end > episode.start).toBe(true);
    }
  });
});
