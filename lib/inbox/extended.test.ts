import { describe, expect, it } from "vitest";

import { parseExtendedDoc } from "@/lib/extended-quotes";

import { extendedItems } from "./extended";
import { mergeInbox } from "./merge";
import type { InboxItem } from "./types";

const NOW = new Date("2026-11-13T07:00:00-05:00");
const BASE = {
  session: "post",
  regular_close: 100,
  regular_close_at: "2026-11-12T16:00:01-05:00",
  as_of: "2026-11-12T19:59:00-05:00",
  source: "Yahoo Finance",
};

describe("extendedItems", () => {
  it("files a big after-hours move as the agent's note, dated when it first got big", () => {
    const quote = parseExtendedDoc({ ...BASE, ticker: "MOD", price: 127.43, change_pct: 27.43, post: { ...BASE, price: 127.43, change_pct: 27.43, crossed_at: { "3": "2026-11-12T16:20:00-05:00", "5": "2026-11-12T16:35:00-05:00" } } })!;
    const [item] = extendedItems(quote, "watchlist", "mine", NOW);
    expect(item).toMatchObject({
      id: "extended:MOD:post:2026-11-12",
      kind: "agent",
      at: "2026-11-12T16:35:00-05:00",
      day: "2026-11-12",
      exact: false,
      tone: "up",
      source: "Your agent",
      move: null,
      extended: { pct: 27.43, session: "post" },
    });
    expect(item!.text).toBe("MOD rose 27.4% after hours, to $127.43 at 7:59 PM ET yesterday.");
  });

  it("skips a move under 5%, but takes 3% after a report", () => {
    const small = parseExtendedDoc({ ...BASE, ticker: "NVDA", price: 104, change_pct: 4 })!;
    expect(extendedItems(small, "holding", "mine", NOW)).toEqual([]);
    const reported = parseExtendedDoc({ ...BASE, ticker: "NU", price: 103.2, change_pct: 3.2, earnings: { date: "2026-11-12", session: "amc", confirmed: false, reason: null } })!;
    const [item] = extendedItems(reported, "holding", "mine", NOW);
    expect(item!.text).toBe("NU reported after the close yesterday; up 3.2% after hours, $103.20 at 7:59 PM ET.");
    expect(item!.dedupeKey).toBe("results:NU:2026-11-12");
    expect(item!.weight).toBe(0);
  });

  it("gives way to the results row on the same report", () => {
    const quote = parseExtendedDoc({ ...BASE, ticker: "CBRS", price: 118.34, change_pct: 18.34, earnings: { date: "2026-11-12", session: "amc", confirmed: true, reason: "raised its outlook" } })!;
    const ours = extendedItems(quote, "holding", "mine", NOW);
    const results: InboxItem = {
      ...ours[0]!,
      id: "results:CBRS:2026-11-12",
      kind: "results",
      at: "2026-11-12T21:03:59.000Z",
      text: "CBRS reported revenue of $210.8M and is up 18.3% after hours.",
      weight: 1,
      thread: "results:CBRS",
      extended: null,
    };
    const merged = mergeInbox([ours, [results]], "2026-11-01T00:00:00Z", NOW);
    expect(merged.map((item) => item.id)).toEqual(["results:CBRS:2026-11-12"]);
  });
});
