/**
 * What changed in a company's risk factors between two filings, by plain rules: no model reads, writes or rewords
 * anything. Every heading shown is the company's own sentence, copied from the filing.
 *
 * The steps:
 *   1. normalise each heading to its content words (lower case, punctuation off, possessives and plurals folded, stop
 *      words and the boilerplate every risk heading carries dropped, numbers kept);
 *   2. pair old and new headings: identical content words are the same risk; otherwise the closest pair by token
 *      similarity, taken greedily from the highest score down, one-to-one, counts as reworded when its score is at
 *      least MATCH_THRESHOLD;
 *   3. what is left is added (new side) or dropped (old side).
 *
 * The threshold. Similarity is the larger of the Dice score (2·shared / (a + b)) and 0.85 × containment (shared /
 * the smaller side), so a heading that gained or lost a clause ("We face intense competition" → "We face intense
 * competition, including from lower-cost generics") still pairs with itself. On the latest two 10-Ks of AAPL, NVDA,
 * AMD, SMCI, ASTS, LLY, TSLA, BBAI, OUST, LUNR, MSFT, KO, PLTR, RKLB, COST, BRK.B and SOFI (read Nov 2026), every pair
 * read by hand as one risk reworded scored 0.53 or more (the lowest: SMCI's delinquent SEC reports 0.53, TSLA's demand
 * for its vehicles 0.54, ASTS "Our proposed transaction with Ligado may not be consummated…" → "The Ligado Transaction
 * may not be consummated…" 0.57), while the closest pairs of a new and a dropped risk scored 0.48 and 0.47 (MSFT
 * splitting its cloud and outage risks into new ones), then 0.42 (SMCI's two different climate risks).
 * MATCH_THRESHOLD = 0.5 sits in that gap. Within one filing, distinct risks on one topic can score 0.5 to 0.85 (BBAI's
 * several debt risks), which is why word-for-word matches are paired first and every heading is used once.
 *
 * A 10-Q that lists only some risks often repeats, quarter after quarter, a risk it first added after the 10-K: those
 * are `repeated`, not `added`, once an earlier 10-Q against the same 10-K has listed them.
 *
 * A 10-K comparison needs at least MIN_HEADINGS_10K headings on both sides; anything less means the reading failed,
 * and the comparison is marked unreadable and shows nothing (a parsing failure is never reported as a change).
 *
 * 10-Qs: many list only the risks that changed since the 10-K ("except as set forth below, there have been no material
 * changes"), many say there were no changes, some only point back to the 10-K, and a few repeat the whole list. Each
 * is reported as what it is (classifyQuarter):
 *   - no_changes: the 10-Q says so and lists nothing;
 *   - none_listed: it lists nothing and only points to the 10-K;
 *   - partial: it lists some risks; they are compared with the latest 10-K's list (what the 10-Q refers to), so only
 *     risks with no counterpart there are called added, and nothing can be called dropped;
 *   - full: it repeats the whole list (at least FULL_SHARE of the 10-K's count); compared like a 10-K, with the
 *     filing before it.
 * Pure: safe anywhere.
 */

export type RiskForm = "10-K" | "10-Q";

/** One filing's place in a comparison. */
export type FilingRef = {
  form: RiskForm;
  accession: string;
  /** YYYY-MM-DD, the day SEC received it. */
  filed: string;
  /** The period it reports on, when SEC lists one. */
  period: string | null;
  /** The primary document on sec.gov. */
  url: string;
  /** How many risk headings were read from it; null when it was not read (a 10-Q's 10-K, named but not needed). */
  headings: number | null;
};

export type Reworded = { from: string; to: string; score: number };

export type ComparisonStatus = "changes" | "no_changes" | "none_listed" | "unreadable";

/** "full": both whole lists compared. "partial": a 10-Q that lists only some risks, held against the 10-K's list. */
export type ComparisonScope = "full" | "partial";

export type Comparison = {
  status: ComparisonStatus;
  scope: ComparisonScope | null;
  filing: FilingRef;
  /** The filing it is compared with; null when there is none to compare (no_changes and none_listed still name the 10-K when known). */
  base: FilingRef | null;
  /** New headings, in filing order, exactly as filed. */
  added: string[];
  /**
   * A partial 10-Q only: headings new since the 10-K that an earlier 10-Q against the same 10-K already added. They
   * are still new against the 10-K, but not news: no inbox line or proposal says them again.
   */
  repeated?: string[];
  /** Headings the base had and the new filing no longer has (full scope only), in the base's order. */
  dropped: string[];
  /** Pairs read as the same risk in new words, in the new filing's order. */
  reworded: Reworded[];
  /** Headings unchanged word for word (after normalising). */
  same: number;
  /** Why the comparison is unreadable, for logs: "few_headings_new", "few_headings_base", "no_section", "no_base", "not_required", "missed_list". */
  reason: string | null;
  /** When the job worked it out (ISO), set when stored: the inbox counts it as new from then. */
  compared_at?: string | null;
};

export const MATCH_THRESHOLD = 0.5;
/** Fewer headings than this in a 10-K means the reading failed. */
export const MIN_HEADINGS_10K = 5;
/** A 10-Q with at least this share of the 10-K's heading count repeats the whole list. */
export const FULL_SHARE = 0.6;
/** Containment counts for a little less than Dice: a short heading inside a long one is likely, not certain, the same risk. */
const CONTAINMENT_WEIGHT = 0.85;
/** Containment needs this many content words on the shorter side (or all of a three-word one): two shared words inside a long heading prove little. */
const CONTAINMENT_MIN_WORDS = 4;

/* ── normalising ────────────────────────────────────────────────────────── */

// Grammar words, plus the boilerplate of risk headings ("could materially and adversely affect our business, results of
// operations and financial condition"): every heading has them, so they say nothing about which risk it is. Negations
// ("not", "no", "nor", "never", "without") are kept: "we may not be able to" is a different risk from "we may be able to".
const STOP_WORDS = new Set(
  (
    "a an the and or but of to in on at for by with from as into onto over under upon about than then that this these those which who whom whose " +
    "it its it's itself we us our ours ourselves you your they them their there here is are was were be been being am has have had having do does did " +
    "will would shall should may might can could must any all each such other others some more most also only own same so very if when while " +
    "where whether because due including include includes included among against between through during within across certain " +
    "adverse adversely affect affects affected affecting material materially negative negatively impact impacts impacted harm harmed " +
    "result results business businesses operation operations financial condition conditions company company's"
  ).split(/\s+/),
);

/** "risks" → "risk", "liabilities" → "liability", "processes" → "process"; short words and "-ss" words are left alone. */
function fold(word: string): string {
  if (/^\d/.test(word) || word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:sses|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1);
  return word;
}

/** A heading's content words, in order: lower case, punctuation off, possessives and plurals folded, numbers kept. */
export function headingTokens(heading: string): string[] {
  return heading
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/'s\b/g, "")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[^a-z0-9.%$]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .map(fold);
}

/** The normalised form two headings must share to count as the same risk word for word. */
export function normaliseHeading(heading: string): string {
  return headingTokens(heading).join(" ");
}

/** Token similarity of two headings, 0 to 1: the larger of Dice and weighted containment, on sets of content words. */
export function similarity(a: string | readonly string[], b: string | readonly string[]): number {
  const left = new Set(typeof a === "string" ? headingTokens(a) : a);
  const right = new Set(typeof b === "string" ? headingTokens(b) : b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const dice = (2 * shared) / (left.size + right.size);
  const smaller = Math.min(left.size, right.size);
  // A short heading (three content words) counts as contained only when all of it is there.
  const containment = smaller >= CONTAINMENT_MIN_WORDS || (smaller >= 3 && shared === smaller) ? shared / smaller : 0;
  return Math.max(dice, CONTAINMENT_WEIGHT * containment);
}

/* ── diffing two lists ──────────────────────────────────────────────────── */

export type ListDiff = { added: string[]; dropped: string[]; reworded: Reworded[]; same: number };

/** Unique headings, first appearance kept, blanks out. */
function unique(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const heading = raw.replace(/\s+/g, " ").trim();
    const key = normaliseHeading(heading);
    if (!heading || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(heading);
  }
  return out;
}

/**
 * Old list against new. `partial`: the new list is only some of the risks, so nothing is called dropped. Pure and
 * deterministic: ties go to the earlier heading on each side.
 */
export function diffHeadings(before: readonly string[], after: readonly string[], options: { partial?: boolean; threshold?: number } = {}): ListDiff {
  const threshold = options.threshold ?? MATCH_THRESHOLD;
  const oldList = unique(before);
  const newList = unique(after);
  const oldKeys = oldList.map(normaliseHeading);
  const newKeys = newList.map(normaliseHeading);
  const oldTaken = new Array<boolean>(oldList.length).fill(false);
  const newMatch = new Array<number>(newList.length).fill(-1);
  let same = 0;

  // Word for word first.
  const byKey = new Map<string, number[]>();
  oldKeys.forEach((key, index) => byKey.set(key, [...(byKey.get(key) ?? []), index]));
  newKeys.forEach((key, index) => {
    const free = (byKey.get(key) ?? []).find((candidate) => !oldTaken[candidate]);
    if (free === undefined) return;
    oldTaken[free] = true;
    newMatch[index] = free;
    same += 1;
  });

  // Then the closest remaining pairs, best first.
  const oldTokens = oldList.map(headingTokens);
  const newTokens = newList.map(headingTokens);
  const pairs: Array<{ from: number; to: number; score: number }> = [];
  for (let to = 0; to < newList.length; to += 1) {
    if (newMatch[to] !== -1) continue;
    for (let from = 0; from < oldList.length; from += 1) {
      if (oldTaken[from]) continue;
      const score = similarity(oldTokens[from]!, newTokens[to]!);
      if (score >= threshold) pairs.push({ from, to, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.to - b.to || a.from - b.from);
  const reworded: Array<Reworded & { at: number }> = [];
  for (const pair of pairs) {
    if (oldTaken[pair.from] || newMatch[pair.to] !== -1) continue;
    oldTaken[pair.from] = true;
    newMatch[pair.to] = pair.from;
    reworded.push({ from: oldList[pair.from]!, to: newList[pair.to]!, score: Math.round(pair.score * 100) / 100, at: pair.to });
  }

  return {
    added: newList.filter((_, index) => newMatch[index] === -1),
    dropped: options.partial ? [] : oldList.filter((_, index) => !oldTaken[index]),
    reworded: reworded.sort((a, b) => a.at - b.at).map(({ from, to, score }) => ({ from, to, score })),
    same,
  };
}

/* ── comparisons ────────────────────────────────────────────────────────── */

/** What one filing's Item 1A gave (lib/research/edgar.ts readRiskList), with the filing it came from. */
export type RiskRead = {
  filing: Omit<FilingRef, "headings">;
  /** Whether Item 1A was found; null when the document was not read at all (only its place in the list is known). */
  found: boolean | null;
  headings: string[];
  intro: string | null;
};

/** A filing known only from SEC's list, not read: enough to name it as what a 10-Q refers to. */
export function unread(filing: Omit<FilingRef, "headings">): RiskRead {
  return { filing, found: null, headings: [], intro: null };
}

function ref(read: RiskRead): FilingRef {
  return { ...read.filing, headings: read.found === null ? null : read.headings.length };
}

/** A read with a whole list: found, and at least `min` headings. */
function readable(read: RiskRead | null, min = MIN_HEADINGS_10K): read is RiskRead {
  return Boolean(read && read.found === true && read.headings.length >= min);
}

function unreadable(read: RiskRead, base: RiskRead | null, reason: string): Comparison {
  return { status: "unreadable", scope: null, filing: ref(read), base: base ? ref(base) : null, added: [], dropped: [], reworded: [], same: 0, reason };
}

/** Two whole lists (10-K against 10-K, or a 10-Q that repeats the list against the filing before it). */
export function compareFull(read: RiskRead, base: RiskRead | null): Comparison {
  if (read.found !== true) return unreadable(read, base, "no_section");
  if (!base) return unreadable(read, null, "no_base");
  if (read.headings.length < MIN_HEADINGS_10K) return unreadable(read, base, "few_headings_new");
  if (!readable(base)) return unreadable(read, base, "few_headings_base");
  const diff = diffHeadings(base.headings, read.headings);
  return { status: "changes", scope: "full", filing: ref(read), base: ref(base), ...diff, reason: null };
}

// "There have been no material changes to the risk factors…", "…have not materially changed", "no significant changes".
const NO_CHANGES =
  /\bno (?:material|significant|other) changes?\b|\bnot been any material changes?\b|\bno material (?:modifications?|updates?)\b|\bhave not (?:been )?(?:materially|significantly) changed\b|\bremain(?:s)? (?:materially )?unchanged\b/i;
// A smaller reporting company may leave Item 1A out.
const NOT_REQUIRED = /\bsmaller reporting compan(?:y|ies)\b[^.]*\bnot required\b|\bnot required to provide\b|^\s*(?:not applicable|none)\.?\s*$/i;

// The 10-Q says it lists risks below; when none were read, the reading failed.
const LISTS_BELOW = /\bexcept\b|\bother than\b|\bset forth below\b|\bdescribed below\b|\blisted below\b|\bas follows\b|\bsupplement(?:s|ed)?\b|\bupdated?\b.*\bbelow\b/i;
/** lib/research/edgar.ts readRiskList cuts the intro at 1,200 characters. */
const INTRO_CAP = 1190;

export type QuarterKind = "no_changes" | "none_listed" | "partial" | "full" | "unreadable";

/** What kind of Item 1A a 10-Q has, given the count of the 10-K list it refers to. */
export function classifyQuarter(read: RiskRead, annualCount: number | null): QuarterKind {
  if (read.found !== true) return "unreadable";
  const intro = read.intro ?? "";
  if (read.headings.length === 0) {
    if (NOT_REQUIRED.test(intro)) return "unreadable";
    // "Except as set forth below…" with nothing read below it, or an intro that ran to its cap: the list was missed.
    if (LISTS_BELOW.test(intro) || intro.length >= INTRO_CAP) return "unreadable";
    return NO_CHANGES.test(intro) ? "no_changes" : "none_listed";
  }
  if (annualCount !== null && annualCount >= MIN_HEADINGS_10K && read.headings.length >= Math.max(MIN_HEADINGS_10K, FULL_SHARE * annualCount)) return "full";
  return "partial";
}

/** Why a 10-Q is unreadable: no Item 1A, a smaller company that need not list risks, or a list it says follows but was not read. */
function quarterReason(read: RiskRead): string {
  if (read.found !== true) return "no_section";
  return NOT_REQUIRED.test(read.intro ?? "") ? "not_required" : "missed_list";
}

/** Whether `heading` is one of `list` (the same words, or close enough to be the same risk reworded). */
function among(heading: string, list: readonly string[]): boolean {
  const key = normaliseHeading(heading);
  return list.some((entry) => normaliseHeading(entry) === key || similarity(entry, heading) >= MATCH_THRESHOLD);
}

/**
 * A 10-Q against what it refers to. `annual` is the latest 10-K before it; `previous` is the filing just before it
 * (a 10-Q or that 10-K), used only when the 10-Q repeats the whole list. `earlier` are the other 10-Qs filed since
 * that 10-K: a partial 10-Q's risks that one of them already added are `repeated`, not `added`.
 */
export function compareQuarter(read: RiskRead, annual: RiskRead | null, previous: RiskRead | null, earlier: readonly RiskRead[] = []): Comparison {
  const annualReadable = readable(annual);
  const kind = classifyQuarter(read, annualReadable ? annual!.headings.length : null);
  const annualRef = annual ? ref(annual) : null;
  switch (kind) {
    case "unreadable":
      return unreadable(read, annual, quarterReason(read));
    case "no_changes":
    case "none_listed":
      return { status: kind, scope: null, filing: ref(read), base: annualRef, added: [], dropped: [], reworded: [], same: 0, reason: null };
    case "full": {
      // The filing just before it, when that one is also a whole list; else the 10-K.
      const prior = readable(previous, Math.max(MIN_HEADINGS_10K, FULL_SHARE * annual!.headings.length)) ? previous : annual;
      return compareFull(read, prior);
    }
    case "partial": {
      if (!annualReadable) return unreadable(read, annual, "few_headings_base");
      const diff = diffHeadings(annual!.headings, read.headings, { partial: true });
      const told = earlier
        .filter((entry) => entry.found === true && entry.filing.accession !== read.filing.accession && entry.filing.filed > annual!.filing.filed && entry.filing.filed <= read.filing.filed)
        .flatMap((entry) => diffHeadings(annual!.headings, entry.headings, { partial: true }).added);
      const repeated = diff.added.filter((heading) => among(heading, told));
      const added = diff.added.filter((heading) => !repeated.includes(heading));
      return { status: "changes", scope: "partial", filing: ref(read), base: annualRef, ...diff, added, ...(repeated.length ? { repeated } : {}), reason: null };
    }
  }
}

/** Whether a comparison has something to show: a readable one with at least one added, repeated, dropped or reworded risk. */
export function hasChanges(comparison: Comparison | null | undefined): comparison is Comparison {
  return Boolean(comparison && comparison.status === "changes" && comparison.added.length + (comparison.repeated?.length ?? 0) + comparison.dropped.length + comparison.reworded.length > 0);
}
