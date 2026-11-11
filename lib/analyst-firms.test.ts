import { describe, expect, it } from "vitest";

import { firmIsSubject } from "@/lib/analyst-firms";

// The JPM stock page's "What changed" on Nov 11, 2026, and the same rule for the other banks.
describe("firmIsSubject", () => {
  it("drops stories where JPMorgan is the analyst", () => {
    for (const title of [
      "JPMorgan Says Strategy Could Face $2.8 Billion in Forced Selling. What Would That Do to the Bitcoin Price?",
      "Meta Platforms (META) Wins JPMorgan Backing, Is It Still 37% Below Fair Value?",
      "JPMorgan Just Added Meta Platforms to Its Analyst Focus List",
      "JPMorgan grows wary on AI-exposed industrials, lowers price targets",
      "JPMorgan reaffirms its top mid-cap pick in telecom",
      "JPMorgan Cut Its IREN Target to $55. It Still Sees 148% Upside",
      "JPMorgan Names Dividend Giant Its Top Stock Pick for a Rocky Market",
      "Broadcom Shares Rise 2.20% After Hours - Broadcom (NASDAQ:AVGO), JPMorgan Chase (NYSE:JPM) - Benzinga",
    ]) {
      expect(firmIsSubject("JPM", title), title).toBe(false);
    }
  });

  it("keeps stories about JPMorgan itself", () => {
    for (const title of [
      "JPMorgan Partners With OpenAI: What It Means for JPM's AI Strategy",
      "JPMorgan Chase (JPM) Takes Lead Role In A Major AI IPO",
      "JPMorgan May Sell $2 Billion of Qualtrics Debt at About 85 Cents on the Dollar",
      "JPMorgan vs. Bank of America: Which Dividend Stock Is Better for Retirement?",
      "JPMorgan raises its dividend by 7%",
      "JPMorgan (JPM) price target raised to $400 at Wells Fargo",
      "Wells Fargo raises JPMorgan price target",
      "JPMorgan upgraded to overweight at Barclays",
    ]) {
      expect(firmIsSubject("JPM", title), title).toBe(true);
    }
  });

  it("keeps the bank speaking about itself, a rating on the bank, and headlines that do not name it", () => {
    for (const [ticker, title] of [
      ["JPM", "JPMorgan says third-quarter profit rose 12% on trading"],
      ["WFC", "Wells Fargo says Fed lifted its asset cap"],
      ["C", "Citi warns expenses will rise next year"],
      ["BAC", "Bank of America sees net interest income rising"],
      ["GS", "Goldman Sachs lifts outlook as dealmaking rebounds"],
      ["JPM", "Baird upgrades JPMorgan Chase to outperform"],
      ["C", "Citigroup gets upgrade from KBW"],
      ["JPM", "Analysts upgrade JPMorgan after strong quarter"],
      ["JPM", "Jamie Dimon warns of cockroaches in private credit"],
      // Not named at all: whoever tagged it (a cashtag, the brief pipeline) decides.
      ["JPM", "A $13 Billion Fund Dumps These 3 Stocks"],
    ] as const) {
      expect(firmIsSubject(ticker, title), title).toBe(true);
    }
    // A view about the market, or naming another covered company, is the analyst speaking.
    expect(firmIsSubject("UBS", "UBS Sees Bank of Canada Hiking Rates by 100bps")).toBe(false);
    expect(firmIsSubject("JPM", "JPMorgan says Strategy could face forced selling", true)).toBe(false);
    // Even without the flag, a view whose subject is another capitalised name is about that company (ship 28 QA).
    expect(firmIsSubject("JPM", "JPMorgan says Strategy could face forced selling")).toBe(false);
    expect(firmIsSubject("JEF", "Compass Pathways could win approval by 2027, Jefferies says")).toBe(false);
  });

  it("applies to every bank and broker, and passes other stocks", () => {
    expect(firmIsSubject("GS", "Goldman Sachs upgrades Nvidia to buy")).toBe(false);
    expect(firmIsSubject("GS", "Goldman Sachs profit jumps on trading")).toBe(true);
    expect(firmIsSubject("C", "Citi lifts S&P 500 year-end target to 7,000")).toBe(false);
    expect(firmIsSubject("C", "Citigroup to cut 20,000 jobs")).toBe(true);
    expect(firmIsSubject("WFC", "Apple price target raised by Wells Fargo")).toBe(false);
    expect(firmIsSubject("WFC", "Wells Fargo raises JPMorgan price target")).toBe(false);
    expect(firmIsSubject("BAC", "BofA strategists see a bubble in AI stocks")).toBe(false);
    expect(firmIsSubject("BAC", "Bank of America Drops Nvidia From Elite Stock List. Coincidence?")).toBe(false);
    expect(firmIsSubject("BAC", "Bank of America's JFrog call comes with a costly catch")).toBe(false);
    expect(firmIsSubject("MS", "Crown Castle to Present at the Morgan Stanley 2026 European Technology, Media & Telecom Conference")).toBe(false);
    expect(firmIsSubject("MS", "Morgan Stanley adds transfer agent Vinyl Equity in wealth push")).toBe(true);
    expect(firmIsSubject("JEF", "Teradyne's AI testing opportunity prompts Jefferies 'buy' rating")).toBe(false);
    expect(firmIsSubject("AAPL", "Goldman Sachs upgrades Apple")).toBe(true);
  });
});

describe("analyst firms: speakers and other companies (ship 28 QA)", () => {
  it("keeps a story about the bank when someone else speaks about it", () => {
    expect(firmIsSubject("JPM", "Jamie Dimon says JPMorgan will hire more bankers")).toBe(true);
    expect(firmIsSubject("JPM", "JPMorgan says profit rose on trading")).toBe(true);
  });
  it("drops the bank's view about another named company, even without the others flag", () => {
    expect(firmIsSubject("JPM", "JPMorgan says Strategy could face forced selling")).toBe(false);
  });
});
