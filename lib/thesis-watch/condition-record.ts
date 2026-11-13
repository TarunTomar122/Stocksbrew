import type { Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { readTheses } from "@/lib/thesis";
import type { RecordItem } from "@/lib/thread/record";
import type { UserDoc } from "@/lib/watchlist";

import { conditionKey, figureText, isConditionMetric, METRICS, type ConditionRecord } from "./conditions";
import { watches } from "./server";
import { CHECKS_COLLECTION, checkDocId, readStoredCheck } from "./store";

/**
 * The quiet record line on /agent the day a report's figures were checked against a person's measurable line and it
 * held: "AMD's Q3: revenue growth 42%, above your 20%. Reason holds." A line that broke is not here: it becomes a
 * proposal (lib/proposals.ts reason_broken), which the record shows once answered. Reads only the person's own
 * tm_thesis_checks documents, written by the nightly run; writes nothing.
 */

/** Report-day lines this many days old or newer. */
export const RECORD_DAYS = 14;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "revenue growth 671%", from a record's key ("revenue_growth:above:500") and figure. */
function figureWords(record: ConditionRecord): string | null {
  const [metric, , line] = record.key.split(":");
  if (!isConditionMetric(metric) || record.now === null) return null;
  return `${METRICS[metric].words} ${figureText(metric, record.now, Number(line))}`;
}

/**
 * The lines from stored records: one per stock and report day. Two lines that held on the same report are said once
 * ("ASTS's Q3: revenue growth 671% and gross margin 37%. Both your lines hold."), not twice with the same ending. Pure.
 */
export function recordLines(ticker: string, records: readonly ConditionRecord[], today: string): Array<{ day: string; item: RecordItem }> {
  const held = records.filter(
    (record) => record.status === "holds" && record.checked_on && record.line && daysBetween(record.checked_on, today) <= RECORD_DAYS && daysBetween(record.checked_on, today) >= 0,
  );
  const byDay = new Map<string, ConditionRecord[]>();
  for (const record of held) byDay.set(record.checked_on!, [...(byDay.get(record.checked_on!) ?? []), record]);
  return [...byDay.entries()].map(([day, rows]) => {
    const first = rows[0]!;
    const figures = rows.map(figureWords);
    const lead = `${ticker}'s ${first.report_quarter ?? "report"}`;
    const text = rows.length > 1 && figures.every(Boolean) ? `${lead}: ${figures.join(" and ")}. Both your lines hold.` : first.line;
    return {
      day,
      item: {
        id: `condition:${ticker}:${first.report_date ?? day}`,
        kind: "quiet" as const,
        ticker,
        text,
        tag: null,
        figure: null,
        href: `/stock/${encodeURIComponent(ticker)}`,
      },
    };
  });
}

export async function loadConditionRecord(viewer: Viewer, doc: UserDoc | null, today: string): Promise<Array<{ day: string; item: RecordItem }>> {
  if (!viewer.uid || !doc) return [];
  const tracked = new Set(Array.isArray(doc.tracked_stocks) ? doc.tracked_stocks : []);
  const ids = Object.entries(readTheses((doc as unknown as Record<string, unknown>).theses))
    .filter(([id, thesis]) => tracked.has(id) && (thesis.conditions ?? []).length > 0 && watches(viewer, id))
    .map(([id]) => id);
  if (ids.length === 0) return [];
  const theses = readTheses((doc as unknown as Record<string, unknown>).theses);
  const snaps = await adminFirestore.getAll(...ids.map((id) => adminFirestore.collection(CHECKS_COLLECTION).doc(checkDocId(viewer.uid!, id))));
  return snaps.flatMap((snap, index) => {
    const stored = snap.exists ? readStoredCheck(snap.data()) : null;
    // "Reason holds." is only said while the reason does: a broken one is the proposal's to tell.
    if (!stored || stored.uid !== viewer.uid || stored.verdict === "broken") return [];
    // Only the lines the reason has now: an edited line's old record is not news.
    const keys = new Set((theses[ids[index]!]?.conditions ?? []).map(conditionKey));
    return recordLines(stored.ticker, stored.conditions.filter((record) => keys.has(record.key)), today);
  });
}
