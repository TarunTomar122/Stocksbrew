import type { HiddenLevel } from "./call-line";
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
import type { CallEvidence } from "@/lib/call-evidence";

/**
 * The top of the stock report, assembled in `stock-page-stream.tsx` from the
 * reads it needs: the quote, the call and its read, the chart and the key
 * facts. It renders as soon as those are in; what changed and the sections
 * stream in under it (`ReportExtras`).
 */
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
  gate: {
    plan: "anon" | "free" | "pro";
    trialEligible: boolean;
    levels: boolean;
    slotsLeft: number;
    /** The levels are open only because this is one of the showcase stocks, not the viewer's plan: label it as an example. */
    example?: boolean;
    /**
     * When `levels` is false and the call has its own price: which call it goes with and whether today's price has
     * reached it, never the number, so the call can say what it is waiting for (./call-line.ts).
     */
    hiddenLevel?: HiddenLevel | null;
  };
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

  facts: StockFacts | null;
  fundamentals: StockFundamentals | null;
  intelPro: StockIntelPro | null;

  earnings: {
    next: EarningsEvent | null;
    past: EarningsEvent[];
    intel: EarningsIntelDoc | null;
    intelLocked: boolean;
    pre: PreEarningsIntelDoc | null;
  };

  premarketQuote: LivePremarketQuote | null;
  /**
   * The evidence under the call and what would change it (lib/call-evidence.ts), from stored numbers only. The
   * conditions are open on every stock, like the call and its reasons. Null when there is no call to show or the stock is not a US stock.
   */
  callEvidence?: CallEvidence | null;
};

/** The rest of the report, read while the top is already on screen: what changed and what only the sections use. */
export type ReportExtras = {
  timeline: { items: StockTimelineItem[]; upcoming: StockTimelineUpcoming[] };
  technicals: StockTechnicals | null;
  ownership: StockOwnership;
  /** null when the congressional feed does not cover this market. */
  congress: PowerTrade[] | null;
  /** Slugs that have a page under /follow. Rows link there only when the page exists. */
  followSlugs: string[];
  /** The stock's headlines, each with its tone when one was read (news-tone.ts). */
  news: Array<NewsArticle & { tone?: HeadlineTone | null }>;
  reddit: { postCount: number; sentiment: string | null; summary: string | null; generatedAt: string | null } | null;
  peers: SectorPeerRow[];
};

/** The fields of the quote the report's sections read. */
export type SectionStock = Pick<
  StockSummary,
  "ticker" | "name" | "instrument_id" | "price" | "day_change_pct" | "description" | "sector" | "industry" | "exchange" | "country"
>;

/** The ownership the section draws: eight fund rows and four exits are shown, so only those travel, with the full counts. */
export type SectionOwnership = {
  funds:
    | (NonNullable<StockOwnership["funds"]> & {
        /** Funds that opened or added, across every row (not only the rows sent). */
        added: number;
        /** Funds that trimmed or sold out, across every row and exit. */
        cut: number;
      })
    | null;
  insiders: StockOwnership["insiders"];
};

/** A headline's tone as /news reads it: the model's label, else the headline's own words (news-tone.ts). */
export type HeadlineTone = "positive" | "negative" | "neutral";

/** One news row in the News section: only what the row shows, with its tone (null when none was read). */
export type SectionNewsArticle = Pick<NewsArticle, "id" | "title" | "url" | "source_name" | "published_at"> & { tone: HeadlineTone | null };

/**
 * What the report's sections (Overview, Financials, ... Peers) read, and no
 * more. The sections render in the browser from this (report-sections.tsx),
 * so it travels to the client once as data instead of as markup; anything big
 * the sections do not draw (the chart's ranges, article summaries, every
 * Follow slug on the site) stays on the server. `toSectionData` shapes it.
 *
 * Adding a section: give it its fields here, a label in SECTION_LABELS, a rule
 * in `sectionAvailability` and a view in report-sections.tsx.
 */
export type SectionData = {
  stock: SectionStock;
  market: ReportData["market"];
  currency: string;
  nowIso: string;
  facts: ReportData["facts"];
  fundamentals: ReportData["fundamentals"];
  intelPro: ReportData["intelPro"];
  technicals: ReportExtras["technicals"];
  earnings: ReportData["earnings"];
  /** Funds as shown: the top rows and exits only, with the counts the flow line needs from all of them. */
  ownership: SectionOwnership;
  congress: ReportExtras["congress"];
  /** Only the slugs of the people in `congress` that have a Follow page. */
  followSlugs: string[];
  news: SectionNewsArticle[];
  reddit: ReportExtras["reddit"];
  peers: ReportExtras["peers"];
  /** The long price history's summary; its chart ranges are left out (the chart has its own copy). */
  series: Omit<StockPriceSeries, "ranges" | "closes"> | null;
  multiple: ReportData["multiple"];
};
