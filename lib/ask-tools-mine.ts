import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  cardForModel,
  errorCard,
  roundOrNull,
  type AgentsCard,
  type AskCard,
  type BriefingItemCard,
  type MemoCard,
  type MemoLine,
  type ReasonRow,
  type ReasonsCard,
  type ResearchCard,
  type ResearchListCard,
  type SignInCard,
  type WatchCard,
} from "@/lib/ask-cards";
import { decisionLabel, describeJob, hiddenTemplateIds, type AgentRun } from "@/lib/agent-jobs";
import { listJobs, listRuns } from "@/lib/agent-jobs-data";
import { parseByRules } from "@/lib/agents-plain/parse";
import { sameJob } from "@/lib/agents-plain/save";
import { plainCatalog } from "@/lib/agents-plain/server";
import { BRIEFING_DAY_RE, BRIEFING_ITEM_ID_RE, type Briefing, type BriefingItem } from "@/lib/briefing";
import { BRIEFING_STATE_COLLECTION } from "@/lib/briefing-data";
import { getNextEarningsCalendarEventCached } from "@/lib/earnings";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { buildMemo } from "@/lib/memo/build";
import { currentWeek, loadSpanEvents, spanOf, userHoldings } from "@/lib/memo/data";
import { loadExampleMemo } from "@/lib/memo/server";
import { listMemos, readMemo } from "@/lib/memo/store";
import type { Memo, MemoItem, MemoReason } from "@/lib/memo/types";
import { BENCHMARK_SYMBOL, newYorkToday } from "@/lib/portfolio-data";
import { researchStore } from "@/lib/research/store";
import { cleanTicker as cleanResearchTicker, isReportKey, reportHref, type ResearchReport } from "@/lib/research/types";
import { VERDICT_WORDS } from "@/lib/thesis-watch/rules";
import { checkReasons, exampleReasonChecks, type CheckView } from "@/lib/thesis-watch/server";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";

/**
 * Ask's tools over the signed-in person's own things: saved reasons and the
 * watcher's latest check, this week's memo, their agents and what those last
 * found, their research reports, one line of their briefing, and a filled-in
 * "Watch this" for /agents.
 *
 * Scoping: every read uses `context.uid`, the session's uid that the route
 * resolved. No tool takes a uid, an email or a document id from the model, so
 * a question cannot reach anyone else's data. A report key or agent id the
 * model passes is looked up under this uid, so someone else's id finds nothing.
 *
 * Writes: none. The reason watcher runs with `persist: false`, the memo is
 * read from the store or built in memory without saving and without a model,
 * and "Watch this" only fills in the agent box; the person saves it there.
 */

export type MineToolContext = {
  uid: string | null;
  /** Who is asking, for plan gates (which reasons are checked, which memo lines show). */
  viewer: Viewer | null;
  /** The question came from the example portfolio (an `ex.` context). */
  example: boolean;
  now?: Date;
};

const SIGN_IN_MINE = "Sign in to ask about your own portfolio. Questions about any stock or the market work without an account.";

function signIn(message = SIGN_IN_MINE): SignInCard {
  return { card: "sign_in", message };
}

async function safeMine(name: string, run: () => Promise<AskCard>): Promise<AskCard> {
  try {
    return await run();
  } catch (error) {
    console.error("ask_tool_failed", name, error);
    return errorCard("That lookup failed on our side. Nothing was returned, so do not guess the answer.");
  }
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

/** Research text carries [S3] citation markers for the report page; a card reads without them. */
function uncite(value: string): string {
  return value.replace(/\s*\[S\d+(?:\s*,\s*S?\d+)*\]/g, "").replace(/\s+([.,;:])/g, "$1").trim();
}

function tickerOf(raw: string | null | undefined): string | null {
  return cleanResearchTicker(raw ?? null);
}

/** Holdings marked "holding" on a US instrument. */
function hasHoldings(userDoc: UserDoc | null): boolean {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  return tracked.some((id) => typeof id === "string" && kinds[id] === "holding");
}

/* ── reasons ────────────────────────────────────────────────────────────── */

function reasonRow(check: CheckView): ReasonRow {
  return {
    ticker: check.ticker,
    verdict: check.verdict,
    verdict_words: VERDICT_WORDS[check.verdict],
    headline: check.headline,
    note: check.note,
    quote: check.quote,
    findings: check.signals.slice(0, 3).map((signal) => ({ text: signal.text, source: signal.source, as_of: signal.asOf, href: signal.href })),
    changed_from: check.change ? { verdict: check.change.from, day: check.change.day } : null,
    as_of: check.asOf,
  };
}

const VERDICT_ORDER: Record<ReasonRow["verdict"], number> = { broken: 0, weaker: 1, played_out: 2, holds: 3 };

function sortRows(rows: ReasonRow[]): ReasonRow[] {
  return rows.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.ticker.localeCompare(b.ticker));
}

function newestDay(rows: ReasonRow[]): string | null {
  return rows.reduce<string | null>((best, row) => (!best || row.as_of > best ? row.as_of : best), null);
}

export async function reasonsCard(context: MineToolContext, loadDoc: () => Promise<UserDoc | null>, ticker: string | null): Promise<AskCard> {
  const exampleCard = async (): Promise<AskCard> => {
    const checks = await exampleReasonChecks(context.now ?? new Date());
    const rows = sortRows(checks.filter((check) => !ticker || check.ticker === ticker).map(reasonRow));
    if (ticker && rows.length === 0) return errorCard(`The example portfolio has no saved reason on ${ticker}.`);
    return {
      card: "reasons",
      example: true,
      saved: checks.length,
      rows,
      locked: [],
      unchecked: [],
      source: "The example portfolio: made-up reasons, checked against real data",
      as_of: newestDay(rows),
      source_url: "/portfolio",
    } satisfies ReasonsCard;
  };

  if (!context.uid || !context.viewer) return context.example ? exampleCard() : signIn();
  const userDoc = await loadDoc();
  const result = await checkReasons(context.viewer, userDoc, { persist: false, word: false, now: context.now });
  const saved = Object.keys(result.theses).length;
  if (saved === 0 && context.example) return exampleCard();
  const idOf = (id: string) => id.replace(/^US_/, "").replace(/_/g, ".");
  let rows = sortRows(Object.values(result.checks).map(reasonRow));
  let locked = result.locked.map(idOf);
  let unchecked = result.unchecked.map(idOf);
  if (ticker) {
    rows = rows.filter((row) => row.ticker === ticker);
    locked = locked.filter((symbol) => symbol === ticker);
    unchecked = unchecked.filter((symbol) => symbol === ticker);
    if (rows.length === 0 && locked.length === 0 && unchecked.length === 0) {
      return errorCard(`You have not saved a reason for owning ${ticker}. You can add one from its row on your portfolio page.`);
    }
  }
  return {
    card: "reasons",
    example: false,
    saved,
    rows,
    locked,
    unchecked,
    source: "Your saved reasons, checked by the reason watcher against our stored data",
    as_of: newestDay(rows),
    source_url: "/portfolio",
  } satisfies ReasonsCard;
}

/* ── the memo ───────────────────────────────────────────────────────────── */

/** "2026-11-10" to "Tuesday, Nov 10", so an answer never works out a weekday itself. */
function dayName(day: string): string | null {
  const at = Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(at) ? new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) : null;
}

function memoLine(item: MemoItem): MemoLine {
  return { id: item.id, text: item.text, tickers: item.tickers, source: item.source, as_of: item.asOf, href: item.href };
}

export function memoCardOf(memo: Memo, example: boolean, focusId: string | null, source: string): MemoCard {
  const changed = memo.changed.map(memoLine);
  const hurt = memo.hurt.map(memoLine);
  const look = memo.look.map(memoLine);
  const week = memo.week ? memoLine(memo.week) : null;
  const focus = focusId ? [week, ...changed, ...hurt, ...look].find((line) => line?.id === focusId) ?? null : null;
  return {
    card: "memo",
    example,
    week_key: memo.weekKey,
    monday: memo.monday,
    friday: memo.friday,
    end_day: memo.endDay,
    through: memo.endDay ? dayName(memo.endDay) : null,
    complete: memo.complete,
    top_line: memo.topLine,
    week: week?.text ?? null,
    changed,
    hurt,
    look,
    focus,
    focus_missing: Boolean(focusId && !focus),
    held_back: memo.heldBack,
    source,
    as_of: memo.endDay ?? memo.writtenAt,
    source_url: example ? "/portfolio/memo" : `/portfolio/memo?week=${encodeURIComponent(memo.weekKey)}`,
  };
}

/** Reasons the watcher found weaker or broken on these holdings, read without saving anything. */
async function quietMemoReasons(viewer: Viewer, userDoc: UserDoc | null, tickers: string[], now: Date): Promise<MemoReason[]> {
  const held = new Set(tickers);
  const result = await checkReasons(viewer, userDoc, { persist: false, word: false, now }).catch(() => null);
  return Object.values(result?.checks ?? {})
    .filter((check) => held.has(check.ticker) && (check.verdict === "weaker" || check.verdict === "broken") && check.signals[0])
    .sort((a, b) => (a.verdict === b.verdict ? a.ticker.localeCompare(b.ticker) : a.verdict === "broken" ? -1 : 1))
    .map((check) => {
      const signal = check.signals[0]!;
      return { ticker: check.ticker, verdict: check.verdict as MemoReason["verdict"], finding: signal.text, source: signal.source, asOf: signal.asOf, data: signal.data };
    });
}

/**
 * This week's memo from the memo's own rules, in memory: no model, no save.
 * Leaves out the portfolio-shape lines (look-through exposure, dividends,
 * past shocks), which take the longest to read; the memo page has them.
 */
async function quietUserMemo(viewer: Viewer, userDoc: UserDoc | null, now: Date): Promise<Memo | null> {
  const source = await userHoldings(userDoc, (instrumentId) => canSeeLevels(viewer, instrumentId));
  if (!source) return null;
  const tickers = source.holdings.map((holding) => holding.ticker);
  const current = await currentWeek(tickers, now);
  if (!current) return null;
  const [events, reasons] = await Promise.all([
    loadSpanEvents(source.holdings, spanOf([current.week], current.today)),
    quietMemoReasons(viewer, userDoc, tickers, now),
  ]);
  return buildMemo(
    {
      week: current.week,
      today: current.today,
      subject: source.subject,
      holdings: source.holdings,
      series: current.series,
      benchmark: current.series.get(BENCHMARK_SYMBOL) ?? null,
      ...events,
      exposure: null,
      dividends: [],
      stress: null,
      reasons,
    },
    now,
  ).memo;
}

export async function weekCard(context: MineToolContext, loadDoc: () => Promise<UserDoc | null>, itemId: string | null): Promise<AskCard> {
  const now = context.now ?? new Date();
  const today = newYorkToday(now);
  const exampleCard = async (): Promise<AskCard> => {
    const data = await loadExampleMemo(today, null, { worded: false });
    if (!data) return errorCard("The example portfolio's memo is not available right now.");
    return memoCardOf(data.memo, true, itemId, "The example portfolio's weekly memo: made-up holdings, real prices and filings");
  };
  if (!context.uid || !context.viewer) return context.example ? exampleCard() : signIn();
  const uid = context.uid;
  const userDoc = await loadDoc();
  if (!hasHoldings(userDoc)) {
    if (context.example) return exampleCard();
    return errorCard("You have no holdings saved, so there is no memo for you yet. Add the stocks you own with their shares on your portfolio page.");
  }
  // The memo page writes the week's memo once a day. Today's copy is the one the person read; anything older is rebuilt quietly.
  const latest = (await listMemos(uid).catch(() => []))[0] ?? null;
  const stored = latest ? await readMemo(uid, latest.weekKey).catch(() => null) : null;
  if (stored && stored.day === today) return memoCardOf(stored.memo, false, itemId, "Your weekly memo, from your holdings and the stored prices, calls and filings");
  const built = await quietUserMemo(context.viewer, userDoc, now).catch((error) => {
    console.warn("[ask] quiet memo failed:", error instanceof Error ? error.message : error);
    return null;
  });
  if (built) return memoCardOf(built, false, itemId, "Your weekly memo, worked out now from your holdings and the stored prices, calls and filings");
  if (stored) return memoCardOf(stored.memo, false, itemId, `Your weekly memo as written on ${stored.day}`);
  return errorCard("Your memo could not be put together right now. The memo page may have it.");
}

/* ── agents ─────────────────────────────────────────────────────────────── */

function runOf(run: AgentRun | undefined): AgentsCard["rows"][number]["last_run"] {
  if (!run) return null;
  return {
    day: run.day,
    decision: decisionLabel(run.decision),
    summary: run.summary,
    findings: run.findings.slice(0, 4).map((finding) => ({ ticker: finding.ticker, headline: finding.headline, detail: clip(finding.detail, 240) ?? "", at: finding.at })),
  };
}

export async function agentsCard(context: MineToolContext, jobId: string | null): Promise<AskCard> {
  if (!context.uid) return signIn("Sign in to see your agents. An agent watches stocks for you and reports what it finds.");
  const uid = context.uid;
  const [jobs, runs] = await Promise.all([listJobs(uid), listRuns(uid, 120)]);
  const latest = new Map<string, AgentRun>();
  for (const run of runs) if (!latest.has(run.job_id)) latest.set(run.job_id, run);
  const focus = jobId ? jobs.find((job) => job.id === jobId) ?? null : null;
  // The one the link pointed at first, then switched-on agents, then the rest.
  const ordered = [...jobs].sort((a, b) => Number(b.id === focus?.id) - Number(a.id === focus?.id) || Number(b.enabled) - Number(a.enabled));
  const rows = ordered.slice(0, 12).map((job) => ({
    id: job.id,
    name: job.name,
    watches: describeJob(job),
    enabled: job.enabled,
    last_run: runOf(latest.get(job.id)),
  }));
  const asOf = rows.reduce<string | null>((best, row) => (row.last_run && (!best || row.last_run.day > best) ? row.last_run.day : best), null);
  return {
    card: "agents",
    total: jobs.length,
    rows,
    focus: focus?.id ?? null,
    focus_missing: Boolean(jobId && !focus),
    source: "Your agents and their latest runs",
    as_of: asOf,
    source_url: focus ? `/agents/jobs?job=${encodeURIComponent(focus.id)}` : "/agents",
  } satisfies AgentsCard;
}

/* ── research reports ───────────────────────────────────────────────────── */

function researchCardOf(report: ResearchReport): ResearchCard {
  const body = report.body;
  return {
    card: "research",
    ticker: report.ticker,
    name: report.name,
    key: report.key,
    status: report.status,
    created_at: report.created_at,
    headline: body?.headline ? uncite(body.headline) : null,
    summary: (body?.summary ?? []).slice(0, 5).map(uncite),
    change: (body?.change ?? []).slice(0, 3).map(uncite),
    watch: (body?.watch ?? []).slice(0, 4).map((row) => ({ date: row.date, text: uncite(row.text) })),
    risks: (body?.risks ?? []).slice(0, 3).map((row) => ({ title: uncite(row.title), text: uncite(row.text) })),
    sources: report.sources.length,
    href: reportHref(report.ticker, report.key),
    source: "Your research report, written from filings, news and our data",
    as_of: report.finished_at ?? report.updated_at,
    source_url: reportHref(report.ticker, report.key),
  };
}

export async function researchCard(context: MineToolContext, input: { ticker?: string; key?: string }): Promise<AskCard> {
  if (!context.uid) return signIn("Sign in to open your research reports.");
  const uid = context.uid;
  const ticker = tickerOf(input.ticker);
  if (input.ticker && !ticker) return errorCard("That does not look like a ticker.");
  if (input.key) {
    if (!ticker || !isReportKey(input.key)) return errorCard("That report link is not valid.");
    const report = await researchStore.get(uid, ticker, input.key);
    if (!report) return errorCard(`That ${ticker} report is not in your account.`);
    if (report.status !== "ready") return errorCard(report.status === "running" ? `Your ${ticker} report is still being written.` : `Your ${ticker} report did not finish, so there is nothing in it to read.`);
    return researchCardOf(report);
  }
  const items = (await researchStore.list(uid)).filter((item) => !ticker || item.ticker === ticker);
  const ready = items.filter((item) => item.status === "ready");
  // One stock named: open its newest finished report, which is what "my NVDA report" means.
  if (ticker && ready[0]) {
    const report = await researchStore.get(uid, ticker, ready[0].key);
    if (report && report.status === "ready") return researchCardOf(report);
  }
  return {
    card: "research_list",
    ticker,
    reports: items.slice(0, 10).map((item) => ({
      ticker: item.ticker,
      name: item.name,
      key: item.key,
      status: item.status,
      created_at: item.created_at,
      headline: item.headline ? uncite(item.headline) : null,
      href: reportHref(item.ticker, item.key),
    })),
    source: "Your research reports",
    as_of: items[0]?.created_at ?? null,
    source_url: ticker ? `/stock/${encodeURIComponent(ticker)}/research` : null,
  } satisfies ResearchListCard;
}

/* ── one briefing line ──────────────────────────────────────────────────── */

function isBriefing(value: unknown): value is Briefing {
  const candidate = value as Partial<Briefing> | null;
  return Boolean(candidate && typeof candidate === "object" && Array.isArray(candidate.needs_you) && Array.isArray(candidate.also_today));
}

export async function briefingItemCard(context: MineToolContext, input: { ticker: string; day: string; item_id: string }): Promise<AskCard | null> {
  if (!context.uid) return null;
  if (!BRIEFING_DAY_RE.test(input.day) || !BRIEFING_ITEM_ID_RE.test(input.item_id)) return null;
  const snap = await adminFirestore.collection(BRIEFING_STATE_COLLECTION).doc(`${context.uid}__${input.day}`).get();
  const data = snap.exists ? (snap.data() as { uid?: unknown; snapshot?: unknown }) : null;
  // The document id carries the uid, and the stored uid has to agree with it.
  if (!data || data.uid !== context.uid || !isBriefing(data.snapshot)) return null;
  const item: BriefingItem | undefined = [...data.snapshot.needs_you, ...data.snapshot.also_today].find((row) => row.id === input.item_id);
  if (!item || item.ticker.toUpperCase() !== input.ticker.toUpperCase()) return null;
  return {
    card: "briefing_item",
    ticker: item.ticker,
    name: item.name,
    day: input.day,
    headline: item.headline,
    why: item.why,
    metric: item.metric,
    reason_confirmed: item.reason_status === "confirmed",
    next_step: item.next_step,
    evidence: item.evidence.slice(0, 5).map((row) => ({ label: row.label, source: row.source, url: row.url, at: row.at })),
    day_change_pct: roundOrNull(item.day_change_pct),
    price: roundOrNull(item.price),
    source: "Your daily briefing",
    as_of: item.as_of ?? input.day,
    source_url: `/briefing?day=${input.day}`,
  } satisfies BriefingItemCard;
}

/* ── "Watch this" ───────────────────────────────────────────────────────── */

export const WATCH_KINDS = ["price_below", "price_above", "daily_move", "earnings_before", "insider_trade", "congress_trade", "fund_13f", "buy_zone"] as const;
export type WatchKindInput = (typeof WATCH_KINDS)[number];

/**
 * The request typed into the agent box, in the shapes its rule reader turns
 * into an agent (pinned by lib/ask-tools-mine.test.ts). Null when the parts do
 * not make one: no stock for a stock-only kind, a number out of range.
 */
export function watchRequest(input: { kind: WatchKindInput; ticker?: string | null; mine?: boolean; level?: number | null; pct?: number | null; days?: number | null }): string | null {
  const ticker = tickerOf(input.ticker);
  const mine = !ticker && input.mine === true;
  const who = ticker ?? (mine ? "my stocks" : null);
  if (!who) return null;
  const level = typeof input.level === "number" && Number.isFinite(input.level) && input.level > 0 && input.level < 1_000_000 ? input.level : null;
  switch (input.kind) {
    case "price_below":
    case "price_above": {
      if (!ticker || level === null) return null;
      const shown = Number.isInteger(level) ? String(level) : level.toFixed(2);
      return `Tell me when ${ticker} closes ${input.kind === "price_below" ? "below" : "above"} ${shown}`;
    }
    case "daily_move": {
      const pct = Math.round(input.pct ?? 5);
      if (!(pct >= 1 && pct <= 50)) return null;
      return ticker ? `Tell me when ${ticker} moves ${pct}% in a day` : `Tell me when anything I own moves ${pct}% in a day`;
    }
    case "earnings_before": {
      const days = Math.round(input.days ?? 3);
      if (!(days >= 1 && days <= 14)) return null;
      return `Tell me ${days} ${days === 1 ? "day" : "days"} before ${ticker ?? "my stocks"} ${ticker ? "reports" : "report"} earnings`;
    }
    case "insider_trade":
      return `Tell me when insiders buy or sell ${who}`;
    case "congress_trade":
      return ticker ? `Tell me when a member of Congress trades ${ticker}` : null;
    case "fund_13f":
      return ticker ? `Tell me when a fund sells ${ticker}` : null;
    case "buy_zone":
      return ticker ? `Tell me when ${ticker} is a good price to buy` : null;
  }
}

/** Whole days from one New York day to another. */
function daysFrom(today: string, day: string): number | null {
  const a = Date.parse(`${today}T12:00:00Z`);
  const b = Date.parse(`${day.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

/**
 * A reminder before one stock's next report has to be able to fire: a report two or three days out gets the
 * day-before reminder, the same rule as the reminders elsewhere in the app (lib/next-steps.ts). A report today
 * or tomorrow keeps the asked-for reminder, which then starts with the report after it, and the card says so.
 */
async function earningsTiming(input: Parameters<typeof watchRequest>[0], now: Date): Promise<{ days: number | null; note: string | null }> {
  const ticker = tickerOf(input.ticker);
  if (input.kind !== "earnings_before" || !ticker) return { days: null, note: null };
  const asked = Math.round(input.days ?? 3);
  const event = await getNextEarningsCalendarEventCached("US", ticker).catch(() => null);
  const gap = event?.event_date ? daysFrom(newYorkToday(now), event.event_date) : null;
  if (gap === null || gap < 0 || gap > asked) return { days: null, note: null };
  if (gap >= 2) return { days: 1, note: `${ticker} reports in ${gap} days, so this reminds you the day before.` };
  return { days: null, note: `${ticker}'s report is ${gap === 0 ? "today" : "tomorrow"}, too close for a reminder, so this one starts with the report after it.` };
}

export async function watchCard(context: MineToolContext, input: Parameters<typeof watchRequest>[0]): Promise<AskCard> {
  const timing = await earningsTiming(input, context.now ?? new Date());
  if (timing.days !== null) input = { ...input, days: timing.days };
  // Signed out there is no "my stocks" to watch; this would be a card about nothing.
  if (!context.uid && input.mine === true && !tickerOf(input.ticker)) {
    return errorCard("Signed out, there are no stocks of their own to watch. Name the stock the answer is about, or offer no agent; do not mention this in the answer.");
  }
  const request = watchRequest(input);
  if (!request && !tickerOf(input.ticker) && input.mine !== true) {
    return errorCard("An agent watches one stock (or, signed in, every stock the person tracks). Name the stock the answer is about, or offer no agent; do not mention this in the answer.");
  }
  if (!request) return errorCard("That is not something an agent can watch in that form. Agents watch a closing price level, a big daily move, an upcoming report, insider, Congress or fund trades, or the add level from our call.");
  const catalog = await plainCatalog();
  const parsed = parseByRules(request, catalog, { hidden: hiddenTemplateIds() });
  // Only a request the agent box turns into an agent with nothing refused is offered, so the button never lands on "I can't watch that yet".
  if (parsed.spec.watches.length === 0 || parsed.spec.cannot.length > 0) {
    return errorCard(parsed.spec.cannot[0]?.line ?? "An agent cannot watch that yet.");
  }
  let existing: WatchCard["existing"] = [];
  let note: string | null = [timing.note, ...parsed.spec.watches.map((watch) => watch.note)].filter(Boolean).join(" ") || null;
  if (context.uid) {
    const jobs = await listJobs(context.uid).catch(() => null);
    if (jobs) {
      const matches = parsed.spec.watches.map((watch) => jobs.find((job) => sameJob(job, watch.draft)) ?? null);
      // "Already" only when every agent the request would make exists. Anything less is still offered.
      if (matches.every(Boolean)) existing = matches.map((job) => ({ name: job!.name, enabled: job!.enabled }));
    }
  } else {
    // The Agents page shows the agent and its last four weeks before any sign-in; only saving it takes an account.
    const saving = "The Agents page shows what it would have caught over the last four weeks. Saving it takes a free account.";
    note = note ? `${note} ${saving}` : saving;
  }
  return {
    card: "watch",
    status: existing.length > 0 ? "already" : "ready",
    request,
    preview: parsed.spec.sentence,
    href: `/agents?q=${encodeURIComponent(request)}`,
    existing,
    note,
    source: existing.length > 0 ? "Your agents" : "Nothing is set up until you save it on the Agents page",
    as_of: null,
    source_url: "/agents",
  } satisfies WatchCard;
}

/* ── the tools ──────────────────────────────────────────────────────────── */

const TICKER = z.string().min(1).max(12).describe("US ticker, like NVDA or BRK.B");

/** What the model reads: the card itself, the same as every other Ask tool (lib/ask-tools.ts). */
const modelView = ({ output }: { output: unknown }) => ({ type: "json" as const, value: cardForModel(output as AskCard) as never });

export function buildMineTools(context: MineToolContext): ToolSet {
  // One read of the person's document per question, shared by the tools that need it.
  let doc: Promise<UserDoc | null> | null = null;
  const loadDoc = () => {
    if (!context.uid) return Promise.resolve(null);
    doc ??= getUserDoc(context.uid).catch(() => null);
    return doc;
  };

  return {
    get_my_reasons: tool({
      description:
        "The signed-in person's saved reasons for owning their stocks and the reason watcher's latest verdict on each (holds, weaker, broken, played out), with what fired and its source. Use it for 'which of my reasons are weaker' or 'is my reason for X still holding'.",
      inputSchema: z.object({ ticker: TICKER.optional().describe("One stock, or leave out for every reason") }),
      execute: async ({ ticker }) =>
        safeMine("get_my_reasons", async () => {
          const symbol = ticker ? tickerOf(ticker) : null;
          if (ticker && !symbol) return errorCard("That does not look like a ticker.");
          return reasonsCard(context, loadDoc, symbol);
        }),
      toModelOutput: modelView,
    }),

    get_my_week: tool({
      description:
        "The signed-in person's weekly memo for this week: how their holdings did against the S&P 500, what changed (calls, explained moves, earnings reports, filings), what could hurt and what to look at. Use it for 'how is my portfolio doing this week'.",
      inputSchema: z.object({ item_id: z.string().max(120).optional().describe("A memo line id from a link, to start from that line") }),
      execute: async ({ item_id }) => safeMine("get_my_week", () => weekCard(context, loadDoc, item_id ?? null)),
      toModelOutput: modelView,
    }),

    get_my_agents: tool({
      description: "The signed-in person's agents (standing watches), what each watches, whether it is on, and what its latest run found.",
      inputSchema: z.object({ job_id: z.string().max(24).optional().describe("One agent's id from a link") }),
      execute: async ({ job_id }) => safeMine("get_my_agents", () => agentsCard(context, job_id ?? null)),
      toModelOutput: modelView,
    }),

    get_my_research: tool({
      description:
        "The signed-in person's long research reports. With a ticker, opens their newest finished report on it (headline, summary, what changed, what to watch, risks). With nothing, lists their reports.",
      inputSchema: z.object({ ticker: TICKER.optional(), key: z.string().max(24).optional().describe("A report key from a link") }),
      execute: async (input) => safeMine("get_my_research", () => researchCard(context, input)),
      toModelOutput: modelView,
    }),

    open_briefing_item: tool({
      description: "One line of the signed-in person's daily briefing, by the ids in a link. Only call it with ids given in this conversation.",
      inputSchema: z.object({ ticker: TICKER, day: z.string().max(10), item_id: z.string().max(160) }),
      execute: async (input) =>
        safeMine("open_briefing_item", async () => {
          if (!context.uid) return signIn("Sign in to open your briefing.");
          const card = await briefingItemCard(context, input);
          return card ?? errorCard(`That briefing line is no longer saved. Answer about ${input.ticker.toUpperCase()} with get_stock and get_news instead.`);
        }),
      toModelOutput: modelView,
    }),

    suggest_watch: tool({
      description:
        "Offer an agent that keeps watching something after this answer: a closing price level, a big daily move, a reminder before earnings, insider, Congress or fund trades, or the add level from our call. It sets nothing up: the card has a 'Watch this' button that opens the Agents page with the request filled in, and the person saves it there. Call it when your answer points to something worth watching, at most once per answer.",
      inputSchema: z.object({
        kind: z.enum(WATCH_KINDS),
        ticker: TICKER.optional().describe("The stock. Required, unless mine=true for every stock a signed-in person tracks. There is no market-wide agent"),
        mine: z.boolean().optional().describe("Watch every stock the person tracks (daily_move, earnings_before, insider_trade only)"),
        level: z.number().positive().optional().describe("Price level for price_below or price_above, from a card in this conversation"),
        pct: z.number().positive().optional().describe("Move size for daily_move, 1 to 50. Defaults to 5"),
        days: z.number().int().positive().optional().describe("Days ahead for earnings_before, 1 to 14. Defaults to 3"),
      }),
      execute: async (input) => safeMine("suggest_watch", () => watchCard(context, input)),
      toModelOutput: modelView,
    }),
  };
}
