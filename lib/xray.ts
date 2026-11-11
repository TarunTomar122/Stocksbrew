/**
 * What you really own: a portfolio with its funds opened up.
 *
 * Someone holds QQQ, VOO and NVDA. NVDA is one line in their list, but QQQ and
 * VOO each hold NVIDIA too, so their real stake in the company is the direct
 * shares plus the fund money that sits in it. This module does that sum from
 * the funds' own SEC filings (`tm_etf_holdings`, written by
 * `backend/agentdata/etf_holdings.py`), folds share classes into one company
 * (GOOGL with GOOG), groups by sector and measures how much two funds repeat
 * each other. Pure: the loader in `lib/xray-data.ts` passes the documents in.
 *
 * Every number is a share of the money we can value (shares times price, or a
 * value the person entered). Fund holdings are a quarter-end snapshot, so each
 * fund carries the as-of date of the filing it came from.
 */

import { normalizeSectorName } from "@/lib/gics-sector";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { shortCompanyName } from "@/lib/plain-copy";
import { companyKey } from "@/lib/share-class";

export type FundHolding = { ticker: string | null; name: string; weight: number };

export type FundStatus = "ok" | "derivatives" | "not_stocks";

export type FundDoc = {
  ticker: string;
  fundName: string;
  /** Report date of the N-PORT filing the holdings come from. */
  asOf: string | null;
  filedAt: string | null;
  sourceUrl: string | null;
  status: FundStatus;
  /** Why a fund is not broken down, in a sentence, when it is not. */
  note: string | null;
  /** Heaviest first; weights are fractions of the fund's net assets. May be trimmed to the top names. */
  holdings: FundHolding[];
};

export type XrayPositionInput = {
  ticker: string;
  name: string;
  /** Dollars: shares times price, or a value the person entered. Null when we cannot value it. */
  value: number | null;
  /** Our record calls it a fund (ETF, Trust, Fund), so a missing holdings document means "not read yet", not "a stock". */
  looksLikeFund?: boolean;
};

export type XrayContext = {
  funds: Record<string, FundDoc | undefined>;
  /** Sector label per ticker, any spelling `normalizeSectorName` understands. */
  sectorOf?: Record<string, string | undefined>;
  /** Display names per ticker (better than the filing's), used when present. */
  nameOf?: Record<string, string | undefined>;
  /** S&P 500 sector weights in percent, for the sector comparison. */
  benchmarkSectors?: Record<string, number | undefined>;
  /** An S&P 500 fund's document (SPY, VOO or IVV), for the "ten biggest" comparison. */
  benchmark?: FundDoc | null;
};

export type FundSlice = { fund: string; value: number };

export type CompanyExposure = {
  key: string;
  /** The ticker shown: the one held directly, else the class the funds hold most of. */
  ticker: string;
  /** Every class counted in this row, the shown one first. */
  classes: string[];
  name: string;
  sector: string | null;
  direct: number;
  viaFunds: number;
  total: number;
  /** Shares of the valued portfolio, in percent. */
  pct: number;
  directPct: number;
  fundPct: number;
  /** Fund money in this company, biggest first. */
  via: FundSlice[];
};

export type SectorExposure = { sector: string; value: number; pct: number; direct: number; viaFunds: number; benchmarkPct: number | null };

export type FundSummary = {
  ticker: string;
  fundName: string;
  value: number;
  pct: number;
  status: FundStatus | "missing";
  note: string | null;
  asOf: string | null;
  sourceUrl: string | null;
  /** The fund's biggest companies, share classes folded (Alphabet once, not GOOGL and GOOG). */
  top: Array<{ ticker: string; name: string; weightPct: number }>;
};

export type FundOverlap = {
  a: string;
  b: string;
  /** Sum over shared companies of the smaller weight, in percent of a fund. */
  pct: number;
  shared: number;
  top: Array<{ ticker: string; name: string }>;
};

export type Xray = {
  total: number;
  directValue: number;
  fundValue: number;
  /** Fund money we could not place in a company: cash, futures, unmatched names, and funds we cannot open. */
  unplacedValue: number;
  /** Money in funds we cannot open (leveraged, bond, or not read yet). Part of unplacedValue. */
  closedFundValue: number;
  companies: CompanyExposure[];
  sectors: SectorExposure[];
  /** Company money with no sector on record. */
  unclassifiedValue: number;
  funds: FundSummary[];
  overlaps: FundOverlap[];
  /** Holdings we could not value (no shares or no price), by ticker. */
  unvalued: string[];
  /** Filing dates of the funds that were opened, oldest first. */
  asOfDates: string[];
  /** Biggest single direct holding, in percent, for "more than any stock you bought". */
  maxDirectPct: number;
};

const fin = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function upper(ticker: string | null | undefined): string {
  return String(ticker ?? "").trim().toUpperCase();
}

/** Company weights inside one fund, share classes folded: key -> { weight, best ticker, name }. */
function fundCompanies(doc: FundDoc): Map<string, { weight: number; ticker: string; tickerWeight: number; name: string }> {
  const out = new Map<string, { weight: number; ticker: string; tickerWeight: number; name: string }>();
  for (const holding of doc.holdings) {
    const ticker = upper(holding.ticker);
    if (!ticker || !fin(holding.weight) || holding.weight <= 0) continue;
    const key = companyKey(ticker);
    const row = out.get(key);
    if (!row) {
      out.set(key, { weight: holding.weight, ticker, tickerWeight: holding.weight, name: holding.name });
    } else {
      row.weight += holding.weight;
      if (holding.weight > row.tickerWeight) {
        row.ticker = ticker;
        row.tickerWeight = holding.weight;
      }
    }
  }
  return out;
}

export function buildXray(positions: readonly XrayPositionInput[], context: XrayContext): Xray {
  const nameOf = context.nameOf ?? {};
  const sectorOf = context.sectorOf ?? {};
  type Acc = { key: string; direct: number; via: Map<string, number>; classValue: Map<string, number>; directTicker: string | null; name: string };
  const companies = new Map<string, Acc>();
  const accFor = (ticker: string, name: string): Acc => {
    const key = companyKey(ticker) || ticker;
    let acc = companies.get(key);
    if (!acc) {
      acc = { key, direct: 0, via: new Map(), classValue: new Map(), directTicker: null, name };
      companies.set(key, acc);
    }
    return acc;
  };

  let total = 0;
  let directValue = 0;
  let fundValue = 0;
  let unplacedValue = 0;
  let closedFundValue = 0;
  const unvalued: string[] = [];
  const funds: FundSummary[] = [];
  const openFunds: FundDoc[] = [];
  const directByKey = new Map<string, number>();

  // A ticker listed twice (two lots, two accounts) is one position.
  const merged = new Map<string, XrayPositionInput & { value: number | null }>();
  for (const position of positions) {
    const ticker = upper(position.ticker);
    if (!ticker) continue;
    const prior = merged.get(ticker);
    if (!prior) merged.set(ticker, { ...position, ticker });
    else prior.value = fin(prior.value) && fin(position.value) ? prior.value + position.value : fin(prior.value) ? prior.value : position.value;
  }

  for (const position of merged.values()) {
    const { ticker } = position;
    if (!fin(position.value) || position.value <= 0) {
      unvalued.push(ticker);
      continue;
    }
    const value = position.value;
    total += value;
    const doc = context.funds[ticker];
    if (doc || position.looksLikeFund) {
      fundValue += value;
      if (!doc || doc.status !== "ok" || doc.holdings.length === 0) {
        closedFundValue += value;
        unplacedValue += value;
        funds.push({
          ticker,
          fundName: doc?.fundName ?? position.name,
          value,
          pct: 0,
          status: doc ? doc.status : "missing",
          note: doc?.note ?? null,
          asOf: doc?.asOf ?? null,
          sourceUrl: doc?.sourceUrl ?? null,
          top: [],
        });
        continue;
      }
      openFunds.push(doc);
      let placedWeight = 0;
      // A filing's weights can add up to a little over 1 (leverage, rounding); scale them so a fund never places more than its own value.
      const totalWeight = doc.holdings.reduce((sum, holding) => sum + (fin(holding.weight) && holding.weight > 0 ? holding.weight : 0), 0);
      const scale = totalWeight > 1 ? 1 / totalWeight : 1;
      for (const holding of doc.holdings) {
        const held = upper(holding.ticker);
        if (!held || !fin(holding.weight) || holding.weight <= 0) continue;
        const amount = value * holding.weight * scale;
        placedWeight += holding.weight * scale;
        const acc = accFor(held, holding.name);
        acc.via.set(ticker, (acc.via.get(ticker) ?? 0) + amount);
        acc.classValue.set(held, (acc.classValue.get(held) ?? 0) + amount);
      }
      unplacedValue += value * Math.max(0, 1 - placedWeight);
      funds.push({
        ticker,
        fundName: doc.fundName,
        value,
        pct: 0,
        status: "ok",
        note: null,
        asOf: doc.asOf,
        sourceUrl: doc.sourceUrl,
        top: [...fundCompanies(doc).values()]
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 5)
          .map((row) => ({ ticker: row.ticker, name: row.name, weightPct: row.weight * 100 })),
      });
      continue;
    }
    directValue += value;
    const acc = accFor(ticker, position.name);
    acc.direct += value;
    acc.directTicker = acc.directTicker ?? ticker;
    acc.classValue.set(ticker, (acc.classValue.get(ticker) ?? 0) + value);
    if (position.name) acc.name = position.name;
    directByKey.set(acc.key, (directByKey.get(acc.key) ?? 0) + value);
  }

  const pctOf = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  const rows: CompanyExposure[] = [...companies.values()].map((acc) => {
    const viaFunds = [...acc.via.values()].reduce((sum, value) => sum + value, 0);
    const byClass = [...acc.classValue.entries()].sort((a, b) => b[1] - a[1]);
    const ticker = acc.directTicker ?? byClass[0]?.[0] ?? acc.key;
    const classes = [ticker, ...byClass.map(([cls]) => cls).filter((cls) => cls !== ticker)];
    const rawSector = classes.map((cls) => sectorOf[cls]).find(Boolean);
    const name = classes.map((cls) => nameOf[cls]).find(Boolean) ?? acc.name;
    const totalValue = acc.direct + viaFunds;
    return {
      key: acc.key,
      ticker,
      classes,
      name: shortCompanyName(name) || name || ticker,
      sector: rawSector ? normalizeSectorName(rawSector) ?? rawSector : null,
      direct: acc.direct,
      viaFunds,
      total: totalValue,
      pct: pctOf(totalValue),
      directPct: pctOf(acc.direct),
      fundPct: pctOf(viaFunds),
      via: [...acc.via.entries()].map(([fund, value]) => ({ fund, value })).sort((a, b) => b.value - a.value),
    };
  });
  rows.sort((a, b) => b.total - a.total || a.ticker.localeCompare(b.ticker));

  const sectorMap = new Map<string, SectorExposure>();
  let unclassifiedValue = 0;
  for (const row of rows) {
    if (!row.sector) {
      unclassifiedValue += row.total;
      continue;
    }
    const slot = sectorMap.get(row.sector) ?? { sector: row.sector, value: 0, pct: 0, direct: 0, viaFunds: 0, benchmarkPct: null };
    slot.value += row.total;
    slot.direct += row.direct;
    slot.viaFunds += row.viaFunds;
    sectorMap.set(row.sector, slot);
  }
  const benchmarkSectors = context.benchmarkSectors ?? {};
  const sectors = [...sectorMap.values()]
    .map((slot) => {
      const bench = benchmarkSectors[slot.sector];
      return { ...slot, pct: pctOf(slot.value), benchmarkPct: fin(bench) ? bench : null };
    })
    .sort((a, b) => b.value - a.value);

  for (const fund of funds) fund.pct = pctOf(fund.value);
  funds.sort((a, b) => b.value - a.value);

  const overlaps: FundOverlap[] = [];
  const weights = new Map(openFunds.map((doc) => [doc.ticker, fundCompanies(doc)]));
  for (let i = 0; i < openFunds.length; i++) {
    for (let j = i + 1; j < openFunds.length; j++) {
      const a = openFunds[i]!;
      const b = openFunds[j]!;
      const wa = weights.get(a.ticker)!;
      const wb = weights.get(b.ticker)!;
      let pct = 0;
      const shared: Array<{ ticker: string; name: string; min: number }> = [];
      for (const [key, rowA] of wa) {
        const rowB = wb.get(key);
        if (!rowB) continue;
        const min = Math.min(rowA.weight, rowB.weight);
        pct += min;
        shared.push({ ticker: rowA.ticker, name: rowA.name, min });
      }
      shared.sort((x, y) => y.min - x.min);
      overlaps.push({
        a: a.ticker,
        b: b.ticker,
        pct: pct * 100,
        shared: shared.length,
        top: shared.slice(0, 3).map((item) => ({ ticker: item.ticker, name: rows.find((row) => row.classes.includes(item.ticker))?.name ?? shortCompanyName(item.name) })),
      });
    }
  }
  overlaps.sort((x, y) => y.pct - x.pct);

  const asOfDates = [...new Set(openFunds.map((doc) => doc.asOf).filter((day): day is string => Boolean(day)))].sort();
  const maxDirectPct = Math.max(0, ...[...directByKey.values()].map(pctOf));

  return {
    total,
    directValue,
    fundValue,
    unplacedValue,
    closedFundValue,
    companies: rows,
    sectors,
    unclassifiedValue,
    funds,
    overlaps,
    unvalued,
    asOfDates,
    maxDirectPct,
  };
}

/* ── words ──────────────────────────────────────────────────────────────── */

/** "14%", "4.5%", "0.4%", "under 0.1%": whole numbers once they are big enough to read that way. */
export function fmtPct(value: number): string {
  if (!fin(value)) return "";
  if (value >= 9.95) return `${Math.round(value)}%`;
  if (value >= 0.05) return `${value.toFixed(1)}%`;
  return value > 0 ? "under 0.1%" : "0%";
}

/** "QQQ", "QQQ and VOO", "QQQ, VOO and VTI". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun 30, 2026", the way dates read everywhere else in the app. */
export function fmtFilingDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!match) return "";
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function viaNames(row: CompanyExposure): string {
  return joinList(row.via.map((slice) => slice.fund));
}

/** The share of the S&P 500 in its ten biggest companies, from an S&P 500 fund's filing. */
export function topTenShare(doc: FundDoc | null | undefined): number | null {
  if (!doc || doc.status !== "ok" || doc.holdings.length < 10) return null;
  const weights = [...fundCompanies(doc).values()].map((row) => row.weight).sort((a, b) => b - a);
  return weights.slice(0, 10).reduce((sum, weight) => sum + weight, 0) * 100;
}

/** One decimal everywhere: for sentences whose parts must visibly add up ("12.7% and 1.6%, so 14.3%"). */
function fmtPct1(value: number): string {
  return value > 0 && value < 0.05 ? "under 0.1%" : `${value.toFixed(1)}%`;
}

/** The words that change between a person's own portfolio and the example, which is nobody's. */
function voice(example: boolean) {
  return example
    ? {
        all: "this portfolio",
        once: "Once the funds are counted",
        bought: "bought directly",
        hold: "the portfolio holds",
        money: "the money",
        moneyCap: "The money",
        ten: "The ten biggest companies here are",
        biggest: "the biggest company",
        funds: "the funds",
        never: "which it never bought directly",
      }
    : {
        all: "everything you own",
        once: "Once your funds are counted",
        bought: "you bought directly",
        hold: "you hold",
        money: "your money",
        moneyCap: "Your money",
        ten: "Your ten biggest companies are",
        biggest: "your biggest company",
        funds: "your funds",
        never: "which you never bought",
      };
}

/** Money in funds we cannot open, above which shares of the whole say more about the gap than about the portfolio. */
const CLOSED_SHARE_LIMIT = 0.1;

/**
 * The read: one headline and up to three insights, each a sentence with its
 * number and what it is compared with. Plain rules over `buildXray`; an
 * insight the data cannot back is left out.
 */
export function buildXrayRead(xray: Xray, context: Pick<XrayContext, "benchmark"> & { example?: boolean } = {}): TheRead | null {
  if (xray.total <= 0) return null;
  const opened = xray.funds.filter((fund) => fund.status === "ok");
  const closed = xray.funds.filter((fund) => fund.status !== "ok");
  const v = voice(Boolean(context.example));

  if (xray.funds.length === 0) {
    return {
      headline: context.example
        ? "None of these holdings is a fund, so the list is everything this portfolio owns."
        : "None of your holdings is a fund, so the list you see is everything you own.",
      insights: [],
      headlineTickers: [],
    };
  }
  if (opened.length === 0) {
    const list = joinList(closed.map((fund) => fund.ticker));
    const missing = closed.filter((fund) => fund.status === "missing").length;
    const what = closed.length === 1 ? "it holds" : "they hold";
    // "Yet" only where reading the filing would fix it; a swaps fund will not change.
    return {
      headline:
        missing === closed.length
          ? `We have not read inside ${list} yet, so this page cannot add up what ${what}.`
          : missing === 0
            ? `We cannot split ${list} into companies, so this page cannot add up what ${what}.`
            : `We cannot see inside ${list}, so this page cannot add up what ${what}.`,
      insights: pickInsights([closedFundsInsight(closed, xray, v)]),
      headlineTickers: [],
    };
  }

  const top = xray.companies[0];
  let headline = "";
  const headlineTickers: string[] = [];
  // "17%, not the 15% bought directly" only says something when the two numbers read differently.
  const fundsMoveTop = Boolean(top && top.viaFunds > 0 && (top.direct === 0 || fmtPct(top.pct) !== fmtPct(top.directPct)));
  if (top && fundsMoveTop) {
    headlineTickers.push(top.ticker);
    if (top.direct > 0) {
      headline = `${v.once}, ${top.name} is ${fmtPct(top.pct)} of ${v.all}, not the ${fmtPct(top.directPct)} ${v.bought}.`;
    } else if (top.pct > xray.maxDirectPct) {
      headline = `${v.once}, ${top.name} is ${fmtPct(top.pct)} of ${v.all}, more than any stock ${v.bought}.`;
    } else {
      headline = `${v.once}, ${top.name} is ${fmtPct(top.pct)} of ${v.all}, all of it through ${viaNames(top)}.`;
    }
  } else if (top) {
    const hidden = xray.companies.find((row) => row.direct === 0 && row.viaFunds > 0);
    headlineTickers.push(top.ticker);
    headline = hidden
      ? `${top.name} is still ${v.biggest} at ${fmtPct(top.pct)}, and ${v.funds} add ${fmtPct(hidden.pct)} in ${hidden.name}, ${v.never}.`
      : `${top.name} is ${v.biggest} at ${fmtPct(top.pct)} of ${v.all}.`;
    if (hidden) headlineTickers.push(hidden.ticker);
  }

  const insights: Array<Insight | null> = [];

  // 1. A stock held directly that the funds quietly add to. One decimal for all three, so the parts add up.
  const doubled = xray.companies.find((row) => row.direct > 0 && row.viaFunds > 0 && row.fundPct >= 0.5 && !headlineTickers.includes(row.ticker));
  if (doubled) {
    insights.push({
      id: "xray-doubled",
      tone: "flat",
      // Starts with the ticker, which the read shows as the company's logo and name, so the sentence reads "Microsoft is 12.7% ...".
      text: `${doubled.ticker} is ${fmtPct1(doubled.directPct)} of ${v.all} on its own, and ${viaNames(doubled)} ${doubled.via.length === 1 ? "adds" : "add"} another ${fmtPct1(doubled.fundPct)}, so it is really ${fmtPct1(doubled.directPct + doubled.fundPct)}.`,
      tickers: [doubled.ticker],
      leadName: doubled.name,
    });
  }

  // 2. Two funds that buy the same companies.
  const overlap = xray.overlaps[0];
  if (overlap && overlap.pct >= 20 && overlap.shared > 1) {
    const names = overlap.top.map((item) => item.name);
    insights.push({
      id: "xray-overlap",
      tone: "flat",
      text: `${overlap.a} and ${overlap.b} overlap by ${fmtPct(overlap.pct)}: weight for weight, that much of each fund is in the same ${overlap.shared} companies, so owning both spreads ${v.money} less than two funds suggest.`,
      soWhat: names.length > 0 ? `The biggest names they share are ${joinList(names)}.` : undefined,
    });
  }

  // 3 and 4 compare shares of the whole with the index. With much of the money in funds
  // we cannot open, those shares mostly measure the gap, so they wait until it is small.
  const mostlyOpen = xray.closedFundValue / xray.total <= CLOSED_SHARE_LIMIT;

  // 3. Concentration against the S&P 500.
  const benchTop = topTenShare(context.benchmark);
  const placed = xray.companies.slice(0, 10);
  if (mostlyOpen && placed.length >= 10 && benchTop !== null) {
    const ours = placed.reduce((sum, row) => sum + row.pct, 0);
    const gap = ours - benchTop;
    if (Math.abs(gap) >= 3) {
      insights.push({
        id: "xray-top-ten",
        tone: "flat",
        text: `${v.ten} ${fmtPct(ours)} of ${v.all}, against ${fmtPct(benchTop)} for the ten biggest in the S&P 500.`,
        soWhat: gap > 0 ? `A bad month for a few of them moves more of ${v.money} than it moves the index.` : `${v.moneyCap} is spread wider than the index.`,
        tickers: placed.slice(0, 3).map((row) => row.ticker),
      });
    }
  }

  // 4. The biggest sector against its S&P 500 weight.
  const sector = xray.sectors[0];
  if (mostlyOpen && sector && sector.benchmarkPct !== null && sector.pct - sector.benchmarkPct >= 8) {
    insights.push({
      id: "xray-sector",
      tone: "flat",
      text: `${sector.sector} is ${fmtPct(sector.pct)} of ${v.all} once funds are counted, against ${fmtPct(sector.benchmarkPct)} of the S&P 500.`,
    });
  }

  // 5. Funds we cannot open.
  insights.push(closedFundsInsight(closed, xray, v));

  return {
    headline,
    insights: pickInsights(insights),
    headlineTickers,
    source: xrayFootnote(xray),
  };
}

function closedFundsInsight(closed: FundSummary[], xray: Xray, v: ReturnType<typeof voice>): Insight | null {
  if (closed.length === 0) return null;
  const pct = fmtPct((closed.reduce((sum, fund) => sum + fund.value, 0) / xray.total) * 100);
  const derivative = closed.filter((fund) => fund.status === "derivatives").map((fund) => fund.ticker);
  const notStocks = closed.filter((fund) => fund.status === "not_stocks").map((fund) => fund.ticker);
  const missing = closed.filter((fund) => fund.status === "missing").map((fund) => fund.ticker);
  const parts: string[] = [];
  if (derivative.length > 0)
    parts.push(
      derivative.length === 1
        ? `${derivative[0]} gets much of its exposure through swaps, so its filing does not say which companies it really holds`
        : `${joinList(derivative)} get much of their exposure through swaps, so their filings do not say which companies they really hold`,
    );
  if (notStocks.length > 0) parts.push(`${joinList(notStocks)} ${notStocks.length === 1 ? "holds" : "hold"} mostly bonds or cash rather than shares of companies`);
  if (missing.length > 0) parts.push(`we have not read the holdings of ${joinList(missing)} yet`);
  return {
    id: "xray-closed",
    tone: "flat",
    text: `${parts.join(", and ").replace(/^./, (c) => c.toUpperCase())}. That ${pct} of ${v.money} is left out of the company and sector totals.`,
  };
}

/** "Fund holdings from SEC N-PORT filings as of Jun 30, 2026" (or "dated Jun 30, 2026 to Aug 31, 2026"). */
export function xrayFootnote(xray: Xray): string {
  const dates = xray.asOfDates;
  if (dates.length === 0) return "Fund holdings from SEC N-PORT filings";
  if (dates.length === 1) return `Fund holdings from SEC N-PORT filings as of ${fmtFilingDay(dates[0])}`;
  return `Fund holdings from SEC N-PORT filings dated ${fmtFilingDay(dates[0])} to ${fmtFilingDay(dates[dates.length - 1])}`;
}
