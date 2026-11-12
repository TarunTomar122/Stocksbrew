import { describe, expect, it } from "vitest";

import { caseWireHeadlines, learnLowerWords, lowerOrdinaryCapitals } from "@/lib/wire-casing";

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

  it("does nothing without a vocabulary", () => {
    expect(lowerOrdinaryCapitals("A Solar Line", new Set())).toBe("A Solar Line");
  });
});
