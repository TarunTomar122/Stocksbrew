import type { AnomalyItem } from "@/lib/daily-anomalies";
import { localFirestoreFromEnv } from "@/lib/local-firestore";

/**
 * Small copies of the explained-moves docs (backend/anomaly_refs.py). Each `tm_daily_anomalies/{id}` doc (~70 KB a
 * day, every mover with its full research) has a copy at `tm_daily_anomaly_refs/{id}` holding only its verified rows,
 * cut to the fields a move reference reads, and the store hash of the doc it was cut from. One batch read asks for
 * the copies and, through a field mask the sources do not have, the sources' hashes alone; the copies are used only
 * when every one of them was cut from the source the store holds now. Otherwise the caller reads the sources.
 */

export const ANOMALY_SOURCE_COLLECTION = "tm_daily_anomalies";
export const ANOMALY_REFS_COLLECTION = "tm_daily_anomaly_refs";
/** Bump with backend/anomaly_refs.py REFS_VERSION. */
export const ANOMALY_REFS_VERSION = 1;
const REFS_FIELDS = ["mr_v", "mr_src", "mr_date", "mr_rows"];

/** A source doc as the readers see it: its date and (the verified rows of) its anomalies. */
export type AnomalyDocLike = { id: string; data: { date?: string; anomalies?: AnomalyItem[] } };

type BatchRow = { path?: string; data?: Record<string, unknown>; hash?: string };

/**
 * The copies standing in for the sources `dated` (each must exist) and `latest` (skipped when it does not exist), in
 * that order, from one batch read's rows. Pure. Undefined when any copy is missing, of another version, or cut from
 * a different version of its source.
 */
export function docsFromRefRows(dated: readonly string[], latest: string | null, rows: readonly BatchRow[]): AnomalyDocLike[] | undefined {
  const byPath = new Map(rows.filter((row) => typeof row?.path === "string").map((row) => [row.path!, row]));
  const out: AnomalyDocLike[] = [];
  for (const id of latest ? [...dated, latest] : dated) {
    const source = byPath.get(`${ANOMALY_SOURCE_COLLECTION}/${id}`);
    if (!source) {
      if (id === latest) continue;
      return undefined;
    }
    const copy = byPath.get(`${ANOMALY_REFS_COLLECTION}/${id}`)?.data;
    if (!copy || !source.hash || copy.mr_v !== ANOMALY_REFS_VERSION || copy.mr_src !== source.hash || !Array.isArray(copy.mr_rows)) return undefined;
    out.push({ id, data: { ...(copy.mr_date === undefined ? {} : { date: copy.mr_date as string }), anomalies: copy.mr_rows as AnomalyItem[] } });
  }
  return out;
}

/** The copies for these source ids (see docsFromRefRows); undefined off LocalDB or when a read fails. */
export async function readAnomalyRefs(dated: readonly string[], latest: string | null): Promise<AnomalyDocLike[] | undefined> {
  const client = localFirestoreFromEnv();
  if (!client) return undefined;
  const ids = latest ? [...dated, latest] : [...dated];
  if (ids.length === 0) return [];
  const rows: BatchRow[] = [];
  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200);
    const paths = chunk.flatMap((id) => [`${ANOMALY_REFS_COLLECTION}/${id}`, `${ANOMALY_SOURCE_COLLECTION}/${id}`]);
    const result = await client.read("/documents:batchGet", { method: "POST", body: { paths, select: REFS_FIELDS } });
    if (!result.ok) return undefined;
    const parsed = JSON.parse(result.text) as { documents?: BatchRow[] };
    if (!Array.isArray(parsed.documents)) return undefined;
    rows.push(...parsed.documents);
  }
  return docsFromRefRows(dated, latest, rows);
}
