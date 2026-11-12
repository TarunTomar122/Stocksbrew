/**
 * Cluster buys worked out from the stored buys: three or more different insiders buying the same stock within 30
 * days, the same rule as backend/agentdata/insiders_form4.py `detect_clusters`. The job only counts the filings of
 * its own run (seven days), so a cluster spread over two runs was missed and /insiders said "Cluster buys 0" beside
 * three insiders buying LKQ. Pure, so it can be tested.
 */

import type { InsiderCluster, InsiderTrade } from "@/lib/follow-shared";

export const CLUSTER_WINDOW_DAYS = 30;
export const CLUSTER_MIN_INSIDERS = 3;

const DAY_MS = 86_400_000;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Each stock's window with the most distinct buyers (ties to the newest), when it has at least three; newest first. */
export function clustersFromBuys(
  trades: ReadonlyArray<InsiderTrade>,
  today: string,
  options: { windowDays?: number; minInsiders?: number } = {},
): InsiderCluster[] {
  const windowDays = options.windowDays ?? CLUSTER_WINDOW_DAYS;
  const minInsiders = options.minInsiders ?? CLUSTER_MIN_INSIDERS;
  // Only clusters still inside the window today: an old one is not news.
  const oldest = addDays(today, -windowDays);
  const bySymbol = new Map<string, InsiderTrade[]>();
  for (const trade of trades) {
    if (trade.tx_type !== "buy" || !trade.symbol || !trade.transaction_date || trade.transaction_date < oldest || trade.transaction_date > today) continue;
    const list = bySymbol.get(trade.symbol) ?? [];
    list.push(trade);
    bySymbol.set(trade.symbol, list);
  }
  const out: InsiderCluster[] = [];
  for (const [symbol, buys] of bySymbol) {
    buys.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    let best: InsiderTrade[] = [];
    let bestPeople = 0;
    buys.forEach((first, start) => {
      const limit = addDays(first.transaction_date, windowDays);
      const window = buys.slice(start).filter((item) => item.transaction_date <= limit);
      const people = new Set(window.map((item) => item.insider_id || item.insider)).size;
      if (people >= bestPeople) {
        best = window;
        bestPeople = people;
      }
    });
    if (bestPeople < minInsiders) continue;
    const people = new Map<string, { insider: string; role: string; value: number; shares: number; priced: boolean }>();
    for (const item of best) {
      const key = item.insider_id || item.insider;
      const entry = people.get(key) ?? { insider: item.insider, role: item.role, value: 0, shares: 0, priced: false };
      entry.shares += item.shares || 0;
      if (item.value != null) {
        entry.value += item.value;
        entry.priced = true;
      }
      people.set(key, entry);
    }
    const members = [...people.values()]
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({ insider: entry.insider, role: entry.role, value: entry.priced ? Math.round(entry.value * 100) / 100 : null, shares: round4(entry.shares) }));
    const values = members.map((member) => member.value).filter((value): value is number => value !== null);
    out.push({
      symbol,
      company: best[best.length - 1]!.company || "",
      insiders: bestPeople,
      filings: best.length,
      first_date: best[0]!.transaction_date,
      last_date: best[best.length - 1]!.transaction_date,
      last_filed_at: best.map((item) => item.filed_at || "").sort().pop() ?? "",
      total_value: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100 : null,
      total_shares: round4(best.reduce((sum, item) => sum + (item.shares || 0), 0)),
      members: members.slice(0, 8),
      window_days: windowDays,
    });
  }
  return out.sort((a, b) => b.last_date.localeCompare(a.last_date) || b.insiders - a.insiders);
}

/**
 * The stored clusters and the ones worked out here, one per stock: the one with more insiders, the one worked out
 * here on a tie (it reads every stored buy, not one run's). Newest first.
 */
export function mergeClusters(stored: ReadonlyArray<InsiderCluster>, computed: ReadonlyArray<InsiderCluster>): InsiderCluster[] {
  const bySymbol = new Map<string, InsiderCluster>();
  for (const cluster of stored) bySymbol.set(cluster.symbol, cluster);
  for (const cluster of computed) {
    const held = bySymbol.get(cluster.symbol);
    if (!held || cluster.insiders >= held.insiders) bySymbol.set(cluster.symbol, cluster);
  }
  return [...bySymbol.values()].sort((a, b) => b.last_date.localeCompare(a.last_date) || b.insiders - a.insiders);
}
