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
    "up upgrade upgrades downgrade downgraded upgraded preview expect grow grows growing reveals unveils launches launch hits high highs lows warns warning amid analyst analysts says said could would should after-hours premarket today tomorrow shareholders dividend dividends acquisition acquire acquires buy-out merger split splits  downgrades users view weak weaker week what when while why will with year years yet " +
    // Words wire headlines put in Title Case that are rarely part of a name (the news page, Nov 11). Not "holdings",
    // "ratings", "major", "reduction" or "inflation": Arm Holdings, Fitch Ratings, Major League Baseball, the Inflation Reduction Act.
    "actually affair again aims alleged approval bought businesswoman complicates concern concerns debate decline driven " +
    "dropped each every expanded faces facts fallout far fell financing further governance heighten here here's highlights " +
    "hiding hot important interest invested jumped keeps know lawsuit leans lift margin million " +
    "much pile placement privacy rebound rebounds reckoning recovery reversal scrutiny selloff " +
    "shrugs sink sinks sank snapshot sold spy sticky still stir summary surprising test tied transcript trillion " +
    "underneath valuation went wins worries worth"
  )
    .split(" ")
    .filter(Boolean),
);

/** True when most words of a headline start with a capital: "Zeta Raises Outlook After Strong Q3 Earnings Beat". */
export function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word) && word.length > 3);
  if (words.length < 3) return false;
  const capped = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capped / words.length >= 0.75;
}

// More headline words that are almost never part of a name (the news page, Nov 11: "IREN stock falls Even as
// JPMorgan Goes Bullish", "Semiconductor rally Drives SOXL higher", "$450 million Investment").
for (const word of (
  "approve approves approved plant plants even go goes going went gone drives drove wind winds pivot pivots bullish bearish investment investments " +
  "set sets reach reaches weigh weighs lag lags tops tumble tumbles spike spikes extend extends shed sheds add adds eye " +
  "eyes mull mulls near nears seek seeks spark sparks fuel fuels signals bet bets bid bids hope hopes push " +
  "pushes pull pulls pressure pressures stay stays remain remains turn turns look looks head heads return returns come " +
  "comes take takes taking took continue continues ramp ramps shift shifts delay delays hire hires pick picks tap taps " +
  "join joins leave leaves exit exits enter enters open opens closed recover recovers struggle struggles investor " +
  "trader traders buyers sellers margins shortage deal talks probe probes charges fine " +
  "fines ruling tariff tariffs tax taxes jobs layoffs workers spending slowdown recession fear risk risks worry " +
  "premium discount crash level levels month months days daily weekly session sessions executive executives " +
  "founder billionaire update updates story stories amid above below again just still soon now yet over under " +
  "despite since until about against toward towards ahead behind inside outside within without new huge massive " +
  "sharp sharply steep steeply nearly early likely really very quick quickly slow slowly " +
  // More from the news page on Nov 11 ("Citi sees over 200% Upside", "chip rally Fades and PC slump Clouds Q4").
  "upside downside advance advances overnight defend defends fade fades clouds money private achieve achieves peak " +
  "lease withstand boom number backlog anyway answer load so doing does do did owe owes historic two three " +
  "models work works finds find helps help known build builds run runs production platform database " +
  "scales centers processors hours time term long short got dream dreams unit units isn't aren't won't can't don't doesn't there " +
  // Most talked about on the news page, Nov 11 ("no Longer the Bundler", "could Kick off a 'new Decade'", "cash Burn").
  "longer away kick kicks kicked decade decades burn burns burning bundler bundle bundles supplier suppliers right problem problems revive revives emerge emerges subscriber subscribers ask asks whether keep wants want break breaks network capacity gas summer " +
  // The stock page's "What changed", Nov 11 ("Here's How Much You Would Have Made Owning JPMorgan Chase Stock In The
  // Last 5 Years", "JPMorgan Partners With OpenAI: What It Means", "Takes Lead Role", "85 Cents on the Dollar").
  // "dollar" and "partners" are not here: they are often part of a name ("Dollar General", "Enterprise Products
  // Partners"), so they are lowered only away from one (NAME_PRONE below).
  // Not "our", "value" or "option": names use them ("Option Care Health", "Value Line").
  "you your yours we they them made owning owns role roles cents cent last means mean was were " +
  "undervalued overvalued attracting attention distributions increase increases need needs " +
  "unlock unlocks remodel remodels retirees seeking"
).split(" ")) {
  if (word) COMMON.add(word);
}

// Names a headline writes with a capital that the word lists or endings below would otherwise lower: people, brands
// and places that show up in market news. Lowercase; a word listed here always keeps its capital.
const KNOWN_NAMES = new Set(
  (
    "jensen huang powell waller trump biden musk altman buffett dimon zuckerberg bezos cook nadella pichai xi " +
    "nvidia tesla apple microsoft amazon google alphabet meta openai anthropic jpmorgan goldman sachs morgan stanley " +
    "wall street fed treasury cybertruck robotaxi optimus iphone android windows azure aws gemini claude chatgpt " +
    "boeing corning sterling viking kering united allied constellation guinness beijing nanjing chongqing peking take-two coca-cola rolls-royce " +
    "kimberly beverly china chinese japan japanese europe european america american congress senate white house"
  ).split(" "),
);

// Small words in a company's legal name that are ordinary words in a headline ("Bank of America Corporation").
const OWN_NAME_SMALL_WORDS = new Set(["a", "an", "and", "of", "the", "for", "in", "on", "inc", "corp", "co", "company", "corporation", "ltd", "plc", "group", "holdings"]);

// Endings of common words ("Following", "Investment", "Slashed", "Sharply"). A word with one of these endings is
// lowered only when no unknown capitalised word stands beside it, since that pair may be a name ("Constellation
// Energy", "United Airlines"); a lowercased name reads worse than one capital too many.
// Ordinary words that are often part of a company's name: lowered like a common-ending word, only when no unknown
// capitalised word stands beside them ("85 cents on the Dollar", "JPMorgan Partners With OpenAI", "the Better Value
// Option", but "Dollar General", "Brookfield Renewable Partners", "Option Care Health").
const NAME_PRONE = new Set(["dollar", "dollars", "partner", "partners", "value", "option", "options"]);

const COMMON_ENDING = /^[a-z]{3,}(?:ing|ments?|tions?|sions?|ness)$|^[a-z]{4,}(?:ed|ly)$/;

// A wire service's desk tag in front of a headline ("Analysis-", "EXCLUSIVE:", "UPDATE 2-", "BREAKINGVIEWS-").
const SOURCE_TAG =
  /^(?:analysis|exclusive|update(?:\s*\d+)?|refile|corrected|correction|breakingviews|factbox|explainer|insight|wrapup(?:\s*\d+)?|instant\s+view|fact\s*check)\s*(?:-|–|—|:)\s*/i;

/**
 * A source headline without the wire desk's tag in front (owner rule 8): "Analysis-Nvidia's clubby board faces a
 * test" reads "Nvidia's clubby board faces a test", "UPDATE 2-EXCLUSIVE-Apple..." reads "Apple...". The tag needs
 * its dash or colon, so a headline that starts with the word ("Analysis shows...", "Live Nation") is left alone.
 */
export function withoutSourceTag(text: string | null | undefined): string {
  let value = (text ?? "").trim();
  let stripped = false;
  for (let guard = 0; guard < 4; guard += 1) {
    const tag = SOURCE_TAG.exec(value);
    // What follows the tag starts a headline: a capital, a figure, a quote or a brand like "eBay" ("Insight-driven"
    // is a word, not a tag).
    if (!tag || !/^(?:["“‘'$A-Z0-9]|[a-z][A-Z])/.test(value.slice(tag[0].length))) break;
    value = value.slice(tag[0].length);
    stripped = true;
  }
  // Only a headline that lost its tag gets a capital, and never a brand that starts lowercase ("eBay", "iPhone").
  return stripped && value && !/^[a-z][A-Z]/.test(value) ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * A Title Case headline written as a sentence. Leaves anything that is not Title Case alone. Keeps the first word,
 * the word after a colon, acronyms and tickers (AI, Q3, SOXL), words with inner capitals (iPhone, JPMorgan), the
 * words of `companyName` (the row's own company) and known names (Powell, Nvidia, Wall Street). Every other word is
 * lowered when it is on the common-word list, or when it has a common ending and no unknown capitalised word beside it.
 */
export function sentenceCase(text: string | null | undefined, companyName = ""): string {
  const value = withoutSourceTag(text).replace(/\s+/g, " ");
  if (!value || !isTitleCase(value)) return value;
  // The company's own words keep their capitals, but not its small words: "Bank of America" must not keep "Of".
  const own = new Set(
    companyName
      .toLowerCase()
      .split(/[^a-z0-9'’&-]+/)
      .filter((part) => part && !OWN_NAME_SMALL_WORDS.has(part)),
  );
  // An apostrophe belongs to a word only inside it ("Isn't", "Nvidia's"), never a closing quote ("'New Decade'").
  const tokens = [...value.matchAll(/[A-Za-z](?:[A-Za-z]|['’](?=[A-Za-z]))*/g)].map((match) => ({ word: match[0], offset: match.index ?? 0 }));
  const bareOf = (word: string) => word.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");
  // A capitalised word nothing above knows: possibly a name, so a common-ending word beside it keeps its capital.
  const unknownName = (word: string | undefined) => {
    if (!word || !/^[A-Z][a-z'’]+$/.test(word)) return false;
    const bare = bareOf(word);
    return !COMMON.has(bare) && !KNOWN_NAMES.has(bare) && !own.has(bare) && !own.has(word.toLowerCase()) && !COMMON_ENDING.test(bare);
  };
  // Capitalised words joined by hyphens: lowered together when every part is a common word ("Better-Than-Expected",
  // "All-Time") or they follow a number ("61-Year-Old"), otherwise kept as written, since such a compound is usually
  // a name ("Take-Two", "Coca-Cola").
  const compound: Array<"keep" | "lower" | null> = tokens.map(() => null);
  for (let start = 0; start < tokens.length; ) {
    let end = start;
    while (
      end + 1 < tokens.length &&
      value.slice(tokens[end]!.offset + tokens[end]!.word.length, tokens[end + 1]!.offset) === "-" &&
      /^[A-Z]/.test(tokens[end]!.word) &&
      /^[A-Z]/.test(tokens[end + 1]!.word)
    )
      end += 1;
    if (end > start) {
      const parts = tokens.slice(start, end + 1).map((token) => bareOf(token.word));
      // After a number ("61-Year-Old", "52-Week-High") it is a measure, not a name.
      const afterNumber = /\d-$/.test(value.slice(0, tokens[start]!.offset));
      const name = !afterNumber && (KNOWN_NAMES.has(parts.join("-")) || own.has(parts.join("-")) || parts.some((part) => !COMMON.has(part)));
      for (let index = start; index <= end; index += 1) compound[index] = name ? "keep" : "lower";
    }
    start = end + 1;
  }
  const out: string[] = [];
  let cursor = 0;
  tokens.forEach(({ word, offset }, index) => {
    out.push(value.slice(cursor, offset));
    cursor = offset + word.length;
    // After a colon a new clause starts, as it would in a sentence.
    const before = value.slice(0, offset).trimEnd();
    const bare = bareOf(word);
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    const gapBefore = prev ? value.slice(prev.offset + prev.word.length, offset) : "";
    const gapAfter = next ? value.slice(cursor, next.offset) : "";
    // A word glued to digits is a name or a code ("Shift4", "Five9", "4Runner"), never an ordinary word.
    const glued = /^\d/.test(value.slice(cursor)) || /\d$/.test(value.slice(0, offset));
    const keep =
      index === 0 ||
      glued ||
      compound[index] === "keep" ||
      /[:.!?]$/.test(before) ||
      (word.length > 1 && word === word.toUpperCase()) ||
      /[A-Z]/.test(word.slice(1)) ||
      KNOWN_NAMES.has(bare) ||
      own.has(bare) ||
      own.has(word.toLowerCase()) ||
      // Beside an ampersand, a common word whose other side is a name is part of that name ("Applied Aerospace &
      // Defense"); between two common words ("Rises & Falls", "Revenue & Profit") it is lowered like any other.
      (/^ ?& ?$/.test(gapBefore) && /^[A-Z]/.test(prev?.word ?? "") && !COMMON.has(bareOf(prev?.word ?? ""))) ||
      (/^ ?& ?$/.test(gapAfter) && /^[A-Z]/.test(next?.word ?? "") && !COMMON.has(bareOf(next?.word ?? "")));
    if (keep) return out.push(word);
    if (COMMON.has(bare) || compound[index] === "lower") return out.push(word.toLowerCase());
    // Only neighbours joined by a space or hyphen count: "Following, Apple" is two clauses.
    const joinedPrev = prev && /^[\s-]+$/.test(gapBefore);
    const joinedNext = next && /^[\s-]+$/.test(gapAfter);
    const besideName = (joinedPrev && index - 1 > 0 && unknownName(prev.word)) || (joinedNext && unknownName(next.word));
    out.push((COMMON_ENDING.test(bare) || NAME_PRONE.has(bare)) && !besideName ? word.toLowerCase() : word);
  });
  out.push(value.slice(cursor));
  return out.join("");
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

const SURE_THEN: Record<string, string> = { high: "we were quite sure of it", medium: "we were fairly sure of it", med: "we were fairly sure of it", low: "we were not very sure of it" };

/**
 * "We're fairly sure of this for the next few weeks." from the call's confidence and horizon words. Pass
 * `writtenOn` ("Sep 22") for a call written weeks ago: "the next few weeks" then dates it instead of promising
 * weeks from today ("When we wrote this on Sep 22, we were fairly sure of it for the next few weeks.").
 */
export function callMetaLine(confidence: string | null | undefined, horizon: string | null | undefined, writtenOn?: string | null): string {
  const conf = (confidence ?? "").trim().toLowerCase();
  const span = (horizon ?? "").trim().toLowerCase();
  const when = span ? HORIZONS[span] ?? span : "";
  if (writtenOn) {
    const then = conf ? SURE_THEN[conf] : "";
    if (then) return `When we wrote this on ${writtenOn}, ${then}${when ? ` for ${when}` : ""}.`;
    if (when) return `Written on ${writtenOn} for ${when}.`;
    return "";
  }
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
  // A missing reason is not said at all (owner, Nov 11): the clause is dropped.
  [/,?\s+without (?:a )?(?:verified|confirmed|clear) catalyst\b/gi, ""],
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
    // "Earnings ..." reads mid-sentence as "earnings ..."; an acronym ("GTA VI", "FDA") keeps its capitals, and so
    // does a name: one that runs on in capitals ("Jefferies Buy rating", "Thacker Pass cost") or owns something
    // ("Nvidia's order").
    const name = /^[A-Z][a-z'’-]*(?:['’]s)?\s+[A-Z]/.test(why) || /^[A-Z][a-z]*['’]s\b/.test(why);
    const after = /^[A-Z][a-z]/.test(why) && !name ? why.charAt(0).toLowerCase() + why.slice(1) : why;
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

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Small counts in words ("five"), as a sentence says them; larger ones as digits. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

const DAY_OR_MONTH = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/;

/**
 * True when a sentence still carries a headline's capitals after the first word: "Take-Two rose after GTA VI
 * Preorders" (a feed title turned company first). Acronyms (GTA, VI), words with inner capitals (iPhone) and
 * the words of the company's own name do not count. Proper nouns do, so a caller should only swap in another
 * sentence when it has a whole one to hand.
 */
export function hasTitleCaseLeftover(text: string | null | undefined, companyName = ""): boolean {
  const own = new Set(companyName.toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
  const words = (text ?? "").trim().split(/\s+/);
  // A run of capitalized words (acronyms included) holding a Title Case word that is not the company's own,
  // a day or a month: "GTA VI Preorders". One proper noun on its own ("as Microsoft spending grew") is a
  // sentence, not a headline, so it does not count.
  let run: { title: boolean; length: number } = { title: false, length: 0 };
  for (let index = 1; index < words.length; index += 1) {
    const raw = words[index]!;
    const word = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
    const startsSentence = /[.!?]$/.test(words[index - 1] ?? "");
    const capital = /^[A-Z]/.test(word) && !startsSentence;
    if (!capital) {
      run = { title: false, length: 0 };
      continue;
    }
    const bare = word.toLowerCase().replace(/['’]s$/, "");
    const title = /^[A-Z][a-z’'-]+$/.test(word) && !own.has(bare) && !own.has(word.toLowerCase()) && !DAY_OR_MONTH.test(word);
    run = { title: run.title || title, length: run.length + 1 };
    if (run.title && run.length >= 2) return true;
    if (/[,.;:!?)]$/.test(raw)) run = { title: false, length: 0 };
  }
  return false;
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

// Words a scraped headline leaves capitalised mid-sentence that are almost never part of a name ("Nvidia's Board
// is reportedly planning to Oust Jensen Huang", "QQQ Holders Feel it even If they Never trade", "looks Like a
// Bargain"). Only `mixedCase` reads this list, so a Title Case headline's casing elsewhere stays as it was.
const MIXED_COMMON = new Set(
  (
    "board boards oust ousts ousted employee employees staff misconduct investigation investigations allegation allegations " +
    "affair affairs scandal resignation removal remove removes removed replace replaces replaced fire fires fired fraud " +
    "spying sue sues sued like likes unlike bargain bargains cheap cheaper pricey expensive fair holders holder owners owner " +
    "feel feels felt think thinks thought tell tells told put puts let lets lose loses lost won win never ever always often " +
    "already almost enough too if unless though although per via versus onto upon around beyond few many several small " +
    "smaller large larger good bad worse worst great little opportunity chance reason reasons way ways thing things " +
    "everything nothing something anything everyone nobody people reshuffle reshuffles reshuffled rebalance rebalances " +
    "these those he she his her who whom whose which where our it's prepare prepares prepared plan plans planning consider considers considering weigh weighs weighing seek seeking"
  ).split(" "),
);

// Common words that are also brands ("Target", "Best Buy"): `mixedCase` leaves their capital alone, since in an
// ordinary sentence a capital on them usually means the company.
const MIXED_NAME_RISK = new Set(["target", "best", "gap", "block", "visa", "snap", "square", "match", "chewy", "shift"]);

const AUXILIARY = new Set(["will", "to", "would", "could", "may", "might", "can", "cannot", "not", "won't", "should", "must"]);

/**
 * A brand-risk word used as the ordinary word, judged from its neighbours: "price Target", "will Block", "to Match",
 * "Gap up". Lowered even when that brand is a company on the page.
 */
function brandUsedAsWord(bare: string, prev: string | undefined, next: string | undefined): boolean {
  const before = (prev ?? "").toLowerCase().replace(/’/g, "'");
  const after = (next ?? "").toLowerCase();
  if (bare === "target") return before === "price" || before === "sales" || before === "earnings";
  if (bare === "gap" && ["up", "down", "higher", "lower"].includes(after)) return true;
  if (["block", "gap", "match", "shift", "snap", "square"].includes(bare)) return AUXILIARY.has(before);
  return false;
}

/** True for a common word that is also a brand ("Target", "Best"): left capitalised by `mixedCase` and its callers. */
export function isBrandWord(word: string): boolean {
  return MIXED_NAME_RISK.has(word.toLowerCase().replace(/['’]s$/, ""));
}

/**
 * A headline that is neither Title Case nor a sentence, with its stray capitals lowered (owner rule 8): "Caterpillar
 * (CAT) stock looks Like a Bargain on its 222% run" -> "... looks like a bargain on its 222% run". `sentenceCase`
 * handles a whole Title Case headline; this handles what it leaves alone. Conservative with names: a word keeps its
 * capital unless it is on a common-word list (or has a common ending), and it always keeps it when it is the first
 * word, starts a clause (after a colon, a full stop, an opening bracket or quote), is an acronym, has an inner capital,
 * is glued to digits or joined by a hyphen, is a known name, a day or month, a word of `companyName` or of any of
 * `names` (the other companies on the page), or sits beside a capitalised word nothing here knows (that pair may be a
 * name: "The Trade Desk", "Five Below").
 */
export function mixedCase(text: string | null | undefined, companyName = "", names: Iterable<string> = []): string {
  const value = text ?? "";
  if (!value.trim() || isTitleCase(value)) return value;
  return withNamesMasked(value, names, (masked) => lowerStrays(masked, companyName));
}

/**
 * Runs `fix` with every whole name of `names` in the text swapped for a placeholder that reads as an unknown name,
 * then puts the names back as the text wrote them. A name protects only itself, as a phrase ("Best Buy", "Five
 * Below"), and the words beside it keep their capitals as they would beside any name; a lone "Buy" or "Below"
 * elsewhere is an ordinary word.
 */
function withNamesMasked(value: string, names: Iterable<string>, fix: (masked: string) => string): string {
  const phrases = [...new Set([...names].map((name) => shortCompanyName(name)).filter((name) => name.length >= 3 && /[A-Za-z]/.test(name)))].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  let masked = value;
  for (const phrase of phrases) {
    const re = new RegExp(`(?<![A-Za-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "gi");
    masked = masked.replace(re, (match: string, offset: number, whole: string) => {
      // A one-word brand used as the ordinary word ("price Target", "will Block") is not the company.
      if (!/\s/.test(phrase) && MIXED_NAME_RISK.has(phrase.toLowerCase())) {
        const prev = whole.slice(0, offset).match(/([A-Za-z'’]+)\W*$/)?.[1];
        const next = whole.slice(offset + match.length).match(/^\W*([A-Za-z'’]+)/)?.[1];
        if (brandUsedAsWord(phrase.toLowerCase(), prev, next)) return match;
      }
      found.push(match);
      return placeholder(found.length - 1);
    });
  }
  if (found.length === 0) return fix(value);
  return fix(masked).replace(/Qzxq([a-z]+)\b/g, (whole, code: string) => found[placeholderIndex(code)] ?? whole);
}

/** "Qzxqa", "Qzxqb", …: a capitalised word no list knows, so casing treats it like a name. */
function placeholder(index: number): string {
  let code = "";
  let rest = index;
  do {
    code = String.fromCharCode(97 + (rest % 26)) + code;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return `Qzxq${code}`;
}

function placeholderIndex(code: string): number {
  let index = 0;
  for (const letter of code) index = index * 26 + (letter.charCodeAt(0) - 96);
  return index - 1;
}

/** `mixedCase` without its Title Case gate: lowers the stray common words of any text. */
function lowerStrays(value: string, companyName: string): string {
  const own = new Set<string>();
  for (const part of companyName.toLowerCase().split(/[^a-z0-9'’&-]+/)) if (part && !OWN_NAME_SMALL_WORDS.has(part)) own.add(part.replace(/['’]s$/, ""));
  const tokens = [...value.matchAll(/[A-Za-z](?:[A-Za-z]|['’](?=[A-Za-z]))*/g)].map((match) => ({ word: match[0], offset: match.index ?? 0 }));
  const bareOf = (word: string) => word.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");
  const titled = (word: string) => /^[A-Z][a-z]+(?:['’]s)?$/.test(word);
  // A masked name (withNamesMasked) counts as a known name: the words beside it are judged on their own.
  const named = (bare: string, word: string) => KNOWN_NAMES.has(bare) || own.has(bare) || /^qzxq[a-z]+$/.test(bare) || Object.hasOwn(NAME_WORDS, bare) || DAY_OR_MONTH.test(word.replace(/['’]s$/, ""));
  const listed = (bare: string) => COMMON.has(bare) || MIXED_COMMON.has(bare);
  // A capitalised word nothing here knows: possibly part of a name, so a common word beside it keeps its capital.
  const unknown = (word: string | undefined) => {
    if (!word || !titled(word)) return false;
    const bare = bareOf(word);
    if (MIXED_NAME_RISK.has(bare)) return true;
    return !listed(bare) && !named(bare, word) && !COMMON_ENDING.test(bare) && !NAME_PRONE.has(bare);
  };
  // Per word: "keep", "lower", or "name" (kept only because it stands beside a word that may be a name).
  const decision = tokens.map(({ word, offset }, index): "keep" | "lower" | "name" => {
    const end = offset + word.length;
    const bare = bareOf(word);
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    if (index > 0 && titled(word) && MIXED_NAME_RISK.has(bare) && brandUsedAsWord(bare, prev?.word, next?.word)) return "lower";
    const gapBefore = prev ? value.slice(prev.offset + prev.word.length, offset) : value.slice(0, offset);
    const gapAfter = next ? value.slice(end, next.offset) : "";
    const keep =
      index === 0 ||
      !titled(word) ||
      /[:.!?(“"‘'—–]\s*$/.test(gapBefore) ||
      /(?:^|\s)-{1,2}\s*$/.test(gapBefore) ||
      /\d$/.test(value.slice(0, offset)) ||
      /^\d/.test(value.slice(end)) ||
      gapBefore === "-" ||
      gapAfter === "-" ||
      named(bare, word) ||
      MIXED_NAME_RISK.has(bare);
    if (keep) return "keep";
    const common = listed(bare) || COMMON_ENDING.test(bare) || NAME_PRONE.has(bare);
    if (!common) return "keep";
    // The first word counts as a possible name too: "Best Buy shares jump", "Five Below's sales".
    const joinedPrev = Boolean(prev) && /^\s+$/.test(gapBefore);
    const joinedNext = Boolean(next) && /^\s+$/.test(gapAfter);
    return (joinedPrev && unknown(prev!.word)) || (joinedNext && unknown(next!.word)) ? "name" : "lower";
  });
  // A common word in front of one kept for a name is part of that name too ("shares of The Trade Desk").
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const gap = value.slice(tokens[index]!.offset + tokens[index]!.word.length, tokens[index + 1]!.offset);
    if (decision[index] === "lower" && decision[index + 1] === "name" && /^\s+$/.test(gap)) decision[index] = "name";
  }
  const out: string[] = [];
  let cursor = 0;
  tokens.forEach(({ word, offset }, index) => {
    out.push(value.slice(cursor, offset), decision[index] === "lower" ? word.toLowerCase() : word);
    cursor = offset + word.length;
  });
  out.push(value.slice(cursor));
  return out.join("");
}

/**
 * A source headline as a sentence, whatever casing it arrived in: a Title Case headline through `sentenceCase`,
 * then any capitals left over (or a mixed-case headline's strays) through `mixedCase`.
 */
export function headlineCase(text: string | null | undefined, companyName = "", names: Iterable<string> = []): string {
  const value = withoutSourceTag(text).replace(/\s+/g, " ");
  if (!value.trim()) return value;
  // Title Case is judged on the source as it came: once sentenceCase has run, the strays it left are lowered even
  // when most words still have capitals ("…as Board Reportedly prepares to Oust CEO Jensen Huang").
  const title = isTitleCase(value);
  return withNamesMasked(value, [companyName, ...names], (masked) => lowerStrays(title ? sentenceCase(masked, companyName) : masked, companyName));
}
