import { anomalyHeadline } from "@/components/daily-anomalies-shared";
import { usableReplacement } from "@/lib/briefing-groups";
import { asSentence, companyFirstMove, firstFullSentence, hasTitleCaseLeftover, plainFinance, sentenceCase } from "@/lib/plain-copy";

/**
 * Common words a feed capitalises in a headline ("Thacker Pass Cost Increase", "Jefferies Buy Rating"). Only these
 * lose their capital in a sentence that still reads like a headline: a name ("Thacker Pass", "Jefferies") never does,
 * since a lowercased name reads worse than a capital too many.
 */
const COMMON = new Set(
  (
    "cost costs increase increases buy sell hold rating ratings upgrade upgrades downgrade downgrades target targets price prices " +
    "earnings results revenue revenues sales profit profits loss losses guidance outlook forecast forecasts demand supply deal deals " +
    "contract contracts order orders preorders spending rally selloff surge surges plunge plunges jump jumps drop drops gain gains " +
    "rise rises fall falls climb climbs slide slides boost boosts lifts sends sparks drives weighs record growth report reports " +
    "quarter quarterly annual strong weak weaker stronger higher lower better worse expectations estimates update launch approval " +
    "trial data partnership acquisition merger offering split lawsuit probe investigation plan plans rebound decline shares stock " +
    "stocks news concerns fears hopes optimism beat beats miss misses cut cuts raise raises hike hikes"
  ).split(" "),
);

/** "Lithium Americas fell after Thacker Pass Cost Increase." → "… after Thacker Pass cost increase." */
function lowerCommonWords(text: string, companyName: string): string {
  const own = new Set(companyName.toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean));
  const words = text.split(/(\s+)/);
  return words
    .map((raw, index) => {
      // The first word starts the sentence; the spaces between words stay as they are.
      if (index === 0 || index % 2 === 1) return raw;
      const bare = raw.replace(/^["“(]+|["”),.;:!?]+$/g, "");
      if (!/^[A-Z][a-z]+$/.test(bare) || own.has(bare.toLowerCase()) || !COMMON.has(bare.toLowerCase())) return raw;
      return raw.replace(bare, bare.toLowerCase());
    })
    .join("");
}

/** The reason as a whole sentence: "CoreWeave raises its forecast as AI demand and capacity strengthen." */
function fullStop(text: string): string {
  const value = text.trim();
  return !value || /[.!?…"”)]$/.test(value) ? value : `${value}.`;
}

/**
 * A move's reason in plain words, company first when the feed wrote the cause first ("Zeta rose after strong
 * earnings"), always ending with a full stop. Market today, the home page and the landing feed all word a move this
 * way, so one stock reads the same on each of them.
 */
export function moveLine(item: { ticker: string; name: string; day_change_pct: number } & Parameters<typeof anomalyHeadline>[0]): string {
  // Feeds write some reasons in Title Case ("GTA VI Preorders Spark Take-Two's Rebound"); read them as a sentence.
  const said = plainFinance(sentenceCase(anomalyHeadline(item), item.name));
  const turned = companyFirstMove(said.replace(/\.$/, ""), item.day_change_pct, { company: { name: item.name, ticker: item.ticker } });
  const line = turned ? `${turned}.` : said;
  if (!hasTitleCaseLeftover(line, item.name)) return analystLine(fullStop(line));
  // Still a headline ("Take-Two rose after GTA VI Preorders"): the reason's own first sentence says it whole, or else the
  // headline's common words lose their capitals.
  const detail = asSentence(firstFullSentence((item.move_explanation?.why_it_matters ?? "").replace(/\s+/g, " ")));
  return analystLine(fullStop(usableReplacement(detail, { name: item.name, ticker: item.ticker }) ? detail : lowerCommonWords(line, item.name ?? "")));
}

/** Most words in a reason built from analysts' actions (owner rule 8: a card line is at most 15 words). */
export const ANALYST_LINE_WORDS = 15;

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// An analyst's action: a rating change, a new rating, or a price target moved.
const RATING = /\b(?:upgrad(?:ed|es|ing)|downgrad(?:ed|es|ing)|initiat(?:ed|es)|reiterat(?:ed|es)|started coverage|resumed coverage)\b/i;
const TARGET_MOVE = /\b(?:rais(?:ed|es|ing)|lift(?:ed|s|ing)|boost(?:ed|s|ing)|hik(?:ed|es|ing)|increas(?:ed|es|ing)|cut(?:s|ting)?|lower(?:ed|s|ing)|reduc(?:ed|es|ing)|trimm(?:ed|ing)|trims|slash(?:ed|es|ing))\b[^,;]*?\bprice targets?\b/i;
const ACTION = new RegExp(`${RATING.source}|${TARGET_MOVE.source}`, "i");
// A price level: "$82", "$1,072.50" (never the comma after it).
const LEVEL = String.raw`\$\d(?:[\d.,]*\d)?`;

/**
 * The reason behind a move told through analysts, within 15 words, keeping each action (the upgrade, the price target
 * moved) and leaving out what they cited: "William Blair upgraded AMD to Outperform, while Bank of America raised its
 * 2027 price target and cited a strengthening Zen 6 roadmap." becomes "William Blair upgraded AMD to Outperform, while
 * Bank of America raised its 2027 price target." A reason that is not about analysts, that is already short enough,
 * or whose first clause is some other cause (results, a deal) is returned as it is, so the main reason is never
 * dropped; one that cannot keep every action within the limit keeps the first action whole.
 */
export function analystLine(line: string): string {
  const text = line.replace(/\s+/g, " ").trim();
  if (wordsOf(text) <= ANALYST_LINE_WORDS || !ACTION.test(text)) return text;
  const body = text.replace(/[.!]$/, "");
  // Clauses joined by ", while", ", and", "; ", a bare " while ", or a comma before another firm's action ("…, Bank of
  // America raised …"); a comma inside a list of firms ("Goldman, Morgan Stanley and UBS raised …") is not a break.
  const pieces = body.split(/(,\s+(?:while|and|as|but)\s+|;\s+|\s+while\s+|,\s+(?=(?:[A-Z][\w&.'’-]*\s+){1,4}(?:also\s+)?(?:upgrad|downgrad|rais|lift|boost|hik|increas|cut|lower|reduc|trim|slash|initiat|reiterat)))/);
  const clauses: Array<{ joiner: string; text: string }> = [];
  for (let index = 0; index < pieces.length; index += 2) clauses.push({ joiner: index === 0 ? "" : pieces[index - 1]!, text: pieces[index]! });
  // The lead clause must itself be an analyst's action: "Nvidia rose after record revenue, while analysts raised …"
  // is about the revenue first.
  if (!ACTION.test(clauses[0]!.text)) return text;
  const kept = clauses
    .filter((clause) => ACTION.test(clause.text))
    .map((clause) => ({ ...clause, text: actionOnly(clause.text) }));
  if (kept.length === 0) return text;
  const join = (list: typeof kept) => list.map((clause, index) => (index === 0 ? clause.text : `${clause.joiner}${clause.text}`)).join("");
  // What gives way first: a year on the target ("its 2027 price target"), then the target's new level ("to $82").
  const noYear = (text: string) => text.replace(/\b(its|the|their)\s+(?:19|20)\d\d\s+(price targets?|targets?)/i, "$1 $2");
  const noLevel = (text: string) => text.replace(new RegExp(String.raw`\s+(?:from\s+${LEVEL}\s+)?to\s+${LEVEL}$`, "i"), "");
  const tries = [
    join(kept),
    join(kept.map((clause) => ({ ...clause, text: noYear(clause.text) }))),
    join(kept.map((clause) => ({ ...clause, text: noLevel(noYear(clause.text)) }))),
    kept[0]!.text,
  ];
  const fit = tries.find((candidate) => wordsOf(candidate) <= ANALYST_LINE_WORDS);
  return fit ? `${fit.charAt(0).toUpperCase()}${fit.slice(1)}.` : text;
}

/** An action without what came with it: "raised its target and cited a strong roadmap" → "raised its target". */
function actionOnly(clause: string): string {
  const match = ACTION.exec(clause);
  if (!match) return clause.trim();
  const from = match.index + match[0].length;
  const rest = clause.slice(from);
  // A target move ends at the target, keeping only its new level: "cut its price target on the miner to $4" → "cut its
  // price target to $4".
  if (TARGET_MOVE.test(match[0])) {
    const level = new RegExp(String.raw`^(?:\s+(?:on|for)\s+(?:[\w.&'’-]+\s+){1,3}?)?\s*((?:from\s+${LEVEL}\s+)?to\s+${LEVEL})`, "i").exec(rest);
    return `${clause.slice(0, from).trim()}${level ? ` ${level[1]}` : ""}`;
  }
  // What it cited or why: "and cited …", "citing …", "on …", "after …", "amid …", "as …", "following …".
  const stop = rest.search(/\s+(?:and\s+(?:cited|said|noted|pointed|highlighted|flagged|praised|called)|citing|on\s+(?:hopes|expectations|optimism|potential|concerns|strong|a\s+strong|its\s+(?!price))|after|amid|as|following|because|due\s+to|thanks\s+to)\b/i);
  return (stop >= 0 ? clause.slice(0, from + stop) : clause).replace(/[\s,;:]+$/, "").trim();
}
