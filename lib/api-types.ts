/* ─── API Contract Types ─── */

// GET /meta/stockList
export type StockList = {
  us: string[];
  india: string[];
};

/** Autocomplete row (symbol + display name + market). */
export type StockSuggestion = {
  symbol: string;
  market: "us" | "india";
  name: string;
};

// GET /stocks/{SYMBOL}
export type Stock = {
  market?: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  cap?: string;
  currency: string;
  logo?: string;
  lastUpdated: string;
  runType: string;

  price: {
    current: number;
    open: number;
    high: number;
    low: number;
    previousClose: number;
    change: number;
    changePct: number;
    volume: number;
    avgVolume: number;
  };

  sentiment: {
    overall: number;
    previous: number;
    trend: "improving" | "worsening" | "stable";
    drivers: string[];
  };

  news: StockNews[];

  highlights: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };

  technicals: {
    rsi14: number;
    sma50: number;
    sma200: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    fromHigh: string;
    trend: "bullish" | "bearish" | "neutral";
  };

  analystConsensus: {
    rating: string;
    targetPrice: number;
    upside: number;
    numAnalysts: number;
  };

  earnings: {
    date: string | null;
    epsEstimate: number | null;
  };

  streak: {
    days: number;
    direction: "up" | "down" | "flat";
  };

  recentCloses: number[];

  catalysts: string[];

  bottomLine: string;
};

export type StockNews = {
  id: string;
  timestamp: string;
  title: string;
  source: string;
  summary: string;
  sentiment: number;
  category: string;
};

// GET /markets/{us|india}
export type MarketOverview = {
  market: string;
  lastUpdated: string;
  runType: string;

  indices: MarketIndex[];

  sentiment: {
    overall: number;
    label: string;
    drivers: string[];
  };

  topMovers: {
    gainers: Mover[];
    losers: Mover[];
  };

  globalCues: {
    oil: GlobalCue;
    gold: GlobalCue;
    dxy: GlobalCue;
    vix: GlobalCue;
    usTenYear: GlobalCue;
  };

  keyHeadlines: string[];

  bottomLine: string;

  briefOverview?: string;
  briefGlobalForces?: string;
  briefOutlook?: string;
};

export type MarketIndex = {
  name: string;
  value: number;
  change: number;
  changePct: number;
};

export type Mover = {
  symbol: string;
  changePct: number;
};

export type GlobalCue = {
  value: number;
  change: number;
};

// GET /sectors/{sector-id}
export type Sector = {
  id: string;
  name: string;
  market: string;
  icon?: string;
  lastUpdated: string;

  sentiment: {
    overall: number;
    label: string;
    previous: number;
    trend: "improving" | "worsening" | "stable";
  };

  performance: {
    changePct: number;
    vsMarket: string;
  };

  topMovers: {
    gainers: Mover[];
    losers: Mover[];
  };

  drivers: string[];

  stocks: string[];

  bottomLine: string;

  briefAnalysis?: string;
  briefOutlook?: string;
};

// GET /meta/runs
export type RunsMeta = {
  lastRun: string;
  lastType: string;
  nextRun: string;
  schedule: {
    preMarket: string;
    marketOpen: string;
    midday: string;
    marketClose: string;
  };
  stockCount: {
    us: number;
    india: number;
  };
  status: string;
};

export type PortfolioBriefMover = {
  ticker: string;
  oneLiner: string;
  vibe: "up" | "down" | "wild";
};

export type PortfolioBriefSignal = {
  tag: string;
  headline: string;
  body: string;
  detail: string;
  vibe: "positive" | "negative" | "neutral";
};

export type PortfolioBriefTile = {
  ticker: string;
  micro: string;
  vibe: "up" | "down" | "wild";
};

export type PortfolioBriefData = {
  narrative: string;
  movers: PortfolioBriefMover[];
  signals: PortfolioBriefSignal[];
  blindSpotTitle: string;
  blindSpotBody: string;
  tiles: PortfolioBriefTile[];
};

export type DashboardPayload = {
  view: MarketOverview;
  stocks: Stock[];
  sectors: Sector[];
  runsMeta: RunsMeta;
  updatedAtServer?: string;
  portfolioBrief?: PortfolioBriefData;
};

/** Read-only market snapshot for subpages (no dashboard materialization write). */
export type MarketPageContext = {
  view: MarketOverview | null;
  stocks: Stock[];
  sectors: Sector[];
  runsMeta: RunsMeta;
};
