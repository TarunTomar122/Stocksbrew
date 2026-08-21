import { describe, expect, it } from "vitest";

import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { RadarStockStateDoc, WatchlistRow } from "@/lib/watchlist-view";

import {
  buildEarningsRunway,
  buildHubRows,
  daysUntil,
  easternDate,
  reasonForRow,
} from "@/lib/watchlist-hub-data";

function rowFixture(overrides: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    instrument_id: "US_BA",
    ticker: "BA",
    instrument_name: "Boeing",
    logo_url: null,
    position_type: "watchlist",
    market: "US",
    sector_label: "",
    industry_label: "",
    currency: "USD",
    price: 180,
    day_change_pct: -1.2,
    day_change_abs: null,
    scores: {
      overall: 72,
      verdict: null,
      valuation: null,
      growth: null,
      quality: null,
      momentum: null,
    },
    alerts: [],
    catalysts: [],
    brief_tile: { micro: "", vibe: "up", source: "rules" },
    coverage_status: "ready",
    has_intel_pro: false,
    ...overrides,
  } as WatchlistRow;
}

function anomalyFixture(overrides: Partial<AnomalyItem> = {}): AnomalyItem {
  return {
    instrument_id: "US_BA",
    ticker: "BA",
    name: "Boeing",
    sector: null,
    industry: null,
    logo_url: null,
    price: 180,
    previous_close: 182,
    day_change_pct: -1.2,
    day_change_abs: -2,
    volume: 1_000_000,
    direction: "down",
    headline: "Dow slides after delivery numbers miss",
    thesis: "Deliveries came in under consensus.",
  } as AnomalyItem;
}

function earningsFixture(overrides: Partial<EarningsIntelDoc> = {}): EarningsIntelDoc {
  return {
    doc_id: "d1",
    market: "US",
    instrument_id: "US_BA",
    ticker: "BA",
    event_date: "2026-08-19",
    generated_at: "2026-08-19T20:00:00Z",
    report: {
      headline: "Beat on margins, guided Q4 flat",
      summary: "",
    },
  } as unknown as EarningsIntelDoc;
}

describe("reasonForRow", () => {
  it("prefers the anomaly headline and tones it by the day move", () => {
    const result = reasonForRow({
      day_change_pct: -2.5,
      earnings_headline: "Earnings headline",
      anomaly_headline: "Move explained by deliveries miss",
      flags: [{ kind: "signal", title: "Flag title", body: "Flag body", tone: "bull" }],
    });
    expect(result).toEqual({ line: "Move explained by deliveries miss", tone: "bear" });
  });

  it("falls back to the earnings headline, then a flag, then the micro line", () => {
    expect(
      reasonForRow({
        day_change_pct: 1,
        earnings_headline: "Beat on margins",
        anomaly_headline: null,
        flags: [],
      }).line,
    ).toBe("Beat on margins");

    expect(
      reasonForRow({
        day_change_pct: 1,
        earnings_headline: null,
        anomaly_headline: null,
        flags: [{ kind: "k", title: "RSI is stretched", body: "At 74.", tone: "bear" }],
      }),
    ).toEqual({ line: "RSI is stretched. At 74.", tone: "bear" });

    expect(
      reasonForRow({
        day_change_pct: 1,
        earnings_headline: null,
        anomaly_headline: null,
        flags: [],
        brief_micro: "Holding the 50-day.",
        brief_vibe: "up",
      }),
    ).toEqual({ line: "Holding the 50-day.", tone: "bull" });
  });

  it("returns an empty neutral line when nothing is known", () => {
    expect(
      reasonForRow({ day_change_pct: null, earnings_headline: null, anomaly_headline: null, flags: [] }),
    ).toEqual({ line: "", tone: "neutral" });
  });
});

describe("buildHubRows", () => {
  const today = easternDate("2026-08-21")!;

  it("merges state, anomaly, earnings and premarket data into one row", () => {
    const [hub] = buildHubRows({
      rows: [
        rowFixture({
          directive_v2: { stance: "accumulate" },
          news_velocity: { mentions_7d: 9 },
        }),
      ],
      states: {
        US_BA: { rsi_14: 41.2, rsi_state: "neutral", earnings_date: "2026-09-02" } as RadarStockStateDoc,
      },
      anomaliesByInstrumentId: new Map([["US_BA", anomalyFixture()]]),
      earningsById: new Map([["US_BA", earningsFixture()]]),
      gappersByInstrumentId: new Map([["US_BA", -0.8]]),
    });

    expect(hub.name).toBe("Boeing");
    expect(hub.stance).toBe("Accumulate");
    expect(hub.rsi_14).toBeCloseTo(41.2);
    expect(hub.anomaly_headline).toBe("Dow slides after delivery numbers miss");
    expect(hub.reason_line).toBe("Dow slides after delivery numbers miss");
    expect(hub.reason_tone).toBe("bear");
    expect(hub.premarket_change_pct).toBeCloseTo(-0.8);
    expect(hub.mentions_7d).toBe(9);
    // Intel from Aug 19 is older than the Sep 2 state date, so Sep 2 stays upcoming.
    expect(hub.earnings_date).toBe("2026-09-02");
  });

  it("drops the state date when fresher intel proves the stock already reported", () => {
    const [hub] = buildHubRows({
      rows: [rowFixture()],
      states: { US_BA: { earnings_date: "2026-08-10" } },
      earningsById: new Map([["US_BA", earningsFixture()]]), // event_date 2026-08-19
    });
    expect(hub.earnings_date).toBeNull();
  });

  it("keeps the upcoming earnings date when no fresher intel exists", () => {
    const [hub] = buildHubRows({
      rows: [rowFixture()],
      states: { US_BA: { earnings_date: "2026-09-02" } },
    });
    expect(hub.earnings_date).toBe("2026-09-02");
    expect(daysUntil(hub.earnings_date!, today)).toBe(12);
  });

  it("falls back to ticker when the instrument has no name", () => {
    const [hub] = buildHubRows({ rows: [rowFixture({ instrument_name: undefined })] });
    expect(hub.name).toBe("BA");
  });
});

describe("buildEarningsRunway", () => {
  const today = easternDate("2026-08-21")!;

  function hubWithEarnings(instrumentId: string, ticker: string, date: string | null) {
    return buildHubRows({ rows: [rowFixture({ instrument_id: instrumentId, ticker })] }).map((r) => ({
      ...r,
      earnings_date: date,
    }));
  }

  it("sorts soonest first, drops past dates and caps entries", () => {
    const rows = [
      ...hubWithEarnings("a", "AAA", "2026-09-18"),
      ...hubWithEarnings("b", "BBB", "2026-08-24"),
      ...hubWithEarnings("c", "CCC", "2026-08-10"), // past
      ...hubWithEarnings("d", "DDD", null),
    ];
    const runway = buildEarningsRunway(rows, today, 30, 1);
    expect(runway.map((e) => e.ticker)).toEqual(["BBB"]);
    expect(runway[0].days_away).toBe(3);
    expect(runway[0].date_label).toBe("Aug 24");
  });

  it("excludes names beyond the horizon", () => {
    const rows = hubWithEarnings("a", "AAA", "2027-01-05");
    expect(buildEarningsRunway(rows, today, 30, 6)).toEqual([]);
  });
});

