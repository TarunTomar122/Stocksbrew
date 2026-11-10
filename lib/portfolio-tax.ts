/**
 * Portfolio tax view: pure functions, safe on the server and in the browser.
 *
 * What it does, with US federal rules only:
 * - matches each sell against the user's own buy lots, first in first out
 *   unless the sell names specific lots;
 * - splits realised gains into short term (held one year or less) and long
 *   term (held more than one year), per tax year and year to date;
 * - lists open lots trading below their cost (harvestable losses);
 * - flags loss sales with a buy of the same ticker 30 days before or after
 *   (possible wash sales) and warns before harvesting after a recent buy.
 *
 * Data: `users/{uid}.tax_lots`, keyed by instrument id (see TaxLotsField).
 * It is a field of its own, so the Portfolio's holdings writers, which
 * rewrite `watchlist_holdings` wholesale, never touch it. A holding that has
 * no lots yet but has shares and an average cost in `watchlist_holdings`
 * counts as one lot with an unknown buy date.
 *
 * Units and splits: lots are entered in the shares and prices actually traded.
 * The current price is the latest unadjusted quote, and no historical
 * (split-adjusted) closes are used, so nothing needs undoing. When a stock
 * splits after a buy, the user records the split on that holding (date and
 * ratio). From the split date on, open lots carry ratio x the shares at the
 * same dollar basis; the holding period does not change. Sells dated on or
 * after the split are in post-split shares.
 *
 * Nothing here is tax advice. It is arithmetic on what the user entered.
 */

export const TAX_MAX_BUYS = 500;
export const TAX_MAX_SELLS = 500;
export const TAX_MAX_SPLITS = 50;
const MAX_SHARES = 1_000_000_000;
const MAX_PRICE = 10_000_000;
const MAX_FEE = 1_000_000;
const MAX_RATIO = 1000;
/** Share counts closer than this are equal (float noise from splits and fractions). */
const EPS = 1e-9;
export const WASH_SALE_DAYS = 30;
/** Id of the lot made from an old single-cost holding. */
export const HOLDING_LOT_ID = "holding";

/* ── Stored shape ──────────────────────────────────────────────────────── */

export type TaxBuy = {
  id: string;
  /** YYYY-MM-DD, trade date. */
  date: string;
  shares: number;
  /** Per share, in dollars. */
  price: number;
  /** Commission or fee in dollars, added to the basis. */
  fee?: number | null;
};

export type TaxSellPick = { lot_id: string; shares: number };

export type TaxSell = {
  id: string;
  date: string;
  shares: number;
  price: number;
  /** Commission or fee in dollars, taken from the proceeds. */
  fee?: number | null;
  method: "fifo" | "specific";
  /** Specific-lot sells: which lots and how many shares of each. */
  picks?: TaxSellPick[];
};

export type TaxSplit = {
  id: string;
  date: string;
  /** New shares per old share: 4 for a 4-for-1 split, 0.1 for a 1-for-10 reverse split. */
  ratio: number;
};

export type TaxLotEntry = {
  ticker: string;
  buys: TaxBuy[];
  sells: TaxSell[];
  splits: TaxSplit[];
  updated_at?: string | null;
};

/** `users/{uid}.tax_lots` */
export type TaxLotsField = Record<string, TaxLotEntry>;

/** The old single-cost holding shape from `users/{uid}.watchlist_holdings`. */
export type LegacyHolding = { quantity?: number | null; average_cost?: number | null; updated_at?: string | null };

/* ── Dates ─────────────────────────────────────────────────────────────── */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DAY_RE.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function addDays(day: string, days: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The same calendar day one year later. Feb 29 maps to Feb 28, so a lot
 * bought on Feb 29, 2024 is long term when sold on Mar 1, 2025 or later.
 */
export function oneYearAfter(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const year = y + 1;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const dd = Math.min(d, lastDay);
  return `${year}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export type Term = "short" | "long" | "unknown";

/**
 * IRS: the holding period starts the day after the trade date, and a lot is
 * long term when held more than one year. Bought 2024-03-01: sold 2025-03-01
 * is short term, sold 2025-03-02 is long term.
 */
export function holdingTerm(acquired: string | null, sold: string): Term {
  if (!acquired) return "unknown";
  return sold > oneYearAfter(acquired) ? "long" : "short";
}

/** The first day a lot bought on `acquired` counts as long term. */
export function longTermFrom(acquired: string): string {
  return addDays(oneYearAfter(acquired), 1);
}

/* ── Parsing (API input and defensive reads of the stored doc) ────────── */

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
}

export type ParseResult = { entry: TaxLotEntry; errors: string[] };

/**
 * Validates one holding's lots. `today` (YYYY-MM-DD) rejects trade dates
 * after it. Strict mode (the API) reports every problem; the page reads the
 * stored doc with strict off and drops rows it cannot use.
 */
export function parseTaxLotEntry(raw: unknown, today: string, ticker: string): ParseResult {
  const errors: string[] = [];
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const latest = addDays(today, 1); // a trade entered late in the evening abroad is still "today" in New York
  const seen = new Set<string>();

  function day(value: unknown, what: string): string | null {
    if (!isIsoDay(value)) {
      errors.push(`${what}: enter a date as YYYY-MM-DD.`);
      return null;
    }
    if (value > latest) {
      errors.push(`${what}: ${value} is in the future.`);
      return null;
    }
    if (value < "1900-01-01") {
      errors.push(`${what}: ${value} is too early.`);
      return null;
    }
    return value;
  }
  function id(value: unknown, what: string): string | null {
    const clean = cleanId(value);
    if (!clean) {
      errors.push(`${what}: missing id.`);
      return null;
    }
    if (seen.has(clean)) {
      errors.push(`${what}: id ${clean} is used twice.`);
      return null;
    }
    seen.add(clean);
    return clean;
  }
  function amount(value: unknown, what: string, max: number, allowZero: boolean): number | null {
    const n = num(value);
    if (n === null || n < 0 || (!allowZero && n === 0) || n > max) {
      errors.push(`${what}: enter a number${allowZero ? "" : " above zero"}${n !== null && n > max ? ` up to ${max.toLocaleString("en-US")}` : ""}.`);
      return null;
    }
    return n;
  }
  function fee(value: unknown, what: string): number | null {
    if (value === undefined || value === null || value === "") return null;
    return amount(value, `${what} fee`, MAX_FEE, true);
  }

  const rawBuys = Array.isArray(source.buys) ? source.buys : [];
  const rawSells = Array.isArray(source.sells) ? source.sells : [];
  const rawSplits = Array.isArray(source.splits) ? source.splits : [];
  if (rawBuys.length > TAX_MAX_BUYS) errors.push(`Up to ${TAX_MAX_BUYS} buys per stock.`);
  if (rawSells.length > TAX_MAX_SELLS) errors.push(`Up to ${TAX_MAX_SELLS} sells per stock.`);
  if (rawSplits.length > TAX_MAX_SPLITS) errors.push(`Up to ${TAX_MAX_SPLITS} splits per stock.`);

  const buys: TaxBuy[] = [];
  rawBuys.slice(0, TAX_MAX_BUYS).forEach((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const what = `Buy ${index + 1}`;
    // "holding" names the lot made from an old single-cost holding; a real buy cannot take it.
    if (row.id === HOLDING_LOT_ID) errors.push(`${what}: "${HOLDING_LOT_ID}" is a reserved id.`);
    const buyId = row.id === HOLDING_LOT_ID ? null : id(row.id, what);
    const date = day(row.date, what);
    const shares = amount(row.shares, `${what} shares`, MAX_SHARES, false);
    const price = amount(row.price, `${what} price`, MAX_PRICE, true);
    const buyFee = fee(row.fee, what);
    if (buyId && date && shares !== null && price !== null) {
      buys.push({ id: buyId, date, shares, price, ...(buyFee ? { fee: buyFee } : {}) });
    }
  });

  const buyIds = new Set(buys.map((buy) => buy.id));
  const sells: TaxSell[] = [];
  rawSells.slice(0, TAX_MAX_SELLS).forEach((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const what = `Sell ${index + 1}`;
    const sellId = id(row.id, what);
    const date = day(row.date, what);
    const shares = amount(row.shares, `${what} shares`, MAX_SHARES, false);
    const price = amount(row.price, `${what} price`, MAX_PRICE, true);
    const sellFee = fee(row.fee, what);
    const method = row.method === "specific" ? "specific" : "fifo";
    const picks: TaxSellPick[] = [];
    if (method === "specific") {
      const rawPicks = Array.isArray(row.picks) ? row.picks : [];
      for (const pick of rawPicks.slice(0, TAX_MAX_BUYS)) {
        const p = (pick && typeof pick === "object" ? pick : {}) as Record<string, unknown>;
        const lotId = cleanId(p.lot_id);
        const pickShares = num(p.shares);
        if (!lotId || !buyIds.has(lotId)) {
          errors.push(`${what}: it names a lot that does not exist.`);
          continue;
        }
        if (pickShares === null || pickShares <= 0 || pickShares > MAX_SHARES) {
          errors.push(`${what}: enter the shares taken from each lot.`);
          continue;
        }
        picks.push({ lot_id: lotId, shares: pickShares });
      }
      if (picks.length === 0) errors.push(`${what}: pick at least one lot, or use first in, first out.`);
      const picked = picks.reduce((sum, pick) => sum + pick.shares, 0);
      if (shares !== null && picked > shares + EPS) errors.push(`${what}: the lots picked add up to more than the shares sold.`);
    }
    if (sellId && date && shares !== null && price !== null) {
      sells.push({
        id: sellId,
        date,
        shares,
        price,
        ...(sellFee ? { fee: sellFee } : {}),
        method: method === "specific" && picks.length > 0 ? "specific" : "fifo",
        ...(method === "specific" && picks.length > 0 ? { picks } : {}),
      });
    }
  });

  const splits: TaxSplit[] = [];
  rawSplits.slice(0, TAX_MAX_SPLITS).forEach((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const what = `Split ${index + 1}`;
    const splitId = id(row.id, what);
    const date = day(row.date, what);
    const ratio = num(row.ratio);
    if (ratio === null || ratio <= 0 || ratio > MAX_RATIO || Math.abs(ratio - 1) < EPS) {
      errors.push(`${what}: enter the new shares per old share, like 4 for a 4-for-1 split or 0.1 for 1-for-10.`);
      return;
    }
    if (splitId && date) splits.push({ id: splitId, date, ratio });
  });

  return { entry: { ticker, buys, sells, splits }, errors };
}

/** Reads the stored field, dropping anything malformed. Never throws. */
export function readTaxLotsField(raw: unknown, today: string): TaxLotsField {
  const out: TaxLotsField = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [instrumentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^US_[A-Z0-9_]+$/.test(instrumentId)) continue;
    const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const ticker = typeof row.ticker === "string" && row.ticker.trim() ? row.ticker.trim().toUpperCase() : tickerOf(instrumentId);
    // Stored rows were validated on the way in; a far-future "today" keeps a
    // clock difference from dropping a trade made today.
    const { entry } = parseTaxLotEntry(row, addDays(today, 2), ticker);
    out[instrumentId] = { ...entry, updated_at: typeof row.updated_at === "string" ? row.updated_at : null };
  }
  return out;
}

export function tickerOf(instrumentId: string): string {
  return instrumentId.split("_").slice(1).join(".");
}

/* ── Matching ──────────────────────────────────────────────────────────── */

export type OpenLot = {
  instrumentId: string;
  ticker: string;
  lotId: string;
  /** null for a holding entered without a buy date. */
  acquired: string | null;
  /** Shares still held, in today's (post-split) units. */
  shares: number;
  /** Dollars of basis still held, fees included. */
  basis: number;
  costPerShare: number;
  fromHolding: boolean;
};

export type WashSale = {
  /** Sale date minus 30 days and plus 30 days, both included. */
  windowStart: string;
  windowEnd: string;
  /** Buys of the same ticker inside the window, other than the lots this sale closed. */
  buys: Array<{ lotId: string; date: string; shares: number }>;
  /** Replacement shares matched to this loss (one replacement share covers one sold share). */
  replacementShares: number;
  /** Loss that may be disallowed: loss x replacement shares / shares sold. An estimate. */
  disallowed: number;
};

export type RealisedPiece = {
  key: string;
  instrumentId: string;
  ticker: string;
  sellId: string;
  /** null when the sell had more shares than the lots could cover. */
  lotId: string | null;
  acquired: string | null;
  sold: string;
  shares: number;
  proceeds: number;
  basis: number | null;
  gain: number | null;
  term: Term;
  taxYear: number;
  method: "fifo" | "specific";
  washSale: WashSale | null;
};

export type TaxIssue =
  | { kind: "oversold"; instrumentId: string; ticker: string; sellId: string; date: string; shares: number }
  | { kind: "pick_short"; instrumentId: string; ticker: string; sellId: string; date: string; lotId: string; shares: number };

export type InstrumentTax = {
  instrumentId: string;
  ticker: string;
  open: OpenLot[];
  realised: RealisedPiece[];
  issues: TaxIssue[];
  /** Every buy as entered, for wash-sale checks and the lot list. */
  buys: TaxBuy[];
  splits: TaxSplit[];
  fromHolding: boolean;
};

type WorkingLot = OpenLot & { order: number };

type Event =
  | { type: "split"; date: string; order: number; split: TaxSplit }
  | { type: "buy"; date: string; order: number; buy: TaxBuy }
  | { type: "sell"; date: string; order: number; sell: TaxSell };

const EVENT_RANK: Record<Event["type"], number> = { split: 0, buy: 1, sell: 2 };

function fifoOrder(a: WorkingLot, b: WorkingLot): number {
  // A holding without a buy date is assumed to be the oldest shares.
  if (a.acquired === null && b.acquired !== null) return -1;
  if (b.acquired === null && a.acquired !== null) return 1;
  if (a.acquired !== b.acquired) return (a.acquired ?? "") < (b.acquired ?? "") ? -1 : 1;
  return a.order - b.order;
}

/**
 * Turns an old single-cost holding into one lot with no buy date. Used only
 * when the holding has no lots of its own.
 */
export function holdingAsLot(holding: LegacyHolding | null | undefined): TaxBuy | null {
  const shares = num(holding?.quantity);
  const cost = num(holding?.average_cost);
  if (shares === null || shares <= 0 || cost === null || cost < 0) return null;
  return { id: HOLDING_LOT_ID, date: "", shares, price: cost };
}

/**
 * Matches one holding's sells to its lots. Order of a day: splits first (they
 * take effect at the open), then buys, then sells.
 */
export function computeInstrument(
  instrumentId: string,
  entry: TaxLotEntry | null | undefined,
  holding?: LegacyHolding | null,
): InstrumentTax {
  const ticker = entry?.ticker || tickerOf(instrumentId);
  const buys = entry?.buys ?? [];
  const sells = entry?.sells ?? [];
  const splits = entry?.splits ?? [];
  const legacy = buys.length === 0 && sells.length === 0 ? holdingAsLot(holding) : null;

  const lots: WorkingLot[] = [];
  const realised: RealisedPiece[] = [];
  const issues: TaxIssue[] = [];

  if (legacy) {
    lots.push({
      instrumentId,
      ticker,
      lotId: HOLDING_LOT_ID,
      acquired: null,
      shares: legacy.shares,
      basis: legacy.shares * legacy.price,
      costPerShare: legacy.price,
      fromHolding: true,
      order: -1,
    });
  }

  const events: Event[] = [
    ...splits.map((split, order) => ({ type: "split" as const, date: split.date, order, split })),
    ...buys.map((buy, order) => ({ type: "buy" as const, date: buy.date, order, buy })),
    ...sells.map((sell, order) => ({ type: "sell" as const, date: sell.date, order, sell })),
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : EVENT_RANK[a.type] - EVENT_RANK[b.type] || a.order - b.order));

  for (const event of events) {
    if (event.type === "split") {
      for (const lot of lots) {
        if (lot.shares <= EPS) continue;
        lot.shares *= event.split.ratio;
        lot.costPerShare = lot.basis / lot.shares;
      }
      continue;
    }
    if (event.type === "buy") {
      const { buy } = event;
      const basis = buy.shares * buy.price + (buy.fee ?? 0);
      lots.push({
        instrumentId,
        ticker,
        lotId: buy.id,
        acquired: buy.date,
        shares: buy.shares,
        basis,
        costPerShare: basis / buy.shares,
        fromHolding: false,
        order: event.order,
      });
      continue;
    }

    const { sell } = event;
    const feePerShare = (sell.fee ?? 0) / sell.shares;
    let left = sell.shares;
    let piece = 0;
    const take = (lot: WorkingLot, wanted: number) => {
      const shares = Math.min(wanted, lot.shares);
      if (shares <= EPS) return 0;
      const whole = lot.shares - shares <= EPS;
      const basis = whole ? lot.basis : (lot.basis * shares) / lot.shares;
      lot.basis = whole ? 0 : lot.basis - basis;
      lot.shares = whole ? 0 : lot.shares - shares;
      const proceeds = shares * (sell.price - feePerShare);
      realised.push({
        key: `${instrumentId}:${sell.id}:${piece++}`,
        instrumentId,
        ticker,
        sellId: sell.id,
        lotId: lot.lotId,
        acquired: lot.acquired,
        sold: sell.date,
        shares,
        proceeds,
        basis,
        gain: proceeds - basis,
        term: holdingTerm(lot.acquired, sell.date),
        taxYear: Number(sell.date.slice(0, 4)),
        method: sell.method,
        washSale: null,
      });
      return shares;
    };

    if (sell.method === "specific") {
      for (const pick of sell.picks ?? []) {
        if (left <= EPS) break;
        const lot = lots.find((candidate) => candidate.lotId === pick.lot_id);
        const wanted = Math.min(pick.shares, left);
        const usable = lot && (lot.acquired === null || lot.acquired <= sell.date) ? lot : null;
        const got = usable ? take(usable, wanted) : 0;
        left -= got;
        if (wanted - got > EPS) {
          issues.push({ kind: "pick_short", instrumentId, ticker, sellId: sell.id, date: sell.date, lotId: pick.lot_id, shares: wanted - got });
        }
      }
    }
    // FIFO for a FIFO sell, and for whatever a specific sell's picks did not cover.
    if (left > EPS) {
      const open = lots.filter((lot) => lot.shares > EPS && (lot.acquired === null || lot.acquired <= sell.date)).sort(fifoOrder);
      for (const lot of open) {
        if (left <= EPS) break;
        left -= take(lot, left);
      }
    }
    if (left > EPS) {
      issues.push({ kind: "oversold", instrumentId, ticker, sellId: sell.id, date: sell.date, shares: left });
      realised.push({
        key: `${instrumentId}:${sell.id}:${piece++}`,
        instrumentId,
        ticker,
        sellId: sell.id,
        lotId: null,
        acquired: null,
        sold: sell.date,
        shares: left,
        proceeds: left * (sell.price - feePerShare),
        basis: null,
        gain: null,
        term: "unknown",
        taxYear: Number(sell.date.slice(0, 4)),
        method: sell.method,
        washSale: null,
      });
    }
  }

  markWashSales(realised, buys);

  const open = lots
    .filter((lot) => lot.shares > EPS)
    .sort(fifoOrder)
    .map(({ order: _order, ...lot }) => lot);
  return { instrumentId, ticker, open, realised, issues, buys, splits, fromHolding: Boolean(legacy) };
}

/**
 * Flags loss pieces that have a buy of the same ticker within 30 days before
 * or after the sale. Each replacement share is matched to one loss share,
 * oldest loss first, which is how the disallowed amount is estimated. The lots
 * a sale closes are never their own replacement.
 */
function markWashSales(realised: RealisedPiece[], buys: TaxBuy[]): void {
  if (buys.length === 0) return;
  const capacity = new Map(buys.map((buy) => [buy.id, buy.shares]));
  const closedBySell = new Map<string, Set<string>>();
  for (const piece of realised) {
    if (!piece.lotId) continue;
    const set = closedBySell.get(piece.sellId) ?? new Set<string>();
    set.add(piece.lotId);
    closedBySell.set(piece.sellId, set);
  }
  const losses = realised
    .filter((piece) => piece.gain !== null && piece.gain < -EPS)
    .sort((a, b) => (a.sold !== b.sold ? (a.sold < b.sold ? -1 : 1) : 0));
  for (const piece of losses) {
    const windowStart = addDays(piece.sold, -WASH_SALE_DAYS);
    const windowEnd = addDays(piece.sold, WASH_SALE_DAYS);
    const closed = closedBySell.get(piece.sellId) ?? new Set<string>();
    const inWindow = buys
      .filter((buy) => buy.date >= windowStart && buy.date <= windowEnd && !closed.has(buy.id))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (inWindow.length === 0) continue;
    let need = piece.shares;
    let matched = 0;
    for (const buy of inWindow) {
      if (need <= EPS) break;
      const left = capacity.get(buy.id) ?? 0;
      const used = Math.min(left, need);
      capacity.set(buy.id, left - used);
      need -= used;
      matched += used;
    }
    piece.washSale = {
      windowStart,
      windowEnd,
      buys: inWindow.map((buy) => ({ lotId: buy.id, date: buy.date, shares: buy.shares })),
      replacementShares: matched,
      disallowed: piece.gain !== null ? (-piece.gain * matched) / piece.shares : 0,
    };
  }
}

/* ── Today's picture ───────────────────────────────────────────────────── */

export type HarvestRow = OpenLot & {
  price: number;
  value: number;
  /** Negative: the loss if sold at the price. */
  loss: number;
  lossPct: number;
  term: Term;
  /** First day the lot turns long term; null when already long or unknown. */
  longTermOn: string | null;
  /** Buys of this ticker in the last 30 days, other than this lot. Selling now at a loss would be a possible wash sale. */
  recentBuys: Array<{ lotId: string; date: string }>;
  /** Selling today: do not buy the same ticker through this day. */
  holdBackUntil: string;
};

export function harvestRows(
  results: InstrumentTax[],
  prices: Map<string, number>,
  today: string,
): HarvestRow[] {
  const rows: HarvestRow[] = [];
  for (const result of results) {
    const price = prices.get(result.instrumentId);
    if (price === undefined || !Number.isFinite(price) || price <= 0) continue;
    const recentFrom = addDays(today, -WASH_SALE_DAYS);
    for (const lot of result.open) {
      const value = lot.shares * price;
      const loss = value - lot.basis;
      if (loss >= -0.005) continue;
      const term = holdingTerm(lot.acquired, today);
      rows.push({
        ...lot,
        price,
        value,
        loss,
        lossPct: lot.basis > 0 ? (loss / lot.basis) * 100 : 0,
        term,
        longTermOn: term === "short" && lot.acquired ? longTermFrom(lot.acquired) : null,
        recentBuys: result.buys
          .filter((buy) => buy.id !== lot.lotId && buy.date >= recentFrom && buy.date <= today)
          .map((buy) => ({ lotId: buy.id, date: buy.date })),
        holdBackUntil: addDays(today, WASH_SALE_DAYS),
      });
    }
  }
  return rows.sort((a, b) => a.loss - b.loss);
}

export type TermTotals = { short: number; long: number; unknown: number; total: number };

export type YearSummary = TermTotals & {
  year: number;
  proceeds: number;
  basis: number;
  /** Pieces whose basis is unknown (sold more than the lots cover). */
  unmatched: number;
  /** Sales (not lot pieces) with at least one possible wash sale. */
  washSales: number;
  washDisallowed: number;
};

function emptyTotals(): TermTotals {
  return { short: 0, long: 0, unknown: 0, total: 0 };
}

export function summariseYears(realised: RealisedPiece[]): YearSummary[] {
  const byYear = new Map<number, YearSummary>();
  const washSells = new Set<string>();
  for (const piece of realised) {
    const year =
      byYear.get(piece.taxYear) ??
      ({ year: piece.taxYear, ...emptyTotals(), proceeds: 0, basis: 0, unmatched: 0, washSales: 0, washDisallowed: 0 } as YearSummary);
    year.proceeds += piece.proceeds;
    if (piece.gain === null || piece.basis === null) {
      year.unmatched += 1;
    } else {
      year.basis += piece.basis;
      year[piece.term] += piece.gain;
      year.total += piece.gain;
    }
    if (piece.washSale) {
      const sale = `${piece.instrumentId}:${piece.sellId}`;
      if (!washSells.has(sale)) {
        washSells.add(sale);
        year.washSales += 1;
      }
      year.washDisallowed += piece.washSale.disallowed;
    }
    byYear.set(piece.taxYear, year);
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export function harvestTotals(rows: HarvestRow[]): TermTotals {
  const totals = emptyTotals();
  for (const row of rows) {
    totals[row.term] += row.loss;
    totals.total += row.loss;
  }
  return totals;
}

export type TaxPicture = {
  today: string;
  instruments: InstrumentTax[];
  realised: RealisedPiece[];
  years: YearSummary[];
  harvest: HarvestRow[];
  harvestTotals: TermTotals;
  issues: TaxIssue[];
  /** Holdings counted from an old single cost, with no buy date. */
  undatedHoldings: number;
  /** Instruments with open lots but no current price. */
  unpriced: string[];
};

/**
 * Everything the tax view shows. `holdings` are the old single-cost holdings
 * (`watchlist_holdings`); one counts only for instruments marked as a
 * holding that have no lots of their own.
 */
export function buildTaxPicture({
  lots,
  holdings,
  prices,
  today,
}: {
  lots: TaxLotsField;
  holdings?: Record<string, LegacyHolding | undefined> | null;
  prices: Map<string, number>;
  today: string;
}): TaxPicture {
  const ids = new Set<string>(Object.keys(lots));
  for (const [id, holding] of Object.entries(holdings ?? {})) {
    if (id.startsWith("US_") && holdingAsLot(holding)) ids.add(id);
  }
  const instruments = [...ids]
    .map((id) => computeInstrument(id, lots[id] ?? null, holdings?.[id] ?? null))
    .filter((result) => result.open.length > 0 || result.realised.length > 0)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const realised = instruments
    .flatMap((result) => result.realised)
    .sort((a, b) => (a.sold !== b.sold ? (a.sold < b.sold ? 1 : -1) : a.ticker.localeCompare(b.ticker)));
  const harvest = harvestRows(instruments, prices, today);
  return {
    today,
    instruments,
    realised,
    years: summariseYears(realised),
    harvest,
    harvestTotals: harvestTotals(harvest),
    issues: instruments.flatMap((result) => result.issues),
    undatedHoldings: instruments.filter((result) => result.fromHolding).length,
    unpriced: instruments.filter((result) => result.open.length > 0 && !prices.has(result.instrumentId)).map((result) => result.ticker),
  };
}

/* ── Export ────────────────────────────────────────────────────────────── */

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "number" ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : value;
  // Leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function sharesText(shares: number): string {
  return Number.isInteger(shares) ? String(shares) : String(Number(shares.toFixed(6)));
}

export const TERM_LABEL: Record<Term, string> = { short: "Short term", long: "Long term", unknown: "Unknown" };

/**
 * Realised gains as CSV, one row per lot closed, columns in the order of IRS
 * Form 8949. Wash sales are flagged with the estimated disallowed amount, not
 * applied, so the gain column is the plain arithmetic.
 */
export function realisedCsv(pieces: RealisedPiece[]): string {
  const header = [
    "Description",
    "Date acquired",
    "Date sold",
    "Proceeds",
    "Cost basis",
    "Gain or loss",
    "Term",
    "Tax year",
    "Lot matching",
    "Possible wash sale",
    "Wash-sale window",
    "Loss possibly disallowed",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const piece of pieces) {
    lines.push(
      [
        `${sharesText(piece.shares)} sh ${piece.ticker}`,
        piece.acquired ?? (piece.lotId === null ? "Not matched" : "Not entered"),
        piece.sold,
        piece.proceeds,
        piece.basis,
        piece.gain,
        TERM_LABEL[piece.term],
        piece.taxYear,
        piece.method === "specific" ? "Specific lots" : "First in, first out",
        piece.washSale ? "Yes" : "No",
        piece.washSale ? `${piece.washSale.windowStart} to ${piece.washSale.windowEnd}` : "",
        piece.washSale ? piece.washSale.disallowed : null,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
