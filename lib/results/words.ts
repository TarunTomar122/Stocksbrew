/**
 * The words of a results read: the figures, the one sentence, the fact a card
 * or an inbox row shows, the call line and where each number came from. Pure,
 * so every phrase is tested on plain reads (./words.test.ts).
 *
 * Rules: a number is only said with what it is compared with; a surprise on a
 * tiny estimate is said in cents, not as a 300% beat; a move is compared with
 * the stock's usual report move only when it has at least MIN_USUAL of them.
 */
import { fmtEps } from "@/lib/calendar-shared";
import { dayWords as dayWordsOf, onDayWords } from "@/lib/day-words";
import { shortDay } from "@/lib/read-format";

import type { ResultCall, ResultCardFacts, ResultEps, ResultGuidance, ResultMove, ResultRead, ResultRevenue, ResultSummary, ResultVerdict } from "./types";

export type { ResultCardFacts } from "./types";

const MINUS = "−";
/** Below this many earlier report moves there is no "usual" move to compare with. */
export const MIN_USUAL = 3;
/** A surprise is said in percent only on an estimate at least this big and when it is at most this many percent. */
const PCT_MIN_ESTIMATE = 0.1;
const PCT_MAX = 100;

/**
 * A percentage's size as the page shows it: whole once it is 10 or more, else one decimal. Every figure, sentence and
 * comparison rounds through here, so "+25%" in the figure and "up 25%" in the sentence are the same number, and a
 * ratio is worked out from the numbers on the page.
 */
export function shownPct(value: number): number {
  const size = Math.abs(value);
  if (!Number.isFinite(size)) return 0;
  const tenths = Math.round(size * 10) / 10;
  return tenths >= 10 ? Math.round(size) : tenths;
}

/** "18%" from 18.1, "8.3%" from 8.27, "0.4%" from 0.42, "10%" from 9.96. No sign. */
export function pctWords(value: number): string {
  const shown = shownPct(value);
  return shown >= 10 ? `${shown}%` : `${shown.toFixed(1).replace(/\.0$/, "")}%`;
}

/** "+25%" / "−3.1%": the same rounding as the words. */
export function signed(value: number): string {
  const shown = shownPct(value);
  return `${shown === 0 ? "" : value > 0 ? "+" : MINUS}${pctWords(value)}`;
}

/** "$0.13 a share", "$1 a share". */
function cents(value: number): string {
  return `$${Math.abs(value).toFixed(2)} a share`;
}

/** How far off the estimate, in percent when that means something, else in dollars a share. */
export function marginWords(eps: Pick<ResultEps, "actual" | "expected" | "surprisePct">): string {
  const pct = eps.surprisePct;
  if (pct !== null && Math.abs(eps.expected) >= PCT_MIN_ESTIMATE && Math.abs(pct) <= PCT_MAX) return pctWords(pct);
  return cents(eps.actual - eps.expected);
}

/** "beat by 18%", "missed by $0.11 a share", "in line". */
export function verdictPhrase(eps: ResultEps): string {
  if (eps.verdict === "in_line") return "in line";
  return `${eps.verdict === "beat" ? "beat" : "missed"} by ${marginWords(eps)}`;
}

function cap(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "$110.31", "$1,427.28". */
function dollars(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "$1.50B", "$812M". */
export function revenueWords(value: number): string {
  const size = Math.abs(value);
  if (size >= 1e9) return `$${(size / 1e9).toFixed(2)}B`;
  if (size >= 1e6) return `$${Math.round(size / 1e6)}M`;
  return `$${Math.round(size).toLocaleString("en-US")}`;
}

const GUIDANCE_WORD: Record<ResultGuidance["change"], string> = {
  raised: "Raised",
  lowered: "Cut",
  mixed: "Mixed",
  narrowed: "Narrowed",
  reaffirmed: "Kept",
  issued: "Given",
};

const GUIDANCE_CLAUSE: Record<ResultGuidance["change"], string> = {
  raised: "raised its outlook",
  lowered: "cut its outlook",
  mixed: "raised part of its outlook and cut part of it",
  narrowed: "narrowed its outlook",
  reaffirmed: "kept its outlook",
  issued: "gave an outlook",
};

export function guidanceWord(guidance: ResultGuidance): string {
  return GUIDANCE_WORD[guidance.change];
}

function upDown(pct: number): string {
  return pct > 0 ? "up" : "down";
}

function flat(pct: number): boolean {
  return Math.abs(pct) < 0.05;
}

/** "today", "yesterday", "on Monday" within the week, "on Nov 3" before (lib/day-words.ts). */
function dayWords(day: string, today: string): string {
  return onDayWords(day, today) || `on ${shortDay(day)}`;
}

/**
 * When the move happened, short: "today", "before the open", "yesterday", "on Nov 6", "over two days". Always a real
 * day, never "the next day": an inbox row or a card has no report day beside it for "next" to count from.
 */
export function moveWhen(move: ResultMove, today: string): string {
  if (move.kind === "before_open") return "before the open";
  if (move.kind === "after_hours") return move.day === today ? "after hours" : `after hours ${dayWords(move.day, today)}`;
  if (move.kind === "two_days") return "over two days";
  return dayWords(move.day, today);
}

/** "up 25.5% today", "down 3.1% the next day", "flat before the open". */
export function moveShort(move: ResultMove, today: string): string {
  if (flat(move.pct)) return `flat ${moveWhen(move, today)}`;
  return `${upDown(move.pct)} ${pctWords(move.pct)} ${moveWhen(move, today)}`;
}

/** The stock's part of the sentence, in the tense the window needs. */
function movePart(move: ResultMove, today: string): string {
  const size = pctWords(move.pct);
  if (move.kind === "before_open") return flat(move.pct) ? "the stock is flat before the open" : `the stock is ${upDown(move.pct)} ${size} before the open`;
  if (move.kind === "after_hours" && move.day === today) return flat(move.pct) ? "the stock is flat after hours" : `the stock is ${upDown(move.pct)} ${size} after hours`;
  if (move.kind === "today") return flat(move.pct) ? "the stock is flat today" : `the stock is ${upDown(move.pct)} ${size} today`;
  if (move.kind === "day" && move.day === today) return flat(move.pct) ? "the stock closed flat today" : `the stock closed ${upDown(move.pct)} ${size} today`;
  const verb = flat(move.pct) ? "barely moved" : `${move.pct > 0 ? "rose" : "fell"} ${size}`;
  if (move.kind === "two_days") return `the stock ${verb} over the two sessions around it`;
  return `the stock ${verb} ${move.kind === "after_hours" ? moveWhen(move, today) : dayWords(move.day, today)}`;
}

/** The move against the usual report move, from the rounded numbers the page shows; null without enough history. */
function usualRatio(move: ResultMove): number | null {
  const usual = move.usualPct;
  if (usual === null || !(usual > 0) || move.usualCount < MIN_USUAL || flat(move.pct)) return null;
  const shownUsual = shownPct(usual);
  return shownUsual > 0 ? shownPct(move.pct) / shownUsual : null;
}

function timesWords(ratio: number): string {
  return `about ${(Math.round(ratio * 10) / 10).toFixed(1).replace(/\.0$/, "")} times`;
}

/** Against the usual report move: "about 2.3 times its usual 11% move after a report". Empty without enough history. */
export function usualClause(move: ResultMove): string {
  const ratio = usualRatio(move);
  if (ratio === null) return "";
  const its = `its usual ${pctWords(move.usualPct!)} move after a report`;
  if (ratio >= 2) return `${timesWords(ratio)} ${its}`;
  if (ratio >= 1.25) return `bigger than ${its}`;
  if (ratio > 0.75) return `about ${its}`;
  return `smaller than ${its}`;
}

/** What they reported against what was expected, as the start of a sentence. Empty when there is nothing to say. */
function leadPart(read: ResultRead, name: string): string {
  const eps = read.eps;
  if (eps) {
    // A loss against an expected loss reads better as the loss itself.
    if (eps.actual < 0 && eps.expected < 0) {
      if (eps.verdict === "in_line") return `${name} lost ${fmtEps(Math.abs(eps.actual))} a share, in line with the ${fmtEps(Math.abs(eps.expected))} expected`;
      return `${name} lost ${fmtEps(Math.abs(eps.actual))} a share, ${eps.verdict === "beat" ? "less" : "more"} than the ${fmtEps(Math.abs(eps.expected))} expected`;
    }
    if (eps.verdict === "in_line") return `${name} matched the EPS estimate of ${fmtEps(eps.expected)}`;
    return `${name} ${eps.verdict === "beat" ? "beat" : "missed"} the EPS estimate by ${marginWords(eps)}`;
  }
  if (read.revenue) {
    const revenue = read.revenue;
    const yoy = revenue.yoyPct;
    const lead = `${name} reported revenue of ${revenueWords(revenue.value)}`;
    if (revenue.expected !== null && revenue.verdict) {
      if (revenue.verdict === "in_line") return `${lead}, in line with the ${revenueWords(revenue.expected)} expected`;
      return `${lead}, ${revenue.verdict === "beat" ? "above" : "below"} the ${revenueWords(revenue.expected)} expected`;
    }
    return `${lead}${yoy !== null && !flat(yoy) ? `, ${upDown(yoy)} ${pctWords(yoy)} from a year ago` : ""}`;
  }
  return "";
}

/**
 * The one sentence: what they reported against the estimate, the outlook when the release states it, and how the
 * stock took it against its usual report move. Empty when there are no figures.
 */
export function resultSentence(read: ResultRead, name: string, today: string): string {
  const lead = leadPart(read, name || read.ticker);
  if (!lead) return "";
  const guidance = read.guidance ? ` and ${GUIDANCE_CLAUSE[read.guidance.change]}` : "";
  let move = "";
  if (read.move) {
    const usual = usualClause(read.move);
    move = `, and ${movePart(read.move, today)}${usual ? `, ${usual}` : ""}`;
  }
  return `${lead}${guidance}${move}.`;
}

/**
 * One line for an inbox row (owner rule 8, judges ship 71): the result against the estimate and how the stock took it,
 * nothing more. "AAPL beat the EPS estimate by 3.5% and fell 1.9% on Monday." Empty when there are no figures.
 */
export function resultLine(read: ResultRead, today: string): string {
  const lead = leadPart(read, read.ticker);
  if (!lead) return "";
  if (!read.move) return `${lead}.`;
  // A lead with its own comma ("lost $1.27 a share, less than the $1.55 expected") takes one before the "and" too.
  return `${lead}${lead.includes(",") ? ", and" : " and"} ${movePhrase(read.move, today)}.`;
}

/** The call line: whether the results moved our call. */
export function callLine(call: ResultCall, today: string): string {
  if (call.status === "changed") return `We moved our call from ${call.from} to ${call.call} ${dayWords(call.on, today)} after the results.`;
  if (call.status === "held") return `Our call is still ${call.call} after the results.`;
  return `Our call is ${call.call}.`;
}

/** The move and how it compares, short, for a headline or a card: "about 5 times its usual move after a report". */
function usualShort(move: ResultMove): string {
  const ratio = usualRatio(move);
  if (ratio === null) return "";
  if (ratio >= 2) return `${timesWords(ratio)} its usual move after a report`;
  if (ratio >= 1.25) return "bigger than its usual move after a report";
  if (ratio > 0.75) return "about its usual move after a report";
  return "smaller than its usual move after a report";
}

/** "is up 25% today", "rose 10% on Nov 9", "fell 14% yesterday", "is up 4.2% before the open". */
function movePhrase(move: ResultMove, today: string): string {
  if (flat(move.pct)) return move.kind === "before_open" ? "is flat before the open" : move.kind === "after_hours" && move.day === today ? "is flat after hours" : move.kind === "today" ? "is flat today" : `barely moved ${moveWhen(move, today)}`;
  const size = pctWords(move.pct);
  if (move.kind === "before_open") return `is ${upDown(move.pct)} ${size} before the open`;
  if (move.kind === "after_hours" && move.day === today) return `is ${upDown(move.pct)} ${size} after hours`;
  if (move.kind === "today") return `is ${upDown(move.pct)} ${size} today`;
  if (move.kind === "day" && move.day === today) return `closed ${upDown(move.pct)} ${size} today`;
  return `${move.pct > 0 ? "rose" : "fell"} ${size} ${moveWhen(move, today)}`;
}

/**
 * One short line for the top of the inbox: how the results compared with the estimate in words, the move as its one
 * number, and how that compares with the stock's usual move after a report. "CRWV lost less than expected and rose 25%
 * yesterday, bigger than its usual move after a report." Empty without figures.
 */
export function resultHeadline(read: ResultRead, today: string): string {
  const eps = read.eps;
  let lead = "";
  if (eps) {
    if (eps.actual < 0 && eps.expected < 0) lead = eps.verdict === "beat" ? "lost less than expected" : eps.verdict === "miss" ? "lost more than expected" : "lost about what was expected";
    else lead = eps.verdict === "beat" ? "beat the EPS estimate" : eps.verdict === "miss" ? "missed the EPS estimate" : "matched the EPS estimate";
  } else if (read.revenue?.verdict) lead = read.revenue.verdict === "beat" ? "beat the revenue estimate" : read.revenue.verdict === "miss" ? "missed the revenue estimate" : "matched the revenue estimate";
  else if (read.guidance) lead = GUIDANCE_CLAUSE[read.guidance.change];
  else if (read.revenue) lead = "reported its results";
  if (!lead) return "";
  if (!read.move) return `${read.ticker} ${lead}.`;
  const usual = usualShort(read.move);
  return `${read.ticker} ${lead} and ${movePhrase(read.move, today)}${usual ? `, ${usual}` : ""}.`;
}

/**
 * A held stock's card fact in the briefing: the result, and the move against the stock's usual move on results. The
 * card's big figure is today's move, so the chip leaves the number out only when the results move is today's session;
 * a pre-market move or an earlier day's move keeps its own number and day ("up 25% yesterday"), so the chip never
 * reads as if the card's figure were the results move. Our call is left to the card: a held call would be the same
 * words on every card that reported (owner rule 1), and a changed call is the card's own line.
 * "Beat by 30%, and the move is about 5 times its usual on results". Null without figures.
 */
export function briefingResultFact(read: ResultRead, today: string): string | null {
  const move = read.move;
  const isToday = Boolean(move && (move.kind === "today" || (move.kind === "day" && move.day === today)));
  const fact = resultFact({ ...read, move: move && !isToday ? move : null }, today);
  if (!fact) return null;
  const ratio = move ? usualRatio(move) : null;
  if (ratio === null) return fact;
  if (!isToday) {
    const size = ratio >= 2 ? `${timesWords(ratio)} its usual` : ratio >= 1.25 ? "bigger than usual" : ratio > 0.75 ? "about its usual" : "smaller than usual";
    return `${fact}, ${size} on results`;
  }
  const size = ratio >= 2 ? `${timesWords(ratio)} its usual` : ratio >= 1.25 ? "bigger than usual" : ratio > 0.75 ? "about its usual size" : "smaller than usual";
  return `${fact}, and the move is ${size} on results`;
}

/** The highlighted fact for a card or a row: "Beat by 18%, up 26% today". Null when there are no figures. */
export function resultFact(read: ResultRead, today: string): string | null {
  const parts: string[] = [];
  if (read.eps) parts.push(cap(verdictPhrase(read.eps)));
  else if (read.revenue?.verdict) parts.push(revenueVerdictWords(read.revenue));
  else if (read.revenue && read.revenue.yoyPct !== null) parts.push(`Revenue ${flat(read.revenue.yoyPct) ? "flat" : `${upDown(read.revenue.yoyPct)} ${pctWords(read.revenue.yoyPct)}`} on a year ago`);
  else if (read.guidance) parts.push(cap(GUIDANCE_CLAUSE[read.guidance.change]));
  if (parts.length === 0) return null;
  if (read.move) parts.push(moveShort(read.move, today));
  return parts.join(", ");
}

/** "Revenue beat by 8.8%", "Revenue missed by 2.1%", "Revenue in line". */
export function revenueVerdictWords(revenue: ResultRevenue): string {
  if (!revenue.verdict || revenue.surprisePct === null) return "";
  if (revenue.verdict === "in_line") return "Revenue in line";
  return `Revenue ${revenue.verdict === "beat" ? "beat" : "missed"} by ${pctWords(revenue.surprisePct)}`;
}

function verdictTone(verdict: ResultVerdict | null): "up" | "down" | "flat" {
  return verdict === "beat" ? "up" : verdict === "miss" ? "down" : "flat";
}

export function resultTone(read: ResultRead): "up" | "down" | "flat" {
  if (read.eps) return verdictTone(read.eps.verdict);
  if (read.revenue?.verdict) return verdictTone(read.revenue.verdict);
  if (read.guidance?.change === "raised") return "up";
  if (read.guidance?.change === "lowered") return "down";
  return "flat";
}

/** One figure. `title` says where it came from: a hover title, never a line under the fact (owner rule 4). */
/**
 * Two figures a cell compares (reported against expected, this move against the usual one), drawn as a bar pair, with
 * the shorter line that goes under the bars in place of `sub` (the bars carry both numbers; owner VISUALS CHECK).
 */
export type FigurePair = { value: number; versus: number; labels: [string, string]; texts: [string, string]; sub: string };
export type FigureCell = { label: string; value: string; sub: string; title: string; tone: "up" | "down" | "flat"; pair?: FigurePair };

/** The compact row of figures: EPS against the estimate, revenue, the outlook, the stock's move. */
export function figureCells(read: ResultRead, today: string): FigureCell[] {
  const cells: FigureCell[] = [];
  if (read.eps) {
    const eps = read.eps;
    cells.push({
      label: "EPS",
      value: fmtEps(eps.actual),
      sub: `vs ${fmtEps(eps.expected)} expected, ${verdictPhrase(eps)}`,
      title: `EPS and estimate: ${eps.source}${eps.asOf ? `, ${stampWords(eps.asOf)}` : ""}`,
      tone: verdictTone(eps.verdict),
      pair: { value: eps.actual, versus: eps.expected, labels: ["Reported", "Expected"], texts: [fmtEps(eps.actual), fmtEps(eps.expected)], sub: cap(verdictPhrase(eps)) },
    });
  }
  if (read.revenue) {
    const revenue = read.revenue;
    const yoy = revenue.yoyPct;
    const growth = yoy === null ? "" : flat(yoy) ? "flat on a year ago" : `${upDown(yoy)} ${pctWords(yoy)} on a year ago`;
    // The same shape as the EPS figure: "vs $248M expected, beat by 8.8%, up 414% on a year ago".
    const verdict = revenueVerdictWords(revenue);
    const expected = revenue.expected !== null && verdict ? `vs ${revenueWords(revenue.expected)} expected, ${verdict.replace(/^Revenue /, "")}` : "";
    cells.push({
      label: "Revenue",
      value: revenueWords(revenue.value),
      sub: expected ? [expected, growth].filter(Boolean).join(", ") : cap(growth),
      title: [revenue.expected !== null ? "Estimate: Yahoo Finance analysts" : "", `Revenue: ${revenue.source}${revenue.asOf ? `, ${stampWords(revenue.asOf)}` : ""}`].filter(Boolean).join(". "),
      tone: revenue.verdict ? verdictTone(revenue.verdict) : yoy === null || flat(yoy) ? "flat" : yoy > 0 ? "up" : "down",
      ...(revenue.expected !== null && verdict
        ? {
            pair: {
              value: revenue.value,
              versus: revenue.expected,
              labels: ["Reported", "Expected"] as [string, string],
              texts: [revenueWords(revenue.value), revenueWords(revenue.expected)] as [string, string],
              // The margin against the estimate first, as the EPS cell says it, then the year-on-year change.
              sub: cap([verdict.replace(/^Revenue /, ""), growth].filter(Boolean).join(", ")),
            },
          }
        : {}),
    });
  }
  if (read.guidance) {
    const guidance = read.guidance;
    cells.push({
      label: "Outlook",
      value: guidanceWord(guidance),
      sub: guidance.first ? `${guidance.first}${guidance.previous ? `, was ${guidance.previous}` : ""}` : "",
      title: `${guidance.source}${guidance.asOf ? `, ${stampWords(guidance.asOf)}` : ""}`,
      tone: guidance.change === "raised" ? "up" : guidance.change === "lowered" ? "down" : "flat",
    });
  }
  if (read.move) {
    // A print outside the session says its own price: the page's price is the last close (owner rule 4).
    const printPrice = (read.move.kind === "before_open" || read.move.kind === "after_hours") && typeof read.move.price === "number" && read.move.price > 0 ? `, at ${dollars(read.move.price)}` : "";
    const usual = read.move.usualPct !== null && read.move.usualCount >= MIN_USUAL ? `, usually ${pctWords(read.move.usualPct)}` : "";
    cells.push({
      label: "The stock",
      value: signed(read.move.pct),
      sub: `${cap(moveWhen(read.move, today))}${printPrice}${usual}`,
      title: `${cap(read.move.source)}${read.move.asOf ? `, ${stampWords(read.move.asOf)}` : ""}`,
      tone: flat(read.move.pct) ? "flat" : read.move.pct > 0 ? "up" : "down",
      // The move's size against a usual report's, when there is a usual one to hold it against.
      ...(usual && read.move.usualPct !== null
        ? {
            pair: {
              value: Math.abs(read.move.pct),
              versus: read.move.usualPct,
              labels: ["This time", "Usually"] as [string, string],
              texts: [pctWords(read.move.pct), pctWords(read.move.usualPct)] as [string, string],
              sub: `${cap(moveWhen(read.move, today))}${printPrice}`,
            },
          }
        : {}),
    });
  }
  return cells;
}

/** "Nov 11, 2:03 PM ET" for a time, "Nov 10" for a bare day. */
export function stampWords(at: string | null): string {
  if (!at) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return shortDay(at);
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
}

/** "Reported today before the open" / "Reported yesterday after the close" / "Reported Monday" / "Reported Nov 3". */
export function reportedWords(read: Pick<ResultRead, "reportDate" | "session">, today: string): string {
  const day = dayWordsOf(read.reportDate, today) || shortDay(read.reportDate);
  const when = read.session === "amc" ? " after the close" : read.session === "bmo" ? " before the open" : "";
  return `Reported ${day}${when}`;
}

/** The summary the briefing, the inbox and the planner use. Null when the read has no figures. */
export function summarize(read: ResultRead, name: string, today: string): ResultSummary | null {
  const fact = resultFact(read, today);
  const sentence = resultSentence(read, name, today);
  if (!fact || !sentence) return null;
  return { ticker: read.ticker, reportDate: read.reportDate, tone: resultTone(read), fact, sentence, call: read.call ? callLine(read.call, today) : null };
}

/* ── the "Biggest things" card ──────────────────────────────────────────── */

/** The outlook without its subject: the card names the company right above its line (owner rule 1). */
const GUIDANCE_CARD: Record<ResultGuidance["change"], string> = {
  raised: "the {year}outlook was raised",
  lowered: "the {year}outlook was cut",
  mixed: "the {year}outlook was raised in part and cut in part",
  narrowed: "the {year}outlook was narrowed",
  reaffirmed: "the {year}outlook was kept",
  issued: "{a} {year}outlook was given",
};

/** What a card can say about this report; null when the read has no figures. */
export function resultCardFacts(read: ResultRead): ResultCardFacts | null {
  const eps = read.eps ? `EPS was ${fmtEps(read.eps.actual)} vs ${fmtEps(read.eps.expected)} expected` : null;
  const yoy = read.revenue?.yoyPct ?? null;
  let revenue: string[] | null = null;
  if (read.revenue && yoy !== null) {
    const amount = revenueWords(read.revenue.value);
    revenue = flat(yoy)
      ? [`revenue was flat at ${amount}`, "revenue was flat"]
      : [`revenue ${yoy > 0 ? "rose" : "fell"} ${pctWords(yoy)} to ${amount}`, `revenue ${yoy > 0 ? "rose" : "fell"} ${pctWords(yoy)}`];
  }
  const fullYear = Boolean(read.guidance?.fullYear);
  const guidance = read.guidance ? GUIDANCE_CARD[read.guidance.change].replace("{a} ", fullYear ? "a " : "an ").replace("{year}", fullYear ? "full-year " : "") : null;
  if (!eps && !revenue && !guidance) return null;
  const move = read.move;
  const usualPct = move && move.usualPct !== null && move.usualPct > 0 && move.usualCount >= MIN_USUAL ? move.usualPct : null;
  return { eps, revenue, guidance, usualPct };
}

/** Each read's card facts by ticker (the briefing's "Biggest things"); a read without figures is left out. */
export function resultCardsByTicker(reads: readonly ResultRead[]): Record<string, ResultCardFacts> {
  const out: Record<string, ResultCardFacts> = {};
  for (const read of reads) {
    const facts = resultCardFacts(read);
    if (facts) out[read.ticker.toUpperCase()] = facts;
  }
  return out;
}

/**
 * The move against the usual move after a report: the move as the card shows it (one decimal) over the usual move,
 * which the card never shows. Null when either is unknown, the move is flat, or there is no usual move.
 */
export function reportRatio(pct: number | null | undefined, usualPct: number | null | undefined): number | null {
  if (typeof pct !== "number" || !Number.isFinite(pct) || flat(pct) || typeof usualPct !== "number" || !(usualPct > 0)) return null;
  return Math.round(Math.abs(pct) * 10) / 10 / usualPct;
}

/** "the move is 3.8× its usual on results", "the move is bigger than usual on results"; null when about the usual size. */
function reactionCard(pct: number | null, usualPct: number | null): string | null {
  const ratio = reportRatio(pct, usualPct);
  if (ratio === null) return null;
  if (ratio >= 2) return `the move is ${(Math.round(ratio * 10) / 10).toFixed(1).replace(/\.0$/, "")}× its usual on results`;
  if (ratio >= 1.25) return "the move is bigger than usual on results";
  if (ratio <= 0.75) return "the move is smaller than usual on results";
  return null;
}

/** "a", "a, and b", "a, b, and c": the clauses as one sentence's body. */
function clauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The card's line, most telling first, for lib/biggest.ts fitLine to take the first that fits in 15 words: one
 * sentence, what was reported against the estimate first, then the outlook, revenue growth, and how the card's move
 * (`pct`, which is the after-hours or pre-market print when that is the story) compares with the stock's usual move
 * after a report. Revenue's amount goes first when words are short, then the reaction, then revenue itself; the EPS
 * pair and the outlook stay longest. The move's own figure and session are the card's, so they are never said here.
 * "EPS was $5.06 vs $3.90 expected; the move is 5.2× its usual on results."
 */
export function resultCardLines(facts: ResultCardFacts | null | undefined, pct: number | null): string[] {
  if (!facts) return [];
  const reaction = reactionCard(pct, facts.usualPct);
  const revenues = facts.revenue ?? [];
  const [revLong = null] = revenues;
  const revShort = revenues[revenues.length - 1] ?? null;
  const { eps, guidance } = facts;
  // [clauses, with the reaction]
  const sets: Array<[Array<string | null>, boolean]> = [
    [[eps, revLong, guidance], true],
    [[eps, revShort, guidance], true],
    [[eps, revLong, guidance], false],
    [[eps, revShort, guidance], false],
    [[eps, guidance], true],
    [[eps, guidance], false],
    [[eps ?? revShort], true],
    [[eps ?? revShort ?? guidance], false],
  ];
  const out: string[] = [];
  for (const [parts, withReaction] of sets) {
    const said = parts.filter((part): part is string => Boolean(part));
    if (said.length === 0) continue;
    const line = `${cap(clauses(said))}${withReaction && reaction ? `; ${reaction}` : ""}.`;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}
