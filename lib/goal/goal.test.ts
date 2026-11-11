import { describe, expect, it } from "vitest";

import {
  INFLATION,
  bands,
  chanceAt,
  monthlyForChance,
  quantile,
  replay,
  roundUpMonthly,
  seeded,
  yearsForChance,
  yearlyOf,
} from "@/lib/goal/bootstrap";
import { DEFAULTS, inputProblem, inputsQuery, parseAmount, readInputs, type GoalInputs } from "@/lib/goal/inputs";
import { planOutcome } from "@/lib/goal/plan";
import { DISCOUNT_SENTENCE, buildGoalRead, driverOf, headline, moneyWords } from "@/lib/goal/read";
import { buildMix, discounted, monthlyReturns, type PartHistory } from "@/lib/goal/series";

const inputs = (patch: Partial<GoalInputs> = {}): GoalInputs => ({ ...DEFAULTS, start: 100_000, mix: "own", ...patch });

describe("monthlyReturns", () => {
  it("uses each month's last close and skips the month still running", () => {
    const series = {
      dates: ["2024-01-02", "2024-01-31", "2024-02-15", "2024-02-29", "2024-03-28", "2024-04-05"],
      closes: [90, 100, 999, 110, 99, 120],
    };
    const out = monthlyReturns(series, "2024-04-10");
    expect([...out.keys()]).toEqual(["2024-02", "2024-03"]);
    expect(out.get("2024-02")).toBeCloseTo(0.1, 10);
    expect(out.get("2024-03")).toBeCloseTo(-0.1, 10);
  });

  it("needs the month right before, across a year end too", () => {
    const series = { dates: ["2023-11-30", "2023-12-29", "2024-01-31", "2024-03-29"], closes: [100, 105, 110, 121] };
    const out = monthlyReturns(series, "2024-06-01");
    expect(out.get("2023-12")).toBeCloseTo(0.05, 10);
    expect(out.get("2024-01")).toBeCloseTo(110 / 105 - 1, 10);
    expect(out.has("2024-03")).toBe(false); // February is missing
  });

  it("ignores bad closes", () => {
    const out = monthlyReturns({ dates: ["2024-01-31", "2024-02-29", "2024-03-29"], closes: [100, Number.NaN, 0] }, "2024-05-01");
    expect(out.size).toBe(0);
  });
});

describe("buildMix", () => {
  const months = ["2020-01", "2020-02", "2020-03", "2020-04"];
  const bench = new Map(months.map((month) => [month, 0.01]));

  it("weights the parts and fills missing months with the benchmark", () => {
    const young = new Map([
      ["2020-03", 0.1],
      ["2020-04", 0.1],
    ]);
    const mix = buildMix(bench, [
      { ticker: "OLD", name: "Old", weight: 3, fund: false, returns: new Map(months.map((month) => [month, 0.02])) },
      { ticker: "NEW", name: "New", weight: 1, fund: false, returns: young },
    ])!;
    expect(mix.months).toEqual(months);
    expect(mix.returns[0]).toBeCloseTo(0.75 * 0.02 + 0.25 * 0.01, 12);
    expect(mix.returns[3]).toBeCloseTo(0.75 * 0.02 + 0.25 * 0.1, 12);
    const young1 = mix.parts.find((part) => part.ticker === "NEW")!;
    expect(young1).toMatchObject({ first: "2020-03", last: "2020-04", own: 2, filled: 2, weight: 0.25 });
    expect(mix.filledShare).toBeCloseTo(0.25 * 0.5, 12);
  });

  it("uses the benchmark throughout for a part with no prices", () => {
    const mix = buildMix(bench, [{ ticker: "X", name: "X", weight: 1, fund: false, returns: null }])!;
    expect(mix.returns).toEqual([0.01, 0.01, 0.01, 0.01]);
    expect(mix.parts[0]).toMatchObject({ own: 0, filled: 4, first: null });
  });

  it("returns null with nothing to mix", () => {
    expect(buildMix(new Map(), [{ ticker: "X", name: "X", weight: 1, fund: false, returns: null }])).toBeNull();
    expect(buildMix(bench, [{ ticker: "X", name: "X", weight: 0, fund: false, returns: null }])).toBeNull();
  });

  it("counts only part of the lead over the benchmark", () => {
    expect(discounted([0.05, -0.02, 0.01], [0.01, 0.0, 0.01], 0.5)).toEqual([0.03, -0.01, 0.01]);
    expect(discounted([0.05], [0.01], 1)).toEqual([0.05]);
    expect(discounted([0.05], [0.01], 0)).toEqual([0.01]);
  });

  it("splits the average gain between the parts", () => {
    const long = Array.from({ length: 24 }, (_, i) => `20${20 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    const b = new Map(long.map((month) => [month, 0.01]));
    const mix = buildMix(b, [
      { ticker: "A", name: "A", weight: 1, fund: false, returns: new Map(long.map((month) => [month, 0.03])) },
      { ticker: "B", name: "B", weight: 1, fund: false, returns: new Map(long.map((month) => [month, 0.01])) },
    ])!;
    const shares = mix.parts.map((part) => part.driveShare!);
    expect(shares[0]).toBeCloseTo(0.75, 10);
    expect(shares[0]! + shares[1]!).toBeCloseTo(1, 10);
  });
});

describe("replay", () => {
  it("is the same every time (fixed seed)", () => {
    const returns = Array.from({ length: 60 }, (_, i) => Math.sin(i) / 20);
    const a = replay(returns, { paths: 50, years: 10 });
    const b = replay(returns, { paths: 50, years: 10 });
    expect(Array.from(a.growth)).toEqual(Array.from(b.growth));
    expect(Array.from(a.saved)).toEqual(Array.from(b.saved));
  });

  it("compounds a steady return exactly, with money added at the end of each month", () => {
    const r = 0.01;
    const rep = replay(new Array(24).fill(r), { paths: 3, years: 2 });
    const stride = rep.years + 1;
    expect(rep.growth[stride + 1]).toBeCloseTo((1 + r) ** 12, 10);
    expect(rep.growth[stride + 2]).toBeCloseTo((1 + r) ** 24, 10);
    // An ordinary annuity: ((1 + r)^n - 1) / r.
    expect(rep.saved[2]).toBeCloseTo(((1 + r) ** 24 - 1) / r, 8);
    expect(rep.saved[0]).toBe(0);
  });

  it("keeps 12-month stretches together: a single crash month hits a calendar year at most once", () => {
    const returns = new Array(30).fill(0);
    returns[7] = -0.5;
    const rep = replay(returns, { paths: 200, years: 8 });
    const stride = rep.years + 1;
    for (let p = 0; p < rep.paths; p++) {
      for (let y = 1; y <= rep.years; y++) {
        const yearGrowth = rep.growth[p * stride + y]! / rep.growth[p * stride + y - 1]!;
        expect([1, 0.5]).toContain(Number(yearGrowth.toFixed(12)));
      }
    }
  });

  it("takes inflation off every month in today's money", () => {
    const rep = replay(new Array(12).fill(0), { paths: 1, years: 1, inflation: INFLATION });
    expect(rep.growth[1]).toBeCloseTo(1 / (1 + INFLATION), 10);
  });

  it("draws the same stretches for two series of the same length", () => {
    const up = Array.from({ length: 40 }, (_, i) => (i === 3 ? 0.5 : 0));
    const twice = up.map((value) => value * 2);
    const a = replay(up, { paths: 100, years: 5 });
    const b = replay(twice, { paths: 100, years: 5 });
    for (let i = 0; i < a.growth.length; i++) expect(a.growth[i]! > 1).toBe(b.growth[i]! > 1);
  });

  it("handles an empty series", () => {
    const rep = replay([], { paths: 2, years: 3 });
    expect(rep.growth[0]).toBe(1);
    expect(rep.saved[3]).toBe(0);
  });
});

describe("chances and levers", () => {
  const returns = Array.from({ length: 143 }, (_, i) => 0.008 + Math.sin(i * 1.7) * 0.05);
  const rep = replay(returns, { paths: 1000, years: 40 });

  it("solves the monthly amount for a chance exactly", () => {
    const target = 1_000_000;
    const needed = monthlyForChance(rep, 20, 50_000, target, 0.5)!;
    expect(needed).toBeGreaterThan(0);
    expect(chanceAt(rep, 20, 50_000, needed, target)).toBeGreaterThanOrEqual(0.5);
    expect(chanceAt(rep, 20, 50_000, needed * 0.98, target)).toBeLessThan(0.5);
  });

  it("needs nothing when the start already gets there", () => {
    expect(monthlyForChance(rep, 20, 10_000_000, 1_000_000, 0.75)).toBe(0);
  });

  it("finds the first year a chance is reached", () => {
    const year = yearsForChance(rep, 50_000, 500, 1_000_000, 0.5)!;
    expect(chanceAt(rep, year, 50_000, 500, 1_000_000)).toBeGreaterThanOrEqual(0.5);
    expect(chanceAt(rep, year - 1, 50_000, 500, 1_000_000)).toBeLessThan(0.5);
  });

  it("orders the bands", () => {
    for (const band of bands(rep, 15, 20_000, 300)) {
      expect(band.p10).toBeLessThanOrEqual(band.p25);
      expect(band.p25).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p75);
      expect(band.p75).toBeLessThanOrEqual(band.p90);
    }
  });

  it("offers more a month below an even chance, and time when it is likely", () => {
    const low = planOutcome(rep, inputs({ start: 10_000, monthly: 100, age: 40, byAge: 55, real: false }), null);
    expect(low.chance).toBeLessThan(0.5);
    const more = low.levers.find((lever) => lever.kind === "more");
    expect(more).toMatchObject({ kind: "more", q: 0.5 });
    if (more?.kind === "more") expect(chanceAt(rep, 15, 10_000, more.monthly, 1_000_000)).toBeGreaterThanOrEqual(0.5);

    const old = planOutcome(rep, inputs({ start: 1_000, monthly: 10, age: 85, byAge: 95, target: 5_000_000, real: false }), null);
    expect(old.levers.some((lever) => lever.kind === "later")).toBe(false);
    expect(planOutcome(rep, inputs({ start: 2_000_000 }), null).levers).toEqual([]);

    const high = planOutcome(rep, inputs({ start: 900_000, monthly: 2000, age: 40, byAge: 60 }), null);
    expect(high.chance).toBeGreaterThanOrEqual(0.75);
    expect(high.levers.some((lever) => lever.kind === "earlier" || lever.kind === "less")).toBe(true);
  });
});

describe("small helpers", () => {
  it("rounds monthly amounts up to typed figures", () => {
    expect(roundUpMonthly(0)).toBe(0);
    expect(roundUpMonthly(301)).toBe(310);
    expect(roundUpMonthly(300)).toBe(300);
    expect(roundUpMonthly(1234)).toBe(1250);
    expect(roundUpMonthly(12_301)).toBe(12_400);
  });

  it("interpolates percentiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 12);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  it("gives a steady yearly figure", () => {
    expect(yearlyOf(new Array(24).fill(0.01))).toBeCloseTo(1.01 ** 12 - 1, 10);
    expect(yearlyOf([0.1])).toBeNull();
  });

  it("draws in [0, 1)", () => {
    const rng = seeded(1);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("words", () => {
  it("never rounds money up to the goal", () => {
    expect(moneyWords(999_600)).toBe("$999,000");
    expect(moneyWords(1_000_000)).toBe("$1 million");
    expect(moneyWords(1_239_999)).toBe("$1.23 million");
    expect(moneyWords(612_345)).toBe("$612,000");
    expect(moneyWords(1_500_000_000)).toBe("$1.5 billion");
    expect(moneyWords(512.7)).toBe("$512");
  });

  const end = { year: 20, p10: 610_000, p25: 800_000, p50: 1_010_000, p75: 1_300_000, p90: 1_700_000 };
  const outcome = (chance: number) => ({ years: 20, bands: [end], end, chance, putIn: 220_000, levers: [], benchmark: null });

  it("says the chance in words", () => {
    expect(headline(outcome(0.5), inputs(), "this portfolio")).toBe("This portfolio reaches $1 million by 55 in about half of the replays.");
    expect(headline(outcome(0.7), inputs(), "your portfolio")).toBe("Your portfolio reaches $1 million by 55 in about 7 of 10 replays.");
    expect(headline(outcome(0.97), inputs(), "x")).toContain("in almost every replay");
    expect(headline(outcome(0.01), inputs(), "x")).toContain("Almost no replay gets x to $1 million by 55");
  });

  it("builds a read with the range first, then the lever, and the limits in the source line", () => {
    const read = buildGoalRead(
      { ...outcome(0.4), levers: [{ kind: "more", q: 0.5, monthly: 800, extra: 300 }, { kind: "later", age: 58, years: 3 }] },
      inputs({ monthly: 500 }),
      { example: true, parts: [], span: { first: "2014-12", last: "2026-10" }, paths: 4000 },
    );
    // The range the headline leaves out comes first; the lever follows.
    expect(read.insights[0]!.text).toBe("The middle replay ends at $1.01 million and the weakest one in ten at $610,000.");
    const lever = read.insights.find((item) => item.id === "goal-lever-more")!;
    expect(lever.text).toBe("Putting in $800 a month, $300 more than now, would lift the middle replay to $1 million.");
    expect(lever.soWhat).toBe("At $500 a month, half the replays get there by 58, 3 years later than you planned.");
    expect(read.source).toContain("Dec 2014 to Oct 2026");
    expect(read.source).toContain("not a forecast");
  });

  it("says plainly when there is nothing to grow, or the goal is already met", () => {
    expect(headline(outcome(0), inputs({ start: 0, monthly: 0 }), "your portfolio")).toBe(
      "With nothing to start with and nothing added each month, your portfolio has nothing to grow.",
    );
    expect(headline(outcome(1), inputs({ start: 1_200_000 }), "your portfolio")).toBe("What you have now already covers the $1 million goal.");
    expect(moneyWords(1.2e12)).toBe("$1.2 trillion");
  });

  it("leads with the S&P 500 beside the mix and states the hindsight discount", () => {
    const base = { ...outcome(0.93), benchmark: { chance: 0.8, p50: 1_360_000 } };
    const context = { example: true, parts: [], span: { first: "2014-12", last: "2026-10" }, paths: 4000 };
    const read = buildGoalRead(base, inputs(), context);
    expect(read.headline).toBe("This portfolio reaches $1 million by 55 in about 9 of 10 replays, against about 8 in 10 for the S&P 500.");
    // The headline is one idea; the weak end comes first, and the hindsight discount is the second line, in view on a phone.
    expect(read.insights.map((item) => item.id).slice(0, 2)).toEqual(["goal-range", "goal-discount"]);
    expect(read.insights[0]!.text).toBe("The weakest one in ten replays gets to $610,000 by 55.");
    const note = read.insights.find((item) => item.id === "goal-discount")!;
    expect(note.tone).toBe("flat");
    expect(note.text).toBe(DISCOUNT_SENTENCE);
    expect(note.soWhat).toBe("Replaying only the S&P 500 over the same stretches, the middle replay is $1.36 million, against $1.01 million for this portfolio.");
    const full = buildGoalRead(base, inputs({ full: true }), context);
    expect(full.insights.some((item) => item.id === "goal-full" && /flattering/.test(item.text))).toBe(true);
    const trailed = buildGoalRead(base, inputs({ full: true }), { ...context, fullFlatters: false });
    expect(trailed.insights.find((item) => item.id === "goal-full")!.text).not.toMatch(/flattering/);
    const both = { ...outcome(0.01), benchmark: { chance: 0.02, p50: 400_000 } };
    expect(headline(both, inputs(), "your portfolio")).toMatch(/^Almost no replay gets your portfolio, or the S&P 500 alone, to \$1 million by 55/);
    const preset = buildGoalRead(base, inputs({ mix: "qqq" }), context);
    expect(preset.insights.some((item) => item.id === "goal-discount" || item.id === "goal-full")).toBe(false);
    expect(preset.insights.some((item) => item.id === "goal-benchmark")).toBe(true);
  });

  it("names a stock that carried the mix, not a fund", () => {
    const part = (ticker: string, weight: number, driveShare: number, fund = false): PartHistory => ({
      ticker,
      name: ticker,
      weight,
      fund,
      first: "2014-12",
      last: "2026-10",
      own: 143,
      filled: 0,
      yearly: 0.1,
      driveShare,
    });
    expect(driverOf([part("NVDA", 0.11, 0.27), part("VOO", 0.5, 0.4, true), part("XOM", 0.39, 0.33)])?.ticker).toBe("NVDA");
    expect(driverOf([part("A", 0.5, 0.5), part("B", 0.5, 0.5)])).toBeNull();
    expect(driverOf([part("A", 1, 1)])).toBeNull();
  });
});

describe("inputs", () => {
  it("parses amounts people type", () => {
    expect(parseAmount("1,000,000")).toBe(1_000_000);
    expect(parseAmount("$250k")).toBe(250_000);
    expect(parseAmount("1.5m")).toBe(1_500_000);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("reads the address with defaults and limits", () => {
    const read = readInputs({ goal: "2m", age: "40", by: "60", monthly: "250", mix: "qqq", real: "0" }, 50_000, true);
    expect(read).toEqual({ target: 2_000_000, age: 40, byAge: 60, monthly: 250, start: 50_000, mix: "qqq", real: false, full: false });
    const fallback = readInputs({ goal: "5", age: "300", mix: "own" }, 12_345, false);
    expect(fallback).toMatchObject({ target: DEFAULTS.target, age: DEFAULTS.age, start: 12_345, mix: "spy", real: true });
  });

  it("round-trips through the address and leaves the portfolio's own start out", () => {
    const plan = inputs({ start: 80_000, mix: "6040" });
    const query = inputsQuery(plan, 80_000);
    expect(query).not.toContain("start=");
    expect(readInputs(new URLSearchParams(query), 80_000, true)).toEqual(plan);
    expect(query).not.toContain("full=");
    const flattering = inputsQuery({ ...plan, full: true }, 80_000);
    expect(readInputs(new URLSearchParams(flattering), 80_000, true).full).toBe(true);
    expect(inputsQuery({ ...plan, start: 90_000 }, 80_000)).toContain("start=90000");
  });

  it("explains impossible plans", () => {
    expect(inputProblem(inputs({ age: 50, byAge: 50 }))).toMatch(/at least a year/);
    expect(inputProblem(inputs({ age: 20, byAge: 75 }))).toMatch(/50 years/);
    expect(inputProblem(inputs())).toBeNull();
  });
});
