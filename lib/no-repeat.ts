/**
 * No number twice in one card, row or block (owner rule 1, Nov 13: "so many numbers repeating"). A card that shows
 * $50.77, −1.8% and "Buy more under $50.79" must not add "Fell 1.8% to $50.77, below its $50.79 buy-more level."
 *
 * `figuresIn` reads the figures a person sees, the same way backend/mail/kit.py `figures` does for the emails: a
 * price ($50.77, $1,431), a move (−1.8% and 1.8% are one figure: the sign is the colour) or a multiple (3.1x).
 * `newFacts` keeps only the part of a sentence those figures don't already say, and is the guard for a line builder
 * whose input may restate the card. It mirrors kit.py `new_facts`, case for case.
 */

const FIGURE = /\$\s?(\d[\d,]*(?:\.\d+)?)|([+−-])?(\d+(?:\.\d+)?)\s?%|\b(\d+(?:\.\d+)?)x\b/g;
const FIG = String.raw`(?:\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?x\b)`;
// A figure is only cut where the move or the close itself states it: right after a move word ("fell 1.8%", "surges
// 12%", "up about 3%") or as the price it went to or closed at ("to $50.77", "at $50.77").
const MOVE_FIGURE = new RegExp(
  String.raw`(\b(?:rose|rises|rising|fell|falls|falling|up|down|gained|gains|lost|loses|dropped|drops|jumped|jumps|slid|slides|` +
    String.raw`climbed|climbs|sank|sinks|surged|surges|soared|soars|tumbled|tumbles|plunged|plunges|rallied|rallies|spiked|` +
    String.raw`spikes|popped|pops|slipped|slips|moved|moves)\b)(\s+(?:about|nearly|almost|over|more than)?\s*[+−-]?` +
    FIG +
    ")",
  "gi",
);
const PRICE_FIGURE = /\s+\b(?:to|at)\s+\$\s?\d[\d,]*(?:\.\d+)?/g;
// any figure, with the little word that ties it in ("of $50.79"), for a strict cut
const LEAD_FIGURE = new RegExp(String.raw`(?:\s*\b(?:to|at|of|by|from)\b)?\s*[+−-]?` + FIG, "g");
// A clause about another measure keeps its figures even when one matches the card's: a stretch ("over the last 20
// sessions"), a usual or normal day, the market or an index, our levels, analysts, the morning's move.
const OTHER_MEASURE =
  /over the last|this week|since|before the open|this morning|so far|a year|normal day|usual|typical|s&p|index|market|analyst|target|upside|our |points?\b|pts\b/i;
// what is left of a clause once its repeated figures are gone, when it says nothing: "Fell", "Rose to", "Up yesterday"
const EMPTY_WORDS = new Set(
  `rose fell up down closed closes close moved moves move gained lost dropped jumped slid climbed sank is was are now
it its the a an and to at of by from on in this that yesterday today morning week session sessions last day
before after open so far stock shares price`.split(/\s+/),
);
// a sentence ends at . ! or ? after a small letter, a digit, % or a bracket: "U.S. stocks" is not two sentences
const SENTENCE_END = /(?<=[a-z0-9%)][.!?])\s+/;
const CLAUSE_SEP = /(,\s+|;\s+|:\s+|\s+—\s+)/;

/** A figure's key ("%1.8") and, for a move written with its sign, its signed key ("%-1.8"). */
function figureKeys(m: RegExpMatchArray): [string, string | null] | null {
  const kind = m[1] ? "$" : m[3] ? "%" : "x";
  const value = Number((m[1] ?? m[3] ?? m[4] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return [`${kind}${rounded}`, m[2] ? `%${m[2] === "+" ? "+" : "-"}${rounded}` : null];
}

/**
 * Every figure in a piece of text, as "$50.77", "%1.8" or "x3.1" (rounded to cents, sign dropped). A move written
 * with its sign also gives its signed key, "%-1.8" for "−1.8%".
 */
export function figuresIn(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(FIGURE)) {
    const keys = figureKeys(m);
    if (!keys) continue;
    out.add(keys[0]);
    if (keys[1]) out.add(keys[1]);
  }
  return out;
}

/** The figures of several shown strings at once: the price, the move, the call pill. */
export function shownFigures(...texts: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const text of texts) for (const f of figuresIn(text)) out.add(f);
  return out;
}

/**
 * True when `text` says a figure that is already in `shown`. "fell 1.8%" repeats a card's −1.8% (the sign is its
 * colour), but a move written with its own sign only repeats the same signed move: "+0.5%" is not "−0.5%".
 */
export function repeatsFigure(text: string | null | undefined, shown: Set<string>): boolean {
  for (const m of (text ?? "").matchAll(FIGURE)) {
    const keys = figureKeys(m);
    if (!keys) continue;
    const [key, signed] = keys;
    const value = key.slice(1);
    const shownSigned = shown.has(`%-${value}`) || shown.has(`%+${value}`);
    if (signed && key.startsWith("%") && shownSigned ? shown.has(signed) : shown.has(key)) return true;
  }
  return false;
}

function saysSomething(clause: string): boolean {
  const words = clause.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
  return words.some((w) => !EMPTY_WORDS.has(w));
}

const tidy = (clause: string) => clause.replace(/\s{2,}/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "");

/**
 * The clause without the shown figures its move or close states, the clause unchanged when they measure something
 * else, or null when nothing but shown figures is left of it.
 */
function clauseWithout(clause: string, shown: Set<string>, strict: boolean): string | null {
  if (!repeatsFigure(clause, shown) || OTHER_MEASURE.test(clause)) return clause;
  const cut = tidy(
    clause
      .replace(MOVE_FIGURE, (whole, verb: string, figure: string) => (repeatsFigure(figure, shown) ? verb : whole))
      .replace(PRICE_FIGURE, (part) => (repeatsFigure(part, shown) ? "" : part)),
  );
  if (!saysSomething(cut)) return null;
  if (repeatsFigure(cut, shown)) {
    // a shown figure in another role ("below its $50.79 level"): the clause goes when it is only that figure, and
    // otherwise stays as it was rather than read broken
    const rest = tidy(cut.replace(LEAD_FIGURE, (part) => (repeatsFigure(part, shown) ? " " : part)));
    return saysSomething(rest) ? (strict ? rest : clause) : null;
  }
  return cut;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/**
 * The part of a sentence the figures beside it don't already say. A clause that is only the shown move or close goes
 * ("Fell 1.8% to $50.77"); a clause with more keeps that, without the figure ("Sandisk surges 12% as AI trade
 * revives" → "Sandisk surges as AI trade revives"); a sentence with nothing left goes. A figure that measures
 * something else stays ("Up 1.8% over the last 20 sessions", "A normal day moves it 4.2%"). Text with no shown
 * figure comes back unchanged. `strict` also takes a shown figure out of a clause where it plays another role ("below
 * its $142.07 buy-more level" → "below its buy-more level"), for a headline right over rows that show that figure.
 */
export function newFacts(text: string | null | undefined, shown: Set<string>, { strict = false }: { strict?: boolean } = {}): string {
  if (!text) return "";
  if (!shown.size || !repeatsFigure(text, shown)) return text;
  const out: string[] = [];
  for (const sentence of text.trim().split(SENTENCE_END)) {
    const body = sentence.replace(/[.!?]+$/, "");
    const end = sentence.slice(body.length) || ".";
    const parts = body.split(CLAUSE_SEP);
    let kept = "";
    for (let i = 0; i < parts.length; i += 2) {
      const clause = clauseWithout(parts[i]!, shown, strict);
      if (!clause) continue;
      kept += (i > 0 && kept ? parts[i - 1]! : "") + clause;
    }
    if (kept) out.push(kept === body ? sentence : cap(kept) + end);
  }
  return out.join(" ");
}
