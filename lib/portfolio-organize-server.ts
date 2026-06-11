import fs from "node:fs/promises";
import path from "node:path";

import { adminFirestore } from "@/lib/firebase-admin";
import { getAiUniverse, getLatestPrices, getInstruments } from "@/lib/firestore";
import { buildRebalancePlanFromData, type RebalanceUniverseCandidate } from "@/lib/portfolio-organize";
import type { PortfolioRebalanceBundle, RebalanceStrategyId } from "@/lib/portfolio-organize-types";
import type { PortfolioBookRow } from "@/lib/portfolio-book";
import {
  getCachedRebalancePlan,
  portfolioFingerprint,
  setCachedRebalancePlan,
} from "@/lib/portfolio-rebalance-cache";
import { getSectorRegimes, slugifySector, type SectorRegimeDoc } from "@/lib/sector-regimes";
import type { StockIntelPro } from "@/lib/types";

type UniverseCatalog = {
  markets?: Record<
    string,
    {
      instruments?: Array<{
        instrument_id?: string;
        ticker?: string;
        name?: string;
        sector?: string;
        industry?: string;
        logo_url?: string;
      }>;
      universes?: Record<string, string[]>;
    }
  >;
};

let cachedCatalog: UniverseCatalog | null = null;

async function loadUniverseCatalog(): Promise<UniverseCatalog> {
  if (cachedCatalog) return cachedCatalog;
  const filePath = path.join(process.cwd(), "backend", "config", "instrument_universe.json");
  const raw = await fs.readFile(filePath, "utf-8");
  cachedCatalog = JSON.parse(raw) as UniverseCatalog;
  return cachedCatalog;
}

async function listUniverseInstrumentIds(market: "US" | "IN", universeId: string): Promise<string[]> {
  const catalog = await loadUniverseCatalog();
  const marketCatalog = catalog.markets?.[market];
  const ids = marketCatalog?.universes?.[universeId];
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || "").trim().toUpperCase()).filter(Boolean);
}

async function loadUniverseCandidates(market: "US" | "IN"): Promise<RebalanceUniverseCandidate[]> {
  const universeId = await getAiUniverse(market);
  const instrumentIds = await listUniverseInstrumentIds(market, universeId);
  if (instrumentIds.length === 0) return [];

  const [instrumentsById, latestById, intelSnap] = await Promise.all([
    getInstruments(instrumentIds),
    getLatestPrices(instrumentIds),
    adminFirestore
      .collection("tm_stock_intel_pro")
      .doc(`${market}__${universeId}`)
      .collection("stocks")
      .get(),
  ]);

  const intelById = new Map<string, StockIntelPro>();
  for (const doc of intelSnap.docs) {
    intelById.set(doc.id, doc.data() as StockIntelPro);
  }

  const out: RebalanceUniverseCandidate[] = [];
  for (const instrumentId of instrumentIds) {
    const intel = intelById.get(instrumentId);
    if (!intel) continue;
    const instrument = instrumentsById.get(instrumentId);
    const latest = latestById.get(instrumentId);
    out.push({
      instrument_id: instrumentId,
      ticker: instrument?.ticker || intel.ticker || instrumentId.split("_").pop() || instrumentId,
      name: instrument?.name || latest?.provider_metadata?.name || instrumentId,
      logo_url: instrument?.logo_url || null,
      sector_label: instrument?.sector || intel.sector_label || "Uncategorized",
      industry_label: instrument?.industry || intel.industry_label || "",
      price: latest?.quote?.current ?? null,
      day_change_pct: latest?.quote?.day_change_pct ?? null,
      market_cap: latest?.fundamentals?.market_cap ?? null,
      pe_ttm: latest?.fundamentals?.pe_ttm ?? null,
      verdict: typeof intel.overall?.verdict === "string" ? intel.overall.verdict : null,
      directive_text: null,
      scores: {
        overall: intel.overall?.score ?? null,
        valuation: intel.pillars?.valuation?.score ?? null,
        growth: intel.pillars?.growth?.score ?? null,
        quality: intel.pillars?.quality?.score ?? null,
        momentum: intel.pillars?.momentum?.score ?? null,
      },
    });
  }

  return out;
}

const STRATEGY_IDS: RebalanceStrategyId[] = [
  "balanced",
  "quality",
  "ai_momentum",
  "defensive",
  "diversification",
];

export async function buildRebalancePlan(
  uid: string,
  rows: PortfolioBookRow[],
  options?: { forceRefresh?: boolean; strategyId?: string | null },
): Promise<PortfolioRebalanceBundle> {
  const holdings = rows.filter((row) => row.position_type === "holding");
  if (holdings.length === 0) {
    const defaultStrategy = (options?.strategyId || "balanced") as RebalanceStrategyId;
    const emptyStrategies = Object.fromEntries(
      STRATEGY_IDS.map((strategyId) => [
        strategyId,
        buildRebalancePlanFromData({
          rows,
          universeCandidates: [],
          sectorRegimes: {},
          strategyId,
        }),
      ]),
    ) as PortfolioRebalanceBundle["strategies"];
    return {
      default_strategy: defaultStrategy,
      strategies: emptyStrategies,
      generated_at: new Date().toISOString(),
    };
  }

  const defaultStrategy = (options?.strategyId || "balanced") as RebalanceStrategyId;
  const fingerprint = portfolioFingerprint(rows);
  if (!options?.forceRefresh) {
    const cached = await getCachedRebalancePlan(uid, fingerprint).catch(() => null);
    if (cached) {
      return {
        ...cached,
        default_strategy: defaultStrategy,
      };
    }
  }

  const market = holdings[0]?.market === "IN" ? "IN" : "US";
  const [candidates, regimes] = await Promise.all([
    loadUniverseCandidates(market),
    getSectorRegimes(market).catch(() => ({ sectors: {}, macro: null })),
  ]);

  const normalizedRegimes: Record<string, SectorRegimeDoc> = {};
  for (const [slug, rawDoc] of Object.entries(regimes.sectors || {})) {
    const doc = rawDoc as SectorRegimeDoc;
    normalizedRegimes[slugifySector(doc.sector || slug)] = doc;
  }

  const strategies = Object.fromEntries(
    STRATEGY_IDS.map((strategyId) => [
      strategyId,
      buildRebalancePlanFromData({
        rows,
        universeCandidates: candidates,
        sectorRegimes: normalizedRegimes,
        strategyId,
      }),
    ]),
  ) as PortfolioRebalanceBundle["strategies"];

  for (const plan of Object.values(strategies)) {
    plan.holdings_fingerprint = fingerprint;
  }

  const bundle: PortfolioRebalanceBundle = {
    default_strategy: defaultStrategy,
    strategies,
    generated_at: new Date().toISOString(),
    holdings_fingerprint: fingerprint,
  };
  await setCachedRebalancePlan(uid, fingerprint, bundle).catch(() => undefined);
  return bundle;
}
