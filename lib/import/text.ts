/**
 * Pasted text and CSV exports into holdings, by rules (no model).
 *
 * Handles the common shapes: a broker CSV with a header row, one holding per
 * line ("AAPL 10 182.50", "NVDA, 25, $118"), and a plain list of tickers
 * ("AAPL, MSFT, NVDA"). When nothing here matches, the parse route can hand
 * the text to the model instead.
 */

import {
  cleanTicker,
  LIMITS,
  MAX_IMPORT_ROWS,
  mergeDuplicates,
  parseAmount,
  type ImportInput,
  type ParsedHolding,
} from "@/lib/import/normalize";

/** Longest paste we accept. A full brokerage export of 100 holdings is about 15,000 characters. */
export const MAX_TEXT_CHARS = 20_000;

type Column = "ticker" | "name" | "shares" | "averageCost" | "costTotal" | "marketValue";

/** Header words, lowercased with spaces collapsed. First match wins, so the specific ones come first. */
const HEADERS: Array<[RegExp, Column]> = [
  [/^(symbol|ticker|instrument|stock symbol|security symbol|code)$/, "ticker"],
  [/^(description|name|security|security name|company|stock|instrument name)$/, "name"],
  [/^(quantity|qty|shares|share count|units|position|no\.? of shares|shares held)$/, "shares"],
  [/^(avg\.? cost|average cost|avg\.? price|average price|cost per share|avg cost\/share|average cost basis|price paid|cost basis per share|purchase price|avg\.? buy price)$/, "averageCost"],
  [/^(cost basis|cost basis total|total cost|book value|cost)$/, "costTotal"],
  [/^(market value|current value|value|mkt value|market val\.?|total value|equity)$/, "marketValue"],
];

function headerColumn(cell: string): Column | null {
  const text = cell.toLowerCase().replace(/[$()]/g, "").replace(/\s+/g, " ").trim();
  for (const [re, column] of HEADERS) if (re.test(text)) return column;
  return null;
}

/** One CSV line into cells, honouring double quotes ("1,234.50"). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function pickDelimiter(line: string): string | null {
  const counts: Array<[string, number]> = [",", "\t", ";", "|"].map((d) => [d, splitCsvLine(line, d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : null;
}

function positive(value: number | null, max: number): number | null {
  return value !== null && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

/** A CSV with a header row we recognise. Null when the text is not one. */
export function parseCsv(text: string): ParsedHolding[] | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  // Some exports open with a title line or two before the header.
  for (let start = 0; start < Math.min(lines.length, 6); start += 1) {
    const delimiter = pickDelimiter(lines[start]!);
    if (!delimiter) continue;
    const header = splitCsvLine(lines[start]!, delimiter).map(headerColumn);
    const at = (column: Column) => header.indexOf(column);
    if (at("ticker") < 0) continue;
    const rows: ParsedHolding[] = [];
    for (const line of lines.slice(start + 1)) {
      const cells = splitCsvLine(line, delimiter);
      const cell = (column: Column) => (at(column) >= 0 ? cells[at(column)] ?? "" : "");
      const ticker = cleanTicker(cell("ticker"));
      // Totals, cash and pending lines have no ticker.
      if (!ticker) continue;
      const shares = positive(parseAmount(cell("shares")), LIMITS.shares);
      let averageCost = positive(parseAmount(cell("averageCost")), LIMITS.price);
      const costTotal = positive(parseAmount(cell("costTotal")), LIMITS.value);
      if (averageCost === null && costTotal !== null && shares !== null) averageCost = Math.round((costTotal / shares) * 10_000) / 10_000;
      const name = cell("name").replace(/\s+/g, " ").trim() || null;
      rows.push({
        ticker,
        name: name && name.length <= 80 ? name : null,
        shares,
        averageCost,
        marketValue: positive(parseAmount(cell("marketValue")), LIMITS.value),
        confidence: "high",
      });
    }
    return mergeDuplicates(rows);
  }
  return null;
}

/** Words in capitals that are not tickers when they show up in pasted text. */
const NOT_TICKERS = new Set([
  "A", "I", "AN", "AND", "THE", "OF", "TO", "IN", "ON", "AT", "IS", "IT", "BY", "OR", "FOR", "USD", "US", "ETF", "INC", "CORP",
  "CO", "LTD", "PLC", "LLC", "SH", "QTY", "AVG", "COST", "TOTAL", "CASH", "VALUE", "PRICE", "SHARES", "BUY", "SELL", "NAV",
  "DAY", "GAIN", "LOSS", "ALL", "MY", "NEW", "CLASS", "COM", "NA", "N/A",
]);

const NUMBER_TOKEN = /^[(\-−+]?\$?\d[\d,]*(\.\d+)?[kKmM]?\)?$/;

/** "BRK B" written with a space is one class share, "BRK.B". */
function joinClassShares(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const next = tokens[i + 1];
    if (next && /^\$?[A-Z]{2,4}$/.test(tokens[i]!) && /^[A-C]$/.test(next)) {
      out.push(`${tokens[i]}.${next}`);
      i += 1;
    } else out.push(tokens[i]!);
  }
  return out;
}

/**
 * Free text, one holding per line. A line that is only tickers ("AAPL MSFT
 * NVDA" or "aapl, msft") becomes one row each. A line with a ticker followed
 * by numbers reads the first as shares and the second as the average cost
 * ("@ 182.50" is the cost). Lines without a ticker are skipped.
 */
export function parseLines(text: string): ParsedHolding[] {
  const rows: ParsedHolding[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = joinClassShares(line.split(/[\s,;|\t]+/).filter(Boolean));
    const isNumber = (token: string) => NUMBER_TOKEN.test(token.replace(/^@/, ""));
    const words = tokens.filter((token) => !isNumber(token) && token !== "@" && !/^(shares?|sh|x)$/i.test(token));
    const hasNumbers = tokens.some(isNumber);
    // A list of tickers: every word is short and there are no numbers. Lowercase is fine here.
    if (!hasNumbers && words.every((word) => /^\$?[A-Za-z]{1,5}([./-][A-Za-z])?$/.test(word))) {
      for (const word of words) {
        const ticker = cleanTicker(word);
        if (!ticker || NOT_TICKERS.has(ticker)) continue;
        const guess = word.replace(/^\$/, "") !== word.replace(/^\$/, "").toUpperCase();
        rows.push({ ticker, name: null, shares: null, averageCost: null, marketValue: null, confidence: "high", ...(guess ? { guess } : {}) });
      }
      continue;
    }
    // A holding line: the ticker is a word written in capitals (or with a $). Brokers print the
    // name in capitals too ("TESLA INC TSLA 10"), so the one nearest the first number wins.
    const firstNumber = tokens.findIndex(isNumber);
    const candidates = (firstNumber >= 0 ? tokens.slice(0, firstNumber) : tokens).filter(
      (word) => /^\$?[A-Z]{1,5}([./-][A-Z])?$/.test(word) && !NOT_TICKERS.has(word.replace(/^\$/, "")),
    );
    const dollar = candidates.find((word) => word.startsWith("$"));
    let tickerWord = dollar ?? candidates[candidates.length - 1];
    // "nvda, 25, 118" typed in lowercase: the word next to the numbers, kept only if it is a stock we cover.
    let guess = false;
    if (!tickerWord) {
      const lower = (firstNumber >= 0 ? tokens.slice(0, firstNumber) : tokens).filter(
        (word) => /^\$?[a-z]{1,5}([./-][a-z])?$/.test(word) && !NOT_TICKERS.has(word.replace(/^\$/, "").toUpperCase()),
      );
      tickerWord = lower[lower.length - 1];
      guess = Boolean(tickerWord);
    }
    const ticker = tickerWord ? cleanTicker(tickerWord) : null;
    if (!ticker) continue;
    // "10 @ 182.50" and "10 @182.50": the number after the @ is the cost.
    const at = tokens.findIndex((token) => token.startsWith("@"));
    const costIndex = at < 0 ? -1 : tokens[at] === "@" ? at + 1 : at;
    const plain = tokens.filter((token, index) => index !== at && index !== costIndex && isNumber(token));
    const sharesToken = plain[0];
    const cost = costIndex >= 0 ? tokens[costIndex]?.replace(/^@/, "") : plain[1];
    const shares = positive(parseAmount(sharesToken ?? null), LIMITS.shares);
    rows.push({
      ticker,
      name: null,
      shares,
      averageCost: positive(parseAmount(cost ?? null), LIMITS.price),
      marketValue: null,
      // The person typed it, shares first: nothing here was read from pixels.
      confidence: "high",
      ...(guess ? { guess } : {}),
    });
  }
  return mergeDuplicates(rows).slice(0, MAX_IMPORT_ROWS);
}

/** CSV when it has a header we know, otherwise line by line. */
export function parseHoldingsText(text: string): { rows: ParsedHolding[]; input: ImportInput } {
  const clipped = text.slice(0, MAX_TEXT_CHARS);
  const csv = parseCsv(clipped);
  if (csv && csv.length > 0) return { rows: csv, input: "csv" };
  return { rows: parseLines(clipped), input: "text" };
}
