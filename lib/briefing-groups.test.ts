import { describe, expect, it } from "vitest";

import { NO_CONFIRMED_REASON, type BriefingItem } from "@/lib/briefing";
import {
  COMPACT_VISIBLE_LINES,
  GROUP_VISIBLE_LINES,
  decisionText,
  isDecision,
  MARKET_GROUP_KEY,
  groupBriefingItems,
  groupBriefingSections,
  groupCountLabel,
  isReasonlessMove,
  lineLabel,
  lineSource,
  lineText,
  visibleLines,
} from "@/lib/briefing-groups";

function item(overrides: Partial<BriefingItem> & Pick<BriefingItem, "id" | "kind">): BriefingItem {
  const ticker = overrides.ticker ?? "CBRS";
  return {
    ticker,
    instrument_id: `US_${ticker}`,
    name: `${ticker} Corp`,
    relation: "watching",
    severity: "low",
    needs_you: false,
    tone: "flat",
    headline: `${ticker} did something`,
    metric: null,
    why: "Because.",
    reason_status: "not_applicable",
    next_step: "Read it.",
    spoken: "",
    evidence: [],
    as_of: "2026-11-09T18:00:00.000Z",
    deadline_days: null,
    price: 10,
    day_change_pct: 7.92,
    alert: null,
    href: `/stock/${ticker}`,
    call: "Accumulate",
    ...overrides,
  };
}

const move = (ticker: string, pct: number, extra: Partial<BriefingItem> = {}) =>
  item({
    id: `move-${ticker}`,
    kind: "price_move",
    ticker,
    headline: `${ticker} is up ${pct}% today, at $10.00`,
    metric: `+${pct}%`,
    why: NO_CONFIRMED_REASON,
    reason_status: "unconfirmed",
    day_change_pct: pct,
    evidence: [{ label: "Price $10.00", source: "Market quote", url: null, at: "2026-11-09T18:00:00.000Z" }],
    ...extra,
  });

const call = (ticker: string, extra: Partial<BriefingItem> = {}) =>
  item({
    id: `call-${ticker}`,
    kind: "call_changed",
    ticker,
    severity: "medium",
    needs_you: true,
    headline: `The call on ${ticker} changed from Trim to Accumulate`,
    metric: "Accumulate",
    tone: "up",
    ...extra,
  });

const news = (ticker: string, title: string, url: string, extra: Partial<BriefingItem> = {}) =>
  item({
    id: `news-${ticker}-${title.length}-${url.length}`,
    kind: "news",
    ticker,
    headline: `News on ${ticker}: ${title}`,
    evidence: [{ label: title, source: "Reuters", url, at: "2026-11-09T15:00:00.000Z" }],
    ...extra,
  });

describe("groupBriefingItems", () => {
  it("returns no groups for no items", () => {
    expect(groupBriefingItems([])).toEqual([]);
    expect(groupCountLabel([])).toBe("0 updates");
  });

  it("puts every item about one stock in one group, with the header carrying the stock facts", () => {
    const groups = groupBriefingItems([
      call("CBRS"),
      move("SMR", 6.89),
      move("CBRS", 7.92),
      news("CBRS", "Cerebras wins a contract", "https://example.com/a"),
      call("SMR"),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["CBRS", "SMR"]);
    const cbrs = groups[0];
    expect(cbrs.items).toHaveLength(3);
    expect(cbrs.ticker).toBe("CBRS");
    expect(cbrs.name).toBe("CBRS Corp");
    expect(cbrs.call).toBe("Accumulate");
    expect(cbrs.day_change_pct).toBe(7.92);
    expect(cbrs.relation).toBe("watching");
    expect(cbrs.needs_you).toBe(true);
  });

  it("folds a move with no confirmed reason into the header instead of its own line", () => {
    const [group] = groupBriefingItems([move("CBRS", 7.92), call("CBRS")]);
    expect(group.headerMove?.id).toBe("move-CBRS");
    expect(group.lines.map((line) => line.id)).toEqual(["call-CBRS"]);
    // Still in the group, so "Got it" on the group covers it.
    expect(group.items.map((entry) => entry.id)).toContain("move-CBRS");
    expect(isReasonlessMove(group.headerMove as BriefingItem)).toBe(true);
  });

  it("keeps a reasonless move as a line when it is the only update", () => {
    const [group] = groupBriefingItems([move("MRVL", -5.1)]);
    expect(group.headerMove).toBeNull();
    expect(group.lines).toHaveLength(1);
    expect(group.lines[0].text).toBe("We haven't found a confirmed reason for this move yet.");
    expect(group.lines[0].item.why).toBe(NO_CONFIRMED_REASON);
    expect(group.day_change_pct).toBe(-5.1);
  });

  it("keeps a confirmed move as a line and links the news story that explains it", () => {
    const story = news("TSM", "TSMC October sales jump 40%", "https://www.reuters.com/tsmc-sales/?utm=x");
    const explained = move("TSM", 4.2, {
      reason_status: "confirmed",
      why: "October sales rose 40% from a year earlier.",
      evidence: [
        { label: "Price $10.00", source: "Market quote", url: null, at: null },
        { label: "TSMC October sales jump 40%", source: "reuters.com", url: "https://reuters.com/tsmc-sales", at: null },
      ],
    });
    const [group] = groupBriefingItems([story, explained]);
    expect(group.headerMove).toBeNull();
    expect(group.lines).toHaveLength(1);
    expect(group.lines[0].id).toBe("move-TSM");
    expect(group.lines[0].explainedBy?.id).toBe(story.id);
    expect(group.lines[0].folded.map((entry) => entry.id)).toEqual([story.id]);
    expect(group.items).toHaveLength(2);
  });

  it("collapses duplicate headlines into one line", () => {
    const [group] = groupBriefingItems([
      news("SMR", "NuScale target cut to $20", "https://a.com/1", { id: "n1" }),
      news("SMR", "NuScale target cut to $20.", "https://b.com/2", { id: "n2" }),
      news("SMR", "Other story", "https://a.com/1/", { id: "n3" }),
    ]);
    expect(group.lines).toHaveLength(1);
    expect(group.lines[0].folded.map((entry) => entry.id).sort()).toEqual(["n2", "n3"]);
    expect(group.items).toHaveLength(3);
  });

  it("orders groups by their most urgent item, then by the size of the move", () => {
    const groups = groupBriefingItems([
      move("SMALL", 4.1, { severity: "low" }),
      move("BIG", -12, { severity: "low" }),
      call("URGENT", { day_change_pct: 0.5 }),
      move("HELD", 3.2, { relation: "holding", severity: "low" }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["URGENT", "HELD", "BIG", "SMALL"]);
  });

  it("orders lines inside a group by urgency, then kind", () => {
    const [group] = groupBriefingItems([
      news("CBRS", "Story", "https://a.com/s"),
      move("CBRS", 7.92, { reason_status: "confirmed", why: "A contract.", evidence: [] }),
      call("CBRS"),
    ]);
    expect(group.lines.map((line) => line.label)).toEqual(["Call", "Move", "News"]);
  });

  it("keeps items with no ticker in a Market group at the top", () => {
    const job = item({ id: "job-1", kind: "agent_job", ticker: "", name: "Your job", headline: 'Your job "x" found something', needs_you: false });
    const groups = groupBriefingItems([call("CBRS"), job, move("SMR", 9)]);
    expect(groups[0].key).toBe(MARKET_GROUP_KEY);
    expect(groups[0].ticker).toBeNull();
    expect(groups[0].name).toBe("Your jobs");
    expect(groups[0].day_change_pct).toBeNull();
    expect(groups.slice(1).map((group) => group.key)).toEqual(["CBRS", "SMR"]);
    expect(groupCountLabel(groups)).toBe("2 stocks");
    expect(groupCountLabel(groups.slice(0, 1))).toBe("1 update");
  });

  it("drops an item seen twice under the same id", () => {
    const groups = groupBriefingItems([call("CBRS"), call("CBRS")]);
    expect(groups[0].items).toHaveLength(1);
  });
});

describe("visibleLines", () => {
  it(`shows ${GROUP_VISIBLE_LINES} lines and hides the rest until expanded`, () => {
    expect(visibleLines([1, 2], false)).toEqual({ shown: [1, 2], hidden: 0 });
    expect(visibleLines([1, 2, 3, 4, 5], false)).toEqual({ shown: [1, 2], hidden: 3 });
    expect(visibleLines([1, 2, 3], false, COMPACT_VISIBLE_LINES)).toEqual({ shown: [1], hidden: 2 });
    expect(visibleLines([1, 2, 3, 4, 5], true)).toEqual({ shown: [1, 2, 3, 4, 5], hidden: 0 });
    expect(visibleLines([], false)).toEqual({ shown: [], hidden: 0 });
  });
});

describe("line text and labels", () => {
  it("drops the ticker the header already names", () => {
    expect(lineText(call("CBRS"))).toBe("Our call moved from Trim to Accumulate.");
    expect(lineText(news("CBRS", "Cerebras files", "https://a.com"))).toBe("Cerebras files");
    expect(lineText(item({ id: "z", kind: "zone_entered", headline: "CBRS is in your add zone" }))).toBe("In your add zone");
    expect(lineText(item({ id: "r", kind: "earnings_reported", headline: "CBRS reported earnings yesterday and is up 14.10% today" }))).toBe(
      "Reported earnings yesterday",
    );
  });

  it("calls an analyst target change an analyst update, not a chart one", () => {
    expect(lineLabel(item({ id: "t", kind: "technical", headline: "Analyst cut the price target to $20" }))).toBe("Analyst");
    expect(lineLabel(item({ id: "t2", kind: "technical", headline: "Crossed its 200-day average" }))).toBe("Chart");
  });

  it("names the source, skipping the price quote when there is a better one", () => {
    const explained = move("TSM", 4, {
      evidence: [
        { label: "Price", source: "Market quote", url: null, at: "2026-11-09T18:00:00.000Z" },
        { label: "Story", source: "reuters.com", url: "https://reuters.com/x", at: null },
      ],
    });
    expect(lineSource(explained)).toEqual({ source: "reuters.com", at: "2026-11-09T18:00:00.000Z", url: "https://reuters.com/x" });
    expect(lineSource(item({ id: "x", kind: "filing", as_of: null }))).toBeNull();
  });
});

describe("decisions", () => {
  const earnings = (ticker: string, days: number, relation: BriefingItem["relation"] = "holding") =>
    item({ id: `e-${ticker}-${days}`, kind: "earnings_upcoming", ticker, relation, deadline_days: days, headline: `${ticker} reports earnings Thursday after the close` });

  it("counts only real decisions", () => {
    expect(isDecision(call("ORCL", { relation: "holding" }))).toBe(true);
    expect(isDecision(call("ORCL", { relation: "watching" }))).toBe(false);
    const zone = (extra: Partial<BriefingItem>) =>
      item({ id: "z", kind: "zone_entered", headline: "CBRS is in its add zone: $20.00, below $21.00", ...extra });
    expect(isDecision(zone({ relation: "holding", needs_you: true }))).toBe(true);
    // Already in the zone yesterday, or a stock you only watch: worth knowing, not a decision.
    expect(isDecision(zone({ relation: "holding", needs_you: false }))).toBe(false);
    expect(isDecision(zone({ relation: "watching", needs_you: true }))).toBe(false);
    expect(isDecision(earnings("CBRS", 2))).toBe(true);
    expect(isDecision(earnings("CBRS", 3))).toBe(false);
    expect(isDecision(earnings("CBRS", 1, "watching"))).toBe(false);
    expect(isDecision(move("CBRS", 15, { needs_you: true }))).toBe(false);
  });

  it("says what to decide in one plain sentence", () => {
    expect(decisionText(call("ORCL", { relation: "holding", metric: "Trim" }))).toBe("Our call moved to Trim, and you hold it. Review?");
    expect(decisionText(earnings("CBRS", 2))).toBe("Reports earnings Thursday after the close, and you hold it. Hold through the report?");
    expect(decisionText(move("CBRS", 9))).toBeNull();
    expect(decisionText(item({ id: "z", kind: "zone_entered", ticker: "VST", relation: "holding", needs_you: true, headline: "VST is in its add zone: $133.90, below $133.91" }))).toBe(
      "In its add zone: $133.90, below $133.91. Act on the level?",
    );
  });
});

describe("groupBriefingSections", () => {
  it("keeps only decisions in needs-you, with the stock's other updates, and moves the rest down", () => {
    const grouped = groupBriefingSections({
      needs_you: [call("ORCL", { relation: "holding", metric: "Trim" }), move("AVGO", 8.8, { needs_you: true, relation: "holding" })],
      worth_knowing: [move("ORCL", 3.2, { relation: "holding" }), news("CBRS", "Story", "https://a.com/s")],
      coming_up: [
        item({ id: "e1", kind: "earnings_upcoming", ticker: "CBRS", relation: "holding", deadline_days: 2 }),
        item({ id: "e2", kind: "earnings_upcoming", ticker: "NVDA", relation: "holding", deadline_days: 7 }),
      ],
      kept: [],
      dismissed: [call("SMR")],
    });
    expect(grouped.needs_you.map((group) => group.key).sort()).toEqual(["CBRS", "ORCL"]);
    expect(grouped.needs_you.find((group) => group.key === "ORCL")?.lines[0].decision).toBe(true);
    expect(grouped.needs_you.find((group) => group.key === "CBRS")?.items).toHaveLength(2);
    expect(grouped.worth_knowing.map((group) => group.key)).toEqual(["AVGO"]);
    expect(grouped.coming_up.map((group) => group.key)).toEqual(["NVDA"]);
    expect(grouped.settled.map((group) => group.key)).toEqual(["SMR"]);
  });

  it("leads the market view with its explained moves", () => {
    const grouped = groupBriefingSections(
      { needs_you: [move("BDSX", 21, { reason_status: "confirmed", why: "Data." })], worth_knowing: [move("UAMY", 23)], coming_up: [], kept: [], dismissed: [] },
      "market",
    );
    expect(grouped.needs_you.map((group) => group.key)).toEqual(["BDSX"]);
    expect(grouped.worth_knowing.map((group) => group.key)).toEqual(["UAMY"]);
  });

  it("handles an empty briefing", () => {
    const grouped = groupBriefingSections({ needs_you: [], worth_knowing: [], coming_up: [], kept: [], dismissed: [] });
    expect(grouped).toEqual({ needs_you: [], worth_knowing: [], coming_up: [], settled: [] });
  });
});
