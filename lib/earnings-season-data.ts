import { normalizeEarnings } from "@/lib/calendar-shared";
import {
  buildHistory,
  buildSeason,
  buildSeasonRead,
  type CalendarRow,
  type Filing202,
  type Season,
  type StockHistory,
  type StoredReaction,
} from "@/lib/earnings-season";
import { adminFirestore } from "@/lib/firebase-admin";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import type { TheRead } from "@/lib/insights";
import { FUNDS_SECTOR, loadDatedPrices, loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import { onOneDay } from "@/lib/portfolio-prices";
import { shortCompanyName } from "@/lib/plain-copy";
import { sharedCache } from "@/lib/shared-cache";
import type { UserDoc } from "@/lib/watchlist";

/**
 * Server loaders for /portfolio/earnings. Read-only.
 *
 * Per stock, in one cached read:
 * - report dates, times, EPS estimates and results: `tm_earnings_events`;
 * - stored moves on a report: `tm_agent_earnings_reactions`;
 * - 8-K filings with item 2.02 (results of operations), for the time of day a
 *   report came out and for report days the calendar does not hold: three
 *   years of them per stock in `tm_earnings_history`
 *   (`backend/agentdata/earnings_history.py`), plus the newest ones in
 *   `tm_agent_filings`;
 * - adjusted daily closes: `tm_price_history_daily`, for the moves and the
 *   size of a normal day.
 * Weights come from the same dated prices the Portfolio page uses.
 */

const EARNINGS = "tm_earnings_events";
const REACTIONS = "tm_agent_earnings_reactions";
const FILINGS = "tm_agent_filings";
const HISTORY = "tm_earnings_history";
const PRICES = "tm_price_history_daily";
/** More than this many stocks and the rest are left out, so one big watchlist cannot stall the page. */
const MAX_STOCKS = 60;

type RawDoc = Record<string, unknown>;

export type TickerEarnings = {
  ticker: string;
  /** Company name from the calendar, when there is a row. */
  company: string | null;
  fund: boolean;
  history: StockHistory;
  /** Newest capture time among the calendar rows. */
  asOf: string | null;
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readTickerUncached(ticker: string, today: string): Promise<TickerEarnings> {
  // The calendar and the closes must both read, or nothing is cached: a failed read would
  // otherwise be served to everyone as "no dates" or "no history" for half an hour.
  const [eventSnap, reactionSnap, filingSnap, historySnap, priceSnap] = await Promise.all([
    adminFirestore.collection(EARNINGS).where("ticker", "==", ticker).get(),
    adminFirestore.collection(REACTIONS).where("ticker", "==", ticker).get().catch(() => null),
    adminFirestore
      .collection(FILINGS)
      .where("ticker", "==", ticker)
      .where("item_codes", "array-contains", "2.02")
      .get()
      .catch(() => null),
    // Optional like the filings: without it the planner has the calendar's few months.
    adminFirestore
      .collection(HISTORY)
      .doc(ticker.replace(/\//g, "-"))
      .get()
      .catch(() => null),
    adminFirestore.collection(PRICES).doc(ticker.replace(/\//g, "-")).get(),
  ]);

  const events: CalendarRow[] = [];
  let asOf = "";
  let company: { name: string; date: string } | null = null;
  for (const doc of eventSnap?.docs ?? []) {
    const raw = doc.data() as RawDoc;
    const item = normalizeEarnings(raw);
    if (!item) continue;
    const captured = typeof raw.captured_at === "string" ? raw.captured_at : "";
    events.push({ ...item, capturedAt: captured || null });
    if (captured > asOf) asOf = captured;
    // The newest row's name: the old feed spelled names in capitals ("NVIDIA CORP").
    if (!company || item.date > company.date) company = { name: item.company, date: item.date };
  }

  const reactions: StoredReaction[] = [];
  for (const doc of reactionSnap?.docs ?? []) {
    const raw = doc.data() as RawDoc;
    const pct = num(raw.pct);
    const date = String(raw.event_date ?? "").slice(0, 10);
    const toDate = String(raw.to_date ?? "").slice(0, 10);
    if (pct === null || !date || !toDate) continue;
    reactions.push({ date, pct, basis: raw.basis === "2d" ? "2d" : "1d", toDate });
  }

  // One entry per accession: the history and the recent filings overlap.
  const byAccession = new Map<string, Filing202>();
  const addFiling = (key: string, filing: Filing202) => {
    if (Number.isFinite(Date.parse(filing.filedAt)) && !byAccession.has(key)) byAccession.set(key, filing);
  };
  for (const doc of filingSnap?.docs ?? []) {
    const raw = doc.data() as RawDoc;
    const filedAt = raw.filed_at;
    if (typeof filedAt === "string" && filedAt) {
      addFiling(typeof raw.accession === "string" && raw.accession ? raw.accession : `${doc.id}:${filedAt}`, {
        filedAt,
        amended: raw.is_amendment === true || /\/A$/i.test(String(raw.form ?? "")),
      });
    }
  }
  // The history marks the item 2.02 8-Ks that are not earnings releases (a delivery update, a
  // conference deck): they are left out, here and when the same filing arrives from tm_agent_filings.
  const notReleases = new Set<string>();
  const historyReports = historySnap?.exists ? (historySnap.data() as RawDoc).reports : null;
  for (const report of Array.isArray(historyReports) ? historyReports : []) {
    if (!report || typeof report !== "object") continue;
    const row = report as RawDoc;
    if (row.release === false) {
      if (typeof row.accession === "string" && row.accession) notReleases.add(row.accession);
      continue;
    }
    // The job keeps original 8-Ks only; amendments never reach this list.
    if (typeof row.accepted_at === "string" && row.accepted_at) {
      addFiling(typeof row.accession === "string" && row.accession ? row.accession : `history:${row.accepted_at}`, { filedAt: row.accepted_at });
    }
  }
  for (const accession of notReleases) byAccession.delete(accession);
  const filings = [...byAccession.values()];

  let series: { dates: string[]; closes: number[] } | null = null;
  let fund = false;
  if (priceSnap.exists) {
    const raw = priceSnap.data() as RawDoc;
    const dates = Array.isArray(raw.dates) ? raw.dates : [];
    const closes = Array.isArray(raw.closes) ? raw.closes : [];
    const n = Math.min(dates.length, closes.length);
    series = { dates: [], closes: [] };
    for (let i = 0; i < n; i++) {
      const date = dates[i];
      const close = closes[i];
      if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
        series.dates.push(date.slice(0, 10));
        series.closes.push(close);
      }
    }
    fund = raw.instrument_type === "ETF" || raw.instrument_type === "MUTUALFUND";
  }

  return {
    ticker,
    company: company?.name ?? null,
    fund,
    history: buildHistory({ events, reactions, filings, series }, today),
    asOf: asOf || null,
  };
}

// The calendar refreshes a few times a day and the closes once; half an hour is plenty.
const readTicker = sharedCache(readTickerUncached, ["earnings-season-ticker-v2"], { revalidate: 1800 });

export async function loadTickerEarnings(tickers: string[], today: string): Promise<Map<string, TickerEarnings>> {
  const unique = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const loaded = await Promise.all(
    unique.map((ticker) =>
      readTicker(ticker, today).catch((error) => {
        console.warn(`[earnings-season] ${ticker} read failed:`, error);
        return null;
      }),
    ),
  );
  const out = new Map<string, TickerEarnings>();
  unique.forEach((ticker, index) => {
    const value = loaded[index];
    if (value) out.set(ticker, value);
  });
  return out;
}

/* ── The page's view ───────────────────────────────────────────────────── */

export type SeasonSeed = {
  ticker: string;
  name: string | null;
  kind: "holding" | "watching";
  /** Market value when known (shares times price, or what the person entered). */
  value: number | null;
  /** Known to be a fund (the example says so); otherwise the price history decides. */
  fund?: boolean;
};

export type SeasonView = {
  season: Season;
  read: TheRead | null;
  mode: "live" | "example";
  /** Newest calendar capture time across the stocks. */
  asOf: string | null;
  /** Day the example's weights are priced on. */
  pricesAsOf: string | null;
  /** Stocks whose earnings could not be read at all. */
  missing: string[];
  /** Stocks left out over MAX_STOCKS. */
  clipped: number;
  /** The person holds stocks outside the US, which the planner leaves out, so shares are of the US holdings. */
  usOnly: boolean;
};

export async function buildSeasonView(
  seeds: SeasonSeed[],
  mode: SeasonView["mode"],
  pricesAsOf: string | null,
  now = new Date(),
  usOnly = false,
): Promise<SeasonView> {
  const today = newYorkToday(now);
  // One seed per ticker (a holding wins over a watch), holdings first, so a long watchlist is what gets cut.
  const ordered = [...seeds].sort((a, b) => Number(a.kind === "watching") - Number(b.kind === "watching"));
  const seen = new Set<string>();
  const unique = ordered.filter((seed) => {
    const ticker = seed.ticker.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });
  const kept = unique.slice(0, MAX_STOCKS);
  const loaded = await loadTickerEarnings(
    kept.map((seed) => seed.ticker),
    today,
  );
  let asOf = "";
  const missing: string[] = [];
  const season = buildSeason(
    kept.map((seed) => {
      const ticker = seed.ticker.toUpperCase();
      const data = loaded.get(ticker);
      if (!data) missing.push(ticker);
      if (data?.asOf && data.asOf > asOf) asOf = data.asOf;
      return {
        ticker,
        name: shortCompanyName(seed.name || data?.company) || ticker,
        kind: seed.kind,
        value: seed.value,
        fund: Boolean(seed.fund ?? data?.fund),
        history: data?.history ?? null,
      };
    }),
    today,
  );
  return {
    season,
    read: buildSeasonRead(season, { example: mode === "example" }),
    mode,
    asOf: asOf || null,
    pricesAsOf,
    missing,
    clipped: Math.max(0, unique.length - kept.length),
    usOnly,
  };
}

/** The example portfolio from the Portfolio page: its holdings at their values and its watchlist. */
export async function loadExampleSeason(now = new Date()): Promise<SeasonView | null> {
  const example = await loadExamplePortfolio().catch(() => null);
  if (!example) return null;
  const { positions, watching } = example.portfolio;
  const seeds: SeasonSeed[] = [
    ...positions.map((position) => ({
      ticker: position.ticker,
      name: position.name,
      kind: position.kind === "holding" ? ("holding" as const) : ("watching" as const),
      value: position.kind === "holding" ? position.value : null,
      fund: position.sector === FUNDS_SECTOR || undefined,
    })),
    ...watching.map((position) => ({ ticker: position.ticker, name: position.name, kind: "watching" as const, value: null })),
  ];
  return buildSeasonView(seeds, "example", example.pricesAsOf, now);
}

function usTicker(id: string, label: string | undefined): string | null {
  if (!id.startsWith("US_")) return null;
  const ticker = (label || id.slice(3).replace(/_/g, ".")).trim().toUpperCase();
  return ticker || null;
}

/**
 * A signed-in person's US holdings and watched stocks. Holdings are valued at
 * the same dated prices the Portfolio page shows, else the value they typed
 * in. Null when they track no US stock.
 */
export async function loadUserSeason(userDoc: UserDoc | null, now = new Date()): Promise<SeasonView | null> {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const holdingsMap = userDoc?.watchlist_holdings ?? {};
  const ids = [...new Set(tracked.filter((id) => typeof id === "string" && id.startsWith("US_")))];
  const otherHoldings = tracked.some((id) => typeof id === "string" && !id.startsWith("US_") && kinds[id] === "holding");
  if (ids.length === 0) return null;
  const labels = await getInstrumentLabels(ids).catch(() => new Map<string, { ticker?: string; name?: string }>());
  const rows = ids
    .map((id) => {
      const label = labels.get(id);
      const ticker = usTicker(id, label?.ticker);
      return ticker ? { id, ticker, name: label?.name ?? null, kind: kinds[id] === "holding" ? ("holding" as const) : ("watching" as const) } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return null;

  const holdingTickers = rows.filter((row) => row.kind === "holding").map((row) => row.ticker);
  const quoted = holdingTickers.length ? await loadDatedPrices(holdingTickers).catch(() => new Map()) : new Map();
  const { prices } = onOneDay(quoted);
  const seeds: SeasonSeed[] = rows.map((row) => {
    if (row.kind !== "holding") return { ticker: row.ticker, name: row.name, kind: "watching", value: null };
    const holding = holdingsMap[row.id];
    const quantity = num(holding?.quantity);
    const entered = num(holding?.market_value);
    const price = prices.get(row.ticker)?.price ?? null;
    const value = quantity !== null && quantity > 0 && price !== null && price > 0 ? quantity * price : entered !== null && entered > 0 ? entered : null;
    return { ticker: row.ticker, name: row.name, kind: "holding", value };
  });
  return buildSeasonView(seeds, "live", null, now, otherHoldings);
}
