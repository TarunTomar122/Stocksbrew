/**
 * Following a plain-English basket: the members and their prices are frozen
 * on the person's own user doc the day they follow, so the basket can be
 * tracked from that day against the S&P 500. Pure: no I/O.
 */

import { isFiniteNumber, type ScreenerRow } from "@/lib/screener-shared";

import { SLUG_PATTERN } from "./spec";

export const FOLLOWED_FIELD = "followed_baskets";
/** A technical ceiling on one account's list, above any plan limit. */
export const MAX_FOLLOWED_BASKETS = 40;

export type FollowedBasket = {
  slug: string;
  title: string;
  followed_at: string;
  members: Array<{ symbol: string; price: number }>;
  /** SPY's price the day it was followed. */
  benchmark_price: number | null;
};

export function readFollowedBaskets(userData: unknown): FollowedBasket[] {
  const raw = userData && typeof userData === "object" ? (userData as Record<string, unknown>)[FOLLOWED_FIELD] : null;
  if (!Array.isArray(raw)) return [];
  const out: FollowedBasket[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.slug !== "string" || !SLUG_PATTERN.test(entry.slug) || typeof entry.followed_at !== "string") continue;
    const members = Array.isArray(entry.members)
      ? entry.members
          .filter((member): member is { symbol: string; price: number } => {
            const value = member as Record<string, unknown> | null;
            return Boolean(value) && typeof value!.symbol === "string" && isFiniteNumber(value!.price) && (value!.price as number) > 0;
          })
          .map((member) => ({ symbol: member.symbol, price: member.price }))
      : [];
    out.push({
      slug: entry.slug,
      title: typeof entry.title === "string" ? entry.title : "Basket",
      followed_at: entry.followed_at,
      members,
      benchmark_price: isFiniteNumber(entry.benchmark_price) && entry.benchmark_price > 0 ? entry.benchmark_price : null,
    });
  }
  return out;
}

/** The entry to store when following: members with a price today, frozen. */
export function followEntry(input: { slug: string; title: string; rows: ScreenerRow[]; benchmark: ScreenerRow | null; now: Date }): FollowedBasket {
  return {
    slug: input.slug,
    title: input.title,
    followed_at: input.now.toISOString(),
    members: input.rows.filter((row) => isFiniteNumber(row.price) && row.price > 0).map((row) => ({ symbol: row.symbol, price: row.price as number })),
    benchmark_price: input.benchmark && isFiniteNumber(input.benchmark.price) && input.benchmark.price > 0 ? input.benchmark.price : null,
  };
}

/** Add or remove one basket. Returns "limit" when adding would pass the plan's count. Following again keeps the first date. */
export function nextFollowed(current: FollowedBasket[], entry: FollowedBasket, follow: boolean, limit: number): FollowedBasket[] | "limit" {
  const without = current.filter((item) => item.slug !== entry.slug);
  if (!follow) return without;
  if (current.some((item) => item.slug === entry.slug)) return current;
  // Never drop an older follow to make room, on any plan.
  if (without.length >= Math.min(limit, MAX_FOLLOWED_BASKETS)) return "limit";
  return [...without, entry];
}

export type SinceFollow = {
  /** Equal-amount price change since the follow day, in percent. Dividends not counted. */
  pct: number | null;
  benchmarkPct: number | null;
  priced: number;
  total: number;
};

export function sinceFollow(entry: FollowedBasket, rows: ReadonlyMap<string, ScreenerRow>, benchmark: ScreenerRow | null): SinceFollow {
  const changes: number[] = [];
  for (const member of entry.members) {
    const now = rows.get(member.symbol)?.price;
    if (isFiniteNumber(now) && now > 0) changes.push((now / member.price - 1) * 100);
  }
  const benchNow = benchmark?.price;
  return {
    pct: changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null,
    benchmarkPct: entry.benchmark_price && isFiniteNumber(benchNow) && benchNow > 0 ? (benchNow / entry.benchmark_price - 1) * 100 : null,
    priced: changes.length,
    total: entry.members.length,
  };
}
