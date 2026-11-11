/**
 * Finding the stocks a person names in a sentence: tickers ("NVDA", "$nvda")
 * and company names ("Apple", "NVIDIA's"), resolved against our catalogue.
 *
 * Pure. The server builds the catalogue once from the search index and the
 * instrument universe (lib/agents-plain/server.ts); tests build a small one.
 */

import { shortCompanyName } from "@/lib/plain-copy";

export type CatalogEntry = { ticker: string; name?: string | null; aliases?: string[] | null; price?: number | null };

export type PlainStock = {
  ticker: string;
  /** The name people use: "NVIDIA", "Apple". The ticker when we have no name. */
  name: string;
  /** The last price in the search index, used only to read "hits 200" as above or below. Never shown. */
  price: number | null;
};

export type StockHit = PlainStock & { start: number; end: number };

type NameKey = { pattern: RegExp; ticker: string; length: number };

export type StockCatalog = {
  byTicker: Map<string, PlainStock>;
  keys: NameKey[];
};

/*
 * Tickers that are everyday English words. Written in lowercase they are
 * read as words ("now", "all", "cost"); in capitals or with a $ they are
 * tickers. META, DELL and a few more read as the company either way.
 */
const TICKER_WORDS = new Set(
  (
    "abb act aes ago air ait alb all alle ally amba ame amp amt apa are arm ati avo azo bac bah ball boot bull burl cag cake calm " +
    "carr cart cat chad coco coin coke coo cop cor cost cube dal dan dar dash deck dis dow dram eat els eme erie ess fang fast " +
    "fig five fix fizz flex fly form gap gen gold golf grab gush hal halo hive hon hood huma ice jazz jef joe lac laur lif lin " +
    "lite low mar mod momo mwa nee net now odd oil open oust path play plug poet rare shop sig silver sky snap snow swag team " +
    "tech teck tour wit woof zeta key big run fun pay life main peak well home good true nice next ever tell wash post " +
    "best flow find real hear safe kind once dog car cars bear bulls"
  ).split(" "),
);

/** Two capital letters that are usually a word or a time, not a ticker, unless written with a $. */
const UPPER_WORDS = new Set(["AM", "PM", "SO", "ED", "OR", "ON", "IT", "AT", "BE", "DO", "GO", "NO", "UP", "US", "ME", "MY", "IF", "IN", "IS", "OF", "TO", "AN", "AS", "BY", "HE", "WE", "OK", "ALL", "ANY", "AND", "THE", "NOW", "LOW", "BIG"]);

/** Capitalised words that are never a ticker we failed to find. */
const ACRONYMS = new Set([
  "CEO", "CFO", "COO", "CTO", "ETF", "ETFS", "SEC", "IPO", "EPS", "USA", "AI", "ATH", "RSI", "MACD", "EMA", "SMA", "ET", "EST", "EDT",
  "PST", "PT", "UTC", "OK", "FYI", "ASAP", "PLS", "PLZ", "TBH", "IMO", "LOL", "OMG", "FOMC", "FED", "CPI", "GDP", "NYSE", "FDA",
  "Q1", "Q2", "Q3", "Q4", "YOY", "QOQ", "PE", "EV", "USD", "TELL", "ME", "WHEN", "IF", "PING", "HEY", "HI", "NOT", "BUT", "YES",
  "NEWS", "BUY", "SELL", "HOLD", "UP", "DOWN", "ALERT", "STOCK", "STOCKS", "FUND", "FUNDS", "DAY", "WEEK", "MOVE", "MOVES",
]);

/*
 * Single words that name a company but are also ordinary words. They count
 * as the company only when capitalised ("Target", not "my target").
 */
const GENERIC_NAME_WORDS = new Set(
  (
    "block target snap visa gap ball boot crown delta dollar five first general american national international new the federal " +
    "capital super silver gold oil core group best build clean comfort concrete crude dave digital east element equity essential " +
    "expand extra fair fifth flex frost gaming gen grab hello hive independent jazz mission pan planet plug progress regal " +
    "revolution rocket science serve space stride west western southern crane arrow church arch cooper chart bullish arm air " +
    "agree align advance advanced applied bank bath catalyst century commercial consolidated credo dutch encompass enact ensign " +
    "equitable firefly harmonic liberty lithium merlin montana royalty smith spire tetra uranium viking virgin warrior quantum " +
    "oddity alpha atlantic california texas boston cincinnati columbia lincoln franklin jones jackson morgan charles philip " +
    "arthur brown baker cohen duke dominion fidelity marathon carnival cardinal carrier granite badger zebra dreamland crescent " +
    "booking cadence chime devon dover dow ford frontier vista sun star stars energy world life home health real data smart " +
    "live big blue green red black white pure global open match square apollo meta motors united"
  ).split(" "),
);

/** Names people use that the catalogue spells another way. Only added when the ticker is in the catalogue. */
const EXTRA_ALIASES: Array<[string, string[]]> = [
  ["GOOGL", ["google"]],
  ["META", ["facebook"]],
  ["BRK.B", ["berkshire", "berkshire hathaway"]],
  ["BRK-B", ["berkshire", "berkshire hathaway"]],
  ["JPM", ["jp morgan", "jpmorgan"]],
  ["KO", ["coca cola", "coca-cola", "coke"]],
  ["AMZN", ["amazon"]],
  ["MSFT", ["microsoft"]],
  ["NVDA", ["nvidia"]],
  ["TSLA", ["tesla"]],
];

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanAlias(value: string): string {
  return value
    .trim()
    .replace(/\.com$/i, "")
    .replace(/[\s,&]+$/, "")
    .replace(/\s+/g, " ");
}

function displayName(ticker: string, name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw || raw.toUpperCase() === ticker) return ticker;
  return shortCompanyName(raw) || ticker;
}

/** Build the lookup once; it is reused across requests. */
export function buildCatalog(entries: CatalogEntry[]): StockCatalog {
  const byTicker = new Map<string, PlainStock>();
  const aliasSources = new Map<string, string[]>();
  for (const entry of entries) {
    const ticker = String(entry.ticker ?? "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    const name = displayName(ticker, entry.name);
    const price = typeof entry.price === "number" && Number.isFinite(entry.price) && entry.price > 0 ? entry.price : null;
    const known = byTicker.get(ticker);
    byTicker.set(ticker, {
      ticker,
      name: known && known.name !== ticker && name === ticker ? known.name : name,
      price: price ?? known?.price ?? null,
    });
    const aliases = aliasSources.get(ticker) ?? [];
    for (const alias of entry.aliases ?? []) if (typeof alias === "string") aliases.push(alias);
    if (entry.name) aliases.push(String(entry.name));
    aliasSources.set(ticker, aliases);
  }
  for (const [ticker, extra] of EXTRA_ALIASES) {
    if (byTicker.has(ticker)) aliasSources.set(ticker, [...(aliasSources.get(ticker) ?? []), ...extra]);
  }

  // Every way of writing a name, with how sure we are that it means this company.
  const candidates = new Map<string, Map<string, number>>();
  const firstWords = new Map<string, Set<string>>();
  const add = (key: string, ticker: string, strength: number) => {
    const clean = cleanAlias(key).toLowerCase();
    if (clean.length < 3 || clean.toUpperCase() === ticker) return;
    const byKey = candidates.get(clean) ?? new Map<string, number>();
    byKey.set(ticker, Math.max(byKey.get(ticker) ?? 0, strength));
    candidates.set(clean, byKey);
  };
  for (const [ticker, sources] of aliasSources) {
    const stock = byTicker.get(ticker)!;
    if (stock.name !== ticker) add(stock.name, ticker, 3);
    for (const source of sources) {
      const short = shortCompanyName(source);
      add(source, ticker, 2);
      if (short && short !== source) add(short, ticker, 2);
    }
    const first = stock.name.split(" ")[0]?.replace(/[,.]$/, "").toLowerCase() ?? "";
    if (stock.name.includes(" ") && first.length >= 4) {
      const set = firstWords.get(first) ?? new Set<string>();
      set.add(ticker);
      firstWords.set(first, set);
    }
  }
  // A first word ("Palantir" from "Palantir Technologies") counts only when one company starts with it.
  for (const [first, tickers] of firstWords) {
    if (tickers.size === 1) add(first, [...tickers][0], 1);
  }

  const keys: NameKey[] = [];
  for (const [key, byKey] of candidates) {
    const best = Math.max(...byKey.values());
    const top = [...byKey.entries()].filter(([, strength]) => strength === best);
    // Two companies with an equally good claim on a name: neither gets it.
    if (top.length !== 1) continue;
    const ticker = top[0][0];
    const generic = !key.includes(" ") && GENERIC_NAME_WORDS.has(key);
    const body = escape(key).replace(/\\-|-/g, "[- ]?").replace(/ /g, "\\s+");
    const pattern = generic
      ? new RegExp(`(?<![A-Za-z0-9$])${escape(key[0].toUpperCase())}${escape(key.slice(1))}(?:['’]s)?(?![A-Za-z0-9])`, "g")
      : new RegExp(`(?<![A-Za-z0-9$])${body}(?:['’]s)?(?![A-Za-z0-9])`, "gi");
    keys.push({ pattern, ticker, length: key.length });
  }
  keys.sort((a, b) => b.length - a.length);
  return { byTicker, keys };
}

export type FoundStocks = {
  /** Each stock once, in the order first written. */
  hits: StockHit[];
  /** Every place a stock was named, repeats included, so none of them reads as leftover words. */
  spans: Array<{ start: number; end: number }>;
  /** Words that look like tickers but are not in the catalogue, as written. */
  unknown: Array<{ text: string; start: number; end: number }>;
  /** Capital words that are a ticker we cover but read as a word ("T", "ON"): the stock only with a $. */
  maybe: string[];
};

function overlaps(spans: Array<{ start: number; end: number }>, start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

/**
 * Every stock named in `text`, in the order written, each once. Company names
 * are matched first (longest first), then tickers in the gaps.
 */
export function findStocks(text: string, catalog: StockCatalog): FoundStocks {
  const hits: StockHit[] = [];
  const unknown: FoundStocks["unknown"] = [];
  const maybe: string[] = [];
  const letters = text.replace(/[^A-Za-z]/g, "");
  // A request typed in capitals is shouting, not a list of tickers.
  const shouting = letters.length >= 12 && letters === letters.toUpperCase();

  for (const key of catalog.keys) {
    key.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = key.pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (!overlaps(hits, start, end)) hits.push({ ...catalog.byTicker.get(key.ticker)!, start, end });
    }
  }

  const tokenRe = /(\$)?(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,5}(?:[.\-][A-Za-z])?)(?![A-Za-z0-9])/g;
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(text))) {
    const dollar = Boolean(token[1]);
    const written = token[2];
    const start = token.index;
    const end = start + token[0].length;
    if (overlaps(hits, start, end)) continue;
    const upper = written.toUpperCase();
    const stock = catalog.byTicker.get(upper);
    const capitals = written === upper && /[A-Z]/.test(written);
    if (dollar) {
      if (stock) hits.push({ ...stock, start, end });
      else unknown.push({ text: `$${written}`, start, end });
      continue;
    }
    if (capitals && !shouting) {
      if (stock && written.length > 1 && !UPPER_WORDS.has(upper)) hits.push({ ...stock, start, end });
      else if (stock && upper !== "A" && upper !== "I") maybe.push(upper);
      else if (!stock && /^[A-Z]{2,5}$/.test(written) && !ACRONYMS.has(upper) && !UPPER_WORDS.has(upper)) unknown.push({ text: written, start, end });
      continue;
    }
    if (stock && written.length >= 3 && /^[A-Za-z]+$/.test(written) && !TICKER_WORDS.has(written.toLowerCase())) {
      hits.push({ ...stock, start, end });
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const unique = hits.filter((hit) => (seen.has(hit.ticker) ? false : (seen.add(hit.ticker), true)));
  return {
    hits: unique,
    spans: hits.map(({ start, end }) => ({ start, end })),
    unknown: unknown.filter((word) => !overlaps(hits, word.start, word.end)),
    maybe: [...new Set(maybe)],
  };
}

/** Resolve one stock the way a person wrote it ("Apple", "nvda", "$TSLA"). */
export function resolveStock(written: string, catalog: StockCatalog): PlainStock | null {
  const value = written.trim();
  if (!value) return null;
  // The same reading as in a sentence: "now" is a word, "NOW" or "$now" is ServiceNow.
  const found = findStocks(value, catalog).hits;
  if (found.length === 1) return found[0];
  const bare = value.replace(/^\$/, "");
  const direct = catalog.byTicker.get(bare.toUpperCase());
  const deliberate = value.startsWith("$") || (bare === bare.toUpperCase() && bare.length > 1 && !UPPER_WORDS.has(bare));
  return direct && deliberate ? direct : null;
}

/** "Apple", "Apple and Microsoft", "Apple, Microsoft and 3 more". */
export function listStockNames(stocks: PlainStock[], joiner: "and" | "or" = "and", max = 4): string {
  const names = stocks.map((stock) => stock.name);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} ${joiner} ${names.length - max} more`;
}
