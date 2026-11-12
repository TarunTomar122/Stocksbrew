import type { Insight, TheRead } from "@/lib/insights";
import { callHref, flagReportStep, flagWords } from "@/lib/portfolio-home/example-check";

import { isUnread, shortDay } from "./merge";
import type { InboxItem, InboxStockRead, UpcomingLine, UpcomingReport } from "./types";
import { listTickers, moveSentence, pastWhen, reportSentence, UNUSUAL_MOVE } from "./words";

/**
 * The inbox's read, above the list: one headline on what is new since the
 * person last looked, then up to three cards on what the two weeks add up to
 * (calls that moved, what agents flagged, what investors and insiders did).
 * Counted from the items themselves, so every number is a row below. Pure.
 */

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Tickers of these items, first seen first, without repeats. */
function tickersOf(items: InboxItem[], max = 4): string[] {
  const out: string[] = [];
  for (const item of items) for (const ticker of item.tickers) if (!out.includes(ticker)) out.push(ticker);
  return out.slice(0, max);
}

/** What happened, in parts of one sentence: "our call moved on 3 of your stocks", "your agents flagged 2 things". */
function parts(items: InboxItem[], example: boolean): string[] {
  const count = (kind: InboxItem["kind"]) => items.filter((item) => item.kind === kind && !item.quiet).length;
  const whose = example ? "the example's" : "your";
  const out: string[] = [];
  const calls = count("call");
  if (calls > 0) out.push(`our call moved on ${calls} of ${whose} stocks`);
  // Moves are counted by stock (one stock's move and its price level are one stock); other findings one by one.
  const moved = new Set(items.filter((item) => item.kind === "agent" && item.move).flatMap((item) => item.tickers)).size;
  const flags = items.filter((item) => item.kind === "agent" && !item.quiet && !item.move).length;
  // "the example portfolio's" once is enough; after that it is "its".
  const agentsOf = example ? (out.length > 0 ? "its" : "the example portfolio's") : "your";
  if (moved > 0) out.push(`${agentsOf} agents flagged ${moved === 1 ? `a move in one of ${whose} stocks` : `moves in ${moved} of ${whose} stocks`}`);
  if (flags > 0) out.push(`${moved > 0 ? "they" : `${agentsOf} agents`} flagged ${flags} ${moved > 0 ? "more " : ""}${plural(flags, "thing", "things")}`);
  const alerts = count("alert");
  if (alerts > 0) out.push(`${alerts} ${plural(alerts, "price alert", "price alerts")} went off`);
  const reasons = count("reason");
  if (reasons > 0) out.push(`${reasons} ${plural(reasons, "reason for owning a stock", "reasons for owning stocks")} changed`);
  const filings = count("follow");
  if (filings > 0) out.push(`investors you follow filed ${filings} ${plural(filings, "report", "reports")}`);
  // One item per stock per day, so the same stock bought on two days is still one stock.
  const insiders = new Set(items.filter((item) => item.kind === "insider").flatMap((item) => item.tickers)).size;
  if (insiders > 0) out.push(`insiders bought ${insiders === 1 ? `one of ${whose} stocks` : `${insiders} of ${whose} stocks`}`);
  const strategies = count("strategy");
  if (strategies > 0) out.push(`${strategies} ${plural(strategies, "strategy", "strategies")} you follow rebalanced`);
  if (count("memo") > 0) out.push("your weekly memo is ready");
  return out;
}

function callsCard(items: InboxItem[], example: boolean): Insight | null {
  const calls = items.filter((item) => item.kind === "call");
  if (calls.length === 0) return null;
  const up = calls.filter((item) => item.tone === "up").length;
  const down = calls.filter((item) => item.tone === "down").length;
  const whose = example ? "the example's" : "your";
  const split =
    up > 0 && down > 0
      ? `: ${up} toward Buy more and ${down} toward Sell some`
      : up > 0
        ? calls.length === 1
          ? ", toward Buy more"
          : `, ${up === calls.length ? "all of them" : `${up} of them`} toward Buy more`
        : down > 0
          ? calls.length === 1
            ? ", toward Sell some"
            : `, ${down === calls.length ? "all of them" : `${down} of them`} toward Sell some`
          : "";
  // Lead with the stocks the change matters most for: the ones that moved toward selling.
  const ordered = [...calls.filter((item) => item.tone === "down"), ...calls.filter((item) => item.tone !== "down")];
  return {
    id: "inbox-calls",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: `Our call moved on ${calls.length === 1 ? `one of ${whose} stocks` : `${calls.length} of ${whose} stocks`} in the last two weeks${split}.`,
    tickers: tickersOf(ordered),
    figure: { value: String(calls.length), label: plural(calls.length, "call moved", "calls moved") },
  };
}

/** How many times its normal day a move is, or null when the stock's normal day is not known. */
function timesNormal(item: InboxItem): number | null {
  const move = item.move;
  return move && move.normalPct !== null && move.normalPct > 0 ? Math.abs(move.pct) / move.normalPct : null;
}

const UNUSUAL = UNUSUAL_MOVE;

/** The moves on the newest day any move closed on: one per stock (its biggest), biggest first. */
function latestMoves(items: InboxItem[]): { day: string; moves: InboxItem[] } | null {
  const withMove = items.filter((item) => item.move && item.tickers.length === 1);
  if (withMove.length === 0) return null;
  const day = withMove.map((item) => item.move!.day).sort().pop()!;
  const byStock = new Map<string, InboxItem>();
  for (const item of withMove) {
    if (item.move!.day !== day) continue;
    const seen = byStock.get(item.tickers[0]!);
    // The move row over the price-level row (it carries the reason), then the bigger move.
    const better = !seen || (item.id.startsWith("move:") !== seen.id.startsWith("move:") ? item.id.startsWith("move:") : Math.abs(item.move!.pct) > Math.abs(seen.move!.pct));
    if (better) byStock.set(item.tickers[0]!, item);
  }
  const moves = [...byStock.values()].sort((a, b) => Math.abs(b.move!.pct) - Math.abs(a.move!.pct) || a.tickers[0]!.localeCompare(b.tickers[0]!));
  return { day, moves };
}

const signedPct = (pct: number) => `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;

/**
 * The biggest move on the newest day, against that stock's normal day, with its confirmed reason when there is one
 * (and nothing when there is not); then the other stocks that moved at least twice their normal day.
 */
function movesCard(items: InboxItem[], today: string | null, told: string | null): Insight | null {
  const latest = latestMoves(items);
  if (!latest) return null;
  const lead = latest.moves[0]!;
  const move = lead.move!;
  const ticker = lead.tickers[0]!;
  // The headline already says this move: the card gives its baseline instead of the same sentence again.
  const said = told === ticker && move.normalPct !== null;
  const unusual = latest.moves.filter((item) => item !== lead && (timesNormal(item) ?? 0) >= UNUSUAL).map((item) => item.tickers[0]!);
  const also = unusual.length > 0 ? `${listTickers(unusual)} also moved at least twice as much as usual.` : null;
  return {
    id: "inbox-moves",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: said ? `A normal day for ${ticker} is a move of about ${move.normalPct!.toFixed(1)}% either way.` : moveSentence(ticker, move.pct, move.day, move.normalPct, today),
    soWhat: [lead.id.startsWith("move:") ? lead.detail : null, also].filter(Boolean).join(" ") || undefined,
    tickers: [ticker, ...unusual].slice(0, 4),
    figure: { value: signedPct(move.pct), tone: move.pct >= 0 ? "up" : "down" },
    action: { label: `Open ${ticker}`, href: `/stock/${encodeURIComponent(ticker)}` },
  };
}

/** A move one of the agents flagged (lib/inbox/words.ts findingItems): its row is the agent's, keyed `move:`. */
function isFlaggedMove(item: InboxItem): boolean {
  return item.kind === "agent" && item.id.startsWith("move:") && item.move !== null;
}

/** "16%", "3.2%": as the report history words say it (whole numbers once a move is big). */
function usualWord(pct: number): string {
  return Math.abs(pct) >= 10 ? `${Math.round(Math.abs(pct))}%` : `${Math.abs(pct).toFixed(1).replace(/\.0$/, "")}%`;
}

function dayGap(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/**
 * The report to watch, said as prep with its own history: of the week's reporters, the one that moves most on its
 * reports (the soonest when none has a measured history); the rest of the week's reporters after it.
 */
function reportsCard(upcoming: UpcomingReport[], today: string, told: string | null): Insight | null {
  if (upcoming.length === 0) return null;
  const measured = upcoming.filter((report) => report.history && report.usualPct !== null);
  const lead = measured.length > 0 ? [...measured].sort((a, b) => b.usualPct! - a.usualPct!)[0]! : upcoming[0]!;
  const others = upcoming.filter((report) => report !== lead).map((report) => report.ticker);
  const gap = dayGap(lead.date, today);
  // The headline already says when this one reports: the card says how it has moved on reports, or is left out.
  const said = told === lead.ticker;
  // Nothing to add to the headline (no history to tell): no card, rather than its sentence again.
  if (said && !lead.history) return null;
  return {
    id: "inbox-reports",
    tone: "flat",
    text: said && lead.history ? `${lead.ticker} ${lead.history}.` : reportSentence(lead, today),
    soWhat: others.length > 0 ? `${listTickers(others)} also ${others.length === 1 ? "reports" : "report"} in the next week.` : undefined,
    tickers: [lead.ticker, ...others].slice(0, 4),
    // Its usual move on a report, the number to prepare for; the day only when there is no history.
    figure: lead.history && lead.usualPct !== null ? { value: usualWord(lead.usualPct) } : { value: gap === 0 ? "Today" : gap === 1 ? "Tomorrow" : shortDay(lead.date) },
    action: { label: `Open ${lead.ticker}`, href: `/stock/${encodeURIComponent(lead.ticker)}` },
  };
}

function agentsCard(items: InboxItem[], example: boolean): Insight | null {
  const flags = items.filter((item) => item.kind === "agent" && !item.quiet);
  const quiet = items.filter((item) => item.kind === "agent" && item.quiet);
  if (flags.length === 0 && quiet.length === 0) return null;
  const whose = example ? "The example portfolio's" : "Your";
  if (flags.length === 0) {
    return {
      id: "inbox-agents",
      tone: "flat",
      text: `${whose} agents checked ${quiet.length === 1 ? "once" : `on ${quiet.length} days`} in the last two weeks and found nothing that needs ${example ? "a look" : "you"}.`,
      figure: { value: "0", label: "things flagged" },
    };
  }
  // One finding is already a row in the list under the read, sentence and all: a card would say it twice (owner
  // rule 1). The headline counts it, the row tells it.
  if (flags.length === 1) return null;
  // The card carries the latest finding itself (its move, its sentence, its stock), not the count the headline
  // already says (Nov 11: "flagged 1 thing" three times over).
  const latest = flags[0]!;
  const finding = latest.text.replace(/^.*?\bagent flagged this:\s*/, "").trim() || latest.text;
  const move = signedMove(finding);
  return {
    id: "inbox-agents",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: finding,
    tickers: latest.tickers.slice(0, 4),
    figure: move
      ? { value: move.value, label: `latest of ${flags.length} flags`, tone: move.tone }
      : null,
  };
}

/**
 * The first percent move a sentence states, signed by its own words: "NVDA fell 5.47% in a day" is −5.47%. Null when
 * there is no percent, or when an unsigned one has no direction word to sign it.
 */
export function signedMove(text: string): { value: string; tone: "up" | "down" } | null {
  const match = /([+\-−]?)(\d+(?:\.\d+)?)%/.exec(text);
  if (!match) return null;
  const [, sign, digits] = match;
  const before = text.slice(0, match.index);
  let down: boolean;
  if (sign === "+") down = false;
  else if (sign) down = true;
  else {
    // The direction word nearest before the number, in the same sentence: "After a lower open, NVDA rose 4.2%" is up.
    const clause = before.split(/[.!?]\s/).pop() ?? before;
    const words = [...clause.matchAll(/\b(fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower|rose|rises|jumped|jumps|gained|gains|climbed|surged|soared|rallied|up|higher)\b/gi)];
    const last = words[words.length - 1]?.[1]?.toLowerCase();
    if (!last) return null;
    down = /^(?:fell|falls|dropped|drops|slid|slipped|sank|plunged|tumbled|declined|lost|down|lower)$/.test(last);
  }
  return { value: `${down ? "−" : "+"}${digits}%`, tone: down ? "down" : "up" };
}

function investorsCard(items: InboxItem[]): Insight | null {
  const follow = items.filter((item) => item.kind === "follow");
  const insiders = items.filter((item) => item.kind === "insider");
  if (follow.length === 0 && insiders.length === 0) return null;
  const bought = tickersOf(insiders, 99);
  if (bought.length > 0 && bought.length >= follow.length) {
    return {
      id: "inbox-insiders",
      tone: "flat",
      text: `Insiders bought shares of ${bought.length === 1 ? bought[0] : `${bought.length} of your stocks`} in the last two weeks${follow.length > 0 ? `, and investors you follow filed ${follow.length} ${plural(follow.length, "report", "reports")}` : ""}.`,
      tickers: bought.slice(0, 4),
      figure: { value: String(bought.length), label: plural(bought.length, "stock insiders bought", "stocks insiders bought") },
    };
  }
  return {
    id: "inbox-follow",
    // Flat on purpose: inbox cards carry no coloured top edge (owner, Nov 11).
    tone: "flat",
    text: `Investors you follow filed ${follow.length} ${plural(follow.length, "report", "reports")} in the last two weeks.`,
    tickers: tickersOf(follow),
    figure: { value: String(follow.length), label: plural(follow.length, "report", "reports") },
  };
}

/**
 * The headline's lead when the news is about prices: how many stocks moved at least twice their normal day on the
 * newest day (one stock: its move itself), and the soonest report coming up. Null when neither applies.
 */
type PriceLead = { text: string; sub: string | null; moveTicker: string | null; moveId: string | null; reportTicker: string | null };

function priceLead(fresh: InboxItem[], upcoming: UpcomingReport[], today: string | null, example: boolean): PriceLead | null {
  const whose = example ? "the example portfolio's" : "your";
  const latest = latestMoves(fresh);
  let moves: string | null = null;
  let moveTicker: string | null = null;
  let moveId: string | null = null;
  if (latest) {
    const unusual = latest.moves.filter((item) => (timesNormal(item) ?? 0) >= UNUSUAL);
    if (unusual.length === 1) {
      const only = unusual[0]!;
      moveTicker = only.tickers[0]!;
      moveId = only.id;
      // A move an agent flagged is said as the flag, word for word as the briefing's card says it ("Your agent flagged
      // NVDA's 5.5% drop on Nov 10."), so the two pages read as one thread (judges, ship 44). Its normal day is on
      // the card under the headline when that card is about it.
      moves = (isFlaggedMove(only) ? flagWords({ ticker: moveTicker, pct: only.move!.pct, day: only.move!.day }) : moveSentence(moveTicker, only.move!.pct, latest.day, only.move!.normalPct, today)).replace(/\.$/, "");
    }
    else if (unusual.length > 1) moves = `${unusual.length} of ${whose} stocks moved at least twice as much as usual ${pastWhen(latest.day, today)}`;
  }
  const next = today ? upcoming[0] : undefined;
  // The report card tells the one to watch; the headline says when the week's reports start, or how many there are.
  const named = next && today && (upcoming.length === 1 || !moves);
  let report = next && today ? (named ? reportSentence({ ...next, history: null }, today).replace(/\.$/, "") + (upcoming.length > 1 ? `, the first of ${upcoming.length} reports on ${whose} stocks in the next week` : "") : `${upcoming.length} of ${whose} stocks report earnings in the next week`) : null;
  // One idea in the headline (owner rule 8): the unusual move leads, and the report date goes in the line under it,
  // "It reports on Nov 17 after the close.", not NVDA twice.
  if (report && moves && named && moveTicker === next!.ticker) report = report.replace(new RegExp(`^${next!.ticker} `), "it ");
  const reportTicker = named ? next!.ticker : null;
  const text = moves ? `${moves}.` : report ? `${report}.` : null;
  const sub = moves && report ? `${capitalise(report)}.` : null;
  return text ? { text, sub, moveTicker, moveId, reportTicker } : null;
}

/**
 * What the read says itself, so the rows under it do not say it again (owner rule 1): the move rows whose sentence the
 * headline or the moves card tells (`moveIds`), the one whose confirmed reason the card gives (`reasonIds`), and the
 * stocks whose report history the reports card gives (`reports`). A report only the headline names keeps its history
 * in its row, since the headline says only the day.
 */
export type InboxTold = {
  moveIds: string[];
  reasonIds: string[];
  reports: string[];
  /** Stocks whose report day the headline or the line under it names. */
  reportDays?: string[];
};

/**
 * The move and the report coming up on one stock, when the read tells both: one card for the stock with its two
 * figures (the move against a normal day, the usual move on a report) instead of two cards wearing the same logo
 * (owner rule 1). Null otherwise.
 */
function stockRead(moves: Insight | null, reports: Insight | null, items: InboxItem[], upcoming: UpcomingReport[]): InboxStockRead | null {
  const ticker = moves?.tickers?.[0];
  if (!moves || !reports || !ticker || reports.tickers?.[0] !== ticker) return null;
  const lead = latestMoves(items)?.moves[0];
  const report = upcoming.find((entry) => entry.ticker === ticker);
  if (!lead?.move || lead.tickers[0] !== ticker || !report || report.usualPct === null) return null;
  const move = lead.move;
  // A report ahead: the step is our call, and the card opens the stock right at it, as the briefing's card on the same
  // stock does (judges, ship 44: one tap from the flag to the call).
  return {
    ticker,
    href: callHref(ticker),
    figures: [
      {
        value: signedPct(move.pct),
        tone: move.pct > 0 ? "up" : move.pct < 0 ? "down" : "flat",
        text: move.normalPct !== null ? `A normal day is a move of about ${move.normalPct.toFixed(1)}% either way.` : moves.text,
      },
      { value: usualWord(report.usualPct), tone: "flat", text: "Its usual move on a report." },
    ],
    // What else the two cards said (a confirmed reason, other unusual moves, the week's other reports), then the step.
    note: [moves.soWhat, reports.soWhat, flagReportStep(ticker)].filter(Boolean).join(" "),
  };
}

export function inboxRead(
  items: InboxItem[],
  seenAt: string | null,
  example: boolean,
  context: { upcoming?: UpcomingReport[]; today?: string } = {},
): TheRead | null {
  return inboxReadTold(items, seenAt, example, context).read;
}

export function inboxReadTold(
  items: InboxItem[],
  seenAt: string | null,
  example: boolean,
  context: { upcoming?: UpcomingReport[]; today?: string } = {},
): { read: TheRead | null; told: InboxTold; stock: InboxStockRead | null } {
  const told: InboxTold = { moveIds: [], reasonIds: [], reports: [], reportDays: [] };
  const today = context.today ?? null;
  const upcoming = today ? (context.upcoming ?? []) : [];
  if (items.length === 0 && upcoming.length === 0) return { read: null, told, stock: null };
  const fresh = example || !seenAt ? items : items.filter((item) => isUnread(item, seenAt));
  // Two things at most, so the headline stays one short line; the cards and the list carry the rest.
  const said = parts(fresh, example).slice(0, 2);
  const lead = priceLead(fresh, upcoming, today, example);
  const headline =
    lead?.text ??
    (example
      ? said.length > 0
        ? `In the last two weeks, ${joinParts(said)}.`
        : "The example portfolio's agents checked and found nothing that needs a look."
      : said.length > 0
        ? `Since you last looked, ${joinParts(said)}.`
        : "Nothing new since you last looked.");
  // Prices first (the move, the report coming up), then what else the two weeks add up to; three cards at most.
  const moves = movesCard(items, today, lead?.moveTicker ?? null);
  const reports = today ? reportsCard(upcoming, today, lead?.reportTicker ?? null) : null;
  const rest = [callsCard(items, example), moves ? null : agentsCard(items, example), investorsCard(items)].filter((card): card is Insight => card !== null);
  // The move and the report on the same stock are one card with two figures, not two cards with one logo.
  const stock = stockRead(moves, reports, items, upcoming);
  const insights = (stock ? rest : [moves, reports, ...rest]).filter((card): card is Insight => card !== null).slice(0, stock ? 2 : 3);
  if (lead?.moveId) told.moveIds.push(lead.moveId);
  if (lead?.reportTicker) told.reportDays!.push(lead.reportTicker);
  if (moves && (stock || insights.includes(moves))) {
    const leadMove = latestMoves(items)?.moves[0];
    if (leadMove && !told.moveIds.includes(leadMove.id)) told.moveIds.push(leadMove.id);
    // The card gives the lead's confirmed reason (movesCard's soWhat); the headline never does.
    if (leadMove?.id.startsWith("move:") && leadMove.detail) told.reasonIds.push(leadMove.id);
  }
  // The card tells the history only when it has one (reportsCard): then its row says just the day.
  const reportLead = reports && (stock || insights.includes(reports)) ? upcoming.find((report) => report.ticker === reports.tickers?.[0]) : undefined;
  if (reportLead?.history) told.reports.push(reportLead.ticker);
  return { read: { headline: capitalise(headline), ...(lead?.sub ? { sub: lead.sub } : {}), insights }, told, stock };
}

/**
 * The rows as the page draws them once the read has spoken: a move the read tells is just the fact ("NVDA fell 5.5%
 * yesterday.", no normal-day comparison or reason, which the read gives), and a report the read tells is just its day.
 * Upcoming reports come as finished sentences, so the browser never loads the wording.
 */
export function rowsAfterRead(
  items: InboxItem[],
  upcoming: UpcomingReport[],
  told: InboxTold,
  today: string,
  options: { example?: boolean } = {},
): { items: InboxItem[]; upcoming: UpcomingLine[] } {
  const rows = rowsAfterReadAll(items, upcoming, told, today);
  // "2 example agents checked … and found nothing" says nothing a reader can use (judges, ship 39): the example never
  // shows it, and your own inbox shows it only when it is the one row left, so an empty-looking day still says the
  // agents ran. It still counts as shown, so opening the page reads it.
  const quiet = (item: InboxItem) => item.kind === "agent" && Boolean(item.quiet) && !item.told;
  const others = rows.items.some((item) => !item.told && !quiet(item)) || rows.upcoming.length > 0;
  if (!options.example && !others) return rows;
  return { ...rows, items: rows.items.map((item) => (quiet(item) ? { ...item, told: true } : item)) };
}

function rowsAfterReadAll(items: InboxItem[], upcoming: UpcomingReport[], told: InboxTold, today: string): { items: InboxItem[]; upcoming: UpcomingLine[] } {
  const moveIds = new Set(told.moveIds);
  const reasonIds = new Set(told.reasonIds);
  const reports = new Set(told.reports);
  const days = new Set(told.reportDays ?? []);
  return {
    items: items.map((item) => {
      if (!(moveIds.has(item.id) && item.id.startsWith("move:") && item.move && item.tickers.length === 1)) return item;
      const detail = reasonIds.has(item.id) ? null : item.detail;
      // Nothing left that the read does not say (the move, and its reason when it has one): no row for it (owner
      // rule 1). It still counts as shown, so opening the page reads it.
      return { ...item, text: moveSentence(item.tickers[0]!, item.move.pct, item.move.day, null, today), detail, ...(detail ? {} : { told: true }) };
    }),
    upcoming: upcoming
      // The read names its day, and gives its history or it has none: the row would only say it again.
      .filter((report) => !(days.has(report.ticker) && (reports.has(report.ticker) || !report.history)))
      .map((report) =>
        reports.has(report.ticker)
          ? { ticker: report.ticker, date: report.date, text: reportSentence({ ...report, history: null }, today), note: null }
          : { ticker: report.ticker, date: report.date, text: reportSentence(report, today), note: report.vsDay ? `That is ${report.vsDay} for it.` : null },
      ),
  };
}
