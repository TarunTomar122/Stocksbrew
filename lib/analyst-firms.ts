/**
 * Banks and brokers named in a headline as the analyst, not as the subject.
 *
 * "JPMorgan says Strategy could face $2.8 billion of forced selling", "Meta wins JPMorgan
 * backing" and "JPMorgan cut its IREN target" are stories about Strategy, Meta and IREN, but a
 * match on the firm's name put them on JPM's stock page as news about JPMorgan. A rating or a
 * pick is always about the stock rated; a view ("JPMorgan says...") is about the bank itself
 * unless the headline also names another company or is a market call. The pipelines now apply
 * this (backend/agentdata/analyst_firms.py); this is the same rule for rows already stored, so
 * the stock page drops them on read. Keep the two in step.
 */

export const ANALYST_FIRMS = new Set(["JEF", "MS", "GS", "JPM", "C", "BAC", "WFC", "EVR", "HLI", "UBS", "BLK", "RJF", "SF", "PIPR", "BCS", "DB"]);

const FIRM_NAMES: Record<string, string[]> = {
  JPM: ["JPMorgan Chase", "JPMorgan", "J.P. Morgan", "JP Morgan"],
  GS: ["Goldman Sachs", "Goldman"],
  MS: ["Morgan Stanley"],
  C: ["Citigroup", "Citi"],
  BAC: ["Bank of America", "BofA"],
  WFC: ["Wells Fargo"],
  JEF: ["Jefferies"],
  EVR: ["Evercore"],
  HLI: ["Houlihan Lokey"],
  UBS: ["UBS"],
  BLK: ["BlackRock"],
  RJF: ["Raymond James"],
  SF: ["Stifel"],
  PIPR: ["Piper Sandler"],
  BCS: ["Barclays"],
  DB: ["Deutsche Bank"],
};

/**
 * A regex source made case-insensitive letter by letter, for the parts Python marks `(?i:...)`
 * while the rest of the pattern (capitalised names) stays case-sensitive. Escapes and
 * character classes are copied as they are.
 */
function ci(source: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (ch === "\\") {
      out += ch + (source[i + 1] ?? "");
      i += 1;
    } else if (inClass) {
      out += ch;
      if (ch === "]") inClass = false;
    } else if (ch === "[") {
      inClass = true;
      out += ch;
    } else if (/[a-z]/i.test(ch)) {
      out += `[${ch.toLowerCase()}${ch.toUpperCase()}]`;
    } else {
      out += ch;
    }
  }
  return out;
}

const MOODS = "(?:wary|cautious|bullish|bearish|positive|negative|optimistic|pessimistic|skeptical|constructive)";
const MOOD_VERBS = "(?:is|remains|stays|turns|turned|grows?|grew|gets|got)\\s+";
/** "JPMorgan", "Morgan Stanley's Mike Wilson", "Evercore ISI", "Citigroup CEO": who is speaking, before the verb. */
const SPEAKER = `^(?:['’]s)?(?:\\s+(?:CEO|chief|ISI|Securities|Research|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)){0,2}(?:\\s+${ci("(?:just|now|also|again|still)")})?\\s+`;

/** A rating, a pick or a stance on other stocks: never news about the firm. */
const RATING_AFTER = new RegExp(
  SPEAKER +
    // "Jefferies says likes the Cohu setup"
    `(?:${ci("says")}\\s+)?(?:` +
    ci(
      [
        "upgrades|upgraded(?!\\s+(?:to|at|by)\\b)|downgrades|downgraded(?!\\s+(?:to|at|by)\\b)|initiates|initiated|reiterates|reiterated",
        "reaffirms|reaffirmed|likes|sends|names|named|picks|picked|backs|prefers|recommends|defends|defended|plays\\s+down|spots|weighs\\s+in",
        "calls|(?:backs|backed)\\s+away|sours|soured|warms|warmed",
        `${MOOD_VERBS}${MOODS}\\s+(?:on|about|toward)\\b`,
        // "lifts its target", "cut its IREN target", "resets Eli Lilly stock target"
        "(?:lifts|lifted|raises|raised|cuts|cut|lowers|lowered|trims|trimmed|boosts|boosted|hikes|hiked|slashes|slashed|resets|reset|sets|maintains|maintained|keeps|kept)\\s+(?:\\S+\\s+){0,3}?(?:price\\s+)?(?:targets?|ratings?|PTs?|recommendation)\\b",
        // "just added Meta Platforms to its focus list", "drops Nvidia from elite stock list"
        "(?:adds|added|removes|removed|drops|dropped|cuts|cut|pulls|pulled|kicks|kicked)\\b.{0,60}?\\b(?:to|from|off)\\s+(?:its\\s+|the\\s+|their\\s+)?.{0,40}?\\b(?:list|picks?)",
        "drops?\\s+(?:its\\s+)?\\S+\\s+(?:stance|call|view|rating)",
      ].join("|"),
    ) +
    ")(?![A-Za-z])",
);
/** A named analyst or research arm speaking: "Morgan Stanley's Mike Wilson sees...", "BofA strategists see...". */
const ANALYST_SPEAKS = new RegExp(
  `^(?:['’]s)?\\s+(?:${ci("analysts?|strategists?|economists?")}|ISI|Research|Global\\s+Research)\\b` +
    `|^['’]s\\s+[A-Z][a-z]+\\s+[A-Z][\\w'’-]+(?:\\s*:|\\s+${ci("(?:says|said|sees|saw|expects|warns|predicts|thinks|believes|makes|calls|likes|is)")}\\b)`,
);
/** A view the firm gives: about itself unless the headline also names another company or calls the market. */
const VIEW_AFTER = new RegExp(
  SPEAKER +
    "(?:" +
    ci(
      [
        "says|said|sees|saw|expects|warns|predicts|thinks|believes|forecasts|projects|estimates|argues|tells|highlights|flags",
        "turns|offers|issues|shares|makes",
        `${MOOD_VERBS}${MOODS}`,
        "(?:lifts|lifted|raises|raised|cuts|cut|lowers|lowered|trims|trimmed|boosts|boosted|hikes|hiked|slashes|slashed)\\s+(?:\\S+\\s+){0,3}?(?:estimates?|forecasts?|outlook|views?|expectations|odds|probability)\\b",
      ].join("|"),
    ) +
    ")(?![A-Za-z])",
);
/** "..., Jefferies says": an attribution closing the headline. */
const TRAILING_ATTRIBUTION = /^\s*(?:says|said|argues|warns|notes|writes|thinks|believes|predicts)\s*[.?!]?\s*$/i;
/** "Meta Wins JPMorgan Backing", "after Jefferies upgrade", "Bank of America's JFrog call", "Goldman Sachs on IREN". */
const RATING_NOUN_AFTER = new RegExp(
  `^(?:['’]s)?\\s+(?:${ci("backing|nod|endorsement|upgrade|downgrade|coverage|top\\s+picks?|focus\\s+list|(?:bullish|bearish|cautious)\\s+(?:case|view|call|stance|take)")})(?![A-Za-z])` +
    `|^['’]s\\s+(?:[A-Z][\\w.&-]*\\s+){1,2}(?:${ci("call|target|upgrade|downgrade|rating|pick|thesis")})(?![A-Za-z])` +
    `|^\\s+on\\s+[A-Z]`,
);
const OPINION_BEFORE =
  /(?:\b(?:as|per|from|by|says|said|warns|notes|argues|cautions|finds|found|according\s+to|wins|win|won|gets|got|earns|earned|receives|received|lands|landed|draws|scores)\s+)$/i;
/** The firm as the subject: its own symbol, its stock, its results, or a rating on it ("JPMorgan (JPM) price target raised"). */
const SUBJECT_AFTER = new RegExp(
  `^(?:['’]s)?(?:\\s*\\((?:[A-Za-z]+\\s*:\\s*)?[A-Z.]{1,6}\\))?\\s+(?:${ci(
    "stock|shares(?!\\s+(?:a|an|its|the|their|his|her)\\b)|earnings|results|profit|revenue|Q[1-4]\\b|price\\s+target|(?:is\\s+|gets\\s+)?(?:upgraded|downgraded)\\s+(?:to|at|by)\\b|(?:gets|wins|earns|receives)\\s+(?:an?\\s+)?(?:upgrade|downgrade|price\\s+target)",
  )})`,
);
/** "Baird upgrades JPMorgan Chase", "Analysts upgrade JPMorgan": a rating on the firm. */
const RATED_BEFORE =
  /\b(?:upgrades?|upgraded|downgrades?|downgraded|initiates?(?:\s+coverage\s+(?:on|of))?|initiated(?:\s+coverage\s+(?:on|of))?|(?:raises|lifts|cuts|lowers|trims)\s+(?:its\s+)?(?:price\s+)?target\s+on)\s+$/i;
/** A headline built around a rating or a pick is about the stock being rated, whoever else it names. */
const ANALYST_VOCAB = new RegExp(
  "\\b(?:price\\s+targets?|stock\\s+target|target\\s+price|upgrades?|upgraded|downgrades?|downgraded|top\\s+picks?|favou?rite\\s+picks|" +
    "focus\\s+list|stock\\s+list|overweight|underweight|outperform|underperform|equal[-\\s]weight|buy\\s+rating|sell\\s+rating|" +
    "bullish\\s+case|bearish\\s+case|screaming\\s+buy|advice\\s+for|buy['\"‘’“”]?\\s+rating|prediction|verdict|opinion|stark\\s+take|weighs\\s+in|" +
    "give\\s+up\\s+on|bets\\s+on\\s+[\\d$]|back(?:s|ed)\\s+away\\s+from|(?:bold|big)\\s+(?:[\\w&$.,-]+\\s+){0,3}call)" +
    // Companies presenting at a bank's conference: the bank is the host, not the story.
    "|\\b(?:present|presents|presenting|participate|participates|participation|participating|fireside)\\b.{0,120}\\b(?:conferences?|summit|symposium|forum)\\b",
  "i",
);
/** A market call: the view is about the market, not the bank. */
const MARKET_CALL =
  /S&P|\bNasdaq\b|\bDow\b|\bstocks?\b|\bmarkets?\b|\bequit(?:y|ies)\b|\brates?\b|\byields?\b|\btreasur|\bbonds?\b|\binflation\b|\brecession\b|\beconom|\beconomy\b|\bGDP\b|\boil\b|\bgold\b|\bbitcoin\b|\bcrypto\b|\bdollar\b|\byen\b|\beuro\b|\bcurrenc|\btariffs?\b|\bbubble\b|\bcorrection\b|\bsell-?off\b|\brally\b|\bsectors?\b|\bindustrials\b|\bchipmakers?\b|\bconsumers?\b|\bhousing\b|\bBank\s+of\s+(?:Canada|England|Japan)\b/i;
/** Benzinga closes a headline with the companies it tagged: "... After Hours - Broadcom (NASDAQ:AVGO), JPMorgan Chase (NYSE:JPM) - Benzinga". */
const TAG_TAIL = /\s+[-–—]\s+[^-–—]*\((?:NASDAQ|Nasdaq|NYSE|AMEX|OTC)[^)]*\).*$/;
/** "Zoetis to Participate in the Jefferies Global Healthcare Conference": the firm hosts. */
const CONFERENCE_AFTER = /^(?:\s+[A-Z0-9][\w&.-]*){0,4}\s+(?:Conference|Summit|Symposium|Forum)\b/;

/** "Jamie Dimon says JPMorgan will hire…": the firm starts its own clause, so a "says" before it is someone talking about it. */
const CLAUSE_AFTER = /^(?:['’]s)?\s+(?:will|would|is|was|has|had|plans?|to|expects?|reports?|posts?|posted|hires?|cuts?|raises?|beats?|misses|sees)\b/i;
/** "JPMorgan says Strategy could face…": a view whose subject is another, capitalised name is about that company. */
const OTHER_AFTER_VIEW = /^\s+(?:says|said|sees|saw|expects|warns|thinks|believes|predicts)\s+(?!(?:It|Its|The|This|That|They|There|Profit|Revenue|Earnings|Results|Shares|Stock|Fed|Federal|Treasury|SEC|FDIC|OCC|CFPB|FINRA|Regulators?|Government|Congress|Senate|Court|Judge)\b)[A-Z][a-z]/;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ratingMention(headline: string, start: number, end: number): boolean {
  const after = headline.slice(end);
  return (
    RATING_AFTER.test(after) ||
    RATING_NOUN_AFTER.test(after) ||
    ANALYST_SPEAKS.test(after) ||
    TRAILING_ATTRIBUTION.test(after) ||
    (OPINION_BEFORE.test(headline.slice(0, start)) && !CLAUSE_AFTER.test(after)) ||
    CONFERENCE_AFTER.test(after)
  );
}

const patternCache = new Map<string, RegExp | null>();
function firmPattern(symbol: string): RegExp | null {
  if (patternCache.has(symbol)) return patternCache.get(symbol)!;
  const names = [...(FIRM_NAMES[symbol] ?? [])].sort((a, b) => b.length - a.length).map(escape);
  if (symbol.length >= 3) names.push(escape(symbol));
  const pattern = names.length ? new RegExp(`(?<![A-Za-z0-9$])(?:${names.join("|")})(?![A-Za-z0-9])`, "g") : null;
  patternCache.set(symbol, pattern);
  return pattern;
}

/**
 * For a bank or broker, whether the story is about the firm itself rather than quoting it as
 * the analyst. `others` says the headline also names another covered company. A headline that
 * does not name the firm is left to whoever tagged it, unless the firm only turns up in a
 * publisher's trailing tag list. Any other ticker passes.
 */
export function firmIsSubject(ticker: string, title: string, others = false): boolean {
  const symbol = ticker.trim().toUpperCase();
  if (!ANALYST_FIRMS.has(symbol)) return true;
  const pattern = firmPattern(symbol);
  if (!pattern) return true;
  const full = String(title ?? "");
  const headline = full.replace(TAG_TAIL, "").trim();
  const hits = [...headline.matchAll(pattern)];
  if (!hits.length) return [...full.matchAll(pattern)].length === 0;
  const rated = ANALYST_VOCAB.test(headline);
  const aboutOthers = others || rated || MARKET_CALL.test(headline);
  for (const hit of hits) {
    const start = hit.index ?? 0;
    const end = start + hit[0].length;
    const after = headline.slice(end);
    if (SUBJECT_AFTER.test(after) || RATED_BEFORE.test(headline.slice(0, start))) return true;
    if (ratingMention(headline, start, end)) continue;
    if (VIEW_AFTER.test(after)) {
      if (aboutOthers || OTHER_AFTER_VIEW.test(after)) continue;
      return true;
    }
    if (rated) continue;
    return true;
  }
  return false;
}
