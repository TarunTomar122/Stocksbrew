import { isAgentCall } from "@/lib/agent-jobs";
import { isCovered, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSearchIndexForApi } from "@/lib/search";
import { loadUniverseCatalog, type UniverseCatalog } from "@/lib/universe-catalog";

import type { CallLookup, PlainCall } from "./parse";
import { buildCatalog, type CatalogEntry, type StockCatalog } from "./stocks";

/**
 * The stock catalogue a request is read against: the search index (every
 * stock and fund with a page, and its last price) plus the instrument
 * universe (the names people use, like "Apple" for AAPL). Indexes and macro
 * series (US_IDX_SPX, US_MAC_VIX) are left out: agents need a daily close for
 * a stock or fund, so "the S&P 500" is read as SPY instead.
 *
 * Built once per server instance and refreshed every ten minutes.
 */

const REFRESH_MS = 10 * 60 * 1000;
let cached: { at: number; catalog: StockCatalog } | null = null;
let building: Promise<StockCatalog> | null = null;

async function build(): Promise<StockCatalog> {
  const [index, universe] = await Promise.all([
    getSearchIndexForApi("US").catch(() => []),
    loadUniverseCatalog().catch((): UniverseCatalog => ({})),
  ]);
  const entries: CatalogEntry[] = [];
  for (const row of universe.markets?.US?.instruments ?? []) {
    const id = String(row.instrument_id ?? "");
    if (!row.ticker || /^US_(?:IDX|MAC)_/.test(id)) continue;
    entries.push({ ticker: row.ticker, name: row.name ?? null, aliases: (row as { aliases?: string[] }).aliases ?? null });
  }
  for (const row of index) {
    if (/^US_(?:IDX|MAC)_/.test(row.instrument_id) || !row.instrument_id.startsWith("US_")) continue;
    entries.push({ ticker: row.ticker, name: row.name, price: row.price ?? null });
  }
  return buildCatalog(entries);
}

export async function plainCatalog(now = Date.now()): Promise<StockCatalog> {
  if (cached && now - cached.at < REFRESH_MS) return cached.catalog;
  building ??= build()
    .then((catalog) => {
      // An empty read (the store was down) is not kept, so the next request tries again.
      if (catalog.byTicker.size > 0) cached = { at: Date.now(), catalog };
      // A failed refresh keeps serving the last good catalogue.
      return catalog.byTicker.size > 0 || !cached ? catalog : cached.catalog;
    })
    .finally(() => {
      building = null;
    });
  return building;
}

const MAX_CALL_LOOKUPS = 25;

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Our call on the stocks a buy or sell watch names, for its read-back ("I'll tell you when Oracle reaches our
 * sell-some price ($250) …"): the steady call people see (tm_call_stability) and its kept levels, the levels only
 * where this person's plan covers the stock (the call itself is free). One batched read; a stock with no call doc
 * comes back as "no call yet". Reads only.
 */
export function plainCallLookup(viewer: Viewer): CallLookup {
  return async (tickers) => {
    const wanted = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))].slice(0, MAX_CALL_LOOKUPS);
    if (wanted.length === 0) return {};
    const idOf = (ticker: string) => `US_${ticker.replace(/\./g, "_")}`;
    const collection = adminFirestore.collection("tm_call_stability");
    const snaps = await adminFirestore.getAll(...wanted.map((ticker) => collection.doc(idOf(ticker))));
    const out: Record<string, PlainCall> = {};
    wanted.forEach((ticker, index) => {
      const data = snaps[index]?.exists ? ((snaps[index]!.data() ?? {}) as Record<string, unknown>) : null;
      const call = isAgentCall(data?.call) ? data!.call : null;
      const open = isCovered(viewer, idOf(ticker));
      const levels = (data?.levels ?? null) as { accumulate_below?: unknown; trim_above?: unknown } | null;
      out[ticker] = {
        call,
        add_below: open ? positive(levels?.accumulate_below) : null,
        trim_above: open ? positive(levels?.trim_above) : null,
        ...(open ? {} : { locked: true }),
      };
    });
    return out;
  };
}
