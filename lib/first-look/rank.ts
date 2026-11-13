/**
 * The first look's rules: the facts the loaders found (./server.ts) turned into findings, ranked, cut to the few that
 * matter, and a decision. Plain rules over real records, never a model; anything we cannot back is left out. Pure, so
 * it can be tested.
 */

import { onDayWords } from "@/lib/day-words";
import { oneFact } from "@/lib/portfolio-home/stocks";

import { FINDING_WORDS, MATTERS, URGENT, type CallMix, type Finding, type FindingQuote, type FirstLookDecision, type FindingTone } from "./types";

export type PlainCall = "Buy more" | "Keep" | "Sell some";
export type CallCode = "Add" | "Hold" | "Trim";

export const PLAIN: Record<CallCode, PlainCall> = { Add: "Buy more", Hold: "Keep", Trim: "Sell some" };

/** One of the person's stocks. */
export type LookStock = { ticker: string; instrumentId: string; held: boolean };

/** Everything the loaders found, already limited to what this person's plan may see (levels only where covered). */
export type LookFacts = {
  today: string;
  stocks: LookStock[];
  /** Our call on each stock, with only the level the call allows (Buy more: below; Sell some: above). */
  calls: Record<string, { call: CallCode; addBelow: number | null; trimAbove: number | null }>;
  /** The steady call's latest change in the last two weeks. */
  callChanges: Record<string, { day: string; from: PlainCall | null; to: PlainCall }>;
  quotes: Record<string, FindingQuote>;
  /** Reports in the next 14 days. */
  reports: Array<{ ticker: string; date: string; session: string | null; usualPct: number | null }>;
  /** Five-session moves, with the stored reason when there is a confirmed one from inside those sessions. */
  weekMoves: Record<string, { pct: number; to: string; marketPct: number | null; reason: string | null }>;
  /** 10-K and 10-Q risk changes in the last 30 days. */
  filings: Array<{ ticker: string; form: string; filed: string; added: number; dropped: number; line: string; href: string }>;
  /** Insider clusters (three or more people) and big single buys in the last 30 days. Planned (10b5-1) trades never count. */
  insiders: Array<{ ticker: string; side: "buy" | "sell"; people: number; value: number | null; day: string; who: string | null }>;
  /** Results in the last week. */
  results: Array<{ ticker: string; reportDate: string; movePct: number | null; epsVerdict: string | null; epsSurprisePct: number | null }>;
  /** The proposals the agent's sync would draft now (lib/proposals.ts candidates). */
  proposals: Array<{ kind: string; ticker: string | null; priority: number; why: string | null; figure: string | null; at: string | null; href: string | null }>;
  /**
   * The proposals "Needs you" shows on the same page (waiting now, plus the ones this sync would store): their stocks
   * are not shown again as cards here, since Needs you sits right below with the step to take.
   */
  needsYou?: Array<{ kind: string; ticker: string | null }>;
};

/* ── words ──────────────────────────────────────────────────────────────── */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function fits(text: string, max = FINDING_WORDS): boolean {
  return words(text) <= max;
}

export function signedPct(value: number, digits = 1): string {
  const rounded = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${rounded >= 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}%`;
}

export function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 1000 ? 2 : 0, maximumFractionDigits: value < 1000 ? 2 : 0 })}`;
}

/** "$1.2M", "$450K". */
export function bigMoney(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 10_000) return `$${Math.round(value / 1000).toLocaleString("en-US")}K`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const SESSION: Record<string, string> = { bmo: "before the open", amc: "after the close", during: "during the day" };

const CALL_TONE: Record<PlainCall, FindingTone> = { "Buy more": "up", Keep: "flat", "Sell some": "down" };

function toneOf(value: number): FindingTone {
  return Math.abs(value) < 0.05 ? "flat" : value > 0 ? "up" : "down";
}

/* ── findings ───────────────────────────────────────────────────────────── */

/** A held stock counts for more than one only watched. */
const HELD_BONUS = 6;
/** A finding the agent would also draft a proposal for asks for a decision: it ranks higher. */
const PROPOSAL_BONUS = 8;
const BIG_WEEK_PCT = 5;
const NEAR_LEVEL_PCT = 3;
/** A single insider buy counts on its own from this size (a cluster counts at any size). */
const BIG_INSIDER_BUY = 100_000;
const REPORT_DAYS = 14;

function callFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const [ticker, change] of Object.entries(facts.callChanges)) {
    const now = facts.calls[ticker];
    // Only a change to the call shown everywhere else: a snapshot that lags the steady call must not contradict it.
    if (!now || PLAIN[now.call] !== change.to) continue;
    const age = Math.max(0, daysBetween(change.day, facts.today));
    const when = onDayWords(change.day, facts.today);
    const text = change.from ? `Our call moved from ${change.from} to ${change.to} ${when}.` : `Our call moved to ${change.to} ${when}.`;
    // Selling some is about shares the person owns: on a watched stock it is worth knowing, not urgent.
    const base = change.to === "Sell some" ? (held.get(ticker) ? 92 : 70) : change.to === "Buy more" ? 84 : 70;
    out.push({
      id: `call:${ticker}:${change.day}`,
      kind: "call",
      ticker,
      figure: change.to,
      figureLabel: "Our call",
      tone: CALL_TONE[change.to],
      text,
      lead: `our call moved to ${change.to}`,
      day: change.day,
      source: "Our call",
      href: `/stock/${encodeURIComponent(ticker)}`,
      score: base - 2 * age + (held.get(ticker) ? HELD_BONUS : 0),
      held: held.get(ticker) ?? false,
    });
  }
  return out;
}

function levelFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const [ticker, call] of Object.entries(facts.calls)) {
    const price = facts.quotes[ticker]?.price;
    if (!fin(price) || price <= 0) continue;
    const isHeld = held.get(ticker) ?? false;
    let level: number | null = null;
    let away = 0;
    let side: "buy" | "sell";
    if (call.call === "Add" && call.addBelow !== null) {
      level = call.addBelow;
      away = ((price - level) / price) * 100;
      side = "buy";
    } else if (call.call === "Trim" && call.trimAbove !== null && isHeld) {
      // Selling some is about shares the person owns: a watched stock's sell-some level is not news for them.
      level = call.trimAbove;
      away = ((level - price) / price) * 100;
      side = "sell";
    } else continue;
    // A level more than half the price away says little about today (lib/portfolio-home/stocks.ts callLevel).
    if (Math.abs(level - price) / price > 0.5 || away > NEAR_LEVEL_PCT) continue;
    const crossed = away <= 0;
    const verb = side === "buy" ? "buy more" : "sell some";
    // The card shows the price under the ticker and the level big: the line says where one sits against the other.
    const text = crossed
      ? `${side === "buy" ? "Under" : "Over"} the price where our call says ${verb}.`
      : `${away.toFixed(1)}% ${side === "buy" ? "above" : "below"} the price where our call says ${verb}.`;
    out.push({
      id: `level:${ticker}:${side}`,
      kind: "level",
      ticker,
      figure: money(level),
      figureLabel: side === "buy" ? "Buy-more level" : "Sell-some level",
      tone: side === "buy" ? "up" : "down",
      text,
      lead: crossed ? `it is ${side === "buy" ? "under its buy-more" : "over its sell-some"} level` : `it is ${away.toFixed(1)}% from its ${side === "buy" ? "buy-more" : "sell-some"} level`,
      day: facts.today,
      source: "Our call and the latest price",
      href: `/stock/${encodeURIComponent(ticker)}`,
      score: (crossed ? 86 : 78 - 3 * away) + (isHeld ? HELD_BONUS : 0),
      held: isHeld,
    });
  }
  return out;
}

/** "CGNX, DELL and LLY". */
export function listTickers(tickers: readonly string[]): string {
  if (tickers.length <= 1) return tickers[0] ?? "";
  return `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
}

/**
 * Several stocks at or near the same kind of level are one event said once (owner rule 1: no identical sentence on
 * several cards): one card for the side, led by its best, naming the rest.
 */
function groupLevels(levels: Finding[], today: string): Finding[] {
  const out: Finding[] = [];
  for (const side of ["buy", "sell"] as const) {
    const group = levels.filter((finding) => finding.id.endsWith(`:${side}`)).sort((a, b) => b.score - a.score);
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const lead = group[0]!;
    const tickers = group.map((finding) => finding.ticker);
    const verb = side === "buy" ? "buy more" : "sell some";
    out.push({
      ...lead,
      id: `level:group:${side}:${today}`,
      also: tickers.slice(1),
      figure: `${tickers.length} stocks`,
      figureLabel: side === "buy" ? "At buy-more prices" : "At sell-some prices",
      // The card's head names them; the line says what they share.
      text: `At or near the price where our call says ${verb}.`,
      lead: `they are near their ${side === "buy" ? "buy-more" : "sell-some"} price`,
      href: `/portfolio`,
      score: lead.score + 2,
    });
  }
  return out;
}

function reportFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const report of [...facts.reports].sort((a, b) => a.date.localeCompare(b.date))) {
    const gap = daysBetween(facts.today, report.date);
    if (gap < 0 || gap > REPORT_DAYS || seen.has(report.ticker)) continue;
    seen.add(report.ticker);
    const when = onDayWords(report.date, facts.today) || `on ${report.date}`;
    const session = report.session ? SESSION[report.session] : undefined;
    const usual = fin(report.usualPct) && report.usualPct > 0 ? report.usualPct : null;
    const head = `Reports ${when}${session ? ` ${session}` : ""}`;
    const longer = usual !== null ? `${head}; it usually moves ${usual.toFixed(1)}% on results.` : `${head}.`;
    const text = fits(longer) ? longer : `${head}.`;
    out.push({
      id: `report:${report.ticker}:${report.date}`,
      kind: "report",
      ticker: report.ticker,
      figure: gap === 0 ? "Today" : gap === 1 ? "Tomorrow" : `In ${gap} days`,
      figureLabel: "Earnings report",
      tone: "flat",
      text,
      lead: `it reports ${when}`,
      day: report.date,
      source: "Earnings calendar",
      href: `/stock/${encodeURIComponent(report.ticker)}`,
      score: 88 - 3 * gap + (held.get(report.ticker) ? HELD_BONUS : 0),
      held: held.get(report.ticker) ?? false,
    });
  }
  return out;
}

function moveFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const [ticker, move] of Object.entries(facts.weekMoves)) {
    if (!fin(move.pct) || Math.abs(move.pct) < BIG_WEEK_PCT) continue;
    const size = `${Math.abs(move.pct).toFixed(1)}%`;
    const reason = move.reason ? oneFact(move.reason) : null;
    // The figure is the move: the line gives the stored reason when it is confirmed and fits, else the market over the
    // same days, never a guess.
    const plain = fin(move.marketPct)
      ? `The S&P 500 ${move.marketPct >= 0 ? "rose" : "fell"} ${Math.abs(move.marketPct).toFixed(1)}% over the same five sessions.`
      : "Over the last five sessions.";
    const text = reason && fits(reason) ? reason : plain;
    out.push({
      id: `move:${ticker}:${move.to}`,
      kind: "move",
      ticker,
      figure: signedPct(move.pct),
      figureLabel: "Past week",
      tone: toneOf(move.pct),
      text,
      lead: `it ${move.pct >= 0 ? "rose" : "fell"} ${size} this week`,
      day: move.to,
      source: reason ? "Daily closes and the researched movers feed" : "Daily closes",
      href: `/stock/${encodeURIComponent(ticker)}`,
      // A big week alone stays under the urgent bar on a watched stock; on a holding a 15%+ week asks for a look.
      score: 58 + Math.min(Math.abs(move.pct), 20) + (reason ? 3 : 0) + (held.get(ticker) ? HELD_BONUS : 0),
      held: held.get(ticker) ?? false,
    });
  }
  return out;
}

function filingFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const filing of [...facts.filings].sort((a, b) => b.filed.localeCompare(a.filed))) {
    // The newest comparison per stock; one that only reworded its risks is not news.
    if (seen.has(filing.ticker) || filing.added + filing.dropped === 0 || !fits(filing.line)) continue;
    seen.add(filing.ticker);
    const age = Math.max(0, daysBetween(filing.filed, facts.today));
    out.push({
      id: `filing:${filing.ticker}:${filing.filed}`,
      kind: "filing",
      ticker: filing.ticker,
      figure: filing.added > 0 ? `+${filing.added}` : `−${filing.dropped}`,
      figureLabel: filing.added > 0 ? "New risks" : "Risks dropped",
      tone: filing.added > 0 ? "down" : "flat",
      text: filing.line,
      lead: `its new ${filing.form} ${filing.added > 0 ? `adds ${filing.added} ${filing.added === 1 ? "risk" : "risks"}` : "drops risks"}`,
      day: filing.filed,
      source: `SEC ${filing.form}`,
      href: filing.href,
      score: 60 + Math.min(filing.added, 5) * 3 - age / 3 + (held.get(filing.ticker) ? HELD_BONUS : 0),
      held: held.get(filing.ticker) ?? false,
    });
  }
  return out;
}

function insiderFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const row of facts.insiders) {
    const cluster = row.people >= 3;
    if (row.side === "buy" && !cluster && !(fin(row.value) && row.value >= BIG_INSIDER_BUY)) continue;
    if (row.side === "sell" && !cluster) continue;
    const verb = row.side === "buy" ? "bought" : "sold";
    // The figure is the amount when there is one: the line says who and when.
    const value = fin(row.value) && row.value > 0 ? " stock" : " shares";
    const who = cluster ? `${row.people} insiders` : row.who ? row.who.charAt(0).toUpperCase() + row.who.slice(1) : "An insider";
    const text = cluster ? `${who} ${verb}${value} in the past month.` : `${who} ${verb}${value} ${onDayWords(row.day, facts.today)}.`;
    if (!fits(text)) continue;
    out.push({
      id: `insider:${row.ticker}:${row.side}:${row.day}`,
      kind: "insider",
      ticker: row.ticker,
      figure: fin(row.value) && row.value > 0 ? bigMoney(row.value) : `${row.people}`,
      figureLabel: row.side === "buy" ? "Insiders bought" : "Insiders sold",
      tone: row.side === "buy" ? "up" : "down",
      text,
      lead: cluster ? `${row.people} insiders ${verb} shares this month` : `an insider ${verb} shares`,
      day: row.day,
      source: "SEC Form 4",
      href: `/insiders/${encodeURIComponent(row.ticker)}`,
      score: (row.side === "buy" ? (cluster ? 76 : 64) : 60) + (held.get(row.ticker) ? 4 : 0),
      held: held.get(row.ticker) ?? false,
    });
  }
  return out;
}

const VERDICT: Record<string, string> = { beat: "beat", miss: "missed", in_line: "matched" };

function resultsFindings(facts: LookFacts, held: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const read of facts.results) {
    const age = daysBetween(read.reportDate, facts.today);
    if (age < 0 || age > 6) continue;
    const verdict = read.epsVerdict ? VERDICT[read.epsVerdict] : undefined;
    const when = onDayWords(read.reportDate, facts.today);
    const parts = [`Reported ${when}`];
    if (verdict) parts.push(`${verdict} profit forecasts${fin(read.epsSurprisePct) && verdict !== "matched" ? ` by ${Math.abs(read.epsSurprisePct).toFixed(1)}%` : ""}`);
    // With a move, the move is the figure; the line says the report.
    const text = `${parts.join(" and ")}.`;
    if (!fits(text) || (!verdict && !fin(read.movePct))) continue;
    out.push({
      id: `results:${read.ticker}:${read.reportDate}`,
      kind: "results",
      ticker: read.ticker,
      figure: fin(read.movePct) ? signedPct(read.movePct) : verdict === "beat" ? "Beat" : verdict === "missed" ? "Missed" : "In line",
      figureLabel: fin(read.movePct) ? "On results" : "Profit vs forecast",
      tone: fin(read.movePct) ? toneOf(read.movePct) : verdict === "beat" ? "up" : verdict === "missed" ? "down" : "flat",
      text,
      lead: `it reported ${when}`,
      day: read.reportDate,
      source: "Company results",
      href: `/stock/${encodeURIComponent(read.ticker)}`,
      score: 82 - 3 * age + (fin(read.movePct) ? Math.min(Math.abs(read.movePct), 15) * 0.6 : 0) + (held.get(read.ticker) ? HELD_BONUS : 0),
      held: held.get(read.ticker) ?? false,
    });
  }
  return out;
}

/** Which finding a proposal kind is about, for the proposal's bonus. */
const PROPOSAL_KIND: Record<string, Finding["kind"]> = {
  call_change: "call",
  level_reached: "level",
  big_move: "move",
  filing_risks: "filing",
  filing: "filing",
  earnings_soon: "report",
  results: "results",
};

/**
 * Every finding the facts back, best first. A proposal the agent would draft now lifts the finding it is about; a
 * major filing proposal with no finding of its own becomes one, in the proposal's own words.
 */
export function findingsFrom(facts: LookFacts): Finding[] {
  const held = new Map(facts.stocks.map((stock) => [stock.ticker, stock.held]));
  // A stock with a proposal under Needs you is said there, with its step (one proposal per stock): never on two cards
  // of one page, and not as another event beside it either ("up 14% this week" over "fell 8.7% on results").
  const asked = new Set((facts.needsYou ?? []).flatMap((proposal) => (proposal.ticker ? [proposal.ticker] : [])));
  const fresh = (finding: Finding) => !asked.has(finding.ticker);
  const all = [
    ...callFindings(facts, held),
    // Grouped after the ones Needs you already asks about are out, so a group never names them.
    ...groupLevels(levelFindings(facts, held).filter(fresh), facts.today),
    ...reportFindings(facts, held),
    ...moveFindings(facts, held),
    ...filingFindings(facts, held),
    ...insiderFindings(facts, held),
    ...resultsFindings(facts, held),
  ];
  for (const proposal of facts.proposals) {
    if (!proposal.ticker || asked.has(proposal.ticker)) continue;
    const kind = PROPOSAL_KIND[proposal.kind];
    const match = all.find((finding) => finding.ticker === proposal.ticker && finding.kind === kind) ?? null;
    if (match) {
      match.score += PROPOSAL_BONUS;
      continue;
    }
    if (proposal.kind === "filing" && proposal.why && fits(proposal.why)) {
      const day = proposal.at ? proposal.at.slice(0, 10) : null;
      all.push({
        id: `filing:${proposal.ticker}:${proposal.at ?? "now"}`,
        kind: "filing",
        ticker: proposal.ticker,
        figure: proposal.figure ?? "8-K",
        figureLabel: "SEC filing",
        tone: "flat",
        text: proposal.why,
        lead: "it filed something that matters with the SEC",
        day,
        source: "SEC filing",
        href: proposal.href ?? `/stock/${encodeURIComponent(proposal.ticker)}`,
        score: 56 + proposal.priority / 5 + (held.get(proposal.ticker) ? HELD_BONUS : 0),
        held: held.get(proposal.ticker) ?? false,
      });
    }
  }
  return all.filter((finding) => fits(finding.text) && fresh(finding)).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id));
}

/**
 * How many findings to show: the decision card sits beside them, so 1, 2, 3 or 5 findings make 2, 3, 4 or 6 cards,
 * which fill whole rows at every width (owner rule 4). Four findings show three.
 */
export const SHOWN_COUNTS = [0, 1, 2, 3, 5] as const;
/** One card per stock: a second one on the same stock (its results and its week) reads as noise beside the rest. */
const PER_STOCK = 1;
const PER_KIND = 3;

/** The few that matter: above the bar, one per stock and at most three of a kind, in a count that fills the rows. */
export function pickFindings(all: Finding[]): Finding[] {
  const perStock = new Map<string, number>();
  const perKind = new Map<string, number>();
  const kept: Finding[] = [];
  for (const finding of all) {
    if (finding.score < MATTERS) break;
    const tickers = [finding.ticker, ...(finding.also ?? [])];
    if (tickers.some((ticker) => (perStock.get(ticker) ?? 0) >= PER_STOCK) || (perKind.get(finding.kind) ?? 0) >= PER_KIND) continue;
    for (const ticker of tickers) perStock.set(ticker, (perStock.get(ticker) ?? 0) + 1);
    perKind.set(finding.kind, (perKind.get(finding.kind) ?? 0) + 1);
    kept.push(finding);
  }
  const count = [...SHOWN_COUNTS].reverse().find((size) => size <= kept.length) ?? 0;
  return kept.slice(0, count);
}

/**
 * Every run ends in a decision. Something above the urgent bar: which stock to look at first and why. Something worth
 * knowing but not urgent: say so, and name the next thing. Nothing: say plainly there is nothing urgent. A look that
 * could not read its sources says that instead of "nothing".
 */
export function decide(input: { shown: Finding[]; stocks: number; complete: boolean; missing: number; sources: number }): FirstLookDecision {
  const { shown, stocks, complete } = input;
  const urgent = shown.filter((finding) => finding.score >= URGENT);
  if (urgent.length > 0) {
    // A card about many stocks says its own line; the decision names one place to start when there is one.
    const top = urgent.find((finding) => (finding.also?.length ?? 0) < 3) ?? urgent[0]!;
    const group = [top.ticker, ...(top.also ?? [])];
    // A long list is not one place to start: say how many, and leave the names to the card.
    const main =
      group.length > 3 ? `${group.length} of your stocks are at or near their ${top.id.includes(":sell:") ? "sell-some" : "buy-more"} price.` : `Look at ${listTickers(group)} first: ${top.lead}.`;
    return {
      urgent: true,
      figure: `${urgent.length} ${urgent.length === 1 ? "needs" : "need"} a look`,
      text: fits(main) ? main : `Look at ${top.ticker} first.`,
    };
  }
  if (shown.length > 0) {
    const top = shown[0]!;
    const worth = `Worth knowing: ${listTickers([top.ticker, ...(top.also ?? [])])}, ${top.lead}.`;
    return { urgent: false, figure: "Nothing urgent", text: fits(worth) ? worth : `Worth knowing: ${top.ticker}.` };
  }
  // Nothing found because nothing could be read is not "all quiet".
  if (!complete && input.missing >= Math.ceil(input.sources / 2)) {
    return { urgent: false, figure: "Partial look", text: "I could not read most of your stocks' data just now. Reload to try again." };
  }
  const name = `${stocks} ${stocks === 1 ? "stock" : "stocks"}`;
  return {
    urgent: false,
    figure: "Nothing urgent",
    text: complete ? `Nothing on your ${name} needs you today.` : `Nothing needs you in what I could read on your ${name}.`,
  };
}

/** Our call across the person's stocks, for the decision card's bar; null when no call was read. */
export function callMix(calls: LookFacts["calls"]): CallMix | null {
  const mix: CallMix = { buyMore: 0, keep: 0, sellSome: 0 };
  for (const { call } of Object.values(calls)) {
    if (call === "Add") mix.buyMore += 1;
    else if (call === "Hold") mix.keep += 1;
    else if (call === "Trim") mix.sellSome += 1;
  }
  return mix.buyMore + mix.keep + mix.sellSome > 0 ? mix : null;
}
