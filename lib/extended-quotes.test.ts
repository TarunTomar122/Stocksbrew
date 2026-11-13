import { describe, expect, it } from "vitest";

import {
  bigExtendedMove,
  extendedForModel,
  extendedPct,
  extendedSentence,
  extendedTime,
  isExtendedLive,
  parseExtendedDoc,
  reportedWhen,
  reportFits,
  shortReason,
} from "./extended-quotes";

// The real stored document for CBRS on the evening of Thu Nov 12, 2026 (reported after the close).
const CBRS_DOC = {
  ticker: "CBRS",
  session: "post",
  price: 115.6776,
  change_pct: 18.34,
  regular_close: 97.75,
  regular_close_at: "2026-11-12T16:00:01-05:00",
  as_of: "2026-11-12T19:59:56-05:00",
  source: "Yahoo Finance",
  post: {
    session: "post",
    price: 115.6776,
    change_pct: 18.34,
    regular_close: 97.75,
    regular_close_at: "2026-11-12T16:00:01-05:00",
    as_of: "2026-11-12T19:59:56-05:00",
    crossed_at: { "3": "2026-11-12T16:20:00-05:00", "5": "2026-11-12T16:20:00-05:00" },
  },
  earnings: { date: "2026-11-12", session: "amc", confirmed: true, reason: "raised its outlook and revenue up 55% on a year ago" },
};

const at = (iso: string) => Date.parse(iso);

describe("parseExtendedDoc", () => {
  it("reads the stored document", () => {
    const quote = parseExtendedDoc(CBRS_DOC)!;
    expect(quote.ticker).toBe("CBRS");
    expect(quote.session).toBe("post");
    expect(quote.changePct).toBe(18.34);
    expect(quote.crossedAt["5"]).toBe("2026-11-12T16:20:00-05:00");
    expect(quote.earnings?.reason).toContain("raised its outlook");
    expect(quote.lastPost).toBeNull();
  });

  it("keeps last evening's print under a pre-market one from the same close", () => {
    const quote = parseExtendedDoc({
      ...CBRS_DOC,
      session: "pre",
      price: 112,
      change_pct: 14.58,
      as_of: "2026-11-13T08:41:00-05:00",
      pre: { session: "pre", price: 112, change_pct: 14.58, regular_close: 97.75, regular_close_at: "2026-11-12T16:00:01-05:00", as_of: "2026-11-13T08:41:00-05:00" },
    })!;
    expect(quote.session).toBe("pre");
    expect(quote.lastPost?.changePct).toBe(18.34);
  });

  it("refuses a print that is not after its close, or a broken one", () => {
    expect(parseExtendedDoc({ ...CBRS_DOC, post: null, as_of: "2026-11-12T15:00:00-05:00" })).toBeNull();
    expect(parseExtendedDoc({ ticker: "X", session: "post" })).toBeNull();
    expect(parseExtendedDoc(null)).toBeNull();
  });
});

describe("isExtendedLive", () => {
  const quote = parseExtendedDoc(CBRS_DOC)!;
  it("shows after hours until the next open", () => {
    expect(isExtendedLive(quote, at("2026-11-12T20:30:00-05:00"))).toBe(true);
    expect(isExtendedLive(quote, at("2026-11-13T09:29:00-05:00"))).toBe(true);
    expect(isExtendedLive(quote, at("2026-11-13T09:30:00-05:00"))).toBe(false);
  });

  it("drops it when the page already has a newer regular price", () => {
    expect(isExtendedLive(quote, at("2026-11-12T21:00:00-05:00"), "2026-11-12T15:59:00-05:00")).toBe(true);
    expect(isExtendedLive(quote, at("2026-11-12T21:00:00-05:00"), "2026-11-12T20:30:00-05:00")).toBe(false);
  });

  it("carries a Friday evening print over the weekend", () => {
    const friday = parseExtendedDoc({ ...CBRS_DOC, post: null, regular_close_at: "2026-11-13T16:00:01-05:00", as_of: "2026-11-13T19:30:00-05:00" })!;
    expect(isExtendedLive(friday, at("2026-11-15T12:00:00-05:00"))).toBe(true);
    expect(isExtendedLive(friday, at("2026-11-16T09:31:00-05:00"))).toBe(false);
  });
});

describe("words", () => {
  const quote = parseExtendedDoc(CBRS_DOC)!;
  it("says the time with its day", () => {
    expect(extendedTime(quote.asOf, at("2026-11-12T20:30:00-05:00"))).toBe("7:59 PM ET");
    expect(extendedTime(quote.asOf, at("2026-11-13T02:00:00-05:00"))).toBe("7:59 PM ET yesterday");
    expect(extendedTime(quote.asOf, at("2026-11-13T02:00:00-05:00"), false)).toBe("7:59 PM ET");
  });

  it("says the report's day against today", () => {
    expect(reportedWhen(quote.earnings!, "2026-11-12")).toBe("after the close");
    expect(reportedWhen(quote.earnings!, "2026-11-13")).toBe("after the close yesterday");
  });

  it("never ties a before-open report to that evening's move", () => {
    expect(reportFits(quote, quote.earnings)).toBe(true);
    expect(reportFits(quote, { ...quote.earnings!, session: "bmo" })).toBe(false);
    const morning = { ...quote, session: "pre" as const, asOf: "2026-11-13T08:41:00-05:00" };
    expect(reportFits(morning, { ...quote.earnings!, session: "bmo", date: "2026-11-13" })).toBe(true);
    expect(reportFits(morning, quote.earnings)).toBe(true);
  });

  it("writes the agent's sentence with the print's price and time", () => {
    expect(extendedSentence(quote, at("2026-11-12T20:30:00-05:00"))).toBe("CBRS reported after the close: raised its outlook; up 18.3% after hours, $115.68 at 7:59 PM ET.");
    expect(extendedSentence({ ...quote, ticker: "MOD", earnings: null, changePct: -27.43, price: 135.2 }, at("2026-11-13T02:00:00-05:00"))).toBe(
      "MOD fell 27.4% after hours, to $135.20 at 7:59 PM ET yesterday.",
    );
  });

  it("formats the figure with a real minus", () => {
    expect(extendedPct(18.34)).toBe("+18.3%");
    expect(extendedPct(-3.07)).toBe("−3.1%");
    expect(extendedPct(0.01)).toBe("0.0%");
    expect(shortReason("cut its outlook, beat on earnings and revenue missed")).toBe("cut its outlook");
  });
});

describe("bigExtendedMove", () => {
  const quote = parseExtendedDoc(CBRS_DOC)!;
  it("needs 3% after a report and 5% without, dated by its first crossing", () => {
    expect(bigExtendedMove(quote)).toEqual({ threshold: 3, at: "2026-11-12T16:20:00-05:00" });
    expect(bigExtendedMove({ ...quote, changePct: 4, earnings: null })).toBeNull();
    expect(bigExtendedMove({ ...quote, changePct: -3.2 })).not.toBeNull();
    expect(bigExtendedMove({ ...quote, changePct: 5.1, earnings: null, crossedAt: {} })).toEqual({ threshold: 5, at: quote.asOf });
  });
});

describe("extendedForModel", () => {
  it("labels the print for Ask and MCP, and only while it is live", () => {
    const quote = parseExtendedDoc(CBRS_DOC)!;
    const model = extendedForModel(quote, at("2026-11-13T02:00:00-05:00"))!;
    expect(model.session).toBe("after_hours");
    expect(model.price).toBe(115.68);
    expect(model.change_pct_vs_close).toBe(18.34);
    expect(model.time_et).toBe("7:59 PM ET yesterday");
    expect(model.reported?.when).toBe("after the close yesterday");
    expect(model.note).toMatch(/Not the close/);
    expect(extendedForModel(quote, at("2026-11-13T10:00:00-05:00"))).toBeNull();
  });
});
