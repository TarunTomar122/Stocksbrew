import { describe, expect, it } from "vitest";

import { caseWireHeadlines, learnLowerWords, lowerOrdinaryCapitals, withoutFeedCut } from "@/lib/wire-casing";

// A day's wire in miniature: the ordinary words show up in lower case elsewhere, the names never do.
const CORPUS = [
  "Solar stocks rally as solar demand grows",
  "Chipmakers lift solar names after manufacturing data",
  "New manufacturing line opens in Texas",
  "Second line of manufacturing plants comes online",
  "Investors weigh data center power and solar costs",
  "Analysts say the deal delivered fantastic results",
  "Results delivered a fantastic quarter for the group",
  "Driving software matters more than hardware now",
  "Its driving software matters to investors",
  "Ford says software matters for driving margins",
  "Space stocks climb as space spending rises",
  "Utilities face power costs in space race",
  "Analysts flag power costs and space demand",
  "Apple says its margins held",
  "Tesla says its robotaxi plan is on track",
];

function run(titles: string[], names: Record<string, string> = {}) {
  return caseWireHeadlines(titles.map((title, index) => ({ id: String(index), title, tickers: Object.keys(names) })), names).map((item) => item.title);
}

describe("learnLowerWords", () => {
  it("learns words the wire writes in lower case and keeps names out", () => {
    const words = learnLowerWords([...CORPUS, "Nvidia rises as Nvidia CEO Jensen Huang speaks", "Shares of Nvidia climb"]);
    expect(words.has("solar")).toBe(true);
    expect(words.has("manufacturing")).toBe(true);
    expect(words.has("nvidia")).toBe(false);
    expect(words.has("huang")).toBe(false);
  });
});

describe("caseWireHeadlines", () => {
  it("lowers the scraped capitals of ordinary words", () => {
    const out = run([...CORPUS, "SpaceX ordered equipment for a 100 GW Solar Manufacturing Line", "Lisa Su just Delivered Fantastic news for AMD investors", "Tesla extends Cybertruck run. Its Driving Software Matters more."]);
    expect(out.at(-3)).toBe("SpaceX ordered equipment for a 100 GW solar manufacturing line");
    expect(out.at(-2)).toBe("Lisa Su just delivered fantastic news for AMD investors");
    expect(out.at(-1)).toBe("Tesla extends Cybertruck run. Its driving software matters more.");
  });

  it("keeps names, clause starts, figures, days and months", () => {
    const out = run([...CORPUS, "Rocket Lab CEO says Space is the next frontier: Solar comes later", "Results due in May as Power Solutions climbs on demand", "Shares of First Solar jump on Q3 Data"], {
      FSLR: "First Solar, Inc.",
    });
    // "Space" stands beside nothing named, so it is lowered; "Solar" after a colon starts a clause.
    expect(out.at(-3)).toBe("Rocket Lab CEO says space is the next frontier: Solar comes later");
    // "Power" sits beside "Solutions", a word the wire never lowers: possibly a name, so it stays.
    expect(out.at(-2)).toBe("Results due in May as Power Solutions climbs on demand");
    // A company on the page keeps its whole name.
    expect(out.at(-1)).toBe("Shares of First Solar jump on Q3 data");
  });

  it("keeps a name joined by 'of' and lowers a word lowered more often than not", () => {
    const out = run([...CORPUS, "Bank shares slip", "A bank rallies", "Banks and a bank fund", "Yen falls as Bank of Japan holds"]);
    expect(out.at(-1)).toBe("Yen falls as Bank of Japan holds");
  });

  it("leaves a headline already written as a sentence alone", () => {
    const out = run([...CORPUS, "Nvidia board meets to decide CEO Huang's future, source says"]);
    expect(out.at(-1)).toBe("Nvidia board meets to decide CEO Huang's future, source says");
  });

  it("lowers the wire's usual ordinary words without a corpus, beside names it keeps them", () => {
    const out = run([
      "Dear Nebius stock Fans, Mark your Calendars for November 12",
      "13 Big funds sold Applied Materials. Should you follow them before earnings?",
      "SpaceX shares slip amid Upcoming Starship test Flight Jitters",
      "Oracle stock just surged after CoreWeave earnings, built for the Data-Center backlash",
      "Mark Zuckerberg says Meta will spend more",
      "Coca-Cola raises its outlook",
      "Stores close for the Fourth of July",
    ]);
    expect(out[0]).toBe("Dear Nebius stock fans, mark your calendars for November 12");
    expect(out[1]).toBe("13 big funds sold Applied Materials. Should you follow them before earnings?");
    // "Upcoming" stands beside "Starship", a capital the wire never lowers: possibly a name, so it stays.
    expect(out[2]).toBe("SpaceX shares slip amid Upcoming Starship test flight jitters");
    expect(out[3]).toBe("Oracle stock just surged after CoreWeave earnings, built for the data-center backlash");
    expect(out[4]).toBe("Mark Zuckerberg says Meta will spend more");
    expect(out[5]).toBe("Coca-Cola raises its outlook");
    expect(out[6]).toBe("Stores close for the Fourth of July");
  });

  it("keeps a pair of one fixed word and one learned word, which may be a name", () => {
    const corpus = ["Retailers sell lots of software", "There is lots of software in the deal", "A trading desk and a brokerage"];
    const out = run([...corpus, "Shares of Big Lots jump", "Investors cheer Progress Software results", "Funds like The Trade Desk again"]);
    expect(out.at(-3)).toBe("Shares of Big Lots jump");
    expect(out.at(-2)).toBe("Investors cheer Progress Software results");
    expect(out.at(-1)).toBe("Funds like The Trade Desk again");
  });

  it("does nothing without a vocabulary", () => {
    expect(lowerOrdinaryCapitals("A Solar Line", new Set())).toBe("A Solar Line");
  });

  it("lowers a hyphen run of ordinary words and a stray after a company name (Nov 12)", () => {
    const out = run(["Nvidia fallout: Taiwan reportedly revokes Re-Entry of alleged spy involved with Huang", "Nvidia Turmoil lifts AMD as chip stocks rebound"], { NVDA: "NVIDIA Corporation", AMD: "Advanced Micro Devices, Inc." });
    expect(out[0]).toBe("Nvidia fallout: Taiwan reportedly revokes re-entry of alleged spy involved with Huang");
    expect(out[1]).toBe("Nvidia turmoil lifts AMD as chip stocks rebound");
    expect(run(["Re/Max shares slide after Re/Max earnings miss"])[0]).toBe("Re/Max shares slide after Re/Max earnings miss");
  });

  it("lowers the stock page's What changed strays and keeps the company, its ticker and AI (Nov 13)", () => {
    const out = run(
      [
        "Why are Advanced Micro Devices (AMD) shares Drawing Fresh AI attention?",
        "Nvidia, AMD, CoreWeave, Nebius, Tesla, and more stocks that Explain today's market",
        "Fresh Del Monte reports results",
      ],
      { AMD: "Advanced Micro Devices, Inc." },
    );
    expect(out[0]).toBe("Why are Advanced Micro Devices (AMD) shares drawing fresh AI attention?");
    expect(out[1]).toBe("Nvidia, AMD, CoreWeave, Nebius, Tesla, and more stocks that explain today's market");
    expect(out[2]).toBe("Fresh Del Monte reports results");
  });

  it("lowers the News cards' strays: a verb after a name, a move before a share, and keeps names (Nov 12)", () => {
    const out = run(
      [
        "Nebius stock Crashes 20% as massive AI spending plans Rattle investors",
        "Microsoft stocks Edge higher as Anthropic Ties deepen despite spreadsheet rivalry",
        "Alphabet stocks rise as Google Commits $10 billion to Anthropic at IPO",
        "BofA 5-Star analyst Trims Intel stock price target for 2027",
        "6 firms downgraded NVIDIA as Huang resigned. Is the selloff Overdone?",
        "Wall Street models lag Structural Reality, Prompting Me to add an 'overvalued' Apple",
        "Rocket Lab Falls 5% after launch",
        "Microsoft Edge gets a new AI mode",
        "Tesla Model 3 sales rise 5%",
        "Sioux Falls plant to close",
        "Samsung Galaxy S25 Edge sales top forecasts",
        "Kitchen Sinks maker files for IPO",
        "Bank of America Revamps AMD stock price target for 2027",
      ],
      { INTC: "Intel Corporation", RKLB: "Rocket Lab USA, Inc.", MSFT: "Microsoft Corporation" },
    );
    expect(out).toEqual([
      "Nebius stock crashes 20% as massive AI spending plans rattle investors",
      "Microsoft stocks edge higher as Anthropic ties deepen despite spreadsheet rivalry",
      "Alphabet stocks rise as Google commits $10 billion to Anthropic at IPO",
      "BofA 5-Star analyst trims Intel stock price target for 2027",
      "6 firms downgraded NVIDIA as Huang resigned. Is the selloff overdone?",
      "Wall Street models lag structural reality, prompting me to add an 'overvalued' Apple",
      "Rocket Lab falls 5% after launch",
      "Microsoft Edge gets a new AI mode",
      "Tesla Model 3 sales rise 5%",
      "Sioux Falls plant to close",
      "Samsung Galaxy S25 Edge sales top forecasts",
      "Kitchen Sinks maker files for IPO",
      "Bank of America revamps AMD stock price target for 2027",
    ]);
  });

  it("lowers the News page's strays and ends a headline the feed cut inside a figure (Nov 13)", () => {
    const out = run([
      ...CORPUS,
      "Musk: SpaceX makes compute “actually Usable” in 2 months",
      "Nebius Group (NBIS) takes a beating — this tech giant is to Blame",
      "Arista Networks (ANET) Guides higher, is the stock overvalued following earnings?",
      "Applied Materials Inc (AMAT) (Q4 2026) earnings call highlights: Record $10. ...",
    ], { AMAT: "Applied Materials, Inc.", ANET: "Arista Networks, Inc." });
    expect(out.slice(-4)).toEqual([
      "Musk: SpaceX makes compute “actually usable” in 2 months",
      "Nebius Group (NBIS) takes a beating — this tech giant is to blame",
      "Arista Networks (ANET) guides higher, is the stock overvalued following earnings?",
      "Applied Materials Inc (AMAT) (Q4 2026) earnings call highlights",
    ]);
  });


  it("ends a headline the feed cut with an ellipsis at its last whole clause, and leaves the rest alone", () => {
    expect(withoutFeedCut("Q4 call highlights: Record $10. ...")).toBe("Q4 call highlights");
    expect(withoutFeedCut("Is Nvidia a buy? Analysts weigh the next quarter and the …")).toBe("Is Nvidia a buy?");
    expect(withoutFeedCut("Is Nvidia still a buy?…")).toBe("Is Nvidia still a buy?");
    expect(withoutFeedCut("Is Nvidia still a buy? ...")).toBe("Is Nvidia still a buy?");
    // No whole clause to fall back to: as it came.
    expect(withoutFeedCut("Nvidia shares slide as the market weighs...")).toBe("Nvidia shares slide as the market weighs...");
    // Not cut: a figure that ends a sentence, a decimal, a colon.
    expect(withoutFeedCut("Shares slip below $10.")).toBe("Shares slip below $10.");
    expect(withoutFeedCut("Recap: revenue tops $10.5 billion")).toBe("Recap: revenue tops $10.5 billion");
    expect(withoutFeedCut("Results: Record $10.")).toBe("Results: Record $10.");
  });
});
