import type { StockList, Stock, MarketOverview, Sector, RunsMeta } from "./api-types";

/* ─── Stock List ─── */
export const mockStockList: StockList = {
  us: ["NVDA", "AMD", "MSFT", "AAPL", "TSLA", "AMZN", "META", "GOOGL", "PLTR", "LMT"],
  india: ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK"],
};

/* ─── Stocks ─── */
export const mockStocks: Record<string, Stock> = {
  TSLA: {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    exchange: "NASDAQ",
    sector: "Auto",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 364.31,
      open: 368.5,
      high: 370.2,
      low: 360.15,
      previousClose: 367.0,
      change: -2.69,
      changePct: -0.73,
      volume: 52000000,
      avgVolume: 48000000,
    },
    sentiment: {
      overall: -0.2,
      previous: -0.1,
      trend: "worsening",
      drivers: [
        "Delivery concerns weighing on stock",
        "Q1 2026 delivery consensus below expectations",
      ],
    },
    news: [
      {
        id: "tsla-news-001",
        timestamp: "2026-03-30T14:00:00Z",
        title: "Why April Could Be a Turning Point for Tesla Stock",
        source: "The Motley Fool",
        summary:
          "Analysts debate Q1 delivery numbers with UBS projecting 345K vs consensus 365K.",
        sentiment: -0.1,
        category: "market-move",
      },
      {
        id: "tsla-news-002",
        timestamp: "2026-03-30T11:30:00Z",
        title: "Tesla Robotaxi Progress Slower Than Expected",
        source: "Reuters",
        summary:
          "Only 9 robotaxis deployed in Austin trial, raising questions about 2026 scale targets.",
        sentiment: -0.3,
        category: "product",
      },
      {
        id: "tsla-news-003",
        timestamp: "2026-03-29T18:00:00Z",
        title: "Dan Ives Maintains $600 Price Target on Tesla",
        source: "Wedbush",
        summary:
          "Wedbush analyst sees AI and energy as underappreciated value drivers for Tesla long-term.",
        sentiment: 0.4,
        category: "analyst",
      },
    ],
    highlights: {
      positive: ["Dan Ives maintains Buy with $600 target"],
      negative: ["Stock down 20% in 6 months", "Only 9 robotaxis deployed"],
      neutral: ["April potential turning point"],
    },
    technicals: {
      rsi14: 38.5,
      sma50: 380.2,
      sma200: 345.6,
      fiftyTwoWeekHigh: 488.5,
      fiftyTwoWeekLow: 280.0,
      fromHigh: "-25.4%",
      trend: "bearish",
    },
    analystConsensus: {
      rating: "Hold",
      targetPrice: 383.54,
      upside: 5.3,
      numAnalysts: 41,
    },
    catalysts: [
      "Q1 2026 delivery numbers release",
      "Cybercab production updates",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "Tesla faces a critical inflection point as Q1 delivery numbers approach. Bears point to slowing demand and robotaxi delays, while bulls see AI and energy upside. The next 30 days will likely set the tone for the rest of 2026.",
  },

  NVDA: {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    exchange: "NASDAQ",
    sector: "Semiconductors",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 950.42,
      open: 938.0,
      high: 955.8,
      low: 935.2,
      previousClose: 920.8,
      change: 29.62,
      changePct: 3.22,
      volume: 61000000,
      avgVolume: 55000000,
    },
    sentiment: {
      overall: 0.6,
      previous: 0.5,
      trend: "improving",
      drivers: [
        "Blackwell chip ramp exceeding expectations",
        "Data center demand remains insatiable",
      ],
    },
    news: [
      {
        id: "nvda-news-001",
        timestamp: "2026-03-30T13:00:00Z",
        title: "NVIDIA Blackwell Production Hits New Milestone",
        source: "Bloomberg",
        summary:
          "TSMC reports yield improvements on Blackwell, suggesting stronger margins ahead.",
        sentiment: 0.5,
        category: "product",
      },
      {
        id: "nvda-news-002",
        timestamp: "2026-03-30T10:00:00Z",
        title: "Cloud Giants Increase AI Capex Guidance",
        source: "Financial Times",
        summary:
          "Microsoft, Google, and Amazon all raised 2026 AI infrastructure spending targets.",
        sentiment: 0.4,
        category: "market-move",
      },
    ],
    highlights: {
      positive: [
        "Blackwell production ahead of schedule",
        "Cloud capex tailwinds continue",
      ],
      negative: ["Export control risks remain"],
      neutral: ["Valuation stretched but earnings growth supports it"],
    },
    technicals: {
      rsi14: 72.1,
      sma50: 890.5,
      sma200: 780.3,
      fiftyTwoWeekHigh: 974.0,
      fiftyTwoWeekLow: 520.0,
      fromHigh: "-2.4%",
      trend: "bullish",
    },
    analystConsensus: {
      rating: "Strong Buy",
      targetPrice: 1150.0,
      upside: 21.0,
      numAnalysts: 48,
    },
    catalysts: [
      "GTC 2026 announcements",
      "Q1 earnings in May",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "NVIDIA remains the undisputed AI infrastructure leader. Blackwell production is ramping smoothly, and cloud capex keeps rising. Near all-time highs but earnings growth justifies the premium.",
  },

  AAPL: {
    symbol: "AAPL",
    name: "Apple Inc.",
    exchange: "NASDAQ",
    sector: "Technology",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 218.24,
      open: 216.5,
      high: 219.8,
      low: 215.9,
      previousClose: 215.82,
      change: 2.42,
      changePct: 1.12,
      volume: 38000000,
      avgVolume: 42000000,
    },
    sentiment: {
      overall: 0.15,
      previous: 0.1,
      trend: "stable",
      drivers: [
        "iPhone 17 anticipation building",
        "Services revenue continues steady growth",
      ],
    },
    news: [
      {
        id: "aapl-news-001",
        timestamp: "2026-03-30T12:00:00Z",
        title: "Apple Intelligence Rollout Expands to More Markets",
        source: "9to5Mac",
        summary:
          "Apple's AI features now available in 15 additional countries, boosting upgrade cycle expectations.",
        sentiment: 0.3,
        category: "product",
      },
    ],
    highlights: {
      positive: ["Services segment at all-time high revenue"],
      negative: ["China market share under pressure"],
      neutral: ["iPhone 17 launch expected September 2026"],
    },
    technicals: {
      rsi14: 55.2,
      sma50: 212.4,
      sma200: 198.6,
      fiftyTwoWeekHigh: 237.5,
      fiftyTwoWeekLow: 164.08,
      fromHigh: "-8.1%",
      trend: "neutral",
    },
    analystConsensus: {
      rating: "Buy",
      targetPrice: 245.0,
      upside: 12.3,
      numAnalysts: 44,
    },
    catalysts: [
      "WWDC 2026 in June",
      "iPhone 17 announcement",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "Apple is in a holding pattern ahead of WWDC and the iPhone 17 cycle. Services growth is solid, but hardware innovation needs to re-accelerate to push shares higher.",
  },

  GOOGL: {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    exchange: "NASDAQ",
    sector: "Technology",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 178.92,
      open: 177.0,
      high: 180.4,
      low: 176.5,
      previousClose: 176.38,
      change: 2.54,
      changePct: 1.44,
      volume: 28000000,
      avgVolume: 32000000,
    },
    sentiment: {
      overall: 0.25,
      previous: 0.2,
      trend: "improving",
      drivers: [
        "Gemini AI products gaining traction",
        "Search advertising resilient despite AI disruption fears",
      ],
    },
    news: [
      {
        id: "googl-news-001",
        timestamp: "2026-03-30T14:30:00Z",
        title: "Google Cloud AI Revenue Surges 45% YoY",
        source: "CNBC",
        summary:
          "Google Cloud's AI-specific revenue hit $12B annual run rate, narrowing gap with AWS.",
        sentiment: 0.5,
        category: "earnings",
      },
    ],
    highlights: {
      positive: ["Cloud AI revenue accelerating", "Gemini 2.5 well-received"],
      negative: ["Antitrust ruling risks linger"],
      neutral: ["YouTube Shorts monetization improving"],
    },
    technicals: {
      rsi14: 58.8,
      sma50: 172.3,
      sma200: 165.1,
      fiftyTwoWeekHigh: 195.0,
      fiftyTwoWeekLow: 130.5,
      fromHigh: "-8.2%",
      trend: "bullish",
    },
    analystConsensus: {
      rating: "Buy",
      targetPrice: 210.0,
      upside: 17.4,
      numAnalysts: 46,
    },
    catalysts: [
      "Google I/O 2026",
      "Antitrust remedy decision",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "Alphabet is benefiting from AI tailwinds across search, cloud, and YouTube. Antitrust risks remain, but the business fundamentals are strong and improving.",
  },

  MSFT: {
    symbol: "MSFT",
    name: "Microsoft Corporation",
    exchange: "NASDAQ",
    sector: "Technology",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 432.15,
      open: 430.0,
      high: 435.2,
      low: 428.8,
      previousClose: 429.5,
      change: 2.65,
      changePct: 0.62,
      volume: 22000000,
      avgVolume: 25000000,
    },
    sentiment: {
      overall: 0.2,
      previous: 0.25,
      trend: "stable",
      drivers: [
        "Copilot enterprise adoption growing steadily",
        "Azure growth strong but expected to moderate",
      ],
    },
    news: [
      {
        id: "msft-news-001",
        timestamp: "2026-03-30T11:00:00Z",
        title: "Microsoft Copilot Hits 2M Enterprise Subscribers",
        source: "The Verge",
        summary:
          "Enterprise Copilot adoption doubled in Q1 2026, suggesting strong upsell potential.",
        sentiment: 0.3,
        category: "product",
      },
    ],
    highlights: {
      positive: ["Copilot adoption accelerating"],
      negative: ["Azure growth may slow from 30% to 26%"],
      neutral: ["Gaming segment stable post-Activision integration"],
    },
    technicals: {
      rsi14: 52.4,
      sma50: 425.8,
      sma200: 405.2,
      fiftyTwoWeekHigh: 468.35,
      fiftyTwoWeekLow: 352.44,
      fromHigh: "-7.7%",
      trend: "neutral",
    },
    analystConsensus: {
      rating: "Buy",
      targetPrice: 480.0,
      upside: 11.1,
      numAnalysts: 42,
    },
    catalysts: [
      "Build 2026 conference",
      "Q3 FY2026 earnings",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "Microsoft is a steady compounder with Copilot and Azure as growth engines. Not the most exciting momentum story, but one of the safest quality plays in tech.",
  },

  AMZN: {
    symbol: "AMZN",
    name: "Amazon.com, Inc.",
    exchange: "NASDAQ",
    sector: "Technology",
    currency: "USD",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    price: {
      current: 198.45,
      open: 196.0,
      high: 200.1,
      low: 195.2,
      previousClose: 195.8,
      change: 2.65,
      changePct: 1.35,
      volume: 45000000,
      avgVolume: 48000000,
    },
    sentiment: {
      overall: 0.3,
      previous: 0.2,
      trend: "improving",
      drivers: [
        "AWS AI services driving cloud growth",
        "Retail margins continue to expand",
      ],
    },
    news: [
      {
        id: "amzn-news-001",
        timestamp: "2026-03-30T13:30:00Z",
        title: "Amazon AWS Launches Next-Gen AI Chips",
        source: "TechCrunch",
        summary:
          "Trainium3 chips promise 2x performance per watt, reducing customer inference costs.",
        sentiment: 0.4,
        category: "product",
      },
    ],
    highlights: {
      positive: ["AWS AI revenue growing 50%+ YoY", "Retail margins at record levels"],
      negative: ["Antitrust scrutiny in EU"],
      neutral: ["Prime Video ad tier gaining traction"],
    },
    technicals: {
      rsi14: 61.3,
      sma50: 190.2,
      sma200: 178.5,
      fiftyTwoWeekHigh: 215.9,
      fiftyTwoWeekLow: 151.6,
      fromHigh: "-8.1%",
      trend: "bullish",
    },
    analystConsensus: {
      rating: "Strong Buy",
      targetPrice: 235.0,
      upside: 18.4,
      numAnalysts: 50,
    },
    catalysts: [
      "AWS re:Invent mid-year updates",
      "Prime Day 2026",
    ],
    earnings: { date: null, epsEstimate: null },
    streak: { days: 0, direction: "flat" as const },
    recentCloses: [],
    bottomLine:
      "Amazon is firing on all cylinders with AWS AI growth and retail margin expansion. The stock has room to run if cloud momentum sustains.",
  },
};

/* ─── Market Overview ─── */
export const mockMarkets: Record<string, MarketOverview> = {
  us: {
    market: "us",
    lastUpdated: "2026-03-30T16:00:00Z",
    runType: "market_close",
    indices: [
      { name: "S&P 500", value: 5580, change: -45, changePct: -0.8 },
      { name: "Nasdaq", value: 17200, change: -120, changePct: -0.7 },
      { name: "Dow Jones", value: 41800, change: -200, changePct: -0.48 },
    ],
    sentiment: {
      overall: -0.3,
      label: "Bearish",
      drivers: ["Trade war fears", "Oil price surge"],
    },
    topMovers: {
      gainers: [
        { symbol: "NVDA", changePct: 3.2 },
        { symbol: "AAPL", changePct: 1.1 },
      ],
      losers: [
        { symbol: "TSLA", changePct: -4.5 },
        { symbol: "META", changePct: -2.8 },
      ],
    },
    globalCues: {
      oil: { value: 114.5, change: 2.3 },
      gold: { value: 2950, change: 15 },
      dxy: { value: 104.2, change: 0.3 },
      vix: { value: 22.5, change: 1.8 },
      usTenYear: { value: 4.35, change: 0.05 },
    },
    keyHeadlines: [
      "Trade war escalation fears grip Wall Street",
      "Oil surges past $114 on Middle East tensions",
      "Fed officials signal patience on rate cuts",
    ],
    bottomLine:
      "Markets closed lower on escalating trade and geopolitical fears. Defensive positioning increased as VIX spiked above 22. Tech held up better than expected, led by NVIDIA, but broader sentiment remains cautious heading into April.",
  },
  india: {
    market: "india",
    lastUpdated: "2026-03-30T15:30:00Z",
    runType: "market_close",
    indices: [
      { name: "Nifty 50", value: 23450, change: 120, changePct: 0.51 },
      { name: "Sensex", value: 77200, change: 380, changePct: 0.49 },
      { name: "Bank Nifty", value: 50100, change: -85, changePct: -0.17 },
    ],
    sentiment: {
      overall: 0.15,
      label: "Cautiously Optimistic",
      drivers: ["FII flows turning positive", "RBI rate cut expectations"],
    },
    topMovers: {
      gainers: [
        { symbol: "TATAMOTORS", changePct: 2.8 },
        { symbol: "INFY", changePct: 1.9 },
      ],
      losers: [
        { symbol: "HDFCBANK", changePct: -1.2 },
        { symbol: "RELIANCE", changePct: -0.8 },
      ],
    },
    globalCues: {
      oil: { value: 114.5, change: 2.3 },
      gold: { value: 2950, change: 15 },
      dxy: { value: 104.2, change: 0.3 },
      vix: { value: 14.2, change: -0.5 },
      usTenYear: { value: 4.35, change: 0.05 },
    },
    keyHeadlines: [
      "Nifty reclaims 23,400 on FII buying",
      "RBI MPC minutes signal dovish tilt",
      "IT stocks rally on strong Q4 guidance",
    ],
    bottomLine:
      "Indian markets ended higher, led by IT and auto names. Banking lagged on NIM concerns. FII flows turned net positive for the first time in 3 weeks, signaling improving global risk appetite for Indian equities.",
  },
};

/* ─── Sectors ─── */
export const mockSectors: Record<string, Sector> = {
  "us-tech": {
    id: "us-tech",
    name: "Technology",
    market: "us",
    lastUpdated: "2026-03-30T16:00:00Z",
    sentiment: {
      overall: -0.15,
      label: "Slightly Bearish",
      previous: 0.1,
      trend: "worsening",
    },
    performance: {
      changePct: -0.9,
      vsMarket: "underperforming",
    },
    topMovers: {
      gainers: [{ symbol: "NVDA", changePct: 3.2 }],
      losers: [{ symbol: "TSLA", changePct: -4.5 }],
    },
    drivers: [
      "AI capex concerns weighing on mega caps",
      "Semiconductor demand still strong",
    ],
    stocks: ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA", "META", "AMZN"],
    bottomLine:
      "Tech sector under pressure from AI spending concerns, but semiconductor names continue to outperform. The divergence between AI beneficiaries and the rest of tech is widening.",
  },
  "us-auto": {
    id: "us-auto",
    name: "Automotive",
    market: "us",
    lastUpdated: "2026-03-30T16:00:00Z",
    sentiment: {
      overall: -0.35,
      label: "Bearish",
      previous: -0.2,
      trend: "worsening",
    },
    performance: {
      changePct: -2.1,
      vsMarket: "underperforming",
    },
    topMovers: {
      gainers: [{ symbol: "F", changePct: 0.5 }],
      losers: [{ symbol: "TSLA", changePct: -4.5 }],
    },
    drivers: [
      "EV demand softening in key markets",
      "Tariff fears hitting supply chain costs",
    ],
    stocks: ["TSLA", "F", "GM", "RIVN"],
    bottomLine:
      "Auto sector struggling with demand uncertainty and tariff headwinds. Tesla dragging the group lower while legacy OEMs hold up marginally better.",
  },
};

/* ─── Runs Metadata ─── */
export const mockRunsMeta: RunsMeta = {
  lastRun: "2026-03-30T15:30:00Z",
  lastType: "market_close",
  nextRun: "2026-03-31T06:00:00Z",
  schedule: {
    preMarket: "06:00",
    marketOpen: "09:30",
    midday: "12:30",
    marketClose: "15:30",
  },
  stockCount: { us: 100, india: 100 },
  status: "healthy",
};
