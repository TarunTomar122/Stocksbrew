import { describe, expect, it } from "vitest";

import type { AnomalyItem } from "@/lib/daily-anomalies";
import {
  NOTHING_NEEDS_YOU,
  NO_CONFIRMED_REASON,
  askWhyHref,
  briefingSections,
  briefingWindow,
  buildBriefing,
  compareItems,
  daysBetween,
  joinList,
  leadSentences,
  marketDay,
  moveReason,
  portfolioDayMove,
  positionNote,
  relativeDay,
  seenKeys,
  statusOf,
  type BriefingInput,
  type BriefingPosition,
} from "@/lib/briefing";

const DATE = "2026-11-09"; // a Monday
const NOW = "2026-11-09T18:30:00.000Z";

function position(overrides: Partial<BriefingPosition> & { ticker: string }): BriefingPosition {
  return {
    instrument_id: `US_${overrides.ticker}`,
    name: `${overrides.ticker} Inc.`,
    relation: "holding",
    price: 100,
    day_change_pct: 0.2,
    price_as_of: "2026-11-09T18:20:00.000Z",
    stance: null,
    call_summary: null,
    watch_out: null,
    add_below: null,
    breakout_above: null,
    trim_above: null,
    earnings_date: null,
    earnings_time: null,
    pre_earnings_headline: null,
    ...overrides,
  };
}

function mover(overrides: Partial<AnomalyItem> & { ticker: string; day_change_pct: number }): AnomalyItem {
  return {
    instrument_id: `US_${overrides.ticker}`,
    name: `${overrides.ticker} Inc.`,
    sector: null,
    industry: null,
    logo_url: null,
    price: 100,
    previous_close: 100,
    day_change_abs: null,
    volume: null,
    price_as_of: "2026-11-09T18:20:00.000Z",
    direction: overrides.day_change_pct >= 0 ? "up" : "down",
    narrative_status: "verified",
    narrative_as_of: "2026-11-09T15:27:00.000Z",
    headline: null,
    thesis: null,
    today_brief: null,
    news_count: 0,
    source_count: 0,
    overall_score: null,
    overall_label: null,
    catalyst: null,
    risk: null,
    key_points: [],
    visual_summary: null,
    move_explanation: null,
    overall_verdict: null,
    comparative_context: null,
    ...overrides,
  };
}

const CONFIRMED = {
  cause_type: "leadership_and_regulatory_risk",
  headline: "Nvidia slides as its board opens a probe",
  why_it_matters:
    "The board said it is reviewing the chief executive's outside ties. Investors are pricing the risk of a leadership change. A third sentence that should not appear.",
  confidence: "high",
  evidence: [{ title: "Board opens probe", url: "https://www.reuters.com/markets/nvda-probe" }],
};

const PRICE_ONLY = {
  cause_type: "price_action",
  headline: "SOXL reverses sharply against recent weakness",
  why_it_matters: "SOXL is moving higher, reversing a prior-window decline.",
  confidence: "low",
  evidence: [],
};

function input(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    date: DATE,
    now: NOW,
    mode: "personal",
    positions: [],
    movers: [],
    movers_date: DATE,
    movers_as_of: "2026-11-09T18:20:00.000Z",
    indices: [],
    earnings_reports: [],
    congress_trades: [],
    news: [],
    alerts: [],
    call_changes: [],
    discussion: null,
    attention: [],
    ...overrides,
  };
}

describe("date helpers", () => {
  it("counts calendar days and names them the way a person would", () => {
    expect(daysBetween("2026-11-09", "2026-11-12")).toBe(3);
    expect(daysBetween("2026-11-09", "2026-11-06")).toBe(-3);
    expect(daysBetween("nope", "2026-11-06")).toBeNull();
    expect(relativeDay("2026-11-09", DATE)).toBe("today");
    expect(relativeDay("2026-11-10", DATE)).toBe("tomorrow");
    expect(relativeDay("2026-11-08", DATE)).toBe("yesterday");
    expect(relativeDay("2026-11-12", DATE)).toBe("on Thursday");
    expect(relativeDay("2026-11-06", DATE)).toBe("on Friday");
    expect(relativeDay("2026-11-20", DATE)).toBe("on Nov 20");
  });

  it("uses the US Eastern day, not the server's", () => {
    // 02:00 UTC on the 10th is still the evening of the 9th in New York.
    expect(marketDay("2026-11-10T02:00:00.000Z")).toBe("2026-11-09");
    expect(marketDay("not a date")).toBe("");
  });

  it("lists the seven days a person can open", () => {
    expect(briefingWindow(DATE)).toEqual([
      "2026-11-09",
      "2026-11-08",
      "2026-11-07",
      "2026-11-06",
      "2026-11-05",
      "2026-11-04",
      "2026-11-03",
    ]);
    expect(briefingWindow("bad")).toEqual([]);
  });
});

describe("text helpers", () => {
  it("keeps the first sentences and never cuts mid-word without saying so", () => {
    expect(leadSentences("One. Two. Three.", 2)).toBe("One. Two.");
    expect(leadSentences("  ")).toBe("");
    const long = leadSentences(`${"word ".repeat(100)}.`, 1, 60);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
  });

  it("joins lists in plain English", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("moveReason", () => {
  it("confirms a reason only when the research found sources", () => {
    const reason = moveReason(mover({ ticker: "NVDA", day_change_pct: -4.85, move_explanation: CONFIRMED }));
    expect(reason.status).toBe("confirmed");
    expect(reason.evidence[0]).toMatchObject({ source: "Reuters", url: "https://www.reuters.com/markets/nvda-probe" });
  });

  it("does not present a price-action read as a cause", () => {
    expect(moveReason(mover({ ticker: "SOXL", day_change_pct: 14, move_explanation: PRICE_ONLY })).status).toBe(
      "price_only",
    );
  });

  it("treats placeholders, unverified rows and missing rows as no reason", () => {
    expect(moveReason(null).status).toBe("none");
    expect(
      moveReason(
        mover({
          ticker: "UAMY",
          day_change_pct: 12,
          move_explanation: { cause_type: "no_verified_catalyst", headline: "--", why_it_matters: "x", evidence: [] },
        }),
      ).status,
    ).toBe("none");
    expect(
      moveReason(
        mover({ ticker: "NVDA", day_change_pct: -4, narrative_status: "unverified", move_explanation: CONFIRMED }),
      ).status,
    ).toBe("none");
  });
});

describe("buildBriefing: nothing to report", () => {
  it("says so plainly when nothing is tracked and nothing moved", () => {
    const briefing = buildBriefing(input());
    expect(briefing.nothing_needs_you).toBe(true);
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.also_today).toEqual([]);
    expect(briefing.summary).toBe(`${NOTHING_NEEDS_YOU}.`);
    expect(briefing.quiet.names).toEqual([]);
  });

  it("shows the quiet summary instead of inventing items", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "AAPL", day_change_pct: 0.8 }),
          position({ ticker: "MSFT", day_change_pct: -0.3, relation: "watching" }),
        ],
      }),
    );
    expect(briefing.nothing_needs_you).toBe(true);
    expect(briefing.summary).toBe(`${NOTHING_NEEDS_YOU}. All 2 names you track are quiet.`);
    expect(briefing.quiet.text).toBe(
      "All 2 names you track are quiet. The biggest move among them is AAPL, up 0.80%.",
    );
    expect(briefing.quiet.names.map((name) => name.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(briefing.counts).toEqual({ holdings: 1, watching: 1 });
  });

  it("does not turn a missing price into a zero", () => {
    const briefing = buildBriefing(
      input({ positions: [position({ ticker: "AAPL", price: null, day_change_pct: null })] }),
    );
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.quiet.names[0]).toEqual({ ticker: "AAPL", relation: "holding", day_change_pct: null });
    expect(briefing.quiet.text).toBe("The one name you track is quiet.");
    expect(briefing.quiet.text).not.toContain("0.00%");
  });
});

describe("buildBriefing: price moves", () => {
  it("puts the number and the confirmed reason together", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "NVDA", price: 186.2, day_change_pct: -4.85, stance: "hold" })],
        movers: [mover({ ticker: "NVDA", day_change_pct: -4.85, move_explanation: CONFIRMED })],
      }),
    );
    const item = briefing.needs_you[0];
    expect(item.kind).toBe("price_move");
    expect(item.headline).toBe("NVDA is down 4.85% today, at $186.20");
    expect(item.metric).toBe("−4.85%");
    expect(item.reason_status).toBe("confirmed");
    expect(item.why).toContain("Nvidia slides as its board opens a probe.");
    expect(item.why).not.toContain("third sentence");
    expect(item.next_step).toBe("The call is Hold. Open NVDA to see what would change it.");
    expect(item.evidence.map((entry) => entry.source)).toEqual(["Market quote", "Reuters"]);
    expect(item.evidence[0].at).toBe("2026-11-09T18:20:00.000Z");
    expect(briefing.summary).toBe(
      "One thing needs you today: NVDA is down 4.85%. On NVDA: Nvidia slides as its board opens a probe.",
    );
  });

  it("says there is no confirmed reason rather than inventing one", () => {
    const briefing = buildBriefing(
      input({ positions: [position({ ticker: "FLEX", price: 40, day_change_pct: 10.05 })] }),
    );
    const item = briefing.needs_you[0];
    expect(item.why).toBe(NO_CONFIRMED_REASON);
    expect(item.reason_status).toBe("unconfirmed");
    expect(item.next_step).toBe("Open FLEX to check the latest news and filings yourself.");
    expect(briefing.summary).not.toContain("confirmed reason");
  });

  it("labels a price-action read as what the price shows, not as the cause", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "SOXL", price: 52.4, day_change_pct: 14.02 })],
        movers: [mover({ ticker: "SOXL", day_change_pct: 14.02, move_explanation: PRICE_ONLY })],
      }),
    );
    const item = briefing.needs_you[0];
    expect(item.reason_status).toBe("unconfirmed");
    expect(item.why).toBe(
      `${NO_CONFIRMED_REASON} What the price shows: SOXL reverses sharply against recent weakness.`,
    );
  });

  it("orders a holding ahead of a watched name even when the watched name moved more", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "WTCH", relation: "watching", day_change_pct: -12 }),
          position({ ticker: "HOLD", relation: "holding", day_change_pct: 4.5 }),
        ],
      }),
    );
    expect(briefing.needs_you.map((item) => item.ticker)).toEqual(["HOLD", "WTCH"]);
    expect(briefing.needs_you.map((item) => item.relation)).toEqual(["holding", "watching"]);
    expect(briefing.summary).toMatch(/^Two things need you today: HOLD is up 4\.50% and WTCH is down 12\.00%\./);
  });

  it("keeps small moves out and medium moves in the compact list", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "SMAL", day_change_pct: 1.4 }),
          position({ ticker: "MIDH", day_change_pct: -3.2 }),
          position({ ticker: "MIDW", relation: "watching", day_change_pct: 5 }),
        ],
      }),
    );
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.also_today.map((item) => item.ticker)).toEqual(["MIDH", "MIDW"]);
    expect(briefing.quiet.names.map((name) => name.ticker)).toEqual(["SMAL"]);
    expect(briefing.summary).toBe(
      `${NOTHING_NEEDS_YOU}. There are 2 smaller updates, starting with this: MIDH is down 3.20%.`,
    );
  });

  it("points at the zone when the move brings the price close to it", () => {
    const down = buildBriefing(
      input({
        positions: [
          position({ ticker: "AMAT", price: 480, day_change_pct: -4.2, stance: "accumulate", add_below: 470 }),
        ],
      }),
    ).needs_you[0];
    expect(down.next_step).toBe("Check the add zone at $470. The price is 2.1% above it.");
    expect(down.alert).toMatchObject({ condition: "below", target_price: 470, label: "Alert me below $470" });

    const up = buildBriefing(
      input({
        positions: [position({ ticker: "MSFT", price: 510, day_change_pct: 4.4, stance: "hold", trim_above: 520 })],
      }),
    ).needs_you[0];
    expect(up.next_step).toBe("Check the trim zone at $520. The price is 2.0% below it.");
  });

  it("never writes a next step that tells the person to trade", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "AAA", price: 90, day_change_pct: -6, stance: "accumulate", add_below: 95 }),
          position({ ticker: "BBB", price: 210, day_change_pct: 6, stance: "trim", trim_above: 200 }),
          position({ ticker: "CCC", price: 50, day_change_pct: -9, stance: "avoid" }),
        ],
        alerts: [
          {
            id: "a1",
            ticker: "AAA",
            instrument_id: "US_AAA",
            condition: "below",
            target_price: 95,
            triggered_at: "2026-11-09T15:00:00.000Z",
            directive_text: "Add below $95",
          },
        ],
      }),
    );
    for (const item of [...briefing.needs_you, ...briefing.also_today]) {
      expect(item.next_step).not.toMatch(/^(buy|sell|add|trim|exit|accumulate)\b/i);
      expect(item.next_step).not.toMatch(/\b(buy now|sell now|you should (buy|sell)|take profits)\b/i);
    }
  });
});

describe("buildBriefing: zones, calls and alerts", () => {
  it("reports a holding inside its add zone once, with the move folded in", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({
            ticker: "AMAT",
            price: 462.1,
            day_change_pct: -5.1,
            stance: "accumulate",
            add_below: 470,
            call_summary: "Demand for etch tools is holding up.",
            watch_out: "A cut to the 2027 wafer equipment outlook.",
          }),
        ],
      }),
    );
    expect(briefing.needs_you).toHaveLength(1);
    const item = briefing.needs_you[0];
    expect(item.kind).toBe("zone_entered");
    expect(item.headline).toBe("AMAT is in its add zone: $462.10, below $470");
    expect(item.why).toBe(
      `The call is Accumulate. Demand for etch tools is holding up. It is down 5.10% today. ${NO_CONFIRMED_REASON}`,
    );
    expect(item.next_step).toBe(
      "Reread the call before you act on it. What would break it: A cut to the 2027 wafer equipment outlook.",
    );
  });

  it("demotes a zone the person already saw to 'still in'", () => {
    const base = {
      positions: [position({ ticker: "AMAT", price: 462.1, stance: "accumulate", add_below: 470 })],
    };
    const fresh = buildBriefing(input(base));
    expect(fresh.needs_you[0].headline).toContain("AMAT is in its add zone");

    const repeat = buildBriefing(input({ ...base, seen_before: seenKeys(fresh) }));
    expect(repeat.needs_you).toEqual([]);
    expect(repeat.also_today[0].headline).toBe("AMAT is still in its add zone: $462.10, below $470");
  });

  it("only shows a trim zone to someone who holds the stock", () => {
    const zones = { price: 530, stance: "hold", trim_above: 520 };
    const holder = buildBriefing(input({ positions: [position({ ticker: "MSFT", ...zones })] }));
    expect(holder.needs_you[0].headline).toBe("MSFT is in its trim zone: $530.00, above $520");
    const watcher = buildBriefing(
      input({ positions: [position({ ticker: "MSFT", relation: "watching", ...zones })] }),
    );
    expect([...watcher.needs_you, ...watcher.also_today]).toEqual([]);
  });

  it("reports a changed call and ignores old or unchanged ones", () => {
    const positions = [position({ ticker: "LRCX", relation: "watching", stance: "accumulate" })];
    const change = {
      ticker: "LRCX",
      instrument_id: "US_LRCX",
      prev_stance: "trim",
      new_stance: "accumulate",
      at: "2026-11-09T13:00:00.000Z",
      text: "Accumulate on dips below 310",
    };
    const briefing = buildBriefing(input({ positions, call_changes: [change] }));
    expect(briefing.needs_you[0]).toMatchObject({
      kind: "call_changed",
      tone: "up",
      headline: "The call on LRCX changed from Trim to Accumulate",
      why: "The new call: Accumulate on dips below 310.",
    });

    const old = buildBriefing(input({ positions, call_changes: [{ ...change, at: "2026-11-01T13:00:00.000Z" }] }));
    expect([...old.needs_you, ...old.also_today]).toEqual([]);
    const same = buildBriefing(input({ positions, call_changes: [{ ...change, prev_stance: "Accumulate" }] }));
    expect([...same.needs_you, ...same.also_today]).toEqual([]);
  });

  it("puts a triggered alert first among a person's holdings", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "BIGM", day_change_pct: -9 }),
          position({ ticker: "META", price: 571.2, day_change_pct: -1.1, stance: "accumulate" }),
        ],
        alerts: [
          {
            id: "alert-1",
            ticker: "META",
            instrument_id: "US_META",
            condition: "below",
            target_price: 580,
            triggered_at: "2026-11-09T16:47:00.000Z",
            directive_text: "Accumulate on dips below $580",
          },
        ],
      }),
    );
    expect(briefing.needs_you.map((item) => item.kind)).toEqual(["alert_triggered", "price_move"]);
    expect(briefing.needs_you[0].headline).toBe("Your alert on META triggered: below $580");
    expect(briefing.needs_you[0].why).toBe(
      'You set it from the call: "Accumulate on dips below $580". The price is $571.20 now.',
    );
  });
});

describe("buildBriefing: earnings", () => {
  it("leads with earnings today, ahead of a bigger move with no deadline", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "MOVE", day_change_pct: -8 }),
          position({
            ticker: "AAPL",
            day_change_pct: 0.4,
            stance: "hold",
            earnings_date: DATE,
            earnings_time: "amc",
            watch_out: "Services growth falling below 10%.",
          }),
        ],
      }),
    );
    expect(briefing.needs_you.map((item) => item.ticker)).toEqual(["AAPL", "MOVE"]);
    const item = briefing.needs_you[0];
    expect(item.headline).toBe("AAPL reports earnings today after the close");
    expect(item.metric).toBe("Today");
    expect(item.deadline_days).toBe(0);
    expect(item.why).toBe("The call going in is Hold.");
    expect(item.next_step).toBe(
      "Earnings today after the close. Here is what would change the call: Services growth falling below 10%.",
    );
  });

  it("orders deadlines soonest first and names the weekday", () => {
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "LATE", earnings_date: "2026-11-12" }),
          position({ ticker: "SOON", earnings_date: "2026-11-10", earnings_time: "bmo" }),
          position({ ticker: "FARR", earnings_date: "2026-12-20" }),
        ],
      }),
    );
    expect(briefing.needs_you.map((item) => item.ticker)).toEqual(["SOON"]);
    expect(briefing.needs_you[0].headline).toBe("SOON reports earnings tomorrow before the open");
    expect(briefing.also_today.map((item) => item.ticker)).toEqual(["LATE"]);
    expect(briefing.also_today[0].next_step).toBe(
      "Earnings Thursday. Read the pre-earnings notes on LATE before then.",
    );
    expect(briefing.quiet.names.map((name) => name.ticker)).toEqual(["FARR"]);
  });

  it("replaces a stale upcoming date with the report once it is in", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "CEVA", day_change_pct: -8.86, earnings_date: "2026-11-08" })],
        earnings_reports: [
          {
            ticker: "CEVA",
            instrument_id: "US_CEVA",
            event_date: "2026-11-08",
            generated_at: "2026-11-09T12:00:00.000Z",
            headline: "Revenue and EPS both missed",
            summary: "",
            for_holders: "The licensing pipeline is the thing to recheck. More text.",
            for_watchers: "Wait for the next quarter.",
            monitor: "Royalty revenue in Q4",
          },
        ],
      }),
    );
    expect(briefing.needs_you).toHaveLength(1);
    const item = briefing.needs_you[0];
    expect(item.kind).toBe("earnings_reported");
    expect(item.headline).toBe("CEVA reported earnings yesterday and is down 8.86% today");
    expect(item.why).toBe("Revenue and EPS both missed. The licensing pipeline is the thing to recheck.");
    expect(item.next_step).toBe(
      "Read the post-earnings report. The thing to watch next: Royalty revenue in Q4.",
    );
  });
});

describe("buildBriefing: other sources", () => {
  const trade = {
    trade_id: "t1",
    person_name: "Josh Gottheimer",
    chamber: "house",
    party: "D",
    state: "NJ",
    ticker: "AMAT",
    company: "Applied Materials, Inc.",
    tx_type: "buy",
    amount_low: 1001,
    amount_high: 15000,
    transaction_date: "2026-10-26",
    disclosure_date: "2026-11-05",
    lag_days: 10,
    source_url: "https://disclosures-clerk.house.gov/FinancialDisclosure",
  };

  it("reports a congressional trade in a holding with its bracket and filing lag", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "AMAT" })],
        congress_trades: [trade, { ...trade, trade_id: "t2", ticker: "ZZZZ" }],
      }),
    );
    expect(briefing.needs_you).toEqual([]);
    const item = briefing.also_today[0];
    expect(item.headline).toBe("Josh Gottheimer (D-NJ) bought AMAT: $1K to $15K");
    expect(item.why).toBe(
      "The trade was made on Oct 26 and filed 10 days later. Filings report a bracket, never an exact amount.",
    );
    expect(item.evidence[0]).toMatchObject({ source: "House Clerk disclosures", at: "2026-11-05" });
    expect(briefing.also_today).toHaveLength(1);
  });

  it("drops a disclosure that is no longer recent", () => {
    const briefing = buildBriefing(
      input({ positions: [position({ ticker: "AMAT" })], congress_trades: [{ ...trade, disclosure_date: "2026-10-20" }] }),
    );
    expect(briefing.also_today).toEqual([]);
  });

  it("shows news on a holding, but not when a confirmed move reason already covers it", () => {
    const article = {
      id: "n1",
      title: "Apple widens its chip deal",
      url: "https://example.com/apple",
      source_name: "Example Wire",
      published_at: "2026-11-09T14:00:00.000Z",
      summary: "Apple extended a supply agreement. Terms were not disclosed.",
      tickers: ["AAPL", "NVDA"],
    };
    const briefing = buildBriefing(
      input({
        positions: [
          position({ ticker: "AAPL", stance: "hold" }),
          position({ ticker: "NVDA", day_change_pct: -4.85 }),
        ],
        movers: [mover({ ticker: "NVDA", day_change_pct: -4.85, move_explanation: CONFIRMED })],
        news: [article, { ...article, id: "old", published_at: "2026-11-01T14:00:00.000Z", title: "Old story" }],
      }),
    );
    const news = briefing.also_today.filter((item) => item.kind === "news");
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({
      ticker: "AAPL",
      headline: "News on AAPL: Apple widens its chip deal",
      next_step: "Read it, then check whether it changes the call. It is Hold today.",
    });
    expect(news[0].evidence[0]).toMatchObject({ source: "Example Wire", at: "2026-11-09T14:00:00.000Z" });
  });

  it("reports Reddit discussion on a tracked name without calling it a signal", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "NVDA" })],
        discussion: {
          generated_at: "2026-11-09T18:20:00.000Z",
          window_hours: 120,
          tickers: [
            {
              ticker: "NVDA",
              company_name: "NVIDIA",
              mention_count: 10,
              sentiment: "bearish",
              summary: "Posts focus on the board probe.",
              latest_post_at: "2026-11-09T14:56:00.000Z",
            },
            { ticker: "NVDA2", company_name: null, mention_count: 99, sentiment: "bullish", summary: "x", latest_post_at: null },
          ],
        },
      }),
    );
    expect(briefing.also_today).toHaveLength(1);
    expect(briefing.also_today[0].headline).toBe(
      "NVDA is one of the most discussed stocks on Reddit: 10 posts in 5 days, mostly bearish",
    );
  });
});

describe("buildBriefing: stale data", () => {
  it("says which session the numbers are from instead of calling them today's", () => {
    const briefing = buildBriefing(
      input({
        date: "2026-11-08", // a Sunday
        now: "2026-11-08T15:00:00.000Z",
        movers_date: "2026-11-06",
        positions: [
          position({ ticker: "NVDA", price: 186.2, day_change_pct: -4.85, price_as_of: "2026-11-06T21:00:00.000Z" }),
        ],
      }),
    );
    expect(briefing.stale_note).toBe(
      "Prices as of Friday's close.",
    );
    expect(briefing.needs_you[0].headline).toBe("NVDA is down 4.85% on Friday, at $186.20");
    expect(briefing.needs_you[0].headline).not.toContain("today");
  });

  it("goes by the newest quote when your stocks are fresher than the movers feed", () => {
    const briefing = buildBriefing(
      input({
        date: "2026-11-10",
        now: "2026-11-10T15:00:00.000Z",
        movers_date: "2026-11-09",
        positions: [position({ ticker: "NVDA", price: 172.07, day_change_pct: -3.69, price_as_of: "2026-11-10T14:39:00.000Z" })],
      }),
    );
    expect(briefing.stale_note).toBeNull();
  });

  it("has no stale note when the data is from the briefing's own day", () => {
    expect(buildBriefing(input()).stale_note).toBeNull();
  });

  it("ignores alerts, news and call changes that are too old to be today's", () => {
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "META" })],
        alerts: [
          {
            id: "a",
            ticker: "META",
            instrument_id: "US_META",
            condition: "below",
            target_price: 580,
            triggered_at: "2026-06-10T16:47:00.000Z",
            directive_text: null,
          },
        ],
      }),
    );
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.nothing_needs_you).toBe(true);
  });
});

describe("buildBriefing: market mode", () => {
  const movers = [
    mover({ ticker: "LITE", day_change_pct: 11.52, price: 300, move_explanation: { ...CONFIRMED, headline: "Marvell's deal lifts Lumentum" } }),
    mover({ ticker: "IBRX", day_change_pct: -24.03, price: 2, move_explanation: { ...CONFIRMED, headline: "IBRX plunges after an earnings miss" } }),
    mover({ ticker: "SOXL", day_change_pct: 14.02, move_explanation: PRICE_ONLY }),
    mover({ ticker: "BE", day_change_pct: 10.79, move_explanation: { ...CONFIRMED, headline: "Bloom Energy signs a power deal" } }),
  ];

  it("builds a real market read from explained movers, both directions", () => {
    const briefing = buildBriefing(
      input({
        mode: "market",
        movers,
        indices: [
          { name: "S&P 500", price: 6000, change_pct: 0.42 },
          { name: "Nasdaq 100", price: 21000, change_pct: -0.1 },
        ],
      }),
    );
    expect(briefing.mode).toBe("market");
    expect(briefing.needs_you.map((item) => item.ticker)).toEqual(["IBRX", "LITE", "BE"]);
    expect(briefing.needs_you.every((item) => item.relation === "market" && item.reason_status === "confirmed")).toBe(true);
    expect(briefing.also_today.map((item) => item.ticker)).toEqual(["SOXL"]);
    expect(briefing.also_today[0].why).toContain(NO_CONFIRMED_REASON);
    expect(briefing.summary).toBe(
      "The S&P 500 is up 0.42% and the Nasdaq 100 is down 0.10%. The biggest explained moves: IBRX is down 24.03%, LITE is up 11.52% and BE is up 10.79%. On IBRX: IBRX plunges after an earnings miss.",
    );
    expect(briefing.market.gainers.map((row) => row.ticker)).toEqual(["SOXL", "LITE", "BE"]);
    expect(briefing.market.gainers[0].reason).toBe("No confirmed reason yet");
    expect(briefing.market.losers.map((row) => row.ticker)).toEqual(["IBRX"]);
  });

  it("admits it when the session has no explained movers yet", () => {
    const briefing = buildBriefing(input({ mode: "market" }));
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.summary).toBe("We do not have explained movers for this session yet.");
  });

  it("skips absurd moves that are almost always bad data", () => {
    const briefing = buildBriefing(
      input({ mode: "market", movers: [mover({ ticker: "BADD", day_change_pct: 900, move_explanation: CONFIRMED })] }),
    );
    expect(briefing.needs_you).toEqual([]);
    expect(briefing.market.gainers).toEqual([]);
  });
});

describe("ordering and ids", () => {
  it("caps the cards that need the person and moves the rest down", () => {
    const positions = Array.from({ length: 9 }, (_, index) =>
      position({ ticker: `H${index}`, day_change_pct: -(5 + index) }),
    );
    const briefing = buildBriefing(input({ positions }));
    expect(briefing.needs_you).toHaveLength(6);
    expect(briefing.needs_you[0].ticker).toBe("H8");
    expect(briefing.also_today.map((item) => item.ticker)).toEqual(["H2", "H1", "H0"]);
    expect(briefing.also_today.every((item) => item.needs_you === false)).toBe(true);
  });

  it("gives every item an id that is stable for the day and safe to store", () => {
    const build = () =>
      buildBriefing(
        input({
          positions: [
            position({ ticker: "BRK.B", day_change_pct: -6 }),
            position({ ticker: "AMAT", price: 460, stance: "accumulate", add_below: 470 }),
          ],
        }),
      );
    const first = build();
    const ids = first.needs_you.map((item) => item.id);
    expect(ids).toEqual(["2026-11-09_zone_entered_AMAT_add", "2026-11-09_price_move_BRK-B"]);
    expect(build().needs_you.map((item) => item.id)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts by relation, then deadline, then severity, then size", () => {
    const base = { relation: "holding" as const, deadline_days: null, severity: "low" as const, day_change_pct: 0, ticker: "A", id: "a" };
    expect(compareItems(base, { ...base, relation: "watching" })).toBeLessThan(0);
    expect(compareItems({ ...base, deadline_days: 3 }, { ...base, severity: "high" })).toBeLessThan(0);
    expect(compareItems({ ...base, deadline_days: 1 }, { ...base, deadline_days: 0 })).toBeGreaterThan(0);
    expect(compareItems({ ...base, severity: "high" }, { ...base, day_change_pct: 50 })).toBeLessThan(0);
    expect(compareItems({ ...base, day_change_pct: -9 }, { ...base, day_change_pct: 4 })).toBeLessThan(0);
  });
});

describe("item state", () => {
  it("reads a saved status and falls back to open", () => {
    const state = { a: { status: "dismissed" as const, at: NOW }, b: { status: "kept" as const, at: NOW } };
    expect(statusOf(state, "a")).toBe("dismissed");
    expect(statusOf(state, "b")).toBe("kept");
    expect(statusOf(state, "c")).toBe("open");
    expect(statusOf(null, "a")).toBe("open");
  });
});

describe("sections: needs you, worth knowing, coming up, quiet", () => {
  const busy = () =>
    buildBriefing(
      input({
        positions: [
          position({ ticker: "AAA", day_change_pct: -8.4 }),
          position({ ticker: "BBB", relation: "watching", day_change_pct: 5.1 }),
          position({ ticker: "CCC", earnings_date: "2026-11-13" }),
          position({ ticker: "DDD", relation: "watching", earnings_date: "2026-11-11", earnings_time: "amc" }),
          position({ ticker: "EEE", day_change_pct: 0.4 }),
          position({ ticker: "FFF", relation: "watching", day_change_pct: null, price: null }),
        ],
      }),
    );

  it("puts a decision first, a dated event under coming up and the rest under worth knowing", () => {
    const sections = briefingSections(busy(), {});
    expect(sections.needs_you.map((item) => item.ticker)).toEqual(["AAA"]);
    expect(sections.worth_knowing.map((item) => item.ticker)).toEqual(["BBB"]);
    expect(sections.coming_up.map((item) => item.ticker)).toEqual(["DDD", "CCC"]);
    expect(sections.attention).toBe(1);
  });

  it("orders coming up by date even though a holding normally outranks a watched name", () => {
    const sections = briefingSections(busy(), {});
    expect(sections.coming_up.map((item) => item.deadline_days)).toEqual([2, 4]);
  });

  it("moves an item out of the open lists when it is dismissed or kept, and never loses it", () => {
    const briefing = busy();
    const [aaa] = briefing.needs_you;
    const bbb = briefing.also_today.find((item) => item.ticker === "BBB")!;
    const sections = briefingSections(briefing, {
      [aaa.id]: { status: "dismissed", at: NOW },
      [bbb.id]: { status: "kept", at: NOW },
    });
    expect(sections.needs_you).toEqual([]);
    expect(sections.worth_knowing).toEqual([]);
    expect(sections.dismissed.map((item) => item.ticker)).toEqual(["AAA"]);
    expect(sections.kept.map((item) => item.ticker)).toEqual(["BBB"]);
    expect(sections.attention).toBe(0);
    const undone = briefingSections(briefing, { [aaa.id]: { status: "open", at: NOW } });
    expect(undone.needs_you.map((item) => item.ticker)).toEqual(["AAA"]);
  });

  it("lists every name with nothing to report as quiet, and says so", () => {
    const briefing = busy();
    expect(briefing.quiet.names.map((name) => name.ticker)).toEqual(["EEE", "FFF"]);
    expect(briefing.quiet.text).toBe("2 other names are quiet. The biggest move among them is EEE, up 0.40%.");
    // A missing price stays missing: it is never shown as a zero move.
    expect(briefing.quiet.names[1].day_change_pct).toBeNull();
  });

  it("ends in 'do nothing' when every name is quiet", () => {
    const briefing = buildBriefing(
      input({ positions: [position({ ticker: "AAA" }), position({ ticker: "BBB", relation: "watching", day_change_pct: -0.3 })] }),
    );
    const sections = briefingSections(briefing, {});
    expect(sections.attention).toBe(0);
    expect(sections.needs_you).toEqual([]);
    expect(sections.worth_knowing).toEqual([]);
    expect(sections.coming_up).toEqual([]);
    expect(briefing.nothing_needs_you).toBe(true);
    expect(briefing.summary).toBe(`${NOTHING_NEEDS_YOU}. All 2 names you track are quiet.`);
    expect(briefing.quiet.names).toHaveLength(2);
  });
});

describe("dedupe", () => {
  it("turns the same event arriving twice into one item", () => {
    const trade = {
      trade_id: "t1",
      person_name: "Jane Doe",
      chamber: "house",
      party: "D",
      state: "CA",
      ticker: "AAA",
      company: "AAA Inc.",
      tx_type: "buy",
      amount_low: 1001,
      amount_high: 15000,
      transaction_date: "2026-10-20",
      disclosure_date: "2026-11-07",
      lag_days: 18,
      source_url: "https://example.com",
    };
    const alert = {
      id: "al1",
      ticker: "AAA",
      instrument_id: "US_AAA",
      condition: "below" as const,
      target_price: 95,
      triggered_at: "2026-11-09T15:00:00.000Z",
      directive_text: null,
    };
    const briefing = buildBriefing(
      input({
        positions: [position({ ticker: "AAA", day_change_pct: -6 }), position({ ticker: "AAA", day_change_pct: -6 })],
        congress_trades: [trade, { ...trade }],
        alerts: [alert, { ...alert }],
      }),
    );
    const items = [...briefing.needs_you, ...briefing.also_today];
    expect(items.map((item) => item.kind).sort()).toEqual(["alert_triggered", "congress_trade", "price_move"]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("does not show a move twice when a zone card already carries it", () => {
    const briefing = buildBriefing(
      input({ positions: [position({ ticker: "AAA", price: 90, day_change_pct: -7, stance: "accumulate", add_below: 95 })] }),
    );
    const items = [...briefing.needs_you, ...briefing.also_today];
    expect(items.map((item) => item.kind)).toEqual(["zone_entered"]);
  });
});

describe("why it matters to this person", () => {
  it("says how much they hold and what the day was worth", () => {
    const held = position({ ticker: "AAA", price: 110, day_change_pct: 10, quantity: 20 });
    expect(positionNote(held, 4400)).toBe("You hold 20 shares, about $2,200 (50.0% of your holdings). That is up about $200 today.");
    expect(positionNote(position({ ticker: "BBB", relation: "watching" }), 4400)).toBe("On your watchlist. You do not hold it.");
    expect(positionNote(position({ ticker: "CCC" }), null)).toContain("Add how much in Portfolio");
    expect(positionNote(null, null)).toBeNull();
  });

  it("puts the note on personal items and leaves it off the market view", () => {
    const personal = buildBriefing(input({ positions: [position({ ticker: "AAA", day_change_pct: -6, quantity: 10 })] }));
    expect(personal.needs_you[0].position_note).toContain("You hold 10 shares");
    const market = buildBriefing(
      input({ mode: "market", movers: [mover({ ticker: "NVDA", day_change_pct: -6, move_explanation: CONFIRMED })] }),
    );
    expect(market.needs_you[0].position_note).toBeNull();
  });

  it("adds up the day for sized holdings only and says how many it could count", () => {
    const move = portfolioDayMove([
      position({ ticker: "AAA", price: 110, day_change_pct: 10, quantity: 10 }),
      position({ ticker: "BBB", price: 90, day_change_pct: -10, market_value: 900 }),
      position({ ticker: "CCC", price: 50, day_change_pct: 5 }),
      position({ ticker: "DDD", relation: "watching", price: 50, day_change_pct: 50, quantity: 100 }),
    ]);
    expect(move?.counted).toBe(2);
    expect(move?.holdings).toBe(3);
    expect(move?.value).toBeCloseTo(2000, 6);
    expect(move?.day_change_value).toBeCloseTo(0, 6);
    expect(portfolioDayMove([position({ ticker: "CCC" })])).toBeNull();
    expect(buildBriefing(input({ mode: "market" })).portfolio).toBeNull();
  });
});

describe("standing jobs and the week ahead", () => {
  const run = (overrides = {}) => ({
    job_id: "abc123def456",
    job_name: "Big daily moves",
    day: DATE,
    ran_at: "2026-11-09T14:00:00.000Z",
    summary: "AAA fell 6.00% in a day.",
    findings: [
      { ticker: "AAA", headline: "AAA fell 6.00% in a day", detail: "Closed at $94.00 on Nov 6.", source: "Daily closing prices", url: "/stock/AAA", at: "2026-11-06" },
    ],
    ...overrides,
  });

  it("puts a job that found something under needs you, linked to its run log", () => {
    const briefing = buildBriefing(input({ positions: [position({ ticker: "AAA" })], agent_runs: [run()] }));
    const item = briefing.needs_you.find((entry) => entry.kind === "agent_job");
    expect(item?.headline).toBe('Your job "Big daily moves" found something: AAA fell 6.00% in a day');
    expect(item?.href).toBe("/agents?job=abc123def456");
    expect(item?.evidence[0].source).toBe("Daily closing prices");
    // The job item mentions AAA, so AAA is not also listed as quiet.
    expect(briefing.quiet.names).toEqual([]);
  });

  it("shows one item per job, ignores old runs and survives the needs-you cap", () => {
    const many = Array.from({ length: 8 }, (_, index) => position({ ticker: `H${index}`, day_change_pct: -9 - index }));
    const briefing = buildBriefing(
      input({
        positions: many,
        agent_runs: [run(), run({ day: "2026-11-08", ran_at: "2026-11-08T14:00:00.000Z" }), run({ job_id: "old", ran_at: "2026-11-01T14:00:00.000Z" })],
      }),
    );
    expect(briefing.needs_you).toHaveLength(6);
    expect(briefing.needs_you.filter((item) => item.kind === "agent_job")).toHaveLength(1);
  });

  it("lists widely followed earnings under coming up in the market view only", () => {
    const upcoming = [
      { ticker: "CSCO", name: "Cisco Systems", date: "2026-11-12", time: "amc" as const },
      { ticker: "OLD", name: "Old Co", date: "2026-11-05", time: null },
      { ticker: "FAR", name: "Far Co", date: "2026-11-30", time: null },
    ];
    const market = buildBriefing(input({ mode: "market", upcoming_earnings: upcoming }));
    const sections = briefingSections(market, null);
    expect(sections.coming_up.map((item) => item.headline)).toEqual(["CSCO reports earnings on Thursday after the close"]);
    const personal = buildBriefing(input({ upcoming_earnings: upcoming }));
    expect(briefingSections(personal, null).coming_up).toEqual([]);
  });

  it("sends 'Ask why' to the copilot with the question filled in", () => {
    const briefing = buildBriefing(input({ positions: [position({ ticker: "AAA", day_change_pct: -6 })] }));
    const href = askWhyHref(briefing.needs_you[0]);
    expect(href.startsWith("/ask?q=")).toBe(true);
    expect(decodeURIComponent(href.slice("/ask?q=".length))).toContain(briefing.needs_you[0].headline);
  });

  it("keeps decimals whole when it shortens a reason", () => {
    expect(leadSentences("Revenue was $2.37 billion, up 50%. Guidance rose. More.", 2)).toBe(
      "Revenue was $2.37 billion, up 50%. Guidance rose.",
    );
  });
});

describe("quiet is never a cut-off", () => {
  it("does not call a name quiet when it moved, however long the list gets", () => {
    const positions = Array.from({ length: 30 }, (_, index) =>
      position({ ticker: `W${String(index).padStart(2, "0")}`, relation: "watching", day_change_pct: 5 + index / 10 }),
    );
    positions.push(position({ ticker: "CALM", relation: "watching", day_change_pct: 0.1 }));
    const briefing = buildBriefing(input({ positions }));
    expect(briefing.quiet.names.map((name) => name.ticker)).toEqual(["CALM"]);
    expect(briefing.needs_you.length + briefing.also_today.length).toBe(30);
  });
});
