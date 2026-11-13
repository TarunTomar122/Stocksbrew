import { adminFirestore } from "@/lib/firebase-admin";
import { localFirestoreFromEnv } from "@/lib/local-firestore";
import { sharedCache } from "@/lib/shared-cache";

import { parseExtendedDoc, type ExtendedQuote } from "./extended-quotes";

/**
 * The stored after-hours and pre-market quotes (`tm_extended_quotes/{TICKER}`) for a set of tickers, the same for
 * every visitor: one batched read, cached for a minute (the job writes every 15 minutes). A missing document is no
 * quote; a failed read throws inside the cache (lib/shared-cache.ts) and the callers below treat it as no quotes.
 */

const COLLECTION = "tm_extended_quotes";
const FIELDS = ["ticker", "session", "price", "change_pct", "regular_close", "regular_close_at", "as_of", "source", "post", "pre", "earnings"];
/** At most this many stocks in one read (a person's whole list fits). */
const MAX_TICKERS = 120;

type Snap = { exists: boolean; id: string; data(): unknown };

function cleanTickers(tickers: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of tickers) {
    const ticker = String(raw ?? "").trim().toUpperCase().replace(/\//g, "-");
    if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) out.add(ticker);
  }
  return [...out].sort().slice(0, MAX_TICKERS);
}

async function readQuotes(key: string): Promise<Record<string, unknown>> {
  const tickers = key.split(",").filter(Boolean);
  if (tickers.length === 0) return {};
  const local = localFirestoreFromEnv();
  const snaps = (
    local
      ? await local.getAllSelected(
          tickers.map((ticker) => local.collection(COLLECTION).doc(ticker)),
          FIELDS,
        )
      : await adminFirestore.getAll(...tickers.map((ticker) => adminFirestore.collection(COLLECTION).doc(ticker)))
  ) as unknown as Snap[];
  const out: Record<string, unknown> = {};
  snaps.forEach((snap, index) => {
    if (snap?.exists) out[tickers[index]!] = snap.data();
  });
  return out;
}

const readQuotesCached = sharedCache(readQuotes, ["extended-quotes-v1"], { revalidate: 60 });

/**
 * Each ticker's stored quote (fresh or not: the caller decides with `isExtendedLive`). Empty when the read fails, or,
 * with `strict`, throws, for a caller that must not cache a failed read as "no quotes" (the inbox).
 */
export async function getExtendedQuotes(tickers: readonly string[], options: { strict?: boolean } = {}): Promise<Map<string, ExtendedQuote>> {
  const key = cleanTickers(tickers).join(",");
  const out = new Map<string, ExtendedQuote>();
  if (!key) return out;
  try {
    const docs = await readQuotesCached(key);
    for (const [ticker, raw] of Object.entries(docs)) {
      const quote = parseExtendedDoc(raw);
      if (quote) out.set(ticker, quote);
    }
  } catch (error) {
    if (options.strict) throw error;
    console.warn("[extended-quotes] read failed:", error instanceof Error ? error.message : error);
  }
  return out;
}

/** One stock's stored quote, or null. */
export async function getExtendedQuote(ticker: string): Promise<ExtendedQuote | null> {
  const clean = cleanTickers([ticker])[0];
  if (!clean) return null;
  return (await getExtendedQuotes([clean])).get(clean) ?? null;
}
