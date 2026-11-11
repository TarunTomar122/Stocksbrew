/**
 * A headline's tone from its own words, for stories the model labeller has not read.
 *
 * The wire's tone comes first from `backend/agentdata/news_tone.py` (one model label per headline). When that job
 * falls behind, most of today's stories have no label and no stock's news can be said to lean. This is the fallback:
 * a plain finance word list ("beats", "misses", "upgraded", "plunges", "raises guidance") read over the headline
 * alone. It is kept apart from the model's labels on purpose: every label it makes carries `by: "words"`, it never
 * overrides a model label, and it never guesses a theme.
 *
 * It only says something when the words are clear: a question ("Can X beat...?"), a forecast piece, a headline with
 * words pointing both ways, or one naming more than two companies (a roundup, whose words may be about any of them)
 * gets no tone at all, never "neutral". A headline naming two companies gives its tone to one of them only: the one
 * named before the words that set the tone ("Nebius gains 13% on CoreWeave results" is about Nebius), else neither.
 */

import { shortCompanyName } from "@/lib/plain-copy";
import type { NewsLabel, NewsLabels } from "@/lib/wire-read";
import type { WireItem } from "@/lib/wire-shared";

/**
 * A move verb followed by "into" or "onto" is a figure of speech ("Meta slides into the AI race", "Apple jumps into
 * payments"), not a price move, unless what follows is where prices go ("slides into the red", "into a correction").
 */
const NOT_INTO = "(?! (?:into|onto) (?!(?:the |a )?(?:red|green|bear|correction|record|losses|gains|negative|positive)\\b))";

/**
 * Good news for the stock it names. Whole words or phrases, matched on the lower-cased headline. Moves are verbs in
 * the forms headlines use ("surges", "jumped"), never the bare noun ("a rally", "a plunge"), and words that are also
 * names or products need their finance context ("beats estimates", not Apple's Beats; "upgraded to buy", not
 * "upgrades Copilot"; "advances 4%", not Advanced Micro Devices).
 */
const POSITIVE: RegExp[] = [
  /\bbeat-and-raise\b/,
  /\bbeats? (?:estimates|expectations|forecasts|views|consensus|the street|wall street|on )/,
  /\b(?:earnings|revenues?|sales|profits?|eps|q[1-4]|quarter(?:ly)?)(?: results)? beat\b/,
  /\btops? (?:estimates|expectations|forecasts|views)\b/,
  /\b(?:better|stronger)[- ]than[- ]expected\b/,
  /\b(?:raises|raised|lifts|lifted|boosts|boosted|hikes|hiked|ups) (?:its |full-year |annual |fy\d* |\d{4} )?(?:guidance|outlook|forecast|dividend|payout)\b/,
  /\bguidance (?:up|raised)\b/,
  /\bupgraded\b/,
  /\bupgrades? (?:to|from)\b/,
  /\bupgrades\b.*\bto (?:buy|outperform|overweight|strong buy|positive)\b/,
  /\b(?:rating|analyst) upgrade\b/,
  /\b(?:gets|got|wins|earns|receives) (?:a |an )?(?:[\w-]+ ){0,2}upgrade\b/,
  /\b(?:raises|raised|lifts|lifted|boosts|boosted) (?:its |the )?(?:price )?target\b/,
  /\bprice target (?:raised|lifted|boosted|hiked)\b/,
  new RegExp(`\\b(?:surges|surged|soars|soared|jumps|jumped|rallies|rallied|skyrockets|skyrocketed|spikes|spiked|pops|popped|rebounds|rebounded)\\b${NOT_INTO}`),
  /\brocket(?:s|ed) (?:\d|higher|up)/,
  /\b(?:climbs|climbed|rises|rose)\b(?! (?:questions?|concerns?|fears?|doubts?|risks?|to the (?:challenge|occasion)))/,
  /\b(?:gain(?:s|ed)?|advance(?:s|d)?) (?:\d|over |more than |nearly |almost )/,
  /\brecord (?:revenue|sales|profit|earnings|quarter|results|high|orders|deliveries)\b/,
  /\ball-time high\b/,
  /\b(?:wins?|won|secures?|secured|lands?|landed|awarded) (?:a |an |the |\$[\d.,]+\w* )?(?:[\w-]+ ){0,3}(?:contract|deal|order|approval|award)s?\b/,
  /\b(?:fda|regulatory) (?:approval|clearance|nod)\b/,
  /\b(?:approved|approves)\b/,
  /\b(?:buyback|share repurchase|stock repurchase)\b/,
  /\bblowout\b/,
  /\bstrong (?:demand|results|quarter|guidance|sales)\b/,
  /\bdemand (?:is |remains |stays )?strong\b/,
];

/** "Drops 3%", not "drops its lawsuit" or "drops prices"; and nothing at all when the headline is a legal win. */
const DROPS = /\b(?:drops|dropped)\b(?! (?:its |the |a |an )?(?:lawsuit|suit|case|charges|claims?|probe|bid|plan|prices?|price cuts?))/;

/** Bad news for the stock it names, with the same care for nouns and set phrases ("declines to comment"). */
const NEGATIVE: RegExp[] = [
  /\bmiss(?:es|ed)? (?:on |estimates|expectations|forecasts|views|consensus|the street|wall street)/,
  /\b(?:earnings|revenues?|sales|profits?|eps|q[1-4]|quarter(?:ly)?) miss\b/,
  /\bfalls? short\b/,
  /\b(?:worse|weaker)[- ]than[- ]expected\b/,
  /\b(?:cuts?|cutting|lowers?|lowered|slashes|slashed|trims?|trimmed|reduces|reduced|suspends?|suspended) (?:its |full-year |annual |fy\d* |\d{4} )?(?:guidance|outlook|forecast|dividend|payout)\b/,
  /\b(?:weak|soft|disappointing) (?:guidance|outlook|forecast|results|quarter|sales|demand)\b/,
  /\bdowngrades?\b/,
  /\bdowngraded\b/,
  /\b(?:cuts?|cut|lowers?|lowered|slashes|slashed|trims?|trimmed) (?:its |the )?(?:price )?target\b/,
  /\bprice target (?:cut|lowered|slashed|trimmed)\b/,
  new RegExp(
    `\\b(?:plunges|plunged|plummets|plummeted|tumbles|tumbled|sinks|sank|slumps|slumped|slides|slid|dives|dived|crashes|crashed|tanks|tanked|craters|cratered)\\b${NOT_INTO}`,
  ),
  new RegExp(`\\b(?:falls|fell|slips|slipped|retreats|retreated)\\b${NOT_INTO}`),
  DROPS,
  /\b(?:declines|declined)\b(?! to\b)/,
  /\bsheds (?:\$|\d|jobs|value)/,
  // A recall of things (cars, units, a drug lot), not a person recalling something ("Buffett recalls his first stock").
  /\b(?:recalls?|recalled|recalling) (?:nearly |about |around |over |more than |almost |some )?\d/,
  /\b(?:recalls?|recalled|recalling) (?:[\w'-]+ ){0,3}(?:vehicles?|cars?|trucks?|suvs?|evs?|cybertrucks?|units?|devices?|products?|models?|phones?|batter(?:y|ies)|airbags?|pills?|drugs?|doses|lots?|chargers?|toys?|laptops?|ovens?|tablets?|food|meat|eggs)\b/,
  /\b(?:safety|product|vehicle|massive|voluntary|nationwide|global|sweeping) recall\b/,
  /\brecall of\b/,
  /\b(?:layoffs?|lays off|job cuts|bankruptcy|chapter 11|delist(?:ed|ing)?|default(?:s|ed)?)\b/,
  /\b(?:warns|warning|profit warning|halts?|halted|blacklist(?:ed)?|data breach|hacked|outage)\b/,
  /\b(?:resigns?|resigned|ousted|steps? down|stepping down)\b/,
  /\bturns? cautious\b/,
  /\bshort (?:seller|report)\b/,
];

/** Legal trouble: bad news, unless the same headline says it went the company's way (`LEGAL_WIN`) or settled. */
const LEGAL: RegExp[] = [
  /\b(?:lawsuit|sued|sues|class action|probe|investigation|subpoena|indicted|charged|fraud|scandal)\b/,
  /\b(?:fined|penalty)\b/,
];

/** The legal trouble went the company's way: good news, and the lawsuit words in it are not. */
const LEGAL_WIN = new RegExp(
  [
    "\\b(?:wins?|won|winning) (?:a |an |the |its )?(?:dismissal|appeal|case|lawsuit|suit|ruling|verdict|trial)\\b",
    "\\bappeal win\\b",
    "\\bno wrongdoing\\b",
    "\\bcleared (?:of|by|in)\\b",
    "\\bdismissal of\\b",
    "\\bacquitted\\b",
    // "SEC drops lawsuit against Coinbase", "Judge tosses suit", "FTC closes probe".
    "\\b(?:drops|dropped|dismisses|dismissed|tosses|tossed|throws out|threw out|withdraws|withdrew|ends|ended|closes|closed) (?:[\\w'-]+ ){0,2}(?:lawsuit|suit|case|charges|probe|investigation)\\b",
    // "Lawsuit against Apple dismissed", "Probe into Tesla closed".
    "\\b(?:lawsuit|suit|case|charges|claims?|probe|investigation)\\b(?: [\\w'.-]+){0,4} (?:is |was |are |were |gets |got )?(?:dismissed|dropped|thrown out|tossed|closed)\\b",
  ].join("|"),
);

/**
 * A settlement ends the trouble at a price: neither way, so the lawsuit words in it say nothing either. Not a price
 * that "settles lower" at the close.
 */
const SETTLES = /\bsettlement\b|\b(?:settles?|settled|settling)\b(?! (?:lower|higher|up|down|flat|at|near|in|around)\b)/;

/**
 * Words where the stock is the object, not the subject: "Morgan Stanley upgrades Nvidia", "Baird cuts its target on
 * AMD". With two companies named, the one before these words is the analyst's firm, so they say nothing about it.
 */
const OBJECT_VERBS =
  /\b(?:upgrades|downgrades|initiates|reiterates)\b|\b(?:raises|raised|lifts|lifted|boosts|boosted|cuts?|lowers?|lowered|slashes|slashed|trims?|trimmed) (?:its |the )?(?:price )?target\b/;

/**
 * Pieces that guess, compare or solicit rather than report: their words are not news about the stock. Law-firm
 * notices ("investors have opportunity to lead ... securities fraud lawsuit") are adverts, not news.
 */
const NOT_NEWS =
  /\b(?:don't miss|not to miss|want to miss|prediction|predictions|could|might|would|must|should you|better buy|vs\.?|versus|or sell|stocks? to buy|time to buy|to watch|what to expect|preview|despite|even as|have opportunity|to inquire|to contact|deadline|law firm|rosen law|investors with (?:substantial )?losses)\b/;

/** Questions without the question mark: "Will earnings upgrades change the story". */
const ASKS = /^\s*(?:will|can|could|is|are|does|did|should|has|have|would)\b/;

/** At most this many companies named: a roundup's words may be about any one of them. */
export const MAX_TICKERS_FOR_WORDS = 2;

type WordTone = "positive" | "negative";

/** The headline with curly quotes and spacing evened out, padded so phrases at either end still match. */
function evened(title: string): string {
  return ` ${String(title ?? "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** The tone and where its first word sits in `text` (lower-cased, evened), or null when the words are not clear. */
function readWords(text: string): { tone: WordTone; at: number; objectVerb: boolean } | null {
  if (text.trim().length < 12) return null;
  // A question anywhere ("Missed Illumina's run? Here is...") is a guess or a hook, not a report.
  if (text.includes("?") || ASKS.test(text) || NOT_NEWS.test(text)) return null;
  const relief = LEGAL_WIN.test(text);
  const legalCounts = !relief && !SETTLES.test(text);
  const good = [...POSITIVE, ...(relief ? [LEGAL_WIN] : [])].map((pattern) => pattern.exec(text)?.index ?? -1).filter((at) => at >= 0);
  const bad = [...NEGATIVE.filter((pattern) => !relief || pattern !== DROPS), ...(legalCounts ? LEGAL : [])]
    .map((pattern) => pattern.exec(text)?.index ?? -1)
    .filter((at) => at >= 0);
  if (good.length && bad.length) return null;
  const found = good.length ? good : bad;
  if (!found.length) return null;
  return { tone: good.length ? "positive" : "negative", at: Math.min(...found), objectVerb: OBJECT_VERBS.test(text) };
}

/**
 * "positive" or "negative" when the headline's own words clearly say so, else null. Questions, forecasts and
 * headlines with words both ways say nothing.
 */
export function headlineWordTone(title: string): WordTone | null {
  return readWords(evened(title).toLowerCase())?.tone ?? null;
}

/** Other names a headline uses for a company. */
const ALIASES: Record<string, string[]> = {
  GOOGL: ["google", "alphabet"],
  GOOG: ["google", "alphabet"],
  META: ["meta", "facebook"],
  TSM: ["tsmc"],
  "BRK.B": ["berkshire"],
  "BRK.A": ["berkshire"],
};

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First words of company names that are ordinary words in a headline: "Applied", "General", "American". */
const GENERIC_FIRST = new Set(
  (
    "applied general american united first national international global advanced digital energy new southern western " +
    "eastern northern royal capital pacific atlantic central bank federal public universal standard great world " +
    "health medical life smart super micro data real home best"
  ).split(" "),
);

/**
 * Where the headline first names a stock, or -1: its ticker in capitals ("NVDA", "(NVDA)", "$NVDA"; a ticker of two
 * letters only in brackets or as a cashtag, so "AI chips" is not C3.ai), its short name ("Advanced Micro Devices"),
 * the first word of that name when it is a name rather than an ordinary word ("Nebius", not "Applied"), or a known
 * other name ("Google").
 */
function mentionAt(cased: string, lower: string, ticker: string, name: string | null | undefined): number {
  const spots: number[] = [];
  const find = (text: string, pattern: string) => {
    const at = new RegExp(pattern).exec(text)?.index;
    if (at !== undefined) spots.push(at);
  };
  const word = (text: string, value: string) => value && find(text, `(?<![\\w$])${escaped(value)}(?![\\w])`);
  if (ticker.length >= 3) find(cased, `(?<![\\w])\\$?${escaped(ticker)}(?![\\w])`);
  else if (ticker.length === 2) find(cased, `(?:\\(|\\$)${escaped(ticker)}(?![\\w])`);
  const short = shortCompanyName(name ?? "").toLowerCase();
  if (short) {
    word(lower, short);
    const first = short.split(" ")[0] ?? "";
    if (first.length >= 4 && first !== short && !GENERIC_FIRST.has(first)) word(lower, first);
  }
  for (const alias of ALIASES[ticker] ?? []) word(lower, alias);
  return spots.length ? Math.min(...spots) : -1;
}

/**
 * The tone of a headline and the one stock it is about. One stock named: that stock. Two named: only the one named
 * before the words that set the tone ("Nebius gains 13% on CoreWeave results" -> Nebius), and nothing when both or
 * neither come first, or when the stock is the object of the verb ("Morgan Stanley upgrades Nvidia" names MS too).
 */
export function headlineWordRead(
  title: string,
  tickers: string[],
  names: Record<string, string | null | undefined> = {},
): { tone: WordTone; ticker: string } | null {
  if (!tickers.length || tickers.length > MAX_TICKERS_FOR_WORDS) return null;
  const cased = evened(title);
  const lower = cased.toLowerCase();
  const read = readWords(lower);
  if (!read) return null;
  if (tickers.length === 1) return { tone: read.tone, ticker: tickers[0]! };
  if (read.objectVerb) return null;
  const before = tickers.filter((ticker) => {
    const at = mentionAt(cased, lower, ticker, names[ticker]);
    return at >= 0 && at < read.at;
  });
  return before.length === 1 ? { tone: read.tone, ticker: before[0]! } : null;
}

/**
 * A label the word list made, marked so it is never mistaken for the model's. On a story naming two companies it
 * carries the one stock it is about; the other gets no tone from it.
 */
export function wordLabel(tone: WordTone, ticker?: string): NewsLabel {
  return ticker ? { tone, scope: "stock", theme: null, by: "words", ticker } : { tone, scope: "stock", theme: null, by: "words" };
}

/**
 * The model's labels, plus a word-list label for each story published since `sinceMs` that names one or two
 * companies, has no model label, and whose headline clearly reads one way. The model's labels are never touched.
 * `names` (ticker -> company name) lets a two-company headline find which of them its words are about.
 */
export function withHeadlineTones(
  items: WireItem[],
  labels: NewsLabels,
  options: { sinceMs?: number; names?: Record<string, string | null | undefined> } = {},
): NewsLabels {
  const sinceMs = options.sinceMs ?? Number.NEGATIVE_INFINITY;
  let out: NewsLabels | null = null;
  for (const item of items) {
    if (labels[item.id] || !item.tickers.length || item.tickers.length > MAX_TICKERS_FOR_WORDS) continue;
    const at = Date.parse(item.publishedAt);
    if (!Number.isFinite(at) || at < sinceMs) continue;
    const read = headlineWordRead(item.title, item.tickers, options.names);
    if (!read) continue;
    out ??= { ...labels };
    out[item.id] = item.tickers.length > 1 ? wordLabel(read.tone, read.ticker) : wordLabel(read.tone);
  }
  return out ?? labels;
}
