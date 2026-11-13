/**
 * Source headlines within the owner's word budget (docs/owner-design-rules.md rule 8: a headline is at most 10 words),
 * deterministically and without writing a word of our own:
 *
 * 1. `cleanHeadline` takes off what says nothing about the story: a desk's roundup prefix ("Wall Street Wrap:",
 *    "Stock Market Today, Nov. 12:", "Market Chatter:"), a site's name on the end ("- Investing.com", "| Benzinga") and
 *    a ticker in brackets after a name ("Broadcom (AVGO)", "(NASDAQ:NVDA)").
 * 2. `cutHeadline` keeps the first clause when the whole is still too long: at a sentence end, a semicolon, a dash, a
 *    colon or a comma, and last at a link word after a figure ("AMD jumps 5.9% on …") or before a reason ("… falling
 *    today despite …"). Only a cut that leaves a whole clause of at least three words counts: never one that ends on
 *    a small word ("…the stock and"), never a comma after an opening clause ("Despite strong sales, …").
 * 3. Past that, a stored short title (when a feed has one) stands in; with none the headline stays whole, and the
 *    miss is logged once on the server so the rule can learn the shape.
 *
 * Pure apart from that one log line; safe on the client.
 */

import { headlineCase, isTitleCase } from "@/lib/plain-copy";

/** A headline is at most this many words (rule 8). */
export const HEADLINE_MAX_WORDS = 10;
/** A cut must leave at least this many words. */
const MIN_WORDS = 3;

export function headlineWordCount(text: string): number {
  // A standalone dash or bar is punctuation, not a word.
  return text.split(/\s+/).filter((word) => word && !/^[-–—|·:]+$/.test(word)).length;
}

/**
 * A desk's roundup label at the front: says what kind of article it is, not what happened. The label needs its colon
 * (or dash), so "Stock market rallies" or "Wall Street steady" are left alone. A date may sit inside it
 * ("Stock market today, Nov. 12:").
 */
const ROUNDUP_PREFIX = new RegExp(
  "^(?:" +
    [
      "wall street (?:wrap|breakfast|lunch|week ahead)",
      "stock market (?:news )?today",
      "stocks? today",
      "markets? (?:wrap|today|chatter|minute|update|live)",
      "market wrap(?:-?up)?",
      "morning (?:bid|brief|briefing|movers)",
      "evening (?:wrap|brief)",
      "midday (?:movers|update)",
      "pre-?market movers",
      "stocks? (?:making the biggest moves|to watch)(?: (?:premarket|midday|after hours))?",
      "before the bell",
      "after the bell",
      "live updates?",
      "breaking(?: news)?",
      "tech (?:wrap|today)",
      "earnings (?:wrap|preview|recap)",
      "top stock news",
      "(?:the )?daily (?:wrap|brief)",
    ].join("|") +
    ")(?:,?\\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s*)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?)?\\s*[:\\-–—|]\\s+",
  "i",
);

/** A site's name on the end: known publishers, or anything that is a web address. */
const SITE_SUFFIX =
  /\s+[-–—|]\s+(?:the\s+)?(?:seeking alpha|yahoo finance|yahoo|benzinga|marketwatch|investing\.com|reuters|bloomberg|cnbc|barron['’]s|motley fool|zacks(?: investment research)?|tipranks|forbes|business insider|insider monkey|nasdaq|thestreet|investopedia|morningstar|fortune|gurufocus|simply wall st|economic times|livemint|mint|moneycontrol|the wall street journal|wsj|financial times|ft|associated press|ap news|axios|cnn(?: business)?|fox business|the information|techcrunch|the verge|electrek|teslarati|marketbeat|stocktitan|globenewswire|business wire|pr newswire|accesswire|[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|co|io|news|in|co\.uk))\s*$/i;

/** A ticker in brackets, with or without its exchange: "(AVGO)", "(NASDAQ:NVDA)", "(NYSE: BRK.B)". */
const TICKER_PAREN = /\s*\((?:(?:NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|AMEX|OTC|OTCQX|OTCMKTS|TSX|TSXV|LSE|BATS|CBOE)\s*:\s*)?[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?\)(?=[\s,.:;!?’'"”]|$)/g;

/** Words a clause never ends on: a cut there leaves a phrase hanging ("…the stock and"). */
const HANGING = /^(?:a|an|the|and|or|but|nor|of|to|in|on|at|by|for|from|with|as|than|that|which|who|is|are|was|were|be|its|their|his|her|our|your|my|this|these|those|into|over|under|about|after|before|amid|despite|vs\.?|versus|while|if|when|so|not|no|just|more|most|less|new)$/i;

/** A clause that opens on these is a lead-in: a comma after it does not end the headline's own clause. */
const LEAD_IN = /^(?:after|as|while|although|though|despite|even|if|when|whenever|since|because|with|without|amid|before|once|until|unless|whether|in|on|at|for|from|by|following|ahead)\b/i;

function capitalFirst(text: string): string {
  // A brand that starts lowercase ("eBay", "iPhone") keeps its case.
  return /^[a-z][A-Z]/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The headline without the parts that say nothing about the story: a roundup prefix, a site's name on the end, and
 * tickers in brackets. Casing is left as it came (the casing pass runs after this).
 */
export function cleanHeadline(text: string | null | undefined): string {
  let value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return value;
  for (let guard = 0; guard < 3; guard += 1) {
    const next = value.replace(ROUNDUP_PREFIX, "");
    if (next === value || !next.trim()) break;
    value = capitalFirst(next.trim());
  }
  for (let guard = 0; guard < 2; guard += 1) {
    const next = value.replace(SITE_SUFFIX, "");
    if (next === value || !next.trim()) break;
    value = next.trim();
  }
  const bare = value.replace(TICKER_PAREN, "").replace(/\s+([,.:;!?])/g, "$1").replace(/\s+/g, " ").trim();
  return bare || value;
}

type Cut = { at: RegExp; keep: (head: string, match: string) => string; guard?: (head: string, tail: string) => boolean };

/**
 * A tail that says who said it, anywhere in it: cutting it would present a claim as fact ("Nvidia is overvalued,
 * analyst says", "…; Asia off, Europe up, according to Reuters").
 */
const ATTRIBUTION = /\b(?:says?|said|according to|told|tells|warns?|warned|claims?|claimed|argues?|argued|writes|wrote|per)\b/i;
/**
 * The word before a full stop is an abbreviation, not a sentence end: a single letter, a word with a dot inside
 * ("a.m.", "U.S.", "e.g."), a title or a month ("Inc.", "Dr.", "Nov.").
 */
const ABBREVIATION = /(?:^|\s)(?:[A-Za-z]|\S*[A-Za-z]\.[A-Za-z]+|inc|corp|co|ltd|plc|jr|sr|dr|mr|mrs|ms|st|vs|no|approx|est|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
/** A comma that carries on a list ("Nvidia, AMD and Intel…", "chips, memory and servers"), not a clause. */
const LIST_TAIL = /^(?:(?:and|or|but|nor)\b|(?:[\w’'.&$%-]+\s+)?[\w’'.&$%-]+(?:,|\s+(?:and|or|&)\s))/i;
/** "As much as", "as well as", "such as": "as" that does not open a reason. */
const NOT_A_REASON = /^(?:much|many|well|long|soon|high|low|far|good|part|large|big|little|few|expected|usual|planned|likely|early|late|recently|hours|the bell|the close|the open|market close)\b/i;
/** "As" that names a role, not a reason: "…names Brian Niccol as its new chief executive", "…step down as Apple CEO". */
const ROLE_HEAD = /\b(?:names?|named|appoints?|appointed|hires?|hired|taps?|tapped|elects?|elected|down|serves?|served|joins?|joined|returns?|returned|stays?|stayed|remains?|remained|rated|seen|known|such|step|steps|steps in|takes over)$/i;
const ROLE_TAIL = /^(?:(?:[Ii]ts|[Tt]he|[Aa]n?|[Nn]ew|[Nn]ext|[Ii]nterim|[Aa]cting|[Ff]ormer|[Pp]ermanent)\s+)*(?:[A-Z][\w’'.&-]*\s+){0,2}(?:CEO|CFO|COO|CTO|[Cc]hief|[Cc]hair\w*|[Pp]resident|[Hh]ead|[Dd]irector|[Ll]eader|[Bb]oss|[Pp]artner|[Aa]dvis[eo]r)\b/;
const attributed = (_head: string, tail: string) => ATTRIBUTION.test(tail);

/**
 * Where a clause can end, strongest first; each keeps what its boundary leaves (a question keeps its mark). Every cut
 * is refused when in doubt, and the headline is then shown whole (owner, Nov 13: a long whole headline beats a cut
 * one). There is no cut at a colon: what comes before one is usually a kicker or a speaker ("Musk:", "Earnings
 * preview:", "What SOXX bought:"), never the story on its own.
 */
const CUTS: Cut[] = [
  // A sentence end inside the headline: "BioNTech may be the next Moderna. Even if…", "…on Qualcomm? Wall Street…".
  {
    at: /[.!?]["”’]?(?=\s+["“‘]?[A-Z0-9$])/g,
    keep: (head, match) => head + (match.startsWith(".") ? match.slice(1) : match),
    guard: (head, tail) => !ABBREVIATION.test(head) && !attributed(head, tail),
  },
  { at: /\s*;\s+/g, keep: (head) => head, guard: (head, tail) => !attributed(head, tail) },
  // A dash, only when it is the only one: a pair of dashes sets off an aside, and a cut at the first leaves its start.
  { at: /\s+[—–-]{1,2}\s+|\s*—\s*/g, keep: (head) => head, guard: (head, tail) => !attributed(head, tail) && !/\s[—–-]{1,2}\s|—/.test(tail) && !/\s[—–-]{1,2}\s|—/.test(head) },
  // A comma that ends a clause: never inside a list, after a lead-in ("Despite strong sales, …"), or before a speaker.
  {
    at: /,\s+/g,
    keep: (head) => head,
    guard: (head, tail) => !LEAD_IN.test(head) && !attributed(head, tail) && !head.includes(",") && !LIST_TAIL.test(tail) && !/^[A-Z]/.test(tail),
  },
  // A link word after a figure: "AMD jumps 5.9% on Bank of America…" → "AMD jumps 5.9%".
  {
    at: /(?<=\d%|\d bps|\$\d[\d,.]*[kmbt]?)\s+(?:on|after|as|amid|following|despite|while)\s+/gi,
    keep: (head) => head,
    guard: (head, tail) => !attributed(head, tail) && !NOT_A_REASON.test(tail),
  },
  // A reason after the news: "…takes another hit as fresh probe weighs…", "…falling today despite higher revenue?".
  {
    at: /\s+(?:as|amid|despite|following|after|while)\s+/g,
    keep: (head) => head,
    // Not the second "as" of "as much as" (the head would end on "as much"), and not "as" before a role.
    guard: (head, tail) =>
      headlineWordCount(head) >= 4 &&
      !LEAD_IN.test(head) &&
      !attributed(head, tail) &&
      !NOT_A_REASON.test(tail) &&
      !/\b(?:as|so)\s+\S+$/i.test(head) &&
      !ROLE_HEAD.test(head) &&
      !ROLE_TAIL.test(tail),
  },
];

/** Whether a clause can stand as a headline: enough words, and not ending on a small word or inside open quotes. */
function standsAlone(head: string): boolean {
  const words = head.split(/\s+/).filter(Boolean);
  if (headlineWordCount(head) < MIN_WORDS) return false;
  const last = (words[words.length - 1] ?? "").replace(/[.!?,;:"”’)]+$/, "");
  // Never on a dash: that is the open end of an aside ("…lockup expiry looms —").
  if (!last || HANGING.test(last) || /[—–-]$/.test(last)) return false;
  const opens = (head.match(/[“"(]/g) ?? []).length;
  const closes = (head.match(/[”")]/g) ?? []).length;
  // Straight quotes open and close with the same mark: an odd count is an open quote.
  const straight = (head.match(/"/g) ?? []).length;
  return straight % 2 === 0 && opens - straight <= closes - straight;
}

/**
 * The first whole clause that fits `max` words, at the strongest boundary that gives one (the longest such clause at
 * that strength), or null when no clean cut exists.
 */
export function cutHeadline(text: string, max = HEADLINE_MAX_WORDS): string | null {
  const value = text.trim();
  if (headlineWordCount(value) <= max) return value;
  for (const cut of CUTS) {
    let best: string | null = null;
    for (const match of value.matchAll(cut.at)) {
      const head = value.slice(0, match.index).trim();
      const tail = value.slice((match.index ?? 0) + match[0].length).trim();
      if (!head || (cut.guard && !cut.guard(head, tail))) continue;
      const kept = cut.keep(head, match[0].trim()).trim();
      const words = headlineWordCount(kept);
      if (words > max || !standsAlone(kept)) continue;
      if (!best || words > headlineWordCount(best)) best = kept;
    }
    if (best) {
      // A question cut before its reason keeps its question mark: "Why is Cisco stock falling today?".
      const question = /\?\s*$/.test(value) && /^(?:why|what|how|is|are|can|could|should|will|does|do|did|has|have|who|where|when)\b/i.test(best) && !/[.!?]["”’]?$/.test(best);
      return question ? `${best.replace(/[,;:]$/, "")}?` : best.replace(/[,;:]$/, "");
    }
  }
  return null;
}

const missed = new Set<string>();

/** One log line per headline that could not be cut cleanly (server only, and never more than a few hundred). */
function logMiss(text: string): void {
  if (typeof window !== "undefined" || missed.has(text) || missed.size >= 500) return;
  missed.add(text);
  console.warn(`[headline] no clean cut under ${HEADLINE_MAX_WORDS} words; kept whole: ${JSON.stringify(text)}`);
}

/**
 * A headline at most `max` words: cut at a clause boundary (cutHeadline), else a stored short title that fits, else
 * the whole headline as it came (logged). Run it after the casing pass, on a headline already cleaned.
 */
export function fitHeadline(text: string, options: { max?: number; shortTitle?: string | null } = {}): string {
  const max = options.max ?? HEADLINE_MAX_WORDS;
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || headlineWordCount(value) <= max) return value;
  const cut = cutHeadline(value, max);
  if (cut) return cut;
  const short = cleanHeadline(options.shortTitle ?? "");
  if (short && headlineWordCount(short) <= max) return short;
  logMiss(value);
  return value;
}

/** Whether a headline fits the budget once cleaned and cut (for a picker that would rather choose another story). */
export function fitsHeadline(text: string, max = HEADLINE_MAX_WORDS): boolean {
  const clean = cleanHeadline(text);
  return headlineWordCount(clean) <= max || cutHeadline(clean, max) !== null;
}

/**
 * Product names that are also ordinary words, kept as the source wrote them when their company is in the headline
 * (judge 91: "outage disrupts outlook, teams"). Lowercase; only a capital the source itself had is put back.
 */
const PRODUCTS: ReadonlyArray<{ company: RegExp; words: readonly string[] }> = [
  { company: /\bmicrosoft\b|\bmsft\b/i, words: ["outlook", "teams", "office", "windows", "excel"] },
  { company: /\bapple\b|\baapl\b/i, words: ["music", "pay", "watch", "card", "vision"] },
  { company: /\bgoogle\b|\balphabet\b|\bgoogl?\b/i, words: ["search", "cloud", "maps", "play", "chrome"] },
  { company: /\bamazon\b|\bamzn\b/i, words: ["prime", "echo"] },
  { company: /\bmeta\b|\bfacebook\b/i, words: ["threads", "quest"] },
];

const capitalOf = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function keepProductNames(source: string, shown: string): string {
  let out = shown;
  // In a Title Case source every word has a capital, so a capital proves nothing ("Microsoft Raises Outlook"): there,
  // only two of the company's products listed together count ("…Disrupts Outlook, Teams").
  const titled = isTitleCase(source);
  for (const { company, words } of PRODUCTS) {
    if (!company.test(source)) continue;
    const alternatives = words.map(capitalOf).join("|");
    const listed = new RegExp(`\\b(?:${alternatives}),?\\s+(?:and\\s+|&\\s+)?(?:${alternatives})\\b`).test(source);
    if (titled && !listed) continue;
    for (const word of words) {
      // Occurrence by occurrence: only where the source itself had the capital ("cuts its outlook; Outlook outage").
      const inSource = [...source.matchAll(new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, "gi"))].map((match) => match[0]);
      if (!inSource.some((found) => found === capitalOf(word))) continue;
      let index = 0;
      out = out.replace(new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, "gi"), (found) => {
        const original = inSource[index++];
        return original === capitalOf(word) ? capitalOf(word) : found;
      });
    }
  }
  return out;
}

/**
 * A source headline as every page shows it: cleaned (cleanHeadline), in sentence case (plain-copy headlineCase, with
 * the row's company and the page's other names kept, and a company's product names as the source wrote them), then
 * within the word budget (fitHeadline).
 */
export function newsHeadline(text: string | null | undefined, options: { companyName?: string; names?: Iterable<string>; shortTitle?: string | null; max?: number } = {}): string {
  const clean = cleanHeadline(text);
  const cased = keepProductNames(clean, headlineCase(clean, options.companyName ?? "", options.names ?? []));
  const short = options.shortTitle ? cleanHeadline(options.shortTitle) : "";
  return fitHeadline(cased, { max: options.max, shortTitle: short ? keepProductNames(short, headlineCase(short, options.companyName ?? "", options.names ?? [])) : null });
}
