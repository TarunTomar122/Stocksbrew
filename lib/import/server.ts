import { getSessionUser } from "@/lib/auth-server";
import { queueFundRequests } from "@/lib/funds/on-demand";
import { fundKindOf } from "@/lib/funds/tickers";
import { addingTickers, buildDirectory, resolveHoldings, type Directory, type ImportRow } from "@/lib/import/resolve";
import type { ParsedHolding } from "@/lib/import/normalize";
import { getSearchIndexForApi } from "@/lib/search";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/** The stocks we cover, as the import checks them: the same search index the rest of the app tracks from. */
export async function getImportDirectory(): Promise<Directory> {
  const entries = await getSearchIndexForApi("US").catch(() => []);
  return buildDirectory(entries.map((entry) => ({ instrument_id: entry.instrument_id, ticker: entry.ticker, name: entry.name, price: entry.price ?? null })));
}

/**
 * Holdings against the stocks we cover. A US fund we do not cover yet comes
 * back as an "adding" row and is filed with the fund worker right away, so it
 * is being added whether or not the person saves.
 */
export async function resolveImport(rows: ParsedHolding[], directory: Directory, uid: string | null = null): Promise<ImportRow[]> {
  const resolved = resolveHoldings(rows, directory, fundKindOf);
  const funds = addingTickers(resolved);
  if (funds.length) await queueFundRequests(funds, { uid, source: "import" });
  return resolved;
}

export type ImportViewer = { uid: string | null; plan: "anon" | "free" | "pro" };

export async function getImportViewer(): Promise<ImportViewer> {
  const session = await getSessionUser().catch(() => null);
  if (!session) return { uid: null, plan: "anon" };
  const doc = await getUserDoc(session.uid).catch(() => null);
  return { uid: session.uid, plan: resolveIsSubscribed(doc) ? "pro" : "free" };
}
