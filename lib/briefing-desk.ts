/**
 * The agent's desk at the top of the briefing (judge90, Nov 13): each of the day's findings shows what the agent did
 * about it. A finding with a proposal waiting is shown as that proposal (components/proposals, its own Accept and
 * Dismiss); one the person already answered says what they decided and when; a move or report the agent checked and
 * found nothing to do about says so, with the one fact that settled it.
 *
 * Pure: no React, no I/O, no clock (lib/briefing-desk.test.ts). The page works out the modules first (lib/briefing-face.ts),
 * then this takes from them the stocks the desk now tells, so a stock still shows once.
 *
 * Honesty rules:
 * - A finding is paired with a proposal only on the same stock, a kind that is about the same event, and (for the
 *   day's events) a proposal about the last few days. Anything else on that stock is left where it was.
 * - "Checked: nothing to do" only when the agent's queue was read, nothing waits or was answered on that stock, its
 *   call did not change today, it is not at or through its own level, and the fact is from the price on the card.
 */

import type { DoCard, LevelRow, MovedCard } from "@/lib/briefing-face";
import { AT_LEVEL_PCT, callWordOf, levelLine, ownLevel, tradingDayBefore } from "@/lib/briefing-face";
import type { BriefingItem, BriefingPosition } from "@/lib/briefing";
import type { OvernightCard } from "@/lib/briefing-overnight";
import { daysFromToday, etDayOf, onDayWords } from "@/lib/day-words";
import type { Proposal, ProposalKind } from "@/lib/proposals";

/** An answered proposal stays on the desk this many days after the person answered it. */
export const ANSWERED_DAYS = 3;
/** At most this many answers listed on the desk (the newest); the rest are one "N more" link to the agent's record. */
export const ANSWERED_SHOWN = 3;
/** At most this many answers kept (for the count behind "N more"). */
export const ANSWERED_MAX = 10;
/** A level a stock is still at pairs with a level proposal about a cross this recent. */
export const LEVEL_PAIR_DAYS = 4;
/** A stock that reports within this many days of today is never "checked": its report is the decision. */
export const REPORT_GUARD_DAYS = 1;
/** At most this many "checked" cards on the desk; the rest keep their own cards in the modules below. */
export const CHECKED_MAX = 4;

/** Where a finding came from on the page: it decides which proposals can be about the same thing. */
export type FindingSource = "moved:results" | "moved:move" | "moved:news" | "overnight" | "level" | "do:call" | "do:level" | "do:alert" | "do:earnings";

/** The proposal kinds that can be about the same event as each kind of finding. */
const PAIRS: Record<FindingSource, readonly ProposalKind[]> = {
  "moved:results": ["results", "big_move"],
  "moved:move": ["big_move"],
  "moved:news": ["big_move"],
  overnight: ["results", "big_move"],
  level: ["level_reached"],
  "do:call": ["call_change"],
  "do:level": ["level_reached"],
  "do:alert": ["alert_hit"],
  "do:earnings": ["earnings_soon"],
};

/**
 * One finding on the page, with the day its own event happened when the page knows it: the report's day for a report
 * (or an after-hours move on one), the item's own day for a call change, an alert or a level crossed, the report day
 * for an upcoming report.
 */
export type Finding = { ticker: string; source: FindingSource; day: string | null };

/** A card on the desk that is not a proposal: what was found, and what the agent or the person did about it. */
export type DeskCard = {
  ticker: string;
  name: string;
  price: number | null;
  pct: number | null;
  href: string;
  /** What was found, one line. */
  line: string;
  /** What was decided ("Alert set at $33.66"), or the fact that settled "nothing to do" ("15.1% over the buy-more price"). */
  decision: string;
  /** When the person decided, in words ("Yesterday"); null for a checked card. */
  when?: string | null;
  /** Where the finding came from and when, for the hover (owner rule 4: no source lines under facts). */
  source: string | null;
  /** An after-hours card goes at the next regular open (ms), as the Overnight strip does. */
  dropAt?: number | null;
};

export type Desk = {
  /** Every waiting proposal, strongest first, as the queue sorts them. */
  waiting: Proposal[];
  answered: DeskCard[];
  checked: DeskCard[];
  /** Stocks whose module finding the desk now tells (a paired proposal, or a checked card): the modules leave them out. */
  taken: Set<string>;
};

export type DeskInput = {
  today: string;
  now: Date;
  /** The waiting proposals, or null when the queue could not be read (then no "checked" and no answered cards). */
  waiting: Proposal[] | null;
  /** Every stored proposal (answered ones included); empty when unknown. */
  all: readonly Proposal[];
  /**
   * The agent worked the queue out just now (a full sync, or one inside its throttle): only then can it say a stock
   * needs nothing. A queue read from the store while a sync runs late shows its cards, never "checked".
   */
  fresh: boolean;
  moved: readonly MovedCard[];
  overnight: readonly OvernightCard[];
  overnightDropAt?: number | null;
  levels: readonly LevelRow[];
  doCards: readonly DoCard[];
  positions: readonly BriefingPosition[];
  items: readonly BriefingItem[];
  /** Each stock's report day this week (results reads, past report days): what a report finding is about. */
  reportDays?: Readonly<Record<string, string>>;
  /** Before the open, this morning's prices: a fact is said at the price the page shows. */
  prices?: Readonly<Record<string, number>> | null;
  /** The source words for a moved card's hover ("Reuters, Nov 11"). */
  sourceOf?: (card: MovedCard) => string | null;
};

const upper = (value: string | null | undefined) => (value ?? "").trim().toUpperCase();
const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function shiftDay(day: string, days: number): string {
  const at = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(at) ? new Date(at + days * 86_400_000).toISOString().slice(0, 10) : day;
}

/** "$33.66". */
function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Whether `proposal` is about the same event as the finding: the same stock, a kind about that kind of event, and the
 * same event by its day. A report pairs by its report day (the proposal's event is keyed on it); a big move only when
 * it is today's or the last session's; a call change, an alert and a level crossed by the item's own day; an
 * upcoming report by its date. Without the finding's day, only a dated kind of today or the last session pairs.
 */
export function pairs(proposal: Pick<Proposal, "ticker" | "kind" | "event">, finding: Finding, today: string): boolean {
  if (upper(proposal.ticker) !== upper(finding.ticker)) return false;
  if (!PAIRS[finding.source].includes(proposal.kind)) return false;
  const day = etDayOf(proposal.event?.at ?? "");
  if (!day) return false;
  const session = new Set([today, tradingDayBefore(today)]);
  switch (proposal.kind) {
    case "results":
      return finding.day !== null && day === finding.day;
    case "big_move":
      return session.has(day);
    case "level_reached":
      // A level row is about where the price is now: any cross of the last few days that still waits is about it.
      if (finding.source === "level") return day >= shiftDay(today, -LEVEL_PAIR_DAYS) && day <= today;
      return finding.day !== null ? day <= finding.day && day >= shiftDay(finding.day, -LEVEL_PAIR_DAYS) : session.has(day);
    case "call_change":
    case "alert_hit":
    case "earnings_soon":
      return finding.day !== null ? day === finding.day : session.has(day);
    default:
      return false;
  }
}

/** What the person decided, in a few words: "Alert set at $33.66", "Practice ticket opened", "Dismissed". */
export function decisionWords(proposal: Pick<Proposal, "status" | "action" | "result">): string | null {
  if (proposal.status === "dismissed") return "Dismissed";
  if (proposal.status !== "accepted") return null;
  const action = proposal.action;
  switch (action.type) {
    case "alert_price":
      return action.replaces ? `Alert moved to ${usd(action.price)}` : `Alert set at ${usd(action.price)}`;
    case "alert_earnings":
      return "Report reminder on";
    case "watch_add":
      return "Added to Watching";
    case "practice_ticket":
      return "Practice ticket opened";
    case "agent_enable":
      return action.enabled ? "Agent turned on" : "Agent paused";
    case "agent_create":
      return "Agent added";
    case "basket_edit":
      return action.op === "drop" ? "Taken out of the basket" : "Added to the basket";
    default:
      return proposal.result?.message ?? null;
  }
}

/**
 * The fact that settles "nothing to do" for a stock at `price`: how far it is from its own call's level, or that the
 * call stands where it names no level. Null when there is no call, or the price is at or through its level (that is a
 * decision, not nothing).
 */
export function settledFact(position: BriefingPosition, price: number | null): string | null {
  const call = callWordOf(position.stance);
  if (!call) return null;
  const level = ownLevel({ ...position, price: fin(price) && price > 0 ? price : position.price });
  if (level) {
    if (level.crossed || Math.abs(level.gapPct) < AT_LEVEL_PCT) return null;
    return levelLine(level);
  }
  return `Our call stays ${call}`;
}

/**
 * A proposal's trigger line said again against today: "yesterday" and "today" were the day it was written, so a line
 * from Tuesday that said "yesterday" says "on Monday" on Thursday.
 */
export function lineAsOf(line: string, writtenDay: string | null, today: string): string {
  if (!writtenDay || writtenDay === today) return line;
  const say = (day: string) => onDayWords(day, today) || day;
  return line.replace(/\b(yesterday|today)\b/g, (word) => say(word === "today" ? writtenDay : shiftDay(writtenDay, -1)));
}

/** "Tuesday", "Yesterday": the answer's day in words, from the caller's formatter. */
export type DayWords = (day: string) => string;

/** The day of the item behind a Do today card (its call change, alert or level), or the report day for a report. */
function doDay(card: DoCard, items: readonly BriefingItem[], position: BriefingPosition | undefined): string | null {
  if (card.reason === "earnings") return position?.earnings_date ? position.earnings_date.slice(0, 10) : null;
  const kind = card.reason === "call" ? "call_changed" : card.reason === "alert" ? "alert_triggered" : "zone_entered";
  const item = items.find((entry) => entry.kind === kind && upper(entry.ticker) === upper(card.ticker));
  return item ? etDayOf(item.as_of) : null;
}

export function buildDesk(input: DeskInput, dayWords: DayWords): Desk {
  const today = input.today;
  const known = input.waiting !== null;
  const waiting = input.waiting ?? [];
  const byTicker = new Map(input.positions.map((position) => [upper(position.ticker), position]));
  const waitingOn = new Set(waiting.flatMap((proposal) => (proposal.ticker ? [upper(proposal.ticker)] : [])));
  const reportDays = input.reportDays ?? {};
  const taken = new Set<string>();

  // Answered in the last few days, newest first, on a stock that has nothing waiting now (the waiting one is the
  // current decision on it).
  const from = input.now.getTime() - ANSWERED_DAYS * 86_400_000;
  const answeredProposals = known
    ? input.all
        .filter((proposal) => (proposal.status === "accepted" || proposal.status === "dismissed") && proposal.ticker && proposal.decided_at)
        .filter((proposal) => Date.parse(proposal.decided_at!) >= from && Date.parse(proposal.decided_at!) <= input.now.getTime() + 60_000)
        .filter((proposal) => !waitingOn.has(upper(proposal.ticker)))
        .sort((a, b) => b.decided_at!.localeCompare(a.decided_at!))
    : [];
  const answeredOn = new Map<string, Proposal>();
  for (const proposal of answeredProposals) if (!answeredOn.has(upper(proposal.ticker))) answeredOn.set(upper(proposal.ticker), proposal);

  // The module findings a proposal now tells: same stock, same event.
  const findings: Finding[] = [
    ...input.moved.map((card) => ({ ticker: upper(card.ticker), source: `moved:${card.kind}` as FindingSource, day: reportDays[upper(card.ticker)] ?? null })),
    ...input.overnight.map((card) => ({ ticker: upper(card.ticker), source: "overnight" as FindingSource, day: reportDays[upper(card.ticker)] ?? null })),
    ...input.levels.map((row) => ({ ticker: upper(row.ticker), source: "level" as FindingSource, day: null })),
    ...input.doCards.map((card) => ({ ticker: upper(card.ticker), source: `do:${card.reason}` as FindingSource, day: doDay(card, input.items, byTicker.get(upper(card.ticker))) })),
  ];

  const answered: DeskCard[] = [];
  for (const proposal of answeredOn.values()) {
    if (answered.length >= ANSWERED_MAX) break;
    const ticker = upper(proposal.ticker);
    const words = decisionWords(proposal);
    const first = proposal.why[0];
    if (!words || !first) continue;
    const position = byTicker.get(ticker);
    const day = etDayOf(proposal.decided_at);
    const read = proposal.read[0];
    const readDay = read ? etDayOf(read.at) : null;
    answered.push({
      ticker,
      name: position?.name || ticker,
      price: position?.price ?? proposal.quote?.price ?? null,
      pct: position ? position.day_change_pct : proposal.quote?.dayPct ?? null,
      href: `/stock/${encodeURIComponent(ticker)}`,
      // Said against today: the line was written the day the proposal was last worked out.
      line: lineAsOf(first, etDayOf(proposal.updated_at) ?? etDayOf(proposal.created_at), today),
      decision: words,
      when: day ? dayWords(day) : null,
      source: read ? [read.label, readDay ? dayWords(readDay) : ""].filter(Boolean).join(", ") : null,
    });
  }

  // A finding a proposal tells leaves its module: one waiting, or an answer the desk actually lists (never one past
  // the few shown, or one it could not word, so a finding never disappears with nothing on the desk in its place).
  const listed = new Map(answered.slice(0, ANSWERED_SHOWN).map((card) => [card.ticker, answeredOn.get(card.ticker)!]));
  for (const finding of findings) {
    const shownAnswer = listed.get(finding.ticker);
    if (waiting.some((proposal) => pairs(proposal, finding, today)) || (shownAnswer && pairs(shownAnswer, finding, today))) taken.add(finding.ticker);
  }

  // Checked, nothing to do: the day's moves with a reason, reports and after-hours moves on a stock nothing waits on
  // or was answered about, whose call held today, that does not report within a day, and that is not at its level.
  // Only on a fresh queue: a stored one read while the sync runs late may be missing today's proposal.
  const allChecked: DeskCard[] = [];
  const canCheck = known && input.fresh;
  const callMoved = new Set(input.items.filter((item) => item.kind === "call_changed").map((item) => upper(item.ticker)));
  const deciding = new Set(input.doCards.map((card) => upper(card.ticker)));
  const reportsNear = (position: BriefingPosition) => {
    const gap = position.earnings_date ? daysFromToday(position.earnings_date.slice(0, 10), today) : null;
    return gap !== null && Math.abs(gap) <= REPORT_GUARD_DAYS;
  };
  const open = (ticker: string) => !taken.has(ticker) && !allChecked.some((card) => card.ticker === ticker) && !waitingOn.has(ticker) && !answeredOn.has(ticker) && !callMoved.has(ticker) && !deciding.has(ticker);
  const priceOf = (ticker: string, fallback: number | null) => {
    const pre = input.prices?.[ticker];
    return fin(pre) && pre > 0 ? pre : fallback;
  };
  if (canCheck) {
    for (const card of input.overnight) {
      const ticker = upper(card.ticker);
      const position = byTicker.get(ticker);
      if (!position || position.covered === false || !open(ticker) || reportsNear(position)) continue;
      const fact = settledFact(position, card.price);
      if (!fact) continue;
      allChecked.push({
        ticker,
        name: card.name,
        price: card.price,
        pct: card.pct,
        href: `/stock/${encodeURIComponent(ticker)}`,
        line: card.line ?? (card.session === "post" ? "Moved after hours" : "Moved before the open"),
        decision: fact,
        source: null,
        dropAt: input.overnightDropAt ?? null,
      });
    }
    for (const card of input.moved) {
      const ticker = upper(card.ticker);
      const position = byTicker.get(ticker);
      if (!position || position.covered === false || !open(ticker) || reportsNear(position)) continue;
      const fact = settledFact(position, priceOf(ticker, card.price));
      if (!fact) continue;
      allChecked.push({ ticker, name: card.name, price: card.price, pct: card.pct, href: card.href, line: card.line, decision: fact, source: input.sourceOf?.(card) ?? null });
    }
  }
  // The first few, as cards; the rest keep their own cards in the modules below.
  const checked = allChecked.slice(0, CHECKED_MAX);
  for (const card of checked) taken.add(card.ticker);

  return { waiting, answered, checked, taken };
}
