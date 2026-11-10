import { describe, expect, it } from "vitest";

import {
  beatShare,
  callShift,
  historyJudged,
  judge,
  markFor,
  moodWord,
  multipleVsHistory,
  multipleVsSector,
  netFlow,
  priceVsTarget,
  rsiWord,
  scoreVerdict,
  sentenceOutcome,
  spreadWord,
  surprise,
  surpriseFrom,
  toneFor,
  fedMoveWord,
  netSide,
  vixWord,
  volCurveWord,
  yieldCurveWord,
} from "./tone";

describe("judge", () => {
  it("reads higher-is-better figures at the edges", () => {
    expect(judge(40, 40, 15)).toBe("up");
    expect(judge(39.9, 40, 15)).toBe("flat");
    expect(judge(15, 40, 15)).toBe("flat");
    expect(judge(14.9, 40, 15)).toBe("down");
  });

  it("reads lower-is-better figures at the edges", () => {
    expect(judge(0.5, 0.5, 2, true)).toBe("up");
    expect(judge(2, 0.5, 2, true)).toBe("flat");
    expect(judge(2.01, 0.5, 2, true)).toBe("down");
  });
});

describe("toneFor", () => {
  it("is null for missing figures", () => {
    expect(toneFor("roe", null)).toBeNull();
    expect(toneFor("roe", undefined)).toBeNull();
    expect(toneFor("roe", Number.NaN)).toBeNull();
  });

  it("matches the overview thresholds", () => {
    expect(toneFor("grossMargin", 45)).toBe("up");
    expect(toneFor("grossMargin", 10)).toBe("down");
    expect(toneFor("operatingMargin", -1)).toBe("down");
    expect(toneFor("operatingMargin", 0)).toBe("flat");
    expect(toneFor("roic", 10)).toBe("up");
    expect(toneFor("debtToEquity", 3)).toBe("down");
    // Negative equity is not "low debt".
    expect(toneFor("debtToEquity", -1.4)).toBe("down");
    expect(toneFor("debtToEquity", 0)).toBe("up");
    expect(toneFor("currentRatio", 0.9)).toBe("down");
    expect(toneFor("revenueGrowth", 8)).toBe("up");
    expect(toneFor("revenueGrowth", 0)).toBe("flat");
    expect(toneFor("revenueGrowth", -0.6)).toBe("down");
  });

  it("judges drawdown on its size, whatever the sign", () => {
    expect(toneFor("drawdown", -35)).toBe("down");
    expect(toneFor("drawdown", 35)).toBe("down");
    expect(toneFor("drawdown", -10)).toBe("up");
    expect(toneFor("drawdown", -20)).toBe("flat");
  });

  it("reads beta and concentration as lower is better", () => {
    expect(toneFor("beta", 1.5)).toBe("down");
    expect(toneFor("beta", 0.7)).toBe("up");
    expect(toneFor("topWeight", 30)).toBe("down");
    expect(toneFor("topWeight", 10)).toBe("up");
  });
});

describe("markFor", () => {
  it("drops neutral so no gray mark sits beside a number", () => {
    expect(markFor("roe", 20)).toBe("up");
    expect(markFor("roe", 5)).toBeUndefined();
    expect(markFor("roe", -1)).toBe("down");
    expect(markFor("roe", null)).toBeUndefined();
  });
});

describe("verdict words", () => {
  it("reads multiples against the sector", () => {
    expect(multipleVsSector(-25)).toEqual({ tone: "up", word: "Cheap vs sector" });
    expect(multipleVsSector(40)).toEqual({ tone: "down", word: "Pricey vs sector" });
    expect(multipleVsSector(5)?.tone).toBe("flat");
    expect(multipleVsSector(null)).toBeNull();
  });

  it("reads multiples against their own history", () => {
    expect(multipleVsHistory(10)?.word).toBe("Cheap vs history");
    expect(multipleVsHistory(90)?.word).toBe("Pricey vs history");
    expect(multipleVsHistory(50)?.tone).toBe("flat");
  });

  it("reads the price against the analyst target", () => {
    expect(priceVsTarget(20)).toEqual({ tone: "up", word: "Below target" });
    expect(priceVsTarget(-8)).toEqual({ tone: "down", word: "Above target" });
    expect(priceVsTarget(2)?.word).toBe("At target");
  });

  it("reads earnings surprises", () => {
    expect(surprise(3)?.word).toBe("Beat");
    expect(surprise(-3)?.word).toBe("Missed");
    expect(surprise(0.2)?.word).toBe("In line");
    // Same 1% line as the stored backend labels, so the stock page and the calendar agree.
    expect(surprise(0.8)?.word).toBe("In line");
    expect(surprise(1)?.word).toBe("Beat");
    expect(surprise(-1)?.word).toBe("Missed");
    expect(surpriseFrom(1.1, 1)?.word).toBe("Beat");
    expect(surpriseFrom(-0.5, -0.4)?.word).toBe("Missed");
    expect(surpriseFrom(1, 0)).toBeNull();
  });

  it("reads net buying and selling", () => {
    expect(netFlow(3, 1, "Insiders")).toEqual({ tone: "up", word: "Insiders buying" });
    expect(netFlow(0, 4, "Insiders")).toEqual({ tone: "down", word: "Insiders selling" });
    expect(netFlow(2, 2, "Congress")?.tone).toBe("flat");
    // Same 10% band as netSide: 10.5 against 9.5 is a wash, not "buying".
    expect(netFlow(10.5, 9.5, "Funds")).toEqual({ tone: "flat", word: "Mixed" });
    expect(netFlow(12, 8, "Funds")?.word).toBe("Funds buying");
    expect(netFlow(0, 0, "Funds")).toBeNull();
  });

  it("tones the scoring model's verdict words", () => {
    expect(scoreVerdict("strong")).toBe("up");
    expect(scoreVerdict("Solid")).toBe("up");
    expect(scoreVerdict("mixed")).toBe("flat");
    expect(scoreVerdict("weak")).toBe("down");
    expect(scoreVerdict("insufficient data")).toBeNull();
  });

  it("puts the score number on the same bands as the verdict words", () => {
    expect(toneFor("score", 55)).toBe(scoreVerdict("solid"));
    expect(toneFor("score", 54)).toBe(scoreVerdict("mixed"));
    expect(toneFor("score", 35)).toBe(scoreVerdict("mixed"));
    expect(toneFor("score", 34)).toBe(scoreVerdict("weak"));
  });

  it("keeps RSI neutral in both directions", () => {
    expect(rsiWord(75)).toEqual({ tone: "flat", word: "Overbought" });
    expect(rsiWord(25)).toEqual({ tone: "flat", word: "Oversold" });
    expect(rsiWord(50)?.word).toBe("Normal");
    expect(rsiWord(120)).toBeNull();
  });

  it("reads moods", () => {
    expect(moodWord("bullish")?.tone).toBe("up");
    expect(moodWord("Bearish")?.tone).toBe("down");
    expect(moodWord("neutral")?.tone).toBe("flat");
    expect(moodWord("")).toBeNull();
  });
});

describe("beatShare", () => {
  it("calls six in ten up and four in ten down", () => {
    expect(beatShare(6, 10)).toBe("up");
    expect(beatShare(5, 10)).toBe("flat");
    expect(beatShare(4, 10)).toBe("down");
    expect(beatShare(3, 3)).toBe("up");
  });

  it("does not call too few years or bad input", () => {
    expect(beatShare(2, 2)).toBeNull();
    expect(beatShare(null, 10)).toBeNull();
    expect(beatShare(11, 10)).toBeNull();
  });
});

describe("portfolio and call helpers", () => {
  it("marks spread and relative volatility in line with top weight and beta", () => {
    expect(toneFor("effectivePositions", 3)).toBe("down");
    expect(toneFor("effectivePositions", 5)).toBe("flat");
    expect(markFor("effectivePositions", 8)).toBe("up");
    expect(markFor("relativeVolatility", 1.5)).toBe("down");
    expect(markFor("relativeVolatility", 1)).toBeUndefined();
    expect(markFor("relativeVolatility", 0.7)).toBe("up");
    // The strategy backtests' "Smaller swings" / "Bigger swings" cut.
    expect(markFor("relativeVolatility", 0.85)).toBe("up");
    expect(markFor("relativeVolatility", 1.15)).toBeUndefined();
    expect(markFor("relativeVolatility", 1.16)).toBe("down");
  });

  it("says how spread a portfolio is", () => {
    expect(spreadWord(82)).toEqual({ tone: "up", word: "Spread out" });
    expect(spreadWord(55)).toEqual({ tone: "flat", word: "Moderate" });
    expect(spreadWord(20)).toEqual({ tone: "down", word: "Concentrated" });
    expect(spreadWord(null)).toBeNull();
  });

  it("reads a call change as upgraded or downgraded", () => {
    expect(callShift("trim", "Accumulate")).toEqual({ tone: "up", word: "Upgraded" });
    expect(callShift("Hold", "trim")).toEqual({ tone: "down", word: "Downgraded" });
    expect(callShift("hold", "watch")).toBeNull();
    expect(callShift("", "hold")).toBeNull();
  });
});

describe("flow and market words", () => {
  it("reads a filing as net buyer, net seller or mixed", () => {
    expect(netSide(5_000_000, 1_000_000)).toEqual({ tone: "up", word: "Net buyer" });
    expect(netSide(1, 4)).toEqual({ tone: "down", word: "Net seller" });
    expect(netSide(100, 95)).toEqual({ tone: "flat", word: "Mixed" });
    expect(netSide(1, 0)).toEqual({ tone: "up", word: "Net buyer" });
    expect(netSide(0, 0)).toBeNull();
    expect(netSide(null, undefined)).toBeNull();
    expect(netSide(-5, 3)).toEqual({ tone: "down", word: "Net seller" });
  });

  it("names the yield curve shape on the same cut as the reading", () => {
    expect(yieldCurveWord(-1)).toEqual({ tone: "down", word: "Inverted" });
    expect(yieldCurveWord(0)).toEqual({ tone: "flat", word: "Flat" });
    expect(yieldCurveWord(9)).toEqual({ tone: "flat", word: "Flat" });
    expect(yieldCurveWord(10)).toEqual({ tone: "up", word: "Normal" });
    expect(yieldCurveWord(null)).toBeNull();
  });

  it("reads the volatility curve and the VIX", () => {
    expect(volCurveWord(22, 20)).toEqual({ tone: "down", word: "Stressed" });
    expect(volCurveWord(19.9, 20.9)).toEqual({ tone: "flat", word: "Usual shape" });
    expect(volCurveWord(20, 20)).toEqual({ tone: "flat", word: "Usual shape" });
    expect(volCurveWord(null, 20)).toBeNull();
    expect(vixWord(14)).toEqual({ tone: "up", word: "Calm" });
    expect(vixWord(19.9)).toEqual({ tone: "flat", word: "Average" });
    expect(vixWord(25)).toEqual({ tone: "down", word: "Stressed" });
    expect(vixWord(0)).toBeNull();
  });

  it("reads a Fed outcome as a headwind or tailwind for stocks", () => {
    expect(fedMoveWord("Hike 25bps")).toEqual({ tone: "down", word: "Headwind" });
    expect(fedMoveWord("Cut 50+bps")).toEqual({ tone: "up", word: "Tailwind" });
    expect(fedMoveWord("No change")).toEqual({ tone: "flat", word: "No change" });
    expect(fedMoveWord("Fed maintains rate")).toEqual({ tone: "flat", word: "No change" });
    expect(fedMoveWord("No cuts in 2026")).toEqual({ tone: "flat", word: "No change" });
    expect(fedMoveWord("0 hikes")).toEqual({ tone: "flat", word: "No change" });
    expect(fedMoveWord("Kevin Lowery")).toBeNull();
    expect(fedMoveWord("Cutler")).toBeNull();
    expect(fedMoveWord("Threshold reached")).toBeNull();
    expect(fedMoveWord("")).toBeNull();
  });
});

describe("sentenceOutcome", () => {
  it("reads a one-way results line", () => {
    expect(sentenceOutcome("EPS of $1.20 beat the $1.10 consensus.", "results")).toEqual({ tone: "up", word: "Beat" });
    expect(sentenceOutcome("Revenue came in below expectations at $4.1B.", "results")).toEqual({ tone: "down", word: "Missed" });
    expect(sentenceOutcome("Results were in line with the Street.", "results")?.word).toBe("In line");
  });

  it("stays quiet when the line points both ways or is negated", () => {
    expect(sentenceOutcome("EPS beat, but revenue missed estimates.", "results")).toBeNull();
    expect(sentenceOutcome("The company did not beat estimates.", "results")).toBeNull();
    expect(sentenceOutcome("", "results")).toBeNull();
    expect(sentenceOutcome("Revenue was $10B.", "results")).toBeNull();
    expect(sentenceOutcome("The mission-critical unit grew.", "results")).toBeNull();
    expect(sentenceOutcome("EPS didn't beat estimates.", "results")).toBeNull();
    expect(sentenceOutcome("Shares rose ahead of the earnings report.", "results")).toBeNull();
    expect(sentenceOutcome("Revenue came in ahead of expectations.", "results")?.word).toBe("Beat");
  });

  it("reads guidance", () => {
    expect(sentenceOutcome("Management raised full-year revenue guidance.", "guidance")?.word).toBe("Raised");
    expect(sentenceOutcome("It cut its outlook for the year.", "guidance")?.word).toBe("Cut");
    expect(sentenceOutcome("Guidance was reaffirmed.", "guidance")?.word).toBe("Kept");
    expect(sentenceOutcome("Raised the low end of guidance but lowered the top.", "guidance")).toBeNull();
    // Verbs only count in a line about the outlook.
    expect(sentenceOutcome("The company increased spending on data centres.", "guidance")).toBeNull();
    expect(sentenceOutcome("It cut costs by 8%.", "guidance")).toBeNull();
    expect(sentenceOutcome("Management did not raise its outlook.", "guidance")).toBeNull();
  });
});

describe("historyJudged", () => {
  it("needs a year of history that is still current", () => {
    expect(historyJudged("2025-01-01", "2026-11-01", "2026-11-10")).toBe(true);
    expect(historyJudged("2026-04-23", "2026-07-23", "2026-11-10")).toBe(false);
    expect(historyJudged("2024-01-01", "2026-07-23", "2026-11-10")).toBe(false);
    expect(historyJudged(null, "2026-11-01", "2026-11-10")).toBe(false);
    expect(historyJudged("garbage", "2026-11-01", "2026-11-10")).toBe(false);
  });
});
