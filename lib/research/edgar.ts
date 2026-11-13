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

/**
 * The gap between SEC requests: MIN_GAP_MS, or SEC_MIN_GAP_MS when a job asks for a slower pace (the after-close
 * filing check shares SEC's 10-a-second limit with the Python SEC jobs on the same address). Never under 100ms.
 */
function minGap(): number {
  const asked = Number(process.env.SEC_MIN_GAP_MS);
  return Number.isFinite(asked) && asked >= 100 ? asked : MIN_GAP_MS;
}

/** One request at a time, at least minGap() apart, across every caller in this process. */
async function secFetch(url: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const turn = queue.then(async () => {
    const wait = lastAt + minGap() - Date.now();
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

type FilingColumns = { form?: string[]; filingDate?: string[]; reportDate?: string[]; accessionNumber?: string[]; primaryDocument?: string[] };

/** Every original 10-K and 10-Q in one block of a submissions file, in the order SEC lists them (newest first). */
export function filingsFromColumns(cik: number, company: string, columns: FilingColumns | undefined): EdgarFiling[] {
  const out: EdgarFiling[] = [];
  if (!columns?.form) return out;
  for (let i = 0; i < columns.form.length; i += 1) {
    const form = columns.form[i];
    if (form !== "10-K" && form !== "10-Q") continue;
    const accession = columns.accessionNumber?.[i];
    const doc = columns.primaryDocument?.[i];
    const filed = columns.filingDate?.[i];
    if (!accession || !doc || !filed) continue;
    out.push({
      form,
      company,
      cik,
      accession,
      filed,
      period: columns.reportDate?.[i] || null,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${doc}`,
    });
  }
  return out;
}

type SubmissionsWithPages = Submissions & { filings?: { files?: Array<{ name?: string; filingFrom?: string; filingTo?: string }> } };

export type FilingList = { cik: number; company: string; filings: EdgarFiling[] };

/**
 * The company's original 10-K and 10-Q filings, newest first. SEC's "recent" block holds about a year for a busy
 * filer (a bank files hundreds of notes a month), so when it holds fewer than two 10-Ks the older pages that cover
 * the year before are read too, at most `maxPages` of them. Null when SEC does not list the ticker.
 */
export async function listFilings(ticker: string, fetcher?: typeof fetch, maxPages = 2): Promise<FilingList | null> {
  const map = await loadTickerMap(fetcher);
  const entry = map.get(secTicker(ticker));
  if (!entry) return null;
  const response = await secFetch(`https://data.sec.gov/submissions/CIK${String(entry.cik).padStart(10, "0")}.json`, fetcher);
  if (!response.ok) throw new Error(`sec_submissions_${response.status}`);
  const data = (await response.json()) as SubmissionsWithPages;
  const company = String(data.name || entry.title);
  const filings = filingsFromColumns(entry.cik, company, data.filings?.recent);
  const annuals = filings.filter((filing) => filing.form === "10-K");
  if (annuals.length < 2 && annuals[0]) {
    for (const name of olderPages(data.filings?.files ?? [], annuals[0].filed, maxPages)) {
      const page = await secFetch(`https://data.sec.gov/submissions/${name}`, fetcher);
      if (!page.ok) break;
      filings.push(...filingsFromColumns(entry.cik, company, (await page.json()) as FilingColumns));
      if (filings.filter((filing) => filing.form === "10-K").length >= 2) break;
    }
  }
  const seen = new Set<string>();
  return {
    cik: entry.cik,
    company,
    filings: filings
      .filter((filing) => !seen.has(filing.accession) && Boolean(seen.add(filing.accession)))
      .sort((a, b) => b.filed.localeCompare(a.filed) || b.accession.localeCompare(a.accession)),
  };
}

/**
 * The older submissions pages that cover 11 to 13 months before `filed` (where the 10-K before it sits), the page
 * holding the day a year before first, then the nearest.
 */
export function olderPages(files: ReadonlyArray<{ name?: string; filingFrom?: string; filingTo?: string }>, filed: string, max: number): string[] {
  const at = Date.parse(`${filed}T00:00:00Z`);
  if (!Number.isFinite(at)) return [];
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const from = day(at - 400 * 86_400_000);
  const to = day(at - 330 * 86_400_000);
  const target = at - 365 * 86_400_000;
  const distance = (file: { filingFrom?: string; filingTo?: string }) => {
    const start = Date.parse(`${file.filingFrom}T00:00:00Z`);
    const end = Date.parse(`${file.filingTo}T00:00:00Z`);
    return target < start ? start - target : target > end ? target - end : 0;
  };
  return files
    .filter((file) => typeof file.name === "string" && /^CIK\d{10}-submissions-\d{3}\.json$/.test(file.name) && String(file.filingFrom ?? "") <= to && String(file.filingTo ?? "") >= from)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, max)
    .map((file) => file.name!);
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
      .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
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
  const range = findSectionRange(text, start, end);
  return range ? text.slice(range.from, range.to) : null;
}

/** Where findSection's span sits in `text`: [from, to). Null when no section of at least 200 characters is found. */
export function findSectionRange(text: string, start: RegExp, end: RegExp, minLength = 200): { from: number; to: number } | null {
  const all = [...text.matchAll(new RegExp(start.source, "gi"))];
  // Headings sit on their own line. A mention inside a sentence ("see Item 1A. Risk Factors") is not a start.
  const atLineStart = all.filter((match) => (match.index ?? 0) === 0 || text[(match.index ?? 0) - 1] === "\n");
  const starts = atLineStart.length > 0 ? atLineStart : all;
  const endRe = new RegExp(`(?:^|\\n)\\s*(?:${end.source})`, "i");
  let best: { from: number; to: number } | null = null;
  for (const match of starts) {
    const from = (match.index ?? 0) + match[0].length;
    const rest = text.slice(from);
    const endMatch = endRe.exec(rest);
    const length = endMatch ? endMatch.index ?? 0 : Math.min(rest.length, 200_000);
    if (!best || length > best.to - best.from) best = { from, to: from + length };
  }
  if (!best || text.slice(best.from, best.to).trim().length < minLength) return null;
  return { from: best.from, to: Math.min(best.to, best.from + 400_000) };
}

/* ── blocks with their emphasis ─────────────────────────────────────────── */

/**
 * One paragraph-like block of a filing: its text, how much of it is set in bold, italic or underline, and the
 * emphasised run it opens with (a heading run into its body on the same line: "<b>Heading.</b> Body…").
 */
export type HtmlBlock = { text: string; emphasis: number; lead: string };

const BLOCK_END = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section", "td", "th"]);
const VOID_TAGS = new Set(["br", "img", "hr", "meta", "link", "input", "col", "wbr"]);
const EMPHASIS_TAGS = new Set(["b", "strong", "i", "em", "u"]);

function emphatic(name: string, attrs: string): boolean {
  if (EMPHASIS_TAGS.has(name)) return true;
  // The attribute's own quote closes it: Workiva writes style="font-family:'Helvetica';font-weight:700".
  const match = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  const style = match ? match[1] ?? match[2] ?? "" : "";
  return /font-weight\s*:\s*(?:bold|bolder|[6-9]00)/i.test(style) || /font-style\s*:\s*italic/i.test(style) || /text-decoration[^;]*underline/i.test(style);
}

/**
 * Filing HTML as blocks, in order, with the share of each block's letters that are emphasised. Inline XBRL headers,
 * scripts and styles are dropped. A tolerant scan, not a full parser: an unclosed inline tag ends with its block's
 * parent, and a stray closing tag is ignored.
 */
export function htmlBlocks(html: string): HtmlBlock[] {
  const source = html.replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ").replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const out: HtmlBlock[] = [];
  const stack: Array<{ name: string; emphatic: boolean }> = [];
  let emphaticDepth = 0;
  let text = "";
  let letters = 0;
  let marked = 0;
  let lead = "";
  let leading = true;
  const flush = () => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) out.push({ text: clean, emphasis: letters > 0 ? marked / letters : 0, lead: lead.replace(/\s+/g, " ").trim() });
    text = "";
    letters = 0;
    marked = 0;
    lead = "";
    leading = true;
  };
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(source))) {
    if (match[4] !== undefined) {
      const piece = decodeEntities(match[4]).replace(/[ ​  ]/g, " ");
      const count = piece.replace(/\s/g, "").length;
      const on = emphaticDepth > 0;
      text += piece;
      letters += count;
      if (on) marked += count;
      if (leading) {
        if (on) lead += piece;
        else if (count > 0) leading = false;
      }
      continue;
    }
    const name = match[2]!.toLowerCase();
    if (match[1] === "/") {
      const at = stack.map((entry) => entry.name).lastIndexOf(name);
      if (at >= 0) {
        for (const entry of stack.splice(at)) if (entry.emphatic) emphaticDepth -= 1;
      }
      if (BLOCK_END.has(name)) flush();
      continue;
    }
    // A line break inside a bold heading ("…expose us<br>to political risks.") is a space, not a new block.
    if (name === "br" && emphaticDepth > 0) text += " ";
    else if (name === "br" || name === "p" || name === "li" || /^h[1-6]$/.test(name)) flush();
    else if (BLOCK_END.has(name) && text.trim()) flush();
    if (VOID_TAGS.has(name) || match[3]!.trim().endsWith("/")) continue;
    const on = emphatic(name, match[3]!);
    stack.push({ name, emphatic: on });
    if (on) emphaticDepth += 1;
  }
  flush();
  return out;
}

/** Blocks as text, one per line, with where each block starts in that text. */
function blocksText(blocks: readonly HtmlBlock[]): { text: string; starts: number[] } {
  const starts: number[] = [];
  let at = 0;
  for (const block of blocks) {
    starts.push(at);
    at += block.text.length + 1;
  }
  return { text: blocks.map((block) => block.text).join("\n"), starts };
}

// A group label inside the section ("Risks Related to Our Business", "General Risks"), not a risk.
const RISK_GROUP = /^(?:(?:general|other|additional|certain)\s+)?risks?\b|\brisks?$|^summary\b|^item\s/i;
const RISK_GROUP_ANYWHERE = /\brisks?\s+(?:related|relating|associated|pertaining|specific)\s+(?:to|with)\b|\brisk factors\b/i;
// The section's own opening lines and cross-references, sometimes set in bold too.
const RISK_PREAMBLE =
  /^(?:the following|the above|the risks? (?:and uncertainties )?(?:described|set forth|discussed)|(?:you|investors|readers|shareholders|stockholders) should (?:carefully )?(?:consider|read|review)|investing in our|an investment in our|purchasing or owning|in addition to the other information|readers should|this section|before (?:you )?(?:decid|invest))/i;

function cleanHeading(text: string): string {
  return text.replace(/^[•·▪◦●■\-–—*\s]+/, "").replace(/\s+/g, " ").trim();
}

/** Whether an emphasised run reads as one risk factor heading. */
export function isRiskHeading(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (text.length < 25 || text.length > 700 || words < 5) return false;
  if (!/^[A-Z0-9"'(“‘$]/.test(text)) return false;
  if (RISK_PREAMBLE.test(text)) return false;
  // A pointer to another report, or a 10-Q's "no material changes" line set in bold, is not a risk.
  if (/\b(?:form 10-[kq]|annual report|quarterly report)\b/i.test(text) && /\bitem\s*1a\b|\bpart\s+i|\brisk factors\b|\b(?:disclosed|described|discussed|set forth)\b/i.test(text)) return false;
  if (/\bno (?:material|significant) changes?\b|\bhave not (?:been )?(?:materially |significantly )?changed\b|\bforward-looking statements\b/i.test(text)) return false;
  const ends = /[.?!:]["'”’)]?$/.test(text);
  // Headings without a full stop are only taken when they read as a sentence, not as a group label.
  if (!ends && (words < 8 || RISK_GROUP.test(text) || RISK_GROUP_ANYWHERE.test(text))) return false;
  // "Risks Related to the Pending Acquisition of Acme Corp." is a group label even with its full stop.
  if (words < 12 && RISK_GROUP_ANYWHERE.test(text)) return false;
  return true;
}

/**
 * Risk factor headings from the blocks of one section, in filing order: blocks set (almost) wholly in bold, italic or
 * underline, or a block that opens with an emphasised sentence. This follows the filer's own formatting, so a body
 * paragraph is never taken for a heading. Duplicates (the same heading in a summary list and the full text) are
 * kept once.
 */
export function riskHeadingsFromBlocks(blocks: readonly HtmlBlock[], max = 400): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (out.length >= max) break;
    let candidate: string | null = null;
    if (block.emphasis >= 0.9) candidate = block.text;
    else if (block.lead.length >= 40) {
      if (/[.?!]["'”’]?$/.test(block.lead)) candidate = block.lead;
      else {
        // "<b>If our brands are damaged, our results may be harmed</b>. Our brands…": the full stop is set in plain type.
        const stop = /^\s*([.?!])/.exec(block.text.slice(block.text.indexOf(block.lead) + block.lead.length));
        if (stop && block.text.startsWith(block.lead)) candidate = `${block.lead}${stop[1]}`;
      }
    }
    if (!candidate) continue;
    const heading = cleanHeading(candidate);
    if (!isRiskHeading(heading) || seen.has(heading)) continue;
    seen.add(heading);
    out.push(heading);
  }
  return out;
}

/** What a filing's Item 1A holds. */
export type RiskList = {
  /** Whether an Item 1A section was found at all. */
  found: boolean;
  /** Risk factor headings in filing order, uncapped. */
  headings: string[];
  /** The section's words before its first heading (a 10-Q's "no material changes" line lives here), at most 1,200 characters. */
  intro: string | null;
  /** How the headings were found: the filer's bold or italic formatting, or the older layout guess. */
  method: "emphasis" | "layout" | "none";
};

const RISK_LIST_MIN_SECTION = 40;

/**
 * Item 1A of a 10-K or 10-Q, read for its headings. The filer's formatting comes first (riskHeadingsFromBlocks); a
 * filing that sets its headings in plain type falls back to the layout guess (riskHeadings: a short sentence followed
 * by a long paragraph), but only when that guess finds clearly more.
 */
export function readRiskList(form: "10-K" | "10-Q", html: string): RiskList {
  const blocks = htmlBlocks(html);
  const { text, starts } = blocksText(blocks);
  // Only an "Item 1A" section is read. Filers that drop the item numbers (GE, Morgan Stanley, Intel) are left
  // unreadable on purpose: a bare "Risk Factors" title ran on into other sections in testing (Intel, Citi), and a wrong
  // list would be reported as new risks.
  const range = findSectionRange(text, RISK_START, form === "10-K" ? RISK_END_10K : RISK_END_10Q, RISK_LIST_MIN_SECTION);
  if (!range) return { found: false, headings: [], intro: null, method: "none" };
  const inside = blocks.filter((_, index) => starts[index]! + blocks[index]!.text.length > range.from && starts[index]! < range.to);
  const emphasised = riskHeadingsFromBlocks(inside);
  const section = text.slice(range.from, range.to);
  const layout = riskHeadings(section, 400);
  // A stray unclosed <b> makes every later paragraph look bold: a "list" that is most of the section is not one.
  if (inside.length >= 20 && emphasised.length > inside.length * 0.5) return { found: false, headings: [], intro: null, method: "none" };
  const useLayout = emphasised.length < 3 && layout.length >= 5;
  const headings = useLayout ? layout : emphasised;
  const first = headings[0] ? section.indexOf(headings[0]) : -1;
  const before = (first >= 0 ? section.slice(0, first) : section).replace(/^[\s.:\-–—]+/, "").replace(/\s+/g, " ").trim();
  return {
    found: true,
    headings,
    intro: before ? clip(before, 1200) : null,
    method: headings.length === 0 ? "none" : useLayout ? "layout" : "emphasis",
  };
}

const riskListCache = new Map<string, RiskList>();

/** Fetch one filing and read its Item 1A. Cached by accession: a filing never changes. */
export async function fetchRiskList(filing: EdgarFiling, fetcher?: typeof fetch): Promise<RiskList> {
  const cached = riskListCache.get(filing.accession);
  if (cached) return cached;
  const response = await secFetch(filing.url, fetcher);
  if (!response.ok) throw new Error(`sec_document_${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_DOC_BYTES) throw new Error("sec_document_too_large");
  const list = readRiskList(filing.form, await response.text());
  if (riskListCache.size > 40) riskListCache.delete(riskListCache.keys().next().value as string);
  riskListCache.set(filing.accession, list);
  return list;
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

// "Item 1A. Risk Factors", "ITEM 1.A. RISK FACTORS" (Clorox).
const RISK_START = /item\s*1\.?\s*a\.?\s*[-–—:.]?\s*risk\s+factors/i;
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
    const risks = readRiskList("10-K", html);
    const mda = findSection(text, MDA_START_10K, MDA_END_10K);
    return {
      filing,
      business: business ? businessParagraphs(business) : [],
      risks: risks.headings.slice(0, 24),
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
    risks: readRiskList("10-Q", html).headings.slice(0, 12),
    mda: mda ? mdaHighlights(mda, 12) : [],
    risk_update: firstRisk ? clip(firstRisk, 600) : null,
  };
}

/** For tests: forget cached lookups. */
export function resetEdgarCaches(): void {
  tickerMap = null;
  readCache.clear();
  riskListCache.clear();
}
