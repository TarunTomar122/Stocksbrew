import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

export type MarketDailySource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  excerpt: string;
  provider: string;
};

export type MarketDailyMove = {
  label: string;
  symbol: string;
  group?: string;
  close?: number;
  price?: number;
  previous_close?: number;
  change_pct: number | null;
  captured_at?: string;
};

export type MarketDailyAnomaly = {
  ticker: string;
  name: string;
  sector: string;
  price: number | null;
  previous_close: number | null;
  day_change_pct: number;
  volume_ratio: number | null;
  direction: "up" | "down";
  explanation: string;
  why_it_matters: string;
  cause_type: string;
};

export type MarketDailySection = {
  kicker: string;
  heading: string;
  paragraphs: string[];
  source_ids: string[];
};

export type MarketDailyWatchItem = {
  label: string;
  detail: string;
  source_ids: string[];
};

export type MarketDailyEdition = {
  market: "US";
  edition_date: string;
  previous_session_date: string;
  status: "published";
  published_at: string;
  generated_at: string;
  updated_at: string;
  headline: string;
  dek: string;
  thesis: string;
  article_markdown: string;
  source_ids: string[];
  model: string;
  evidence_hash: string;
  quality: {
    passed: boolean;
    score: number;
    blockers: string[];
    warnings: string[];
    word_count: number;
  };
  tape: {
    as_of: string;
    previous_session_date: string;
    markets: MarketDailyMove[];
    sectors: MarketDailyMove[];
    sector_breadth: {
      positive: number;
      negative: number;
      unchanged: number;
      leader?: MarketDailyMove | null;
      laggard?: MarketDailyMove | null;
    };
    charts?: {
      index_history: Array<{
        date: string;
        sp500: number | null;
        nasdaq: number | null;
        russell: number | null;
      }>;
      sector_performance: Array<{
        label: string;
        symbol: string;
        session_change_pct: number | null;
        "5_session_change_pct": number | null;
        "20_session_change_pct": number | null;
      }>;
    };
  };
  premarket: {
    available: boolean;
    source: string;
    as_of: string;
    futures: MarketDailyMove[];
    movers: Array<{
      ticker: string;
      name: string;
      direction: "up" | "down";
      change_pct: number | null;
      price: number | null;
      sector: string;
    }>;
    opening_label: string;
    opening_summary: string;
  };
  anomalies: {
    session_date: string;
    source: string;
    gainers: MarketDailyAnomaly[];
    losers: MarketDailyAnomaly[];
    unusual: MarketDailyAnomaly[];
  };
  sources: MarketDailySource[];
  methodology: {
    label: string;
    editorial_policy_url: string;
    corrections: string[];
    automated: boolean;
  };
};

function normalizeEdition(raw: Record<string, unknown>): MarketDailyEdition | null {
  if (raw.status !== "published" || raw.market !== "US") return null;
  if (!raw.edition_date || !raw.headline) return null;
  if (!raw.article_markdown) {
    const sections = Array.isArray(raw.sections) ? (raw.sections as MarketDailySection[]) : [];
    const legacyMarkdown = [
      String(raw.opening_note || ""),
      ...sections.map((section) =>
        [`## ${section.heading}`, ...section.paragraphs].join("\n\n"),
      ),
      String(raw.closing_line || ""),
    ]
      .filter(Boolean)
      .join("\n\n");
    raw.article_markdown = legacyMarkdown;
    raw.source_ids = Array.from(
      new Set(sections.flatMap((section) => section.source_ids || [])),
    );
  }
  if (!Array.isArray(raw.source_ids)) raw.source_ids = [];
  return raw as unknown as MarketDailyEdition;
}

async function getMarketDailyEditionUncached(
  editionDate = "latest",
): Promise<MarketDailyEdition | null> {
  const suffix = editionDate === "latest" ? "latest" : editionDate;
  const doc = await adminFirestore.collection("tm_market_daily").doc(`US__${suffix}`).get();
  if (!doc.exists) return null;
  return normalizeEdition((doc.data() || {}) as Record<string, unknown>);
}

export function getMarketDailyEdition(
  editionDate = "latest",
): Promise<MarketDailyEdition | null> {
  return unstable_cache(
    () => getMarketDailyEditionUncached(editionDate),
    ["market-daily-edition", editionDate],
    { revalidate: 300, tags: ["market-daily", `market-daily-${editionDate}`] },
  )();
}

async function listMarketDailyEditionsUncached(limit: number): Promise<MarketDailyEdition[]> {
  const snapshot = await adminFirestore
    .collection("tm_market_daily")
    .orderBy("edition_date", "desc")
    .limit(Math.max(limit + 4, limit * 2))
    .get();

  const seen = new Set<string>();
  const editions: MarketDailyEdition[] = [];
  for (const doc of snapshot.docs) {
    const edition = normalizeEdition((doc.data() || {}) as Record<string, unknown>);
    if (!edition || seen.has(edition.edition_date)) continue;
    seen.add(edition.edition_date);
    editions.push(edition);
    if (editions.length >= limit) break;
  }
  return editions;
}

export function listMarketDailyEditions(limit = 30): Promise<MarketDailyEdition[]> {
  return unstable_cache(
    () => listMarketDailyEditionsUncached(limit),
    ["market-daily-list", String(limit)],
    { revalidate: 300, tags: ["market-daily"] },
  )();
}
