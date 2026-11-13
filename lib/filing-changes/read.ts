/**
 * One stock's filing comparison for a reader outside the stock page (Ask, the MCP server and the REST API): which
 * comparison to show, whatever was filed after it, and a filing whose risk section could not be read. The same choice
 * as the stock page (viewOf in ./store.ts), so all three say the same thing about a stock. A comparison that could not
 * be read is never shown as a change. Pure: safe anywhere.
 */

import { absoluteDay } from "@/lib/day-words";

import type { Comparison, FilingRef } from "./diff";
import { viewOf, type FilingChangesDoc } from "./store";
import { quietLine, risks } from "./words";

export type FilingChangesRead =
  /** Nothing stored for this stock: the check has not compared its filings. */
  | { kind: "none" }
  /** Stored, but no filing's risk section could be read: nothing can be said. */
  | { kind: "unreadable"; ticker: string; company: string; filing: FilingRef }
  | {
      kind: "ok";
      ticker: string;
      company: string;
      /** The comparison the lists come from. */
      shown: Comparison;
      /** A newer readable filing that changed less, said in one line. */
      newer: Comparison | null;
      /** The newest filing, when its risk section could not be read and it is newer than `shown`. */
      unread: FilingRef | null;
      /** The stock page shows this comparison (its section exists to link to). */
      onPage: boolean;
    };

const byFiled = (a: Comparison, b: Comparison) => b.filing.filed.localeCompare(a.filing.filed) || b.filing.accession.localeCompare(a.filing.accession);

/** Every stored comparison, newest first, once per filing. */
function allOf(doc: FilingChangesDoc): Comparison[] {
  const seen = new Set<string>();
  return [doc.latest, ...doc.history].sort(byFiled).filter((entry) => {
    if (seen.has(entry.filing.accession)) return false;
    seen.add(entry.filing.accession);
    return true;
  });
}

export function readFilingChangesOf(doc: FilingChangesDoc | null, today: string): FilingChangesRead {
  if (!doc) return { kind: "none" };
  const all = allOf(doc);
  const newest = all[0];
  if (!newest) return { kind: "none" };
  const view = viewOf(doc, today);
  // No change within the stock page's window: the newest comparison that could be read says what there is to say.
  const shown = view?.shown ?? all.find((entry) => entry.status !== "unreadable") ?? null;
  if (!shown) return { kind: "unreadable", ticker: doc.ticker, company: doc.company, filing: newest.filing };
  const newer = view?.quiet ?? null;
  const unread = newest.status === "unreadable" && newest.filing.filed > shown.filing.filed ? newest.filing : null;
  return { kind: "ok", ticker: doc.ticker, company: doc.company, shown, newer, unread, onPage: view !== null };
}

/** "10-K filed Feb 4": the filing in words, with the year when it is not this one. */
export function filingName(ref: Pick<FilingRef, "form" | "filed">, today: string): string {
  return `${ref.form} filed ${absoluteDay(ref.filed, today)}`;
}

/**
 * One sentence on what the shown comparison found, figures from the comparison: "AMD's 10-K filed Feb 4 added 1 risk
 * and dropped 3 against its 10-K from Jan 31, 2025." A 10-Q that lists only some risks is held against the 10-K.
 */
export function comparisonSentence(ticker: string, comparison: Comparison, today: string): string {
  const name = `${ticker}'s ${filingName(comparison.filing, today)}`;
  // A partial 10-Q is held against the 10-K, so what it adds is new since then.
  const partial = comparison.scope === "partial";
  const base = comparison.base
    ? ` ${partial ? "since" : "against"} its ${comparison.base.form} from ${absoluteDay(comparison.base.filed, today)}`
    : partial
      ? " since its 10-K"
      : "";
  if (comparison.status === "no_changes") return `${name} says its risks have not changed since the 10-K.`;
  if (comparison.status === "none_listed") return `${name} lists no new risks and points back to its 10-K.`;
  if (comparison.status === "unreadable") return `We couldn't read the risk section of ${name}.`;
  const added = comparison.added.length;
  const dropped = comparison.dropped.length;
  const repeated = comparison.repeated?.length ?? 0;
  const reworded = comparison.reworded.length;
  const parts: string[] = [];
  if (added > 0) parts.push(`added ${risks(added)}`);
  if (dropped > 0) parts.push(`dropped ${added > 0 ? dropped : risks(dropped)}`);
  if (parts.length > 0) return `${name} ${parts.join(" and ")}${base}.`;
  if (repeated > 0) return `${name} repeats ${risks(repeated)} first added after its 10-K.`;
  if (reworded > 0) return `${name} added and dropped no risks${base}, and reworded ${reworded}.`;
  return `${name} changed no risks${base}.`;
}

/** The line about a newer filing that changed less ("Since then, its 10-Q filed Nov 4 adds no new risks."). */
export function newerLine(newer: Comparison | null, today: string): string | null {
  return newer ? quietLine(newer, today) : null;
}
