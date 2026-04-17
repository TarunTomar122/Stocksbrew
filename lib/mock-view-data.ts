import { DashboardRow, DashboardView, InstrumentView } from "@/lib/view-contracts";

type InstrumentViewOverrides = {
  instrument?: Partial<InstrumentView["instrument"]>;
  price_snapshot?: Partial<InstrumentView["price_snapshot"]>;
  fundamentals?: Partial<InstrumentView["fundamentals"]>;
  intelligence_summary?: Partial<InstrumentView["intelligence_summary"]>;
  sentiment_breakdown?: Partial<InstrumentView["sentiment_breakdown"]>;
  analyst_consensus?: Partial<NonNullable<InstrumentView["analyst_consensus"]>>;
  trend_convergence?: Partial<InstrumentView["trend_convergence"]>;
  momentum_signal?: Partial<InstrumentView["momentum_signal"]>;
  related_tickers?: InstrumentView["related_tickers"];
  timeline?: InstrumentView["timeline"];
};

const watchlistRows: DashboardRow[] = [
  {
    instrument_id: "US_NVDA",
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Technology",
    price: 942.89,
    day_change_pct: 3.42,
    ai_sentiment_score: 84,
    news_count: 18,
    source_count: 12,
    sector_score: 82,
    sector_brief: "Today's Technology tone is strong, led by AI infrastructure names.",
  },
  {
    instrument_id: "US_AMD",
    ticker: "AMD",
    name: "Advanced Micro Devices",
    sector: "Technology",
    price: 164.2,
    day_change_pct: 1.81,
    ai_sentiment_score: 78,
    news_count: 13,
    source_count: 9,
    sector_score: 82,
    sector_brief: "Today's Technology tone is strong, led by AI infrastructure names.",
  },
  {
    instrument_id: "US_MSFT",
    ticker: "MSFT",
    name: "Microsoft Corporation",
    sector: "Technology",
    price: 428.14,
    day_change_pct: 0.92,
    ai_sentiment_score: 76,
    news_count: 9,
    source_count: 7,
    sector_score: 74,
    sector_brief: "Software remains constructive, though gains are narrower than semis.",
  },
  {
    instrument_id: "US_AAPL",
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    price: 211.48,
    day_change_pct: 0.44,
    ai_sentiment_score: 69,
    news_count: 7,
    source_count: 6,
    sector_score: 74,
    sector_brief: "Software remains constructive, though gains are narrower than semis.",
  },
  {
    instrument_id: "US_TSLA",
    ticker: "TSLA",
    name: "Tesla, Inc.",
    sector: "Consumer",
    price: 178.32,
    day_change_pct: -1.63,
    ai_sentiment_score: 41,
    news_count: 11,
    source_count: 8,
    sector_score: 46,
    sector_brief: "Autos are mixed as EV demand questions offset positive growth pockets.",
  },
];

export const mockDashboardViewUS: DashboardView = {
  market: "US",
  generated_at: "2026-03-25T15:00:00Z",
  universe_id: "us_test_5",
  macro_cards: [
    {
      id: "sp500",
      label: "S&P 500",
      value: 5288.2,
      day_change_pct: 1.24,
      series: [5168, 5194, 5211, 5225, 5251, 5288],
    },
    {
      id: "nasdaq100",
      label: "NASDAQ 100",
      value: 18642.5,
      day_change_pct: 1.88,
      series: [17992, 18030, 18110, 18254, 18420, 18642],
    },
    {
      id: "gold",
      label: "Gold",
      value: 2164.8,
      day_change_pct: -0.12,
      series: [2182, 2170, 2175, 2168, 2169, 2164],
    },
  ],
  market_sentiment: {
    label: "Strong Bullish",
    score: 86,
  },
  hero_brief: {
    title: "AI Market Briefing",
    body: "Semiconductors and AI infrastructure remain the strongest narratives today, with Nvidia and AMD leading coverage. Microsoft is steady, Apple is quieter, and Tesla coverage is more defensive as delivery concerns return.",
    verified_source_count: 12,
    updated_at: "2026-03-25T14:56:00Z",
  },
  sector_flows: [
    { sector: "Semiconductors", flow_pct: 2.4, direction: "up" },
    { sector: "Software", flow_pct: 1.5, direction: "up" },
    { sector: "Autos", flow_pct: -0.6, direction: "down" },
  ],
  watchlist_rows: watchlistRows,
  gainers: watchlistRows.slice(0, 3),
  losers: [watchlistRows[4]],
};

function buildInstrumentView(
  row: DashboardRow,
  options: InstrumentViewOverrides,
): InstrumentView {
  return {
    instrument_id: row.instrument_id,
    market: "US",
    generated_at: "2026-03-25T15:00:00Z",
    instrument: {
      ticker: row.ticker,
      name: row.name,
      exchange: "NASDAQ",
      sector: "Technology",
      industry: "Semiconductors",
      logo_url: "",
      index_memberships: ["S&P 500", "NASDAQ 100"],
      ...options.instrument,
    },
    price_snapshot: {
      current: row.price,
      day_change_abs: Number((row.price * (row.day_change_pct / 100)).toFixed(2)),
      day_change_pct: row.day_change_pct,
      captured_at: "2026-03-25T14:35:00Z",
      ...options.price_snapshot,
    },
    fundamentals: {
      market_cap: 0,
      pe_ttm: 0,
      dividend_yield: 0,
      annual_dividend: 0,
      week_52_low: row.price * 0.42,
      week_52_high: row.price * 1.03,
      ...options.fundamentals,
    },
    intelligence_summary: {
      headline: "",
      body: "",
      catalyst: "",
      risk: "",
      key_points: [],
      ...options.intelligence_summary,
    },
    sentiment_breakdown: {
      overall_label: row.ai_sentiment_score >= 75 ? "bullish" : row.ai_sentiment_score >= 55 ? "constructive" : row.ai_sentiment_score >= 45 ? "mixed" : "cautious",
      overall_score: row.ai_sentiment_score,
      lanes: [
        { label: "News Articles", positive_pct: Math.min(95, row.ai_sentiment_score) },
        { label: "Core Sources", positive_pct: Math.max(35, row.ai_sentiment_score - 6) },
      ],
      ...options.sentiment_breakdown,
    },
    analyst_consensus: {
      label: row.ai_sentiment_score >= 70 ? "Buy" : "Hold",
      target_price: row.price * 1.12,
      buy: 28,
      hold: 7,
      sell: 2,
      ...options.analyst_consensus,
    },
    trend_convergence: {
      range: "1M",
      price_series: [0.78, 0.82, 0.86, 0.91, 0.94, 1].map((multiplier) => Number((row.price * multiplier).toFixed(2))),
      mention_volume_series: [3, 5, 7, 9, 12, row.news_count],
      ...options.trend_convergence,
    },
    momentum_signal: {
      label: row.day_change_pct > 1 ? "Bullish Momentum" : row.day_change_pct < -1 ? "Weak Momentum" : "Balanced Momentum",
      rsi_14: row.day_change_pct > 1 ? 74.8 : row.day_change_pct < -1 ? 38.1 : 56.2,
      score: Math.max(25, Math.min(88, row.ai_sentiment_score)),
      ...options.momentum_signal,
    },
    related_tickers: watchlistRows
      .filter((candidate) => candidate.instrument_id !== row.instrument_id)
      .slice(0, 3)
      .map((candidate) => ({
        instrument_id: candidate.instrument_id,
        ticker: candidate.ticker,
        name: candidate.name,
        price: candidate.price,
        day_change_pct: candidate.day_change_pct,
      })),
    timeline: [
      {
        timestamp: "2026-03-25T13:41:00Z",
        title: `${row.ticker} remains active across top market sources`,
        summary: `${row.name} is drawing cross-source attention, with the latest articles reinforcing the primary narrative for the name.`,
        sentiment_label: row.ai_sentiment_score >= 70 ? "bullish" : row.ai_sentiment_score <= 45 ? "cautious" : "mixed",
        source_name: "tikrr synthesis",
        article_url: "#",
      },
      {
        timestamp: "2026-03-24T21:15:00Z",
        title: `Coverage on ${row.ticker} accelerated into the US close`,
        summary: `News volume rose into the close and set up the current watchlist ranking for ${row.ticker}.`,
        sentiment_label: "mixed",
        source_name: "Cross-source aggregation",
        article_url: "#",
      },
    ],
    ...(options.related_tickers ? { related_tickers: options.related_tickers } : {}),
    ...(options.timeline ? { timeline: options.timeline } : {}),
  };
}

export const mockInstrumentViews: Record<string, InstrumentView> = {
  US_NVDA: buildInstrumentView(watchlistRows[0], {
    fundamentals: {
      market_cap: 2360000000000,
      pe_ttm: 75.42,
      dividend_yield: 0.0002,
      annual_dividend: 0.04,
      week_52_low: 380.2,
      week_52_high: 974.0,
    },
    intelligence_summary: {
      headline: "AI hardware demand remains the dominant Nvidia narrative.",
      body: "Nvidia is still benefiting from analyst upgrades, Blackwell production optimism, and strong readthroughs from AI infrastructure demand.",
      catalyst: "Blackwell ramp",
      risk: "Export controls",
      key_points: [
        "Analyst upgrades keep recurring.",
        "AI infrastructure demand remains the core driver.",
        "Coverage volume is elevated versus peers.",
      ],
    },
    sentiment_breakdown: {
      overall_label: "bullish",
      overall_score: 84,
      lanes: [
        { label: "News Articles", positive_pct: 72 },
        { label: "Core Sources", positive_pct: 84 },
        { label: "Institutional Reports", positive_pct: 91 },
      ],
    },
    analyst_consensus: {
      label: "Buy",
      target_price: 1150,
      buy: 42,
      hold: 6,
      sell: 1,
    },
    trend_convergence: {
      range: "1M",
      price_series: [780, 802, 826, 861, 915, 942],
      mention_volume_series: [4, 7, 9, 12, 15, 18],
    },
    momentum_signal: {
      label: "Bullish Momentum",
      rsi_14: 84.2,
      score: 84,
    },
    timeline: [
      {
        timestamp: "2026-03-25T09:41:00Z",
        title: "Blackwell chip production efficiency hits new high",
        summary: "Supply chain optimization for the 4NP manufacturing path remains ahead of schedule.",
        sentiment_label: "bullish",
        source_name: "Bloomberg Tech",
        article_url: "#",
      },
      {
        timestamp: "2026-03-24T16:15:00Z",
        title: "Institutional rebalancing phase completed",
        summary: "Major ETFs finished month-end reweighting with net inflows for Nvidia.",
        sentiment_label: "mixed",
        source_name: "Cross-source aggregation",
        article_url: "#",
      },
    ],
  }),
  US_AMD: buildInstrumentView(watchlistRows[1], {
    intelligence_summary: {
      headline: "AMD is riding the same AI wave, but with a more second-order narrative than Nvidia.",
      body: "Coverage is constructive around product cadence and readthroughs from broader AI demand, though the tone is less forceful than Nvidia's.",
      catalyst: "AI server demand",
      risk: "Competitive pressure",
      key_points: [
        "AMD benefits from AI infra spillover.",
        "Coverage is positive but less dominant than NVDA.",
        "Analyst tone is steady rather than euphoric.",
      ],
    },
    fundamentals: {
      market_cap: 265000000000,
      pe_ttm: 58.6,
      dividend_yield: 0,
      annual_dividend: 0,
      week_52_low: 93.12,
      week_52_high: 177.88,
    },
  }),
  US_MSFT: buildInstrumentView(watchlistRows[2], {
    instrument: {
      sector: "Technology",
      industry: "Software Infrastructure",
    },
    intelligence_summary: {
      headline: "Microsoft is stable and high-quality, but less urgent in the news cycle today.",
      body: "Coverage is constructive around Copilot and enterprise positioning, though the volume is lower than the semis cluster.",
      catalyst: "Copilot enterprise rollout",
      risk: "Cloud growth normalization",
      key_points: [
        "Enterprise AI remains the key narrative.",
        "Coverage is positive but quieter than semis.",
        "The stock acts more as a platform anchor than a momentum name today.",
      ],
    },
    fundamentals: {
      market_cap: 3190000000000,
      pe_ttm: 37.5,
      dividend_yield: 0.0068,
      annual_dividend: 3.0,
      week_52_low: 352.44,
      week_52_high: 435.12,
    },
  }),
  US_AAPL: buildInstrumentView(watchlistRows[3], {
    instrument: {
      sector: "Technology",
      industry: "Consumer Electronics",
    },
    intelligence_summary: {
      headline: "Apple is present in the mix, but not driving today's market brief.",
      body: "Coverage is balanced around product cycle timing and ecosystem strength, with less immediate urgency than the AI hardware names.",
      catalyst: "Device refresh cycle",
      risk: "China demand softness",
      key_points: [
        "Apple remains important but quieter.",
        "News is more strategic than event-driven.",
        "Sentiment is constructive rather than strongly bullish.",
      ],
    },
    fundamentals: {
      market_cap: 3280000000000,
      pe_ttm: 31.4,
      dividend_yield: 0.0049,
      annual_dividend: 1.04,
      week_52_low: 164.08,
      week_52_high: 220.2,
    },
  }),
  US_TSLA: buildInstrumentView(watchlistRows[4], {
    instrument: {
      sector: "Consumer Discretionary",
      industry: "Automobiles",
    },
    intelligence_summary: {
      headline: "Tesla coverage is skewing defensive as delivery concerns return.",
      body: "The stock still gets attention, but the current mix is more cautious around deliveries, pricing pressure, and sentiment reversals.",
      catalyst: "Model refresh cycle",
      risk: "Delivery softness",
      key_points: [
        "Delivery concerns are the main drag.",
        "Coverage volume is still high because Tesla is polarizing.",
        "The tone is more defensive than the broader AI trade.",
      ],
    },
    sentiment_breakdown: {
      overall_label: "cautious",
      overall_score: 41,
      lanes: [
        { label: "News Articles", positive_pct: 38 },
        { label: "Core Sources", positive_pct: 42 },
        { label: "Institutional Reports", positive_pct: 36 },
      ],
    },
    momentum_signal: {
      label: "Weak Momentum",
      rsi_14: 38.4,
      score: 38,
    },
    fundamentals: {
      market_cap: 568000000000,
      pe_ttm: 51.8,
      dividend_yield: 0,
      annual_dividend: 0,
      week_52_low: 138.8,
      week_52_high: 265.6,
    },
  }),
};

export function getMockDashboardView(market: "US" | "IN" = "US"): DashboardView {
  if (market === "IN") {
    return {
      ...mockDashboardViewUS,
      market: "IN",
      universe_id: "in_preview",
      hero_brief: {
        ...mockDashboardViewUS.hero_brief,
        title: "India preview not wired yet",
        body: "The low-fidelity app is currently using the US test universe. India can plug into the same contracts once the instrument universe and provider layer are ready.",
      },
    };
  }
  return mockDashboardViewUS;
}

export function getMockInstrumentView(instrumentId: string): InstrumentView | null {
  return mockInstrumentViews[instrumentId] ?? null;
}
