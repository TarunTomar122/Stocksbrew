import { covarianceMatrix, round, type Aligned } from "./stats";
import type { CorrelationModule, MoveGroup, Weighted } from "./types";

/**
 * Names that move as one: the correlation of daily returns over the same sessions as the swings, and the groups
 * they fall into. Groups are single-linkage at LINK (two names join when they correlate at LINK or more, and so does
 * anything linked to either), the same as connected pieces of that graph. A group is kept when it has three or more
 * names, or when it is a pair that moves very closely (PAIR) and holds a real share of the money (PAIR_WEIGHT).
 * A group is named by what its names share (all chip makers: "chip stocks"), never by a guessed theme.
 *
 * Daily moves of single stocks rarely correlate above 0.7 over a year, so LINK sits at 0.6: on a real book of ten
 * names that gives the chip makers (NVDA, TSM, AVGO, MRVL) as one group and leaves looser pairs out.
 */

export const LINK = 0.6;
export const PAIR = 0.85;
export const PAIR_WEIGHT = 15;
export const MAX_GROUPS = 4;
/** The steadiest name is picked among holdings of at least this share of the money, when there are any. */
const STEADY_MIN_WEIGHT = 2;

/** What a holding is, for naming a group: its industry and sector labels, and whether it is a fund. */
export type HoldingKind = { industry?: string | null; sector?: string | null; fund?: boolean };

/** Industry words, tried in order on the lowercase industry label. */
const INDUSTRY_NOUNS: Array<[RegExp, string]> = [
  [/semiconductor/, "chip"],
  [/software/, "software"],
  [/bank/, "bank"],
  [/insurance|reinsurance/, "insurance"],
  [/biotech|pharma|drug/, "drug"],
  [/utilit|electricity/, "utility"],
  [/oil|gas|coal|uranium|energy/, "energy"],
  [/reit|real estate/, "property"],
  [/aerospace|defense/, "defense"],
  [/internet|interactive media/, "internet"],
  [/gold|silver|precious/, "gold"],
  [/retail/, "retail"],
];

const SECTOR_NOUNS: Record<string, string> = {
  technology: "tech",
  "information technology": "tech",
  "health care": "health care",
  healthcare: "health care",
  financials: "finance",
  energy: "energy",
  "communication services": "media",
  "consumer discretionary": "consumer",
  "consumer staples": "staples",
  industrials: "industrial",
  materials: "materials",
  utilities: "utility",
  "real estate": "property",
};

/** "chip stocks", "funds", "tech stocks", else "stocks" (all stocks) or "holdings" (funds and stocks). */
export function groupNoun(kinds: ReadonlyArray<HoldingKind | undefined>): string {
  if (kinds.length > 0 && kinds.every((kind) => kind?.fund)) return "funds";
  if (kinds.some((kind) => kind?.fund)) return "holdings";
  const word = (kind: HoldingKind | undefined) => {
    const industry = (kind?.industry ?? "").toLowerCase();
    return INDUSTRY_NOUNS.find(([pattern]) => pattern.test(industry))?.[1] ?? null;
  };
  const industries = kinds.map(word);
  if (industries[0] && industries.every((value) => value === industries[0])) return `${industries[0]} stocks`;
  const sectors = kinds.map((kind) => SECTOR_NOUNS[(kind?.sector ?? "").toLowerCase()] ?? null);
  if (sectors[0] && sectors.every((value) => value === sectors[0])) return `${sectors[0]} stocks`;
  return "stocks";
}

/**
 * The holding that moves least with the rest: each name's average correlation with the others, weighted by their
 * money. Picked among the holdings worth a few percent, so a 0.3% position does not win by being tiny.
 */
export function steadiestIndex(matrix: readonly (readonly number[])[], weights: readonly number[]): { index: number; together: number } | null {
  const n = matrix.length;
  if (n < 3) return null;
  const scores = matrix.map((row, i) => {
    let sum = 0;
    let weight = 0;
    row.forEach((value, j) => {
      if (j === i) return;
      const w = Math.max(0, weights[j] ?? 0) || 1e-9;
      sum += value * w;
      weight += w;
    });
    return { index: i, together: weight > 0 ? sum / weight : 0 };
  });
  const big = scores.filter((score) => (weights[score.index] ?? 0) >= STEADY_MIN_WEIGHT);
  const pool = big.length >= 1 ? big : scores;
  return pool.reduce((best, score) => (score.together < best.together - 1e-9 || (Math.abs(score.together - best.together) <= 1e-9 && (weights[score.index] ?? 0) > (weights[best.index] ?? 0)) ? score : best));
}

/** The two names that move most alike. */
export function closestPair(matrix: readonly (readonly number[])[]): { a: number; b: number; together: number } | null {
  let best: { a: number; b: number; together: number } | null = null;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      const value = matrix[i]![j]!;
      if (Number.isFinite(value) && (!best || value > best.together)) best = { a: i, b: j, together: value };
    }
  }
  return best;
}
/** The heatmap shows at most this many names, biggest first, so it stays readable. */
export const MAX_NAMES = 15;
const MIN_COVERAGE = 50;

export function correlationMatrix(columns: readonly (readonly number[])[]): number[][] {
  const cov = covarianceMatrix(columns);
  return cov.map((row, i) =>
    row.map((value, j) => {
      if (i === j) return 1;
      const scale = Math.sqrt(cov[i]![i]! * cov[j]![j]!);
      return scale > 0 ? Math.max(-1, Math.min(1, value / scale)) : 0;
    }),
  );
}

/** Connected pieces of the graph whose edges are pairs at `link` or more. */
export function linkGroups(matrix: readonly (readonly number[])[], link = LINK): number[][] {
  const n = matrix.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (matrix[i]![j]! >= link) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  }
  return [...groups.values()];
}

/** Average-linkage merge order: the leaves of the tree, so names that move together sit side by side. */
export function clusterOrder(matrix: readonly (readonly number[])[]): number[] {
  let clusters = matrix.map((_, i) => [i]);
  const between = (a: number[], b: number[]) => {
    let sum = 0;
    for (const i of a) for (const j of b) sum += matrix[i]![j]!;
    return sum / (a.length * b.length);
  };
  while (clusters.length > 1) {
    let best = { score: -Infinity, a: 0, b: 1 };
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const score = between(clusters[a]!, clusters[b]!);
        if (score > best.score) best = { score, a, b };
      }
    }
    const merged = [...clusters[best.a]!, ...clusters[best.b]!];
    clusters = clusters.filter((_, index) => index !== best.a && index !== best.b);
    clusters.push(merged);
  }
  return clusters[0] ?? [];
}

export function buildCorrelation(holdings: readonly Weighted[], aligned: Aligned | null, kinds: Record<string, HoldingKind | undefined> = {}): CorrelationModule | null {
  if (!aligned) return null;
  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  const covered = holdings.filter((holding) => aligned.byTicker[holding.ticker] && holding.weight > 0).sort((a, b) => b.weight - a.weight);
  const coveredWeight = covered.reduce((sum, holding) => sum + holding.weight, 0);
  if (covered.length < 2 || total <= 0 || (coveredWeight / total) * 100 < MIN_COVERAGE) return null;

  const full = correlationMatrix(covered.map((holding) => aligned.byTicker[holding.ticker]!));
  const groups: MoveGroup[] = linkGroups(full)
    .map((members): MoveGroup | null => {
      const weight = members.reduce((sum, i) => sum + (covered[i]!.weight / total) * 100, 0);
      let pairs = 0;
      let sum = 0;
      for (const i of members) {
        for (const j of members) {
          if (j <= i) continue;
          pairs += 1;
          sum += full[i]![j]!;
        }
      }
      const together = pairs > 0 ? sum / pairs : 1;
      const keep = members.length >= 3 || (members.length === 2 && full[members[0]!]![members[1]!]! >= PAIR && weight >= PAIR_WEIGHT);
      if (!keep) return null;
      const tickers = [...members].sort((a, b) => covered[b]!.weight - covered[a]!.weight).map((i) => covered[i]!.ticker);
      return {
        tickers,
        noun: groupNoun(tickers.map((ticker) => kinds[ticker])),
        weight: round(weight, 1),
        together: round(together, 2),
      };
    })
    .filter((group): group is MoveGroup => group !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_GROUPS);

  const share = covered.map((holding) => (holding.weight / total) * 100);
  const steady = steadiestIndex(full, share);
  const pair = closestPair(full);
  const ref = (i: number) => ({ ticker: covered[i]!.ticker, name: covered[i]!.name });

  const shown = covered.slice(0, MAX_NAMES);
  const sub = shown.map((_, i) => shown.map((__, j) => full[i]![j]!));
  const order = clusterOrder(sub);
  return {
    sessions: aligned.dates.length,
    from: aligned.start,
    to: aligned.dates[aligned.dates.length - 1]!,
    coveragePct: round((coveredWeight / total) * 100, 1),
    order: order.map((i) => ({ ticker: shown[i]!.ticker, name: shown[i]!.name })),
    matrix: order.map((i) => order.map((j) => (i === j ? 1 : round(sub[i]![j]!, 2)))),
    groups,
    steadiest: steady ? { ...ref(steady.index), together: round(steady.together, 2) } : null,
    closest: pair ? { a: ref(pair.a), b: ref(pair.b), together: round(pair.together, 2) } : null,
  };
}
