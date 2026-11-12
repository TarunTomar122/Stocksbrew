/**
 * Insights, not data: the shared shape every page uses for its "read".
 *
 * An insight is a conclusion drawn from real numbers we already hold: what
 * changed, how big it is compared with normal, who it touches, and what to do
 * about it. Builders compute these with plain rules (shares, ranks, changes
 * against a baseline, thresholds) in a page's loader. No model writes the
 * numbers, and an insight that cannot be backed by data is left out rather
 * than padded.
 */

export type InsightTone = "up" | "down" | "flat";

export type Insight = {
  /** Stable key for React lists. */
  id: string;
  tone: InsightTone;
  /** One plain sentence with the number in it: "62% of today's stock news is positive, up from 48% yesterday." */
  text: string;
  /** Optional second clause on why it matters or what to do: "Chips lead it; NVDA is the exception." */
  soWhat?: string;
  /** Tickers the insight is about, shown as small logo chips. */
  tickers?: string[];
  /**
   * The lead stock's company name, shown in place of its ticker where the row
   * leads with one stock ("Hims & Hers fell 16.5%..." under the HIMS logo).
   * The sentence still starts with the ticker so the row knows its subject.
   */
  leadName?: string;
  /** Where to go to act or dig in. */
  action?: InsightAction;
  /**
   * A second, smaller next step beside the first, when the finding invites one
   * ("Watch HIMS for me" next to "Why did it fall?"). Two at most per finding.
   */
  secondAction?: InsightAction;
  /**
   * The one number the card shows big, beside the sentence that already says
   * it: "−5.5%", "8 of 11", "$38.7M", "Nov 17". When absent the card picks the
   * first number from `text` (see `figureOf`); `null` means show none.
   */
  figure?: InsightFigure | null;
};

/** A card's key figure: the value, an optional short label under it ("of the portfolio"), and its own tone. */
export type InsightFigure = { value: string; label?: string; tone?: InsightTone };

/** A next step offered right where a finding is: a plain label and where it goes. */
export type InsightAction = { label: string; href: string };

export type TheRead = {
  /** The one-line headline of the page's read: "A risk-on morning, led by chips." */
  headline: string;
  /** One quiet line under the headline: what the headline leaves out to stay one idea ("NVDA and QQQ moved most."). */
  sub?: string;
  /** The supporting insights, most important first. Three is plenty. */
  insights: Insight[];
  /** Short source and time line, e.g. "412 stories from 38 sources" / an ISO time. */
  source?: string;
  asOf?: string | null;
  /** Stocks the headline itself tells, so lists under the read can leave them out. */
  headlineTickers?: string[];
  /** Next steps for the headline itself, shown right under it. Two at most. */
  actions?: InsightAction[];
};

/** Whole-number percentage share, or null when the base is empty. */
export function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Split counts into percentages that always add up to 100 (largest remainder). */
export function balancePct(counts: Record<string, number>): Record<string, number> {
  const keys = Object.keys(counts);
  const total = keys.reduce((sum, key) => sum + Math.max(0, counts[key] || 0), 0);
  const out: Record<string, number> = {};
  if (total <= 0) {
    for (const key of keys) out[key] = 0;
    return out;
  }
  const raw = keys.map((key) => ({ key, exact: (Math.max(0, counts[key] || 0) / total) * 100 }));
  let assigned = 0;
  for (const item of raw) {
    out[item.key] = Math.floor(item.exact);
    assigned += out[item.key];
  }
  raw
    .sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))
    .slice(0, 100 - assigned)
    .forEach((item) => {
      out[item.key] += 1;
    });
  return out;
}

/** Tone of a signed number with a dead band: within ±band it reads as flat. */
export function toneOfChange(value: number | null | undefined, band = 0): InsightTone {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) <= band) return "flat";
  return value > 0 ? "up" : "down";
}

/** Drop empty insights and cap the list, so a page never shows filler. */
export function pickInsights(items: Array<Insight | null | undefined | false>, max = 3): Insight[] {
  return items.filter((item): item is Insight => Boolean(item && item.text.trim())).slice(0, max);
}

const MINUS = "−";
// Thousands commas only inside a number, so "At $168, it..." stops at "$168".
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
/** "makes up 38%" and "picked up 2%" are shares and amounts, not moves. */
const NOT_A_MOVE = String.raw`(?<!\b(?:make|makes|made|making|pick|picks|picked|add|adds|added|sum|sums|summed|take|takes|took|taken)\s)`;
/** Words that give an unsigned percentage its direction: "fell 16.5%" reads as −16.5%. */
const DOWN_WORDS = "fell|falls|fall|lost|loses|dropped|drops|down|declined|slid|sank|tumbled|plunged|slipped";
const UP_WORDS = "rose|rises|gained|gains|up|jumped|climbed|surged|soared|rallied|advanced";
const DOWN_RE = new RegExp(`^(?:${DOWN_WORDS})$`, "i");

const FIGURE_PATTERNS: Array<{ re: RegExp; read: (match: RegExpExecArray) => string | null }> = [
  // A signed percentage: "+12.5%", "(−5.5%)". A hyphen after a word or digit is a range ("3-5%"), not a sign.
  { re: new RegExp(String.raw`(?<![\w.])([+\-−–])\s?(${NUM})\s?%`, "g"), read: (m) => `${m[1] === "+" ? "+" : MINUS}${m[2]}%` },
  // A move in words: "fell 16.5%", "is up 3%", "lost 0.7%".
  { re: new RegExp(String.raw`${NOT_A_MOVE}\b(${DOWN_WORDS}|${UP_WORDS})\s+(?:by\s+)?(${NUM})\s?%`, "gi"), read: (m) => `${DOWN_RE.test(m[1]!) ? MINUS : "+"}${m[2]}%` },
  // A count against its whole: "8 of 11", "19 of 28 companies".
  { re: new RegExp(String.raw`(?<![\w.$])(${NUM})\s+of\s+(?:the\s+|its\s+|their\s+|your\s+|these\s+|our\s+)?(${NUM})(?![\w%]|\.\d|\s?%)`, "g"), read: (m) => `${m[1]} of ${m[2]}` },
  // Money, with its scale when it has one: "$38.7M", "$1.1B", "$443.3 billion", "$168.79".
  {
    re: new RegExp(String.raw`(?<!\w)\$\s?(${NUM})(?:\s?([KMBT])(?![A-Za-z])|\s(thousand|million|billion|trillion)\b)?`, "g"),
    read: (m) => `$${m[1]}${m[2] ?? (m[3] ? m[3][0]!.toUpperCase() : "")}`,
  },
  // A multiple: "29x", "5×".
  { re: new RegExp(String.raw`(?<![\w.])(${NUM})\s?[x×](?!\w)`, "g"), read: (m) => `${m[1]}×` },
  // Any other percentage, unless it is a distance ("within 3%"), which says little on its own.
  {
    re: new RegExp(String.raw`(?<![\w.+\-−–])(${NUM})\s?%`, "g"),
    read: (m) => (/\bwithin\s*$/i.test(m.input.slice(0, m.index)) ? null : `${m[1]}%`),
  },
];

/**
 * The first number worth showing big in a sentence, by position: a signed or
 * worded percentage ("fell 16.5%" gives −16.5%), a count against its whole
 * ("8 of 11"), money ("$38.7M"), a multiple ("29×") or a plain percentage.
 * Null when the sentence has none of those; years, dates, times and bare
 * counts never qualify.
 */
export function deriveFigure(text: string | null | undefined): InsightFigure | null {
  if (!text) return null;
  let best: { index: number; value: string } | null = null;
  for (const { re, read } of FIGURE_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) && (!best || match.index < best.index)) {
      const value = read(match);
      if (value) {
        best = { index: match.index, value };
        break;
      }
    }
  }
  return best ? { value: best.value } : null;
}

/** The figure a card shows: the insight's own, none when it says `null`, else the first one in its sentence. */
export function figureOf(insight: Pick<Insight, "figure" | "text">): InsightFigure | null {
  if (insight.figure === null) return null;
  if (insight.figure && insight.figure.value.trim()) return insight.figure;
  return deriveFigure(insight.text);
}
