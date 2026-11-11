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
import { shortDay } from "@/lib/read-format";

import type { ResultCall, ResultEps, ResultGuidance, ResultMove, ResultRead, ResultSummary } from "./types";

const MINUS = "−";
/** Below this many earlier report moves there is no "usual" move to compare with. */
export const MIN_USUAL = 3;
/** A surprise is said in percent only on an estimate at least this big and when it is at most this many percent. */
const PCT_MIN_ESTIMATE = 0.1;
const PCT_MAX = 100;

/** "18%" from 18.1, "8.3%" from 8.27, "0.4%" from 0.42. No sign. */
export function pctWords(value: number): string {
  const size = Math.abs(value);
  return size >= 10 ? `${Math.round(size)}%` : `${size.toFixed(1).replace(/\.0$/, "")}%`;
}

/** "+25.5%" / "−3.1%". */
export function signed(value: number): string {
  const rounded = Number(Math.abs(value).toFixed(1));
  return `${rounded === 0 ? "" : value > 0 ? "+" : MINUS}${rounded.toFixed(1)}%`;
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

/** When the move happened, short: "today", "before the open", "the next day", "on the day", "over two days". */
export function moveWhen(move: ResultMove, today: string): string {
  if (move.kind === "before_open") return "before the open";
  if (move.kind === "two_days") return "over two days";
  if (move.day === today) return "today";
  return move.nextDay ? "the next day" : "on the day";
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
  if (move.kind === "today") return flat(move.pct) ? "the stock is flat today" : `the stock is ${upDown(move.pct)} ${size} today`;
  if (move.kind === "day" && move.day === today) return flat(move.pct) ? "the stock closed flat today" : `the stock closed ${upDown(move.pct)} ${size} today`;
  const verb = flat(move.pct) ? "barely moved" : `${move.pct > 0 ? "rose" : "fell"} ${size}`;
  if (move.kind === "two_days") return `the stock ${verb} over the two sessions around it`;
  return `the stock ${verb} ${move.nextDay ? "the next day" : "on the day"}`;
}

/** Against the usual report move: "about 2.3 times its usual 11% move after a report". Empty without enough history. */
export function usualClause(move: ResultMove): string {
  const usual = move.usualPct;
  if (usual === null || !(usual > 0) || move.usualCount < MIN_USUAL || flat(move.pct)) return "";
  const ratio = Math.abs(move.pct) / usual;
  const its = `its usual ${pctWords(usual)} move after a report`;
  if (ratio >= 2) return `about ${ratio.toFixed(1).replace(/\.0$/, "")} times ${its}`;
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
    const yoy = read.revenue.yoyPct;
    return `${name} reported revenue of ${revenueWords(read.revenue.value)}${yoy !== null && !flat(yoy) ? `, ${upDown(yoy)} ${pctWords(yoy)} from a year ago` : ""}`;
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

/** The call line: whether the results moved our call. */
export function callLine(call: ResultCall, today: string): string {
  if (call.status === "changed") return `We moved our call from ${call.from} to ${call.call} ${call.on === today ? "today" : `on ${shortDay(call.on)}`} after the results.`;
  if (call.status === "held") return `Our call is still ${call.call} after the results.`;
  return `Our call is ${call.call}.`;
}

/** The highlighted fact for a card or a row: "Beat by 18%, up 26% today". Null when there are no figures. */
export function resultFact(read: ResultRead, today: string): string | null {
  const parts: string[] = [];
  if (read.eps) parts.push(cap(verdictPhrase(read.eps)));
  else if (read.revenue && read.revenue.yoyPct !== null) parts.push(`Revenue ${flat(read.revenue.yoyPct) ? "flat" : `${upDown(read.revenue.yoyPct)} ${pctWords(read.revenue.yoyPct)}`} on a year ago`);
  else if (read.guidance) parts.push(cap(GUIDANCE_CLAUSE[read.guidance.change]));
  if (parts.length === 0) return null;
  if (read.move) parts.push(moveShort(read.move, today));
  return parts.join(", ");
}

export function resultTone(read: ResultRead): "up" | "down" | "flat" {
  if (read.eps) return read.eps.verdict === "beat" ? "up" : read.eps.verdict === "miss" ? "down" : "flat";
  if (read.guidance?.change === "raised") return "up";
  if (read.guidance?.change === "lowered") return "down";
  return "flat";
}

export type FigureCell = { label: string; value: string; sub: string; tone: "up" | "down" | "flat" };

/** The compact row of figures: EPS against the estimate, revenue, the outlook, the stock's move. */
export function figureCells(read: ResultRead, today: string): FigureCell[] {
  const cells: FigureCell[] = [];
  if (read.eps) {
    const eps = read.eps;
    cells.push({ label: "EPS", value: fmtEps(eps.actual), sub: `vs ${fmtEps(eps.expected)} expected, ${verdictPhrase(eps)}`, tone: resultTone({ ...read, guidance: null }) });
  }
  if (read.revenue) {
    const yoy = read.revenue.yoyPct;
    cells.push({
      label: "Revenue",
      value: revenueWords(read.revenue.value),
      sub: yoy === null ? "No year-ago figure in the release" : flat(yoy) ? "Flat on a year ago" : `${cap(upDown(yoy))} ${pctWords(yoy)} on a year ago`,
      tone: yoy === null || flat(yoy) ? "flat" : yoy > 0 ? "up" : "down",
    });
  }
  if (read.guidance) {
    cells.push({
      label: "Outlook",
      value: guidanceWord(read.guidance),
      sub: read.guidance.first ?? "",
      tone: read.guidance.change === "raised" ? "up" : read.guidance.change === "lowered" ? "down" : "flat",
    });
  }
  if (read.move) {
    const usual = read.move.usualPct !== null && read.move.usualCount >= MIN_USUAL ? `, usually ${pctWords(read.move.usualPct)}` : "";
    cells.push({
      label: "The stock",
      value: signed(read.move.pct),
      sub: `${cap(moveWhen(read.move, today))}${usual}`,
      tone: flat(read.move.pct) ? "flat" : read.move.pct > 0 ? "up" : "down",
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

/** "Reported Nov 10 after the close" / "Reported today before the open". */
export function reportedWords(read: Pick<ResultRead, "reportDate" | "session">, today: string): string {
  const day = read.reportDate === today ? "today" : shortDay(read.reportDate);
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
