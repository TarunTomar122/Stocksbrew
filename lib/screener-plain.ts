/**
 * The screener in plain words: "stocks with the lowest P/E compared to their
 * history" becomes the screener's own filters, sort and columns, so the table,
 * the chips and the link are exactly what the controls would have made.
 *
 * - Fixed rules read the common phrasings (this file). They cost nothing and
 *   run in the browser as you type.
 * - What the rules leave over can go to a model on the server
 *   (lib/screener-plain-model.ts), which may only pick from the same fields.
 *   Its answer comes back through `cleanPlainScreen`, which drops anything
 *   that is not a real field, sector, size or call and clamps every range.
 *
 * Pure: no I/O, safe on the server and the client.
 */

import {
  ALL_COLUMN_IDS,
  CALL_COLUMN_IDS,
  CAP_TIERS,
  CALL_WORDS,
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  FIELD_BY_ID,
  MAX_COLUMNS,
  NUMERIC_FIELDS,
  ZONES,
  canonicalSectorSlug,
  isFiniteNumber,
  isSortable,
  viewHref,
  type CallWord,
  type CapTier,
  type Range,
  type ScreenerFilters,
  type ScreenerSort,
  type ScreenerView,
  type SortDir,
  type Zone,
} from "@/lib/screener-shared";

export const PLAIN_MAX_CHARS = 200;
/** The URL param that carries the sentence, so a shared link opens with it in the box. */
export const SAY_PARAM = "say";

export type PlainScreen = {
  filters: ScreenerFilters;
  sort: ScreenerSort | null;
  /** Fields the sentence talked about, in the order it named them. They come forward as columns. */
  fields: string[];
  /** Words the rules (or the model) could not turn into a filter, as the phrases the person typed. */
  leftover: string[];
};

/** Why the server could not read the leftover words: signed out (no Ask questions), today's questions used, or no model. */
export type PlainNote = "sign_in" | "limit" | "unavailable" | null;

/** What /api/screener/understand answers. */
export type PlainReply = {
  screen: PlainScreen;
  via: "rules" | "model" | "cache";
  note: PlainNote;
  /** Ask questions left today after this read, when a read was counted. */
  remaining?: number;
  message?: string;
};

/** The sectors the screener knows, by the slug its URLs use. */
export const PLAIN_SECTORS: Array<{ slug: string; name: string }> = [
  { slug: "technology", name: "Technology" },
  { slug: "health-care", name: "Health Care" },
  { slug: "financials", name: "Financials" },
  { slug: "energy", name: "Energy" },
  { slug: "industrials", name: "Industrials" },
  { slug: "consumer-discretionary", name: "Consumer Discretionary" },
  { slug: "consumer-staples", name: "Consumer Staples" },
  { slug: "materials", name: "Materials" },
  { slug: "real-estate", name: "Real Estate" },
  { slug: "utilities", name: "Utilities" },
  { slug: "communication-services", name: "Communication Services" },
];
const SECTOR_SLUGS = new Set(PLAIN_SECTORS.map((sector) => sector.slug));

/**
 * The natural ends of fields that have them. Ranges are clamped to these, and
 * a sort on one of them also keeps only stocks that have the figure.
 */
export const FIELD_BOUNDS: Partial<Record<string, { min: number; max: number }>> = {
  pe_hist_pctile: { min: 0, max: 100 },
  buy_pct: { min: 0, max: 100 },
  inst_own: { min: 0, max: 100 },
  rsi: { min: 0, max: 100 },
  score: { min: 0, max: 100 },
  s_value: { min: 0, max: 100 },
  s_growth: { min: 0, max: 100 },
  s_quality: { min: 0, max: 100 },
  s_momentum: { min: 0, max: 100 },
};
/** Every other field: wide enough for any real figure, and keeps a typo like 1e40 out of the URL. */
const ANY_BOUND = 1e14;
const FULL_RANGE_FIELDS = new Set(Object.keys(FIELD_BOUNDS));

/** Shown beside a field when the sentence names it, as it reads best with it. */
const COMPANION_COLUMNS: Record<string, string[]> = {
  pe_hist_pctile: ["pe"],
  from_lo_pct: ["from_hi_pct"],
  buys_chg_3m: ["buy_pct"],
  earnings_in_days: ["earnings_date"],
  div_yield: ["payout"],
};

/* ── text ───────────────────────────────────────────────────────────────── */

export function normalizePlain(text: string): string {
  return text
    .slice(0, PLAIN_MAX_CHARS)
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\bp\s*\/\s*e\b/g, "p/e")
    .replace(/\bp\.e\.?(?=\s|$)/g, "p/e")
    .replace(/\bp\s*\/\s*s\b/g, "p/s")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    // "top 10 dividend stocks": the order is the answer, and the 10 must not read as "a 10% yield".
    .replace(/\b(top|first|bottom) \d+\b/g, (_, word: string) => (word === "first" ? "top" : word))
    .replace(/[?!;]+/g, " ")
    .replace(/,(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GAP = "\u0000";
const NEGATED = /\b(?:not|no|don'?t|doesn'?t|isn'?t|aren'?t|without|excluding|except|never|non-?)(?: [a-z']+){0,2}\s*-?$/;

/** Walks the sentence once. Each phrase it reads is cut out of `rest`, so nothing is read twice and the leftover is what remains. */
class Reader {
  rest: string;
  constructor(text: string) {
    this.rest = ` ${text} `;
  }
  take(pattern: RegExp, onMatch: (match: RegExpExecArray) => boolean | void): void {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    const spans: Array<[number, number]> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(this.rest)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (this.rest.slice(match.index, match.index + match[0].length).includes(GAP)) continue;
      // "don't pay dividends", "not in tech", "excluding banks": the screen can only look for what a stock has,
      // so a negated phrase is left over whole rather than read as its opposite.
      if (NEGATED.test(this.rest.slice(Math.max(0, match.index - 40), match.index))) continue;
      if (onMatch(match) !== false) spans.push([match.index, match.index + match[0].length]);
    }
    for (const [start, end] of spans.reverse()) {
      this.rest = `${this.rest.slice(0, start)} ${GAP} ${this.rest.slice(end)}`;
    }
  }
}

/* ── vocabulary ─────────────────────────────────────────────────────────── */

const W = (source: string) => `\\b(?:${source})\\b`;

/** Field names as people say them. Order matters: the longer, more specific names come first. */
const TERMS: Array<[string, RegExp]> = [
  ["fwd_pe", /(?:forward|fwd|next year'?s?) (?:p\/e|pe|price[- ]to[- ]earnings)(?: ratios?)?/],
  ["peg", /peg(?: ratios?)?/],
  ["p_fcf", /p\/fcf|price[- ]to[- ](?:free[- ])?cash[- ]flow/],
  ["ev_ebitda", /ev\/ebitda|ev to ebitda|enterprise value to ebitda/],
  ["ps", /p\/s(?: ratios?)?|price[- ]to[- ]sales(?: ratios?)?|sales multiples?/],
  ["pe", /p\/e(?: ratios?| multiples?)?|pe ratios?|pe|price[- ]to[- ]earnings(?: ratios?)?|earnings multiples?/],
  ["rev_cagr_3y", /(?:3|three)[- ]year (?:sales|revenue) growth|(?:sales|revenue) growth over (?:3|three) years/],
  ["eps_next_y", /(?:expected|next year'?s?|forward) (?:eps|earnings) growth/],
  ["s_growth", /growth scores?/],
  ["s_value", /value scores?|valuation scores?/],
  ["s_quality", /quality scores?/],
  ["s_momentum", /momentum scores?|momentum/],
  ["eps_growth", /(?:eps|earnings(?: per share)?|profit) growth/],
  ["gross_margin", /gross margins?/],
  ["op_margin", /operating margins?|op margins?/],
  ["fcf_margin", /(?:fcf|free[- ]cash[- ]flow) margins?/],
  ["net_margin", /(?:net|profit|net profit) margins?|margins?/],
  ["roic", /roic|return on (?:invested )?capital/],
  ["roe", /roe|return on equity/],
  ["debt_equity", /debt[- ]to[- ]equity|d\/e|debt|leverage/],
  ["current_ratio", /current ratio/],
  ["net_cash", /net cash/],
  ["div_growth_years", /years of dividend (?:growth|raises|increases)|dividend (?:growth )?streak/],
  ["div_growth", /dividend growth|dividend raises|dividend increases/],
  ["payout", /payout(?: ratios?)?/],
  ["buyback_yield", /buybacks?(?: yields?)?|share repurchases?|buy(?:s|ing)? back (?:shares|stock|their stock)/],
  ["div_yield", /dividend yields?|dividends?|yields?/],
  ["rev_growth", /(?:sales|revenue|top[- ]line) growth|growth in (?:sales|revenue)|growth/],
  ["upside", /upside(?: to (?:the |their |its )?(?:analyst )?(?:price )?targets?)?|(?:analyst )?(?:price )?target upside|(?:analyst |price )targets?/],
  ["buy_pct", /buy ratings?|analyst ratings?|share of buys/],
  ["analyst_count", /analyst coverage|analysts covering|number of analysts/],
  ["vol_90d", /volatility|price swings?/],
  ["beta", /beta/],
  ["drawdown_1y", /(?:max(?:imum)? )?drawdowns?/],
  ["rsi", /rsi/],
  ["short_float", /short (?:interest|float)/],
  ["inst_own", /institutional (?:ownership|owners|holders)/],
  ["score", /(?:our |overall |composite )?scores?/],
  ["market_cap", /market (?:cap(?:italization|italisation)?|value)|company value|mkt cap|market caps/],
  ["price", /(?:share |stock )?price/],
];

/** How long ago a return is counted from, as people say it. */
const PERIODS: Array<[string, RegExp]> = [
  ["ret_ytd", new RegExp(`this year|ytd|year[- ]to[- ]date|so far this year|in ${new Date().getUTCFullYear()}`)],
  ["ret_5y", /(?:over |in )?(?:the )?(?:past|last) (?:5|five) years|over (?:5|five) years|5[- ]?y(?:ears?)?/],
  ["ret_3y", /(?:over |in )?(?:the )?(?:past|last) (?:3|three) years|over (?:3|three) years|3[- ]?y(?:ears?)?/],
  ["ret_1y", /(?:over |in )?(?:the )?(?:past|last) (?:year|12 months)|over (?:a|one|the) year|1[- ]?y(?:ear)?|12[- ]months?/],
  ["ret_6m", /(?:over |in )?(?:the )?(?:past|last) (?:6|six) months|6[- ]?m(?:onths?)?|six months/],
  ["ret_3m", /(?:over |in )?(?:the )?(?:past|last) (?:3|three) months|3[- ]?m(?:onths?)?|three months|(?:this|last|past) quarter/],
  ["ret_1m", /this month|(?:over |in )?(?:the )?(?:past|last) month|1[- ]?m(?:onth)?|30 days/],
  ["ret_1w", /this week|(?:over |in )?(?:the )?(?:past|last) week|1[- ]?w(?:eek)?|(?:5|five) days/],
  ["day_pct", /today|on the day/],
];

const UP_SUP = "highest|most|biggest|largest|greatest|top|best|strongest|fastest|richest";
const DOWN_SUP = "lowest|least|smallest|fewest|bottom|worst|weakest|slowest|cheapest";
const SUP = `(?:(?:the|their|its) )?(${UP_SUP}|${DOWN_SUP})(?: \\d+)?`;
const MORE = "over|above|more than|greater than|bigger than|larger than|higher than|at least|exceeding|north of|>=?|min(?:imum)?(?: of)?";
const LESS = "under|below|less than|lower than|smaller than|at most|no more than|beneath|south of|<=?|max(?:imum)?(?: of)?";
const NUMU = "(-?\\$?\\d+(?:\\.\\d+)?)\\s?(%|percent|x|×|trillion|tn|t|billion|bn|b|million|mn|mm|m|k)?";
const PLUS = "(?:\\+|or more|or higher|or above|and up|and above|plus)";
const MINUS = "(?:or less|or lower|or below|and under|and below)";
const HIGH = "high|higher|big|strong|large|fat|juicy|rich|fast|rapid|solid|great|good|healthy|robust|double[- ]digit";
const LOW = "low|lower|small|tiny|weak|thin|slow|little|modest|minimal";

/** What "high X" and "low X" mean when no number is given. Shown as a normal chip, so the number is there to change. */
const ADJECTIVE_RANGES: Partial<Record<string, { high?: Range; low?: Range }>> = {
  div_yield: { high: { min: 3 }, low: { max: 1.5 } },
  pe: { high: { min: 30 }, low: { max: 15 } },
  fwd_pe: { high: { min: 30 }, low: { max: 15 } },
  ps: { high: { min: 10 }, low: { max: 2 } },
  peg: { high: { min: 2 }, low: { max: 1 } },
  p_fcf: { high: { min: 40 }, low: { max: 15 } },
  ev_ebitda: { high: { min: 25 }, low: { max: 10 } },
  rev_growth: { high: { min: 20 }, low: { max: 5 } },
  rev_cagr_3y: { high: { min: 15 }, low: { max: 5 } },
  eps_growth: { high: { min: 20 }, low: { max: 5 } },
  eps_next_y: { high: { min: 20 }, low: { max: 5 } },
  gross_margin: { high: { min: 50 }, low: { max: 25 } },
  op_margin: { high: { min: 20 }, low: { max: 5 } },
  net_margin: { high: { min: 20 }, low: { max: 5 } },
  fcf_margin: { high: { min: 15 }, low: { max: 3 } },
  roe: { high: { min: 20 }, low: { max: 5 } },
  roic: { high: { min: 15 }, low: { max: 5 } },
  debt_equity: { high: { min: 2 }, low: { max: 0.5 } },
  current_ratio: { high: { min: 2 }, low: { max: 1 } },
  payout: { high: { min: 75 }, low: { max: 60 } },
  buyback_yield: { high: { min: 3 } },
  upside: { high: { min: 20 }, low: { max: 5 } },
  buy_pct: { high: { min: 70 }, low: { max: 40 } },
  vol_90d: { high: { min: 50 }, low: { max: 25 } },
  beta: { high: { min: 1.5 }, low: { max: 0.8 } },
  short_float: { high: { min: 15 }, low: { max: 3 } },
  inst_own: { high: { min: 70 }, low: { max: 30 } },
  score: { high: { min: 70 }, low: { max: 40 } },
  s_value: { high: { min: 70 }, low: { max: 40 } },
  s_growth: { high: { min: 70 }, low: { max: 40 } },
  s_quality: { high: { min: 70 }, low: { max: 40 } },
  s_momentum: { high: { min: 70 }, low: { max: 40 } },
};

/** Words that pick an industry: the screen's search runs on the industry label, so each maps to a word in it. */
const INDUSTRIES: Array<[string, RegExp]> = [
  ["semiconductor", /chips?|chipmakers?|chip makers?|semis|semiconductors?|semiconductor (?:stocks|companies|makers)/],
  ["software", /software|saas/],
  ["bank", /banks?|banking|lenders?/],
  ["insurance", /insurers?|insurance(?: companies)?/],
  ["biotech", /biotechs?|biotechnology/],
  ["aerospace", /defen[cs]e(?: companies| contractors| stocks)?|aerospace/],
  ["restaurant", /restaurants?/],
  ["airline", /airlines?/],
  ["uranium", /uranium/],
  ["cybersecurity", /cyber ?security/],
];

const SECTORS: Array<[string, RegExp]> = [
  ["technology", /tech(?:nology)?(?: sector)?/],
  ["health-care", /health ?care|healthcare|medical|pharma(?:ceuticals?)?|drug ?makers?/],
  ["financials", /financials?|finance/],
  ["energy", /energy|oil(?: (?:and|&) gas)?/],
  ["industrials", /industrials?/],
  ["consumer-discretionary", /consumer discretionary|discretionary|consumer cyclicals?|retail(?:ers)?/],
  ["consumer-staples", /consumer staples|staples|consumer defensive/],
  ["materials", /(?:basic )?materials|miners|mining|chemicals?/],
  ["real-estate", /real estate|reits?/],
  ["utilities", /utilit(?:y|ies)/],
  ["communication-services", /communication(?:s| services)|telecoms?|media/],
];

const CAPS: Array<[CapTier, RegExp]> = [
  ["mega", /mega[- ]?caps?|mega[- ]cap (?:stocks|companies)|giants/],
  ["large", /large[- ]?caps?|big[- ]caps?/],
  ["mid", /mid[- ]?caps?/],
  ["small", /small[- ]?caps?/],
  ["micro", /micro[- ]?caps?|penny stocks?/],
];

const STOP = new Set(
  (
    "a an the and or but of in on at to for by with from as is are be been was were it its their them they these those this that which who whose where what " +
    "stock stocks company companies name names share shares equities ones business businesses firm firms " +
    "show me find give list get want i we us my our you your please looking look for some any all only just also still very really quite pretty " +
    "have has having that's there there's do does can could would should will sorted ranked order ordered sort rank first than compared vs versus like " +
    "right now currently today's whose good"
  ).split(" "),
);

/* ── the draft ──────────────────────────────────────────────────────────── */

type Draft = {
  q: string;
  sectors: string[];
  caps: CapTier[];
  calls: CallWord[];
  zones: Zone[];
  ranges: Record<string, Range>;
  sort: ScreenerSort | null;
  fields: string[];
  cheap: boolean;
  expensive: boolean;
  /** Phrases read and known to be outside the screen (the person's own holdings), handed back whole. */
  outside: string[];
};

function addOnce<T>(list: T[], item: T): void {
  if (!list.includes(item)) list.push(item);
}

function mention(draft: Draft, id: string): void {
  addOnce(draft.fields, id);
}

function setRange(draft: Draft, id: string, range: Range): void {
  draft.ranges[id] = { ...(draft.ranges[id] ?? {}), ...range };
  mention(draft, id);
}

function setSort(draft: Draft, id: string, dir: SortDir): void {
  draft.sort ??= { id, dir };
  mention(draft, id);
}

function supDir(word: string, id: string): SortDir {
  const up = new RegExp(`^(?:${UP_SUP})$`).test(word);
  const field = FIELD_BY_ID.get(id);
  // "best" and "worst" follow the field's good end: the best P/E is the lowest one.
  if ((word === "best" || word === "worst") && field?.better === "low") return word === "best" ? "asc" : "desc";
  return up ? "desc" : "asc";
}

/** A number as the field's own unit: "$50b" in dollars for company value, "20%" as 20 for a percentage. */
function toFieldValue(id: string, raw: string, unit: string | undefined): number | null {
  const value = Number(raw.replace("$", ""));
  if (!Number.isFinite(value)) return null;
  const field = FIELD_BY_ID.get(id);
  if (field?.unit === "money") {
    // A bare number this big is already dollars ("over 2000000000"); a small one is billions ("over 50").
    if (!unit && Math.abs(value) >= 1e6) return value;
    const scale = unit && /^(?:t|tn|trillion)$/.test(unit) ? 1e12 : unit && /^(?:m|mn|mm|million)$/.test(unit) ? 1e6 : unit === "k" ? 1e3 : 1e9;
    return value * scale;
  }
  if (unit && /^(?:b|bn|billion|t|tn|trillion|m|mn|mm|million|k)$/.test(unit)) return null;
  return value;
}

function termSource(id: string): string | null {
  const term = TERMS.find(([field]) => field === id);
  return term ? term[1].source : null;
}

/* ── the rules ──────────────────────────────────────────────────────────── */

function readHistory(reader: Reader, draft: Draft): void {
  const val = "(?:p\\/e|pe|p\\/e ratios?|pe ratios?|price[- ]to[- ]earnings(?: ratios?)?|valuations?|multiples?|earnings multiples?)";
  const past =
    "(?:(?:its|their|the|his|her) )?(?:own )?(?:history|historical(?: (?:average|range|norm|levels?))?|past|usual|norm|normal|average|typical|(?:\\d+|five|ten)[- ]year (?:average|range))";
  const versus = "(?:compared|relative) (?:to|with)|vs\\.?|versus|against|from|to";
  const cheaper = "below|under|lower than|cheaper than|less than";
  const pricier = "above|over|higher than|pricier than|more than";
  // "the lowest P/E compared to their history", "P/E below its history", "P/E vs own"
  reader.take(new RegExp(`\\b(?:${SUP} )?${val} (${versus}|${cheaper}|${pricier}) ${past}|\\b(?:${SUP} )?${val} vs own\\b`), (match) => {
    const word = match[1] ?? match[3];
    const relation = match[2] ?? "";
    if (word) {
      setSort(draft, "pe_hist_pctile", supDir(word, "pe_hist_pctile"));
    } else if (new RegExp(`^(?:${cheaper})$`).test(relation)) {
      setRange(draft, "pe_hist_pctile", { max: 25 });
      setSort(draft, "pe_hist_pctile", "asc");
    } else if (new RegExp(`^(?:${pricier})$`).test(relation)) {
      setRange(draft, "pe_hist_pctile", { min: 75 });
      setSort(draft, "pe_hist_pctile", "desc");
    } else {
      setSort(draft, "pe_hist_pctile", "asc");
    }
  });
  // "cheap compared to their history", "cheaper than usual", "historically cheap", "below their usual P/E"
  reader.take(
    new RegExp(
      `\\b(cheap(?:est|er)?|expensive|pricey|pricier) (?:than|${versus}) ${past}(?: ${val})?|\\bhistorically (cheap(?:est|er)?|expensive)|\\b(below|above) ${past} ${val}`,
    ),
    (match) => {
      const word = match[1] ?? match[2] ?? match[3] ?? "";
      const pricey = /expensive|pricey|pricier|above/.test(word);
      setRange(draft, "pe_hist_pctile", pricey ? { min: 75 } : { max: 25 });
      setSort(draft, "pe_hist_pctile", pricey ? "desc" : "asc");
    },
  );
}

function readCallsAndZones(reader: Reader, draft: Draft): void {
  reader.take(
    /\b(?:(?:that|which) )?(?:we'?d|we would|you'?d|you would) (?:buy more|keep|hold|sell some|sell|trim)(?: of)?\b|\b(?:(?:that|which) )?(?:we|you) (?:buy more|sell some)\b|\b(?:our )?call(?: is| of)?:? (?:buy more|keep|hold|sell some|trim)\b|\brated (?:buy more|keep|sell some)\b|\bbuy[- ]more (?:calls?|rated|names|stocks)\b|\bsell[- ]some (?:calls?|rated|names|stocks)\b/,
    (match) => {
      const text = match[0];
      if (/buy more/.test(text)) addOnce(draft.calls, "Add");
      else if (/keep|hold/.test(text)) addOnce(draft.calls, "Hold");
      else addOnce(draft.calls, "Trim");
      mention(draft, "call");
    },
  );
  reader.take(/\b(?:in|inside) (?:the |our )?(buy|add|buy[- ]more|sell|trim|sell[- ]some) (?:zone|range)\b|\bat (?:our )?buy[- ]more (?:price|level)s?\b/, (match) => {
    const word = match[1] ?? "buy";
    addOnce(draft.zones, /sell|trim/.test(word) ? "trim" : "add");
    mention(draft, "zone");
  });
}

function readSize(reader: Reader, draft: Draft): void {
  // "small and mid caps"
  reader.take(/\b(mega|large|big|mid|small|micro)(?:[- ]?caps?)? (?:and|or|&|to) (mega|large|big|mid|small|micro)[- ]?caps?\b/, (match) => {
    for (const word of [match[1]!, match[2]!]) addOnce(draft.caps, (word === "big" ? "large" : word) as CapTier);
  });
  for (const [tier, pattern] of CAPS) reader.take(new RegExp(W(pattern.source)), () => addOnce(draft.caps, tier));
  reader.take(/\bblue[- ]chips?\b/, () => {
    addOnce(draft.caps, "mega");
    addOnce(draft.caps, "large");
  });
  reader.take(/\b(?:the )?(biggest|largest|most valuable|smallest) (?:\d+ )?(?:companies|stocks|names|firms|businesses|caps)\b/, (match) => {
    setSort(draft, "market_cap", match[1] === "smallest" ? "asc" : "desc");
  });
}

function readPlaces(reader: Reader, draft: Draft): void {
  for (const [q, pattern] of INDUSTRIES) {
    reader.take(new RegExp(W(pattern.source)), () => {
      if (!draft.q) draft.q = q;
      else return false;
    });
  }
  for (const [slug, pattern] of SECTORS) reader.take(new RegExp(W(pattern.source)), () => addOnce(draft.sectors, slug));
}

function readPriceAction(reader: Reader, draft: Draft): void {
  const nearLow = "(?:a |the |their |its )?(?:new )?(?:52[- ]week |one[- ]year |1[- ]year |12[- ]month |yearly |annual )?lows?";
  const nearHigh = "(?:a |the |their |its )?(?:new )?(?:52[- ]week |one[- ]year |1[- ]year |12[- ]month |yearly |annual |all[- ]time |record )?highs?";
  reader.take(new RegExp(`\\bwithin ${NUMU} (?:of|from) ${nearLow}\\b`), (match) => {
    setRange(draft, "from_lo_pct", { max: Math.abs(Number(match[1]!.replace("$", ""))) });
    setSort(draft, "from_lo_pct", "asc");
  });
  reader.take(new RegExp(`\\bwithin ${NUMU} (?:of|from) ${nearHigh}\\b`), (match) => {
    setRange(draft, "from_hi_pct", { min: -Math.abs(Number(match[1]!.replace("$", ""))) });
    setSort(draft, "from_hi_pct", "desc");
  });
  reader.take(new RegExp(`\\b(?:near|close to|at|around|by|hitting|making) ${nearLow}\\b`), () => {
    setRange(draft, "from_lo_pct", { max: 20 });
    setSort(draft, "from_lo_pct", "asc");
  });
  reader.take(new RegExp(`\\b(?:near|close to|at|around|hitting|making) ${nearHigh}\\b`), () => {
    setRange(draft, "from_hi_pct", { min: -5 });
    setSort(draft, "from_hi_pct", "desc");
  });
  reader.take(/\bbeaten[- ]down\b|\bfallen angels?\b|\bwell off (?:their |its )?highs?\b|\bdown a lot\b|\bcrushed\b|\bbattered\b/, () => {
    setRange(draft, "from_hi_pct", { max: -30 });
    setSort(draft, "from_hi_pct", "asc");
  });
  reader.take(/\boversold\b/, () => setRange(draft, "rsi", { max: 30 }));
  reader.take(/\boverbought\b/, () => setRange(draft, "rsi", { min: 70 }));
  reader.take(/\b(above|over|below|under) (?:the |its |their )?(50|200)[- ]day(?: moving)?(?: averages?| ma| lines?)?\b/, (match) => {
    const id = match[2] === "50" ? "vs_50d" : "vs_200d";
    setRange(draft, id, /above|over/.test(match[1]!) ? { min: 0 } : { max: 0 });
  });

  // Returns: "down this year", "up 50% over the past year", "best performers this month".
  for (const [id, period] of PERIODS) {
    const p = `(?:${period.source})`;
    reader.take(new RegExp(`\\b(down|lower|fell|falling|dropped|lost|negative|red|up|higher|rose|rising|gained|positive|green) (?:(?:more than|over|at least|by) )?(?:${NUMU} )?(?:or more )?${p}\\b`), (match) => {
      const down = /down|lower|fell|falling|dropped|lost|negative|red/.test(match[1]!);
      const size = match[2] ? Math.abs(Number(match[2].replace("$", ""))) : 0;
      setRange(draft, id, down ? { max: size === 0 ? 0 : -size } : { min: size });
    });
    reader.take(new RegExp(`\\b(?:the )?(best|top|biggest|worst) (?:\\d+ )?(performers?|gainers?|winners?|losers?|decliners?|fallers?)(?: ${p})\\b`), (match) => {
      const loser = match[1] === "worst" || /losers?|decliners?|fallers?/.test(match[2]!);
      setSort(draft, id, loser ? "asc" : "desc");
    });
    reader.take(new RegExp(`\\b${SUP} (?:returns?|performance|gains?|moves?) ${p}|\\b${p} (?:returns?|performance)\\b`), (match) => {
      if (match[1]) setSort(draft, id, supDir(match[1], id));
      else mention(draft, id);
    });
  }
  // With no period: the day's movers.
  reader.take(/\b(?:the )?(best|top|biggest|worst) (?:\d+ )?(performers?|gainers?|winners?|losers?|decliners?|fallers?|movers?)\b/, (match) => {
    const loser = match[1] === "worst" || /losers?|decliners?|fallers?/.test(match[2]!);
    setSort(draft, "day_pct", loser ? "asc" : "desc");
  });
}

function readAnalystsAndEarnings(reader: Reader, draft: Draft): void {
  reader.take(
    /\banalysts? (?:are )?(?:warming(?: up)?|turning (?:positive|bullish)|upgrading|getting (?:more )?bullish|more bullish|adding buys)\b|\b(?:more|rising|new) buy ratings\b|\bupgrades\b/,
    () => setRange(draft, "buys_chg_3m", { min: 1 }),
  );
  reader.take(/\banalysts? (?:are )?(?:cooling|souring|turning (?:negative|bearish)|downgrading|getting (?:more )?bearish)\b|\bdowngrades\b/, () =>
    setRange(draft, "buys_chg_3m", { max: -1 }),
  );
  reader.take(
    /\banalysts? (?:love|like|favou?r|recommend|rate (?:it |them )?(?:a )?buy|say buy)\b|\banalyst (?:favou?rites?|darlings?|picks?)\b|\bstrong buys?\b|\bbuy[- ]rated\b|\bwall street (?:loves|likes)\b/,
    () => setRange(draft, "buy_pct", { min: 70 }),
  );
  reader.take(/\b(?:report(?:s|ing)?(?: earnings)?|earnings(?: reports?)?) (?:in|within) (?:the )?(?:next )?(\d+) days\b/, (match) => {
    setRange(draft, "earnings_in_days", { min: 0, max: Number(match[1]) });
    setSort(draft, "earnings_in_days", "asc");
  });
  reader.take(
    /\b(?:report(?:s|ing)?(?: earnings)?|earnings(?: reports?)?|earnings are) (this week|next week|soon|coming up|within a week|in a week|in the next week)\b|\bupcoming earnings\b|\bearnings soon\b/,
    (match) => {
      const week = match[1] && /this week|within a week|in a week|in the next week/.test(match[1]);
      setRange(draft, "earnings_in_days", { min: 0, max: week ? 7 : 14 });
      setSort(draft, "earnings_in_days", "asc");
    },
  );
}

function readQualities(reader: Reader, draft: Draft): void {
  reader.take(/\b(fastest|slowest)[- ]growing\b|\b(fastest|slowest) growers\b/, (match) => {
    setSort(draft, "rev_growth", (match[1] ?? match[2]) === "slowest" ? "asc" : "desc");
  });
  // "growing 20%+", "still growing", "fast growing", "growing sales over 10%"
  reader.take(
    new RegExp(
      `\\b(?:(still|fast(?:er)?|quickly|rapidly|fast[- ]) ?)?(?:growing|growers?)(?: (?:sales|revenue|the top line))?(?: (?:at|by))?(?: (?:(${MORE})|(${LESS})) )?(?: ?${NUMU} ?(${PLUS}|a year|per year|annually|yoy|year over year)?)?(?=\\s)`,
    ),
    (match) => {
      const [, speed, more, less, raw] = match;
      if (raw) {
        const value = Number(raw.replace("$", ""));
        setRange(draft, "rev_growth", less && !more ? { max: value } : { min: value });
      } else {
        setRange(draft, "rev_growth", { min: speed && speed !== "still" ? 20 : 0 });
      }
    },
  );
  reader.take(/\bprofitable\b|\bmaking money\b|\bin the black\b|\bmake a profit\b/, () => setRange(draft, "net_margin", { min: 0 }));
  reader.take(/\bunprofitable\b|\blosing money\b|\bin the red\b|\bloss[- ]making\b/, () => setRange(draft, "net_margin", { max: 0 }));
  reader.take(/\bcash[- ]rich\b|\bmore cash than debt\b|\bnet cash positive\b/, () => setRange(draft, "net_cash", { min: 0 }));
  reader.take(/\bdebt[- ]free\b|\bno debt\b|\bzero debt\b/, () => setRange(draft, "debt_equity", { max: 0.1 }));
  reader.take(/\b(?:calm|steady|stable|low[- ]vol(?:atility)?|defensive)\b/, () => setRange(draft, "vol_90d", { max: 25 }));
  reader.take(/\b(?:most|highly|very) volatile\b|\bswingy\b/, () => setSort(draft, "vol_90d", "desc"));
  reader.take(/\bleast volatile\b/, () => setSort(draft, "vol_90d", "asc"));
  reader.take(/\bvolatile\b/, () => setRange(draft, "vol_90d", { min: 50 }));
  reader.take(/\bmost shorted\b|\bheavily shorted\b|\bshort squeeze\b/, () => {
    setRange(draft, "short_float", { min: 15 });
    setSort(draft, "short_float", "desc");
  });
  reader.take(/\b(?:high[- ]quality|quality (?:companies|stocks|names|businesses))\b/, () => setRange(draft, "s_quality", { min: 70 }));
  reader.take(/\b(?:widely|well) held\b|\bheld by (?:funds|institutions)\b/, () => setRange(draft, "inst_own", { min: 70 }));
  reader.take(
    new RegExp(`\\b(?:dividend payers?|pays? (?:a )?dividends?|paying (?:a )?dividends?|dividend[- ]paying)(?: (?:of |yielding )?(?:(${MORE})|(${LESS})) ${NUMU})?`),
    (match) => {
      const value = match[3] ? Number(match[3].replace("$", "")) : null;
      setRange(draft, "div_yield", value === null ? { min: 0 } : match[2] && !match[1] ? { min: 0, max: value } : { min: value });
    },
  );
  reader.take(/\bmost expensive\b/, () => setSort(draft, "pe", "desc"));
  reader.take(/\b(?:cheap(?:est|er|ly valued)?|undervalued|inexpensive|bargains?|value (?:stocks|names|plays|picks))\b/, () => {
    draft.cheap = true;
  });
  reader.take(/\b(?:expensive|pricey|overvalued|richly valued)\b/, () => {
    draft.expensive = true;
  });
}

/** The generic shapes, for every field: "P/E under 20", "20%+ sales growth", "highest dividend yield", "low debt". */
function readFields(reader: Reader, draft: Draft): void {
  for (const [id, pattern] of TERMS) {
    const t = `(?:${pattern.source})`;
    const field = FIELD_BY_ID.get(id);
    if (!field) continue;
    const numbered = (raw: string, unit: string | undefined) => toFieldValue(id, raw, unit);
    // between
    reader.take(new RegExp(`\\b${t} (?:of |is |at |from |between )?${NUMU}(?: to | and |\\s?-\\s?)${NUMU}`), (match) => {
      const low = numbered(match[1]!, match[2] ?? match[4]);
      const high = numbered(match[3]!, match[4] ?? match[2]);
      if (low === null || high === null) return false;
      setRange(draft, id, { min: Math.min(low, high), max: Math.max(low, high) });
    });
    // "P/E under 20", "sales growth of at least 10%"
    reader.take(new RegExp(`\\b${t} (?:of |is |at |that is |that's |are |was )?(?:(${MORE})|(${LESS})) ${NUMU}`), (match) => {
      const value = numbered(match[3]!, match[4]);
      if (value === null) return false;
      setRange(draft, id, match[1] ? { min: value } : { max: value });
    });
    // "over 20% sales growth", "under 15 P/E"
    reader.take(new RegExp(`\\b(?:(${MORE})|(${LESS})) ${NUMU} (?:in |of |on )?${t}\\b`), (match) => {
      const value = numbered(match[3]!, match[4]);
      if (value === null) return false;
      setRange(draft, id, match[1] ? { min: value } : { max: value });
    });
    // "P/E of 20 or less", "yield 3%+"
    reader.take(new RegExp(`\\b${t} (?:of |at )?${NUMU} ?(${PLUS}|${MINUS})`), (match) => {
      const value = numbered(match[1]!, match[2]);
      if (value === null) return false;
      setRange(draft, id, /less|lower|below|under/.test(match[3]!) ? { max: value } : { min: value });
    });
    // "20%+ sales growth", "3% yield"
    reader.take(new RegExp(`(?:^|\\s)${NUMU} ?(${PLUS}|${MINUS})? ${t}\\b`), (match) => {
      const value = numbered(match[1]!, match[2]);
      if (value === null) return false;
      setRange(draft, id, match[3] && /less|lower|below|under/.test(match[3]) ? { max: value } : { min: value });
    });
    // "lowest P/E", "the highest dividend yield", "P/E, lowest first", "sorted by P/E"
    reader.take(new RegExp(`\\b${SUP} ${t}\\b`), (match) => setSort(draft, id, supDir(match[1]!, id)));
    reader.take(new RegExp(`\\b${t},? (?:(${UP_SUP}|${DOWN_SUP}) first|(high to low|low to high|descending|ascending))\\b`), (match) => {
      const word = match[1] ?? "";
      const order = match[2] ?? "";
      setSort(draft, id, order ? (/^high|desc/.test(order) ? "desc" : "asc") : supDir(word, id));
    });
    reader.take(new RegExp(`\\b(?:sort(?:ed)?|rank(?:ed)?|order(?:ed)?) by ${t}\\b`), () => setSort(draft, id, field.better === "low" ? "asc" : "desc"));
    // "low debt", "high dividend yield", "strong margins"
    reader.take(new RegExp(`\\b(${HIGH}|${LOW}) ${t}\\b`), (match) => {
      const high = new RegExp(`^(?:${HIGH})$`).test(match[1]!);
      const doubleDigit = /double[- ]digit/.test(match[1]!);
      const preset = ADJECTIVE_RANGES[id]?.[high ? "high" : "low"];
      if (doubleDigit) setRange(draft, id, { min: 10 });
      else if (preset) setRange(draft, id, preset);
      setSort(draft, id, high ? "desc" : "asc");
    });
    // "dividend stocks", "momentum names": ranked by the field, its good end first.
    reader.take(new RegExp(`\\b${t} (?=(?:stocks|names|companies|plays|payers|picks)\\b)`), () => setSort(draft, id, field.better === "low" ? "asc" : "desc"));
    // A bare mention: show the column.
    reader.take(new RegExp(`\\b${t}\\b`), () => mention(draft, id));
  }
}

/** Money with no field: "$50B" is a company size, "$20" a share price. */
function readLooseNumbers(reader: Reader, draft: Draft): void {
  reader.take(new RegExp(`\\b(?:(${MORE})|(${LESS})) (\\d+(?:\\.\\d+)?) (?:dollars|bucks)(?: a share)?\\b`), (match) => {
    setRange(draft, "price", match[1] ? { min: Number(match[3]) } : { max: Number(match[3]) });
  });
  reader.take(new RegExp(`\\b(?:(${MORE})|(${LESS})) (\\$?\\d+(?:\\.\\d+)?)\\s?(trillion|tn|t|billion|bn|b|million|mn|mm|m)\\b`), (match) => {
    const value = toFieldValue("market_cap", match[3]!, match[4]);
    if (value === null) return false;
    setRange(draft, "market_cap", match[1] ? { min: value } : { max: value });
  });
  reader.take(new RegExp(`(?:^|\\s)(?:(${MORE})|(${LESS})) \\$(\\d+(?:\\.\\d+)?)(?=\\s|$)`), (match) => {
    const value = Number(match[3]);
    setRange(draft, "price", match[1] ? { min: value } : { max: value });
  });
}

function settle(draft: Draft): void {
  const valuation = ["pe", "fwd_pe", "peg", "ps", "p_fcf", "ev_ebitda", "pe_hist_pctile"];
  const hasValuation = valuation.some((id) => draft.ranges[id] || draft.sort?.id === id);
  if (draft.cheap && !hasValuation) {
    setRange(draft, "pe_hist_pctile", { max: 25 });
    setSort(draft, "pe_hist_pctile", "asc");
  }
  if (draft.expensive && !hasValuation) {
    setRange(draft, "pe_hist_pctile", { min: 75 });
    setSort(draft, "pe_hist_pctile", "desc");
  }
  // A sort on a 0 to 100 figure keeps only stocks that have it, so the list is the ranking and not 500 dashes under it.
  if (draft.sort && FULL_RANGE_FIELDS.has(draft.sort.id) && !draft.ranges[draft.sort.id]) {
    const bounds = FIELD_BOUNDS[draft.sort.id]!;
    draft.ranges[draft.sort.id] = { min: bounds.min, max: bounds.max };
  }
}

function leftoverPhrases(rest: string): string[] {
  const out: string[] = [];
  for (const segment of rest.split(GAP)) {
    const words = segment
      .replace(/[^a-z0-9%$'/.+\- ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    while (words.length && STOP.has(words[0]!)) words.shift();
    while (words.length && STOP.has(words[words.length - 1]!)) words.pop();
    if (words.some((word) => !STOP.has(word) && /[a-z0-9]/.test(word))) out.push(words.join(" "));
  }
  return out;
}

/** Read a sentence with the rules alone. */
export function parsePlainScreen(text: string): PlainScreen {
  const normalized = normalizePlain(text);
  const draft: Draft = { q: "", sectors: [], caps: [], calls: [], zones: [], ranges: {}, sort: null, fields: [], cheap: false, expensive: false, outside: [] };
  if (!normalized) return { filters: { ...EMPTY_FILTERS }, sort: null, fields: [], leftover: [] };
  const reader = new Reader(normalized);
  // "stocks we hold" is about the person's own portfolio, which the screen cannot see. Kept whole, so "hold" is not read as our call.
  reader.take(/\b(?:(?:stocks|ones|names) )?(?:that |which )?(?:we|i) (?:hold|own|have|bought)\b|\bmy (?:stocks|holdings|portfolio|positions|watchlist)\b/, (match) => {
    draft.outside.push(match[0].trim());
  });
  readHistory(reader, draft);
  readCallsAndZones(reader, draft);
  readAnalystsAndEarnings(reader, draft);
  readPriceAction(reader, draft);
  readQualities(reader, draft);
  readSize(reader, draft);
  readFields(reader, draft);
  readPlaces(reader, draft);
  readLooseNumbers(reader, draft);
  settle(draft);
  return cleanPlainScreen({
    filters: { q: draft.q, sectors: draft.sectors, caps: draft.caps, calls: draft.calls, zones: draft.zones, ranges: draft.ranges },
    sort: draft.sort,
    fields: draft.fields,
    leftover: [...draft.outside, ...leftoverPhrases(reader.rest)],
  });
}

/* ── validation ─────────────────────────────────────────────────────────── */

function clampRange(id: string, raw: unknown): Range | null {
  if (!raw || typeof raw !== "object") return null;
  const bounds = FIELD_BOUNDS[id] ?? { min: -ANY_BOUND, max: ANY_BOUND };
  const read = (value: unknown) => (isFiniteNumber(value) ? Math.min(bounds.max, Math.max(bounds.min, value)) : undefined);
  let min = read((raw as Range).min);
  let max = read((raw as Range).max);
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const range: Range = {};
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  return range;
}

function stringList(raw: unknown, max: number): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").slice(0, max) : [];
}

/**
 * Any screen-shaped value (the rules' draft, a model's answer, a cached copy) as a screen the
 * screener can run. Unknown fields, sectors, sizes and calls are dropped, never guessed;
 * ranges are clamped to each field's ends; a sort on something we cannot sort is dropped.
 */
export function cleanPlainScreen(raw: unknown, options: { available?: ReadonlySet<string> } = {}): PlainScreen {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const filtersIn = (input.filters && typeof input.filters === "object" ? input.filters : {}) as Record<string, unknown>;
  const usable = (id: string) => FIELD_BY_ID.has(id) && (!options.available || options.available.has(id));

  const ranges: Record<string, Range> = {};
  const rangesIn = filtersIn.ranges && typeof filtersIn.ranges === "object" && !Array.isArray(filtersIn.ranges) ? (filtersIn.ranges as Record<string, unknown>) : {};
  for (const [id, value] of Object.entries(rangesIn)) {
    if (!usable(id)) continue;
    const range = clampRange(id, value);
    if (range) ranges[id] = range;
  }
  const capIds = new Set<string>(CAP_TIERS.map((tier) => tier.id));
  const zoneIds = new Set<string>(ZONES.map((zone) => zone.id));
  const unique = <T,>(items: T[]) => [...new Set(items)];
  const q = typeof filtersIn.q === "string" ? filtersIn.q.replace(/[^\p{L}\p{N} .&'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const filters: ScreenerFilters = {
    q,
    sectors: unique(stringList(filtersIn.sectors, 12).map(canonicalSectorSlug).filter((slug) => SECTOR_SLUGS.has(slug))),
    caps: unique(stringList(filtersIn.caps, 5).map((id) => id.toLowerCase()).filter((id) => capIds.has(id))) as CapTier[],
    calls: unique(
      stringList(filtersIn.calls, 3)
        .map((word) => CALL_WORDS.find((known) => known.toLowerCase() === word.toLowerCase()))
        .filter((word): word is CallWord => Boolean(word)),
    ),
    zones: unique(stringList(filtersIn.zones, 3).map((id) => id.toLowerCase()).filter((id) => zoneIds.has(id))) as Zone[],
    ranges,
  };

  let sort: ScreenerSort | null = null;
  const sortIn = input.sort as { id?: unknown; dir?: unknown } | null | undefined;
  if (sortIn && typeof sortIn.id === "string" && isSortable(sortIn.id) && (!FIELD_BY_ID.has(sortIn.id) || usable(sortIn.id))) {
    sort = { id: sortIn.id, dir: sortIn.dir === "asc" ? "asc" : "desc" };
  }
  const known = new Set(ALL_COLUMN_IDS);
  const fields = unique(stringList(input.fields, 20).filter((id) => known.has(id) && (!FIELD_BY_ID.has(id) || usable(id))));
  const leftover = unique(stringList(input.leftover, 8).map((phrase) => phrase.trim().slice(0, 60)).filter(Boolean));
  return { filters, sort, fields, leftover };
}

/** True when the screen asks for anything at all. */
export function plainHasScreen(plain: PlainScreen): boolean {
  const f = plain.filters;
  return Boolean(plain.sort || f.q || f.sectors.length || f.caps.length || f.calls.length || f.zones.length || Object.keys(f.ranges).length);
}

/**
 * Laying the model's reading of the leftover words over the rules' reading. The rules win
 * wherever both said something: they are tested, the model is a guess.
 */
export function mergePlainScreens(rules: PlainScreen, model: PlainScreen): PlainScreen {
  const ranges = { ...model.filters.ranges, ...rules.filters.ranges };
  const merge = <T,>(a: T[], b: T[]) => [...new Set([...a, ...b])];
  return {
    filters: {
      q: rules.filters.q || model.filters.q,
      sectors: merge(rules.filters.sectors, model.filters.sectors),
      caps: merge(rules.filters.caps, model.filters.caps),
      calls: merge(rules.filters.calls, model.filters.calls),
      zones: merge(rules.filters.zones, model.filters.zones),
      ranges,
    },
    sort: rules.sort ?? model.sort,
    fields: merge(rules.fields, model.fields),
    // A model that placed nothing has not read the words either: they stay as the rules left them, never silently gone.
    leftover: plainHasScreen(model) ? model.leftover : rules.leftover,
  };
}

/* ── plan gating ────────────────────────────────────────────────────────── */

/** What a plan without call filters keeps, and what it had to leave out, so the UI can say so. */
export function withoutCallParts(plain: PlainScreen): { plain: PlainScreen; dropped: { calls: CallWord[]; zones: Zone[]; fields: string[] } } {
  const ranges: Record<string, Range> = {};
  const droppedFields: string[] = [];
  for (const [id, range] of Object.entries(plain.filters.ranges)) {
    if (CALL_COLUMN_IDS.has(id)) droppedFields.push(id);
    else ranges[id] = range;
  }
  const sort = plain.sort && CALL_COLUMN_IDS.has(plain.sort.id) ? null : plain.sort;
  return {
    plain: {
      ...plain,
      filters: { ...plain.filters, calls: [], zones: [], ranges },
      sort,
      fields: plain.fields.filter((id) => id === "call" || !CALL_COLUMN_IDS.has(id)),
    },
    dropped: { calls: plain.filters.calls, zones: plain.filters.zones, fields: droppedFields },
  };
}

/* ── the view ───────────────────────────────────────────────────────────── */

/**
 * Columns for a sentence's screen: the line, price and day, then what the sentence named, then the usual
 * ones, with our call kept last. Eight fit a laptop's table; more only when the sentence named more.
 */
export function plainColumns(plain: PlainScreen): string[] {
  const front = ["spark", "price", "day_pct"];
  const named: string[] = [];
  const ids = [...(plain.sort ? [plain.sort.id] : []), ...plain.fields, ...Object.keys(plain.filters.ranges)];
  for (const id of ids) {
    if (!ALL_COLUMN_IDS.includes(id) || front.includes(id) || id === "call") continue;
    for (const companion of COMPANION_COLUMNS[id] ?? []) if (!named.includes(companion)) named.push(companion);
    if (!named.includes(id)) named.push(id);
  }
  const rest = DEFAULT_COLUMNS.filter((id) => !front.includes(id) && !named.includes(id) && id !== "call");
  const limit = Math.min(MAX_COLUMNS, Math.max(8, front.length + named.length + 1));
  return [...[...front, ...named, ...rest].slice(0, limit - 1), "call"];
}

/** The whole screener view a sentence asks for. A sentence starts a new screen; it does not add to the one on the page. */
export function plainView(plain: PlainScreen, base: Pick<ScreenerView, "period">): ScreenerView {
  return {
    tab: "screen",
    period: base.period,
    preset: null,
    filters: plain.filters,
    sort: plain.sort ?? DEFAULT_SORT,
    columns: plainColumns(plain),
  };
}

/** A screener link with the sentence added, so it opens with the words in the box. */
export function withSaid(href: string, sentence: string | null | undefined): string {
  const said = (sentence ?? "").replace(/\s+/g, " ").trim().slice(0, PLAIN_MAX_CHARS);
  if (!said) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${SAY_PARAM}=${encodeURIComponent(said)}`;
}

/** The link for a sentence's screen: the screen's own link plus the sentence. */
export function plainHref(view: ScreenerView, sentence: string): string {
  return withSaid(viewHref(view), sentence);
}

/** The sentence from a query string, cleaned the same way it went in. */
export function readSaid(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const said = value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PLAIN_MAX_CHARS);
  return said || null;
}

/** Company suffixes that make a name look longer than it is ("Bank of America Corp"). */
const CORPORATE = /\b(?:inc|incorporated|corp|corporation|co|company|ltd|limited|plc|group|holdings?|sa|nv|ag|se|class [ab])\b\.?/g;
/** Words a sentence about stocks has and a company name does not. */
const SENTENCE_WORDS = /\b(?:stocks?|shares|names|companies|with|that|which|who|whose|are|is|have|has|would|could|should|like|want|show|find|me|my|i|we|our|you|your|than|very|good|best|worst)\b/;

/**
 * Whether what is in the box reads as a screen rather than a name. A name is
 * searched as you type; a screen waits for Enter. Pass the box's reading when
 * it is already at hand, so a keystroke reads the box once.
 */
export function looksLikeScreen(text: string, read?: PlainScreen): boolean {
  const normalized = normalizePlain(text);
  if (!normalized) return false;
  const words = normalized.replace(CORPORATE, " ").trim().split(/\s+/).filter(Boolean).length;
  const plain = read ?? parsePlainScreen(normalized);
  const f = plain.filters;
  const shaped = Boolean(plain.sort || f.caps.length || f.calls.length || f.zones.length || Object.keys(f.ranges).length);
  const place = f.sectors.length > 0 || (f.q !== "" && f.q !== normalized);
  if (shaped) return true;
  if (place && words >= 2 && plain.leftover.length === 0) return true;
  if (f.q && f.q !== normalized && words === 1) return true;
  // Four words or more read as a sentence only when they talk like one; "Advanced Micro Devices Inc" is a name.
  return words >= 4 && SENTENCE_WORDS.test(normalized);
}

/* ── words for the chips ────────────────────────────────────────────────── */

/** Chip names where the column's short header would be a puzzle on its own ("Buys 3M", "Vol 90D"). */
const CHIP_NAMES: Record<string, string> = {
  pe_hist_pctile: "P/E vs its history",
  buys_chg_3m: "New buy ratings",
  from_lo_pct: "Above 1-year low",
  from_hi_pct: "Below 1-year high",
  vol_90d: "Price swings",
  drawdown_1y: "Worst fall, 1 yr",
  vs_50d: "vs 50-day average",
  vs_200d: "vs 200-day average",
  short_float: "Short interest",
  inst_own: "Held by funds",
  rev_cagr_3y: "Sales growth, 3 yr",
  eps_next_y: "EPS growth next yr",
  gross_margin: "Gross margin",
  op_margin: "Operating margin",
  net_margin: "Net margin",
  fcf_margin: "Cash flow margin",
  debt_equity: "Debt to equity",
  current_ratio: "Current ratio",
  div_growth_years: "Years of raises",
  buy_pct: "Rated buy",
  upside: "To analyst target",
  ret_1w: "1 week",
  ret_6m: "6 months",
  ret_1y: "1 year",
  ret_3y: "3 years",
  ret_5y: "5 years",
};

/** What a chip calls a field. */
export function chipName(id: string): string {
  return CHIP_NAMES[id] ?? FIELD_BY_ID.get(id)?.short ?? id.replace(/_/g, " ");
}

/** The chip for "only stocks that have this figure". */
export function hasName(id: string): string {
  const names: Record<string, string> = {
    pe_hist_pctile: "Has a P/E history",
    buy_pct: "Has analyst ratings",
    inst_own: "Has fund ownership",
    rsi: "Has an RSI",
  };
  return names[id] ?? (id === "score" || id.startsWith("s_") ? "Has our score" : `Has ${chipName(id)}`);
}

/** Whether a range is the field's whole span, which only says "has this figure". */
export function isWholeRange(id: string, range: Range): boolean {
  const bounds = FIELD_BOUNDS[id];
  return Boolean(bounds) && range.min === bounds!.min && range.max === bounds!.max;
}

/** "P/E vs its history, lowest first" */
export function describeSort(sort: ScreenerSort): string {
  const field = FIELD_BY_ID.get(sort.id);
  const name = field ? chipName(sort.id) : sort.id === "call" ? "Our call" : sort.id === "symbol" ? "Ticker" : sort.id.replace(/_/g, " ");
  if (field?.unit === "money" || sort.id === "market_cap") return `${name}, ${sort.dir === "desc" ? "biggest" : "smallest"} first`;
  if (field?.unit === "days") return `${name}, ${sort.dir === "asc" ? "soonest" : "latest"} first`;
  return `${name}, ${sort.dir === "desc" ? "highest" : "lowest"} first`;
}

/** Every numeric field id the model may use, for its schema. */
export const PLAIN_FIELD_IDS = NUMERIC_FIELDS.map((field) => field.id);
