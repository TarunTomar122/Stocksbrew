import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

export type OpeningTone = "positive" | "negative" | "neutral";

export type OpeningCue = {
  id: string;
  label: string;
  ticker: string;
  region: string;
  group: "futures" | "asia" | "europe" | "macro" | string;
  price: number;
  previous_close: number;
  change_pct: number;
  captured_at?: string;
};

export type OpeningSession = {
  date: string;
  close: number;
  change_pct: number;
};

export type OpeningDriver = {
  title: string;
  detail: string;
  tone: OpeningTone;
};

export type OpeningSocialTicker = {
  ticker: string;
  mentions: number;
  sentiment: OpeningTone;
  summary?: string;
};

export type OpeningNewsItem = {
  ticker: string;
  headline?: string;
  detail: string;
  source?: string;
  url?: string;
  gap_pct?: number | null;
};

export type OpeningReport = {
  market: "US";
  generated_at: string;
  phase: "early" | "premarket";
  score: number;
  label: string;
  direction: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  drivers: OpeningDriver[];
  global_cues: OpeningCue[];
  sessions: OpeningSession[];
  premarket: {
    available: boolean;
    generated_at?: string;
    quoted_count: number;
    up_count: number;
    down_count: number;
    breadth_score: number;
    average_gap_pct: number;
    top_gainers: Array<{ ticker: string; name?: string; gap_pct: number; sector?: string }>;
    top_losers: Array<{ ticker: string; name?: string; gap_pct: number; sector?: string }>;
  };
  social: {
    available: boolean;
    generated_at?: string;
    positive_mentions: number;
    negative_mentions: number;
    neutral_mentions: number;
    sentiment_score: number;
    top_tickers: OpeningSocialTicker[];
  };
  news: OpeningNewsItem[];
  source_note?: string;
  model?: string;
};

function numberOr(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTone(value: unknown): OpeningTone {
  return value === "positive" || value === "negative" ? value : "neutral";
}

function normalizeReport(raw: Record<string, unknown>): OpeningReport | null {
  if (String(raw.market || "").toUpperCase() !== "US") return null;
  const premarketRaw = (raw.premarket || {}) as Record<string, unknown>;
  const socialRaw = (raw.social || {}) as Record<string, unknown>;

  return {
    market: "US",
    generated_at: String(raw.generated_at || ""),
    phase: raw.phase === "early" ? "early" : "premarket",
    score: numberOr(raw.score, 50),
    label: String(raw.label || "Mixed open setup"),
    direction: String(raw.direction || "mixed"),
    confidence: raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low",
    summary: String(raw.summary || "Opening report is warming up."),
    drivers: arrayOf<Record<string, unknown>>(raw.drivers).map((driver) => ({
      title: String(driver.title || "Market input"),
      detail: String(driver.detail || ""),
      tone: normalizeTone(driver.tone),
    })),
    global_cues: arrayOf<Record<string, unknown>>(raw.global_cues).map((cue) => ({
      id: String(cue.id || cue.ticker || "cue"),
      label: String(cue.label || cue.ticker || "Market cue"),
      ticker: String(cue.ticker || ""),
      region: String(cue.region || "Global"),
      group: String(cue.group || "macro"),
      price: numberOr(cue.price),
      previous_close: numberOr(cue.previous_close),
      change_pct: numberOr(cue.change_pct),
      captured_at: cue.captured_at ? String(cue.captured_at) : undefined,
    })),
    sessions: arrayOf<Record<string, unknown>>(raw.sessions).map((session) => ({
      date: String(session.date || ""),
      close: numberOr(session.close),
      change_pct: numberOr(session.change_pct),
    })),
    premarket: {
      available: Boolean(premarketRaw.available),
      generated_at: premarketRaw.generated_at ? String(premarketRaw.generated_at) : undefined,
      quoted_count: numberOr(premarketRaw.quoted_count),
      up_count: numberOr(premarketRaw.up_count),
      down_count: numberOr(premarketRaw.down_count),
      breadth_score: numberOr(premarketRaw.breadth_score),
      average_gap_pct: numberOr(premarketRaw.average_gap_pct),
      top_gainers: arrayOf<Record<string, unknown>>(premarketRaw.top_gainers).map((row) => ({
        ticker: String(row.ticker || ""),
        name: row.name ? String(row.name) : undefined,
        gap_pct: numberOr(row.gap_pct),
        sector: row.sector ? String(row.sector) : undefined,
      })),
      top_losers: arrayOf<Record<string, unknown>>(premarketRaw.top_losers).map((row) => ({
        ticker: String(row.ticker || ""),
        name: row.name ? String(row.name) : undefined,
        gap_pct: numberOr(row.gap_pct),
        sector: row.sector ? String(row.sector) : undefined,
      })),
    },
    social: {
      available: Boolean(socialRaw.available),
      generated_at: socialRaw.generated_at ? String(socialRaw.generated_at) : undefined,
      positive_mentions: numberOr(socialRaw.positive_mentions),
      negative_mentions: numberOr(socialRaw.negative_mentions),
      neutral_mentions: numberOr(socialRaw.neutral_mentions),
      sentiment_score: numberOr(socialRaw.sentiment_score),
      top_tickers: arrayOf<Record<string, unknown>>(socialRaw.top_tickers).map((row) => ({
        ticker: String(row.ticker || ""),
        mentions: numberOr(row.mentions),
        sentiment: normalizeTone(row.sentiment),
        summary: row.summary ? String(row.summary) : undefined,
      })),
    },
    news: arrayOf<Record<string, unknown>>(raw.news).map((row) => ({
      ticker: String(row.ticker || ""),
      headline: row.headline ? String(row.headline) : undefined,
      detail: String(row.detail || ""),
      source: row.source ? String(row.source) : undefined,
      url: row.url ? String(row.url) : undefined,
      gap_pct: row.gap_pct === null || row.gap_pct === undefined ? null : numberOr(row.gap_pct),
    })),
    source_note: raw.source_note ? String(raw.source_note) : undefined,
    model: raw.model ? String(raw.model) : undefined,
  };
}

async function getOpeningReportUncached(): Promise<OpeningReport | null> {
  const doc = await adminFirestore.collection("tm_premarket_opening").doc("US__latest").get();
  if (!doc.exists) return null;
  return normalizeReport((doc.data() || {}) as Record<string, unknown>);
}

export const getPremarketOpeningReport = unstable_cache(
  getOpeningReportUncached,
  ["premarket-opening-report"],
  { revalidate: 60, tags: ["premarket-opening"] },
);
