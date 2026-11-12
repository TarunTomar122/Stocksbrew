import { describe, expect, it } from "vitest";

import { cardWords, isoOfToken } from "./card-words";

const TODAY = "2026-11-12"; // a Thursday
const MONDAY = "2026-11-09";

describe("memo card words", () => {
  it("says a report today as Today and names the other one with its day", () => {
    const words = cardWords(
      {
        kind: "upcoming",
        card: { figure: "Nov 12", label: "CBRS reports after the close, then one more" },
        text: "Coming up: CBRS reports on Thursday, Nov 12 after the close and AVGO on Thursday, Nov 19.",
        tickers: ["CBRS", "AVGO"],
        asOf: TODAY,
      },
      MONDAY,
      TODAY,
    );
    expect(words).toEqual({ figure: "Today", label: "CBRS reports after the close", next: [{ ticker: "AVGO", when: "Nov 19" }], moreCount: 0 });
  });

  it("says an ex-dividend day within six days as its weekday, and counts the ones it cannot name", () => {
    const words = cardWords(
      {
        kind: "dividend",
        card: { figure: "$3.33", label: "from MSFT, ex-dividend Nov 17, then four more" },
        text: "Announced dividends coming up: MSFT goes ex-dividend on Nov 17 ($0.91 a share), AAPL goes ex-dividend on Nov 13 ($0.26 a share) and KO goes ex-dividend on Nov 30 ($0.51 a share).",
        tickers: ["MSFT", "AAPL", "KO"],
        asOf: TODAY,
      },
      MONDAY,
      TODAY,
    );
    expect(words?.label).toBe("from MSFT, ex-dividend Tuesday");
    expect(words?.next).toEqual([
      { ticker: "AAPL", when: "Tomorrow" },
      { ticker: "KO", when: "Nov 30" },
    ]);
    expect(words?.moreCount).toBe(2);
  });

  it("keeps dates that are past or more than six days on, and tickers without days when the sentence does not line up", () => {
    const words = cardWords(
      { kind: "upcoming", card: { figure: "Nov 5", label: "NVDA reports, then one more" }, text: "Two reports are coming.", tickers: ["NVDA", "AMD"], asOf: "2026-11-02" },
      "2026-11-02",
      TODAY,
    );
    expect(words).toEqual({ figure: "Nov 5", label: "NVDA reports", next: [{ ticker: "AMD", when: null }], moreCount: 0 });
    expect(cardWords({ kind: "upcoming", card: { figure: "Nov 20", label: "NVDA reports" }, text: "", tickers: ["NVDA"], asOf: TODAY }, MONDAY, TODAY)?.figure).toBe("Nov 20");
  });

  it("says a move today or yesterday so, and leaves other cards alone", () => {
    const move = (asOf: string, label: string) => cardWords({ kind: "move", card: { figure: "+2.3%", label }, text: "", tickers: ["AVGO"], asOf }, MONDAY, TODAY)?.label;
    expect(move("2026-11-11", "for AVGO on Wednesday")).toBe("for AVGO yesterday");
    expect(move("2026-11-12", "for AVGO on Thursday")).toBe("for AVGO today");
    expect(move("2026-11-10", "for AVGO on Tuesday")).toBe("for AVGO on Tuesday");
    expect(cardWords({ kind: "sector", card: null, text: "x", tickers: [], asOf: TODAY }, MONDAY, TODAY)).toBeNull();
  });

  it("reads a date across the new year", () => {
    expect(isoOfToken("Jan", "4", "2026-12-28")).toBe("2027-01-04");
    expect(isoOfToken("Dec", "30", "2027-01-04")).toBe("2026-12-30");
  });
});
