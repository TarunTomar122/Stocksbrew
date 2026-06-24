import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse } from "@/lib/firestore";
import type { Market } from "@/lib/types";
import stockUniverse from "@/backend/config/stock_universe.json";

export type SectorContextDoc = {
  market: string;
  universe_id: string;
  sector_id: string;
  sector_label: string;
  generated_at?: string;
  today_score?: number;
  today_label?: string;
  today_brief?: string;
  today_key_points?: string[];
  week_score?: number;
  week_label?: string;
  week_brief?: string;
  week_key_points?: string[];
  what_changed?: string;
  why_it_matters?: string;
  what_to_watch?: string;
  visual_summary?: {
    what_changed?: string;
    why_it_matters?: string;
    what_to_watch?: string;
    bull_case?: string;
    bear_case?: string;
    crowd_miss?: string;
  };
  distinct_tickers?: string[];
  article_count?: number;
};

const SECTOR_ID_BY_LABEL: Record<string, string> = {
  // US
  "big tech": "big-tech",
  "semiconductors": "semiconductors",
  "ai infrastructure": "ai-infrastructure",
  "financials": "financials",
  "healthcare": "healthcare",
  "energy": "energy",
  "consumer": "consumer",
  "industrials": "industrials",
  // IN
  "banking and nbfcs": "banking",
  "banking": "banking",
  "it and software": "information-technology",
  "information technology": "information-technology",
  "pharma and healthcare": "pharma-healthcare",
  "energy and utilities": "energy",
  "autos and mobility": "autos",
  "consumer and fmcg": "consumer",
  "capital goods and industrials": "capital-goods",
  "metals and mining": "metals",
  "real estate": "real-estate",
  "psus": "psu",
};

const SECTOR_DOC_ALIASES: Record<string, string[]> = {
  "big-tech": ["technology"],
  "financials": ["financial-services"],
  "finance": ["financial-services"],
  "semis": ["semiconductors"],
};

export function sectorSlug(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (SECTOR_ID_BY_LABEL[lower]) return SECTOR_ID_BY_LABEL[lower];
  if (/^[a-z0-9-]+$/.test(lower)) return lower;
  return lower
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type SectorSlugMap = Record<string, string>;

type StockUniverseEntry = {
  ticker?: string;
  display_name?: string;
  aliases?: string[];
  sector_tags?: string[];
};

export async function buildSectorSlugMap(
  market: Market = "US",
): Promise<SectorSlugMap> {
  const docs = await listSectorContextDocs(market);
  const map: SectorSlugMap = {};
  for (const doc of docs) {
    const id = String(doc.sector_id ?? "").trim().toLowerCase();
    if (!id) continue;
    map[id] = id;
    const label = String(doc.sector_label ?? "").trim().toLowerCase();
    if (label) map[label] = id;
  }
  return map;
}

export function resolveSectorId(
  input: string,
  map: SectorSlugMap,
): string | null {
  const key = String(input ?? "").trim().toLowerCase();
  if (!key) return null;
  if (map[key]) return map[key];
  const slug = sectorSlug(input);
  if (slug && map[slug]) return map[slug];
  return null;
}

export async function getSectorContextDoc(
  sectorId: string,
  market: Market = "US",
): Promise<SectorContextDoc | null> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const normalized = sectorSlug(sectorId);
  const candidateIds = [normalized, ...(SECTOR_DOC_ALIASES[normalized] ?? [])].filter(Boolean);
  for (const candidateId of candidateIds) {
    const doc = await adminFirestore
      .collection("tm_news_runs")
      .doc(ns)
      .collection("sector_context")
      .doc(candidateId)
      .get();
    if (doc.exists) return doc.data() as SectorContextDoc;
  }
  return null;
}

export async function listSectorContextDocs(
  market: Market = "US",
): Promise<SectorContextDoc[]> {
  const universe = await getAiUniverse(market);
  const ns = `${market}__${universe}`;
  const snap = await adminFirestore
    .collection("tm_news_runs")
    .doc(ns)
    .collection("sector_context")
    .get();
  return snap.docs.map((d) => d.data() as SectorContextDoc);
}

export function getTrackedSectorMembers(
  sectorId: string,
  market: Market = "US",
): Array<{ ticker: string; name: string }> {
  const normalized = sectorSlug(sectorId);
  const rows = ((stockUniverse as { markets?: Record<string, StockUniverseEntry[]> }).markets?.[market] ?? []);
  return rows
    .filter((row) => Array.isArray(row.sector_tags) && row.sector_tags.includes(normalized))
    .map((row) => ({
      ticker: String(row.ticker || "").trim().toUpperCase(),
      name: String(row.display_name || row.ticker || "").trim(),
    }))
    .filter((row) => row.ticker);
}
