import fs from "node:fs/promises";
import path from "node:path";

export type UniverseCatalog = {
  markets?: Record<
    string,
    {
      instruments?: Array<{
        instrument_id?: string;
        ticker?: string;
        name?: string;
        sector?: string;
        industry?: string;
      }>;
      universes?: Record<string, string[]>;
    }
  >;
};

let cachedCatalog: UniverseCatalog | null = null;

export async function loadUniverseCatalog(): Promise<UniverseCatalog> {
  if (cachedCatalog) return cachedCatalog;
  const filePath = path.join(process.cwd(), "backend", "config", "instrument_universe.json");
  const raw = await fs.readFile(filePath, "utf-8");
  cachedCatalog = JSON.parse(raw) as UniverseCatalog;
  return cachedCatalog;
}

export async function listUniverseInstrumentIds(market: "US" | "IN", universeId: string): Promise<string[]> {
  const catalog = await loadUniverseCatalog();
  const ids = catalog.markets?.[market]?.universes?.[universeId];
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || "").trim().toUpperCase()).filter(Boolean);
}

export async function listCatalogInstruments(
  market: "US" | "IN",
  universeId: string,
): Promise<Array<{ instrument_id: string; ticker: string; name: string; sector: string; industry: string }>> {
  const catalog = await loadUniverseCatalog();
  const idSet = new Set(await listUniverseInstrumentIds(market, universeId));
  const rows = catalog.markets?.[market]?.instruments ?? [];
  const out: Array<{ instrument_id: string; ticker: string; name: string; sector: string; industry: string }> = [];
  for (const row of rows) {
    const instrument_id = String(row.instrument_id || "").trim().toUpperCase();
    if (!instrument_id || !idSet.has(instrument_id)) continue;
    out.push({
      instrument_id,
      ticker: String(row.ticker || instrument_id.split("_").slice(1).join("_") || ""),
      name: String(row.name || row.ticker || instrument_id),
      sector: String(row.sector || ""),
      industry: String(row.industry || ""),
    });
  }
  return out;
}
