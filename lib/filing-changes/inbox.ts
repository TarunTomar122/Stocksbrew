/**
 * Filing comparisons as inbox items (and so as notes in the agent's thread and lines in its record): one item per
 * 10-K or 10-Q filed in the inbox window on one of the person's stocks, naming the new risks' topics: "SMR's new 10-K
 * adds 5 risks (ENTRA1 deal and supply chain) and drops 9.", with the dropped ones' topics as the second line. A 10-Q that changed nothing is a quiet item:
 * listed, never counted as unread. Server side (the topics read ./casing.ts's word list).
 */

import { instantOf, nyDay } from "@/lib/inbox/merge";
import type { InboxItem } from "@/lib/inbox/types";

import type { Comparison } from "./diff";
import type { FilingChangesDoc } from "./store";
import { recordLine, topicOptions } from "./lines";
import { topicList } from "./topics";
import { andList } from "./words";

export function filingChangesHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}#filing-changes`;
}

/** One comparison as an inbox item, or null when there is nothing to say (unreadable, or only rewording). */
export function filingItem(ticker: string, comparison: Comparison, company = ""): InboxItem | null {
  const text = recordLine(ticker, comparison, company);
  const at = instantOf(comparison.filing.filed);
  const day = at ? nyDay(at) : null;
  if (!text || !at || !day) return null;
  // Nothing new (no changes, or only risks an earlier 10-Q already added): listed, never counted as unread.
  const quiet = comparison.status !== "changes" || comparison.added.length + comparison.dropped.length === 0;
  // The line names the new risks' topics; the dropped ones', when there are both, go on the second line.
  const droppedTopics = comparison.added.length > 0 && comparison.dropped.length > 0 ? topicList(comparison.dropped, 3, topicOptions(company)) : [];
  const id = `filing:${ticker}:${comparison.filing.accession}`;
  // Worked out after the close (often the night after the filing): new to the reader from then, filed under its day.
  const arrived = comparison.compared_at && Date.parse(comparison.compared_at) > Date.parse(at) ? comparison.compared_at : null;
  return {
    id,
    kind: "filing",
    at,
    ...(arrived ? { arrivedAt: arrived } : {}),
    day,
    exact: false,
    tickers: [ticker],
    text,
    detail: droppedTopics.length ? `Dropped: ${andList(droppedTopics)}.` : null,
    // Only an item with something new is sure the stock page has the section to land on.
    href: quiet ? `/stock/${encodeURIComponent(ticker)}` : filingChangesHref(ticker),
    external: false,
    source: `SEC ${comparison.filing.form}`,
    tone: "flat",
    quiet,
    locked: false,
    dedupeKey: id,
    weight: 1,
    thread: null,
    move: null,
  };
}

/** The items for the person's stocks from their stored comparisons, filed on or after `sinceDay`. */
export function filingItems(docs: readonly FilingChangesDoc[], tickers: ReadonlySet<string>, sinceDay: string): InboxItem[] {
  const out: InboxItem[] = [];
  for (const doc of docs) {
    if (!tickers.has(doc.ticker)) continue;
    const seen = new Set<string>();
    for (const comparison of [doc.latest, ...doc.history]) {
      if (comparison.filing.filed < sinceDay || seen.has(comparison.filing.accession)) continue;
      seen.add(comparison.filing.accession);
      const item = filingItem(doc.ticker, comparison, doc.company);
      if (item) out.push(item);
    }
  }
  return out;
}
