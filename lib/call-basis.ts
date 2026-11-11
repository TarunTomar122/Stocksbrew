/**
 * The call's reason, taken apart into what it rests on and what would change it, with dates.
 *
 * The company reason under a call (backend/call_reason.py `compose_company_reason`) is two sentences
 * from a short set of templates: one or two facts joined by "and", "but" or "even though", then the
 * event that would change the call. This splits the facts so each one can stand on its own line, and
 * dates yearly sales by the report they come from ("in the year to its Aug 26 report"). The page adds
 * "as of <day>" to any fact that still names no day. Anything that does not match the templates returns
 * null, and the page shows the reason as one paragraph the way it always did.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" -> "Nov 10". Empty for anything else. */
function shortDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${Number(match[3])}` : "";
}

// The second fact always picks up with the company as "it", "its" or "the stock", or with the analysts
// (backend `_Fact.follow` / `.short`), so the joining word is only cut where a new fact starts.
const FACT_JOIN = /, (?:but|and|even though) (?=(?:its?|the stock|analysts|(?:one|two|three|four|five|six|seven|eight|nine|\d+) (?:more|fewer) analysts)\b)/;

// A sentence ends at a full stop and a capital, but not after an initial or a short title in a company's name
// ("D. R. Horton", "U.S. Bancorp", "St. Joe", "J.M. Smucker").
const SENTENCE_END = /(?<![A-Z]\.)(?<!\b(?:St|Inc|Co|Corp|Jr|Mr|Dr|Ltd)\.)(?<=[.!?])\s+(?=[A-Z])/;

// How the second sentence starts (backend `_change_sentence`).
const CHANGE_START = /^(?:We'd|We would|After that rise|A miss|A beat|The [A-Z][a-z]{2} \d{1,2} report|[A-Z][\w.&'() -]{0,60}?(?:'s|s'|’s) next report)\b/;

export type CallBasis = {
  /** One or two facts, each a full sentence. */
  facts: string[];
  /** What would change the call, when the reason says. */
  change: string | null;
};

function upperFirst(text: string): string {
  // "eBay" and "nCino" keep their own capitals.
  if (text.length > 1 && /[a-z]/.test(text[0]!) && /[A-Z]/.test(text[1]!)) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/[\s,;]+$/, "");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * `reason` is the company reason as the page shows it. `asOf` is the last close it was written from and
 * `lastReport` the company's most recent earnings day before that (both YYYY-MM-DD, either may be null).
 */
export function callBasis(reason: string | null | undefined, options: { asOf?: string | null; lastReport?: string | null } = {}): CallBasis | null {
  const text = (reason ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Split only where a sentence ends and a capital starts the next, so "3.3%" and "(down 3.3%)." stay whole.
  const sentences = text.split(SENTENCE_END);
  const last = sentences.length > 1 ? sentences[sentences.length - 1]! : "";
  const hasChange = Boolean(last && CHANGE_START.test(last));
  const why = (hasChange ? sentences.slice(0, -1) : sentences).join(" ").trim();
  if (!why) return null;
  // A reason with more than one sentence of facts is not one of ours; leave it as written.
  if (why.replace(/[.!?]$/, "").split(SENTENCE_END).length > 1) return null;

  const report = options.lastReport && (!options.asOf || options.lastReport <= options.asOf) ? shortDay(options.lastReport) : "";
  // The week and month windows are left as written: each stock's window ends on its own last price day, which
  // can differ from `asOf`, so the page dates them with "as of" instead of naming an end day.
  const dated = (fact: string) => {
    let out = fact;
    if (report) out = out.replace(/\b(sales (?:grew(?: only)? [\d.]+%|fell [\d.]+%|were flat)) over the past year\b/, `$1 in the year to its ${report} report`);
    return out;
  };

  const body = why.replace(/[.!?]$/, "");
  const join = FACT_JOIN.exec(body);
  const parts = join ? [body.slice(0, join.index), body.slice(join.index + join[0].length)] : [body];
  const facts = parts.map((part) => sentence(upperFirst(dated(part.trim()))));
  // Too short to be one of the templates' facts: show the reason as written.
  if (facts.some((fact) => fact.length < 16)) return null;
  return { facts, change: hasChange ? sentence(last) : null };
}

/** True when a fact names a day or month ("in the week to Nov 10", "report on Oct 27", "since April"). */
export function factHasDate(fact: string): boolean {
  // Whole month words only, so "Marvell" or "Robinhood Markets" are not read as dates.
  return /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/.test(fact);
}

/**
 * The report the yearly sales figure comes from: the most recent earnings day on or before `asOf` and at
 * least three days before `dataDay` (the day the company's figures were last fetched), so a report the
 * data source may not have caught up with is never named as the source. Null when there is none, or when the
 * last one is so old that a report must be missing from the list.
 */
export function lastReportOn(dates: ReadonlyArray<string>, asOf: string | null | undefined, dataDay?: string | null): string | null {
  // Without the day the figures were fetched there is no telling which report they include.
  const dataMs = dataDay ? Date.parse(`${dataDay.slice(0, 10)}T00:00:00Z`) : NaN;
  if (!Number.isFinite(dataMs)) return null;
  const settled = new Date(dataMs - 3 * 86_400_000).toISOString().slice(0, 10);
  let found: string | null = null;
  for (const day of dates) {
    if (!day || (asOf && day > asOf) || day > settled) continue;
    if (!found || day > found) found = day;
  }
  // A last report more than four months back means the list missed one, so the figure may come from a later report.
  const asOfMs = asOf ? Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`) : NaN;
  if (found && Number.isFinite(asOfMs) && asOfMs - Date.parse(`${found}T00:00:00Z`) > 120 * 86_400_000) return null;
  return found;
}

// What the older company reasons said would change the call without naming anything anyone can check (backend
// call_reason.py `_change_sentence` before Nov 11). Snapshot rows written before then still carry them.
const VAGUE_CHANGE =
  /\b(?:sharply|this fast|growing near|on a dip|settles back|wide margin|a lower price|buy range|look again after|decide after|stops growing|start cutting|faster sales growth|falls back toward)\b/i;

/**
 * The reason without its last sentence when that sentence is one of the old, uncheckable "what would change the
 * call" lines ("we'd buy more if sales keep growing this fast, and sell some if they slow sharply"). Anything else
 * comes back as it was. The facts sentence always stays.
 */
export function withoutVagueChange(reason: string | null | undefined): string {
  const text = (reason ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.split(SENTENCE_END);
  if (sentences.length < 2) return text;
  const last = sentences[sentences.length - 1]!;
  if (!CHANGE_START.test(last) || !VAGUE_CHANGE.test(last)) return text;
  return sentences.slice(0, -1).join(" ").trim();
}
