import { describe, expect, it } from "vitest";

import { better, groupByCompany, isAwardTitle, isBaitTitle, isForeignLanguage, marketHeadlines, namesPastYear, plainStory, titleKey, withoutShown } from "@/lib/wire-companies";
import type { WireItem } from "@/lib/wire-shared";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const SINCE = NOW - 24 * 3_600_000;

let n = 0;
function item(partial: Partial<WireItem>): WireItem {
  n += 1;
  return {
    id: `i${n}`,
    title: `Headline ${n}`,
    url: `https://example.com/${n}`,
    source: "Reuters",
    sourceKind: "publisher",
    publishedAt: "2026-11-10T10:00:00Z",
    excerpt: "",
    excerptOrigin: "",
    tickers: [],
    tone: null,
    topics: [],
    ...partial,
  };
}

describe("wire by company", () => {
  it("drops the French and German copies of a press release", () => {
    expect(isForeignLanguage("Cepheid obtient le marquage CE au titre du règlement IVDR")).toBe(true);
    expect(isForeignLanguage("Cepheid wird CE-Kennzeichnung gemäß IVDR für das Panel verliehen")).toBe(true);
    expect(isForeignLanguage("Cepheid Achieves CE Marking Under IVDR for Xpert Respiratory Panel")).toBe(false);
    expect(isForeignLanguage("Nestlé names new CEO")).toBe(false);
    expect(isForeignLanguage("Sanofi: resultados del tercer trimestre de 2026")).toBe(true);
    expect(isForeignLanguage("Volkswagen erhöht Prognose")).toBe(true);
  });

  it("keeps English headlines that happen to contain foreign-looking words", () => {
    for (const title of [
      "Las Vegas Sands beats estimates",
      "Wildfires near Los Angeles hit insurers",
      "MIT spinout raises $50 million",
      "Con Edison raises dividend",
      "TSMC shrinks die size for N2",
      "Two die in factory blast",
      "Investors pour money into bond ETFs",
      "RBI's Das signals rate cut",
      "Uma Thurman joins board",
      "Para Resources sale",
      "Die-cast toy maker files IPO",
      "Société Générale Q3",
    ]) {
      expect(isForeignLanguage(title), title).toBe(false);
    }
  });

  it("treats the same story with a publisher suffix as one", () => {
    expect(titleKey("Fed holds rates steady - Reuters")).toBe(titleKey("Fed holds rates steady"));
    expect(titleKey("Fed holds rates steady | CNBC")).toBe(titleKey("Fed holds rates steady"));
  });

  it("counts a story once per company even when two feeds carried it", () => {
    const groups = groupByCompany(
      [
        item({ title: "Cepheid Achieves CE Marking", tickers: ["DHR"] }),
        item({ title: "Cepheid achieves CE marking!", tickers: ["DHR"] }),
        item({ title: "Danaher beats on earnings", tickers: ["DHR"] }),
      ],
      { sinceMs: SINCE, quotes: { DHR: { pct: 2.1, name: "Danaher" } } },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ ticker: "DHR", name: "Danaher", count: 2, pct: 2.1 });
    expect(titleKey("Cepheid Achieves CE Marking")).toBe(titleKey("Cepheid achieves CE marking!"));
  });

  it("leaves out a lone press release on a quiet stock, but keeps followed companies and big movers", () => {
    const groups = groupByCompany(
      [
        item({ title: "Quiet Co names a partner", tickers: ["QUIET"], sourceKind: "press_release" }),
        item({ title: "Mover Co files an 8-K", tickers: ["MOVE"], sourceKind: "press_release" }),
        item({ title: "Mine Co opens a plant", tickers: ["MINE"], sourceKind: "press_release" }),
      ],
      {
        sinceMs: SINCE,
        quotes: { QUIET: { pct: 0.2, name: "Quiet" }, MOVE: { pct: 9, name: "Mover" }, MINE: { pct: 0.1, name: "Mine" } },
        mine: new Set(["MINE"]),
      },
    );
    expect(groups.map((group) => group.ticker)).toEqual(["MINE", "MOVE"]);
  });

  it("ranks by coverage plus move and shows publisher stories before press releases", () => {
    const groups = groupByCompany(
      [
        item({ title: "A1", tickers: ["AAA"] }),
        item({ title: "B1", tickers: ["BBB"] }),
        item({ title: "B2", tickers: ["BBB"] }),
        item({ title: "B3 release", tickers: ["BBB"], sourceKind: "press_release", publishedAt: "2026-11-10T11:00:00Z" }),
        item({ title: "Old", tickers: ["OLD"], publishedAt: "2026-11-08T10:00:00Z" }),
      ],
      { sinceMs: SINCE, quotes: {} },
    );
    expect(groups.map((group) => group.ticker)).toEqual(["BBB", "AAA"]);
    expect(groups[0]!.items[2]!.title).toBe("B3 release");
  });

  it("keeps market headlines to publisher stories with no company, one copy each", () => {
    const rows = marketHeadlines(
      [
        item({ title: "Fed holds rates", topics: ["macro"] }),
        item({ title: "Fed holds rates.", topics: ["macro"] }),
        item({ title: "Fujikura updates FY2027 outlook" }),
        item({ title: "Kavalan Enters Ghana", sourceKind: "press_release" }),
        item({ title: "Nvidia falls", tickers: ["NVDA"] }),
      ],
      { sinceMs: SINCE },
    );
    expect(rows.map((row) => row.title)).toEqual(["Fed holds rates"]);
  });
});

describe("bait headlines", () => {
  it("knows a headline written to be clicked from one that says what happened", () => {
    for (const title of [
      "Dear Nebius stock fans, mark your calendars for November 12",
      "Nebius Group (NBIS) is rocketing 15% higher — here’s what could move shares next",
      "Analyst says Sandisk Corp. (SNDK) offers more than 100% upside. Should you buy?",
      "Samsara Inc. (IOT) outpaces stock market gains: What you should know",
      "Why CoreWeave Inc. (CRWV) is surging this much",
      "I'd buy Dutch Bros shares without any hesitation right now",
      "Here's how much a $1000 investment in Badger Meter made 10 years ago would be worth today",
      "Nebius stock dropped 30% in a week. Is it time to sell or load up?",
      "Is trending stock Abbott Laboratories (ABT) a buy now?",
    ]) {
      expect(isBaitTitle(title), title).toBe(true);
    }
    for (const title of [
      "Nvidia worth 25% less without Jensen Huang as CEO, Yorkville Ives says",
      "Tesla extends Cybertruck production to clear backlog, Musk says",
      "Affirm shares jump as buy now, pay later volumes grow",
      "Oracle stock gets a boost after CoreWeave earnings",
      "Super Micro names new CFO in Q4 shake-up",
      "Pfizer deal could be worth up to $10 billion",
      "Will the Fed hold rates in December?",
      "Musk to sell $5 billion of Tesla stock?",
      "Jensen Huang: I think demand is still rising",
    ]) {
      expect(isBaitTitle(title), title).toBe(false);
    }
  });

  it("tells a bait story by the publisher's plain first sentence, or leaves it out", () => {
    const told = plainStory(
      item({
        title: "Oracle stock gets a boost. Here's what's next for tech giant's AI push.",
        excerpt: "Oracle Chief Financial Officer Hilary Maxson said the company will add 7 gigawatts of data center capacity. More follows.",
        excerptOrigin: "publisher",
      }),
    );
    expect(told?.title).toBe("Oracle Chief Financial Officer Hilary Maxson said the company will add 7 gigawatts of data center capacity.");
    // Site boilerplate and a question are not a plain sentence: the story is left out rather than retold.
    expect(plainStory(item({ title: "Why CoreWeave Inc. (CRWV) is surging this much", excerpt: "CoreWeave Inc. (NASDAQ:CRWV) is on the AI Stocks Dominating List of Biggest Winners.", excerptOrigin: "publisher" }))).toBeNull();
    expect(plainStory(item({ title: "Should you buy Airbnb?", excerpt: "Is there more upside ahead?", excerptOrigin: "publisher" }))).toBeNull();
    // A plain headline is untouched.
    const plain = item({ title: "Tesla extends Cybertruck production to clear backlog" });
    expect(plainStory(plain)).toBe(plain);
  });

  it("shows only plain stories on a company's card, still counting every one", () => {
    const groups = groupByCompany(
      [
        item({ tickers: ["NBIS"], title: "Dear Nebius stock fans, mark your calendars for November 12" }),
        item({ tickers: ["NBIS"], title: "Nebius signs a $3 billion capacity deal with Meta" }),
      ],
      { sinceMs: SINCE, quotes: { NBIS: { pct: 15, name: "Nebius Group" } } },
    );
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.items.map((story) => story.title)).toEqual(["Nebius signs a $3 billion capacity deal with Meta"]);
  });

  it("leaves a story that names a past year as its news off the company's card", () => {
    const groups = groupByCompany(
      [
        item({ tickers: ["MSFT"], title: "SHI recognized as the winner of 2025 Microsoft Americas Regional Device Partner of the year" }),
        item({ tickers: ["MSFT"], title: "Microsoft plans to pay its own way to power data centers" }),
      ],
      { sinceMs: SINCE, quotes: { MSFT: { pct: -2.2, name: "Microsoft" } } },
    );
    expect(groups[0]?.count).toBe(1);
    expect(groups[0]?.items.map((story) => story.title)).toEqual(["Microsoft plans to pay its own way to power data centers"]);
  });
});

describe("namesPastYear", () => {
  const nov = Date.parse("2026-11-12T12:00:00Z");
  const jan = Date.parse("2027-01-04T15:00:00Z");
  it("flags a past year told as the news", () => {
    expect(namesPastYear("SHI recognized as the winner of 2025 Microsoft Americas Regional Device Partner of the year", nov)).toBe(true);
    expect(namesPastYear("Acme posts Q3 2025 results", nov)).toBe(true);
    expect(namesPastYear("Acme's FY2024 report is out", nov)).toBe(true);
  });
  it("keeps this year, a later year, comparisons and history", () => {
    expect(namesPastYear("SHI recognized as the winner of 2026 Microsoft Partner of the year", nov)).toBe(false);
    expect(namesPastYear("Tesla extends Cybertruck run through summer 2027", nov)).toBe(false);
    expect(namesPastYear("Guidance for 2025 to 2027 raised", nov)).toBe(false);
    expect(namesPastYear("Stocks have their best week since 2024", nov)).toBe(false);
    expect(namesPastYear("Chip stocks fall back to 2025 levels", nov)).toBe(false);
    expect(namesPastYear("Is this 2000 all over again?", nov)).toBe(false);
    expect(namesPastYear("Nvidia sells $2025 million of bonds", nov)).toBe(false);
    expect(namesPastYear("Acme to cut 2,025 jobs", nov)).toBe(false);
    expect(namesPastYear("No year at all", nov)).toBe(false);
    for (const title of ["Worst day since April 2025", "Up 200% since Jan. 2025", "Highest since its 2021 IPO", "Rivian falls below 2021 IPO price", "Stock trades at 2024's high", "Shares back near mid-2025 prices"]) {
      expect(namesPastYear(title, nov)).toBe(false);
    }
    // Last year's fourth quarter or fiscal year can still be news well into this one.
    expect(namesPastYear("Toyota FY2025 results beat", Date.parse("2026-05-10T12:00:00Z"))).toBe(false);
  });
  it("lets the year just ended stay news until March", () => {
    expect(namesPastYear("The best stocks of 2026", jan)).toBe(false);
    expect(namesPastYear("The best stocks of 2025", jan)).toBe(true);
    expect(namesPastYear("The best stocks of 2026", Date.parse("2027-04-01T15:00:00Z"))).toBe(true);
  });
});

describe("award notes", () => {
  it("are told apart and never lead a company's stories", () => {
    expect(isAwardTitle("SHI recognized as the winner of 2026 Microsoft Americas Regional Device Partner of the year")).toBe(true);
    expect(isAwardTitle("Acme wins 2026 Best Places to Work award")).toBe(true);
    expect(isAwardTitle("Microsoft stock suddenly has an Anthropic problem")).toBe(false);
    expect(isAwardTitle("Lockheed wins $2 billion Army contract award")).toBe(false);
    const award = item({ tickers: ["MSFT"], title: "SHI recognized as the winner of 2026 Microsoft Partner of the year", publishedAt: new Date(NOW - 3_600_000).toISOString() });
    const story = item({ tickers: ["MSFT"], title: "Microsoft stock suddenly has an Anthropic problem", publishedAt: new Date(NOW - 5 * 3_600_000).toISOString() });
    expect([award, story].sort(better)[0]).toBe(story);
  });
});

describe("withoutShown", () => {
  const base = { name: null, pct: null, count: 3, latestAt: "", mine: false, tones: { positive: 0, negative: 0, neutral: 0 } };
  it("takes out the stories already shown above, by id and by title, and drops a card left empty", () => {
    const top = item({ title: "Nvidia faces governance risks", tickers: ["NVDA"] });
    const next = item({ title: "Nvidia fallout in Taiwan", tickers: ["NVDA"] });
    const copy = item({ title: "Nvidia faces governance risks - Reuters", tickers: ["NVDA"] });
    const lone = item({ title: "SpaceX investors confront a reality", tickers: ["SPCX"] });
    const groups = [
      { ...base, ticker: "NVDA", items: [top, copy, next] },
      { ...base, ticker: "SPCX", items: [lone] },
      { ...base, ticker: "MINE", mine: true, items: [lone] },
    ];
    const out = withoutShown(groups, [top, lone]);
    expect(out.map((group) => group.ticker)).toEqual(["NVDA", "MINE"]);
    expect(out[0]!.items.map((story) => story.title)).toEqual(["Nvidia fallout in Taiwan"]);
    expect(out[1]!.items).toEqual([]);
    expect(withoutShown(groups, [])).toBe(groups);
  });
});
