import type { ReactNode } from "react";

import type { EarningsEvent } from "@/lib/earnings";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { NewsArticle } from "@/lib/news";
import type { PowerTrade } from "@/lib/power-trades";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import type { LivePremarketQuote } from "@/lib/premarket-shared";
import type { SectorPeerRow, StockFacts, StockFundamentals, StockSummary } from "@/lib/stock";
import type { ChartEvent, ChartRange, MultipleHistory } from "@/lib/stock-chart";
import type { StockPriceSeries } from "@/lib/stock-events";
import type { StockOwnership } from "@/lib/stock-ownership";
import type { StockRead } from "@/lib/stock-read";
import type { StockTimelineItem, StockTimelineUpcoming } from "@/lib/stock-timeline";
import type { StockTechnicals } from "@/lib/technicals";
import type { StockIntelPro } from "@/lib/types";
import type { TheRead } from "@/lib/insights";

/** Everything the stock report renders, assembled once in `stock-page-stream.tsx`. */
export type ReportData = {
  stock: StockSummary;
  market: "US" | "IN";
  currency: string;
  /** ISO time of this render, so every "in 8 days" on the page agrees. */
  nowIso: string;

  /** The read and the call are open to every reader (lib/entitlements.ts: `stock_call`). */
  access: boolean;
  /**
   * What the viewer's plan does to this page. `levels` is whether price zones,
   * the target, "what would change the call" and the pre-earnings read are
   * shown: Pro everywhere, Free on covered stocks, everyone on showcase stocks.
   * When false those fields are stripped on the server, not hidden.
   */
  gate: { plan: "anon" | "free" | "pro"; trialEligible: boolean; levels: boolean; slotsLeft: number };
  subscribed: boolean;
  isTracked: boolean;
  tier: "ai_launch" | "ai_personal" | "free";

  /**
   * ready: a brief exists and may be shown. locked: it is part of Pro.
   * stale: held back because the price moved an order of magnitude since.
   * none: nothing written yet (`briefFallback` explains how to get one).
   */
  /** held: a brief exists but was written from a page that never loaded, so it is not shown. */
  readState: "ready" | "locked" | "stale" | "held" | "none";
  read: StockRead | null;
  briefFallback: ReactNode;

  chart: {
    ranges: ChartRange[];
    events: ChartEvent[];
    source: string;
    note: string;
    asOf: string | null;
  } | null;
  series: StockPriceSeries | null;
  multiple: MultipleHistory | null;

  timeline: { items: StockTimelineItem[]; upcoming: StockTimelineUpcoming[] };

  facts: StockFacts | null;
  fundamentals: StockFundamentals | null;
  intelPro: StockIntelPro | null;
  technicals: StockTechnicals | null;

  earnings: {
    next: EarningsEvent | null;
    past: EarningsEvent[];
    intel: EarningsIntelDoc | null;
    intelLocked: boolean;
    pre: PreEarningsIntelDoc | null;
  };

  ownership: StockOwnership;
  /** null when the congressional feed does not cover this market. */
  congress: PowerTrade[] | null;
  /** Slugs that have a page under /follow. Rows link there only when the page exists. */
  followSlugs: string[];

  news: NewsArticle[];
  reddit: { postCount: number; sentiment: string | null; summary: string | null; generatedAt: string | null } | null;
  peers: SectorPeerRow[];
  premarketQuote: LivePremarketQuote | null;
  /** The page's read: today's move in context, what is coming, where the price sits against the call. */
  insightRead: TheRead | null;
};
