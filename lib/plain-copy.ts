/**
 * Small text helpers for copy a reader sees: news headlines that arrive in
 * Title Case, and long reasons that need a complete first sentence instead of
 * an ellipsis. Pure, no I/O.
 */

// Ordinary English words that a Title Case headline capitalises but a
// sentence would not. Anything not listed (company names, places, people) keeps
// its capital, so "Revenue Beat and Patent Defense Support Acadia Shares"
// becomes "Revenue beat and patent defense support Acadia shares".
const COMMON = new Set(
  (
    "a about above according across after against ahead all also amid among an and announces annual any are as at back " +
    "be beat beats because been before behind below best better between big bigger biggest billion bond bonds boost boosts " +
    "but buy buyback buys by call calls can cash ceo cfo chief chip chips climb climbs close closes cut cuts data deal deals " +
    "debt defense demand despite dip dips down drop drops due during earnings ease eases end ends estimate estimates expand " +
    "expands expected expects fall falls fears first for forecast forecasts from fund funds gain gains gets give gives " +
    "growth guidance has have higher hike hikes hit hits hold holds how in into investors is it its jump jumps key late " +
    "latest lead leads less lift lifts loss losses low lower lowers make makes market markets may miss misses momentum " +
    "more most move moves new news next no not now of off offering on one only or orders other out outlook over patent " +
    "plan plans plunge plunges points post posts price prices profit profits q1 q2 q3 q4 quarter quarterly raise raises " +
    "rally rallies rate rates record report reports results revenue revenues rise rises rival rivals rose sale sales says " +
    "see sees sell sells share shares shows signs slide slides slip slips slump slumps soar soars stake stock stocks strong " +
    "stronger support supports surge surges target targets than that the their this through to top trade trading trim " +
    "up upgrade upgrades downgrade downgraded upgraded preview expect grow grows growing reveals unveils launches launch hits high highs lows warns warning amid analyst analysts says said could would should after-hours premarket today tomorrow shareholders dividend dividends acquisition acquire acquires buy-out merger split splits  downgrades users view weak weaker week what when while why will with year years yet"
  ).split(" "),
);

/** True when most words of a headline start with a capital: "Zeta Raises Outlook After Strong Q3 Earnings Beat". */
export function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word) && word.length > 3);
  if (words.length < 3) return false;
  const capped = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capped / words.length >= 0.75;
}

/**
 * A Title Case headline written as a sentence. Leaves anything that is not
 * Title Case alone, keeps the first word, acronyms (AI, Q3, GTA), words with
 * inner capitals (iPhone, McDonald's) and every word not in the common list.
 */
export function sentenceCase(text: string | null | undefined): string {
  const value = (text ?? "").trim().replace(/\s+/g, " ");
  if (!value || !isTitleCase(value)) return value;
  let first = true;
  return value.replace(/[A-Za-z][A-Za-z'’]*/g, (word, offset: number) => {
    const isFirst = first;
    first = false;
    // After a colon a new clause starts, as it would in a sentence.
    const before = value.slice(0, offset).trimEnd();
    if (isFirst || /[:.!?]$/.test(before)) return word;
    if (word.length > 1 && word === word.toUpperCase()) return word;
    if (/[A-Z]/.test(word.slice(1))) return word;
    const bare = word.toLowerCase().replace(/['’]s$/, "");
    return COMMON.has(bare) ? word.toLowerCase() : word;
  });
}

const ABBREVIATIONS = /(?:^|\s)(?:Inc|Corp|Co|Ltd|LLC|Mr|Mrs|Ms|Dr|St|vs|No|U\.S|U\.K|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|approx|est|e\.g|i\.e)\.$/i;

/**
 * The complete first sentence of a text, never cut mid-sentence. Steps over
 * "Inc." and "$8.0 billion". A text with no sentence end comes back whole.
 */
export function firstFullSentence(text: string | null | undefined): string {
  const value = (text ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  const re = /[.!?](?=\s+["“(]?[A-Z0-9$])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const head = value.slice(0, match.index + 1);
    if (ABBREVIATIONS.test(head) || /\b[A-Z]\.$/.test(head)) continue;
    return head;
  }
  return value;
}

/**
 * A reason ready to read: Title Case undone, trader shorthand spelled out, and a
 * closing full stop. Pass `{ quote: true }` for someone's own words, which keep
 * their wording (no plainFinance rewrite).
 */
export function asSentence(text: string | null | undefined, options: { quote?: boolean } = {}): string {
  const cased = sentenceCase(text);
  const value = (options.quote ? cased : plainFinance(cased)).replace(/\s*[.…]+$/, "");
  if (!value) return "";
  return /[!?]$/.test(value) ? value : `${value}.`;
}

// Names some filings feeds clip to a fixed width, mapped to the name people use.
const CLIPPED_NAMES: Array<[RegExp, string]> = [
  [/^space exploration techn\w*$/i, "SpaceX"],
  // Long official names with a short form everyone uses.
  [/^taiwan semiconductor manufactur\w*(?: co(?:mpany)?)?$/i, "Taiwan Semiconductor"],
];

/**
 * A company name without its legal suffix, so it fits a row without being cut:
 * "Hims & Hers Health, Inc." -> "Hims & Hers Health", "NVIDIA Corporation" -> "NVIDIA".
 */
export function shortCompanyName(name: string | null | undefined): string {
  const value = (name ?? "").trim().replace(/\s+/g, " ");
  const short = value
    // Feed tails like "Cerebras Systems Inc - a" and "Taiwan Semiconductor-Sp ADR".
    .replace(/\s+-\s+(?:Class\s+)?[A-C]$/i, "")
    .replace(/[-\s]+(?:Sp(?:on)?\s+)?ADR$/i, "")
    .replace(/,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|plc|PLC|N\.V|S\.A|SE|AG|L\.P|LP|LLC|Holdings?|Group|Class [A-C])\.?$/i, "")
    .replace(/,?\s+(?:Inc|Corp|Co|Ltd|plc|Holdings?)\.?$/i, "")
    .replace(/[,\s]+$/, "");
  // Feeds that cut a name short: say the name people use.
  const known = CLIPPED_NAMES.find(([pattern]) => pattern.test(short));
  if (known) return known[1];
  return short || value;
}

type Call = "Add" | "Hold" | "Trim";

/** What each call means, said the way a person would. */
export const CALL_MEANING: Record<Call, string> = {
  Add: "We'd buy more",
  Hold: "We'd keep it, not add",
  Trim: "We'd sell some, not buy more",
};

// The call engine's action labels, in plain words. Unknown labels pass through.
const ACTIONS: Array<[RegExp, string]> = [
  [/^accumulate now$/i, "A good price to buy more"],
  [/^accumulate on (?:pullbacks|dips)$/i, "Buy more on a dip, not here"],
  [/^accumulate$/i, "We'd buy more"],
  [/^add (?:now|here)$/i, "A good price to buy more"],
  [/^hold here$/i, "Keep it, don't add"],
  [/^hold$/i, "We'd keep it, not add"],
  [/^do not add here$/i, "Don't buy more at this price"],
  [/^trim into strength$/i, "Sell some if it rises"],
  [/^trim$/i, "We'd sell some"],
  [/^watch$/i, "Wait and watch"],
  [/^reassess$/i, "The case has broken; rethink it"],
];

/**
 * The plain line beside a call word. Uses the brief's own action label when it
 * says more than the call word, translated where it is trader shorthand;
 * otherwise what the call means.
 */
export function plainAction(label: string | null | undefined, call: Call | null | undefined): string | null {
  const value = (label ?? "").trim();
  if (value) {
    const known = ACTIONS.find(([pattern]) => pattern.test(value));
    const text = known ? known[1] : value;
    if (!call || !new RegExp(`^${call}\\b`, "i").test(text) || text.length > call.length + 6) return text;
  }
  return call ? CALL_MEANING[call] : null;
}

const HORIZONS: Record<string, string> = { days: "the next few days", weeks: "the next few weeks", months: "the next few months", quarters: "the next few quarters", years: "the next few years" };

/** "Medium confidence, for the next few weeks." from the call's confidence and horizon words. */
export function callMetaLine(confidence: string | null | undefined, horizon: string | null | undefined): string {
  const conf = (confidence ?? "").trim().toLowerCase();
  const span = (horizon ?? "").trim().toLowerCase();
  const when = span ? HORIZONS[span] ?? span : "";
  if (conf && when) return `${conf.charAt(0).toUpperCase()}${conf.slice(1)} confidence, for ${when}.`;
  if (conf) return `${conf.charAt(0).toUpperCase()}${conf.slice(1)} confidence.`;
  if (when) return `For ${when}.`;
  return "";
}

// The call pipeline writes its one-line reason from a short, fixed set of
// templates (backend/directive_v2.py and backend/call_engine.py). Each one in
// the same meaning, said plainly. Anything else passes through untouched.
const CALL_REASONS: Array<[RegExp, (match: RegExpExecArray) => string]> = [
  [
    /^the setup is attractive at the current price; use pullbacks to add rather than waiting for a perfect entry\.?$/i,
    () => "The evidence looks good at today's price. We'd buy now and add more on any dip, rather than wait for a perfect price.",
  ],
  [
    /^the setup is constructive, but the cleaner entry is a pullback into support\.?$/i,
    () => "The evidence looks good, but we'd wait for the price to dip back toward a level where buyers stepped in before.",
  ],
  [
    /^still constructive, but price is up (\d+(?:\.\d+)?)% from its recent low, so the first pullback is the better entry\.?$/i,
    (m) => `We still like it, but the price is up ${m[1]}% from its recent low, so we'd wait for the first dip to buy.`,
  ],
  [
    /^still constructive, but price is up (\d+(?:\.\d+)?)% in a handful of sessions, so wait for the move to settle\.?$/i,
    (m) => `We still like it, but the price is up ${m[1]}% in a few days, so we'd wait for it to settle before buying.`,
  ],
  [
    /^wait for price confirmation before adding; the evidence is not strong enough for an add-now call\.?$/i,
    () => "We'd wait for the price to keep climbing before buying more. The evidence isn't strong enough to buy now.",
  ],
  [
    /^risk\/reward has weakened; avoid adding and use any bounce to reduce exposure\.?$/i,
    () => "The possible gain no longer looks worth the risk. We wouldn't buy more, and if the price bounces we'd sell some.",
  ],
  [/^the setup is not paying enough for the risk right now\.?$/i, () => "Right now the possible gain isn't worth the risk."],
  [
    /^upside and downside look balanced; keep the position but do not force a new add\.?$/i,
    () => "The chances of a rise and a fall look about even. If you own it, we'd keep it, but we wouldn't buy more now.",
  ],
  [/^no reliable current price is available, so this stays on watch\.?$/i, () => "We don't have a reliable price right now, so we're only watching it."],
  [/^revisit only if fresh evidence improves the setup\.?$/i, () => "We'd look again only if new evidence makes the case better."],
  [/^revisit if the stock resets and the next catalyst improves risk\/reward\.?$/i, () => "We'd look again after the price settles lower and the next piece of news makes it worth the risk."],
  [/^revisit if price confirms the breakout with stronger participation\.?$/i, () => "We'd look again if the price keeps climbing and more buyers join in."],
  [/^revisit if momentum breaks or fresh evidence weakens\.?$/i, () => "We'd look again if the price trend turns or new evidence weakens the case."],
];

// The call engine's scorecard sentence: "<why> 5 of 7 families point up, 1 point down." plus an optional level sentence.
const ENGINE_LEAD: Array<[RegExp, string]> = [
  [/^most of its measured families rank in the top third of similar companies and the price trend agrees\.\s*/i, "Most of what we measure ranks in the top third of similar companies, and the price trend agrees"],
  [/^most of its measured families rank in the bottom third of similar companies and the price trend agrees\.\s*/i, "Most of what we measure ranks in the bottom third of similar companies, and the price trend agrees"],
  [/^its measured families do not agree enough for add or trim\.\s*/i, "What we measure is split, so we'd neither buy more nor sell"],
];

function plainEngineReason(text: string): string | null {
  const lead = ENGINE_LEAD.find(([pattern]) => pattern.test(text));
  if (!lead) return null;
  const rest = text.replace(lead[0], "");
  const votes = /^(\d+) of (\d+) families point up, (\d+) points? down\.\s*/i.exec(rest);
  let out = lead[1];
  let tail = rest;
  if (votes) {
    out += `: ${votes[1]} of ${votes[2]} measures point up and ${votes[3]} point down.`;
    tail = rest.slice(votes[0].length);
  } else {
    out += ".";
  }
  tail = tail
    .replace(/^the add level is (\S+)/i, "We'd buy more below $1")
    .replace(/^the level to reduce into is (\S+)/i, "We'd sell some above $1");
  return `${out} ${tail}`.trim();
}

/**
 * The stored one-line reason behind a call, in plain words with the same
 * meaning: "Risk/reward has weakened; avoid adding and use any bounce to
 * reduce exposure." becomes "The possible gain no longer looks worth the risk.
 * We wouldn't buy more, and if the price bounces we'd sell some." Text that is
 * not one of the pipeline's templates comes back as it was.
 */
export function plainCallReason(text: string | null | undefined): string {
  const value = (text ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  for (const [pattern, write] of CALL_REASONS) {
    const match = pattern.exec(value);
    if (match) return write(match);
  }
  return plainEngineReason(value) ?? value;
}

// Wall Street shorthand in our move reasons, said the long way with the same
// meaning. Ordered: the longer phrases first so "Q3 earnings beat" is not
// half-rewritten by the plain "earnings beat" rule.
const FINANCE_PHRASES: Array<[RegExp, string]> = [
  [/\b(?:strong |solid |big )?(Q[1-4] |(?:first|second|third|fourth)-quarter )?(earnings|revenue|sales|profit) beats?\b(?!\s+(?:the\s+)?(?:analysts?'?\s+)?(?:estimates?|expectations|forecasts?|views|consensus))/gi, "$1$2 that beat expectations"],
  [/\b(?:weak )?(Q[1-4] |(?:first|second|third|fourth)-quarter )?(earnings|revenue|sales|profit) miss(?:es)?\b(?!\s+(?:the\s+)?(?:analysts?'?\s+)?(?:estimates?|expectations|forecasts?|views|consensus))/gi, "$1$2 that missed expectations"],
  [/\bguidance (?:cut|reduction)\b/gi, "a lower forecast"],
  [/\bguidance (?:increase|raise|hike)\b/gi, "a raised forecast"],
  [/\b(raises|raised|lifts|lifted|boosts|boosted|cuts|cut|lowers|lowered|reaffirms|reaffirmed) (?:its |full-year |annual )?(?:guidance|outlook)\b/gi, "$1 its forecast"],
  [/\bas guidance\b/gi, "as its forecast"],
  [/\bguidance\b/gi, "forecast"],
  [/\bconvertible (?:debt|notes?|bond) offering\b/gi, "sale of bonds that can turn into shares"],
  [/\bprior-window\b/gi, "earlier"],
];

/**
 * A move reason with trader shorthand spelled out: "Hims & Hers plunges after
 * earnings miss and guidance cut" -> "... after earnings that missed expectations
 * and a lower forecast". For our own reasons only; never for a publisher's
 * headline, which is quoted as written.
 */
export function plainFinance(text: string | null | undefined): string {
  let value = (text ?? "").trim();
  for (const [pattern, replacement] of FINANCE_PHRASES) value = value.replace(pattern, replacement);
  // "that beat expectations" leaves "Q3 earnings" with a doubled space when the quarter is missing.
  return value.replace(/\s{2,}/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/**
 * The complete sentences of a feed excerpt, never one that a feed cut off
 * with "..." partway through: "A did X. B said Y, and the…" -> "A did X.".
 * An excerpt with no complete sentence comes back empty, so the caller shows
 * nothing rather than a broken clause. Keeps at most `max` sentences.
 */
export function wholeSentences(text: string | null | undefined, max = 2): string {
  const value = (text ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  const cut = /(?:…|\.\.\.)\s*$/.test(value);
  const sentences: string[] = [];
  let rest = value;
  while (rest && sentences.length < max) {
    const first = firstFullSentence(rest);
    if (first === rest) {
      // The last piece: keep it only if it really ends a sentence.
      if (!cut && /[.!?]["”)]?$/.test(first)) sentences.push(first);
      break;
    }
    sentences.push(first);
    rest = rest.slice(first.length).trim();
  }
  return sentences.join(" ");
}
