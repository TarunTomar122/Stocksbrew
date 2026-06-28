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
    supporting: "Overbought - pullback risk",
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

// ─── Noise scene: the conflicting opinions storm ─────────────────────────────
// Deterministic layout (no Math.random) so renders are reproducible.
export type NoiseChip = {
  text: string;
  kind: "buy" | "sell" | "neutral" | "reddit";
  x: number;   // % of width
  y: number;   // % of height
  rot: number; // deg
  size: number;// px
  delay: number; // frame offset
};

// Neutral market fragments — the haze of data behind every ticker. Monochrome,
// blurred, no slang, no emoji. Reads as information overload, not a meme.
export const NOISE_CHIPS: NoiseChip[] = [
  { text: "P/E 38.2",        kind: "neutral", x: 16, y: 20, rot: 0, size: 26, delay: 0 },
  { text: "RSI 71",          kind: "neutral", x: 73, y: 16, rot: 0, size: 24, delay: 4 },
  { text: "Q2 EPS beat",     kind: "neutral", x: 48, y: 13, rot: 0, size: 22, delay: 8 },
  { text: "+2.86%",          kind: "neutral", x: 31, y: 38, rot: 0, size: 30, delay: 6 },
  { text: "downgrade",       kind: "neutral", x: 81, y: 42, rot: 0, size: 24, delay: 12 },
  { text: "$190 PT",         kind: "neutral", x: 13, y: 60, rot: 0, size: 26, delay: 16 },
  { text: "−1.12%",          kind: "neutral", x: 63, y: 63, rot: 0, size: 28, delay: 20 },
  { text: "13F filing",      kind: "neutral", x: 41, y: 77, rot: 0, size: 22, delay: 14 },
  { text: "guidance raise",  kind: "neutral", x: 85, y: 71, rot: 0, size: 22, delay: 24 },
  { text: "buyback",         kind: "neutral", x: 23, y: 83, rot: 0, size: 24, delay: 26 },
  { text: "52-wk high",      kind: "neutral", x: 69, y: 85, rot: 0, size: 24, delay: 18 },
  { text: "margins +220bps", kind: "neutral", x: 51, y: 49, rot: 0, size: 24, delay: 22 },
  { text: "short interest",  kind: "neutral", x: 7,  y: 40, rot: 0, size: 22, delay: 28 },
  { text: "FCF yield 3.1%",  kind: "neutral", x: 88, y: 29, rot: 0, size: 22, delay: 30 },
  { text: "rev +18% YoY",    kind: "neutral", x: 35, y: 27, rot: 0, size: 24, delay: 32 },
];

// ─── Radar scene: the watchlist, one call each (mirrors demo-radar rows) ──────
export type RadarRow = {
  ticker: string;
  name: string;
  position: "holding" | "watching";
  price: number;
  changePct: number;
  score: number;
  stance: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  signal: string;
};

export const MOCK_RADAR: RadarRow[] = [
  { ticker: "MSFT", name: "Microsoft", position: "holding",  price: 421.92, changePct: 3.05,  score: 84, stance: "accumulate", signal: "Earnings May 20" },
  { ticker: "NVDA", name: "NVIDIA",    position: "holding",  price: 131.38, changePct: 2.64,  score: 74, stance: "accumulate", signal: "RSI 68" },
  { ticker: "AAPL", name: "Apple",     position: "watching", price: 214.29, changePct: 0.42,  score: 61, stance: "hold",       signal: "Range-bound" },
  { ticker: "META", name: "Meta",      position: "watching", price: 498.10, changePct: -0.88, score: 58, stance: "watch",      signal: "Oversold dip" },
  { ticker: "INTC", name: "Intel",     position: "holding",  price: 108.77, changePct: -6.18, score: 52, stance: "avoid",      signal: "Guidance cut" },
];

// ─── Proof scene: signals chaining into a call (mirrors ConnectedReadCard) ────
export const MOCK_READ = {
  ticker: "NVDA",
  name: "NVIDIA Corp",
  chips: [
    { icon: "💬", label: "Reddit buzz",  bg: "#fff1ec", fg: "#c2410c" },
    { icon: "📈", label: "Up 6.4%",      bg: "#e7f8f1", fg: "#10b981" },
    { icon: "🧭", label: "Momentum",     bg: "#eef2ff", fg: "#1d4ed8" },
  ],
  conclusion: "Accumulate on dips below $210. The setup is strong — just don't chase the breakout here.",
};

// ─── OUR CALL hero (mirrors stock-detail VerdictCallChart + CallInsightCard) ──
export const MOCK_CALL = {
  ticker: "NVDA",
  name: "NVIDIA Corporation",
  meta: "NVDA · NASDAQ · Technology · Semiconductors",
  price: 131.38,
  dayPct: 2.86,
  dayAbs: 3.66,
  stance: "accumulate" as const,
  stanceLabel: "Accumulate",
  confidence: "high" as const,
  body: "Buy here for upside. Add more below $122.00 if it dips.",
  levels: "Take profit above $168.00.",
  buyBelow: 122.0,
  target: 168.0,
  upsidePct: 27.9,
  returns: { m3: 14.2, m6: 31.7, y1: 96.4 },
  drivers: [
    "Blackwell GPU ramp is ahead of schedule; Q2 earnings in 3 weeks could be a catalyst.",
    "Institutional flow remains bullish, volume 40% above average.",
  ],
  risks: [
    "Valuation is rich; any data-center capex slowdown hits hardest here.",
  ],
  // ~46 weekly closes forming a dip then recovery; drawn as an SVG area chart.
  history: [
    78, 82, 80, 86, 91, 95, 92, 99, 104, 110, 108, 116, 121, 119, 126, 133,
    129, 124, 117, 122, 128, 134, 131, 125, 118, 113, 109, 115, 121, 127,
    124, 119, 116, 120, 126, 130, 128, 123, 119, 124, 128, 125, 121, 127, 130, 131.38,
  ],
};

export const AI_SYNTHESIS_TEXT =
  "NVDA is up 2.9% today after analysts raised price targets following stronger-than-expected GPU shipment data. Trading volume is 40% above average - institutional buyers are active. The momentum is bullish heading into next week's earnings.";
