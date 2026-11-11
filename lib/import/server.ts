import { getSessionUser } from "@/lib/auth-server";
import { buildDirectory, type Directory } from "@/lib/import/resolve";
import { getSearchIndexForApi } from "@/lib/search";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

/** The stocks we cover, as the import checks them: the same search index the rest of the app tracks from. */
export async function getImportDirectory(): Promise<Directory> {
  const entries = await getSearchIndexForApi("US").catch(() => []);
  return buildDirectory(entries.map((entry) => ({ instrument_id: entry.instrument_id, ticker: entry.ticker, name: entry.name, price: entry.price ?? null })));
}

export type ImportViewer = { uid: string | null; plan: "anon" | "free" | "pro" };

export async function getImportViewer(): Promise<ImportViewer> {
  const session = await getSessionUser().catch(() => null);
  if (!session) return { uid: null, plan: "anon" };
  const doc = await getUserDoc(session.uid).catch(() => null);
  return { uid: session.uid, plan: resolveIsSubscribed(doc) ? "pro" : "free" };
}
