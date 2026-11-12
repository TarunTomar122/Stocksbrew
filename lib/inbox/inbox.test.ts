import { describe, expect, it } from "vitest";

import { badgeText, dayLabel, effectiveSeenAt, groupByDay, instantOf, isUnread, mergeInbox, nyDay, unreadCount } from "./merge";
import { rowsAfterRead, signedMove } from "./read";
import type { InboxItem } from "./types";
import {
  agentItem,
  alertItem,
  callItem,
  findingItems,
  changesFromDays,
  followItem,
  insiderItems,
  memoItem,
  plainCall,
  quietItems,
  reasonItem,
  strategyItem,
  type AgentRunRecord,
} from "./words";

const NOW = new Date("2026-11-11T18:00:00Z");
const SINCE = "2026-10-28T18:00:00.000Z";

function run(over: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    jobId: "abc123def",
    jobName: "5% moves in a day",
    day: "2026-11-10",
    ranAt: "2026-11-10T22:40:00Z",
    decision: "notify",
    summary: "NVDA fell 5.47% in a day.",
    tickers: ["NVDA"],
    ...over,
  };
}

const call = (over: Partial<Parameters<typeof callItem>[0]> = {}) =>
  callItem({ ticker: "AAPL", at: "2026-11-09T13:40:00Z", from: "Buy more", to: "Keep", position: "holding", reason: null, weight: 2, ...over }, "mine")!;

describe("times", () => {
  it("reads a bare day as that day's 4 PM close in New York, in winter and in summer", () => {
    expect(instantOf("2026-11-06")).toBe("2026-11-06T21:00:00.000Z");
    expect(instantOf("2026-07-06")).toBe("2026-07-06T20:00:00.000Z");
  });

  it("reads an SEC wall time as New York time, and leaves a zoned time alone", () => {
    expect(instantOf("2026-11-10T17:17:54")).toBe("2026-11-10T22:17:54.000Z");
    expect(instantOf("2026-11-10T17:17:54Z")).toBe("2026-11-10T17:17:54.000Z");
    expect(instantOf("not a time")).toBeNull();
    expect(instantOf(null)).toBeNull();
  });

  it("groups by the New York day, so an evening run stays on its day", () => {
    expect(nyDay("2026-11-11T02:30:00Z")).toBe("2026-11-10");
  });
});

describe("wording", () => {
  it("says what the person's agent flagged, in its own sentence", () => {
    const item = agentItem(run(), "mine")!;
    expect(item.text).toBe("Your “5% moves in a day” agent flagged this: NVDA fell 5.47% in a day.");
    expect(item.id).toBe("agent:abc123def:2026-11-10");
    expect(item.href).toBe("/agents?job=abc123def");
    expect(item.quiet).toBe(false);
  });

  it("labels the example's agent as an example agent and opens the stock, not an agent the visitor does not own", () => {
    const item = agentItem(run({ jobId: "examplebigmove" }), "example")!;
    expect(item.text.startsWith("The example “5% moves in a day” agent flagged this")).toBe(true);
    expect(item.text).not.toContain("example's");
    expect(item.href).toBe("/stock/NVDA");
  });

  it("makes no item for a run that found nothing or could not check", () => {
    expect(agentItem(run({ decision: "nothing" }), "mine")).toBeNull();
    expect(agentItem(run({ decision: "could_not_check" }), "mine")).toBeNull();
  });

  it("folds a day's quiet checks into one line that never counts as unread", () => {
    const quiet = quietItems([run({ decision: "nothing", jobId: "aaaaaa1" }), run({ decision: "nothing", jobId: "bbbbbb2" }), run()], "mine");
    expect(quiet).toHaveLength(1);
    expect(quiet[0]!.text).toBe("2 of your agents checked on Nov 10 and found nothing that needs you.");
    expect(isUnread(quiet[0]!, "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("calls the example portfolio's agents example agents, never the example's agents", () => {
    const quiet = quietItems([run({ decision: "nothing", jobId: "aaaaaa1" }), run({ decision: "nothing", jobId: "bbbbbb2" })], "example");
    expect(quiet[0]!.text).toBe("2 example agents checked on Nov 10 and found nothing that needs a look.");
  });

  it("hides a quiet check unless it is the only row left", () => {
    const quiet = quietItems([run({ decision: "nothing", jobId: "aaaaaa1" }), run({ decision: "nothing", jobId: "bbbbbb2" })], "example");
    const told = { moveIds: [], reasonIds: [], reports: [], reportDays: [] };
    // The example never shows it.
    expect(rowsAfterRead(quiet, [], told, "2026-11-11", { example: true }).items[0]!.told).toBe(true);
    // Your own inbox keeps it when it is the one row, so the page still says the agents ran.
    const mine = quietItems([run({ decision: "nothing", jobId: "aaaaaa1" })], "mine");
    expect(rowsAfterRead(mine, [], told, "2026-11-11").items[0]!.told).toBeUndefined();
    // Beside anything else it goes.
    const flagged = mergeInbox([[agentItem(run(), "mine")!, ...mine]], SINCE, NOW);
    const rows = rowsAfterRead(flagged, [], told, "2026-11-11");
    expect(rows.items.filter((item) => item.quiet).every((item) => item.told)).toBe(true);
    expect(rows.items.some((item) => !item.quiet && !item.told)).toBe(true);
  });

  it("says how a call moved and what that means for shares the person owns or watches", () => {
    expect(call().text).toBe("Our call on AAPL moved from Buy more to Keep on Nov 9, so it no longer backs adding to your shares.");
    expect(call({ to: "Sell some", from: "Keep" }).text).toBe("Our call on AAPL moved from Keep to Sell some on Nov 9, so it now says to sell some of your shares.");
    expect(call({ position: "watchlist", to: "Buy more", from: "Keep" }).text).toBe("Our call on AAPL moved from Keep to Buy more on Nov 9, so a stock you're watching now has a buy call.");
    expect(call({ position: "watchlist", from: "Sell some" }).text).toBe("Our call on AAPL moved from Sell some to Keep on Nov 9, so a stock you're watching is no longer marked to sell.");
  });

  it("leaves out where the call came from on a stock the plan does not cover", () => {
    const item = call({ from: null, reason: "A results report moved it." });
    expect(item.text).toBe("Our call on AAPL, which you own, changed to Keep on Nov 9.");
    expect(item.tone).toBe("flat");
  });

  it("shows a call's reason only for the person's own covered stock, never for the example", () => {
    expect(call({ reason: "The stock fell 12% after its report" }).detail).toBe("The stock fell 12% after its report.");
    const example = callItem({ ticker: "NVDA", at: "2026-11-09", from: null, to: "Keep", position: "holding", reason: "x", weight: 2 }, "example")!;
    expect(example.text).toBe("Our call on NVDA, which the example portfolio holds, changed to Keep on Nov 9.");
    expect(example.detail).toBeNull();
    expect(example.exact).toBe(false);
  });

  it("finds changes in the daily calls in the words a reader sees", () => {
    const days = [
      { at: "2026-11-03T13:00:00Z", call: plainCall("trim")! },
      { at: "2026-11-04T13:00:00Z", call: plainCall("avoid")! },
      { at: "2026-11-05T13:00:00Z", call: plainCall("accumulate")! },
      { at: "2026-11-06T13:00:00Z", call: plainCall("accumulate")! },
    ];
    const changes = changesFromDays(days);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ from: "Sell some", to: "Buy more" });
  });

  it("names the price of a fired alert", () => {
    const item = alertItem({ id: "a1", ticker: "AAPL", condition: "below", target: 305, triggeredAt: "2026-11-10T19:39:29Z" })!;
    expect(item.text).toBe("AAPL fell below $305 on Nov 10, the price you asked us to watch for.");
  });

  it("says how a reason changed, and skips a first check that holds", () => {
    const weaker = reasonItem({ ticker: "NVDA", day: "2026-11-10", verdict: "weaker", from: "holds", headline: "Revenue growth slowed to 12%" }, "mine")!;
    expect(weaker.text).toBe("The reason you gave for owning NVDA got weaker on Nov 10.");
    expect(weaker.detail).toBe("Revenue growth slowed to 12%.");
    expect(reasonItem({ ticker: "NVDA", day: "2026-11-10", verdict: "holds", from: null, headline: "" }, "mine")).toBeNull();
  });

  it("points out a followed investor's trade in the person's own stocks", () => {
    const item = followItem(
      { id: "pelosi-1", slug: "nancy-pelosi", headline: "Nancy Pelosi reported on Nov 6: sold WBD and bought NVDA.", date: "2026-11-06", tickers: ["WBD", "NVDA"] },
      { owned: new Set(["NVDA"]), watched: new Set() },
    )!;
    expect(item.text).toBe("Nancy Pelosi reported on Nov 6: sold WBD and bought NVDA, including NVDA, which you own.");
    expect(item.tickers[0]).toBe("NVDA");
    expect(item.href).toBe("/follow/nancy-pelosi");
  });

  it("groups insider buys by stock and day, leaving out small employee purchases", () => {
    const positions = new Map([["TSM", "holding" as const], ["SMCI", "watchlist" as const]]);
    const items = insiderItems(
      [
        { id: "t1", ticker: "TSM", insider: "A Person", role: "VP", value: 4000, filedAt: "2026-11-10T16:00:00", url: null },
        { id: "s1", ticker: "SMCI", insider: "Scott Angel", role: "Director", value: 49940.63, filedAt: "2026-11-10T16:39:54", url: "https://www.sec.gov/x" },
        { id: "s2", ticker: "SMCI", insider: "Scott Angel", role: "Director", value: 30000, filedAt: "2026-11-10T17:00:00", url: null },
        { id: "n1", ticker: "NVDA", insider: "Someone", role: "CEO", value: 9e6, filedAt: "2026-11-10T17:00:00", url: null },
      ],
      positions,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe("Scott Angel, director at SMCI, bought $79,941 of SMCI in filings on Nov 10, a stock you watch.");
    expect(items[0]!.external).toBe(true);
  });

  it("leaves a rebalance's names out on a plan without followed strategies", () => {
    const record = { slug: "buy-the-dip", name: "Buy the dip", date: "2026-11-02", publishedAt: "2026-10-31T22:00:00Z", added: ["MRVL", "FTNT"], removed: ["DELL"] };
    const open = strategyItem(record, false)!;
    expect(open.text).toBe("Buy the dip, a strategy you follow, rebalanced on Nov 2: it bought MRVL and FTNT and sold DELL.");
    const locked = strategyItem(record, true)!;
    expect(locked.text).not.toMatch(/MRVL|FTNT|DELL/);
    expect(locked.tickers).toEqual([]);
    expect(locked.locked).toBe(true);
  });

  it("dates a memo by the week it covers", () => {
    expect(memoItem({ weekKey: "2026-45", monday: "2026-11-09", writtenAt: "2026-11-11T05:37:02Z", headline: "Up 1.2% this week" })!.text).toBe(
      "Your memo for the week of Nov 9 is ready: Up 1.2% this week.",
    );
  });
});

describe("merge", () => {
  it("drops items older than the window and orders newest first, ties by id", () => {
    const old = call({ ticker: "MSFT", at: "2026-10-20T13:00:00Z" });
    const a = agentItem(run({ jobId: "aaaaaa1", ranAt: "2026-11-10T22:40:00Z" }), "mine")!;
    const b = agentItem(run({ jobId: "bbbbbb2", ranAt: "2026-11-10T22:40:00Z" }), "mine")!;
    const c = call({ ticker: "AMD", at: "2026-11-11T13:00:00Z" });
    const merged = mergeInbox([[old, b], [a, c]], SINCE, NOW);
    expect(merged.map((item) => item.id)).toEqual([c.id, a.id, b.id]);
  });

  it("shows one event reported by two sources once, keeping the richer source", () => {
    const fromLog = call({ at: "2026-11-09T13:40:00Z", weight: 2 });
    const fromEvent = call({ at: "2026-11-10T09:00:00Z", weight: 1 });
    const fromSteady = call({ at: "2026-11-09", weight: 3, reason: "Its report beat" });
    const merged = mergeInbox([[fromEvent], [fromLog], [fromSteady]], SINCE, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.detail).toBe("Its report beat.");
  });

  it("keeps only the newer of the same change made twice a week apart", () => {
    const first = call({ at: "2026-11-02T13:00:00Z", to: "Keep" });
    const later = call({ at: "2026-11-09T13:00:00Z", to: "Keep", ticker: "AAPL" });
    // Same stock: the thread keeps only the newest, so this also shows the thread rule.
    expect(mergeInbox([[first, later]], SINCE, NOW).map((item) => item.at)).toEqual(["2026-11-09T13:00:00.000Z"]);
  });

  it("keeps only the newest call change per stock", () => {
    const back = call({ at: "2026-11-03T13:00:00Z", from: "Keep", to: "Buy more" });
    const forth = call({ at: "2026-11-09T13:00:00Z", from: "Buy more", to: "Keep" });
    const other = call({ ticker: "MSFT", at: "2026-11-04T13:00:00Z" });
    const merged = mergeInbox([[back, forth, other]], SINCE, NOW);
    expect(merged.map((item) => item.id)).toEqual([forth.id, other.id]);
  });

  it("places a record stamped ahead of now at the start of today, so marking it read holds on every rebuild", () => {
    const ahead = strategyItem({ slug: "s", name: "S", date: "2026-11-12", publishedAt: null, added: [], removed: [] }, false)!;
    const [item] = mergeInbox([[ahead]], SINCE, NOW);
    expect(item!.at).toBe("2026-11-11T05:00:00.000Z");
    expect(item!.exact).toBe(false);
    const later = mergeInbox([[ahead]], SINCE, new Date(NOW.getTime() + 3600_000))[0]!;
    expect(isUnread(later, NOW.toISOString())).toBe(false);
  });

  it("keeps one call change when its two reports are a weekend apart", () => {
    const friday = call({ at: "2026-11-06", weight: 3, reason: "Its report beat" });
    const monday = call({ at: "2026-11-09T13:00:00Z", weight: 1 });
    const merged = mergeInbox([[friday, monday]], SINCE, NOW);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.detail).toBe("Its report beat.");
  });

  it("says a call change once when a call watch and the call's own records both report it, in the agent's words", () => {
    // A call-change agent on a stock the person holds: the agent's finding the morning after, and the call's records.
    const watch = findingItems(
      run({
        jobName: "AAPL call changes",
        day: "2026-11-10",
        ranAt: "2026-11-10T11:05:00Z",
        tickers: ["AAPL"],
        findings: [{ ticker: "AAPL", headline: "Our call on AAPL moved from Buy more to Keep", detail: "Its report beat", at: "2026-11-09", kind: "call", call_from: "Buy more", call_to: "Keep" }],
      }),
      "mine",
      new Map(),
      "2026-11-11",
    )!;
    expect(watch).toHaveLength(1);
    const steady = call({ at: "2026-11-09", weight: 3, reason: "Its report beat" });
    const fromLog = call({ at: "2026-11-09T22:10:00Z", weight: 2 });
    const fromEvent = call({ at: "2026-11-10T13:00:00Z", weight: 1 });
    for (const order of [[watch, [steady], [fromLog], [fromEvent]], [[fromEvent], [steady], watch, [fromLog]]]) {
      const merged = mergeInbox(order, SINCE, NOW);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ id: "call:AAPL:2026-11-09", kind: "agent", source: "Your agent", text: "Our call on AAPL moved from Buy more to Keep.", detail: "Its report beat." });
    }
    // Only the call's records: still one row, in the call's words.
    expect(mergeInbox([[steady], [fromLog]], SINCE, NOW)).toEqual([expect.objectContaining({ kind: "call", source: "Our call" })]);
    // A different call on the same day is a different event (and the thread keeps the newer one).
    const other = findingItems(
      run({ ranAt: "2026-11-10T11:05:00Z", tickers: ["MSFT"], findings: [{ ticker: "MSFT", headline: "Our call on MSFT turned to Sell some", detail: "", at: "2026-11-09", kind: "call", call_from: null, call_to: "Sell some" }] }),
      "mine",
    )!;
    expect(mergeInbox([watch, other, [steady]], SINCE, NOW).map((item) => item.id).sort()).toEqual(["call:AAPL:2026-11-09", "call:MSFT:2026-11-09"]);
  });

  it("drops an item without a usable time or text", () => {
    const broken = { ...call(), id: "x", at: "nope" } as InboxItem;
    const empty = { ...call(), id: "y", text: "  " } as InboxItem;
    expect(mergeInbox([[broken, empty]], SINCE, NOW)).toEqual([]);
  });
});

describe("read state", () => {
  it("counts items after the read mark, never quiet checks", () => {
    const items = mergeInbox(
      [[call({ at: "2026-11-11T13:00:00Z" }), call({ ticker: "MSFT", at: "2026-11-05T13:00:00Z" }), ...quietItems([run({ decision: "nothing" })], "mine")]],
      SINCE,
      NOW,
    );
    expect(unreadCount(items, "2026-11-08T00:00:00Z")).toBe(1);
    expect(unreadCount(items, "2026-11-01T00:00:00Z")).toBe(2);
  });

  it("starts someone who never opened the inbox three days back", () => {
    expect(effectiveSeenAt(null, NOW)).toBe("2026-11-08T18:00:00.000Z");
    expect(effectiveSeenAt("garbage", NOW)).toBe("2026-11-08T18:00:00.000Z");
    expect(effectiveSeenAt("2026-11-10T00:00:00Z", NOW)).toBe("2026-11-10T00:00:00.000Z");
  });

  it("caps the badge at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});

describe("days", () => {
  it("labels today, yesterday and earlier days", () => {
    expect(dayLabel("2026-11-11", "2026-11-11")).toBe("Today");
    expect(dayLabel("2026-11-10", "2026-11-11")).toBe("Yesterday");
    expect(dayLabel("2026-11-06", "2026-11-11")).toBe("Friday");
    expect(dayLabel("2026-11-03", "2026-11-11")).toBe("Nov 3");
  });

  it("groups newest-first items by day in order", () => {
    const items = mergeInbox([[call({ at: "2026-11-11T13:00:00Z" }), call({ ticker: "MSFT", at: "2026-11-11T14:00:00Z" }), call({ ticker: "AMD", at: "2026-11-09T14:00:00Z" })]], SINCE, NOW);
    const days = groupByDay(items, "2026-11-11");
    expect(days.map((day) => [day.label, day.items.length])).toEqual([
      ["Today", 2],
      ["Monday", 1],
    ]);
  });
});

describe("signed moves", () => {
  it("signs a finding's percent by the direction word nearest it", () => {
    expect(signedMove("NVDA fell 5.47% in a day.")).toEqual({ value: "−5.47%", tone: "down" });
    expect(signedMove("After a lower open, NVDA rose 4.2% by noon.")).toEqual({ value: "+4.2%", tone: "up" });
    expect(signedMove("NVDA, down early, finished up 3.1%.")).toEqual({ value: "+3.1%", tone: "up" });
    expect(signedMove("NVDA moved 3% today.")).toBeNull();
    expect(signedMove("AMD's CFO sold shares on Monday.")).toBeNull();
  });
});
