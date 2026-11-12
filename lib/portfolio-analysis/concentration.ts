import { normalizeSectorName } from "@/lib/gics-sector";
import { shortCompanyName } from "@/lib/plain-copy";
import { companyKey } from "@/lib/share-class";
import type { FundDoc, Xray } from "@/lib/xray";

import { round } from "./stats";
import type { ConcentrationModule, OverlapCompany, OverlapModule, SectorShare, Weighted } from "./types";

/**
 * How the money sits, against the S&P 500.
 *
 * Two ways to count it. "As typed" takes each line the person entered, a fund being one line (sector "Funds").
 * "Look-through" opens the funds into their companies with lib/xray.ts, so QQQ's NVIDIA adds to NVDA bought
 * directly. The S&P 500's own largest name, top five and spread come from an S&P 500 fund's filing (SPY, else VOO,
 * else IVV); its sectors are the market-cap split of the S&P 500 rows in the screener.
 */

export const FUNDS_LABEL = "Funds";
export const UNCLASSIFIED = "Unclassified";

export type ConcentrationPosition = Weighted & { sector: string | null; fund: boolean };

/** 1 / Σw², weights as fractions that add to one. */
export function equalBets(weights: readonly number[]): number | null {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return null;
  const hhi = weights.reduce((sum, weight) => sum + (Math.max(0, weight) / total) ** 2, 0);
  return hhi > 0 ? 1 / hhi : null;
}

/** The index side, from an S&P 500 fund's filing: share classes folded into one company. */
export function benchmarkConcentration(doc: FundDoc | null | undefined, nameOf: Record<string, string | undefined> = {}): ConcentrationModule["sp"] {
  if (!doc || doc.status !== "ok" || doc.holdings.length < 5) return { largest: null, top5: null, equalBets: null, asOf: doc?.asOf ?? null };
  const folded = new Map<string, { ticker: string; name: string; weight: number; best: number }>();
  for (const holding of doc.holdings) {
    const ticker = String(holding.ticker ?? "").toUpperCase();
    if (!ticker || !(holding.weight > 0)) continue;
    const key = companyKey(ticker) || ticker;
    const row = folded.get(key);
    if (!row) folded.set(key, { ticker, name: holding.name, weight: holding.weight, best: holding.weight });
    else {
      row.weight += holding.weight;
      if (holding.weight > row.best) {
        row.best = holding.weight;
        row.ticker = ticker;
      }
    }
  }
  const rows = [...folded.values()].sort((a, b) => b.weight - a.weight);
  const top = rows[0];
  // Raw fractions of the fund: a filing trimmed to its top names still gives the right spread, since the tail's squares are tiny.
  const hhi = rows.reduce((sum, row) => sum + row.weight ** 2, 0);
  return {
    largest: top ? { ticker: top.ticker, name: shortCompanyName(nameOf[top.ticker] ?? top.name) || top.ticker, weight: round(top.weight * 100, 1) } : null,
    top5: round(rows.slice(0, 5).reduce((sum, row) => sum + row.weight, 0) * 100, 1),
    equalBets: hhi > 0 ? round(1 / hhi, 1) : null,
    asOf: doc.asOf,
  };
}

function sectorLabel(raw: string | null | undefined): string {
  if (!raw) return UNCLASSIFIED;
  return normalizeSectorName(raw) ?? raw;
}

function sectorRows(book: Map<string, number>, spSectors: Record<string, number | undefined>): SectorShare[] {
  const sp = new Map<string, number>();
  for (const [label, pct] of Object.entries(spSectors)) {
    if (typeof pct !== "number" || !Number.isFinite(pct)) continue;
    const key = sectorLabel(label);
    sp.set(key, (sp.get(key) ?? 0) + pct);
  }
  const labels = new Set([...book.keys(), ...sp.keys()]);
  return [...labels]
    .map((sector) => ({
      sector,
      pct: round(book.get(sector) ?? 0, 1),
      spPct: sector === FUNDS_LABEL || sector === UNCLASSIFIED ? null : sp.has(sector) ? round(sp.get(sector)!, 1) : sp.size > 0 ? 0 : null,
    }))
    .filter((row) => row.pct > 0 || (row.spPct ?? 0) >= 0.5)
    .sort((a, b) => b.pct - a.pct || (b.spPct ?? 0) - (a.spPct ?? 0));
}

export function buildConcentration(input: {
  positions: readonly ConcentrationPosition[];
  /** Funds opened into companies; pass null (or a book with no opened fund) for the lines as typed. */
  xray: Xray | null;
  benchmark: FundDoc | null;
  spSectors: Record<string, number | undefined>;
  nameOf?: Record<string, string | undefined>;
}): ConcentrationModule | null {
  const positions = input.positions.filter((position) => position.weight > 0);
  if (positions.length === 0) return null;
  const sp = benchmarkConcentration(input.benchmark, input.nameOf);
  const xray = input.xray;
  const opened = Boolean(xray && xray.total > 0 && xray.funds.some((fund) => fund.status === "ok"));

  if (xray && opened) {
    const companies = xray.companies.filter((row) => row.pct > 0);
    const top = companies[0];
    const book = new Map<string, number>();
    for (const sector of xray.sectors) book.set(sectorLabel(sector.sector), (book.get(sectorLabel(sector.sector)) ?? 0) + sector.pct);
    const unclassified = (xray.unclassifiedValue / xray.total) * 100;
    if (unclassified >= 0.05) book.set(UNCLASSIFIED, (book.get(UNCLASSIFIED) ?? 0) + unclassified);
    const unplacedPct = (xray.unplacedValue / xray.total) * 100;
    return {
      basis: "look-through",
      largest: top ? { ticker: top.ticker, name: top.name, weight: round(top.pct, 1) } : null,
      top5: round(companies.slice(0, 5).reduce((sum, row) => sum + row.pct, 0), 1),
      top5Tickers: companies.slice(0, 5).map((row) => row.ticker),
      equalBets: round(equalBets(companies.map((row) => row.pct)) ?? 0, 1),
      sp,
      sectors: sectorRows(book, input.spSectors),
      unplacedPct: round(unplacedPct, 1),
      coveragePct: round(100 - unplacedPct, 1),
      asOf: xray.asOfDates,
    };
  }

  const lines = [...positions].sort((a, b) => b.weight - a.weight);
  const total = lines.reduce((sum, line) => sum + line.weight, 0);
  // A fund line is a basket, not a company: next to the index's largest company or its sectors it would mislead
  // ("Largest VOO 60%" against NVIDIA's 7%), so a book with funds, counted as typed, gets no S&P comparison.
  const hasFunds = lines.some((line) => line.fund);
  const book = new Map<string, number>();
  for (const line of lines) {
    const label = line.fund ? FUNDS_LABEL : sectorLabel(line.sector);
    book.set(label, (book.get(label) ?? 0) + (line.weight / total) * 100);
  }
  const top = lines[0]!;
  return {
    basis: "as-typed",
    largest: { ticker: top.ticker, name: top.name, weight: round((top.weight / total) * 100, 1) },
    top5: round(lines.slice(0, 5).reduce((sum, line) => sum + (line.weight / total) * 100, 0), 1),
    top5Tickers: lines.slice(0, 5).map((line) => line.ticker),
    equalBets: round(equalBets(lines.map((line) => line.weight)) ?? 0, 1),
    sp: hasFunds ? { largest: null, top5: null, equalBets: null, asOf: null } : sp,
    sectors: sectorRows(book, hasFunds ? {} : input.spSectors),
    unplacedPct: 0,
    coveragePct: 100,
    asOf: [],
  };
}

/** Companies the funds add at least a point to, and how much each pair of funds repeats the other. */
export function buildOverlap(xray: Xray | null, minFundPct = 1): OverlapModule | null {
  if (!xray || xray.total <= 0) return null;
  const open = xray.funds.filter((fund) => fund.status === "ok");
  if (open.length === 0) return null;
  const companies: OverlapCompany[] = xray.companies
    .filter((row) => row.fundPct >= minFundPct)
    .map((row) => ({
      ticker: row.ticker,
      name: row.name,
      weight: round(row.pct, 1),
      directPct: round(row.directPct, 1),
      fundPct: round(row.fundPct, 1),
      via: row.via.map((slice) => slice.fund),
    }));
  let matrix: OverlapModule["matrix"] = null;
  if (open.length >= 2) {
    const funds = open.map((fund) => fund.ticker);
    const pairs = new Map(xray.overlaps.map((pair) => [`${pair.a}|${pair.b}`, pair.pct]));
    const pct = funds.map((a, i) =>
      funds.map((b, j) => (i === j ? 100 : round(pairs.get(`${a}|${b}`) ?? pairs.get(`${b}|${a}`) ?? 0, 1))),
    );
    matrix = { funds, pct };
  }
  if (companies.length === 0 && !matrix) return null;
  const closed = xray.funds.filter((fund) => fund.status !== "ok");
  return {
    companies,
    matrix,
    closed: closed.map((fund) => fund.ticker),
    closedPct: round((closed.reduce((sum, fund) => sum + fund.value, 0) / xray.total) * 100, 1),
    asOf: xray.asOfDates,
  };
}
