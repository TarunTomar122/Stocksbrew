import { describe, expect, it } from "vitest";

import { groupByCompany, isBaitTitle, isForeignLanguage, marketHeadlines, plainStory, titleKey } from "@/lib/wire-companies";
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
});
