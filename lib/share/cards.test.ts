import { describe, expect, it } from "vitest";

import { buildCandidates, cardText, checkCardPrivacy, firstPerson, firstSentence, pickVariant, type ShareFacts } from "./cards";
import { readCard } from "./store";
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
      { name: "Costco", changePct: 12.4 },
      { name: "Microsoft", changePct: 10 },
    ],
    comparable: 5,
    asOf: "2026-11-10T21:00:00Z",
  },
};

const PORTFOLIO: ShareFacts = {
  kind: "portfolio",
  facts: {
    positions: [
      { name: "Nvidia", sector: "Technology", pct: 21 },
      { name: "Microsoft", sector: "Technology", pct: 15 },
      { name: "JPMorgan Chase", sector: "Financials", pct: 12 },
      { name: "Exxon Mobil", sector: "Energy", pct: 9 },
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

const ALL = [XRAY, STRESS, DIVIDENDS, PORTFOLIO, MEMO];
const NAMED = { hideNames: false, showAmounts: false };
const ANON = { hideNames: true, showAmounts: false };

function card(facts: ShareFacts, cardId: string, options = NAMED): ShareCard {
  const candidate = buildCandidates(facts, "2026-11-11").find((item) => item.cardId === cardId);
  expect(candidate, `${facts.kind}/${cardId}`).toBeTruthy();
  return pickVariant(candidate!, options)!.card;
}

describe("share cards", () => {
  it("say the x-ray read in the first person", () => {
    expect(card(XRAY, "top").headline).toBe("Once my funds are counted, NVIDIA is 14% of my portfolio, not the 9.1% I bought directly.");
    expect(card(XRAY, "sector").headline).toBe("Technology is 41% of my portfolio once my funds are counted, against 33% of the S&P 500.");
    expect(card(XRAY, "overlap").headline).toContain("QQQ and VOO overlap by 44%");
  });

  it("say a stress episode with the S&P 500 beside it, and 'about the same' when it is", () => {
    expect(card(STRESS, "rates-2022").headline).toBe("In the 2022 rate-hike slide, my portfolio would have fallen 24%, about the same as the S&P 500.");
    expect(card(STRESS, "covid-crash").headline).toBe("In the Covid crash, my portfolio would have fallen 36% while the S&P 500 fell 26%.");
    expect(card(STRESS, "banks-2023").headline).toContain("the 80% of my portfolio that was trading then");
    expect(card(STRESS, "rates-2022").bars?.rows.map((row) => row.display)).toEqual(["−24%", "−25%"]);
  });

  it("lead dividends with a yield, and say dollars only when asked", () => {
    const pct = card(DIVIDENDS, "income");
    expect(pct.headline).toBe("At today's prices, my stocks pay about 2.1% a year in dividends.");
    expect(cardText(pct).join(" ")).not.toContain("$");
    const amounts = card(DIVIDENDS, "income", { hideNames: false, showAmounts: true });
    expect(amounts.headline).toBe("My stocks should pay me about $1,220 in dividends over the next twelve months.");
    expect(card(DIVIDENDS, "month").headline).toBe("March is my biggest dividend month: 21% of the year's payments, from JPMorgan, Exxon Mobil, Microsoft and others.");
    expect(card(DIVIDENDS, "raises").headline).toBe("Two of my five dividend stocks raised their payments over the past year, led by Costco at 12%.");
  });

  it("say the portfolio's shape and the memo's week", () => {
    expect(card(PORTFOLIO, "concentration").headline).toBe("My three biggest holdings are 48% of my portfolio.");
    expect(card(PORTFOLIO, "sector").headline).toBe("52% of my money is in Technology, against 33% of the S&P 500.");
    expect(card(PORTFOLIO, "swing").headline).toBe("When the S&P 500 moves 1%, my portfolio has tended to move 1.3%.");
    expect(card(MEMO, "week").headline).toBe("My holdings rose 2.1% this week, against a 1.4% rise in the S&P 500.");
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
    const names = ["NVIDIA", "NVDA", "Microsoft", "MSFT", "Apple", "QQQ", "VOO", "Exxon", "Nvidia", "Costco", "JPMorgan", "JPMorgan Chase", "Exxon Mobil"];
    for (const facts of ALL) {
      for (const candidate of buildCandidates(facts, "2026-11-11")) {
        if (!candidate.hasNames) continue;
        const anon = candidate.variants[variantKey(ANON)]!.card;
        const text = cardText(anon).join(" | ");
        for (const name of names) expect(text, `${facts.kind}/${candidate.cardId}`).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
    expect(card(XRAY, "top", ANON).headline).toBe("Once my funds are counted, my biggest company is 14% of my portfolio, not the 9.1% I bought directly.");
    expect(card(XRAY, "top", ANON).bars?.rows[0]?.label).toBe("#1 · Technology");
  });

  it("drop a variant that would leak, and a card whose safe version leaks", () => {
    const leaky: ShareFacts = { kind: "memo", facts: { ...(MEMO.facts as Extract<ShareFacts, { kind: "memo" }>["facts"]), performance: "Your holdings gained $2,400 this week." } };
    expect(buildCandidates(leaky, "2026-11-11")).toEqual([]);
    const fake = card(XRAY, "top");
    expect(checkCardPrivacy({ ...fake, lines: [{ text: "I hold 120 shares of it.", tone: "flat" }] }, NAMED)).toHaveLength(1);
    expect(checkCardPrivacy(fake, ANON, ["NVIDIA"])).toEqual(["name: NVIDIA"]);
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
    expect(readCard(JSON.parse(JSON.stringify(stored)))).toEqual({ ...stored, bars: { ...stored.bars!, rows: stored.bars!.rows.map((row) => ({ ...row, highlight: row.highlight === true })) } });
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
    expect(top?.variants["named-pct"]?.card.headline).toBe("3M is my biggest company at 12% of my portfolio, with my funds counted.");
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

  it("says all, or one, in place of 'Four of my 4'", () => {
    const facts = { ...(DIVIDENDS.facts as Extract<ShareFacts, { kind: "dividends" }>["facts"]), yieldOnPrice: null, payers: 4, stocks: 4 };
    expect(card({ kind: "dividends", facts }, "income").headline).toBe("All four of my stocks pay a regular dividend.");
    expect(card({ kind: "dividends", facts: { ...facts, payers: 1, stocks: 1 } }, "income").headline).toBe("My one stock pays a regular dividend.");
  });
});
