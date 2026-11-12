import { filterSearchEntries, type SearchEntry } from "@/lib/search-shared";

type Market = "US" | "IN";

/**
 * One copy of the stock search index per market for the whole browser
 * session, shared by every search box on the page (the sidebar and the
 * phone top bar each mount one). Fetched once, on first use, and refreshed
 * after REFRESH_MS so prices in the results do not go stale on a long visit.
 */
const REFRESH_MS = 10 * 60 * 1000;
const cached = new Map<Market, { entries: SearchEntry[]; at: number }>();
const inflight = new Map<Market, Promise<SearchEntry[]>>();

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
        ...(row.fund === true ? { fund: true } : {}),
      };
    })
    .filter((entry) => entry.instrument_id && entry.ticker);
}

/** The index already in memory for this market, or an empty list. Never fetches. */
export function getClientSearchIndex(market: Market = "US"): SearchEntry[] {
  return cached.get(market)?.entries ?? [];
}

async function loadSearchIndex(market: Market): Promise<SearchEntry[]> {
  const res = await fetch(`/api/search-index?market=${encodeURIComponent(market)}`);
  if (!res.ok) throw new Error("search_index_failed");
  const data = await res.json().catch(() => ({}));
  const entries = normalizeEntries(data?.entries);
  if (entries.length > 0) cached.set(market, { entries, at: Date.now() });
  return entries;
}

/** The search index for a market: from memory when fresh, else one shared request. */
export function prefetchSearchIndex(market: Market = "US"): Promise<SearchEntry[]> {
  const hit = cached.get(market);
  if (hit && hit.entries.length > 0 && Date.now() - hit.at < REFRESH_MS) {
    return Promise.resolve(hit.entries);
  }
  const pending = inflight.get(market);
  if (pending) return pending;

  const request = loadSearchIndex(market)
    // A failed refresh keeps the older copy rather than emptying every search box. The API
    // answers a backend failure with 200 and no entries, so an empty list counts as failed too.
    .then((entries) => (entries.length > 0 || !hit ? entries : hit.entries))
    .catch((error) => {
      if (hit && hit.entries.length > 0) return hit.entries;
      throw error;
    })
    .finally(() => {
      inflight.delete(market);
    });
  inflight.set(market, request);
  return request;
}

export async function fetchSearchTypeahead(
  query: string,
  market: "US" | "IN" = "US",
  limit = 20,
): Promise<SearchEntry[]> {
  const q = query.trim();
  if (!q) return [];

  const entries = getClientSearchIndex(market);
  if (entries.length > 0) {
    return filterSearchEntries(entries, q, limit);
  }

  const res = await fetch(
    `/api/search-index?market=${encodeURIComponent(market)}&q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("search_typeahead_failed");
  const data = await res.json().catch(() => ({}));
  return normalizeEntries(data?.entries);
}
