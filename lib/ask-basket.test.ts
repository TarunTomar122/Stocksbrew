import { describe, expect, it } from "vitest";

import {
  BASKET_MAX_LINES,
  detectLens,
  draftBasket,
  evidenceFor,
  finishBasket,
  matchScreens,
  matchThemes,
  thesisTerms,
  tokenize,
  type BasketFacts,
} from "@/lib/ask-basket";
import { auditNumbers } from "@/lib/ask-cards";
import type { InvestmentTheme } from "@/lib/investment-themes";
import type { ThematicScreen } from "@/lib/screens";

function candidate(ticker: string, company: string, role: string, mechanism: string, failure = `${company} loses the contract.`) {
  return { company, ticker, role, benefitMechanism: mechanism, failureCase: failure, stocksbrewLabel: "Strong" };
}

const THEMES: InvestmentTheme[] = [
  {
    slug: "energy",
    name: "Energy and the power grid",
    cardDescription: "Utilities, grid equipment and nuclear power as electricity demand rises.",
    description: "Data centers and electrification are lifting electricity demand for the first time in a generation.",
    resilienceNote: "The idea breaks if data center demand forecasts are cut and utilities defer transmission spending.",
    candidates: [
      candidate("ETN", "Eaton", "Grid equipment", "Eaton sells the switchgear and transformers that utilities need to expand the grid."),
      candidate("PWR", "Quanta Services", "Grid construction", "Quanta builds transmission lines for utilities."),
      candidate("GEV", "GE Vernova", "Turbines and grid", "GE Vernova makes gas turbines and grid electrification equipment."),
      candidate("XOM", "ExxonMobil", "Oil major", "Exxon produces oil and gas."),
      candidate("CCJ", "Cameco", "Uranium", "Cameco mines uranium, the fuel for nuclear reactors."),
    ],
    watchlist: [],
    resources: [],
  },
  {
    slug: "cybersecurity",
    name: "Cybersecurity",
    cardDescription: "Platforms that defend networks, identities and cloud workloads.",
    description: "Security budgets keep growing as attacks get more automated.",
    resilienceNote: "It breaks if platform consolidation compresses pricing.",
    candidates: [candidate("CRWD", "CrowdStrike", "Endpoint", "CrowdStrike sells endpoint security."), candidate("PANW", "Palo Alto Networks", "Platform", "Palo Alto sells a security platform.")],
    watchlist: [],
    resources: [],
  },
];

const SCREENS: ThematicScreen[] = [
  {
    id: "value-quality",
    title: "Cheap quality",
    tagline: "High quality businesses at a discount to their own history",
    hook: "Valuation score in the top third with quality above 70.",
    match_count: 2,
    matches: [
      { instrument_id: "US_ABC", ticker: "ABC", name: "Abc Corp", sector: "Industrials" },
      { instrument_id: "US_DEF", ticker: "DEF", name: "Def Inc", sector: "Utilities" },
    ],
  },
  { id: "momentum-leaders", title: "Momentum leaders", tagline: "Strongest trends", hook: "Above the 200 day average.", match_count: 0, matches: [] },
];

function facts(ticker: string, overrides: Partial<BasketFacts> = {}): BasketFacts {
  return {
    ticker,
    name: `${ticker} Corp`,
    sector: "Industrials",
    industry: "Electrical Equipment",
    description: `${ticker} Corp makes electrical equipment for utilities and data centers. It also runs a services arm.`,
    price: 123.45,
    day_change_pct: -1.2,
    market_cap: 45_600_000_000,
    pe_ttm: 22.4,
    r_1y_pct: 31.5,
    score: 78,
    verdict: "Strong",
    quote_source: "stocksbrew market data",
    quote_as_of: "2026-11-09T20:00:00Z",
    history_source: "Yahoo Finance daily closes, adjusted",
    history_as_of: "2026-11-09",
    ...overrides,
  };
}

describe("tokenize and thesisTerms", () => {
  it("drops filler words and stems plurals", () => {
    expect(tokenize("Companies that benefit from grid spending")).toEqual(["grid"]);
    expect(tokenize("cheap uranium names")).toEqual(["cheap", "uranium"]);
    expect(tokenize("utilities and batteries")).toEqual(["utility", "battery"]);
  });

  it("adds synonyms at half weight and keeps lens words out of the match", () => {
    const terms = thesisTerms("cheap uranium names");
    expect(terms.get("uranium")).toBe(1);
    expect(terms.get("nuclear")).toBe(0.5);
    expect(terms.has("cheap")).toBe(false);
  });

  it("detects the lens", () => {
    expect(detectLens("cheap uranium names")).toBe("cheap");
    expect(detectLens("momentum leaders in chips")).toBe("momentum");
    expect(detectLens("grid spending")).toBeNull();
  });
});

describe("matchThemes", () => {
  it("finds the theme a thesis is about and ignores the others", () => {
    const matches = matchThemes("companies that benefit from grid spending", THEMES);
    expect(matches.map((match) => match.theme.slug)).toEqual(["energy"]);
  });

  it("matches through a synonym", () => {
    expect(matchThemes("cheap uranium names", THEMES).map((match) => match.theme.slug)).toEqual(["energy"]);
  });

  it("returns nothing for an idea outside every theme", () => {
    expect(matchThemes("luxury handbags in europe", THEMES)).toEqual([]);
    expect(matchThemes("", THEMES)).toEqual([]);
  });
});

describe("matchScreens", () => {
  it("uses the lens and skips screens with no matches", () => {
    expect(matchScreens("cheap industrial stocks", SCREENS).map((match) => match.screen.id)).toEqual(["value-quality"]);
    expect(matchScreens("momentum leaders", SCREENS)).toEqual([]);
  });
});

describe("draftBasket", () => {
  it("keeps the theme's companies that speak to the thesis and drops the rest", () => {
    const draft = draftBasket({ thesis: "companies that benefit from grid spending", themes: THEMES, screens: [] });
    const tickers = draft.lines.map((line) => line.ticker);
    expect(tickers).toEqual(expect.arrayContaining(["ETN", "PWR", "GEV"]));
    expect(tickers).not.toContain("XOM");
    expect(draft.built_from).toEqual([{ kind: "theme", name: "Energy and the power grid", href: "/themes/energy" }]);
    expect(draft.idea_risk).toContain("transmission spending");
    expect(draft.lines[0]).toMatchObject({ origin: "theme", origin_label: "Energy and the power grid theme" });
    expect(draft.lines[0]!.breaks_if.length).toBeGreaterThan(0);
  });

  it("adds the model's proposals only for tickers nobody else suggested, and never lets them replace reviewed reasoning", () => {
    const draft = draftBasket({
      thesis: "companies that benefit from grid spending",
      themes: THEMES,
      screens: [],
      proposed: [
        { ticker: "ETN", why_it_fits: "Model reason that should not win.", breaks_if: "Model failure case." },
        { ticker: "hubb", why_it_fits: "Hubbell makes utility connectors and enclosures.", breaks_if: "Utilities defer distribution spending." },
        { ticker: "not a ticker!", why_it_fits: "x", breaks_if: "y" },
        { ticker: "NOREASON", why_it_fits: "", breaks_if: "" },
      ],
    });
    const eaton = draft.lines.find((line) => line.ticker === "ETN")!;
    expect(eaton.origin).toBe("theme");
    expect(eaton.why_it_fits).toContain("switchgear");
    const hubbell = draft.lines.find((line) => line.ticker === "HUBB")!;
    expect(hubbell).toMatchObject({ origin: "proposed", why_it_fits: "Hubbell makes utility connectors and enclosures." });
    expect(draft.lines.some((line) => line.ticker === "NOREASON")).toBe(false);
    expect(draft.lines.length).toBe(4);
  });

  it("builds from proposals alone when no theme or screen fits", () => {
    const draft = draftBasket({
      thesis: "luxury handbags in europe",
      themes: THEMES,
      screens: SCREENS,
      proposed: [{ ticker: "TPR", why_it_fits: "Tapestry owns Coach and sells handbags.", breaks_if: "Aspirational shoppers trade down." }],
      ideaRisk: "A consumer slowdown in the US and China.",
    });
    expect(draft.lines.map((line) => line.ticker)).toEqual(["TPR"]);
    expect(draft.built_from).toEqual([]);
    expect(draft.idea_risk).toBe("A consumer slowdown in the US and China.");
  });

  it("is empty, not invented, when nothing fits and nothing is proposed", () => {
    expect(draftBasket({ thesis: "luxury handbags in europe", themes: THEMES, screens: [] }).lines).toEqual([]);
  });

  it("pulls screen matches in for a lens thesis", () => {
    const draft = draftBasket({ thesis: "cheap industrial stocks", themes: [], screens: SCREENS });
    expect(draft.lines.map((line) => line.ticker)).toEqual(["ABC", "DEF"]);
    expect(draft.lines[0]).toMatchObject({ origin: "screen", origin_label: "Cheap quality screen" });
    expect(draft.built_from).toEqual([{ kind: "screen", name: "Cheap quality", href: "/screens/value-quality" }]);
    expect(draft.lens).toBe("cheap");
  });
});

describe("how narrow the thesis is", () => {
  it("keeps only the companies that mention a narrow subject, even if that is one", () => {
    const draft = draftBasket({ thesis: "cheap uranium names", themes: THEMES, screens: SCREENS });
    expect(draft.lines.map((line) => line.ticker)).toEqual(["CCJ"]);
    expect(draft.lens).toBe("cheap");
    // A screen that shares none of the subject is not added next to a theme.
    expect(draft.built_from.map((item) => item.kind)).toEqual(["theme"]);
  });

  it("takes the whole theme when the thesis names it", () => {
    const draft = draftBasket({ thesis: "cybersecurity stocks", themes: THEMES, screens: [] });
    expect(draft.lines.map((line) => line.ticker).sort()).toEqual(["CRWD", "PANW"]);
  });
});

describe("evidenceFor", () => {
  it("lists only the facts we hold, each with its source and time", () => {
    const rows = evidenceFor(facts("ETN"));
    expect(rows.map((row) => row.label)).toEqual(["Price", "Market value", "P/E, trailing", "1-year return", "Our score"]);
    expect(rows[0]).toEqual({ label: "Price", value: "$123.45 (−1.20% today)", source: "stocksbrew market data", as_of: "2026-11-09T20:00:00Z" });
    expect(rows[1]!.value).toBe("$45.6B");
    expect(rows[3]).toMatchObject({ value: "+31.5%", source: "Yahoo Finance daily closes, adjusted", as_of: "2026-11-09" });
  });

  it("leaves a missing figure out instead of showing a zero", () => {
    const rows = evidenceFor(facts("ETN", { price: null, market_cap: null, pe_ttm: null, r_1y_pct: null, score: null }));
    expect(rows).toEqual([]);
    expect(evidenceFor(facts("ETN", { pe_ttm: -4 })).some((row) => row.label === "P/E, trailing")).toBe(false);
  });
});

describe("finishBasket", () => {
  const draft = draftBasket({
    thesis: "companies that benefit from grid spending",
    themes: THEMES,
    screens: [],
    proposed: [{ ticker: "FAKE", why_it_fits: "A made up company that fits.", breaks_if: "It does not exist." }],
  });

  it("drops and lists a ticker that did not resolve, so nothing unverified is shown as a company", () => {
    const map = new Map<string, BasketFacts | null>(draft.lines.map((line) => [line.ticker, line.ticker === "FAKE" ? null : facts(line.ticker)]));
    const card = finishBasket(draft, map);
    expect(card.card).toBe("basket");
    expect(card.lines.map((line) => line.ticker)).not.toContain("FAKE");
    expect(card.dropped).toEqual([{ ticker: "FAKE", reason: "Not in our US catalog, so we could not check it." }]);
    expect(card.as_of).toBe("2026-11-09T20:00:00Z");
  });

  it("says when a company was left out because its data would not load, not because it is unknown", () => {
    const map = new Map<string, BasketFacts | null>(draft.lines.map((line) => [line.ticker, line.ticker === "ETN" || line.ticker === "FAKE" ? null : facts(line.ticker)]));
    const card = finishBasket(draft, map, { unavailable: new Set(["ETN"]) });
    expect(card.dropped).toContainEqual({ ticker: "ETN", reason: "We could not load its data just now." });
    expect(card.dropped).toContainEqual({ ticker: "FAKE", reason: "Not in our US catalog, so we could not check it." });
  });

  it("does not pass off a catalog note as what the company does", () => {
    const map = new Map<string, BasketFacts | null>(draft.lines.map((line) => [line.ticker, facts(line.ticker, { description: "ETN Corp — US core universe (S&P 500 sourced)." })]));
    const line = finishBasket(draft, map).lines.find((row) => row.ticker === "ETN")!;
    expect(line.what_it_does).toBe("Grid equipment. Electrical Equipment, Industrials.");
  });

  it("gives every line the five things: company, what it does, why it fits, evidence and what breaks it", () => {
    const map = new Map<string, BasketFacts | null>(draft.lines.map((line) => [line.ticker, facts(line.ticker)]));
    const card = finishBasket(draft, map);
    for (const line of card.lines) {
      expect(line.company).toBeTruthy();
      expect(line.what_it_does).toBeTruthy();
      expect(line.why_it_fits).toBeTruthy();
      expect(line.breaks_if).toBeTruthy();
      expect(line.evidence.length).toBeGreaterThan(0);
      for (const item of line.evidence) expect(item.source).toBeTruthy();
    }
    expect(card.lines.find((line) => line.ticker === "ETN")!.what_it_does).toBe("ETN Corp makes electrical equipment for utilities and data centers.");
  });

  it("orders a 'cheap' basket by trailing P/E and puts companies without one last", () => {
    const cheap = draftBasket({ thesis: "cheap grid names", themes: THEMES, screens: [] });
    const pe: Record<string, number | null> = { ETN: 30, PWR: 12, GEV: null };
    const map = new Map<string, BasketFacts | null>(cheap.lines.map((line) => [line.ticker, facts(line.ticker, { pe_ttm: pe[line.ticker] ?? 50 })]));
    const card = finishBasket(cheap, map);
    const order = card.lines.map((line) => line.ticker);
    expect(order.indexOf("PWR")).toBeLessThan(order.indexOf("ETN"));
    expect(order[order.length - 1]).toBe("GEV");
    expect(card.ranked_by).toContain("trailing P/E");
  });

  it("never returns more than the cap", () => {
    const many: InvestmentTheme = {
      ...THEMES[0]!,
      candidates: Array.from({ length: 30 }, (_, index) => candidate(`G${String.fromCharCode(65 + (index % 26))}${index > 25 ? "X" : ""}`, `Grid ${index}`, "Grid equipment", "Sells grid equipment to utilities.")),
    };
    const big = draftBasket({ thesis: "grid", themes: [many], screens: [] });
    const map = new Map<string, BasketFacts | null>(big.lines.map((line) => [line.ticker, facts(line.ticker)]));
    expect(finishBasket(big, map).lines.length).toBeLessThanOrEqual(BASKET_MAX_LINES);
  });

  it("puts no figure in the card that the facts did not supply", () => {
    const map = new Map<string, BasketFacts | null>(draft.lines.map((line) => [line.ticker, line.ticker === "FAKE" ? null : facts(line.ticker)]));
    const card = finishBasket(draft, map);
    const shown = card.lines.flatMap((line) => line.evidence.map((item) => item.value)).join(" ");
    const audit = auditNumbers(shown, [...map.values()]);
    expect(audit.untraced).toEqual([]);
  });
});
