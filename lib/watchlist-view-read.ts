import { cache } from "react";

import { adminFirestore } from "@/lib/firebase-admin";
import { LocalFirestore } from "@/lib/local-firestore";

/**
 * One read of a person's stored watchlist view (`tm_watchlist_views/{uid}`) per request. A view is up to ~400 KB
 * (the rows carry every stock's call, facts and signals), and a signed-in briefing or agent page asked for it twice:
 * once for the page (lib/watchlist-view.ts getWatchlistView) and once for the proposals' scope
 * (lib/agent-jobs-data.ts resolveScope).
 *
 * The request keeps the document as text and every caller gets its own parsed copy, so a caller that sorts or patches
 * the rows never changes what another one reads. On a Firebase rollback the values can be Firestore timestamps,
 * which a copy through text would flatten, so there each call reads the store as before.
 */

// React's request cache only exists in the server-components build; scripts get a pass-through (scripts/jobs-runtime/react.ts).
const perRequest: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

async function readView(uid: string): Promise<Record<string, unknown> | null> {
  const doc = await adminFirestore.collection("tm_watchlist_views").doc(uid).get();
  return doc.exists ? ((doc.data() as Record<string, unknown> | undefined) ?? null) : null;
}

const readViewTextOnce = perRequest(async (uid: string): Promise<string | null> => {
  const view = await readView(uid);
  return view ? JSON.stringify(view) : null;
});

/** The stored view, or null when there is none. Throws when the store cannot be read. */
export async function readStoredWatchlistView(uid: string): Promise<Record<string, unknown> | null> {
  if (!((adminFirestore as unknown) instanceof LocalFirestore)) return readView(uid);
  const text = await readViewTextOnce(uid);
  return text === null ? null : (JSON.parse(text) as Record<string, unknown>);
}
