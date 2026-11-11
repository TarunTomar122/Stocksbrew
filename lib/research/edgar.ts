/**
 * Read the latest 10-K and 10-Q straight from SEC EDGAR: find the company's
 * CIK, list its recent filings, fetch the primary document and pull out the
 * parts a reader needs (what the business does, the risk factor headings and
 * the MD&A paragraphs that carry numbers).
 *
 * SEC asks for a descriptive User-Agent with a contact and at most 10 requests
 * a second. Every call here goes through one queue spaced 150ms apart, and the
 * parsed result of a filing is kept in memory, since a filing never changes.
 *
 * The parsing functions are pure and exported for tests.
 */

// The declared research agent (backend/agentdata/feeds_common.py SEC_USER_AGENT). SEC_USER_AGENT overrides it.
const DEFAULT_SEC_USER_AGENT = "stocksbrew.online research (tomartarun2001@gmail.com)";
const MIN_GAP_MS = 150;
const TIMEOUT_MS = 20_000;
const MAX_DOC_BYTES = 25_000_000;

export type EdgarFiling = {
  form: "10-K" | "10-Q";
  company: string;
  cik: number;
  accession: string;
  filed: string;
  /** The period the filing reports on (quarter or fiscal year end). */
  period: string | null;
  url: string;
};

export type FilingRead = {
  filing: EdgarFiling;
  /** First paragraphs of Item 1 (10-K only). */
  business: string[];
  /** Risk factor headings, in filing order. */
  risks: string[];
  /** MD&A paragraphs that carry numbers. */
  mda: string[];
  /** 10-Q only: the start of Part II Item 1A, which often says "no material changes". */
  risk_update: string | null;
};

/* ── fetching ───────────────────────────────────────────────────────────── */

let queue: Promise<void> = Promise.resolve();
let lastAt = 0;

function userAgent(): string {
  return (process.env.SEC_USER_AGENT || "").trim() || DEFAULT_SEC_USER_AGENT;
}

/** One request at a time, at least MIN_GAP_MS apart, across every caller in this process. */
async function secFetch(url: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const turn = queue.then(async () => {
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
  });
  queue = turn.catch(() => undefined);
  await turn;
  return fetcher(url, {
    headers: { "User-Agent": userAgent(), "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

let tickerMap: { at: number; map: Map<string, { cik: number; title: string }> } | null = null;

async function loadTickerMap(fetcher?: typeof fetch): Promise<Map<string, { cik: number; title: string }>> {
  if (tickerMap && Date.now() - tickerMap.at < 24 * 3600 * 1000) return tickerMap.map;
  const response = await secFetch("https://www.sec.gov/files/company_tickers.json", fetcher);
  if (!response.ok) throw new Error(`sec_tickers_${response.status}`);
  const raw = (await response.json()) as Record<string, { cik_str?: number; ticker?: string; title?: string }>;
  const map = new Map<string, { cik: number; title: string }>();
  for (const row of Object.values(raw)) {
    if (typeof row?.ticker !== "string" || typeof row.cik_str !== "number") continue;
    map.set(row.ticker.toUpperCase(), { cik: row.cik_str, title: String(row.title ?? row.ticker) });
  }
  tickerMap = { at: Date.now(), map };
  return map;
}

/** SEC writes share classes with a dash: BRK-B. */
export function secTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

type Submissions = {
  name?: string;
  filings?: { recent?: { form?: string[]; filingDate?: string[]; reportDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] } };
};

/** The newest original 10-K and 10-Q in a submissions file (amendments are skipped). */
export function latestFromSubmissions(cik: number, data: Submissions): { annual: EdgarFiling | null; quarterly: EdgarFiling | null } {
  const recent = data.filings?.recent;
  const out: { annual: EdgarFiling | null; quarterly: EdgarFiling | null } = { annual: null, quarterly: null };
  if (!recent?.form) return out;
  const company = String(data.name ?? "");
  for (let i = 0; i < recent.form.length; i += 1) {
    const form: string | undefined = recent.form[i];
    if (form !== "10-K" && form !== "10-Q") continue;
    const slot = form === "10-K" ? "annual" : "quarterly";
    if (out[slot]) continue;
    const accession = recent.accessionNumber?.[i];
    const doc = recent.primaryDocument?.[i];
    const filed = recent.filingDate?.[i];
    if (!accession || !doc || !filed) continue;
    out[slot] = {
      form,
      company,
      cik,
      accession,
      filed,
      period: recent.reportDate?.[i] || null,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${doc}`,
    };
    if (out.annual && out.quarterly) break;
  }
  return out;
}

/** The company's newest 10-K and 10-Q. Null when SEC does not list the ticker. */
export async function findLatestFilings(
  ticker: string,
  fetcher?: typeof fetch,
): Promise<{ annual: EdgarFiling | null; quarterly: EdgarFiling | null } | null> {
  const map = await loadTickerMap(fetcher);
  const entry = map.get(secTicker(ticker));
  if (!entry) return null;
  const response = await secFetch(`https://data.sec.gov/submissions/CIK${String(entry.cik).padStart(10, "0")}.json`, fetcher);
  if (!response.ok) throw new Error(`sec_submissions_${response.status}`);
  const data = (await response.json()) as Submissions;
  if (!data.name) data.name = entry.title;
  return latestFromSubmissions(entry.cik, data);
}

const readCache = new Map<string, FilingRead>();

/** Fetch one filing's primary document and read it. Cached by accession: a filing never changes. */
export async function readFiling(filing: EdgarFiling, fetcher?: typeof fetch): Promise<FilingRead> {
  const cached = readCache.get(filing.accession);
  if (cached) return cached;
  const response = await secFetch(filing.url, fetcher);
  if (!response.ok) throw new Error(`sec_document_${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_DOC_BYTES) throw new Error("sec_document_too_large");
  const html = await response.text();
  const read = parseFiling(filing, html);
  if (readCache.size > 60) readCache.delete(readCache.keys().next().value as string);
  readCache.set(filing.accession, read);
  return read;
}

/* ── parsing ────────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: "-",
  mdash: "-",
  hellip: "...",
  bull: "•",
  middot: "·",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n)) return whole;
      if (n === 160) return " ";
      if (n === 8217 || n === 8216) return "'";
      if (n === 8220 || n === 8221) return '"';
      if (n === 8211 || n === 8212) return "-";
      try {
        return String.fromCodePoint(n);
      } catch {
        return whole;
      }
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Filing HTML to plain text with one paragraph per line. Hidden XBRL facts, scripts and styles are dropped. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\r\f\v ​]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The text between a heading and the next one. Filings repeat each heading in
 * the table of contents, so of every start match the one followed by the
 * longest span is taken: that is the real section, not the contents line.
 */
export function findSection(text: string, start: RegExp, end: RegExp): string | null {
  const all = [...text.matchAll(new RegExp(start.source, "gi"))];
  // Headings sit on their own line. A mention inside a sentence ("see Item 1A. Risk Factors") is not a start.
  const atLineStart = all.filter((match) => (match.index ?? 0) === 0 || text[(match.index ?? 0) - 1] === "\n");
  const starts = atLineStart.length > 0 ? atLineStart : all;
  const endRe = new RegExp(`(?:^|\\n)\\s*(?:${end.source})`, "i");
  let best: string | null = null;
  for (const match of starts) {
    const from = (match.index ?? 0) + match[0].length;
    const rest = text.slice(from);
    const endMatch = endRe.exec(rest);
    const span = endMatch ? rest.slice(0, endMatch.index ?? 0) : rest.slice(0, 200_000);
    if (!best || span.length > best.length) best = span;
  }
  if (!best || best.trim().length < 200) return null;
  return best.slice(0, 400_000);
}

function paragraphs(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** Cut at a sentence end before `max` characters, so an excerpt never stops mid-word. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("; "));
  return (stop > max * 0.5 ? head.slice(0, stop + 1) : head.replace(/\s+\S*$/, "")).trim();
}

const PAGE_NOISE = /^(table of contents|\d{1,3}|page \d+|part i+|index)$/i;

/**
 * Risk factor headings: short sentence-like paragraphs followed by a long body
 * paragraph. That is how almost every filer lays the section out (a bold or
 * italic one-sentence heading, then the explanation).
 */
export function riskHeadings(section: string, max = 24): string[] {
  const list = paragraphs(section);
  const out: string[] = [];
  for (let i = 0; i < list.length - 1 && out.length < max; i += 1) {
    const line = list[i]!;
    if (line.length < 40 || line.length > 420) continue;
    if (PAGE_NOISE.test(line) || /^item\s/i.test(line)) continue;
    if (!/^[A-Z"'(]/.test(line)) continue;
    if (!/[.?]$/.test(line)) continue;
    const next = list.slice(i + 1).find((candidate) => !PAGE_NOISE.test(candidate));
    if (!next || next.length < 250) continue;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

const MDA_WORDS =
  /\b(revenue|revenues|net sales|sales|gross margin|operating (income|loss|expenses|margin)|net (income|loss)|cash|free cash flow|guidance|outlook|backlog|demand|segment|data center|subscribers|customers|bookings|grew|growth|increase[ds]?|decrease[ds]?|declined|compared)\b/i;
const MDA_SKIP = /forward-looking statements|should be read in conjunction|safe harbor|non-gaap financial measures? (is|are) not|reconciliation/i;

/** MD&A paragraphs that carry a number and talk about results, in filing order. Tables are skipped. */
export function mdaHighlights(section: string, max = 14): string[] {
  const out: string[] = [];
  for (const line of paragraphs(section)) {
    if (out.length >= max) break;
    if (line.length < 120) continue;
    if (!/\d/.test(line) || !MDA_WORDS.test(line) || MDA_SKIP.test(line)) continue;
    // A table row flattened into a line is mostly figures.
    const digits = (line.match(/\d/g) ?? []).length;
    if (digits / line.length > 0.22) continue;
    if (!/[a-z]{3,}\s[a-z]{3,}\s[a-z]{2,}/i.test(line)) continue;
    const clipped = clip(line, 700);
    if (!out.includes(clipped)) out.push(clipped);
  }
  return out;
}

function businessParagraphs(section: string, max = 4): string[] {
  const out: string[] = [];
  for (const line of paragraphs(section)) {
    if (out.length >= max) break;
    if (line.length < 160 || MDA_SKIP.test(line)) continue;
    out.push(clip(line, 900));
  }
  return out;
}

const RISK_START = /item\s*1a\.?\s*[-–—:.]?\s*risk\s+factors/i;
const RISK_END_10K = /item\s*1b\.?\s*[-–—:.]?\s*unresolved|item\s*1c\.?\s*[-–—:.]?\s*cybersecurity|item\s*2\.?\s*[-–—:.]?\s*properties/i;
const RISK_END_10Q = /item\s*2\.?\s*[-–—:.]?\s*unregistered|item\s*3\.?\s*[-–—:.]?\s*defaults|item\s*5\.?\s*[-–—:.]?\s*other\s+information|item\s*6\.?\s*[-–—:.]?\s*exhibits/i;
const MDA_START_10K = /item\s*7\.?\s*[-–—:.]?\s*management['’]?s\s+discussion/i;
const MDA_END_10K = /item\s*7a\.?\s*[-–—:.]?\s*quantitative|item\s*8\.?\s*[-–—:.]?\s*financial\s+statements/i;
const MDA_START_10Q = /item\s*2\.?\s*[-–—:.]?\s*management['’]?s\s+discussion/i;
const MDA_END_10Q = /item\s*3\.?\s*[-–—:.]?\s*quantitative|item\s*4\.?\s*[-–—:.]?\s*controls/i;
const BUSINESS_START = /item\s*1\.?\s*[-–—:.]?\s*business\b/i;
const BUSINESS_END = /item\s*1a\.?\s*[-–—:.]?\s*risk\s+factors/i;

export function parseFiling(filing: EdgarFiling, html: string): FilingRead {
  const text = htmlToText(html);
  if (filing.form === "10-K") {
    const business = findSection(text, BUSINESS_START, BUSINESS_END);
    const risks = findSection(text, RISK_START, RISK_END_10K);
    const mda = findSection(text, MDA_START_10K, MDA_END_10K);
    return {
      filing,
      business: business ? businessParagraphs(business) : [],
      risks: risks ? riskHeadings(risks) : [],
      mda: mda ? mdaHighlights(mda) : [],
      risk_update: null,
    };
  }
  const mda = findSection(text, MDA_START_10Q, MDA_END_10Q);
  const risks = findSection(text, RISK_START, RISK_END_10Q);
  const firstRisk = risks ? paragraphs(risks).find((line) => line.length > 80) : undefined;
  return {
    filing,
    business: [],
    risks: risks ? riskHeadings(risks, 12) : [],
    mda: mda ? mdaHighlights(mda, 12) : [],
    risk_update: firstRisk ? clip(firstRisk, 600) : null,
  };
}

/** For tests: forget cached lookups. */
export function resetEdgarCaches(): void {
  tickerMap = null;
  readCache.clear();
}
