import { describe, expect, it } from "vitest";

import {
  POLICY_PAGE_SIZE,
  redditHighlight,
  causeLabel,
  classifyMover,
  confirmedTickers,
  etDayHour,
  filterMovers,
  filterPolicy,
  mentionVelocity,
  moveSince,
  moverCounts,
  normalizeStance,
  parseSignalsFilters,
  pickToday,
  postNamesTicker,
  rankReddit,
  sameCompany,
  signalsHref,
  velocityLabel,
  type Mover,
  type PolicyPost,
  type RedditName,
  type RedditPostLite,
} from "@/lib/signals-shared";

describe("filters in the URL", () => {
  it("defaults to today and only accepts a filter that belongs to the tab", () => {
    expect(parseSignalsFilters(undefined)).toEqual({ tab: "today", show: "all", limit: POLICY_PAGE_SIZE });
    expect(parseSignalsFilters({ tab: "Movers", show: "unexplained" })).toMatchObject({ tab: "movers", show: "unexplained" });
    expect(parseSignalsFilters({ tab: "reddit", show: "unexplained" }).show).toBe("all");
    expect(parseSignalsFilters({ tab: "policy", show: "named", n: "9999" })).toEqual({ tab: "policy", show: "named", limit: 400 });
    expect(parseSignalsFilters({ tab: "astrology" }).tab).toBe("today");
  });

  it("builds links and resets the filter when the tab changes", () => {
    const base = parseSignalsFilters(undefined);
    expect(signalsHref(base)).toBe("/signals");
    expect(signalsHref(base, { tab: "reddit" })).toBe("/signals?tab=reddit");
    const movers = parseSignalsFilters({ tab: "movers", show: "down" });
    expect(signalsHref(movers)).toBe("/signals?tab=movers&show=down");
    expect(signalsHref(movers, { tab: "policy" })).toBe("/signals?tab=policy");
    expect(signalsHref(parseSignalsFilters({ tab: "policy" }), { limit: 80 })).toBe("/signals?tab=policy&n=80");
  });
});

describe("movers", () => {
  it("counts a move as explained only with a specific cause and a real headline", () => {
    const explained = classifyMover({
      ticker: "ibrx",
      name: "ImmunityBio",
      day_change_pct: -15.5,
      price: 7.3,
      move_explanation: {
        cause_type: "earnings_miss",
        headline: "IBRX plunges after earnings miss",
        why_it_matters: "Revenue missed.",
        confidence: "High",
        searched_externally: true,
        evidence: [{ title: "Press release", url: "https://example.com/pr" }, { title: "No link", url: "" }],
      },
    });
    expect(explained).toMatchObject({ ticker: "IBRX", explained: true, cause: "Earnings miss", confidence: "high", searched: true });
    expect(explained.evidence).toEqual([{ title: "Press release", url: "https://example.com/pr" }]);
  });

  it("files tape descriptions, placeholders and missing research under unexplained", () => {
    const tape = classifyMover({
      ticker: "SOXL",
      name: "SOXL",
      day_change_pct: 14,
      move_explanation: { cause_type: "price_action", headline: "SOXL reverses sharply", why_it_matters: "Tape-based rebound." },
    });
    expect(tape).toMatchObject({ explained: false, cause: null, name: null });
    const placeholder = classifyMover({
      ticker: "UAMY",
      day_change_pct: 12.8,
      move_explanation: { cause_type: "no_verified_catalyst", headline: "--", why_it_matters: "", searched_externally: true },
    });
    expect(placeholder).toMatchObject({ explained: false, headline: null, why: null, searched: true });
    expect(classifyMover({ ticker: "X", day_change_pct: 5, move_explanation: null }).explained).toBe(false);
    expect(classifyMover({ ticker: "X", day_change_pct: 5, move_explanation: { cause_type: "acquisition", headline: "—" } }).explained).toBe(false);
  });

  it("labels causes and filters and counts the list", () => {
    expect(causeLabel("earnings_and_guidance")).toBe("Earnings and guidance");
    expect(causeLabel("analyst price-target reduction")).toBe("Analyst price target reduction");
    expect(causeLabel("price_action")).toBeNull();
    expect(causeLabel("")).toBeNull();
    const movers: Mover[] = [
      classifyMover({ ticker: "A", day_change_pct: 3, move_explanation: { cause_type: "acquisition", headline: "A agrees to a $2 billion takeover" } }),
      classifyMover({ ticker: "B", day_change_pct: -9, move_explanation: null }),
      classifyMover({ ticker: "C", day_change_pct: 12, move_explanation: { cause_type: "price_action", headline: "C up" } }),
    ];
    expect(moverCounts(movers)).toEqual({ all: 3, explained: 1, unexplained: 2, up: 2, down: 1 });
    // A headline that only says the move again is no reason, whatever the cause type says (owner rules 7, 8).
    expect(classifyMover({ ticker: "SOXL", day_change_pct: 22, move_explanation: { cause_type: "sector_rotation", headline: "Semiconductor rally drives SOXL higher" } }).explained).toBe(false);
    expect(filterMovers(movers, "all").map((row) => row.ticker)).toEqual(["C", "B", "A"]);
    expect(filterMovers(movers, "unexplained").map((row) => row.ticker)).toEqual(["C", "B"]);
    expect(filterMovers(movers, "explained").map((row) => row.ticker)).toEqual(["A"]);
    expect(filterMovers(movers, "down").map((row) => row.ticker)).toEqual(["B"]);
  });
});

describe("reddit", () => {
  const post = (id: string, title: string, published: string, text = ""): RedditPostLite => ({ id, title, text, subreddit: "stocks", published, url: "" });

  it("matches cashtags and capitalised symbols, not ordinary words", () => {
    expect(postNamesTicker({ title: "Loading up on $nvda calls", text: "" }, "NVDA")).toBe(true);
    expect(postNamesTicker({ title: "Why NVDA is dumping", text: "" }, "NVDA")).toBe(true);
    expect(postNamesTicker({ title: "Thoughts?", text: "I sold AMD and bought MU." }, "MU")).toBe(true);
    expect(postNamesTicker({ title: "nvda", text: "" }, "NVDA")).toBe(false);
    expect(postNamesTicker({ title: "SNVDAX fund", text: "" }, "NVDA")).toBe(false);
    expect(postNamesTicker({ title: "Bet ON the open", text: "" }, "ON")).toBe(false);
    expect(postNamesTicker({ title: "Long $ON here", text: "" }, "ON")).toBe(true);
    expect(postNamesTicker({ title: "A great day", text: "" }, "A")).toBe(false);
    expect(postNamesTicker({ title: "BRK.B is boring", text: "" }, "BRK.B")).toBe(true);
  });

  it("measures the last 24 hours against the days before", () => {
    const now = Date.parse("2026-11-09T18:00:00Z");
    const posts = [
      post("1", "NVDA dump", "2026-11-09T14:00:00Z"),
      post("2", "NVDA calls", "2026-11-09T10:00:00Z"),
      post("3", "NVDA again", "2026-11-08T20:00:00Z"), // 22h ago: still the last bucket
      post("4", "NVDA earlier", "2026-11-06T12:00:00Z"),
      post("5", "AMD only", "2026-11-09T12:00:00Z"),
      post("6", "NVDA too old", "2026-10-20T12:00:00Z"),
      post("7", "NVDA future", "2026-11-10T12:00:00Z"),
    ];
    const velocity = mentionVelocity(posts, "NVDA", now, 7);
    expect(velocity.daily).toEqual([0, 0, 0, 1, 0, 0, 3]);
    expect(velocity.last24h).toBe(3);
    expect(velocity.baselinePerDay).toBeCloseTo(1 / 6, 6);
    expect(velocity.ratio).toBeCloseTo(18, 6);
    expect(velocity.state).toBe("rising");
    expect(velocityLabel(velocity)).toBe("3 in 24h vs 0.2/day");
  });

  it("names the quiet, new, steady and fading cases", () => {
    const now = Date.parse("2026-11-09T18:00:00Z");
    expect(mentionVelocity([], "NVDA", now).state).toBe("quiet");
    const fresh = mentionVelocity([post("1", "IREN squeeze", "2026-11-09T12:00:00Z")], "IREN", now);
    expect([fresh.state, fresh.ratio]).toEqual(["new", null]);
    expect(velocityLabel(fresh)).toBe("1 in 24h, none in the 6 days before");
    const faded = mentionVelocity([post("1", "SPY puts", "2026-11-05T12:00:00Z"), post("2", "SPY again", "2026-11-06T12:00:00Z")], "SPY", now);
    expect(faded.state).toBe("fading");
    expect(velocityLabel(faded)).toBe("none in 24h, 0.3/day before");
    const steady = mentionVelocity(
      [1, 2, 3, 4, 5, 6, 7].map((day) => post(String(day), "QQQ", new Date(now - (day - 0.5) * 86_400_000).toISOString())),
      "QQQ",
      now,
    );
    expect(steady.state).toBe("steady");
  });

  it("ranks by posts, then by acceleration", () => {
    const name = (ticker: string, mentions: number, ratio: number | null): RedditName => ({
      ticker,
      company: null,
      mentions,
      stance: "neutral",
      stanceRead: false,
      summary: null,
      catalysts: [],
      latestPostAt: null,
      subreddits: [],
      velocity: { daily: [], last24h: 1, baselinePerDay: 1, ratio, state: "steady" },
      dayPct: null,
    });
    expect(rankReddit([name("B", 4, 1), name("A", 4, 3), name("C", 10, null)]).map((row) => row.ticker)).toEqual(["C", "A", "B"]);
    expect(normalizeStance("Bearish")).toBe("bearish");
    expect(normalizeStance("whatever")).toBe("neutral");
  });
});

describe("policy", () => {
  it("keeps a ticker only when the post names that company", () => {
    expect(sameCompany("Boeing", "The Boeing Company")).toBe(true);
    expect(sameCompany("Apple", "Apple Inc.")).toBe(true);
    expect(sameCompany("General Motors", "General Motors Company")).toBe(true);
    expect(sameCompany("S&P Global", "S&P Global Inc.")).toBe(true);
    expect(sameCompany("The New York Times", "New Horizon Aircraft Ltd.")).toBe(false);
    expect(sameCompany("The New York Times", "The Boeing Company")).toBe(false);
    expect(sameCompany("Federal Reserve", "Federal Realty Investment Trust")).toBe(false);
    expect(sameCompany("Trump Media & Technology Group", "Group 1 Automotive, Inc.")).toBe(false);
    expect(sameCompany("", "Apple Inc.")).toBe(false);
    expect(sameCompany("The", "The Boeing Company")).toBe(false);

    const listed = new Map([
      ["BA", "The Boeing Company"],
      ["HOVR", "New Horizon Aircraft Ltd."],
      ["F", "Ford Motor Company"],
      ["GM", "General Motors Company"],
    ]);
    expect(confirmedTickers(["BA", "HOVR"], ["The New York Times"], listed)).toEqual([]);
    expect(confirmedTickers(["ba"], ["Boeing"], listed)).toEqual(["BA"]);
    expect(confirmedTickers(["F", "GM", "STLA"], ["General Motors", "Ford", "Stellantis"], listed)).toEqual(["F", "GM"]);
    expect(confirmedTickers(["BA", "BA"], ["Boeing"], listed)).toEqual(["BA"]);
  });

  it("reads New York's day and hour", () => {
    expect(etDayHour("2026-11-09T00:05:49+00:00")).toEqual({ day: "2026-11-08", hour: 19 });
    expect(etDayHour("2026-11-09T21:30:00Z")).toEqual({ day: "2026-11-09", hour: 16 });
    expect(etDayHour("nope")).toBeNull();
  });

  it("measures from the last close before the post", () => {
    const dates = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"];
    const closes = [100, 102, 104, 110];
    // During Thursday's session: from Wednesday's close.
    expect(moveSince(dates, closes, "2026-11-05T15:00:00Z")).toEqual({ pct: 10, fromDate: "2026-11-04", toDate: "2026-11-09" });
    // After Thursday's close: from Thursday's close.
    expect(moveSince(dates, closes, "2026-11-05T22:00:00Z")).toEqual({ pct: 7.84, fromDate: "2026-11-05", toDate: "2026-11-09" });
    // On the weekend: from Friday's close.
    expect(moveSince(dates, closes, "2026-11-08T13:49:32Z")).toEqual({ pct: 5.77, fromDate: "2026-11-06", toDate: "2026-11-09" });
    // After the latest bar, or before the series starts: nothing to measure.
    expect(moveSince(dates, closes, "2026-11-09T22:00:00Z")).toBeNull();
    expect(moveSince(dates, closes, "2026-11-01T12:00:00Z")).toBeNull();
    expect(moveSince(["2026-11-09"], [110], "2026-11-05T15:00:00Z")).toBeNull();
    expect(moveSince(dates, [100, 0, 104, 110], "2026-11-05T22:00:00Z")).toBeNull();
  });

  it("filters to posts that name a company, newest first", () => {
    const post = (id: string, publishedAt: string, names: string[]): PolicyPost => ({
      id,
      publishedAt,
      summary: id,
      stance: "neutral",
      url: "",
      archiveUrl: null,
      names: names.map((ticker) => ({ ticker, company: ticker, since: null })),
      market: null,
    });
    const posts = [post("a", "2026-11-01T00:00:00Z", ["BA"]), post("b", "2026-11-08T00:00:00Z", []), post("c", "2026-11-05T00:00:00Z", ["AAPL"])];
    expect(filterPolicy(posts, "all").map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(filterPolicy(posts, "named").map((row) => row.id)).toEqual(["c", "a"]);

    const now = Date.parse("2026-11-09T00:00:00Z");
    const pick = pickToday([], [], posts, now);
    // The recent post that names a company is kept alongside the newest ones, and the result is newest first.
    expect(pick.policy.map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(pick.movers).toEqual([]);
    expect(pick.reddit).toEqual([]);
  });
});

describe("pickToday", () => {
  it("splits movers into explained and unexplained, biggest first, and caps each list", () => {
    const movers = Array.from({ length: 12 }, (_, index) =>
      classifyMover({
        ticker: `T${index}`,
        day_change_pct: (index % 2 === 0 ? 1 : -1) * (index + 2),
        move_explanation: index % 3 === 0 ? null : { cause_type: "acquisition", headline: "Deal" },
      }),
    );
    const pick = pickToday(movers, [], [], Date.now());
    expect(pick.movers).toHaveLength(5);
    expect(pick.movers.every((row) => row.explained)).toBe(true);
    expect(pick.movers[0]!.ticker).toBe("T11");
    expect(pick.unexplained.map((row) => row.ticker)).toEqual(["T9", "T6", "T3", "T0"]);
  });
});

describe("reddit highlight", () => {
  it("says what is being said in one line: the first catalyst, else the summary's first sentence", () => {
    expect(redditHighlight({ catalysts: ["board probe into the CEO", "chip export report"], summary: "Long text. More." })).toBe("Board probe into the CEO.");
    expect(redditHighlight({ catalysts: [], summary: "Holders worry about the CEO probe. Some are buying the dip." })).toBe("Holders worry about the CEO probe.");
    expect(redditHighlight({ catalysts: ["AI capex fears!"], summary: null })).toBe("AI capex fears.");
    expect(redditHighlight({ catalysts: [], summary: null })).toBeNull();
    expect(redditHighlight({ catalysts: ["  "], summary: null })).toBeNull();
  });
});

