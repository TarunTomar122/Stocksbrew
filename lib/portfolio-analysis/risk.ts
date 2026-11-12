import { compound, covariance, covarianceMatrix, largestDrop, round, yearlySwing, type Aligned } from "./stats";
import type { RiskModule, SwingShare, Weighted } from "./types";

/**
 * Share of the swings: today's mix walked back over the last year, rebalanced to today's weights every day.
 *
 * - "Moves 1.3% when the S&P moves 1%": the mix's daily returns regressed on the S&P 500's (SPY's) over the same
 *   sessions. Our own window, not the screener's beta, so the figure matches the chart beside it.
 * - The yearly up-and-down is the annualised standard deviation of those daily returns.
 * - The largest drop is peak to trough on the compounded mix, and on SPY over the same sessions.
 * - Each holding's share of the swings is w_i (Σw)_i / wᵀΣw on the sample covariance of daily returns: it sums to
 *   100, and a holding that moves against the rest can be negative.
 *
 * Held back below MIN_COVERAGE of the money with prices (funds count whole, with their own returns).
 */

export const MIN_COVERAGE = 80;

export function buildRisk(holdings: readonly Weighted[], aligned: Aligned | null): RiskModule | null {
  if (!aligned) return null;
  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (total <= 0) return null;
  const covered = holdings.filter((holding) => aligned.byTicker[holding.ticker] && holding.weight > 0);
  const coveredWeight = covered.reduce((sum, holding) => sum + holding.weight, 0);
  const coveragePct = (coveredWeight / total) * 100;
  if (covered.length === 0 || coveragePct < MIN_COVERAGE) return null;

  const w = covered.map((holding) => holding.weight / coveredWeight);
  const columns = covered.map((holding) => aligned.byTicker[holding.ticker]!);
  const n = aligned.dates.length;
  const book = Array.from({ length: n }, (_, t) => columns.reduce((sum, column, i) => sum + w[i]! * column[t]!, 0));

  const sigma = covarianceMatrix(columns);
  const sigmaW = sigma.map((row) => row.reduce((sum, value, j) => sum + value * w[j]!, 0));
  const variance = w.reduce((sum, weight, i) => sum + weight * sigmaW[i]!, 0);
  if (!(variance > 0)) return null;
  const shares: SwingShare[] = covered
    .map((holding, i) => ({
      ticker: holding.ticker,
      name: holding.name,
      weight: round(w[i]! * 100, 2),
      share: round(((w[i]! * sigmaW[i]!) / variance) * 100, 2),
    }))
    .sort((a, b) => b.share - a.share || b.weight - a.weight);

  const benchVariance = covariance(aligned.bench, aligned.bench);
  const sensitivity = benchVariance > 0 ? covariance(book, aligned.bench) / benchVariance : null;
  if (sensitivity === null) return null;

  const pathDates = [aligned.start, ...aligned.dates];
  const bookIndex = compound(book);
  const spIndex = compound(aligned.bench);
  const drop = largestDrop(bookIndex, pathDates);
  const spDrop = largestDrop(spIndex, pathDates);

  return {
    sessions: n,
    from: aligned.start,
    to: aligned.dates[n - 1]!,
    coveragePct: round(coveragePct, 1),
    excluded: holdings.filter((holding) => !aligned.byTicker[holding.ticker]).map((holding) => holding.ticker),
    sensitivity: round(sensitivity, 2),
    swing: round(yearlySwing(book), 1),
    spSwing: round(yearlySwing(aligned.bench), 1),
    worstDrop: { ...drop, pct: round(drop.pct, 1) },
    spWorstDrop: { ...spDrop, pct: round(spDrop.pct, 1) },
    path: { dates: pathDates, book: bookIndex.map((value) => round(value, 2)), sp: spIndex.map((value) => round(value, 2)) },
    shares,
  };
}
