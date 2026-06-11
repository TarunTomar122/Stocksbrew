import { filterSearchEntries, type SearchEntry } from "@/lib/search-shared";

let cachedEntries: SearchEntry[] | null = null;
let inflight: Promise<SearchEntry[]> | null = null;

function normalizeEntries(raw: unknown): SearchEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as Partial<SearchEntry>;
      return {
        instrument_id: String(row.instrument_id || "").toUpperCase(),
        ticker: String(row.ticker || "").toUpperCase(),
        name: String(row.name || row.ticker || "").trim(),
        price: typeof row.price === "number" ? row.price : undefined,
        day_change_pct:
          typeof row.day_change_pct === "number" ? row.day_change_pct : undefined,
      };
    })
    .filter((entry) => entry.instrument_id && entry.ticker);
}

export function getClientSearchIndex(): SearchEntry[] {
  return cachedEntries ?? [];
}

async function loadSearchIndex(market: "US" | "IN"): Promise<SearchEntry[]> {
  const res = await fetch(`/api/search-index?market=${encodeURIComponent(market)}`);
  if (!res.ok) throw new Error("search_index_failed");
  const data = await res.json().catch(() => ({}));
  const entries = normalizeEntries(data?.entries);
  if (entries.length > 0) cachedEntries = entries;
  return entries;
}

export function prefetchSearchIndex(market: "US" | "IN" = "US"): Promise<SearchEntry[]> {
  if (cachedEntries && cachedEntries.length > 0) {
    return Promise.resolve(cachedEntries);
  }
  if (inflight) return inflight;

  inflight = loadSearchIndex(market).finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function fetchSearchTypeahead(
  query: string,
  market: "US" | "IN" = "US",
  limit = 20,
): Promise<SearchEntry[]> {
  const q = query.trim();
  if (!q) return [];

  if (cachedEntries && cachedEntries.length > 0) {
    return filterSearchEntries(cachedEntries, q, limit);
  }

  const res = await fetch(
    `/api/search-index?market=${encodeURIComponent(market)}&q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("search_typeahead_failed");
  const data = await res.json().catch(() => ({}));
  return normalizeEntries(data?.entries);
}
