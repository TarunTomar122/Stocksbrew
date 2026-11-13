import { describe, expect, it } from "vitest";

import type { OvernightCard } from "@/lib/briefing-overnight";
import type { InboxItem } from "@/lib/inbox/types";

import { threadBiggest, type ThreadBigInput } from "./biggest";

const TODAY = "2026-11-13";

const item = (patch: Partial<InboxItem> & Pick<InboxItem, "id" | "kind" | "tickers" | "text" | "day">): InboxItem => ({
  at: `${patch.day}T21:00:00.000Z`,
  exact: false,
  detail: null,
  href: `/stock/${patch.tickers[0] ?? ""}`,
  external: false,
  source: "Your agent",
  tone: "flat",
  quiet: false,
  locked: false,
  dedupeKey: patch.id,
  weight: 1,
  thread: null,
  ...patch,
});

// The owner's inbox on Nov 13 (trimmed to what matters here).
const ITEMS: InboxItem[] = [
  item({
    id: "results:CBRS:2026-11-12",
    kind: "results",
    day: "2026-11-13",
    tickers: ["CBRS"],
    source: "Results",
    text: "CBRS reported revenue of $211M, up 55% from a year ago, and is up 16% before the open.",
    result: {
      headline: "CBRS raised its outlook and is up 16% before the open.",
      figures: "CBRS, which you own, reported revenue of $211M, up 55% from a year ago and raised its outlook.",
      movePct: 15.85,
      moveSession: "pre_market",
      moveWords: "up 16% before the open",
      call: null,
    },
  }),
  item({ id: "agent:SMCI", kind: "agent", day: "2026-11-12", tickers: ["SMCI"], text: "SMCI fell 11.3% yesterday, about twice a normal day.", detail: "Super Micro fell after DOJ China-smuggling probe.", move: { pct: -11.3, day: "2026-11-12", normalPct: 4.67, close: 26.99 } }),
  item({
    id: "agent:AMD",
    kind: "agent",
    day: "2026-11-12",
    tickers: ["AMD"],
    text: "AMD rose 5.9% yesterday.",
    detail: "William Blair upgraded AMD to Outperform, while Bank of America raised its 2027 price target.",
    move: { pct: 5.86, day: "2026-11-12", normalPct: 3.82, close: 585.3 },
  }),
  item({ id: "agent:AVGO", kind: "agent", day: "2026-11-12", tickers: ["AVGO"], text: "AVGO rose 5.5% yesterday, about twice a normal day.", move: { pct: 5.54, day: "2026-11-12", normalPct: 2.43, close: 364.36 } }),
  item({ id: "agent:NVDA", kind: "agent", day: "2026-11-12", tickers: ["NVDA"], text: "NVDA fell 4.3% yesterday, about twice a normal day.", move: { pct: -4.34, day: "2026-11-12", normalPct: 2.04, close: 166.19 } }),
  item({ id: "level:x", kind: "agent", day: "2026-11-12", tickers: ["CGNX", "LLY", "DELL"], text: "CGNX, LLY and DELL closed below their buy-more levels." }),
  item({ id: "quiet:x", kind: "agent", day: "2026-11-12", tickers: [], text: "2 of your agents checked yesterday and found nothing that needs you.", quiet: true }),
  item({ id: "insider:COHR:2026-11-12", kind: "insider", day: "2026-11-12", tickers: ["COHR"], source: "SEC Form 4", external: true, href: "https://www.sec.gov/x", text: "2 insiders at COHR bought $1.2 million yesterday, led by James Robert Anderson." }),
  // Wednesday: before the last trading day, so not today's biggest.
  item({ id: "agent:MU", kind: "agent", day: "2026-11-11", tickers: ["MU"], text: "MU rose 11.9% on Wednesday, about three times a normal day.", move: { pct: 11.89, day: "2026-11-11", normalPct: 4.34, close: 811.3 } }),
];

const PRINT: OvernightCard = { ticker: "CBRS", name: "Cerebras Systems", session: "pre", pct: 18.3, price: 115.68, asOf: "2026-11-13T12:30:00.000Z", line: "Reported after the close yesterday: raised its outlook", holding: true };

const input = (patch: Partial<ThreadBigInput> = {}): ThreadBigInput => ({
  today: TODAY,
  items: ITEMS,
  holding: new Set(["CBRS", "SMCI", "AVGO", "NVDA"]),
  names: { CBRS: "Cerebras Systems", SMCI: "Super Micro Computer", AMD: "Advanced Micro Devices", COHR: "Coherent" },
  prices: { CBRS: 97.81, SMCI: 26.98, AMD: 585.58, AVGO: 364.38, COHR: 240.1 },
  dayPcts: { COHR: -1.2 },
  levels: () => true,
  overnight: [],
  ...patch,
});

describe("/agent's biggest things", () => {
  it("leads with the report, the news and the upgrade the owner asked for, one card each", () => {
    const things = threadBiggest(input());
    expect(things.map((thing) => thing.ticker)).toEqual(["CBRS", "SMCI", "AMD", "COHR"]);
    expect(things[0]).toMatchObject({
      kind: "results",
      pct: 15.85,
      session: "pre",
      line: "Reported revenue of $211M, up 55% from a year ago and raised its outlook.",
      holding: true,
      // The day it reported, not the morning the market took it.
      day: "2026-11-12",
      ids: ["results:CBRS:2026-11-12"],
    });
    expect(things[1]).toMatchObject({ kind: "news", pct: -11.3, price: 26.98, line: "Super Micro fell after DOJ China-smuggling probe.", day: "2026-11-12", href: "/stock/SMCI" });
    expect(things[2]).toMatchObject({ kind: "analyst", line: "William Blair upgraded AMD to Outperform, while Bank of America raised its 2027 price target." });
    // An insider buy names no stock twice and no day the card already says; its card links to the stock, not the SEC.
    expect(things[3]).toMatchObject({ kind: "insider", amount: 1_200_000, pct: -1.2, line: "2 insiders bought $1.2 million, led by James Robert Anderson.", href: "/stock/COHR" });
  });

  it("tells a report and its pre-market print as one card: the report's words, the print's move and price", () => {
    const things = threadBiggest(input({ overnight: [PRINT] }));
    expect(things.filter((thing) => thing.ticker === "CBRS")).toHaveLength(1);
    expect(things[0]).toMatchObject({ ticker: "CBRS", kind: "results", pct: 18.3, price: 115.68, session: "pre", line: "Reported revenue of $211M, up 55% from a year ago and raised its outlook." });
  });

  it("lists a big print with no report of its own as a move", () => {
    const things = threadBiggest(input({ items: [], overnight: [{ ...PRINT, ticker: "IREN", name: "IREN", line: null, pct: -9, holding: false }] }));
    expect(things).toEqual([expect.objectContaining({ ticker: "IREN", kind: "move", line: null, session: "pre" })]);
  });

  it("says a move without a reason only by its size against a normal day", () => {
    const things = threadBiggest(input({ items: ITEMS.filter((entry) => entry.id === "agent:AVGO") }));
    expect(things).toEqual([expect.objectContaining({ ticker: "AVGO", kind: "move", line: "About twice a normal day." })]);
  });

  it("counts a confirmed reason too long for the card as news, and says the move's size instead", () => {
    const long = item({
      id: "agent:Y",
      kind: "agent",
      day: "2026-11-12",
      tickers: ["Y"],
      text: "Y rose 4.0% yesterday, about twice a normal day.",
      detail: "Y rose after the company said its largest customer signed a multi-year supply deal worth far more than expected.",
      move: { pct: 4, day: "2026-11-12", normalPct: 2, close: 10 },
    });
    expect(threadBiggest(input({ items: [long] }))).toEqual([expect.objectContaining({ ticker: "Y", kind: "news", line: "About twice a normal day." })]);
  });

  it("drops the move a report's sentence repeats when the figures are too long for the card", () => {
    const report = item({ id: "results:Z", kind: "results", day: "2026-11-13", tickers: ["Z"], text: "Z beat the EPS estimate by 30% and rose 10% on Thursday.", result: { headline: "", figures: "Z, which you watch, beat the EPS estimate by 30% while revenue grew faster than anyone on the street had expected this quarter.", movePct: 10, moveSession: null, moveWords: null, call: null } });
    expect(threadBiggest(input({ items: [report] }))[0]!.line).toBe("Beat the EPS estimate by 30%.");
  });

  it("leaves out an insider sale, quiet checks, lines about several stocks, older days and locked items", () => {
    const sale = item({ id: "insider:Q", kind: "insider", day: "2026-11-12", tickers: ["Q"], text: "The CEO of Q sold $5.2 million yesterday." });
    const things = threadBiggest(input({ items: [sale, ...ITEMS.filter((entry) => ["level:x", "quiet:x", "agent:MU"].includes(entry.id)), { ...ITEMS[1]!, locked: true }] }));
    expect(things).toEqual([]);
  });

  it("cuts a level out of a line for a viewer whose plan does not show levels", () => {
    const withLevel = item({ id: "agent:X", kind: "agent", day: "2026-11-12", tickers: ["X"], text: "X fell 9.0% yesterday.", detail: "X fell to $40, under our call's $42 buy-more level.", move: { pct: -9, day: "2026-11-12", normalPct: null } });
    const [thing] = threadBiggest(input({ items: [withLevel], levels: () => false }));
    expect(thing!.line ?? "").not.toMatch(/\$42/);
  });
});
