import type { Xray } from "@/lib/xray";

import { saleTax } from "./tax";
import type { AddIdea, IdeaHolding, IdeasSubject, RebalancePlan, SectorShift, TaxRates, TrimIdea, TrimKind } from "./types";
import { fmtPct, portfolioWord, sharesWord, usd } from "./words";

/**
 * "Trim this, add that": plain rules over the x-ray (lib/xray.ts, funds
 * counted) and the person's own lots. Written down before they were tried:
 *
 * - A company above COMPANY_LINE percent of the portfolio, once funds are
 *   counted, is concentrated. The idea sells enough of the stock bought
 *   directly to bring it back to the line.
 * - A holding that has grown to DRIFT_RATIO times its share of the money put
 *   in, and at least DRIFT_POINTS points more, has drifted. The idea sells it
 *   back to its starting share. Not for a stock our call says to buy more of.
 * - A sector more than SECTOR_GAP points above its S&P 500 weight is tilted.
 *   After the trims above, more is sold from that sector's stocks (Sell some
 *   first, then Keep, never Buy more) to bring it to SECTOR_TARGET points over.
 * - No idea sells more than MAX_SELL of a holding, and funds are never
 *   trimmed: they are already spread out. Only the MAX_COMPANIES biggest
 *   companies over the line get an idea; the rest are named.
 * - The money raised goes, on paper, to holdings our call says to buy more
 *   of, in sectors that are not tilted, without taking any company above
 *   ADD_CEILING, and never to a stock listed as a loss to sell (buying it
 *   would be a wash sale). Whatever is left is said plainly.
 *
 * Doing nothing is an answer: when no rule fires, `quiet` says why.
 */

export const COMPANY_LINE = 10;
export const SECTOR_GAP = 15;
export const SECTOR_TARGET = 10;
export const DRIFT_RATIO = 1.5;
export const DRIFT_POINTS = 5;
export const MAX_SELL = 0.5;
export const ADD_CEILING = 8;
export const MAX_COMPANIES = 3;
/** A result this close to the line counts as reaching it (whole shares rarely land exactly). */
const SLACK = 0.5;
/** A cheaper-lots alternative is worth showing only when it saves at least this much tax. */
const CHEAPER_MIN = 25;

const CALL_ORDER: Record<string, number> = { Trim: 0, Hold: 1, none: 2 };

type Working = IdeaHolding & { left: number; sold: number };

function fin(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildRebalance(input: {
  holdings: readonly IdeaHolding[];
  xray: Xray;
  rates: TaxRates;
  today: string;
  subject: IdeasSubject;
  /** Tickers that must not get an add idea: the ones listed as losses to sell. */
  avoidAdds?: ReadonlySet<string>;
}): RebalancePlan {
  const { xray, rates, today, subject } = input;
  const total = xray.total;
  const where = portfolioWord(subject);
  const empty: RebalancePlan = { total, trims: [], adds: [], proceeds: 0, leftover: 0, taxTotal: null, sectors: [], fundOnly: [], unsized: [], moreOver: [], quiet: null };
  if (!(total > 0)) return empty;

  const pct = (value: number) => (value / total) * 100;
  const working: Working[] = input.holdings.map((holding) => ({ ...holding, left: holding.shares ?? 0, sold: 0 }));
  const tradable = (holding: Working) => !holding.fund && fin(holding.price) && holding.price > 0 && holding.left >= 2;

  // Running values: company money (funds included) and sector money, by key.
  const companyValue = new Map(xray.companies.map((row) => [row.key, row.total]));
  const companyOf = (ticker: string) => xray.companies.find((row) => row.classes.includes(ticker)) ?? null;
  const sectorValue = new Map(xray.sectors.map((row) => [row.sector, row.value]));
  const sectorOf = (holding: Working) => companyOf(holding.ticker)?.sector ?? holding.sector;

  const trims: TrimIdea[] = [];
  const fundOnly: RebalancePlan["fundOnly"] = [];
  const unsized: RebalancePlan["unsized"] = [];
  const moreOver: RebalancePlan["moreOver"] = [];

  const sell = (
    holding: Working,
    kind: TrimKind,
    wanted: number,
    subjectName: string,
    subjectBefore: number,
    target: number,
    why: string,
    viaFunds = 0,
    label = holding.name,
  ): TrimIdea | null => {
    const price = holding.price as number;
    const cap = Math.floor((holding.shares ?? 0) * MAX_SELL) - holding.sold;
    const shares = Math.min(Math.max(0, Math.ceil(wanted / price - 1e-9)), cap, Math.floor(holding.left));
    if (shares <= 0) return null;
    const amount = shares * price;
    holding.left -= shares;
    holding.sold += shares;
    const company = companyOf(holding.ticker);
    if (company) companyValue.set(company.key, (companyValue.get(company.key) ?? 0) - amount);
    const sector = sectorOf(holding);
    if (sector && sectorValue.has(sector)) sectorValue.set(sector, (sectorValue.get(sector) ?? 0) - amount);

    const after = Math.max(0, subjectBefore - pct(amount));
    const reached = after <= target + SLACK;
    const tax = saleTax(holding.lots, shares, price, today, rates, "fifo");
    const highest = holding.lots.length > 1 ? saleTax(holding.lots, shares, price, today, rates, "highest") : null;
    const cheaper = tax && highest && tax.tax - highest.tax >= CHEAPER_MIN ? highest : null;
    // Capped at half the holding and still short of the line: say so rather than suggest selling it all.
    const halfNote = shares >= cap && !reached ? (label === holding.name ? ", half the holding," : `, half the ${holding.ticker} shares,`) : "";
    const sentence = `Selling about ${shares} ${label} ${sharesWord(shares)}${halfNote} would bring ${kind === "sector" ? subjectName : "it"} from ${fmtPct(subjectBefore)} to ${fmtPct(after)} of ${where}.`;
    return {
      id: `${kind}-${holding.ticker}`,
      kind,
      ticker: holding.ticker,
      name: label,
      call: holding.call,
      callReason: holding.callReason,
      shares,
      amount,
      ofHolding: holding.shares ? (shares / holding.shares) * 100 : 0,
      subject: subjectName,
      before: subjectBefore,
      after,
      target,
      reached,
      viaFunds,
      sentence,
      why,
      tax,
      cheaper,
    };
  };

  /* 1. One company over the line, funds counted. Every share class held directly can be sold. */
  let companiesTrimmed = 0;
  for (const company of xray.companies) {
    if (company.pct <= COMPANY_LINE) continue;
    const entry = { ticker: company.ticker, name: company.name, pct: company.pct };
    const classes = working.filter((row) => company.classes.includes(row.ticker) && tradable(row)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    if (classes.length === 0) {
      (company.direct > 0 ? unsized : fundOnly).push(entry);
      continue;
    }
    if (companiesTrimmed >= MAX_COMPANIES) {
      moreOver.push(entry);
      continue;
    }
    companiesTrimmed += 1;
    const fundsPart = company.fundPct >= 0.5 ? `, ${fmtPct(company.fundPct)} of it through funds` : "";
    const why = `${company.name} is ${fmtPct(company.pct)} of ${where} once the funds are counted${fundsPart}, above the ${COMPANY_LINE}% line we use for one company.`;
    for (const holding of classes) {
      const before = pct(companyValue.get(company.key) ?? company.total);
      if (before <= COMPANY_LINE + SLACK) break;
      const wanted = ((before - COMPANY_LINE) / 100) * total;
      const label = classes.length > 1 ? `${company.name} (${holding.ticker})` : holding.name;
      const idea = sell(holding, "company", wanted, company.name, before, COMPANY_LINE, why, company.fundPct, label);
      if (idea) trims.push(idea);
    }
  }

  /* 2. Drift: grown well past its share of the money put in. */
  const costed = working.filter((row) => row.lots.length > 0 && fin(row.value) && row.value > 0);
  const costOf = (row: Working) => row.lots.reduce((sum, lot) => sum + lot.shares * lot.costPerShare, 0);
  const costTotal = costed.reduce((sum, row) => sum + costOf(row), 0);
  const valueTotal = costed.reduce((sum, row) => sum + (row.value as number), 0);
  if (costed.length >= 3 && costTotal > 0 && valueTotal > 0) {
    for (const holding of costed) {
      if (holding.sold > 0 || holding.call === "Add" || !tradable(holding)) continue;
      const then = (costOf(holding) / costTotal) * 100;
      const now = ((holding.value as number) / valueTotal) * 100;
      if (now - then < DRIFT_POINTS || now < then * DRIFT_RATIO) continue;
      const wanted = ((now - then) / 100) * valueTotal;
      const before = pct(holding.value as number);
      const target = Math.max(0, before - pct(wanted));
      const why = `${holding.name} was ${fmtPct(then)} of the money put in and is ${fmtPct(now)} of the value now, after it outgrew the rest.`;
      const idea = sell(holding, "drift", wanted, holding.name, before, target, why);
      if (idea) trims.push(idea);
    }
  }

  /* 3. A sector far above the S&P 500, after the trims above. */
  const sectors: SectorShift[] = [];
  for (const row of xray.sectors) {
    if (!fin(row.benchmarkPct) || row.pct - row.benchmarkPct < SECTOR_GAP) continue;
    const target = row.benchmarkPct + SECTOR_TARGET;
    let now = pct(sectorValue.get(row.sector) ?? row.value);
    const candidates = working
      .filter((holding) => tradable(holding) && holding.sold === 0 && holding.call !== "Add" && sectorOf(holding) === row.sector)
      .sort((a, b) => CALL_ORDER[a.call ?? "none"]! - CALL_ORDER[b.call ?? "none"]! || (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 2);
    for (const holding of candidates) {
      if (now <= target + SLACK) break;
      const wanted = ((now - target) / 100) * total;
      const why = `${row.sector} is ${fmtPct(row.pct)} of ${where} against ${fmtPct(row.benchmarkPct)} of the S&P 500, more than ${SECTOR_GAP} points over.`;
      const idea = sell(holding, "sector", wanted, row.sector, now, target, why);
      if (!idea) continue;
      trims.push(idea);
      now = idea.after;
    }
    const after = pct(sectorValue.get(row.sector) ?? row.value);
    // Only a sector the trims actually move is reported; one they leave alone is the quiet line's job.
    if (after >= row.pct - SLACK) continue;
    const fundShare = row.value > 0 ? row.viaFunds / row.value : 0;
    const shortBy =
      after <= target + SLACK
        ? null
        : fundShare >= 0.3
          ? `${Math.round(fundShare * 100)}% of it sits in funds, which these ideas never sell.`
          : "The rest is in stocks our call says to buy more of, or in holdings already cut by half.";
    sectors.push({ sector: row.sector, before: row.pct, after, benchmark: row.benchmarkPct, target, shortBy });
  }

  /* 4. Where the money could go: Buy more calls, untilted sectors, under the ceiling. */
  const proceeds = trims.reduce((sum, trim) => sum + trim.amount, 0);
  const adds: AddIdea[] = [];
  if (proceeds > 0) {
    const tilt = (sector: string | null) => {
      if (!sector) return 0;
      const bench = xray.sectors.find((row) => row.sector === sector)?.benchmarkPct;
      return fin(bench) ? pct(sectorValue.get(sector) ?? 0) - bench : 0;
    };
    const candidates = working
      .filter((holding) => !holding.fund && holding.call === "Add" && holding.sold === 0 && !input.avoidAdds?.has(holding.ticker) && fin(holding.price) && holding.price > 0)
      .map((holding) => {
        const company = companyOf(holding.ticker);
        const now = pct(company ? companyValue.get(company.key) ?? company.total : holding.value ?? 0);
        return { holding, now, sector: sectorOf(holding), room: ((ADD_CEILING - now) / 100) * total };
      })
      .filter((row) => row.room >= (row.holding.price as number) && tilt(row.sector) < SECTOR_GAP / 3)
      .sort((a, b) => tilt(a.sector) - tilt(b.sector) || a.now - b.now)
      .slice(0, 2);
    let left = proceeds;
    candidates.forEach((row, index) => {
      const share = left / (candidates.length - index);
      const price = row.holding.price as number;
      const shares = Math.floor(Math.min(share, row.room) / price);
      if (shares < 1) return;
      const amount = shares * price;
      left -= amount;
      const after = row.now + pct(amount);
      adds.push({
        id: `add-${row.holding.ticker}`,
        ticker: row.holding.ticker,
        name: row.holding.name,
        call: row.holding.call,
        callReason: row.holding.callReason,
        shares,
        amount,
        before: row.now,
        after,
        sector: row.sector,
        sentence: `Putting about ${usd(amount)} into ${row.holding.name} (${shares} ${sharesWord(shares)}) would take it from ${fmtPct(row.now)} to ${fmtPct(after)} of ${where}.`,
      });
    });
  }
  const placed = adds.reduce((sum, add) => sum + add.amount, 0);
  const taxTotal = trims.length > 0 && trims.every((trim) => trim.tax && trim.tax.unmatchedShares === 0) ? trims.reduce((sum, trim) => sum + (trim.tax?.tax ?? 0), 0) : null;

  let quiet: string | null = null;
  if (trims.length === 0) {
    const top = xray.companies[0];
    const tilted = xray.sectors.find((row) => fin(row.benchmarkPct) && row.pct - row.benchmarkPct >= SECTOR_GAP);
    if (unsized.length > 0) {
      const first = unsized[0]!;
      quiet = `${first.name} is ${fmtPct(first.pct)} of ${where}, above the ${COMPANY_LINE}% line, but there is no share count and price to size a trim from.`;
    } else if (fundOnly.length > 0) {
      quiet = `${fundOnly[0]!.name} is ${fmtPct(fundOnly[0]!.pct)} of ${where} only through funds, so there is no single stock to trim; otherwise nothing is out of line.`;
    } else if (tilted) {
      quiet = `${tilted.sector} is ${fmtPct(tilted.pct)} of ${where}, well above the S&P 500's ${fmtPct(tilted.benchmarkPct as number)}, but none of its stocks is one we would trim (they are funds, small holdings or ones our call says to buy more of).`;
    } else {
      quiet = `No company is above ${COMPANY_LINE}% of ${where} once the funds are counted${top ? ` (the biggest, ${top.name}, is ${fmtPct(top.pct)})` : ""}, and no sector is more than ${SECTOR_GAP} points above the S&P 500, so leaving it as it is is a fine answer.`;
    }
  }

  return { total, trims, adds, proceeds, leftover: Math.max(0, proceeds - placed), taxTotal, sectors, fundOnly, unsized, moreOver, quiet };
}
