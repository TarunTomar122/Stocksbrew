import { instantOf, isBareDay, nyDay, shortDay } from "./merge";
import type { InboxItem } from "./types";

/**
 * Each source's records as inbox items: one full sentence on what happened and
 * why it matters to this person, and the evidence link. Pure:
 * the store reads live in ./sources.ts, so the wording is tested here on plain
 * records. A record that cannot make a whole sentence (no ticker, no day)
 * makes no item.
 */

export type Mode = "mine" | "example";
export type Position = "holding" | "watchlist" | null;
export type PlainCall = "Buy more" | "Keep" | "Sell some";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
const RANK: Record<PlainCall, number> = { "Sell some": 0, Keep: 1, "Buy more": 2 };

/** The pipeline's stance words ("accumulate", "Trim", "avoid") as the call a reader sees. */
export function plainCall(stance: unknown): PlainCall | null {
  const key = String(stance ?? "").trim().toLowerCase();
  if (["accumulate", "buy", "add"].includes(key)) return "Buy more";
  if (["hold", "watch", "keep"].includes(key)) return "Keep";
  if (["trim", "avoid", "sell", "reduce"].includes(key)) return "Sell some";
  return null;
}

function cleanTicker(value: unknown): string | null {
  const ticker = String(value ?? "").trim().toUpperCase();
  return TICKER_RE.test(ticker) ? ticker : null;
}

function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function withoutStop(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

/** "NVDA", "NVDA and AMD", "NVDA, AMD and 2 more". */
export function listTickers(tickers: string[], max = 3): string {
  const shown = tickers.slice(0, max);
  const more = tickers.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

function usd(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function price(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 10 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function base(fields: Omit<InboxItem, "day" | "detail" | "external" | "quiet" | "locked" | "weight" | "thread" | "tone" | "exact"> & Partial<InboxItem>): InboxItem | null {
  const day = nyDay(fields.at);
  if (!day) return null;
  return {
    exact: true,
    detail: null,
    external: false,
    quiet: false,
    locked: false,
    weight: 1,
    thread: null,
    tone: "flat",
    ...fields,
    day,
  };
}

/* ── agent runs ─────────────────────────────────────────────────────────── */

export type AgentRunRecord = {
  jobId: string;
  jobName: string;
  /** The market day the run checked. */
  day: string;
  ranAt: string;
  decision: "notify" | "nothing" | "could_not_check";
  summary: string;
  tickers: string[];
};

function agentName(name: string): string {
  const clean = name.replace(/[“”"]/g, "").trim();
  return clean ? `“${clean}”` : "";
}

/** A run that found something: the agent's own sentence, said as what the person's agent flagged. */
export function agentItem(run: AgentRunRecord, mode: Mode): InboxItem | null {
  if (run.decision !== "notify" || !run.summary.trim()) return null;
  const ranAt = instantOf(run.ranAt);
  const at = ranAt ?? instantOf(run.day);
  if (!at) return null;
  const tickers = run.tickers.map(cleanTicker).filter((t): t is string => t !== null);
  const whose = mode === "mine" ? "Your" : "The example's";
  const name = agentName(run.jobName);
  const text = `${whose} ${name ? `${name} ` : ""}agent flagged this: ${sentence(run.summary)}`;
  const lead = tickers[0] ?? null;
  return base({
    id: `agent:${run.jobId}:${run.day}`,
    kind: "agent",
    at,
    exact: ranAt !== null && !isBareDay(run.ranAt),
    tickers,
    text,
    href: mode === "mine" ? `/agents?job=${encodeURIComponent(run.jobId)}` : lead ? `/stock/${encodeURIComponent(lead)}` : "/portfolio",
    source: mode === "mine" ? "Your agent" : "Example agent",
    tone: "down",
    dedupeKey: `agent:${run.jobId}:${run.day}`,
  });
}

/**
 * The runs that found nothing, one line per day: still an answer ("checked, nothing needs you"), listed but never
 * counted as unread.
 */
export function quietItems(runs: AgentRunRecord[], mode: Mode): InboxItem[] {
  const byDay = new Map<string, AgentRunRecord[]>();
  for (const run of runs) {
    if (run.decision !== "nothing") continue;
    byDay.set(run.day, [...(byDay.get(run.day) ?? []), run]);
  }
  const out: InboxItem[] = [];
  for (const [day, list] of byDay) {
    const timed = list.filter((run) => !isBareDay(run.ranAt)).map((run) => instantOf(run.ranAt)).filter((at): at is string => at !== null).sort().pop() ?? null;
    const latest = timed ?? instantOf(day);
    if (!latest) continue;
    const whose = mode === "mine" ? "Your" : "The example's";
    const text =
      list.length === 1
        ? `${whose} ${agentName(list[0]!.jobName) || ""} agent checked on ${shortDay(day)} and found nothing that needs ${mode === "mine" ? "you" : "a look"}.`.replace(/\s+/g, " ")
        : `${list.length} of ${mode === "mine" ? "your" : "the example's"} agents checked on ${shortDay(day)} and found nothing that needs ${mode === "mine" ? "you" : "a look"}.`;
    const item = base({
      id: `quiet:${day}`,
      kind: "agent",
      at: latest,
      exact: timed !== null,
      tickers: [],
      text,
      href: mode === "mine" ? "/agents" : "/portfolio",
      source: mode === "mine" ? "Your agents" : "Example agents",
      quiet: true,
      dedupeKey: `quiet:${day}`,
    });
    if (item) out.push(item);
  }
  return out;
}

/* ── call changes ───────────────────────────────────────────────────────── */

export type CallChangeRecord = {
  ticker: string;
  /** When the new call was written (ISO), or the day it took effect. */
  at: string;
  /** Null when this person may not see the call's history (a stock their plan does not cover). */
  from: PlainCall | null;
  to: PlainCall;
  position: Position;
  /** Why it changed, in plain words, only for a covered stock. */
  reason: string | null;
  /** Which store said so: the steady call's own record outranks the call log, which outranks the change event. */
  weight: number;
};

function callClause(from: PlainCall, to: PlainCall, position: Position): string {
  if (position === "holding") {
    if (to === "Buy more") return "so it now backs adding to your shares";
    if (to === "Sell some") return "so it now says to sell some of your shares";
    return from === "Buy more" ? "so it no longer backs adding to your shares" : "so it no longer says to sell some of your shares";
  }
  if (to === "Buy more") return "so a stock you're watching now has a buy call";
  if (to === "Sell some") return "so we'd hold off on a stock you're watching";
  return from === "Buy more" ? "so a stock you're watching no longer has a buy call" : "so a stock you're watching is no longer marked to sell";
}

export function callItem(change: CallChangeRecord, mode: Mode): InboxItem | null {
  const ticker = cleanTicker(change.ticker);
  const at = instantOf(change.at);
  if (!ticker || !at || change.from === change.to) return null;
  const day = nyDay(at)!;
  const when = shortDay(day);
  let text: string;
  if (mode === "example") {
    const holds = change.position === "watchlist" ? "is watching" : "holds";
    text = `Our call on ${ticker}, which the example portfolio ${holds}, changed to ${change.to} on ${when}.`;
  } else if (!change.from) {
    const own = change.position === "holding" ? "own" : "watch";
    text = `Our call on ${ticker}, which you ${own}, changed to ${change.to} on ${when}.`;
  } else {
    text = `Our call on ${ticker} moved from ${change.from} to ${change.to} on ${when}, ${callClause(change.from, change.to, change.position)}.`;
  }
  const tone = change.from ? (RANK[change.to] > RANK[change.from] ? "up" : "down") : change.to === "Buy more" ? "up" : change.to === "Sell some" ? "down" : "flat";
  return base({
    id: `call:${ticker}:${day}`,
    kind: "call",
    at,
    exact: !isBareDay(change.at),
    tickers: [ticker],
    text,
    detail: mode === "mine" && change.reason ? sentence(change.reason) : null,
    href: `/stock/${encodeURIComponent(ticker)}`,
    source: "Our call",
    tone,
    weight: change.weight,
    dedupeKey: `call:${ticker}:${change.to}`,
    thread: `call:${ticker}`,
  });
}

/**
 * Changes from a run of daily calls, oldest first: each day whose call differs from the day before (in the words a
 * reader sees, so "trim" to "avoid" is no change).
 */
export function changesFromDays<T extends { at: string; call: PlainCall }>(days: T[]): Array<{ from: PlainCall; to: PlainCall; row: T }> {
  const out: Array<{ from: PlainCall; to: PlainCall; row: T }> = [];
  const sorted = [...days].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < sorted.length; i++) {
    const before = sorted[i - 1]!.call;
    const now = sorted[i]!.call;
    if (before !== now) out.push({ from: before, to: now, row: sorted[i]! });
  }
  return out;
}

/* ── price alerts ───────────────────────────────────────────────────────── */

export type AlertRecord = { id: string; ticker: string; condition: "above" | "below" | null; target: number | null; triggeredAt: string };

export function alertItem(alert: AlertRecord): InboxItem | null {
  const ticker = cleanTicker(alert.ticker);
  const at = instantOf(alert.triggeredAt);
  if (!ticker || !at || !alert.id) return null;
  const when = shortDay(nyDay(at)!);
  const level = alert.target != null && Number.isFinite(alert.target) && alert.target > 0 ? price(alert.target) : null;
  const text = level
    ? `${ticker} ${alert.condition === "above" ? "rose above" : alert.condition === "below" ? "fell below" : "reached"} ${level} on ${when}, the price you asked us to watch for.`
    : `${ticker} reached the price you asked us to watch for on ${when}.`;
  return base({
    id: `alert:${alert.id}`,
    kind: "alert",
    at,
    tickers: [ticker],
    text,
    href: `/stock/${encodeURIComponent(ticker)}`,
    source: "Your price alert",
    tone: alert.condition === "above" ? "up" : alert.condition === "below" ? "down" : "flat",
    dedupeKey: `alert:${alert.id}`,
  });
}

/* ── reason checks ──────────────────────────────────────────────────────── */

export type Verdict = "holds" | "weaker" | "broken" | "played_out";

export type ReasonRecord = {
  ticker: string;
  /** The day the verdict changed to this one (or the first check's day). */
  day: string;
  verdict: Verdict;
  /** The verdict before, or null on a first check. */
  from: Verdict | null;
  headline: string;
};

export function reasonItem(check: ReasonRecord, mode: Mode): InboxItem | null {
  const ticker = cleanTicker(check.ticker);
  const at = instantOf(check.day);
  if (!ticker || !at) return null;
  if (check.from === check.verdict) return null;
  // A first check that holds is not news.
  if (check.from === null && check.verdict === "holds") return null;
  const when = shortDay(check.day);
  const whose = mode === "mine" ? "you gave" : "the example gives";
  const what =
    check.verdict === "holds"
      ? `is holding up again as of ${when}`
      : check.verdict === "weaker"
        ? check.from === null
          ? `looked weaker at our first check on ${when}`
          : `got weaker on ${when}`
        : check.verdict === "broken"
          ? check.from === null
            ? `no longer held up at our first check on ${when}`
            : `stopped holding up on ${when}`
          : `played out on ${when}`;
  return base({
    id: `reason:${ticker}:${check.day}`,
    kind: "reason",
    at,
    exact: false,
    tickers: [ticker],
    text: `The reason ${whose} for owning ${ticker} ${what}.`,
    detail: check.headline ? sentence(check.headline) : null,
    href: mode === "mine" ? "/watchlist?reasons=1" : "/portfolio",
    source: "Reason watcher",
    tone: check.verdict === "holds" ? "up" : check.verdict === "played_out" ? "flat" : "down",
    dedupeKey: `reason:${ticker}:${check.day}`,
  });
}

/* ── investors they follow ──────────────────────────────────────────────── */

export type FollowRecord = {
  id: string;
  slug: string;
  /** "Nancy Pelosi reported on Nov 6: sold WBD." */
  headline: string;
  date: string;
  tickers: string[];
};

export function followItem(activity: FollowRecord, mine: { owned: Set<string>; watched: Set<string> }): InboxItem | null {
  const at = instantOf(activity.date);
  if (!at || !activity.id || !activity.headline.trim()) return null;
  const tickers = [...new Set(activity.tickers.map(cleanTicker).filter((t): t is string => t !== null))];
  const owned = tickers.filter((t) => mine.owned.has(t));
  const watched = tickers.filter((t) => !mine.owned.has(t) && mine.watched.has(t));
  const yours = [...owned, ...watched];
  const tail = owned.length > 0 ? `, including ${listTickers(owned)}, which you own` : watched.length > 0 ? `, including ${listTickers(watched)}, which you watch` : "";
  const text = tail ? `${withoutStop(activity.headline)}${tail}.` : sentence(activity.headline);
  const ordered = [...yours, ...tickers.filter((t) => !yours.includes(t))];
  return base({
    id: `follow:${activity.id}`,
    kind: "follow",
    at,
    exact: !isBareDay(activity.date),
    tickers: ordered.slice(0, 4),
    text,
    href: `/follow/${encodeURIComponent(activity.slug)}`,
    source: "An investor you follow",
    tone: "flat",
    dedupeKey: `follow:${activity.id}`,
  });
}

/* ── insider buys in their stocks ───────────────────────────────────────── */

export type InsiderRecord = { id: string; ticker: string; insider: string; role: string; value: number | null; filedAt: string; url: string | null };

/** A buy smaller than this is a routine employee purchase, not news. */
export const MIN_INSIDER_BUY = 25_000;

/** "Director", "SVP", "Chairman and CEO, Director" as they read inside a sentence: "director", "SVP", "chairman and CEO, director". */
function roleWords(role: string): string {
  return role
    .trim()
    .split(/(\s+|,)/)
    .map((word) => (/^[A-Z]{2,5}$/.test(word) ? word : word.toLowerCase()))
    .join("");
}

/**
 * Open-market buys in one of the person's stocks, one item per stock per filing day: a single buyer is named, a few
 * are counted with their total. Buys under MIN_INSIDER_BUY are left out.
 */
export function insiderItems(trades: InsiderRecord[], positions: Map<string, Position>): InboxItem[] {
  const groups = new Map<string, Array<InsiderRecord & { at: string; day: string; ticker: string }>>();
  for (const trade of trades) {
    const ticker = cleanTicker(trade.ticker);
    const at = instantOf(trade.filedAt);
    const day = at ? nyDay(at) : null;
    if (!ticker || !at || !day || !trade.id || !trade.insider.trim() || !positions.has(ticker)) continue;
    if (trade.value == null || !(trade.value >= MIN_INSIDER_BUY)) continue;
    const key = `${ticker}:${day}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...trade, ticker, at, day }]);
  }
  const out: InboxItem[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const top = sorted[0]!;
    const ticker = top.ticker;
    const yours = positions.get(ticker) === "holding" ? "a stock you own" : "a stock you watch";
    const total = sorted.reduce((sum, trade) => sum + (trade.value ?? 0), 0);
    const people = new Set(sorted.map((trade) => trade.insider.trim()));
    const role = roleWords(top.role);
    const text =
      people.size === 1
        ? `${top.insider.trim()}, ${role ? `${role} at ${ticker}` : `an insider at ${ticker}`}, bought ${usd(total)} of ${ticker} in ${sorted.length === 1 ? "a filing" : "filings"} on ${shortDay(top.day)}, ${yours}.`
        : `${people.size} insiders at ${ticker} bought ${usd(total)} of the stock in filings on ${shortDay(top.day)}, ${yours}, led by ${top.insider.trim()}.`;
    const external = Boolean(top.url && /^https:\/\//.test(top.url));
    const latest = sorted.map((trade) => trade.at).sort().pop()!;
    const item = base({
      id: `insider:${key}`,
      kind: "insider",
      at: latest,
      exact: sorted.some((trade) => !isBareDay(trade.filedAt)),
      tickers: [ticker],
      text,
      href: external ? top.url! : `/stock/${encodeURIComponent(ticker)}`,
      external,
      source: "SEC Form 4",
      tone: "up",
      dedupeKey: `insider:${key}`,
    });
    if (item) out.push(item);
  }
  return out;
}

/* ── strategies they follow ─────────────────────────────────────────────── */

export type RebalanceRecord = {
  slug: string;
  name: string;
  /** The session the trades fill, which can be the day after the note was written. */
  date: string;
  /** When the note was written (ISO): the item's time, so a fill dated tomorrow does not sit on top as unread. */
  publishedAt: string | null;
  added: string[];
  removed: string[];
};

/** `locked`: the plan does not include following a strategy, so what it bought and sold is left out. */
export function strategyItem(rebalance: RebalanceRecord, locked: boolean): InboxItem | null {
  const at = instantOf(rebalance.publishedAt) ?? instantOf(rebalance.date);
  if (!at || !rebalance.slug || !rebalance.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(rebalance.date)) return null;
  const when = shortDay(rebalance.date);
  const name = rebalance.name.trim();
  let text: string;
  if (locked) {
    text = `${name}, a strategy you follow, rebalanced on ${when}, and what it bought and sold comes with Pro.`;
  } else {
    const parts = [
      rebalance.added.length > 0 ? `bought ${listTickers(rebalance.added)}` : null,
      rebalance.removed.length > 0 ? `sold ${listTickers(rebalance.removed)}` : null,
    ].filter(Boolean);
    text = parts.length > 0 ? `${name}, a strategy you follow, rebalanced on ${when}: it ${parts.join(" and ")}.` : `${name}, a strategy you follow, rebalanced on ${when} and kept the same stocks.`;
  }
  return base({
    id: `strategy:${rebalance.slug}:${rebalance.date}`,
    kind: "strategy",
    at,
    exact: Boolean(instantOf(rebalance.publishedAt)) && !isBareDay(rebalance.publishedAt),
    tickers: locked ? [] : [...rebalance.added, ...rebalance.removed].map(cleanTicker).filter((t): t is string => t !== null).slice(0, 4),
    text,
    href: `/strategies/${encodeURIComponent(rebalance.slug)}`,
    source: "A strategy you follow",
    locked,
    dedupeKey: `strategy:${rebalance.slug}:${rebalance.date}`,
  });
}

/* ── the weekly memo ────────────────────────────────────────────────────── */

export type MemoRecord = { weekKey: string; monday: string; writtenAt: string; headline: string | null };

export function memoItem(memo: MemoRecord): InboxItem | null {
  const at = instantOf(memo.writtenAt);
  if (!at || !memo.weekKey || !/^\d{4}-\d{2}-\d{2}$/.test(memo.monday)) return null;
  const head = memo.headline ? withoutStop(memo.headline) : "";
  return base({
    id: `memo:${memo.weekKey}`,
    kind: "memo",
    at,
    tickers: [],
    text: head ? `Your memo for the week of ${shortDay(memo.monday)} is ready: ${head}.` : `Your memo for the week of ${shortDay(memo.monday)} is ready.`,
    href: "/portfolio/memo",
    source: "Weekly memo",
    dedupeKey: `memo:${memo.weekKey}`,
  });
}
