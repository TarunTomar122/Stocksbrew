import { describe, expect, it } from "vitest";

import { buildCandidates, cardLogos, cardSummary, cardText, checkCardPrivacy, firstPerson, firstSentence, pickVariant, type ShareFacts } from "./cards";
import { readCard, withoutLogos } from "./store";
import { variantKey, type ShareCard } from "./types";

const XRAY: ShareFacts = {
  kind: "xray",
  facts: {
    companies: [
      { name: "NVIDIA", ticker: "NVDA", sector: "Technology", pct: 14.2, directPct: 9.1, fundPct: 5.1, funds: ["QQQ", "VOO"] },
      { name: "Microsoft", ticker: "MSFT", sector: "Technology", pct: 8.4, directPct: 0, fundPct: 8.4, funds: ["QQQ", "VOO"] },
      { name: "Apple", ticker: "AAPL", sector: "Technology", pct: 7.9, directPct: 4, fundPct: 3.9, funds: ["VOO"] },
    ],
    maxDirectPct: 12,
    sectors: [
      { sector: "Technology", pct: 41, benchmarkPct: 33 },
      { sector: "Financials", pct: 12, benchmarkPct: 13 },
    ],
    overlap: { a: "QQQ", b: "VOO", pct: 44, shared: 101 },
    closedPct: 0,
    filingDates: ["2026-06-30", "2026-08-31"],
  },
};

const STRESS: ShareFacts = {
  kind: "stress",
  facts: {
    episodes: [
      { id: "covid-crash", name: "Covid crash", start: "2020-02-19", end: "2020-03-23", kind: "fall", portfolio: -36, market: -25.5, ratio: 1.41, coveredPct: 100, missing: null, lead: { name: "Exxon", pct: -55, fund: false } },
      { id: "rates-2022", name: "2022 rate-hike slide", start: "2022-01-03", end: "2022-10-12", kind: "fall", portfolio: -24, market: -24.5, ratio: 0.98, coveredPct: 100, missing: null, lead: { name: "Nvidia", pct: -62, fund: false } },
      { id: "banks-2023", name: "2023 bank scare", start: "2023-03-08", end: "2023-03-13", kind: "fall", portfolio: -1, market: -4.5, ratio: 0.22, coveredPct: 80, missing: "not-yet", lead: null },
      { id: "covid-rebound", name: "2020 rebound", start: "2020-03-23", end: "2020-08-18", kind: "rise", portfolio: 60, market: 51, ratio: 1.18, coveredPct: 100, missing: null, lead: { name: "Nvidia", pct: 110, fund: false } },
    ],
  },
};

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const m = ((10 + i) % 12) + 1;
  const y = 2026 + Math.floor((10 + i) / 12);
  return `${y}-${String(m).padStart(2, "0")}`;
});

const DIVIDENDS: ShareFacts = {
  kind: "dividends",
  facts: {
    total: 1220,
    confirmed: 310,
    months: MONTHS.map((month, i) => ({ month, total: i === 4 ? 260 : i % 3 === 0 ? 120 : 60, names: i === 4 ? ["JPMorgan", "Exxon Mobil", "Microsoft", "Apple"] : ["Apple"] })),
    payers: 5,
    stocks: 7,
    yieldOnPrice: 2.14,
    raises: [
      { name: "Costco", ticker: "COST", changePct: 12.4 },
      { name: "Microsoft", ticker: "MSFT", changePct: 10 },
    ],
    comparable: 5,
    asOf: "2026-11-10T21:00:00Z",
  },
};

const PORTFOLIO: ShareFacts = {
  kind: "portfolio",
  facts: {
    positions: [
      { name: "Nvidia", ticker: "NVDA", sector: "Technology", pct: 21 },
      { name: "Microsoft", ticker: "MSFT", sector: "Technology", pct: 15 },
      { name: "JPMorgan Chase", ticker: "JPM", sector: "Financials", pct: 12 },
      { name: "Exxon Mobil", ticker: "XOM", sector: "Energy", pct: 9 },
    ],
    top3: 48,
    sectors: [{ sector: "Technology", pct: 52, benchmarkPct: 33 }],
    hasFunds: false,
    beta: 1.27,
    volatility: 24,
    benchmarkVolatility: 16,
    pricesAsOf: "2026-11-10",
  },
};

const MEMO: ShareFacts = {
  kind: "memo",
  facts: {
    weekKey: "2026-45",
    monday: "2026-11-02",
    friday: "2026-11-06",
    complete: true,
    performance: "Your holdings rose 2.1% this week, against a 1.4% rise in the S&P 500.",
    drivers: "Nvidia added the most: it rose 8.1%, worth 1.2 points of the week's move.",
  },
};

/** A memo with the page's picture of the week: the line against the S&P 500 and who moved it. */
const MEMO_VIEW: ShareFacts = {
  kind: "memo",
  facts: {
    ...(MEMO.facts as Extract<ShareFacts, { kind: "memo" }>["facts"]),
    week: {
      headline: "Up this week, 0.7 points ahead of the S&P 500",
      portfolioPct: 2.1,
      marketPct: 1.4,
      curve: [
        { day: "2026-10-30", portfolio: 0, market: 0 },
        { day: "2026-11-02", portfolio: 0.8, market: 0.5 },
        { day: "2026-11-03", portfolio: 1.6, market: 1.1 },
        { day: "2026-11-06", portfolio: 2.1, market: 1.4 },
      ],
      movers: [
        { ticker: "NVDA", name: "Nvidia", pct: 8.1, points: 1.2 },
        { ticker: "MSFT", name: "Microsoft", pct: 3, points: 0.4 },
        { ticker: "XOM", name: "Exxon Mobil", pct: -4.2, points: -0.5 },
      ],
    },
  },
};

const ALL = [XRAY, STRESS, DIVIDENDS, PORTFOLIO, MEMO, MEMO_VIEW];
const NAMED = { hideNames: false, showAmounts: false };
const ANON = { hideNames: true, showAmounts: false };

function card(facts: ShareFacts, cardId: string, options = NAMED): ShareCard {
  const candidate = buildCandidates(facts, "2026-11-11").find((item) => item.cardId === cardId);
  expect(candidate, `${facts.kind}/${cardId}`).toBeTruthy();
  return pickVariant(candidate!, options)!.card;
}

describe("share cards", () => {
  it("say the x-ray read in the first person", () => {
    const top = card(XRAY, "top");
    expect(top.figure).toEqual({ value: "14%", label: "of my portfolio is NVIDIA, funds counted", tone: "flat" });
    expect(top.headline).toBe("I bought 9.1% directly; my funds add the rest.");
    expect(cardSummary(top)).toBe("14% of my portfolio is NVIDIA, funds counted. I bought 9.1% directly; my funds add the rest.");
    expect(top.bars?.rows.map((row) => row.ticker)).toEqual(["NVDA", "MSFT", "AAPL"]);
    expect(card(XRAY, "sector").headline).toBe("That is 8 points more than the S&P 500's 33%.");
    expect(card(XRAY, "sector").bars?.rows[0]?.benchmark).toBe(33);
    expect(card(XRAY, "overlap").figure?.label).toBe("overlap between QQQ and VOO");
  });

  it("say a stress episode with the S&P 500 beside it, and 'about the same' when it is", () => {
    expect(card(STRESS, "rates-2022").headline).toBe("About the same as the S&P 500 over the same days.");
    expect(card(STRESS, "covid-crash").figure).toEqual({ value: "−36%", label: "my portfolio in the Covid crash", tone: "down" });
    expect(card(STRESS, "covid-crash").headline).toBe("The S&P 500 fell 26% over the same days.");
    expect(card(STRESS, "banks-2023").headline).toBe("That counts the 80% of my portfolio that was trading then. The S&P 500 fell 4.5% over the same days.");
    expect(card(STRESS, "banks-2023").figure?.label).toBe("what I own in the 2023 bank scare");
    expect(card(STRESS, "rates-2022").bars?.rows.map((row) => row.display)).toEqual(["−24%", "−25%"]);
  });

  it("lead dividends with a yield, and say dollars only when asked", () => {
    const pct = card(DIVIDENDS, "income");
    expect(pct.figure).toEqual({ value: "2.1%", label: "a year in dividends at today's prices", tone: "flat" });
    expect(pct.headline).toBe("Five of my seven stocks pay a regular dividend.");
    expect(cardText(pct).join(" ")).not.toContain("$");
    const amounts = card(DIVIDENDS, "income", { hideNames: false, showAmounts: true });
    expect(amounts.figure?.value).toBe("$1,220");
    expect(amounts.headline).toBe("That is about 2.1% a year at today's prices.");
    const month = card(DIVIDENDS, "month");
    expect(month.figure).toEqual({ value: "21%", label: "of the year's dividends land in March", tone: "flat" });
    expect(month.headline).toBe("March's payments come from JPMorgan, Exxon Mobil, Microsoft and others.");
    expect(month.bars?.rows.filter((row) => row.highlight).map((row) => row.label)).toEqual(["M"]);
    const raises = card(DIVIDENDS, "raises");
    expect(raises.figure).toEqual({ value: "+12%", label: "the dividend raise at Costco this past year", tone: "up" });
    expect(raises.headline).toBe("Two of my five dividend stocks raised their payments over the past year.");
  });

  it("say the portfolio's shape and the memo's week", () => {
    const concentration = card(PORTFOLIO, "concentration");
    expect(concentration.figure?.value).toBe("48%");
    expect(concentration.headline).toBe("Nvidia alone is 21%.");
    expect(concentration.bars?.rows.map((row) => row.ticker)).toEqual(["NVDA", "MSFT", "JPM", "XOM"]);
    expect(card(PORTFOLIO, "sector").headline).toBe("That is 19 points more than the S&P 500's 33%.");
    const swing = card(PORTFOLIO, "swing");
    expect(swing.figure?.value).toBe("1.3%");
    expect(swing.headline).toBe("My ups and downs over a year are 24%, against 16% for the S&P 500.");
    expect(swing.bars?.style).toBe("versus");
    // A memo written before the page had a picture keeps the words-only card.
    const old = card(MEMO, "week");
    expect(old.headline).toBe("My holdings rose 2.1% this week, against a 1.4% rise in the S&P 500.");
    expect(old.figure ?? null).toBeNull();
  });

  it("draws the memo's week: the big number, the line against the S&P 500, and the movers as logo chips", () => {
    const week = card(MEMO_VIEW, "week");
    expect(week.figure).toEqual({ value: "+2.1%", label: "my holdings this week", tone: "up" });
    expect(week.headline).toBe("Up this week, 0.7 points ahead of the S&P 500");
    expect(week.curve?.mine).toEqual([0, 0.8, 1.6, 2.1]);
    expect(week.curve?.market).toEqual([0, 0.5, 1.1, 1.4]);
    expect(week.chips?.map((chip) => `${chip.ticker} ${chip.display}`)).toEqual(["NVDA +8.1%", "MSFT +3%", "XOM −4.2%"]);
    const movers = card(MEMO_VIEW, "movers");
    expect(movers.figure).toEqual({ value: "+1.2", label: "points of my week came from Nvidia", tone: "up" });
    expect(movers.headline).toBe("Exxon Mobil took 0.5 points off.");
    expect(movers.bars?.style).toBe("signed");
    expect(movers.bars?.rows.map((row) => row.display)).toEqual(["+1.2", "+0.4", "−0.5"]);
    const anon = card(MEMO_VIEW, "movers", ANON);
    expect(anon.headline).toBe("My biggest drag took 0.5 points off.");
    expect(anon.bars?.rows.map((row) => row.label)).toEqual(["Holding A", "Holding B", "Holding C"]);
    expect(card(MEMO_VIEW, "week", ANON).chips?.map((chip) => chip.label)).toEqual(["Holding A", "Holding B", "Holding C"]);
  });

  it("never print a dollar amount or a share count by default, on any card", () => {
    for (const facts of ALL) {
      for (const candidate of buildCandidates(facts, "2026-11-11")) {
        for (const [key, variant] of Object.entries(candidate.variants)) {
          if (key.endsWith("amounts")) continue;
          const text = cardText(variant.card).join(" | ");
          expect(text, `${facts.kind}/${candidate.cardId}/${key}`).not.toMatch(/\$|dollar|\bshares?\b/i);
        }
      }
    }
  });

  it("leave out every company and fund name when names are hidden", () => {
    const names = ["NVIDIA", "NVDA", "Microsoft", "MSFT", "Apple", "AAPL", "QQQ", "VOO", "Exxon", "XOM", "Nvidia", "Costco", "COST", "JPMorgan", "JPM", "JPMorgan Chase", "Exxon Mobil"];
    for (const facts of ALL) {
      for (const candidate of buildCandidates(facts, "2026-11-11")) {
        if (!candidate.hasNames) continue;
        const anon = candidate.variants[variantKey(ANON)]!.card;
        const text = cardText(anon).join(" | ");
        for (const name of names) expect(text, `${facts.kind}/${candidate.cardId}`).not.toMatch(new RegExp(`\\b${name}\\b`));
        // No logos either: a logo names the company as plainly as its name.
        expect(cardLogos(anon), `${facts.kind}/${candidate.cardId}`).toEqual([]);
      }
    }
    expect(card(XRAY, "top", ANON).figure?.label).toBe("of my portfolio is my biggest company, funds counted");
    expect(card(XRAY, "top", ANON).bars?.rows[0]?.label).toBe("#1 · Technology");
  });

  it("drop a variant that would leak, and a card whose safe version leaks", () => {
    const leaky: ShareFacts = { kind: "memo", facts: { ...(MEMO.facts as Extract<ShareFacts, { kind: "memo" }>["facts"]), performance: "Your holdings gained $2,400 this week." } };
    expect(buildCandidates(leaky, "2026-11-11")).toEqual([]);
    const fake = card(XRAY, "top");
    expect(checkCardPrivacy({ ...fake, lines: [{ text: "I hold 120 shares of it.", tone: "flat" }] }, NAMED)).toHaveLength(1);
    expect(checkCardPrivacy({ ...fake, bars: null }, ANON, ["NVIDIA"])).toEqual(["name: NVIDIA"]);
    // A named card's logos are refused outright once names are hidden.
    expect(checkCardPrivacy({ ...fake, figure: null, bars: { ...fake.bars!, rows: fake.bars!.rows.map((row) => ({ ...row, label: "#1" })) } }, ANON, [])).toEqual(["logo: NVDA", "logo: MSFT", "logo: AAPL"]);
    // The big number is checked like every other word on the card.
    expect(checkCardPrivacy({ ...fake, figure: { value: "$2,400", label: "in my biggest company", tone: "flat" } }, NAMED)).toHaveLength(1);
  });

  it("falls back off an option the card does not have", () => {
    const candidate = buildCandidates(XRAY, "2026-11-11").find((item) => item.cardId === "sector")!;
    expect(candidate.hasNames).toBe(false);
    expect(pickVariant(candidate, { hideNames: true, showAmounts: true })?.options).toEqual(NAMED);
  });

  it("turns the memo's second person into the first, or gives up", () => {
    expect(firstPerson("Seven of your 10 holdings rose 1%.")).toBe("Seven of my 10 holdings rose 1%.");
    expect(firstPerson("Check what you hold.")).toBeNull();
  });

  it("gives each variant its own hash", () => {
    const candidate = buildCandidates(XRAY, "2026-11-11")[0]!;
    const hashes = Object.values(candidate.variants).map((variant) => variant.hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("reads a stored card back and refuses a broken one", () => {
    const stored = card(STRESS, "rates-2022");
    const norm = (value: ShareCard) => ({
      ...value,
      bars: value.bars ? { ...value.bars, rows: value.bars.rows.map((row) => ({ ...row, highlight: row.highlight === true, ticker: row.ticker ?? null, benchmark: row.benchmark ?? null })) } : null,
      figure: value.figure ?? null,
      curve: value.curve ?? null,
      chips: value.chips ?? null,
    });
    expect(readCard(JSON.parse(JSON.stringify(stored)))).toEqual(norm(stored));
    const week = card(MEMO_VIEW, "week");
    expect(readCard(JSON.parse(JSON.stringify(week)))).toEqual(norm(week));
    // A card saved before cards had pictures reads back without them.
    const { figure: _f, curve: _c, chips: _ch, ...old } = week;
    expect(readCard(JSON.parse(JSON.stringify(old)))).toMatchObject({ figure: null, curve: null, chips: null, headline: week.headline });
    // Bad visual parts are dropped, not trusted: a ticker that could not be one, a curve whose days do not line up.
    const bad = readCard({ ...JSON.parse(JSON.stringify(week)), chips: [{ ticker: "<img>", label: "x", display: "+1%", tone: "up" }], curve: { title: "t", days: ["a"], mine: [0, 1], market: null } });
    expect(bad?.chips?.[0]?.ticker).toBeNull();
    expect(bad?.curve).toBeNull();
    expect(withoutLogos(week).chips?.every((chip) => chip.ticker === null)).toBe(true);
    expect(readCard({ ...stored, v: 2 })).toBeNull();
    expect(readCard({ ...stored, kind: "secret" })).toBeNull();
    expect(readCard(null)).toBeNull();
  });

  it("keeps holdings the memo leaves out off the card, named or not", () => {
    const memo: ShareFacts = {
      kind: "memo",
      facts: { ...(MEMO.facts as Extract<ShareFacts, { kind: "memo" }>["facts"]), performance: "Your holdings rose 2.1% this week, against a 1.4% rise in the S&P 500. Nvidia, Apple and Tesla are left out because they have no share count.", drivers: null },
    };
    const [candidate] = buildCandidates(memo, "2026-11-11");
    const text = cardText(candidate!.variants["named-pct"]!.card).join(" ");
    expect(text).not.toMatch(/Nvidia|Apple|Tesla|left out/);
    expect(firstSentence("It rose 2.1%. Then it fell.")).toBe("It rose 2.1%.");
  });

  it("does not mistake 3M or Dollar General for money", () => {
    const facts: ShareFacts = {
      kind: "xray",
      facts: { ...(XRAY.facts as Extract<ShareFacts, { kind: "xray" }>["facts"]), companies: [{ name: "3M", ticker: "MMM", sector: "Industrials", pct: 12, directPct: 12, fundPct: 0, funds: [] }, { name: "Dollar General", ticker: "DG", sector: "Consumer Staples", pct: 8, directPct: 8, fundPct: 0, funds: [] }] },
    };
    const top = buildCandidates(facts, "2026-11-11").find((item) => item.cardId === "top");
    expect(top?.variants["named-pct"]?.card.headline).toBe("3M is my biggest company, with what my funds hold counted.");
    expect(checkCardPrivacy(top!.variants["named-pct"]!.card, NAMED, [], ["3M", "Dollar General"])).toEqual([]);
    expect(checkCardPrivacy({ ...top!.variants["named-pct"]!.card, headline: "It pays €500 a year." }, NAMED, [], ["3M", "Dollar General"])).toHaveLength(1);
  });

  it("stores month bars as shares of the year unless amounts are on", () => {
    const pct = card(DIVIDENDS, "income");
    expect(pct.bars?.rows[4]?.value).toBe(21.3);
    expect(pct.bars?.rows.every((row) => row.value <= 100)).toBe(true);
    expect(JSON.stringify(pct)).not.toMatch(/\b(260|120|1220)\b/);
    const amounts = card(DIVIDENDS, "income", { hideNames: false, showAmounts: true });
    expect(amounts.bars?.rows[4]?.value).toBe(260);
  });

  it("says the gap as the printed numbers show it, and never promises an S&P 500 line it cannot draw", () => {
    const portfolio = PORTFOLIO.facts as Extract<ShareFacts, { kind: "portfolio" }>["facts"];
    // 12.6% prints as 13% and 11.4% as 11%: the gap is the 2 points a reader can see.
    const gap = card({ kind: "portfolio", facts: { ...portfolio, sectors: [{ sector: "Energy", pct: 22.6, benchmarkPct: 11.4 }] } }, "sector");
    expect(gap.figure?.value).toBe("23%");
    expect(gap.headline).toBe("That is 12 points more than the S&P 500's 11%.");
    const memo = MEMO_VIEW.facts as Extract<ShareFacts, { kind: "memo" }>["facts"];
    const noMarket = card({ kind: "memo", facts: { ...memo, week: { ...memo.week!, curve: memo.week!.curve.map((point, i) => ({ ...point, market: i === 2 ? null : point.market })) } } }, "week");
    expect(noMarket.curve?.market).toBeNull();
    expect(noMarket.curve?.title).toBe("My week");
    expect(cardSummary(card(MEMO_VIEW, "week"))).toBe("+2.1% my holdings this week. Up this week, 0.7 points ahead of the S&P 500.");
  });

  it("says one raise and one payer plainly", () => {
    const dividends = DIVIDENDS.facts as Extract<ShareFacts, { kind: "dividends" }>["facts"];
    expect(card({ kind: "dividends", facts: { ...dividends, raises: [dividends.raises[0]!], comparable: 4 } }, "raises").headline).toBe(
      "It is the only one of my four dividend stocks that raised its payment over the past year.",
    );
    const one = card({ kind: "dividends", facts: { ...dividends, yieldOnPrice: null, payers: 1, stocks: 1 } }, "income");
    expect(one.figure ?? null).toBeNull();
    expect(one.headline).toBe("My one stock pays a regular dividend.");
  });

  it("says all, or one, in place of 'Four of my 4'", () => {
    const facts = { ...(DIVIDENDS.facts as Extract<ShareFacts, { kind: "dividends" }>["facts"]), yieldOnPrice: null, payers: 4, stocks: 4 };
    expect(card({ kind: "dividends", facts }, "income").figure).toEqual({ value: "All 4", label: "stocks I own pay a regular dividend", tone: "flat" });
    expect(card({ kind: "dividends", facts: { ...facts, total: 0 } }, "income").headline).toBe("All four of my stocks pay a regular dividend.");
    expect(card({ kind: "dividends", facts: { ...facts, total: 0, payers: 1, stocks: 1 } }, "income").headline).toBe("My one stock pays a regular dividend.");
  });
});
