/**
 * One company, several tickers: Alphabet trades as GOOGL and GOOG, Lennar as
 * LEN and LEN.B, Berkshire as BRK.B and BRK.A. A list a person reads shows
 * the company once, on the row that ranks first, and names the other class
 * beside it. The data underneath is never merged: counts, weights and sums
 * are computed from every row as before. This is display only.
 */

/** Classes whose tickers do not share a stem. Every value is the class most people trade. */
const SIBLING_OF: Record<string, string> = {
  GOOG: "GOOGL",
  FOX: "FOXA",
  NWS: "NWSA",
  UA: "UAA",
  ZG: "Z",
  LBRDA: "LBRDK",
  FWONA: "FWONK",
  LSXMA: "LSXMK",
  LSXMB: "LSXMK",
  BATRA: "BATRK",
  DISCA: "DISCK",
  VIAC: "PARA",
  MOG: "MOG.A",
};

/** The company a ticker belongs to: "GOOG" and "GOOGL" give "GOOGL"; "LEN.B" and "LEN" give "LEN"; "BRK.A" and "BRK.B" give "BRK". */
export function companyKey(ticker: string | null | undefined): string {
  const upper = String(ticker ?? "").trim().toUpperCase();
  if (!upper) return "";
  const mapped = SIBLING_OF[upper] ?? upper;
  // A one-letter class suffix after a dot, dash or slash: LEN.B, BRK-A, BF/B.
  return mapped.replace(/[.\-/][A-Z]$/, "");
}

export type ShareClassDedupe<T> = {
  /** The rows to show, in their original order, one per company. */
  rows: T[];
  /** For a kept row's ticker, the other classes of the same company that were folded into it. */
  also: Map<string, string[]>;
};

/**
 * Keeps the first row of each company and remembers the classes it stands for.
 * Rows without a ticker are always kept. Order is preserved, so a list sorted
 * by importance keeps its most important class.
 */
export function oneRowPerCompany<T>(rows: readonly T[], tickerOf: (row: T) => string | null | undefined): ShareClassDedupe<T> {
  const keptBy = new Map<string, string>();
  const also = new Map<string, string[]>();
  const kept: T[] = [];
  for (const row of rows) {
    const ticker = String(tickerOf(row) ?? "").trim().toUpperCase();
    const key = companyKey(ticker);
    if (!key) {
      kept.push(row);
      continue;
    }
    const first = keptBy.get(key);
    if (first === undefined) {
      keptBy.set(key, ticker);
      kept.push(row);
      continue;
    }
    if (first === ticker) {
      // The same ticker twice is a data question, not a share class: keep both rows as before.
      kept.push(row);
      continue;
    }
    const list = also.get(first) ?? [];
    if (!list.includes(ticker)) list.push(ticker);
    also.set(first, list);
  }
  return { rows: kept, also };
}

/** "also GOOG" / "also LEN.B and LEN.A", or null when a row stands for one class only. */
export function alsoClassesLabel(also: Map<string, string[]>, ticker: string | null | undefined): string | null {
  const list = also.get(String(ticker ?? "").trim().toUpperCase());
  if (!list || list.length === 0) return null;
  return `also ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`}`;
}
