/**
 * Next steps offered right where a finding is: the page notices something, says
 * what it means, and offers to keep going. Two kinds of step, both prefilled and
 * both waiting for the person:
 *
 * - a question for Ask (/ask?q=...), which asks it on arrival. Only questions
 *   Ask's tools can answer: news and moves (get_news), our call and what would
 *   change it (get_stock), returns against the S&P 500 (get_price_history).
 * - a request for the agent box (/agents?q=...), read back before anything is
 *   saved. Only the two shapes ./agents-plain/ask-links.ts builds, which the
 *   rule reader is tested to turn into an agent.
 *
 * Each finding gets two steps at most. The builders that write a page's read
 * stay as they are; these decorate the finished read by insight id, so the
 * wording of the read and its steps change independently.
 */

import { watchEarningsHref, watchMoveHref } from "@/lib/agents-plain/ask-links";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { MARKET_GROUP_KEY, type BriefingGroup } from "@/lib/briefing-groups";
import { dayGap } from "@/lib/insight-format";
import type { Insight, InsightAction, TheRead } from "@/lib/insights";

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Where "Does this affect my stocks?" goes: the My stocks overview, which shows the example to anyone without holdings. */
export const MY_STOCKS_HREF = "/portfolio";
export const AFFECT_LABEL = "Does this affect my stocks?";

/** Ask, with the question filled in and asked on arrival. */
export function askHref(question: string): string {
  return `/ask?q=${encodeURIComponent(question.trim().slice(0, ASK_MAX_QUESTION_CHARS))}`;
}

function cleanTicker(ticker: string | null | undefined): string | null {
  const symbol = (ticker ?? "").trim().toUpperCase();
  return TICKER.test(symbol) ? symbol : null;
}

/** One decimal, the way the reads print a move ("16.5%"), so the question matches the line it came from. */
function pctWords(pct: number): string {
  return `${Math.abs(pct).toFixed(1)}%`;
}

/** "Why did HIMS fall 16.5%?": a move with its size, so the answer is about the right day without naming one. */
export function whyMovedQuestion(ticker: string, pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05) return `What's behind ${ticker}'s latest move?`;
  return `Why did ${ticker} ${pct > 0 ? "rise" : "fall"} ${pctWords(pct)}?`;
}

/**
 * An earnings reminder that can still fire: three days before when the report is
 * four or more days out, the day before when it is two or three, none when it is
 * tomorrow or today. Same rule as the My stocks overview (lib/portfolio-home/pick.ts).
 */
export function earningsReminder(ticker: string, daysAway: number | null | undefined): { days: 1 | 3; href: string } | null {
  if (daysAway == null || !Number.isFinite(daysAway) || daysAway < 2) return null;
  const days = daysAway >= 4 ? 3 : 1;
  const href = watchEarningsHref(ticker, days);
  return href ? { days, href } : null;
}

/** Adds a step to a finding: its first when it has none, its second when it has one, never a third. */
export function withStep(insight: Insight, step: InsightAction | null): Insight {
  if (!step) return insight;
  if (!insight.action) return { ...insight, action: step };
  if (insight.secondAction || insight.action.href === step.href) return insight;
  return { ...insight, secondAction: step };
}

/* ── the stock page: under our call ────────────────────────────────────── */

export type CallSteps = { ask: InsightAction[]; watch: InsightAction | null };

/**
 * Under the call on a stock page: two questions for Ask and one thing to watch.
 * "What would change your mind" only when the reader can see the full read
 * (Ask's stock card leaves the reasons out otherwise); a big move today gets
 * "why", otherwise the risks or the news. The watch is an earnings reminder
 * when a report is far enough out, else a 5% day.
 */
export function stockCallSteps(input: {
  ticker: string;
  /** Whether this reader sees the full read (what would change the call, the risks). */
  fullRead: boolean;
  dayPct: number | null | undefined;
  /** Days until the next report, or null when we do not know one. */
  earningsInDays: number | null | undefined;
}): CallSteps | null {
  const ticker = cleanTicker(input.ticker);
  if (!ticker) return null;
  const first = input.fullRead ? `What would change your mind on ${ticker}?` : `How has ${ticker} done against the S&P 500 this year?`;
  const bigMove = input.dayPct != null && Number.isFinite(input.dayPct) && Math.abs(input.dayPct) >= 2;
  const second = bigMove ? whyMovedQuestion(ticker, input.dayPct) : input.fullRead ? `What are the biggest risks for ${ticker} right now?` : `What is the latest news on ${ticker}?`;
  const reminder = earningsReminder(ticker, input.earningsInDays);
  const move = reminder ? null : watchMoveHref(ticker, 5);
  return {
    ask: [first, second].map((question) => ({ label: question, href: askHref(question) })),
    watch: reminder
      ? { label: reminder.days === 3 ? "Remind me 3 days before earnings" : "Remind me the day before earnings", href: reminder.href }
      : move
        ? { label: `Tell me when ${ticker} moves 5% in a day`, href: move }
        : null,
  };
}

/* ── the briefing ───────────────────────────────────────────────────────── */

/**
 * The market view's lead story: the biggest move among the stocks that need
 * you, the same pick lib/briefing-read.ts makes for its headline.
 */
export function briefingLead(needsYou: ReadonlyArray<Pick<BriefingGroup, "key" | "ticker" | "day_change_pct">>): { ticker: string; pct: number | null } | null {
  const lead = needsYou
    .filter((group) => group.key !== MARKET_GROUP_KEY && group.ticker)
    .reduce<(typeof needsYou)[number] | null>((best, group) => (!best || Math.abs(group.day_change_pct ?? 0) > Math.abs(best.day_change_pct ?? 0) ? group : best), null);
  return lead?.ticker ? { ticker: lead.ticker, pct: lead.day_change_pct } : null;
}

const isStoryRow = (insight: Insight) => insight.id.startsWith("move-") || insight.id.startsWith("mover-");

/**
 * The briefing's steps. In the market view the lead story (the biggest move
 * with a confirmed reason) gets "Why did it fall?" and "Watch HIMS for me", on
 * its row or, when the headline tells it, under the headline; and the read gets
 * "Does this affect my stocks?" on the index line, or under a headline about the
 * whole session. In your own briefing each move on your stocks
 * gets a question for Ask beside its link.
 */
export function briefingSteps(
  read: TheRead | null,
  input: { mode: "market" | "personal"; lead: { ticker: string | null; pct: number | null } | null },
): TheRead | null {
  if (!read) return read;
  if (input.mode === "personal") {
    return {
      ...read,
      insights: read.insights.map((insight) => {
        const ticker = insight.tickers?.length === 1 ? cleanTicker(insight.tickers[0]) : null;
        if (!ticker || !isStoryRow(insight)) return insight;
        return withStep(insight, { label: "Ask why it moved", href: askHref(whyMovedQuestion(ticker, null)) });
      }),
    };
  }

  const ticker = cleanTicker(input.lead?.ticker);
  const pct = input.lead?.pct ?? null;
  const leadSteps: InsightAction[] = [];
  if (ticker) {
    leadSteps.push({
      label: pct != null && Number.isFinite(pct) && Math.abs(pct) >= 0.05 ? `Why did it ${pct > 0 ? "rise" : "fall"}?` : "Why did it move?",
      href: askHref(whyMovedQuestion(ticker, pct)),
    });
    const watch = watchMoveHref(ticker, 5);
    if (watch) leadSteps.push({ label: `Watch ${ticker} for me`, href: watch });
  }
  const affect: InsightAction = { label: AFFECT_LABEL, href: MY_STOCKS_HREF };

  let insights = read.insights;
  let actions: InsightAction[] = [];
  const leadRow = ticker ? insights.findIndex((insight) => insight.id.startsWith("move-") && insight.tickers?.[0] === ticker) : -1;
  if (leadRow >= 0) {
    // The row's company name already opens the stock page, so its two steps are the question and the watch.
    insights = insights.map((insight, index) => (index === leadRow ? { ...insight, action: leadSteps[0], secondAction: leadSteps[1] } : insight));
  } else if (ticker && read.headlineTickers?.includes(ticker)) {
    actions = leadSteps;
  }
  // "Does this affect my stocks?" sits with the market's own line: the index row when the headline tells a
  // story, the headline itself when it is the whole session (that read has no index row).
  const indexRow = insights.findIndex((insight) => insight.id === "index");
  if (indexRow >= 0) insights = insights.map((insight, index) => (index === indexRow ? withStep(insight, affect) : insight));
  else if (actions.length === 0) actions = [affect];
  // Steps show under a headline, so a read without one keeps none.
  return { ...read, insights, ...(actions.length > 0 && read.headline ? { actions } : {}) };
}

/* ── the watchlist ──────────────────────────────────────────────────────── */

/**
 * The watchlist's steps: an earnings line gets a reminder before the first
 * report it names, and a line about who moved gets a question for Ask.
 */
export function portfolioSteps(
  read: TheRead | null,
  input: {
    /** Which tab the read is for. Only Holdings and Watching talk about today's moves and reports; Analytics reuses ids like "contributors" for gains on cost. */
    tab: string;
    positions: ReadonlyArray<{ ticker: string; dayPct: number | null; nextEarnings: { date: string } | null }>;
    today: string;
  },
): TheRead | null {
  if (!read || (input.tab !== "positions" && input.tab !== "watching")) return read;
  const byTicker = new Map(input.positions.map((position) => [position.ticker.toUpperCase(), position]));
  return {
    ...read,
    insights: read.insights.map((insight) => {
      const first = cleanTicker(insight.tickers?.[0]);
      const position = first ? byTicker.get(first) : undefined;
      if (!first || !position) return insight;
      if (insight.id === "earnings") {
        const gap = position.nextEarnings ? dayGap(input.today, position.nextEarnings.date) : null;
        const reminder = earningsReminder(first, gap);
        if (!reminder) return insight;
        const many = (insight.tickers?.length ?? 0) > 1;
        const when = reminder.days === 3 ? "3 days" : "the day";
        return withStep(insight, { label: `Remind me ${when} before ${many ? `${first} reports` : "it reports"}`, href: reminder.href });
      }
      if (insight.id === "contributors" || insight.id === "movers") {
        const pct = position.dayPct;
        const verb = pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.05 ? "moved" : pct > 0 ? "rose" : "fell";
        // The row's own link is "Why NVDA moved" (our page); this one asks, so it says so and names the direction.
        return withStep(insight, { label: `Ask why ${first} ${verb}`, href: askHref(whyMovedQuestion(first, pct)) });
      }
      return insight;
    }),
  };
}

/* ── Market today ──────────────────────────────────────────────────────── */

/** Market today's top development gets "Does this affect my stocks?". */
export function marketTodaySteps(read: TheRead | null): TheRead | null {
  if (!read || read.insights.length === 0) return read;
  const [top, ...rest] = read.insights;
  return { ...read, insights: [withStep(top!, { label: AFFECT_LABEL, href: MY_STOCKS_HREF }), ...rest] };
}
