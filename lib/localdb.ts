/** Server-only LocalDB read helper. Keep this module out of client components. */

import { LocalDocumentReference, localFirestoreFromEnv } from "@/lib/local-firestore";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getLocalDBDocument<T = Record<string, unknown>>(
  documentPath: string,
): Promise<T | null> {
  const db = localFirestoreFromEnv();
  if (!db) return null;
  try {
    // Through the shared adapter: its keep-alive pool, timeout, retry of a
    // dropped read and degraded-render note, and never Next's Data Cache.
    const data = (await new LocalDocumentReference(db, documentPath).get()).data();
    return isObject(data) ? (data as T) : null;
  } catch {
    return null;
  }
}
