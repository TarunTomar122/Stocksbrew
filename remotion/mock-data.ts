import type { StockIntelPro, HeroBrief } from "@/lib/types";
import type { Directive } from "@/lib/stock";
import type { SignalTileModel } from "@/components/signal-tile";

export type MockStock = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  indices: string[];
  price: number;
  day_change_pct: number;
};

export const MOCK_STOCK: MockStock = {
  ticker: "NVDA",
  name: "NVIDIA Corporation",
  exchange: "NASDAQ",
  sector: "Technology",
  industry: "Semiconductors",
  indices: ["S&P 500", "NASDAQ 100"],
  price: 875.40,
  day_change_pct: 2.86,
};

export const MOCK_SIGNAL_TILES: SignalTileModel[] = [
  {
    emoji: "📈",
    bg: "#ecfdf5",
    label: "Past 1Y",
    headline: "+614.1%",
    supporting: "1M +57.4% · 3M +31.7%",
    tone: "up",
  },
  {
    emoji: "🔥",
    bg: "#fef3c7",
    label: "RSI Stretched",
    headline: "76",
    supporting: "Overbought — pullback risk",
    tone: "warn",
  },
  {
    emoji: "🚀",
    bg: "#ecfdf5",
    label: "52W High",
    headline: "-2.8%",
    supporting: "Riding the top of the range",
    tone: "up",
  },
  {
    emoji: "🌱",
    bg: "#ecfdf5",
    label: "Strong Growth",
    headline: "100",
    supporting: "Top pillar on the scorecard",
    tone: "up",
  },
  {
    emoji: "💰",
    bg: "#ecfdf5",
    label: "Revenue YoY",
    headline: "+85.5%",
    supporting: "High-growth top line",
    tone: "up",
  },
];

export const MOCK_RANGE = {
  week52Low: 78.54,
  week52High: 592.80,
  currentPrice: 576.45,
  rsi: 76.2,
};

export const MOCK_INTEL: StockIntelPro = {
  instrument_id: "nvda-us",
  ticker: "NVDA",
  sector_slug: "technology",
  sector_label: "Technology",
  industry_label: "Semiconductors",
  overall: { score: 78, verdict: "strong", stance: "bullish" },
  pillars: {
    growth:    { score: 87, verdict: "strong", weight: 0.3,  metrics: [] },
    momentum:  { score: 72, verdict: "solid",  weight: 0.25, metrics: [] },
    valuation: { score: 51, verdict: "mixed",  weight: 0.25, metrics: [] },
    quality:   { score: 83, verdict: "strong", weight: 0.2,  metrics: [] },
  },
  catalysts: [
    { kind: "earnings", title: "Q2 Earnings Report", urgency: "high", date: "2025-05-28" },
  ],
  snapshot_date: "2025-05-05",
  generated_at: "2025-05-05T09:30:00Z",
};

export const MOCK_DIRECTIVE: Directive = {
  stance: "accumulate",
  text: "Accumulate on any dip below $850",
  rationale: "Blackwell GPU ramp is ahead of schedule and Q2 earnings in 3 weeks could be a significant catalyst. Institutional flow remains bullish with volume 40% above average. Data center demand stays structurally strong through 2025.",
  confidence: "high",
  trigger_type: "price_below",
  trigger_value: "850",
};

export const AI_SYNTHESIS_TEXT =
  "NVDA is up 2.9% today after analysts raised price targets following stronger-than-expected GPU shipment data. Trading volume is 40% above average — institutional buyers are active. The momentum is bullish heading into next week's earnings.";
