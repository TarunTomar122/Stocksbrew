import { adminFirestore } from "@/lib/firebase-admin";
import { LocalFirestore } from "@/lib/local-firestore";
import { fetchRiskList, listFilings } from "@/lib/research/edgar";
import { listUniverseInstrumentIds } from "@/lib/universe-catalog";
import { getCoverageUniverse } from "@/lib/universe-tiers";

import type { JobDeps } from "./job";
import { tickerOfId, trackedTickers } from "./tickers";
import { FILING_CHANGES_COLLECTION, readFilingChangesDoc, type FilingChangesDoc } from "./store";

/**
 * The real reads and writes for the filing check (lib/filing-changes/job.ts): user docs (only the stock lists, only
 * read), the covered universe, SEC EDGAR through lib/research/edgar.ts, and tm_filing_changes. Server only.
 */

const READ_CHUNK = 100;

async function listUsers(): Promise<Array<{ tracked_stocks?: unknown; watchlist_positions?: unknown }>> {
  // Only the two stock fields come back. The LocalDB adapter takes the field list as an array, Firestore as arguments.
  const users = adminFirestore.collection("users") as unknown as { select: (...fields: unknown[]) => { get: () => Promise<{ docs: Array<{ data: () => unknown }> }> } };
  const fields = ["tracked_stocks", "watchlist_positions"];
  const query = (adminFirestore as unknown) instanceof LocalFirestore ? users.select(fields) : users.select(...fields);
  const snap = await query.get();
  return snap.docs.map((doc) => (doc.data() ?? {}) as { tracked_stocks?: unknown; watchlist_positions?: unknown });
}

async function universeTickers(): Promise<string[]> {
  const universe = await getCoverageUniverse("US").catch(() => "us_core_155");
  const ids = await listUniverseInstrumentIds("US", universe);
  return ids.map(tickerOfId).filter((ticker): ticker is string => ticker !== null);
}

export const storeDeps: JobDeps = {
  async tickers() {
    const [users, universe] = await Promise.all([listUsers(), universeTickers()]);
    const tracked = trackedTickers(users);
    const seen = new Set(tracked);
    const rest = universe.filter((ticker) => !seen.has(ticker) && Boolean(seen.add(ticker)));
    return { tickers: [...tracked, ...rest], tracked: tracked.length };
  },
  async readStored(tickers) {
    const out = new Map<string, FilingChangesDoc>();
    for (let i = 0; i < tickers.length; i += READ_CHUNK) {
      const chunk = tickers.slice(i, i + READ_CHUNK);
      const snaps = await adminFirestore.getAll(...chunk.map((ticker) => adminFirestore.collection(FILING_CHANGES_COLLECTION).doc(ticker)));
      snaps.forEach((snap, index) => {
        const doc = snap.exists ? readFilingChangesDoc(snap.data()) : null;
        if (doc) out.set(chunk[index]!, doc);
      });
    }
    return out;
  },
  listFilings: (ticker) => listFilings(ticker),
  riskList: (filing) => fetchRiskList(filing),
  async write(ticker, doc) {
    await adminFirestore.collection(FILING_CHANGES_COLLECTION).doc(ticker).set(doc);
  },
  clock: () => Date.now(),
};
