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

/** A headline or reason ready to read: Title Case undone and a closing full stop. */
export function asSentence(text: string | null | undefined): string {
  const value = sentenceCase(text).replace(/\s*[.…]+$/, "");
  if (!value) return "";
  return /[!?]$/.test(value) ? value : `${value}.`;
}

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
