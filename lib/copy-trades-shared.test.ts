import { describe, expect, it } from "vitest";

import {
  buildCopyRead,
  buildHubRead,
  copyChartGeometry,
  copyCompanyName,
  copyDescription,
  copyHref,
  copyIsIndexable,
  copyTitle,
  fmtDollars,
  fmtThousands,
  heldSpan,
  holdSentence,
  positionSentence,
  rankRows,
  stoppedMonth,
  whoLine,
  type CopyHub,
  type CopyHubRow,
  type CopyPosition,
  type CopyRecordEmpty,
  type CopyRecordFull,
} from "@/lib/copy-trades-shared";

function position(overrides: Partial<CopyPosition> = {}): CopyPosition {
  return { ticker: "AAPL", name: "Apple Inc", pnl: 8038.17, return: 3.5579, first: "2020-02-18", last: null, held: true, days: 1691, ...overrides };
}

function record(overrides: Partial<CopyRecordFull> = {}): CopyRecordFull {
  return {
    slug: "berkshire-hathaway",
    kind: "fund",
    name: "Berkshire Hathaway",
    person: "Warren Buffett",
    rule: "Buy the 50 largest stock positions in each 13F.",
    caveat: "13F filings arrive late; past results do not repeat.",
    hold_label: "Bought their first portfolio and never traded",
    eligible: true,
    not_ranked_because: null,
    rank: 3,
    updated_at: "2026-11-11T00:00:00Z",
    start_date: "2020-02-18",
    end_date: "2026-11-09",
    ended: false,
    sessions: 1692,
    years: 6.72,
    start_value: 10000,
    copy: { end_value: 23677.77, total: 1.3678, annualized: 0.1368, max_drawdown: -0.3922, drawdown_peak: "2020-02-19", drawdown_trough: "2020-03-23" },
    spy: { end_value: 24639.12, total: 1.4639, annualized: 0.1435, max_drawdown: -0.3372, drawdown_peak: "2020-02-19", drawdown_trough: "2020-03-23" },
    hold: { end_value: 28016.68, total: 1.8017, annualized: 0.1656, max_drawdown: -0.3922, drawdown_peak: null, drawdown_trough: null },
    curve: [
      ["2020-02-18", 1, 1, 1],
      ["2021-01-04", 1.2, 1.15, 1.25],
      ["2026-11-09", 2.3678, 2.4639, 2.8017],
    ],
    curve_columns: ["date", "copy", "spy", "hold"],
    yearly: [],
    trades: { buys: 100, sells: 71, resized: 152, rebalances: 29, skipped_trades: 0, ignored_sales: 0, turnover_per_year: 0.33 },
    positions_count: 94,
    best: [position()],
    worst: [position({ ticker: "GOOGL", name: "Alphabet Inc Class A", pnl: -375.01, return: 0.0136, first: "2025-11-17" })],
    held_now: 29,
    coverage: { priced: 94, skipped: 0, skipped_examples: [], weight_avg: 0.98, weight_min: 0.96, cash_share: 0 },
    excess_per_year: -0.0067,
    price_source: "Adjusted daily closes",
    benchmark: "SPY",
    ...overrides,
  };
}

function row(overrides: Partial<CopyHubRow>): CopyHubRow {
  return {
    slug: "x",
    kind: "fund",
    name: "X",
    person: "Someone",
    start_date: "2020-02-18",
    end_date: "2026-11-09",
    eligible: true,
    not_ranked_because: null,
    excess_per_year: 0,
    years: 6.7,
    copy_total: 1,
    copy_annualized: 0.12,
    spy_total: 1.4,
    spy_annualized: 0.14,
    max_drawdown: -0.3,
    trades: 10,
    best: null,
    worst: null,
    spark: [],
    rank: null,
    ...overrides,
  };
}

describe("copy test pages", () => {
  it("titles name the source, what is copied and the start year", () => {
    expect(copyTitle(record())).toBe("What If You Copied Berkshire Hathaway's 13F Moves? Backtested Since 2020");
    expect(copyTitle(record({ kind: "congress", name: "Nancy Pelosi", start_date: "2023-04-10" }))).toBe(
      "What If You Copied Nancy Pelosi's Stock Trades? Backtested Since 2023",
    );
    expect(copyTitle(record({ name: "Tudor Investments" }))).toContain("Tudor Investments' 13F Moves");
    expect(copyHref("nancy-pelosi")).toBe("/follow/nancy-pelosi/copy");
  });

  it("an empty record has no year in the title, says why, and is not indexed", () => {
    const empty: CopyRecordEmpty = {
      ...record(),
      empty: true,
      start_date: null,
      end_date: null,
      eligible: false,
      not_ranked_because: "no stock purchases we could copy",
    } as unknown as CopyRecordEmpty;
    expect(copyTitle(empty)).toBe("What If You Copied Berkshire Hathaway's 13F Moves?");
    expect(copyDescription(empty)).toContain("no stock purchases we could copy");
    expect(copyIsIndexable(empty)).toBe(false);
    expect(buildCopyRead(empty)).toBeNull();
    expect(copyIsIndexable(record({ sessions: 60 }))).toBe(false);
    expect(copyIsIndexable(record())).toBe(true);
  });

  it("the read says the result against the S&P 500, then the best and worst moves", () => {
    const read = buildCopyRead(record())!;
    expect(read.headline).toBe(
      "Copying Berkshire Hathaway's 13F filings from Feb 2020 would have turned $10,000 into $23,678, less than the $24,639 the S&P 500 made over the same days.",
    );
    expect(read.insights.map((item) => item.id)).toEqual(["pace", "best-AAPL", "worst-GOOGL"]);
    expect(read.insights[0]!.text).toBe("That is +13.7% a year against +14.3% for the S&P 500, 0.7 points a year behind.");
    expect(read.insights[0]!.tone).toBe("down");
    expect(read.insights[1]!.text).toBe("AAPL was the best move to have copied: it made $8,038 on the $10,000.");
    expect(read.insights[1]!.soWhat).toBe("+356% while the copy held it, held since Feb 2020.");
    expect(read.insights[1]!.leadName).toBe("Apple");
  });

  it("a record that stopped says until when, everywhere it is quoted", () => {
    const stopped = record({ kind: "congress", name: "Morgan McGarvey", start_date: "2023-03-24", end_date: "2024-12-11", ended: true, stopped: true });
    expect(stoppedMonth(stopped)).toBe("December 2024");
    expect(stoppedMonth(record())).toBeNull();
    expect(buildCopyRead(stopped)!.headline.startsWith("Copying Morgan McGarvey's reported trades from Mar 2023 until Dec 2024 would have turned")).toBe(true);
    expect(copyDescription(stopped)).toContain("from Mar 2023 until Dec 2024");
    // A stock still in the copy when the record stopped is not "held since".
    expect(heldSpan(position({ first: "2025-11-17" }), "2026-02-13")).toBe("held from Nov 2025 until the record ended in Feb 2026");
    expect(heldSpan(position({ first: "2025-11-17" }))).toBe("held since Nov 2025");
  });

  it("the description is whole sentences", () => {
    expect(copyDescription(record())).toMatch(/\. See the rule, each year's return, the worst fall and the moves that made and lost the most\.$/);
  });

  it("names companies the way a person would", () => {
    expect(copyCompanyName("Delta Air Lines, Inc. Common Stock")).toBe("Delta Air Lines");
    expect(copyCompanyName("Vistra Corp. Common Stock")).toBe("Vistra");
    expect(copyCompanyName("Bloom Energy Corporation Class A Common Stock")).toBe("Bloom Energy");
    expect(copyCompanyName("Alphabet Inc Class A")).toBe("Alphabet");
    expect(copyCompanyName("Vf Corp", "VFC")).toBe("VF");
    expect(copyCompanyName("Vf Corp", "VF")).toBe("VF");
  });

  it("a member without a party on file still reads as a person", () => {
    expect(whoLine({ kind: "congress", person: "X", party: "", state: "VA", district: "7" })).toBe("House member, VA-7");
    expect(whoLine({ kind: "congress", person: "X", party: "D", state: "CA", district: "11" })).toBe("Democrat, CA-11");
  });

  it("never quotes a stock's rise beside a loss on it", () => {
    // Bought more after it rose, then it fell: up 1% overall but a loss for the copy.
    const worst = positionSentence(position({ ticker: "GOOGL", pnl: -375, return: 0.0136, first: "2025-11-17" }), false);
    expect(worst.soWhat).toBe("Held since Nov 2025.");
    expect(worst.text).toContain("lost $375");
  });

  it("a record under a year is too short to call", () => {
    const read = buildCopyRead(record({ copy: { ...record().copy, annualized: null }, spy: { ...record().spy, annualized: null } }))!;
    expect(read.insights[0]!.text).toContain("too short to call");
  });

  it("compares with not trading in one sentence", () => {
    expect(holdSentence(record())).toBe(
      "If you had bought their first portfolio and never traded, you would have ended at $28,017, so following every move cost $4,339.",
    );
    expect(holdSentence(record({ hold: null }))).toBeNull();
  });

  it("formats whole dollars", () => {
    expect(fmtDollars(23677.77)).toBe("$23,678");
    expect(fmtDollars(-375.01)).toBe("−$375");
    expect(fmtDollars(null)).toBe("");
  });
});

describe("ranking", () => {
  const rows = [
    row({ slug: "a", name: "Alpha", excess_per_year: -0.02 }),
    row({ slug: "b", name: "Bravo", excess_per_year: 0.04 }),
    row({ slug: "c", name: "Charlie", excess_per_year: 0.01 }),
    row({ slug: "d", name: "Delta", eligible: false, excess_per_year: 0.5, not_ranked_because: "less than a year of record" }),
    row({ slug: "e", name: "Echo", excess_per_year: null }),
    row({ slug: "p", name: "Pat Member", kind: "congress", excess_per_year: 0.06 }),
  ];

  it("ranks eligible rows by how far ahead of the index they ran, and groups the rest", () => {
    const groups = rankRows(
      [
        ...rows,
        row({ slug: "f", name: "Foxtrot", eligible: false, excess_per_year: 0.9, not_ranked_group: "ended", stopped: true }),
        row({ slug: "aa", name: "Aardvark", excess_per_year: -0.02 }),
      ],
      "fund",
    );
    // Ties break on the slug, as in backend/agentdata/copy_trades.py.
    expect(groups.ranked.map((item) => item.slug)).toEqual(["b", "c", "a", "aa"]);
    expect(groups.ended.map((item) => item.slug)).toEqual(["f"]);
    expect(groups.short).toEqual([]);
    expect(groups.untested.map((item) => item.slug)).toEqual(["d", "e"]);
    expect(rankRows(rows, "congress").ranked.map((item) => item.slug)).toEqual(["p"]);
  });

  it("the hub read counts who beat the index and names the best of each kind", () => {
    const hub: CopyHub = {
      generated_at: "2026-11-11T00:00:00Z",
      fund_start: "2020-01-01",
      price_as_of: "2026-11-09",
      rows,
      funds: 5,
      members: 1,
      ranked_funds: 3,
      ranked_members: 1,
      fund_rule: "",
      fund_caveat: "",
      congress_rule: "",
      congress_caveat: "",
    };
    const read = buildHubRead(hub)!;
    expect(read.headline).toBe(
      "2 of the 3 funds with two years of record beat the S&P 500 when copied from 2020, and 1 of 1 House members did from their first reported buy.",
    );
    expect(read.insights[0]!.id).toBe("best-fund-b");
    expect(read.insights[1]!.id).toBe("best-member-p");
    expect(buildHubRead(null)).toBeNull();
  });
});

describe("copy chart", () => {
  it("draws one path per column on a dollar scale", () => {
    const geometry = copyChartGeometry(record().curve)!;
    expect(geometry.paths).toHaveLength(3);
    expect(geometry.paths[0]!.startsWith("M0.0,")).toBe(true);
    expect(geometry.ticks.length).toBeGreaterThanOrEqual(3);
    expect(geometry.ticks.every((tick) => /^\$\d+(\.\d)?K$/.test(tick.label))).toBe(true);
    expect(fmtThousands(12500)).toBe("$12.5K");
    expect(fmtThousands(10000)).toBe("$10K");
    expect(geometry.years.map((year) => year.label)).toEqual(["2021", "2026"]);
    expect(copyChartGeometry([["2020-01-01", 1, 1]])).toBeNull();
  });
});
