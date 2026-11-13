import { describe, expect, it } from "vitest";

import { emptyFacts, type StockFacts } from "@/lib/thesis-watch/facts";

import {
  ADD_MARGIN,
  checkBasket,
  metricOf,
  shortLine,
  statusOf,
  type CheckLine,
  type TickerFacts,
} from "./check";
import {
  factsAsOf,
  knownYears,
  perYearAsOf,
  monthMove,
  peStanding,
  trailingYield,
  emptyHistory,
  type MetricsSnapshot,
  type Series,
  type TickerHistory,
} from "./history";
import {
  inferKind,
  nameFromIdea,
  mainKind,
  mergeLines,
  parseBasketDraft,
  recentlyDropped,
  wordCount,
  MAX_LINES,
} from "./model";
import { replayBasket } from "./replay";

/* ── helpers ────────────────────────────────────────────────────────────── */

/** Every day a record in the history is dated (an undated explanation has none). */
function datesIn(history: TickerHistory): string[] {
  return [
    ...(history.series?.dates ?? []),
    ...history.metrics.map((row) => row.day),
    ...history.calls.map((row) => row.date.slice(0, 10)),
    ...(history.dividends?.payments.map((row) => row.exDate) ?? []),
    ...history.insiderSales.map((row) => row.day),
    ...history.fundCuts.map((row) => row.day),
    ...history.moves.flatMap((row) =>
      row.known ? [row.day, row.known] : [row.day],
    ),
    ...history.news.map((row) => row.day),
    ...history.reports.map((row) => row.day),
  ];
}

/**
 * The history as it stood on `day`: every dated record after it taken out, and every undated one too (fiscal years
 * and undated explanations), so a test comparing with it fails if any undated field changes a past day.
 */
function historyUpTo(history: TickerHistory, day: string): TickerHistory {
  const keep = (history.series?.dates ?? [])
    .map((date, index) => [date, history.series!.closes[index]!] as const)
    .filter(([date]) => date <= day);
  return {
    ...history,
    series: history.series
      ? {
          dates: keep.map(([date]) => date),
          closes: keep.map(([, close]) => close),
        }
      : null,
    metrics: history.metrics.filter((row) => row.day <= day),
    // Only the fiscal years a person could have read on the day.
    years: knownYears(history.years, day),
    calls: history.calls.filter((row) => row.date.slice(0, 10) <= day),
    dividends: history.dividends
      ? {
          payments: history.dividends.payments.filter(
            (row) => row.exDate <= day,
          ),
        }
      : null,
    insiderSales: history.insiderSales.filter((row) => row.day <= day),
    fundCuts: history.fundCuts.filter((row) => row.day <= day),
    moves: history.moves.filter(
      (row) => row.day <= day && row.known !== null && row.known <= day,
    ),
    news: history.news.filter((row) => row.day <= day),
    reports: history.reports.filter((row) => row.day <= day),
  };
}

const DAY = "2026-11-12";

function facts(
  ticker: string,
  patch: Partial<StockFacts> = {},
  ret1m: number | null = null,
): TickerFacts {
  return {
    facts: {
      ...emptyFacts(ticker, `US_${ticker}`, ticker, DAY),
      close: { value: 100, day: DAY },
      recentCloses: [100, 100, 100],
      ...patch,
    },
    ret1m,
  };
}

function line(ticker: string, kind: CheckLine["kind"] = "growth"): CheckLine {
  return {
    ticker,
    company: null,
    kind,
    reason: `${ticker} sells into the build-out.`,
    added_at: "2026-10-01T21:00:00.000Z",
  };
}

/** Weekdays from `from` for `count` sessions. */
function sessions(from: string, count: number): string[] {
  const out: string[] = [];
  let time = Date.parse(`${from}T00:00:00Z`);
  while (out.length < count) {
    const day = new Date(time).getUTCDay();
    if (day !== 0 && day !== 6)
      out.push(new Date(time).toISOString().slice(0, 10));
    time += 86_400_000;
  }
  return out;
}

/** A steady series with a little noise, ending wherever the dates end. */
function series(dates: string[], start = 100, drift = 0.001, seed = 1): Series {
  let price = start;
  let state = seed;
  const closes = dates.map(() => {
    state = (state * 16807) % 2147483647;
    price *= 1 + drift + (state / 2147483647 - 0.5) * 0.01;
    return Math.round(price * 100) / 100;
  });
  return { dates, closes };
}

function weekly(
  dates: string[],
  make: (index: number, day: string) => Partial<MetricsSnapshot>,
): MetricsSnapshot[] {
  return dates
    .filter((_, index) => index % 5 === 0)
    .map((day, index) => ({
      day,
      revenueGrowth: 20,
      epsNextYearGrowth: 15,
      epsGrowth: 10,
      pe: 25 + (index % 7),
      payout: 30,
      marketCap: 1e11,
      sector: "Technology",
      ...make(index, day),
    }));
}

/* ── the draft ──────────────────────────────────────────────────────────── */

describe("parseBasketDraft", () => {
  it("cleans a draft, names it from the idea, keeps the first of a repeated ticker and fills the kind from the idea", () => {
    const parsed = parseBasketDraft({
      idea: "  Cheap banks that  pay a dividend ",
      lines: [
        { ticker: "jpm", reason: "Biggest US bank." },
        { ticker: "$BAC", reason: "Rate sensitive.", kind: "value" },
        { ticker: "JPM", reason: "Again." },
        { ticker: "not a ticker!", reason: "x" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.name).toBe("Cheap banks that pay a dividend");
    expect(parsed.draft.source).toEqual({ kind: "own" });
    expect(parsed.draft.lines).toEqual([
      {
        ticker: "JPM",
        company: null,
        kind: "dividend",
        reason: "Biggest US bank.",
      },
      {
        ticker: "BAC",
        company: null,
        kind: "value",
        reason: "Rate sensitive.",
      },
    ]);
  });

  it("refuses an empty idea, a line without a reason, too few and too many companies", () => {
    expect(parseBasketDraft({ idea: "", lines: [] }).ok).toBe(false);
    expect(
      parseBasketDraft({
        idea: "AI",
        lines: [
          { ticker: "NVDA", reason: "" },
          { ticker: "AMD", reason: "x" },
        ],
      }),
    ).toEqual({ ok: false, error: "Give NVDA a reason in a sentence." });
    expect(
      parseBasketDraft({ idea: "AI", lines: [{ ticker: "NVDA", reason: "x" }] })
        .ok,
    ).toBe(false);
    const many = Array.from({ length: MAX_LINES + 1 }, (_, index) => ({
      ticker: `A${index}`,
      reason: "x",
    }));
    expect(parseBasketDraft({ idea: "AI", lines: many }).ok).toBe(false);
  });

  it("only keeps a theme source with a clean slug", () => {
    const lines = [
      { ticker: "VRT", reason: "x" },
      { ticker: "ETN", reason: "y" },
    ];
    const ok = parseBasketDraft({
      idea: "Power",
      lines,
      source: { kind: "theme", slug: "ai-capex" },
    });
    const bad = parseBasketDraft({
      idea: "Power",
      lines,
      source: { kind: "theme", slug: "../x" },
    });
    expect(ok.ok && ok.draft.source).toEqual({
      kind: "theme",
      slug: "ai-capex",
    });
    expect(bad.ok && bad.draft.source).toEqual({ kind: "own" });
  });

  it("reads the kind from the idea and picks the basket's main kind", () => {
    expect(inferKind("dividend payers for income")).toBe("dividend");
    expect(inferKind("beaten-down chip stocks")).toBe("value");
    expect(inferKind("a short-term bounce in airlines")).toBe("trade");
    expect(inferKind("AI power demand")).toBe("growth");
    // Words that only sound like a kind stay growth ideas.
    expect(inferKind("trade war winners")).toBe("growth");
    expect(inferKind("travel rebound")).toBe("growth");
    expect(inferKind("rising incomes in India")).toBe("growth");
    expect(nameFromIdea("U.S. power grid upgrades. More later")).toBe(
      "U.S. power grid upgrades",
    );
    expect(
      mainKind([{ kind: "value" }, { kind: "growth" }, { kind: "value" }]),
    ).toBe("value");
    expect(mainKind([], "dividend income stocks")).toBe("dividend");
  });

  it("keeps the day a company joined across edits and remembers recent drops", () => {
    const before = [{ ...line("VRT"), added_at: "2026-10-01T00:00:00.000Z" }];
    const merged = mergeLines(
      before,
      [
        { ticker: "VRT", company: null, kind: "growth", reason: "new words" },
        { ticker: "ETN", company: null, kind: "growth", reason: "x" },
      ],
      new Date("2026-11-12T12:00:00Z"),
    );
    expect(merged.map((entry) => entry.added_at)).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-12T12:00:00.000Z",
    ]);
    expect(merged[0]!.reason).toBe("new words");
    expect([
      ...recentlyDropped(
        [
          { ticker: "A", day: "2026-11-01" },
          { ticker: "B", day: "2026-09-01" },
        ],
        DAY,
      ),
    ]).toEqual(["A"]);
  });
});

/* ── short lines ────────────────────────────────────────────────────────── */

describe("shortLine", () => {
  it("says each rule's finding in at most 15 words, from its own figures", () => {
    const cases: Array<[string, Record<string, string | number | null>]> = [
      ["revenue_shrinking", { revenue_growth_pct: -4.2 }],
      [
        "growth_slowing",
        {
          revenue_growth_pct: 12,
          prior_growth_pct: 41,
          prior_label: "fiscal 2025",
        },
      ],
      ["estimates_falling", { eps_next_year_pct: -8 }],
      ["call_trim", { days: 34 }],
      ["dividend_cut", { cut_pct: -25 }],
      ["no_longer_cheap", { pe_percentile_pct: 72 }],
      ["news_negative", { negative_pct: 70, headlines: 12 }],
      ["fund_cut", { fund: "Coatue Management" }],
      [
        "fund_cut",
        { fund: "A Very Long Fund Name Capital Management Partners LP" },
      ],
      ["unexplained_fall", { move_pct: -11.3 }],
      ["revenue", { revenue_growth_pct: 29 }],
    ];
    for (const [id, data] of cases) {
      const text = shortLine({
        id,
        data,
        text: "A long sentence the rules wrote that goes on and on and on about the facts behind this finding today.",
      });
      expect(text, id).not.toBe("");
      expect(wordCount(text), `${id}: ${text}`).toBeLessThanOrEqual(15);
    }
    expect(
      shortLine({
        id: "growth_slowing",
        data: { revenue_growth_pct: 12, prior_growth_pct: 41 },
        text: "",
      }),
    ).toBe("Revenue growth slowed to 12%, from 41%.");
  });
});

/* ── the check ──────────────────────────────────────────────────────────── */

describe("checkBasket", () => {
  it("ends in 'nothing to change' when every reason holds, with each card's own figure", () => {
    const run = checkBasket({
      day: DAY,
      lines: [line("VRT"), line("ETN")],
      kind: "growth",
      facts: new Map([
        ["VRT", facts("VRT", { revenueGrowth: 29 })],
        ["ETN", facts("ETN", { revenueGrowth: 11 })],
      ]),
    });
    expect(run.decision).toBe("nothing");
    expect(run.summary).toBe("Nothing to change: all 2 reasons hold.");
    expect(run.statuses.map((status) => status.line)).toEqual([
      "Revenue grew 29% over the last year.",
      "Revenue grew 11% over the last year.",
    ]);
  });

  it("drafts a drop for a broken reason with the fact that broke it", () => {
    const run = checkBasket({
      day: DAY,
      lines: [line("VRT"), line("ARM"), line("ETN")],
      kind: "growth",
      facts: new Map([
        ["VRT", facts("VRT", { revenueGrowth: 29 })],
        ["ARM", facts("ARM", { revenueGrowth: -6 })],
        ["ETN", facts("ETN", { revenueGrowth: 11 })],
      ]),
    });
    expect(run.decision).toBe("propose");
    expect(run.changes).toEqual([
      expect.objectContaining({
        op: "drop",
        ticker: "ARM",
        verdict: "broken",
        signal_id: "revenue_shrinking",
        line: "Revenue fell 6% over the last year.",
      }),
    ]);
    expect(run.summary).toBe("Drop ARM: its reason broke.");
    expect(wordCount(run.summary)).toBeLessThanOrEqual(15);
  });

  it("adds the best candidate only when it beats the weakest company by a clear margin", () => {
    const base = {
      day: DAY,
      lines: [line("VRT"), line("ETN")],
      kind: "growth" as const,
    };
    const known = new Map([
      ["VRT", facts("VRT", { revenueGrowth: 29 })],
      ["ETN", facts("ETN", { revenueGrowth: 11 })],
    ]);
    const close = checkBasket({
      ...base,
      facts: new Map([
        ...known,
        ["PWR", facts("PWR", { revenueGrowth: 11 + ADD_MARGIN.growth - 1 })],
      ]),
      candidates: [
        { ticker: "PWR", company: "Quanta", reason: "Builds the grid." },
      ],
    });
    expect(close.decision).toBe("nothing");

    const clear = checkBasket({
      ...base,
      facts: new Map([
        ...known,
        ["PWR", facts("PWR", { revenueGrowth: 24 })],
        ["GEV", facts("GEV", { revenueGrowth: 35 })],
      ]),
      candidates: [
        { ticker: "PWR", company: "Quanta", reason: "Builds the grid." },
        { ticker: "GEV", company: "GE Vernova", reason: "Makes the turbines." },
      ],
    });
    expect(clear.changes).toEqual([
      expect.objectContaining({
        op: "add",
        ticker: "GEV",
        reason: "Makes the turbines.",
        fact: {
          label: "Revenue growth",
          value: 35,
          text: "+35%",
          versus: { ticker: "ETN", value: 11, text: "+11%" },
        },
      }),
    ]);
    expect(clear.changes[0]!.line).toBe(
      "Revenue growth: +35%, against +11% for ETN, the weakest.",
    );
  });

  it("never adds a company already in, recently taken out, or whose own reason does not hold", () => {
    const run = checkBasket({
      day: DAY,
      lines: [line("VRT"), line("ETN")],
      kind: "growth",
      facts: new Map([
        ["VRT", facts("VRT", { revenueGrowth: 29 })],
        ["ETN", facts("ETN", { revenueGrowth: 11 })],
        ["PWR", facts("PWR", { revenueGrowth: 50 })],
        ["GEV", facts("GEV", { revenueGrowth: 60, epsNextYearGrowth: -20 })],
      ]),
      candidates: [
        { ticker: "VRT", company: null, reason: "x" },
        { ticker: "PWR", company: null, reason: "x" },
        { ticker: "GEV", company: null, reason: "x" },
      ],
      skip: new Set(["PWR"]),
    });
    expect(run.changes).toEqual([]);
  });

  it("takes in a replacement for a company it drops, and never grows a full basket", () => {
    const lines = Array.from({ length: MAX_LINES }, (_, index) =>
      line(`T${index}`),
    );
    const known = new Map(
      lines.map((entry) => [
        entry.ticker,
        facts(entry.ticker, { revenueGrowth: 10 }),
      ]),
    );
    const candidate = { ticker: "NEW", company: null, reason: "x" };
    const full = checkBasket({
      day: DAY,
      lines,
      kind: "growth",
      facts: new Map([...known, ["NEW", facts("NEW", { revenueGrowth: 80 })]]),
      candidates: [candidate],
    });
    expect(full.changes).toEqual([]);
    known.set("T0", facts("T0", { revenueGrowth: -3 }));
    const swap = checkBasket({
      day: DAY,
      lines,
      kind: "growth",
      facts: new Map([...known, ["NEW", facts("NEW", { revenueGrowth: 80 })]]),
      candidates: [candidate],
    });
    expect(
      swap.changes.map((change) => `${change.op} ${change.ticker}`),
    ).toEqual(["drop T0", "add NEW"]);
    expect(swap.summary).toBe("Drop T0 and add NEW.");
    expect(swap.changes[1]).toMatchObject({
      line: "Revenue growth: +80%. Its reason holds; T0's broke.",
      fact: { versus: null },
    });
  });

  it("never drafts drops that would take the basket under two companies, the most severe first", () => {
    const run = checkBasket({
      day: DAY,
      lines: [line("A"), line("B"), line("C")],
      kind: "growth",
      facts: new Map([
        [
          "A",
          facts("A", {
            revenueGrowth: 20,
            epsNextYearGrowth: -10,
            revenueGrowthPrior: 40,
            priorLabel: "fiscal 2025",
          }),
        ], // two soft: broken
        ["B", facts("B", { revenueGrowth: -8 })], // hard: broken
        ["C", facts("C", { revenueGrowth: -3 })], // hard: broken
      ]),
    });
    // Three broke, one drop fits: the hard finding goes first, in the basket's order.
    expect(
      run.changes.map((change) => `${change.op} ${change.ticker}`),
    ).toEqual(["drop B"]);
    const two = checkBasket({
      day: DAY,
      lines: [line("B"), line("C")],
      kind: "growth",
      facts: new Map([
        ["B", facts("B", { revenueGrowth: -8 })],
        ["C", facts("C", { revenueGrowth: -3 })],
      ]),
    });
    expect(two.changes).toEqual([]);
  });

  it("says it could not check when half the basket has no facts, and proposes nothing", () => {
    const run = checkBasket({
      day: DAY,
      lines: [line("VRT"), line("ARM")],
      kind: "growth",
      facts: new Map([["ARM", facts("ARM", { revenueGrowth: -6 })]]),
    });
    expect(run.decision).toBe("could_not_check");
    expect(run.changes).toEqual([]);
    expect(run.missing).toEqual(["VRT"]);
    expect(run.summary).toBe("Couldn't check 1 of 2 companies.");
  });

  it("compares each kind on its own figure", () => {
    expect(metricOf("value", facts("X", { pePercentile: 30 }))).toMatchObject({
      label: "Cheaper than its own past",
      value: 70,
      text: "70%",
      better: "higher",
    });
    expect(metricOf("dividend", facts("X", { divYield: 3.2 }))).toMatchObject({
      text: "3.2%",
      better: "higher",
    });
    expect(metricOf("trade", facts("X", {}, -4.26))).toMatchObject({
      text: "−4.3%",
    });
    expect(metricOf("growth", facts("X"))).toBeNull();
    expect(statusOf(line("X"), undefined, DAY, null).verdict).toBe("unknown");
  });
});

/* ── history: no hindsight ──────────────────────────────────────────────── */

const DATES = sessions("2026-03-02", 185); // through mid-November 2026
const END = DATES[DATES.length - 1]!;

function history(
  ticker: string,
  patch: Partial<TickerHistory> = {},
  seed = 1,
): TickerHistory {
  return {
    ...emptyHistory(ticker, `US_${ticker}`, ticker),
    series: series(DATES, 100, 0.001, seed),
    metrics: weekly(DATES, (index) => ({
      revenueGrowth: 20 + (index % 3),
      pe: 20 + index * 0.3,
    })),
    years: [
      { label: "TTM", revenue: 140, eps: null, netIncome: null, fcf: null },
      { label: "FY 2026", revenue: 130, eps: null, netIncome: null, fcf: null },
      { label: "FY 2025", revenue: 100, eps: null, netIncome: null, fcf: null },
      { label: "FY 2024", revenue: 80, eps: null, netIncome: null, fcf: null },
    ],
    calls: DATES.filter((_, index) => index % 10 === 0).map((date, index) => ({
      date,
      stance: index % 4 === 3 ? "trim" : "hold",
    })),
    dividends: {
      payments: DATES.filter((_, index) => index % 63 === 5).map((exDate) => ({
        exDate,
        amount: 0.5,
      })),
    },
    insiderSales: DATES.filter((_, index) => index % 17 === 3).map((day) => ({
      day,
      usd: 6_000_000,
    })),
    fundCuts: [
      {
        day: DATES[150]!,
        fund: "Coatue",
        href: "/follow/coatue",
        action: "trimmed",
        changePct: -60,
      },
    ],
    moves: DATES.filter((_, index) => index % 23 === 7).map((day, index) => ({
      day,
      known: DATES[Math.min(DATES.indexOf(day) + 1, DATES.length - 1)]!,
      pct: -9,
      headline:
        index % 2
          ? "Shares fell after a DOJ probe"
          : "Shares fell on a downgrade",
      href: `/moves/${day}`,
    })),
    news: DATES.flatMap((day, index) =>
      index % 2 === 0
        ? [
            {
              day,
              tone:
                index % 3 === 0 ? ("negative" as const) : ("neutral" as const),
            },
          ]
        : [],
    ),
    reports: [{ day: DATES[120]!, guidance: "lowered", href: "/earnings/x" }],
    ...patch,
  };
}

describe("factsAsOf", () => {
  it("uses the weekly snapshot taken on or before the day, never a later one", () => {
    const h = history("VRT", {
      metrics: [
        {
          day: "2026-11-01",
          revenueGrowth: 30,
          epsNextYearGrowth: null,
          epsGrowth: null,
          pe: 30,
          payout: null,
          marketCap: null,
          sector: null,
        },
        {
          day: "2026-11-08",
          revenueGrowth: -50,
          epsNextYearGrowth: null,
          epsGrowth: null,
          pe: 30,
          payout: null,
          marketCap: null,
          sector: null,
        },
      ],
    });
    expect(factsAsOf(h, "2026-11-07", null).facts.revenueGrowth).toBe(30);
    expect(factsAsOf(h, "2026-11-08", null).facts.revenueGrowth).toBe(-50);
    expect(factsAsOf(h, "2026-10-30", null).facts.revenueGrowth).toBeNull();
  });

  it("counts a fiscal year only 90 days after its calendar year, and never the trailing twelve months", () => {
    const years = history("X").years;
    expect(knownYears(years, "2026-11-12").map((year) => year.label)).toEqual([
      "FY 2025",
      "FY 2024",
    ]);
    expect(knownYears(years, "2027-03-31").map((year) => year.label)).toEqual([
      "FY 2026",
      "FY 2025",
      "FY 2024",
    ]);
    expect(factsAsOf(history("X"), "2026-11-12", null).facts.priorLabel).toBe(
      "fiscal 2025",
    );
  });

  it("places the P/E only with enough snapshots before the day, and counts an explanation from the day it was written", () => {
    const metrics = weekly(DATES, (index) => ({ pe: 10 + index }));
    expect(peStanding(metrics, metrics[18]!.day)).toBeNull();
    expect(peStanding(metrics, metrics[30]!.day)!.percentile).toBeCloseTo(
      (30 / 31) * 100,
    );
    const move = DATES[100]!;
    const h = history("X", {
      moves: [
        {
          day: move,
          known: DATES[102]!,
          pct: -9,
          headline: "Shares fell after a DOJ probe",
          href: "/m",
        },
      ],
    });
    expect(factsAsOf(h, DATES[101]!, null).facts.trouble).toBeNull();
    expect(factsAsOf(h, DATES[102]!, null).facts.trouble).toMatchObject({
      day: move,
    });
  });

  it("works out a month's move and a trailing yield from data on or before the day", () => {
    const s = {
      dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
      closes: [100, 110, 1000],
    };
    expect(monthMove(s, "2026-01-02", 1)).toBeCloseTo(10);
    expect(
      trailingYield(
        {
          payments: [
            { exDate: "2026-01-01", amount: 1 },
            { exDate: "2026-06-01", amount: 1 },
            { exDate: "2026-12-01", amount: 9 },
          ],
        },
        50,
        "2026-11-12",
      ),
    ).toBeCloseTo(4);
  });

  it("reads nothing dated after the day: the facts are the same with every later record removed", () => {
    const h = history("VRT");
    const market = series(DATES, 400, 0.0005, 7);
    for (const day of DATES.slice(100)) {
      const full = factsAsOf(h, day, market);
      const cut = factsAsOf(historyUpTo(h, day), day, {
        dates: market.dates.filter((d) => d <= day),
        closes: market.closes.slice(
          0,
          market.dates.filter((d) => d <= day).length,
        ),
      });
      expect(full, day).toEqual(cut);
      expect(datesIn(historyUpTo(h, day)).every((d) => d <= day)).toBe(true);
    }
  });

  it("never lets an undated record change a past day: fiscal years, undated explanations, how often it pays", () => {
    const day = DATES[150]!;
    const base = history("VRT", {
      moves: [],
      insiderSales: [],
      fundCuts: [],
      reports: [],
      news: [],
    });
    const market = series(DATES, 400, 0.0005, 7);
    const plain = factsAsOf(base, day, market);
    // A fiscal year that closed after the day, and a trailing twelve months, change nothing.
    const later = factsAsOf(
      {
        ...base,
        years: [
          {
            label: "FY 2027",
            revenue: 1,
            eps: null,
            netIncome: null,
            fcf: null,
          },
          ...base.years,
        ],
      },
      day,
      market,
    );
    expect(later.facts).toEqual(plain.facts);
    // An explanation with no date is never read: no trouble, and its day is not counted as explained.
    const undated = factsAsOf(
      {
        ...base,
        moves: [
          {
            day: DATES[148]!,
            known: null,
            pct: -12,
            headline: "Shares fell after a DOJ probe",
            href: "/m",
          },
        ],
      },
      day,
      market,
    );
    expect(undated.facts.trouble).toBeNull();
    expect(undated.facts).toEqual(plain.facts);
    // How often it pays comes from payments up to the day: payments after it change nothing.
    const payments = DATES.filter((_, index) => index % 63 === 5).map(
      (exDate) => ({ exDate, amount: 0.5 }),
    );
    const withFuture = {
      payments: [
        ...payments,
        { exDate: "2027-01-05", amount: 0.5 },
        { exDate: "2027-01-20", amount: 0.5 },
      ],
    };
    expect(
      factsAsOf({ ...base, dividends: withFuture }, day, market).facts,
    ).toEqual(
      factsAsOf({ ...base, dividends: { payments } }, day, market).facts,
    );
    expect(perYearAsOf(payments, day)).toBe(4);
    expect(perYearAsOf(payments.slice(0, 2), day)).toBeNull();
  });
});

describe("replayBasket", () => {
  const lines = [
    {
      ticker: "VRT",
      company: "Vertiv",
      kind: "growth" as const,
      reason: "Cools the data centers.",
    },
    {
      ticker: "ETN",
      company: "Eaton",
      kind: "growth" as const,
      reason: "Sells the switchgear.",
    },
    {
      ticker: "ARM",
      company: "Arm",
      kind: "growth" as const,
      reason: "Licenses the chips.",
    },
  ];
  const market = series(DATES, 400, 0.0005, 7);

  // Quiet histories: no guidance cut, no insider sales, no trouble, our call Keep throughout.
  const quiet = {
    reports: [],
    insiderSales: [],
    moves: [],
    fundCuts: [],
    news: [],
    calls: [{ date: DATES[0]!, stance: "hold" }],
  };
  function histories(poisonFrom: string | null) {
    const arm = history("ARM", quiet, 3);
    if (poisonFrom) {
      // From `poisonFrom` on, ARM's revenue falls and analysts cut: a reason that breaks on that day and not before.
      arm.metrics = [
        ...arm.metrics.filter((row) => row.day < poisonFrom),
        {
          day: poisonFrom,
          revenueGrowth: -12,
          epsNextYearGrowth: -30,
          epsGrowth: -40,
          pe: 30,
          payout: null,
          marketCap: null,
          sector: "Technology",
        },
      ];
    }
    return new Map<string, TickerHistory>([
      ["VRT", history("VRT", quiet, 1)],
      ["ETN", history("ETN", quiet, 2)],
      ["ARM", arm],
      [
        "GEV",
        history(
          "GEV",
          { ...quiet, metrics: weekly(DATES, () => ({ revenueGrowth: 45 })) },
          4,
        ),
      ],
    ]);
  }

  it("checks every session of the last four weeks and records a decision for each, newest first", () => {
    const replay = replayBasket({
      lines,
      kind: "growth",
      candidates: [],
      histories: histories(null),
      market,
      end: END,
    });
    expect(replay.sessions).toBe(20);
    expect(replay.runs).toHaveLength(20);
    expect(replay.runs[0]!.day).toBe(END);
    expect(
      replay.counts.propose +
        replay.counts.nothing +
        replay.counts.could_not_check,
    ).toBe(20);
  });

  it("proposes a drop on the first day the reason broke and never before it, whatever came later", () => {
    const breakDay = DATES[DATES.length - 8]!;
    const clean = replayBasket({
      lines,
      kind: "growth",
      candidates: [],
      histories: histories(null),
      market,
      end: END,
    });
    const poisoned = replayBasket({
      lines,
      kind: "growth",
      candidates: [],
      histories: histories(breakDay),
      market,
      end: END,
    });
    expect(poisoned.proposals).toContainEqual(
      expect.objectContaining({
        op: "drop",
        ticker: "ARM",
        first: breakDay,
        days: 8,
      }),
    );
    // Every day before the break is decided exactly as without it: nothing after a day leaks into it.
    const before = (replay: typeof clean) =>
      replay.runs.filter((run) => run.day < breakDay);
    expect(before(poisoned)).toEqual(before(clean));
  });

  it("decides every day exactly as it would with only that day's records, so no later data is used", () => {
    const all = histories(DATES[DATES.length - 5]!);
    const candidates = [
      { ticker: "GEV", company: "GE Vernova", reason: "Makes the turbines." },
    ];
    const replay = replayBasket({
      lines,
      kind: "growth",
      candidates,
      histories: all,
      market,
      end: END,
    });
    for (const run of replay.runs) {
      const cut = new Map(
        [...all].map(
          ([ticker, h]) => [ticker, historyUpTo(h, run.day)] as const,
        ),
      );
      const cutMarket = {
        dates: market.dates.filter((d) => d <= run.day),
        closes: market.closes.slice(
          0,
          market.dates.filter((d) => d <= run.day).length,
        ),
      };
      const alone = replayBasket({
        lines,
        kind: "growth",
        candidates,
        histories: cut,
        market: cutMarket,
        end: run.day,
        weeks: 4,
      });
      expect(alone.runs[0], run.day).toEqual(run);
    }
  });

  it("proposes an add from the candidates with the fact that decides it, once while it waits", () => {
    const replay = replayBasket({
      lines,
      kind: "growth",
      candidates: [
        { ticker: "GEV", company: "GE Vernova", reason: "Makes the turbines." },
      ],
      histories: histories(null),
      market,
      end: END,
    });
    const add = replay.proposals.find((entry) => entry.op === "add");
    expect(add).toMatchObject({ ticker: "GEV" });
    expect(add!.line).toMatch(
      /^Revenue growth: \+45%, against \+2\d% for [A-Z]+, the weakest\.$/,
    );
    expect(
      replay.proposals.filter(
        (entry) => entry.op === "add" && entry.ticker === "GEV",
      ),
    ).toHaveLength(1);
  });
});
