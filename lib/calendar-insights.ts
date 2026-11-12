/**
 * The read at the top of /calendar and of a company's earnings page: what is
 * coming that matters, what has already happened, and how big a report
 * usually is for the stock. Plain rules over the agenda rows and the stored
 * reactions; nothing here is estimated.
 */
import type { ReportContext } from "@/lib/calendar";
import { byMarketCap, resultWord, surprisePctOf, type CalendarItem, type EarningsItem, type EconomicItem, type IpoItem } from "@/lib/calendar-shared";
import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { absPct, compactMoney, countWord, isNum, listNames, shortDay, signedPct, weekdayOf } from "@/lib/read-format";

/** Mean absolute daily return over the last `sessions` closes. Null with too little history. */
export function typicalDailyMove(closes: number[], sessions = 120): number | null {
  const tail = closes.filter((value) => Number.isFinite(value) && value > 0).slice(-(sessions + 1));
  if (tail.length < 30) return null;
  let sum = 0;
  for (let index = 1; index < tail.length; index += 1) sum += Math.abs(tail[index]! / tail[index - 1]! - 1);
  return (sum / (tail.length - 1)) * 100;
}

const SESSION_WORDS: Record<string, string> = { bmo: "before the open", amc: "after the close" };

/** "today", "tomorrow", "Thursday" within a week, "Nov 20" beyond. */
export function whenWord(day: string, today: string): string {
  const gap = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (gap === 0) return "today";
  if (gap === 1) return "tomorrow";
  if (gap > 1 && gap < 7) return weekdayOf(day);
  return shortDay(day);
}

/** "on Thursday", "on Nov 19", but plain "today" and "tomorrow". */
function onWhen(when: string): string {
  return when === "today" || when === "tomorrow" ? when : `on ${when}`;
}

function timeWord(item: EarningsItem): string {
  return SESSION_WORDS[item.session] ?? "";
}

function capWord(item: EarningsItem): string {
  return isNum(item.marketCap) ? ` (${compactMoney(item.marketCap)})` : "";
}

function displayName(item: EarningsItem): string {
  const name = item.company
    .replace(/,?\s+(inc\.?|corp\.?|corporation|incorporated|ltd\.?|plc|co\.?|company|holdings?|group|n\.?v\.?|s\.?a\.?)$/i, "")
    .replace(/,?\s+(inc\.?|corp\.?|corporation|ltd\.?)$/i, "")
    .trim();
  return name && name.length <= 28 ? name : item.ticker;
}

/**
 * Beat, miss or in line, from the reported number against the estimate shown
 * beside it. The stored label can come from a different estimate, so when both
 * numbers are here they decide; within half a percent is in line.
 */
export function surpriseOf(item: Pick<EarningsItem, "epsActual" | "epsEstimate" | "surpriseLabel" | "surprisePct">): { label: "beat" | "miss" | "in-line"; pct: number | null } | null {
  // The same verdict the calendar rows show as chips (numbers first, ±1% in line), so the read and the rows agree.
  const word = resultWord(item);
  if (word) return { label: word.tone === "up" ? "beat" : word.tone === "down" ? "miss" : "in-line", pct: surprisePctOf(item) };
  if (item.surpriseLabel === "beat" || item.surpriseLabel === "miss" || item.surpriseLabel === "in-line") return { label: item.surpriseLabel, pct: item.surprisePct };
  return null;
}

export type CalendarReadInput = {
  items: CalendarItem[];
  today: string;
  /** "this week", "next week", "this month": the window the agenda shows. */
  period: string;
  /** Tickers the signed-in person tracks; null signed out or with none. */
  mine: Set<string> | null;
  /** Last earnings move and normal-day size per ticker, for the names the read talks about. */
  context?: Record<string, ReportContext>;
  /** Link to the agenda filtered to the person's stocks. */
  mineHref?: string;
  /** The current time, so a release earlier today reads in the past tense. Defaults to now. */
  now?: Date;
  /** The page shows the biggest reports still to come as cards of their own, so the read leaves out its card on them. */
  biggestShown?: boolean;
  /** The agenda is filtered to the person's own stocks, so the headline's count is "of your stocks". */
  onlyMine?: boolean;
};

function upcomingEarnings(items: CalendarItem[], today: string): EarningsItem[] {
  return items.filter((item): item is EarningsItem => item.kind === "earnings" && item.date >= today && item.epsActual === null).sort(byMarketCap);
}

function reportedEarnings(items: CalendarItem[], today: string): EarningsItem[] {
  return items.filter((item): item is EarningsItem => item.kind === "earnings" && (item.epsActual !== null || item.date < today) && item.date <= today);
}

/** The tickers the read will want history for: the biggest upcoming reporters and the person's own. */
export function readTickers(items: CalendarItem[], today: string, mine: Set<string> | null): string[] {
  const upcoming = upcomingEarnings(items, today);
  const own = mine ? upcoming.filter((item) => mine.has(item.ticker)) : [];
  return [...new Set([...own.slice(0, 4), ...upcoming.slice(0, 3)].map((item) => item.ticker))];
}

/** How a past report moved the stock, against its normal day: "fell 5.8% over two sessions after its Aug 12 report, about 4x a normal day". */
export function pastMoveText(context: ReportContext | undefined): string | null {
  const last = context?.last;
  if (!last) return null;
  const span = last.basis === "2d" ? " over the two days" : " the day";
  const multiple = isNum(context.typicalDayPct) && context.typicalDayPct > 0 ? Math.abs(last.pct) / context.typicalDayPct : null;
  const normal =
    multiple !== null && multiple >= 1.5
      ? `, about ${Math.round(multiple)} times its normal daily move`
      : multiple !== null && multiple < 0.8
        ? ", less than it moves on a normal day"
        : "";
  return `${last.pct >= 0 ? "rose" : "fell"} ${absPct(last.pct)}${span} after its ${shortDay(last.eventDate)} report${normal}`;
}

function mineInsight(input: CalendarReadInput): Insight | null {
  if (!input.mine || input.mine.size === 0) return null;
  const own = upcomingEarnings(input.items, input.today).filter((item) => input.mine!.has(item.ticker));
  if (own.length === 0) return mineReportedInsight(input);
  // The biggest of them carries the history line; the list reads in date order.
  const lead = own[0]!;
  const byDate = [...own].sort((a, b) => a.date.localeCompare(b.date) || byMarketCap(a, b));
  const leadMove = pastMoveText(input.context?.[lead.ticker]);
  // Names on the same day read as one group: "CBRS and NBIS Thursday".
  const days: Array<{ date: string; tickers: string[] }> = [];
  for (const item of byDate.slice(0, 4)) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) last.tickers.push(item.ticker);
    else days.push({ date: item.date, tickers: [item.ticker] });
  }
  const when = days.map((day) => `${listNames(day.tickers, 4)} ${whenWord(day.date, input.today)}`);
  const already = mineReportedLines(input);
  const alreadyText = already.length ? ` Already out: ${already.join("; ")}.` : "";
  return {
    id: "mine",
    tone: "flat",
    text: `${own.length === 1 ? "One of your stocks reports" : `${countWord(own.length)} of your stocks report`} ${input.period}: ${listNames(when)}.${leadMove ? ` ${lead.ticker} ${leadMove}.` : ""}${alreadyText}`,
    tickers: own.map((item) => item.ticker),
    action: input.mineHref ? { label: "Only my stocks", href: input.mineHref } : { label: `Open ${lead.ticker}`, href: `/calendar/earnings/${encodeURIComponent(lead.ticker)}` },
  };
}

/** When none of the person's stocks is still to report: the ones that already did, and how they moved. */
function mineReported(input: CalendarReadInput): EarningsItem[] {
  return reportedEarnings(input.items, input.today)
    .filter((item) => input.mine!.has(item.ticker) && item.epsActual !== null)
    .sort((a, b) => Math.abs(b.reaction?.pct ?? 0) - Math.abs(a.reaction?.pct ?? 0) || byMarketCap(a, b));
}

/** "CEG beat, +9.5%" for each of the person's stocks that already reported, biggest move first. */
function mineReportedLines(input: CalendarReadInput, max = 3): string[] {
  return mineReported(input)
    .slice(0, max)
    .map((item) => {
      const outcome = surpriseOf(item)?.label;
      const result = outcome === "beat" ? "beat" : outcome === "miss" ? "missed" : outcome === "in-line" ? "in line" : "reported";
      return `${item.ticker} ${result}${item.reaction ? `, ${signedPct(item.reaction.pct)}` : ""}`;
    });
}

function mineReportedInsight(input: CalendarReadInput): Insight | null {
  const done = mineReported(input);
  if (done.length === 0) return null;
  const lines = mineReportedLines(input);
  return {
    id: "mine",
    tone: "flat",
    text: `${done.length === 1 ? "One of your stocks has" : `${countWord(done.length)} of your stocks have`} reported ${input.period} and none is still to come: ${lines.join("; ")}.`,
    tickers: done.slice(0, 3).map((item) => item.ticker),
    action: input.mineHref ? { label: "Only my stocks", href: input.mineHref } : undefined,
  };
}

function biggestInsight(input: CalendarReadInput, skip: Set<string>): Insight | null {
  const next = upcomingEarnings(input.items, input.today).filter((item) => !skip.has(item.ticker));
  const lead = next[0];
  if (!lead) return null;
  const move = pastMoveText(input.context?.[lead.ticker]);
  const day = whenWord(lead.date, input.today);
  const when = [day, timeWord(lead)].filter(Boolean).join(" ");
  const runner = next[1];
  const runnerText = runner ? ` The next biggest is ${runner.ticker}, ${whenWord(runner.date, input.today)}.` : "";
  return {
    id: "biggest",
    tone: "flat",
    text: `${displayName(lead)}${capWord(lead)} is the biggest company still to report ${input.period}, ${when}.${move ? ` Last time it ${move}.` : ""}${runnerText}`,
    // The day it reports is the news here, not its size.
    figure: day ? { value: day.charAt(0).toUpperCase() + day.slice(1), label: timeWord(lead) || "reports" } : undefined,
    tickers: [lead.ticker, ...(runner ? [runner.ticker] : [])],
    action: { label: `${lead.ticker} earnings`, href: `/calendar/earnings/${encodeURIComponent(lead.ticker)}` },
  };
}

function resultsInsight(input: CalendarReadInput): Insight | null {
  const reported = reportedEarnings(input.items, input.today).filter((item) => item.epsActual !== null && item.epsEstimate !== null);
  if (reported.length < 3) return null;
  const beats = reported.filter((item) => surpriseOf(item)?.label === "beat").length;
  const misses = reported.filter((item) => surpriseOf(item)?.label === "miss").length;
  const moved = reported
    .filter((item) => item.reaction)
    .sort((a, b) => Math.abs(b.reaction!.pct) - Math.abs(a.reaction!.pct) || a.ticker.localeCompare(b.ticker))
    .slice(0, 2);
  const moves = moved.length ? ` Biggest moves after: ${listNames(moved.map((item) => `${item.ticker} ${signedPct(item.reaction!.pct)}`))}.` : "";
  const share = Math.round((beats / reported.length) * 100);
  return {
    id: "results",
    tone: beats > misses ? "up" : misses > beats ? "down" : "flat",
    text: `So far ${beats} of ${reported.length} companies beat what analysts expected (${share}%), and ${misses === 0 ? "none" : misses} fell short.${moves}`,
    tickers: moved.map((item) => item.ticker),
    action: { label: "See results", href: "/calendar?view=list&type=earnings" },
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function economicInsight(input: CalendarReadInput): Insight | null {
  const big = input.items
    .filter((item): item is EconomicItem => item.kind === "economic" && item.importance === "high" && item.date >= input.today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.timeEt ?? "").localeCompare(b.timeEt ?? ""));
  if (big.length === 0) return null;
  const list = big.slice(0, 3).map((item) => `${shortTitle(item.title)} ${whenWord(item.date, input.today)}${item.timeEt ? ` at ${fmtClock(item.timeEt)}` : ""}`);
  return {
    id: "economic",
    tone: "flat",
    text: `${big.length === 1 ? "One big data release" : `${countWord(big.length)} big data releases`} ${input.period}: ${listNames(list)}.`,
    soWhat: big.some((item) => /cpi|ppi|pce|inflation/i.test(item.title)) ? "Inflation numbers often move the whole market on the day they come out." : undefined,
    action: { label: "Economic calendar", href: "/calendar?type=economic" },
  };
}

function ipoInsight(input: CalendarReadInput): Insight | null {
  const ipos = input.items
    .filter((item): item is IpoItem => item.kind === "ipo" && item.date >= input.today && isNum(item.offerAmount))
    .sort((a, b) => (b.offerAmount ?? 0) - (a.offerAmount ?? 0));
  const top = ipos[0];
  if (!top || (top.offerAmount ?? 0) < 100_000_000) return null;
  return {
    id: "ipo",
    tone: "flat",
    text: `${top.company}${top.ticker ? ` (${top.ticker})` : ""} plans a ${compactMoney(top.offerAmount!)} IPO ${whenWord(top.date, input.today)}${isNum(top.priceLow) && isNum(top.priceHigh) ? `, priced at $${top.priceLow} to $${top.priceHigh}` : ""}.`,
    action: { label: "IPO calendar", href: "/calendar?type=ipo" },
  };
}

function shortTitle(title: string): string {
  return title.replace(/\s+inflation$/i, "").trim();
}

function fmtClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  return `${h! % 12 === 0 ? 12 : h! % 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`;
}

/** True once a release set for `today` at its New York time has passed. Only for the real today. */
function releasedAlready(item: EconomicItem, today: string, now: Date): boolean {
  if (!item.timeEt || item.date !== today) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  if (`${get("year")}-${get("month")}-${get("day")}` !== today) return false;
  const [h, m] = item.timeEt.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  return Number(get("hour")) * 60 + Number(get("minute")) >= h! * 60 + m!;
}

export function buildCalendarRead(input: CalendarReadInput): TheRead | null {
  const upcoming = upcomingEarnings(input.items, input.today);
  const reported = reportedEarnings(input.items, input.today);
  const econToday = input.items.find((item): item is EconomicItem => item.kind === "economic" && item.importance === "high" && item.date === input.today);
  if (upcoming.length === 0 && reported.length === 0 && !econToday) return null;

  const parts: string[] = [];
  const econLine = econToday
    ? `${econToday.title.trim()} numbers ${releasedAlready(econToday, input.today, input.now ?? new Date()) ? "came" : "come"} out today${econToday.timeEt ? ` at ${fmtClock(econToday.timeEt)} ET` : ""}`
    : null;
  if (upcoming.length) {
    // One idea, one number (owner rule 8): the biggest names and when, then how many are left as the one figure.
    // "Cisco Systems and Applied Materials report tomorrow, the biggest of 24 companies still to report this week."
    const leaders = upcoming.slice(0, 2);
    const sameDay = leaders.length === 2 && leaders[0]!.date === leaders[1]!.date;
    const day = (item: EarningsItem) => whenWord(item.date, input.today);
    const leadText =
      leaders.length === 1
        ? `${displayName(leaders[0]!)} reports ${onWhen(day(leaders[0]!))}`
        : sameDay
          ? `${listNames(leaders.map(displayName))} report ${onWhen(day(leaders[0]!))}`
          : `${displayName(leaders[0]!)} reports ${onWhen(day(leaders[0]!))} and ${displayName(leaders[1]!)} ${onWhen(day(leaders[1]!))}`;
    const still = reported.length > 0 ? "still to report" : "reporting";
    // Filtered to the person's own stocks, the count is theirs, not the market's.
    const one = input.onlyMine ? "one of your stocks" : "company";
    const many = input.onlyMine ? "of your stocks" : "companies";
    const rest =
      upcoming.length === 1
        ? `the only ${one} ${still} ${input.period}`
        : upcoming.length === 2
          ? `the only two ${many} ${still} ${input.period}`
          : `the biggest of ${upcoming.length} ${many} ${still} ${input.period}`;
    parts.push(`${leadText}, ${rest}`);
  } else if (reported.length) {
    const beats = reported.filter((item) => surpriseOf(item)?.label === "beat").length;
    parts.push(`${reported.length} companies reported, ${beats} beat estimates`);
  }
  // The earnings lead the headline; a big release today is the line under it (or the headline on a day without earnings).
  if (parts.length === 0 && econLine) parts.push(econLine);
  const headline = parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}.`).join(" ");
  const economic = economicInsight(input);
  const econPoint: Insight | null =
    econLine && parts[0] !== econLine
      ? {
          ...(economic ?? { id: "economic", tone: "flat" as const }),
          text: `${econLine.charAt(0).toUpperCase()}${econLine.slice(1)}.`,
          // The inflation note belongs to today's line only when today's release is the inflation one.
          soWhat: econToday && /cpi|ppi|pce|inflation/i.test(econToday.title) ? economic?.soWhat : undefined,
        }
      : null;

  const mine = mineInsight(input);
  const skip = new Set(mine?.tickers ?? []);
  return {
    headline,
    insights: pickInsights([
      mine,
      econPoint,
      input.biggestShown ? null : biggestInsight(input, skip),
      resultsInsight(input),
      // The week's other big releases still get their line when today's is already said.
      econPoint ? (economic && !economic.text.startsWith("One big") ? { ...economic, id: "economic-week", soWhat: econToday && /cpi|ppi|pce|inflation/i.test(econToday.title) ? undefined : economic.soWhat } : null) : economic,
      ipoInsight(input),
    ], econPoint ? 4 : 3),
  };
}

/* ── the biggest reports still to come, as cards ───────────────────────── */

export type BigReport = {
  item: EarningsItem;
  /** The stock's move after its last report: the card's one figure. */
  lastPct: number;
  /** When it reports: "tomorrow after the close", "Thursday before the open". */
  when: string;
  /** How big its last report was against a normal day, without the figure the card already shows. */
  size: string;
};

/** The tickers the cards want history for: the biggest reports still to come, after the read's own. */
export function bigReportTickers(items: CalendarItem[], today: string, max = 6): string[] {
  return upcomingEarnings(items, today).slice(0, max).map((item) => item.ticker);
}

/**
 * The biggest companies still to report in the window, by market value, each with the move after its last report as
 * its one figure, when it reports, and how that move compares with a normal day (owner rules 3 and 7). Only the `max`
 * biggest are looked at, so a small company never stands in for one whose history is missing; a report with no last
 * move we hold gets no card rather than an empty one (rule 4).
 */
export function biggestReports(items: CalendarItem[], today: string, context: Record<string, ReportContext>, max = 6): BigReport[] {
  const out: BigReport[] = [];
  for (const item of upcomingEarnings(items, today).slice(0, max)) {
    const known = context[item.ticker];
    if (!known?.last || !isNum(known.last.pct)) continue;
    const last = known.last;
    const multiple = isNum(known.typicalDayPct) && known.typicalDayPct > 0 ? Math.abs(last.pct) / known.typicalDayPct : null;
    // The figure already says the move, so the words say only how big it was (owner: each move said once).
    const on = `Its last report, on ${shortDay(last.eventDate)},`;
    const size =
      multiple === null
        ? `Its last report was on ${shortDay(last.eventDate)}.`
        : multiple >= 1.5
          ? `${on} moved it about ${Math.round(multiple)} times as much as a normal day.`
          : multiple < 0.8
            ? `${on} moved it less than a normal day does.`
            : `${on} moved it about as much as a normal day.`;
    out.push({ item, lastPct: last.pct, when: [whenWord(item.date, today), timeWord(item)].filter(Boolean).join(" "), size });
  }
  return out;
}

/* ── one company's earnings page ───────────────────────────────────────── */

export function buildEarningsDetailRead(input: {
  ticker: string;
  name: string;
  events: EarningsItem[];
  today: string;
  context: ReportContext | undefined;
}): TheRead | null {
  const { ticker, events, today, context } = input;
  const next = events.filter((item) => item.date >= today && item.epsActual === null).sort((a, b) => a.date.localeCompare(b.date))[0];
  const past = events.filter((item) => item.epsActual !== null).sort((a, b) => b.date.localeCompare(a.date));
  const last = past[0];
  const parts: string[] = [];
  if (next) {
    const gap = Math.round((Date.parse(`${next.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    const when = gap <= 6 ? whenWord(next.date, today) : `on ${shortDay(next.date)}, in ${gap} days`;
    parts.push(`${ticker} reports ${when}${timeWord(next) ? ` ${timeWord(next)}` : ""}${isNum(next.epsEstimate) ? `, with EPS expected at $${next.epsEstimate.toFixed(2)}` : ""}`);
  } else if (last) {
    const outcome = surpriseOf(last)?.label;
    parts.push(`${ticker} last reported on ${shortDay(last.date)}${outcome === "beat" || outcome === "miss" ? ` and ${outcome === "beat" ? "beat" : "missed"} the estimate` : ""}`);
  }
  if (parts.length === 0) return null;

  const insights: Array<Insight | null> = [];
  const move = pastMoveText(context);
  if (move) {
    insights.push({
      id: "last-move",
      tone: context!.last!.pct >= 0 ? "up" : "down",
      text: `The stock ${move}.`,
    });
  }
  const surprise = last ? surpriseOf(last) : null;
  if (last && surprise) {
    const reaction = last.reaction;
    const disagree = reaction && ((surprise.label === "beat" && reaction.pct < 0) || (surprise.label === "miss" && reaction.pct > 0));
    const verb = surprise.label === "beat" ? "beat" : surprise.label === "miss" ? "missed" : "matched";
    const size = surprise.label !== "in-line" && isNum(surprise.pct) ? ` by ${absPct(surprise.pct, 0)}` : "";
    insights.push({
      id: "surprise",
      tone: surprise.label === "beat" ? "up" : surprise.label === "miss" ? "down" : "flat",
      text: `Last quarter's earnings per share ${verb} the estimate${size}${
        reaction ? `${disagree ? ", yet" : " and"} the stock ${reaction.pct >= 0 ? "rose" : "fell"}${move ? "" : ` ${absPct(reaction.pct)}`}` : ""
      }.`,
      soWhat: disagree ? "The headline number was not what the market traded on." : undefined,
    });
  }
  if (!move && isNum(context?.typicalDayPct)) {
    insights.push({
      id: "normal",
      tone: "flat",
      text: `Over the last six months ${ticker} has moved about ${context!.typicalDayPct!.toFixed(1)}% on a normal day.`,
    });
  }
  return { headline: `${parts[0]}.`, insights: pickInsights(insights) };
}
