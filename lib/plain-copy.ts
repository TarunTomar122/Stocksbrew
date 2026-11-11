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
  // The "The" is part of how people say it.
  [/^trade desk$/i, "The Trade Desk"],
  // 13F files it as "D R HORTON INC"; title-casing that gives "Dr Horton".
  [/^(?:d\.?\s*r\.?|dr)\s+horton$/i, "D.R. Horton"],
];

/**
 * How companies write their own names, for words that a feed's title-casing
 * or capitals get wrong ("Nvidia", "Mckesson", "Ishares"). Keys are lowercase.
 */
const NAME_WORDS: Record<string, string> = {
  nvidia: "NVIDIA", nvr: "NVR", nxp: "NXP", slb: "SLB", amd: "AMD", ibm: "IBM", asml: "ASML", hca: "HCA", kla: "KLA", csx: "CSX",
  eog: "EOG", tjx: "TJX", ge: "GE", hp: "HP", ups: "UPS", cvs: "CVS", pnc: "PNC", aes: "AES", te: "TE", usa: "USA",
  etf: "ETF", msci: "MSCI", ftse: "FTSE", usd: "USD", mbs: "MBS", reit: "REIT", ai: "AI", "s&p": "S&P", "at&t": "AT&T",
  mckesson: "McKesson", mercadolibre: "MercadoLibre", servicenow: "ServiceNow", conocophillips: "ConocoPhillips",
  technipfmc: "TechnipFMC", ishares: "iShares", crowdstrike: "CrowdStrike", davita: "DaVita", applovin: "AppLovin",
  autozone: "AutoZone", nisource: "NiSource", paccar: "PACCAR", verisign: "VeriSign", paypal: "PayPal", jpmorgan: "JPMorgan",
  blackrock: "BlackRock", exxonmobil: "ExxonMobil", firstenergy: "FirstEnergy", fedex: "FedEx", hubspot: "HubSpot",
  linkedin: "LinkedIn", youtube: "YouTube", docusign: "DocuSign", datadog: "Datadog", mongodb: "MongoDB", siriusxm: "SiriusXM",
  bny: "BNY", dte: "DTE", cbre: "CBRE", spdr: "SPDR", ebay: "eBay", mcdonalds: "McDonald's", "mcdonald's": "McDonald's", ionq: "IonQ",
  // Abbreviations some filings feeds use, spelled out.
  hldgs: "Holdings", hldg: "Holding", intl: "International", finl: "Financial", svcs: "Services", svc: "Service", mgmt: "Management",
};

// Legal words a 28-character 13F name field cuts short: "Credo Technology Group Holdi", "Jefferies Financial Group In".
const CLIPPED_TAILS = ["Holdings", "Incorporated", "Corporation", "Company", "Limited", "Markets", "International"];

/** True when the letters in `text` are all capitals (with at least three in a row): a feed shouting the name. */
function isShouting(text: string): boolean {
  return /[A-Z]{3}/.test(text) && text === text.toUpperCase();
}

/**
 * A feed's company name in the company's own casing: capitals softened word by
 * word ("WINDWARD BIO GROUP AG" -> "Windward Bio Group AG"), known spellings
 * restored ("Mckesson" -> "McKesson", "Nvidia" -> "NVIDIA") and short codes
 * kept ("AG", "S&P"). A name already in mixed case keeps its own casing apart
 * from the known spellings.
 */
export function readableCompanyName(name: string | null | undefined): string {
  const value = (name ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  const shouting = isShouting(value);
  // A one-word name of five letters or fewer in capitals is usually the company's own acronym ("AMC", "CSX").
  if (shouting && !value.includes(" ") && value.length <= 5) return NAME_WORDS[value.toLowerCase()] ?? value;
  return value
    .split(" ")
    .map((word, index) => {
      const known = NAME_WORDS[word.toLowerCase()];
      if (known) return known;
      if (!shouting) return word;
      // Small joining words read lowercase inside a name ("Bank of New York Mellon", "Procter and Gamble").
      if (index > 0 && /^(?:OF|AND|THE|FOR|IN|ON|DE)$/.test(word)) return word.toLowerCase();
      // Two-letter codes ("AG", "NV"), three letters with no vowel ("CSX") and anything with a symbol in it stay as written.
      if (word.length <= 2 || /^[^AEIOUY]{3}$/.test(word) || /[^A-Za-z'.-]/.test(word)) return word;
      return word
        .toLowerCase()
        .replace(/(^|[-'.])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
        .replace(/'S$/, "'s");
    })
    .join(" ");
}

/**
 * A company name without its legal suffix, so it fits a row without being cut:
 * "Hims & Hers Health, Inc." -> "Hims & Hers Health", "NVIDIA Corporation" -> "NVIDIA".
 * Feed casing is fixed on the way (see readableCompanyName).
 */
export function shortCompanyName(name: string | null | undefined): string {
  let value = readableCompanyName(name);
  // A filing field cut mid-word: finish the legal word so the suffix rule below can drop it.
  if (value.length >= 27 && value.length <= 28) {
    const last = value.match(/\s(\w{2,})$/)?.[1];
    const whole = last ? CLIPPED_TAILS.find((word) => word.length > last.length && word.toLowerCase().startsWith(last.toLowerCase())) : undefined;
    if (whole) value = `${value.slice(0, value.length - last!.length)}${whole}`;
  }
  // Share-class and listing tails: "Bloom Energy Corp- a", "Dell Technologies -C", "ASML Holding Nv-Ny Reg Shs".
  value = value
    .replace(/\s*-\s*(?:Class\s+|Cl\s+)?[A-C](?:\s+Shs?)?$/i, "")
    .replace(/[-\s]+(?:N\.?Y\.?\s+)?Reg(?:istry)?\s+Sh(?:are)?s?$/i, "")
    .replace(/[-\s]+(?:Sp(?:on)?\s+)?ADR$/i, "")
    // "JOYY Inc. American Depositary Shares", "Hello Group Inc. Sponsored": listing words, not the name.
    .replace(/[-\s,]+(?:Sponsored\s+)?American\s+Deposit\w*(?:\s.*)?$/i, "")
    .replace(/\s+Sponsored$/i, "");
  const short = value
    // "Elmet Group Co. (The)": the feed's way of filing "The Elmet Group".
    .replace(/\s*\(The\)$/i, "")
    .replace(/,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|plc|PLC|N\.?V|S\.A|SE|AG|L\.P|LP|LLC|Holdings?|Group|Class [A-C])\.?$/i, "")
    .replace(/,?\s+(?:Inc|Corp|Co|Ltd|plc|Holdings?)\.?$/i, "")
    .replace(/[,\s]+$/, "")
    // "Eli Lilly and Company" lost its "Company"; the "and" it leaves behind goes too.
    .replace(/\s+(?:and|&)$/i, "")
    // "The Coca-Cola Company" -> "Coca-Cola": with the legal tail gone, the leading "The" is filing style.
    .replace(/^The\s+(?=\S)/, (lead) => (/,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Company|Ltd|Limited|plc)\.?$/i.test(value) ? "" : lead));
  // Feeds that cut a name short: say the name people use.
  const known = CLIPPED_NAMES.find(([pattern]) => pattern.test(short));
  if (known) return known[1];
  // "On Holding AG" -> "On" says nothing on its own; keep the word that makes it a name. "3M" and "HP" stay.
  if (/^(?:[A-Z][a-z]{0,2}|[A-Z]{2})$/.test(short) && value.length > short.length) {
    const kept = value.replace(/,?\s+(?:Inc|Incorporated|Corp|Corporation|Co|Ltd|Limited|plc|PLC|N\.?V|S\.A|SE|AG|L\.P|LP|LLC|Class [A-C])\.?$/i, "").replace(/[,\s]+$/, "");
    return kept || value;
  }
  return short || value;
}

type Call = "Add" | "Hold" | "Trim";

/** The call itself in a reader's words: the data keeps Add, Hold and Trim; a person reads these. */
export const CALL_PLAIN: Record<Call, string> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/** What each call means, said the way a person would. */
export const CALL_MEANING: Record<Call, string> = {
  Add: "We'd buy more",
  Hold: "We'd keep it, not buy more",
  Trim: "We'd sell some, not buy more",
};

// The call engine's action labels, in plain words. Unknown labels pass through.
const ACTIONS: Array<[RegExp, string]> = [
  [/^accumulate now$/i, "A good price to buy more"],
  [/^accumulate on (?:pullbacks|dips)$/i, "Buy more on a dip, not here"],
  [/^accumulate$/i, "We'd buy more"],
  [/^add (?:now|here)$/i, "A good price to buy more"],
  [/^hold here$/i, "Keep what you own, don't buy more now"],
  [/^hold$/i, "We'd keep it, not buy more"],
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

const SURE: Record<string, string> = { high: "We're quite sure of this", medium: "We're fairly sure of this", med: "We're fairly sure of this", low: "We're not very sure of this" };

/** "We're fairly sure of this for the next few weeks." from the call's confidence and horizon words. */
export function callMetaLine(confidence: string | null | undefined, horizon: string | null | undefined): string {
  const conf = (confidence ?? "").trim().toLowerCase();
  const span = (horizon ?? "").trim().toLowerCase();
  const when = span ? HORIZONS[span] ?? span : "";
  const sure = conf ? SURE[conf] ?? `${conf.charAt(0).toUpperCase()}${conf.slice(1)} confidence` : "";
  if (sure && when) return `${sure} for ${when}.`;
  if (sure) return `${sure}.`;
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
    () => "We see about as much reason for it to fall as to rise. If you own it, keep it; we wouldn't buy more now.",
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
const FINANCE_PHRASES: Array<[RegExp, string | ((match: string, ...groups: string[]) => string)]> = [
  // "Revenue Beat and Guidance Lift Acadia Shares": the company's move first, then both facts.
  [/^(earnings|revenue|sales|profit) beats? and (?:guidance|outlook|forecast) (?:lifts?|raises?|boosts?|sends?) (.+?) shares?(?: higher| up)?\b/i, (_m, what: string, company: string) => `${company} rose after ${what.toLowerCase()} that beat expectations and a raised forecast`],
  // "GTA VI Preorders Spark Take-Two's rebound": the company first.
  [/^(.+?) sparks? (.+?)(?:'|\u2019)s (?:relief rally|rebound|rally|jump|gains?|rise|surge)\b/i, "$2 rose after $1"],
  // "Revenue Beat and Guidance Lift": a beat and a raised forecast, said as both facts.
  [/\b(earnings|revenue|sales|profit) beats? and (?:guidance|outlook|forecast) (?:lift|raise|hike|increase|boost)s?\b(?![^.]*\bshares?\b)/gi, "$1 that beat expectations and a raised forecast"],
  [/\b(earnings|revenue|sales|profit) beats? and (?:guidance|outlook|forecast)\b(?!\s+(?:cut|reduction|lift|raise|hike|increase|boost))/gi, "$1 and a forecast that beat expectations"],
  [/\b(?:strong |solid |big )?(Q[1-4] |(?:first|second|third|fourth)-quarter )?(earnings|revenue|sales|profit) beats?\b(?!\s+(?:the\s+)?(?:analysts?'?\s+)?(?:estimates?|expectations|forecasts?|views|consensus))/gi, "$1$2 that beat expectations"],
  [/\b(?:weak )?(Q[1-4] |(?:first|second|third|fourth)-quarter )?(earnings|revenue|sales|profit) miss(?:es)?\b(?!\s+(?:the\s+)?(?:analysts?'?\s+)?(?:estimates?|expectations|forecasts?|views|consensus))/gi, "$1$2 that missed expectations"],
  [/\bguidance (?:cut|reduction)\b/gi, "a lower forecast"],
  [/\bguidance (?:increase|raise|hike)\b/gi, "a raised forecast"],
  [/\b(raises|raised|lifts|lifted|boosts|boosted|cuts|cut|lowers|lowered|reaffirms|reaffirmed) (?:its |full-year |annual )?(?:guidance|outlook)\b/gi, "$1 its forecast"],
  [/\bas guidance\b/gi, "as its forecast"],
  [/\btepid\b/gi, "weak"],
  [/\b(weak|weaker|soft|softer|lower|disappointing) (?:revenue |sales |full-year |annual )?outlook\b/gi, "$1 forecast"],
  // "on weak forecast" is headline grammar; a sentence needs the article.
  [/\b(on|and|after|with|despite) (weak|weaker|soft|softer|lower|disappointing|strong|stronger|higher|raised|upbeat) forecast\b/gi, "$1 a $2 forecast"],
  [/\brelief rally\b/gi, "rebound"],
  // Analyst target headlines: who did what, in a sentence.
  [/\b(?:a )?price[- ]target cut\b/gi, "a lower analyst price target"],
  [/^analyst (?:trims|lowers|cuts) (.+?)(?:'s)? (?:price )?target despite (?:maintaining|keeping) (?:a |its )?buy rating\b/i, "An analyst lowered the price they expect for $1 but still says buy"],
  [/^analyst (?:trims|lowers|cuts) (.+?)(?:'s)? price target, (?:pressuring|weighing on|hitting) shares\b/i, "$1 fell after an analyst lowered the price they expect"],
  // The researcher's own words for "we found no reason", said the way a reader would.
  [/\bbreaks above (?:its )?recent (?:closing )?range\b/gi, "rises above its recent price range"],
  [/\bbreaks below (?:its )?recent (?:closing )?range\b/gi, "falls below its recent price range"],
  [/,?\s+without (?:a )?(?:verified|confirmed|clear) catalyst\b/gi, ", with no confirmed reason yet"],
  [/\bdespite quiet coverage\b/gi, "with little news"],
  [/\bsell-?off\b/gi, "drop"],
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
  const original = (text ?? "").trim();
  let value = original;
  for (const [pattern, replacement] of FINANCE_PHRASES) value = typeof replacement === "string" ? value.replace(pattern, replacement) : value.replace(pattern, replacement);
  // "that beat expectations" leaves "Q3 earnings" with a doubled space when the quarter is missing.
  value = value.replace(/\s{2,}/g, " ");
  // Re-capitalise only when a rewrite started the text with a small letter ("Guidance cut" -> "a lower forecast");
  // a name that starts small ("eBay") stays as written.
  // Leading punctuation ("\"Guidance cut\" ...") is stepped over.
  return /^[^A-Za-z]*[A-Z]/.test(original) ? value.replace(/^([^A-Za-z]*)([a-z])/, (_, lead: string, first: string) => lead + first.toUpperCase()) : value;
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
      // The last piece: keep it unless a feed cut it off with "...". A complete
      // line with no full stop (many feed headlines) still counts.
      if (!cut) sentences.push(first);
      break;
    }
    sentences.push(first);
    rest = rest.slice(first.length).trim();
  }
  return sentences.join(" ");
}

// Headline-style move reasons put the cause first and the company last:
// "Earnings that missed expectations trigger Hims & Hers drop". Turned around,
// the company leads and the cause follows "after".
const CAUSE_VERB_UP = ["lift", "lifts", "boost", "boosts", "power", "powers", "propel", "propels"];
const CAUSE_VERB_DOWN = ["sink", "sinks", "weigh on", "weighs on", "pressure", "pressures", "hit", "hits"];
const CAUSE_VERB_ANY = ["trigger", "triggers", "spark", "sparks", "drive", "drives", "send", "sends", "push", "pushes", "fuel", "fuels"];
const MOVE_NOUN_UP = ["rally", "rebound", "surge", "gain", "gains", "jump", "rise", "climb"];
const MOVE_NOUN_DOWN = ["drop", "decline", "slide", "slump", "plunge", "fall", "selloff", "sell-off"];
const MOVE_NOUN_ANY = ["shares", "stock"];
// Company-first headlines: "LifeVantage stock falls after revenue drops 22%".
// Past tense too: our own rewrites ("Acadia rose after ...") come back through here on the briefing.
const MOVE_VERB_UP = ["rises", "jumps", "climbs", "surges", "soars", "gains", "rallies", "rebounds", "advances", "pops", "spikes", "rose", "jumped", "climbed", "surged", "gained", "rallied", "rebounded"];
const MOVE_VERB_DOWN = ["falls", "slides", "drops", "plunges", "sinks", "tumbles", "slumps", "declines", "dips", "slips", "retreats", "sheds", "fell", "slid", "dropped", "plunged", "sank", "tumbled", "slumped", "declined", "slipped"];
/** Either case for the first letter, so a Title Case feed line ("Spark") matches too. */
const alt = (words: string[]) => words.map((word) => `[${word.charAt(0)}${word.charAt(0).toUpperCase()}]${word.slice(1).replace(/-/g, "\\-")}`).join("|");
const CAUSE_FIRST = new RegExp(
  `^(.{6,}?)\\s+(${alt([...CAUSE_VERB_UP, ...CAUSE_VERB_DOWN, ...CAUSE_VERB_ANY])})\\s+(?:a\\s+|an\\s+)?([A-Z][^,;:]{0,38}?)(?:['\u2019]s)?\\s+(${alt([...MOVE_NOUN_UP, ...MOVE_NOUN_DOWN, ...MOVE_NOUN_ANY])})(?:\\s+(?:higher|lower|up|down))?\\.?$`,
);
const COMPANY_FIRST = new RegExp(`^([A-Z][^,;:]{1,38}?)(?:['\u2019]s)?(?:\\s+(?:stock|shares))?\\s+(${alt([...MOVE_VERB_UP, ...MOVE_VERB_DOWN])})\\s+(\\S.*?)\\.?$`);

export type MoveSentence = {
  /** The company as the reason names it: "Hims & Hers", "LifeVantage". */
  subject: string;
  /** The rest of the sentence after the company, no full stop: "fell 16.5% after earnings that missed expectations". */
  predicate: string;
};

/**
 * A move reason split into the company and what happened to it, company
 * first. Cause-first reasons are turned around: "Earnings that missed
 * expectations trigger Hims & Hers drop" at -16.5 gives "Hims & Hers" + "fell
 * 16.5% after earnings that missed expectations". Company-first reasons keep
 * their words and get the size after the verb: "LifeVantage stock falls after
 * revenue drops 22%" gives "LifeVantage" + "falls 13.6% after revenue drops
 * 22%". Null when the reason is in neither shape, or when its words point the
 * other way from the move (a "rally" on a day it fell).
 */
export type MoveSentenceOptions = {
  withPct?: boolean;
  /**
   * The company the move belongs to (its name and ticker). When given, the
   * reason's subject must be that company: "Oil prices jump after an OPEC cut"
   * on an oil stock's row is about oil, and must not become "XOM jumps 3%".
   */
  company?: { name?: string | null; ticker?: string | null };
};

/** Whether a reason's subject ("Hims & Hers", "Take-Two") is the company named by `company`. */
function isSameCompany(subject: string, company: NonNullable<MoveSentenceOptions["company"]>): boolean {
  const first = (text: string) => text.trim().toLowerCase().replace(/['\u2019]s$/, "").split(/\s+/)[0] ?? "";
  const head = first(subject);
  if (!head) return false;
  const ticker = (company.ticker ?? "").trim().toLowerCase();
  if (ticker && head === ticker) return true;
  const name = first(company.name ?? "");
  return Boolean(name) && (head === name || (head.length >= 4 && name.startsWith(head)) || (name.length >= 4 && head.startsWith(name)));
}

export function splitMoveReason(reason: string | null | undefined, pct: number | null | undefined, options: MoveSentenceOptions = {}): MoveSentence | null {
  const split = splitMoveReasonLoose(reason, pct, options);
  if (split && options.company && !isSameCompany(split.subject, options.company)) return null;
  return split;
}

function splitMoveReasonLoose(reason: string | null | undefined, pct: number | null | undefined, options: MoveSentenceOptions): MoveSentence | null {
  const text = (reason ?? "").trim().replace(/\s+/g, " ");
  if (!text || pct == null || !Number.isFinite(pct) || pct === 0) return null;
  const up = pct > 0;
  const size = options.withPct ? ` ${Math.abs(pct).toFixed(1)}%` : "";
  const cause = CAUSE_FIRST.exec(text);
  if (cause) {
    const [, why, verb, subject, noun] = cause as unknown as [string, string, string, string, string];
    const said = [verb.toLowerCase(), noun.toLowerCase()];
    if (said.some((word) => (up ? CAUSE_VERB_DOWN.includes(word) || MOVE_NOUN_DOWN.includes(word) : CAUSE_VERB_UP.includes(word) || MOVE_NOUN_UP.includes(word)))) return null;
    // "Earnings ..." reads mid-sentence as "earnings ..."; an acronym ("GTA VI", "FDA") keeps its capitals.
    const after = /^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why;
    return { subject: subject.trim(), predicate: `${up ? "rose" : "fell"}${size} after ${after}` };
  }
  const first = COMPANY_FIRST.exec(text);
  if (first) {
    const [, subject, verb, rest] = first as unknown as [string, string, string, string];
    const word = verb.toLowerCase();
    if (up ? MOVE_VERB_DOWN.includes(word) : MOVE_VERB_UP.includes(word)) return null;
    // A subject with a verb of its own in it is a clause, not a company ("Analyst lowers Serve Robotics ...").
    if (/\s(?:lowers|raises|cuts|says|warns|reports|beats|misses|announces)\s/i.test(` ${subject} `)) return null;
    // A reason that already gives its size ("rose 8% after ...") keeps it rather than saying two numbers.
    return { subject: subject.trim(), predicate: `${word}${/^[+−-]?\d/.test(rest) ? "" : size} ${rest}` };
  }
  return null;
}

/**
 * The same, as one sentence (no full stop): "Hims & Hers fell 16.5% after
 * earnings that missed expectations and a weaker forecast". Null when
 * `splitMoveReason` cannot read the reason.
 */
export function companyFirstMove(reason: string | null | undefined, pct: number | null | undefined, options: MoveSentenceOptions = {}): string | null {
  const split = splitMoveReason(reason, pct, options);
  return split ? `${split.subject} ${split.predicate}` : null;
}
