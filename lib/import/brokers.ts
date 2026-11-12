/**
 * Broker CSV exports into holdings, by rules (no model).
 *
 * Each big US broker exports positions in its own layout. We tell them apart
 * by their header row, read ticker, shares and cost (per share, or the total
 * divided by shares), and leave out what is not a stock or fund position:
 * cash, money market funds, options, bonds, totals and short positions. Every
 * line left out is reported with its reason, so the person sees what we
 * skipped and why.
 *
 * Robinhood and Webull export trades, not positions: their buys and sells are
 * added up, and each row comes back as "medium" so the review asks for a look.
 *
 * A CSV we do not recognise can still be read once the person picks its ticker
 * and shares columns (csvTable, guessColumns, parseMappedCsv).
 *
 * Pure, with no server imports: the browser reads a dropped file with it, and
 * the parse route reads pasted text with it.
 */

import { cleanTicker, foreignCurrency, LIMITS, MAX_IMPORT_ROWS, parseAmount, type ParsedHolding } from "@/lib/import/normalize";

export type BrokerId = "fidelity" | "schwab" | "vanguard" | "robinhood" | "etrade" | "morganstanley" | "ibkr" | "webull" | "m1" | "generic" | "mapped";

/** How the broker is named back to the person ("your Fidelity export"). Generic and mapped files have no name. */
export const BROKER_NAMES: Record<BrokerId, string | null> = {
  fidelity: "Fidelity",
  schwab: "Schwab",
  vanguard: "Vanguard",
  robinhood: "Robinhood",
  etrade: "E*TRADE",
  morganstanley: "Morgan Stanley",
  ibkr: "Interactive Brokers",
  webull: "Webull",
  m1: "M1",
  generic: null,
  mapped: null,
};

/**
 * cash:      cash, sweep and money market lines.
 * option:    calls and puts.
 * not-stock: bonds, CDs, treasuries, futures, forex, crypto.
 * no-ticker: a position line without a symbol we can read.
 * short:     a negative share count.
 * closed:    zero shares, or (in a trades file) everything bought was sold.
 * total:     account totals and pending activity.
 */
export type SkipReason = "cash" | "option" | "not-stock" | "no-ticker" | "short" | "closed" | "total";

export type SkippedRow = { label: string; reason: SkipReason };

export type BrokerCsv = {
  broker: BrokerId;
  rows: ParsedHolding[];
  skipped: SkippedRow[];
  /** The file lists trades, and the shares are what its buys and sells add up to. */
  trades: boolean;
  /** Holdings past MAX_IMPORT_ROWS that were not read. */
  truncated: number;
};

/** Biggest file we read in the browser. A full export of a few hundred positions is well under this. */
export const MAX_CSV_BYTES = 2_000_000;

/* ── reading the file ──────────────────────────────────────────────────── */

/** The delimiter used most outside quotes over the first lines: comma, tab, semicolon or pipe. */
function pickDelimiter(text: string): string {
  const sample = text.slice(0, 8000);
  let best = ",";
  let bestCount = 0;
  for (const d of [",", "\t", ";", "|"]) {
    let count = 0;
    let quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === d) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** The whole text into rows of cells. Quoted cells may hold delimiters, doubled quotes and line breaks. */
export function readCsvRows(text: string): string[][] {
  return readCsv(text).rows;
}

/**
 * The rows, and whether numbers are written with a decimal comma. A file split
 * by semicolons comes from a European locale, where "1.234,56" is 1234.56.
 */
function readCsv(text: string): { rows: string[][]; decimalComma: boolean } {
  const body = text.replace(/^\uFEFF/, "");
  const delimiter = pickDelimiter(body);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return { rows, decimalComma: delimiter === ";" };
}

/**
 * A number from a cell. With a decimal comma, "1.234,56" is 1234.56 and
 * "10,5" is 10.5; "1.234" could be either, so it is read as 1234 and called
 * ambiguous, and its row is marked for a look.
 */
function amount(raw: string, decimalComma: boolean): { value: number | null; ambiguous: boolean } {
  if (!decimalComma) return { value: parseAmount(raw), ambiguous: false };
  const text = raw.trim();
  if (text.includes(",")) return { value: parseAmount(text.replace(/\./g, "").replace(",", ".")), ambiguous: false };
  if (/^[^\d]*\d{1,3}(\.\d{3})+[^\d]*$/.test(text)) return { value: parseAmount(text.replace(/\./g, "")), ambiguous: true };
  return { value: parseAmount(text), ambiguous: false };
}

/** A header cell as we compare it: lowercase, without $, # and *, spaces collapsed. */
function norm(cell: string): string {
  return cell.toLowerCase().replace(/[$#*]/g, "").replace(/\s+/g, " ").trim();
}

const blank = (row: string[]) => row.every((cell) => !cell.trim());

/* ── the layouts ───────────────────────────────────────────────────────── */

type Role = "ticker" | "name" | "shares" | "avgCost" | "costTotal" | "value" | "type" | "currency" | "detail" | "date" | "side" | "status" | "price";

type Candidates = Array<string | RegExp>;

type Layout = {
  id: BrokerId;
  /** Is this row (normalised cells) this broker's header? */
  detect: (cells: string[]) => boolean;
  cols: Partial<Record<Role, Candidates>>;
  /** A file of trades (buys and sells), not positions. */
  trades?: "robinhood" | "webull";
  /** Asset types that are stocks or funds; anything else in the type column is left out. */
  stockTypes?: RegExp;
};

const has = (cells: string[], ...names: string[]) => names.every((name) => cells.includes(name));
const hasAny = (cells: string[], ...names: string[]) => names.some((name) => cells.includes(name));

const GENERIC_TICKER = /^(symbol|ticker|stock symbol|security symbol|symbol\/cusip|instrument)$/;
/** Share-count headers, most certain first: "position" is last, since some files use it for a position's value. */
const GENERIC_SHARES_ORDER: RegExp[] = [/^(quantity|qty|qty \(quantity\))$/, /^(shares|share count|shares held|no\.? of shares)$/, /^units$/, /^position$/];
const isSharesHeader = (cell: string) => GENERIC_SHARES_ORDER.some((re) => re.test(cell));
const GENERIC_AVG = /^(avg\.? cost|average cost|avg\.? price|average price|cost per share|avg cost\/share|average cost basis|price paid|cost basis per share|purchase price|avg\.? buy price|unit cost|cost price)$/;

/**
 * Most specific first. The layouts are the column headers each broker's
 * positions download uses (see lib/import/broker-fixtures.ts for one of each).
 */
const LAYOUTS: Layout[] = [
  {
    // Fidelity, Positions > Download. Its "Type" column is the account type (Cash, Margin), not the security's.
    id: "fidelity",
    detect: (c) => has(c, "symbol", "quantity") && hasAny(c, "average cost basis", "cost basis total") && hasAny(c, "account number", "account name", "current value"),
    cols: { ticker: ["symbol"], name: ["description"], shares: ["quantity"], avgCost: ["average cost basis"], costTotal: ["cost basis total"], value: ["current value"] },
  },
  {
    // Schwab, Positions > Export. Newer files write "Qty (Quantity)" and "Mkt Val (Market Value)".
    id: "schwab",
    detect: (c) => has(c, "symbol", "description", "security type") && hasAny(c, "qty (quantity)", "quantity"),
    cols: {
      ticker: ["symbol"],
      name: ["description"],
      shares: ["qty (quantity)", "quantity"],
      costTotal: ["cost basis"],
      value: ["mkt val (market value)", "market value"],
      type: ["security type"],
    },
    stockTypes: /equity|etf|closed end|mutual fund|stock/i,
  },
  {
    // Vanguard, Download center > holdings (OfxDownload.csv). The trades section that follows is not read.
    id: "vanguard",
    detect: (c) => has(c, "investment name", "symbol", "shares") && hasAny(c, "share price", "total value"),
    cols: { ticker: ["symbol"], name: ["investment name"], shares: ["shares"], value: ["total value"] },
  },
  {
    // E*TRADE (Morgan Stanley), Portfolios > Download: "Qty #" and "Price Paid $" per share.
    id: "etrade",
    detect: (c) => has(c, "symbol", "price paid") && hasAny(c, "qty", "quantity"),
    cols: { ticker: ["symbol"], shares: ["qty", "quantity"], avgCost: ["price paid"], value: ["value"] },
  },
  {
    // Morgan Stanley Online, Holdings > Export.
    id: "morganstanley",
    detect: (c) => hasAny(c, "symbol", "symbol/cusip") && has(c, "quantity", "unit cost"),
    cols: { ticker: ["symbol", "symbol/cusip"], name: ["description", "security description"], shares: ["quantity"], avgCost: ["unit cost"], costTotal: ["total cost"], value: ["value", "market value"] },
  },
  {
    // Interactive Brokers Flex Query, Open Positions section.
    id: "ibkr",
    detect: (c) => has(c, "assetclass", "symbol") && hasAny(c, "quantity", "position"),
    cols: {
      ticker: ["symbol"],
      name: ["description"],
      shares: ["quantity", "position"],
      avgCost: ["costbasisprice"],
      costTotal: ["costbasismoney"],
      value: ["positionvalue"],
      type: ["assetclass"],
      currency: ["currencyprimary", "currency"],
      detail: ["levelofdetail"],
    },
    stockTypes: /^(stk|fund|stocks?)$/i,
  },
  {
    // M1, Holdings > Download CSV.
    id: "m1",
    detect: (c) => hasAny(c, "ticker", "symbol") && hasAny(c, "shares", "quantity") && hasAny(c, "avg. price", "avg price", "average price") && hasAny(c, "unrealized gain", "cost basis", "value"),
    cols: { ticker: ["ticker", "symbol"], name: ["name"], shares: ["shares", "quantity"], avgCost: ["avg. price", "avg price", "average price"], costTotal: ["cost basis"], value: ["value", "market value"] },
  },
  {
    // Robinhood, Reports > Account activity: trades, not positions.
    id: "robinhood",
    detect: (c) => has(c, "activity date", "instrument", "trans code", "quantity"),
    cols: { date: ["activity date"], ticker: ["instrument"], name: ["description"], type: ["trans code"], shares: ["quantity"], price: ["price"] },
    trades: "robinhood",
  },
  {
    // Webull, Orders > History > Export: orders, not positions.
    id: "webull",
    detect: (c) => has(c, "symbol", "side", "status", "filled") && hasAny(c, "avg price", "price"),
    cols: { ticker: ["symbol"], name: ["name"], side: ["side"], status: ["status"], shares: ["filled"], price: ["avg price", "price"], date: ["filled time", "placed time"] },
    trades: "webull",
  },
  {
    // Anything else with a ticker column and a shares column we can name.
    id: "generic",
    detect: (c) => c.some((cell) => GENERIC_TICKER.test(cell)) && c.some(isSharesHeader),
    cols: {
      ticker: [GENERIC_TICKER],
      name: [/^(description|name|security|security name|company|stock|instrument name|investment name)$/],
      shares: GENERIC_SHARES_ORDER,
      avgCost: [GENERIC_AVG],
      costTotal: [/^(cost basis|cost basis total|total cost|book value|cost)$/],
      value: [/^(market value|current value|value|mkt value|market val\.?|total value|equity)$/],
      type: [/^(security type|asset class|asset type|type)$/],
      currency: [/^(currency|ccy)$/],
    },
    stockTypes: /equity|etf|stock|fund|stk|share/i,
  },
];

function findColumn(header: string[], candidates: Candidates | undefined): number {
  if (!candidates) return -1;
  for (const candidate of candidates) {
    const at = header.findIndex((cell) => (typeof candidate === "string" ? cell === candidate : candidate.test(cell)));
    if (at >= 0) return at;
  }
  return -1;
}

/* ── what a line is ────────────────────────────────────────────────────── */

const TOTAL_LINE = /^(account total|total|totals|grand total|pending activity|pending|net account value)$/i;
const CASH_WORDS = /\b(money market|held in money market|cash & cash investments|cash and money market|core position|sweep|fdic|bank deposit|buying power)\b|\bbank\b.*\bdeposits?\b/i;
/** Money market mutual funds are five letters ending in XX (SPAXX, VMFXX, SWVXX). */
const MONEY_MARKET_TICKER = /^[A-Z]{3}XX$/;
const OPTION_TYPE = /option/i;
const OTHER_TYPE = /bond|fixed income|treasur|certificate|\bcds?\b|futures?|forex|\bfx\b|crypto|warrant|annuit|\bopt\b|\bfop\b|\bfut\b|\bcash\b/i;

function looksLikeOption(symbol: string, name: string): boolean {
  const compact = symbol.replace(/\s+/g, "");
  return (
    // OCC style, with or without padding or a leading dash: -AAPL250117C200, AAPL  250117C00200000
    /^-?[A-Z]{1,6}\d{6}[CP]\d/.test(compact) ||
    // Schwab: AAPL 01/17/2025 200.00 C
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*\b(C|P|CALL|PUT)\b/i.test(symbol) ||
    // Interactive Brokers: AAPL 17JAN25 200 C
    /\b\d{1,2}[A-Z]{3}\d{2}\b.*\b[CP]\b/.test(symbol) ||
    // Robinhood's description: AAPL 1/17/2025 Call $200.00
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b.*\b(call|put)\b/i.test(name)
  );
}

/** A CUSIP (nine characters with digits) where a symbol should be: a bond or a CD. */
const CUSIP = /^(?=.*\d)[0-9]{3}[0-9A-Z]{5}[0-9]$/;

type Lot = { ticker: string; name: string | null; shares: number; averageCost: number | null; marketValue: number | null; currency?: string; confidence: "high" | "medium" };

function positive(value: number | null, max: number): number | null {
  return value !== null && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

function round(value: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function cleanName(raw: string): string | null {
  // Robinhood writes "Apple\nCUSIP: 037833100": the first line is the name.
  const name = raw.split(/\r?\n/)[0]!.replace(/\s+/g, " ").trim();
  return name && name.length <= 80 && !/^[-–—]+$/.test(name) ? name : null;
}

/** Where a cell's line is not a position, the reason; else null. */
function classify(symbol: string, name: string, type: string, layout: Layout): SkipReason | null {
  if (TOTAL_LINE.test(symbol) || (!symbol && TOTAL_LINE.test(name))) return "total";
  if ((type && OPTION_TYPE.test(type)) || looksLikeOption(symbol, name)) return "option";
  const bare = symbol.toUpperCase().replace(/\*+$/, "").trim();
  // CASH is also a listed stock (Pathward Financial): a cash line only when nothing else names it, or names cash.
  const cashTicker = /^(fcash|core)$/i.test(bare) || (bare === "CASH" && (!name.trim() || /^cash\b/i.test(name) || CASH_WORDS.test(name)));
  if (symbol.endsWith("**") || cashTicker || MONEY_MARKET_TICKER.test(bare) || CASH_WORDS.test(symbol) || CASH_WORDS.test(name) || /money market|^cash/i.test(type)) {
    return "cash";
  }
  if (type && layout.stockTypes && !layout.stockTypes.test(type) && OTHER_TYPE.test(type)) return "not-stock";
  if (CUSIP.test(symbol.toUpperCase())) return "not-stock";
  return null;
}

/* ── positions ─────────────────────────────────────────────────────────── */

type Parsed = { lots: Lot[]; skipped: SkippedRow[] };

/** Values of an account-type column (Cash, Margin, IRA), which says nothing about the security on the line. */
const ACCOUNT_TYPE = /^(cash|margin|ira|roth( ira)?|individual|joint|type ?[0-9]|short|--|-)$/i;

function readPositions(header: string[], body: string[][], layout: Layout, raw: string[], decimalComma = false): Parsed {
  const at = (role: Role) => findColumn(header, layout.cols[role]);
  const col = { ticker: at("ticker"), name: at("name"), shares: at("shares"), avgCost: at("avgCost"), costTotal: at("costTotal"), value: at("value"), type: at("type"), currency: at("currency"), detail: at("detail") };
  // A guessed "Type" column in a file we do not know may be the account type: then it is not read at all.
  if ((layout.id === "generic" || layout.id === "mapped") && col.type >= 0) {
    const values = body.map((row) => (row[col.type] ?? "").trim()).filter(Boolean);
    if (values.length === 0 || values.every((value) => ACCOUNT_TYPE.test(value))) col.type = -1;
  }
  const num = (text: string) => amount(text, decimalComma);
  const lots: Lot[] = [];
  const skipped: SkippedRow[] = [];
  let started = false;
  for (const row of body) {
    if (blank(row)) {
      // Vanguard's trades section starts after a blank line.
      if (layout.id === "vanguard" && started) break;
      continue;
    }
    const cells = row.map(norm);
    // The same header again (a file with one section per account), or the start of another section.
    if (cells.join("|") === raw.map(norm).join("|")) continue;
    if (has(cells, "trade date") || has(cells, "transaction type") || has(cells, "settlement date")) break;
    // A title or a disclaimer: one cell on its own line.
    if (row.filter((cell) => cell.trim()).length < 2) continue;
    started = true;
    const cell = (index: number) => (index >= 0 ? row[index] ?? "" : "");
    // IBKR Flex: lot lines repeat the summary line's shares.
    if (col.detail >= 0 && /^lot$/i.test(cell(col.detail))) continue;
    const symbol = cell(col.ticker).trim();
    const name = cleanName(cell(col.name));
    const type = cell(col.type).trim();
    const label = symbol || name || "";
    const reason = classify(symbol, name ?? "", type, layout);
    if (reason) {
      skipped.push({ label, reason });
      continue;
    }
    const ticker = cleanTicker(symbol);
    if (!ticker) {
      skipped.push({ label, reason: "no-ticker" });
      continue;
    }
    const sharesRead = num(cell(col.shares));
    const sharesRaw = sharesRead.value;
    if (sharesRaw !== null && sharesRaw < 0) {
      skipped.push({ label: ticker, reason: "short" });
      continue;
    }
    if (sharesRaw === 0) {
      skipped.push({ label: ticker, reason: "closed" });
      continue;
    }
    const shares = positive(sharesRaw, LIMITS.shares);
    const currency = foreignCurrency(cell(col.currency)) ?? undefined;
    const costRead = num(cell(col.avgCost));
    const totalRead = num(cell(col.costTotal));
    const valueRead = num(cell(col.value));
    const ambiguous = sharesRead.ambiguous || costRead.ambiguous || totalRead.ambiguous;
    let averageCost = currency ? null : positive(costRead.value, LIMITS.price);
    const costTotal = currency ? null : positive(totalRead.value, LIMITS.value);
    if (averageCost === null && costTotal !== null && shares !== null) averageCost = positive(round(costTotal / shares), LIMITS.price);
    lots.push({
      ticker,
      name,
      // A line with no readable share count stays, so the person can type it in.
      shares: shares ?? 0,
      averageCost,
      marketValue: currency ? null : positive(valueRead.value, LIMITS.value),
      ...(currency ? { currency } : {}),
      confidence: currency || ambiguous || (sharesRaw !== null && shares === null) ? "medium" : "high",
    });
  }
  return { lots, skipped };
}

/* ── trades (Robinhood, Webull) ────────────────────────────────────────── */

/** "11/3/2026", "2026-11-03", "11/03/2026 09:31:02 EST" into a sortable number; 0 when unreadable. */
function dateKey(raw: string): number {
  const us = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (us) {
    const year = us[3]!.length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return Date.UTC(year, Number(us[1]) - 1, Number(us[2]), Number(us[4] ?? 0), Number(us[5] ?? 0), Number(us[6] ?? 0));
  }
  const iso = Date.parse(raw);
  return Number.isFinite(iso) ? iso : 0;
}

type Trade = { ticker: string; name: string | null; qty: number; price: number | null; when: number; order: number; split: boolean };

const RH_OPTION_CODES = /^(BTO|STO|BTC|STC|OEXP|OASGN|OEXCS|OCA)$/i;
const RH_IN = /^(BUY|SPL|REC|ACATI)$/i;
const RH_OUT = /^(SELL|ACATO)$/i;
/** Merges, share exchanges, conversions and reverse splits: in or out depends on the line, so its sign decides. */
const RH_SIGNED = /^(MRGS|SXCH|CONV|SPR)$/i;

function readTrades(header: string[], body: string[][], layout: Layout, decimalComma = false): Parsed {
  const at = (role: Role) => findColumn(header, layout.cols[role]);
  const col = { ticker: at("ticker"), name: at("name"), type: at("type"), shares: at("shares"), price: at("price"), date: at("date"), side: at("side"), status: at("status"), amount: findColumn(header, ["amount"]) };
  const num = (text: string) => amount(text, decimalComma).value;
  const trades: Trade[] = [];
  const skipped: SkippedRow[] = [];
  body.forEach((row, order) => {
    if (blank(row) || row.filter((cell) => cell.trim()).length < 2) return;
    const cell = (index: number) => (index >= 0 ? row[index] ?? "" : "");
    const symbol = cell(col.ticker).trim();
    const name = cleanName(cell(col.name));
    // Robinhood may suffix a quantity ("0.5S"); Webull may prefix a price with "@".
    const qty = num(cell(col.shares).replace(/[^\d.,()\-−+]/g, ""));
    let direction = 0;
    let split = false;
    if (layout.trades === "robinhood") {
      const code = cell(col.type).trim();
      if (RH_OPTION_CODES.test(code)) {
        skipped.push({ label: name ?? symbol, reason: "option" });
        return;
      }
      split = /^SPL$/i.test(code);
      if (RH_IN.test(code)) direction = 1;
      else if (RH_OUT.test(code)) direction = -1;
      else if (RH_SIGNED.test(code)) {
        // Shares out show as a negative quantity, or as money received; shares in as money paid. Anything else is skipped.
        const money = num(cell(col.amount));
        direction = qty !== null && qty < 0 ? -1 : money !== null && money < 0 ? 1 : money !== null && money > 0 ? -1 : 0;
      }
    } else {
      if (!/^filled$/i.test(cell(col.status).trim())) return;
      const side = cell(col.side).trim();
      direction = /^buy/i.test(side) ? 1 : /^sell/i.test(side) ? -1 : 0;
    }
    // Dividends, interest, deposits and fees move money, not shares.
    if (direction === 0 || !symbol) return;
    if (looksLikeOption(symbol, name ?? "")) {
      skipped.push({ label: symbol, reason: "option" });
      return;
    }
    const ticker = cleanTicker(symbol);
    if (!ticker) {
      skipped.push({ label: symbol, reason: "no-ticker" });
      return;
    }
    if (qty === null || qty === 0) return;
    const price = positive(num(cell(col.price).replace(/^@/, "")), LIMITS.price);
    trades.push({ ticker, name, qty: Math.abs(qty) * direction, price, when: dateKey(cell(col.date)), order, split });
  });
  // Oldest first. Both brokers list the newest first, so a tie goes to the later line in the file.
  trades.sort((a, b) => a.when - b.when || b.order - a.order);
  const book = new Map<string, { name: string | null; shares: number; cost: number; costKnown: boolean }>();
  for (const trade of trades) {
    const held = book.get(trade.ticker) ?? { name: trade.name, shares: 0, cost: 0, costKnown: true };
    if (trade.qty > 0) {
      if (trade.price !== null) held.cost += trade.qty * trade.price;
      // A split adds shares at no cost, so the total cost stands. Any other line in without a price (a transfer, a
      // reward) has a cost we do not know, and averaging it in as free would understate the cost.
      else if (!trade.split) held.costKnown = false;
      held.shares += trade.qty;
    } else {
      const sold = Math.min(held.shares, -trade.qty);
      if (held.shares > 0) held.cost -= (held.cost / held.shares) * sold;
      held.shares -= sold;
    }
    if (held.shares <= 1e-9) {
      held.shares = 0;
      held.cost = 0;
      held.costKnown = true;
    }
    held.name = held.name ?? trade.name;
    book.set(trade.ticker, held);
  }
  const lots: Lot[] = [];
  for (const [ticker, held] of book) {
    if (held.shares <= 1e-9) {
      skipped.push({ label: ticker, reason: "closed" });
      continue;
    }
    const shares = round(held.shares, 6);
    lots.push({
      ticker,
      name: held.name,
      shares,
      averageCost: held.costKnown && held.cost > 0 ? positive(round(held.cost / held.shares), LIMITS.price) : null,
      marketValue: null,
      // Added up from trades, so the file may not go back to the first buy: the review asks for a look.
      confidence: "medium",
    });
  }
  return { lots, skipped };
}

/* ── Interactive Brokers activity statement ────────────────────────────── */

/**
 * The default IBKR activity statement: every line starts with its section
 * ("Open Positions") and kind ("Header", "Data", "Total"). Only the Summary
 * lines of Open Positions are read, each against the header line above it
 * (a statement can repeat the header with other columns).
 */
function readIbkrStatement(rows: string[][], decimalComma: boolean): Parsed | null {
  if (!rows.some((row) => row[0] === "Open Positions" && row[1] === "Header")) return null;
  const layout: Layout = {
    id: "ibkr",
    detect: () => true,
    cols: {
      ticker: ["symbol"],
      shares: ["quantity"],
      avgCost: ["cost price"],
      costTotal: ["cost basis"],
      value: ["value"],
      type: ["asset category"],
      currency: ["currency"],
      detail: ["datadiscriminator"],
    },
    stockTypes: /^stocks?$/i,
  };
  const out: Parsed = { lots: [], skipped: [] };
  let header: string[] | null = null;
  let body: string[][] = [];
  const flush = () => {
    if (header && body.length > 0) {
      const part = readPositions(header.map(norm), body, layout, header, decimalComma);
      out.lots.push(...part.lots);
      out.skipped.push(...part.skipped);
    }
    body = [];
  };
  for (const row of rows) {
    if (row[0] !== "Open Positions") continue;
    if (row[1] === "Header") {
      flush();
      header = row.slice(2);
    } else if (row[1] === "Data") body.push(row.slice(2));
  }
  flush();
  return out;
}

/* ── putting it together ───────────────────────────────────────────────── */

/** Lots of the same stock (two accounts, two lots) become one holding: shares added, cost weighted by shares. */
function combine(lots: Lot[]): ParsedHolding[] {
  const byTicker = new Map<string, Lot & { costKnown: boolean; lots: number }>();
  const order: string[] = [];
  for (const lot of lots) {
    const seen = byTicker.get(lot.ticker);
    if (!seen) {
      byTicker.set(lot.ticker, { ...lot, costKnown: lot.averageCost !== null || lot.shares === 0, lots: 1 });
      order.push(lot.ticker);
      continue;
    }
    const shares = seen.shares + lot.shares;
    const bothCosts = seen.averageCost !== null && lot.averageCost !== null;
    seen.averageCost = bothCosts && shares > 0 ? round((seen.shares * seen.averageCost! + lot.shares * lot.averageCost!) / shares) : null;
    seen.costKnown = seen.costKnown && lot.averageCost !== null;
    seen.shares = shares;
    seen.marketValue = seen.marketValue !== null && lot.marketValue !== null ? seen.marketValue + lot.marketValue : seen.marketValue ?? lot.marketValue;
    seen.name = seen.name ?? lot.name;
    seen.currency = seen.currency ?? lot.currency;
    if (lot.confidence === "medium") seen.confidence = "medium";
    seen.lots += 1;
  }
  return order.map((ticker) => {
    const lot = byTicker.get(ticker)!;
    return {
      ticker,
      name: lot.name,
      shares: lot.shares > 0 ? round(lot.shares, 6) : null,
      averageCost: lot.averageCost,
      marketValue: lot.marketValue,
      confidence: lot.confidence,
      ...(lot.currency ? { currency: lot.currency } : {}),
    };
  });
}

/** One label per reason and line: "SPAXX** · cash" said once even when two accounts hold it. */
function dedupeSkipped(skipped: SkippedRow[]): SkippedRow[] {
  const seen = new Set<string>();
  return skipped.filter((row) => {
    const key = `${row.reason}|${row.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finish(broker: BrokerId, parsed: Parsed, trades: boolean): BrokerCsv {
  let rows = combine(parsed.lots);
  let truncated = 0;
  if (rows.length > MAX_IMPORT_ROWS) {
    truncated = rows.length - MAX_IMPORT_ROWS;
    // The biggest holdings first when the file says what each is worth.
    rows = [...rows].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0, MAX_IMPORT_ROWS);
  }
  return { broker, rows, skipped: dedupeSkipped(parsed.skipped), trades, truncated };
}

/** How far down a header row may sit (Schwab and E*TRADE open with title and summary lines). */
const HEADER_SEARCH_ROWS = 40;

/**
 * A broker export (or any CSV with ticker and shares columns we can name)
 * into holdings and the lines left out. Null when the text is not one.
 */
export function parseBrokerCsv(text: string): BrokerCsv | null {
  if (!text.trim()) return null;
  const { rows, decimalComma } = readCsv(text);
  const ibkr = readIbkrStatement(rows, decimalComma);
  if (ibkr) return finish("ibkr", ibkr, false);
  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_ROWS); index += 1) {
    const raw = rows[index]!;
    if (raw.length < 2) continue;
    const header = raw.map(norm);
    const layout = LAYOUTS.find((candidate) => candidate.detect(header));
    if (!layout) continue;
    const body = rows.slice(index + 1);
    const parsed = layout.trades ? readTrades(header, body, layout, decimalComma) : readPositions(header, body, layout, raw, decimalComma);
    return finish(layout.id, parsed, Boolean(layout.trades));
  }
  return null;
}

/* ── a CSV we do not know: the person picks two columns ────────────────── */

export type CsvTable = {
  headers: string[];
  /** The data lines under the header, as cells. */
  rows: string[][];
  /** Numbers use a decimal comma (a semicolon-separated file). */
  decimalComma?: boolean;
};

/**
 * The header row of an unknown CSV: the first of the opening lines with the
 * most filled cells (at least two), and the lines under it.
 */
export function csvTable(text: string): CsvTable | null {
  const read = readCsv(text);
  const rows = read.rows.filter((row) => !blank(row));
  if (rows.length < 2) return null;
  let best = -1;
  let bestFilled = 1;
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const filled = rows[index]!.filter((cell) => cell.trim()).length;
    if (filled > bestFilled) {
      best = index;
      bestFilled = filled;
    }
  }
  if (best < 0) return null;
  const headers = rows[best]!.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  const body = rows.slice(best + 1).filter((row) => row.filter((cell) => cell.trim()).length >= 2);
  return body.length > 0 ? { headers, rows: body, ...(read.decimalComma ? { decimalComma: true } : {}) } : null;
}

/** Our best guess at the ticker and shares columns, so the two picks often need no change. */
export function guessColumns(table: CsvTable): { ticker: number | null; shares: number | null } {
  const sample = table.rows.slice(0, 30);
  const score = (index: number, test: (cell: string) => boolean) => sample.filter((row) => test(row[index] ?? "")).length;
  let ticker: number | null = null;
  let tickerScore = 0;
  let shares: number | null = null;
  let sharesScore = 0;
  table.headers.forEach((header, index) => {
    const name = norm(header);
    // A column with one value on every line (a currency, an account) is never the tickers.
    const distinct = new Set(sample.map((row) => (row[index] ?? "").trim()).filter(Boolean)).size;
    const looksTicker = distinct > 1 || sample.length < 2 ? score(index, (cell) => /^\$?[A-Z]{1,5}([./ -][A-Z])?$/.test(cell.trim())) : 0;
    const tickerFit = looksTicker + (GENERIC_TICKER.test(name) ? sample.length : 0);
    if (tickerFit > tickerScore) {
      ticker = index;
      tickerScore = tickerFit;
    }
    const numeric = score(index, (cell) => {
      const n = amount(cell, Boolean(table.decimalComma)).value;
      return n !== null && n > 0;
    });
    const sharesFit = numeric > 0 ? numeric + (isSharesHeader(name) ? sample.length : 0) : 0;
    if (sharesFit > sharesScore) {
      shares = index;
      sharesScore = sharesFit;
    }
  });
  return { ticker, shares: shares === ticker ? null : shares };
}

/** Read an unknown CSV with the two columns the person picked. A cost, value, name or type column is used too when its header says so. */
export function parseMappedCsv(table: CsvTable, pick: { ticker: number; shares: number }): BrokerCsv {
  const header = table.headers.map(norm);
  const find = (re: RegExp, not: number[]) => header.findIndex((cell, index) => re.test(cell) && !not.includes(index));
  const picked = [pick.ticker, pick.shares];
  const extra = {
    avgCost: find(GENERIC_AVG, picked),
    value: find(/^(market value|current value|value|total value)$/, picked),
    name: find(/^(description|name|security|security name|company|investment name)$/, picked),
    type: find(/^(security type|asset class|asset type|type)$/, picked),
  };
  // Columns are named by position, so two headers with the same text never point both picks at the first.
  const positional = table.headers.map((_, index) => `c${index}`);
  const at = (index: number) => (index >= 0 ? [`c${index}`] : undefined);
  const layout: Layout = {
    id: "mapped",
    detect: () => true,
    cols: { ticker: [`c${pick.ticker}`], shares: [`c${pick.shares}`], avgCost: at(extra.avgCost), value: at(extra.value), name: at(extra.name), type: at(extra.type) },
    stockTypes: /equity|etf|stock|fund|stk|share/i,
  };
  return finish("mapped", readPositions(positional, table.rows, layout, ["\u0000"], Boolean(table.decimalComma)), false);
}

/* ── saying what was left out ──────────────────────────────────────────── */

const REASON_WORDS: Record<SkipReason, string> = {
  cash: "Cash and money market",
  option: "Options",
  "not-stock": "Bonds, CDs and other lines that are not stocks",
  "no-ticker": "Lines without a ticker",
  short: "Short positions",
  closed: "Positions with no shares left",
  total: "Totals and pending lines",
};

/** Skipped lines grouped by reason, in a fixed order, each with up to `max` labels and how many more. */
export function skippedGroups(skipped: SkippedRow[], max = 6): Array<{ reason: SkipReason; words: string; labels: string[]; more: number }> {
  const order: SkipReason[] = ["cash", "option", "not-stock", "short", "closed", "no-ticker", "total"];
  return order
    .map((reason) => {
      const labels = skipped.filter((row) => row.reason === reason).map((row) => row.label.replace(/\*+$/, "").trim() || "A line with no name");
      return { reason, words: REASON_WORDS[reason], labels: labels.slice(0, max), more: Math.max(0, labels.length - max) };
    })
    .filter((group) => group.labels.length > 0);
}
