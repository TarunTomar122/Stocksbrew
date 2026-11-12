/**
 * Next steps under the call on a stock page: two questions and one thing to
 * watch, both prefilled and both waiting for the person.
 *
 * - A question for Ask (/ask?q=...), which asks it on arrival. Only questions
 *   Ask's tools can answer: news and moves (get_news), our call and what would
 *   change it (get_stock), returns against the S&P 500 (get_price_history).
 * - A request for the agent box (/agents?q=...), read back before anything is
 *   saved. Only the two shapes ./agents-plain/ask-links.ts builds, which the
 *   rule reader is tested to turn into an agent.
 *
 * It also holds askHref, the prefilled link to Ask that My stocks uses too.
 */

import { watchEarningsHref, watchMoveHref } from "@/lib/agents-plain/ask-links";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import { formatAskContext, parseAskContext, type AskContext } from "@/lib/ask-context";
import type { InsightAction } from "@/lib/insights";

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/**
 * Ask, with the question filled in and asked on arrival. `context` names the
 * item the question is about (lib/ask-context.ts: a stock, a research report,
 * a saved reason, a memo line, a briefing line, an agent, the portfolio), so
 * the first answer starts from that item's evidence. Ids only; a context that
 * is not valid is left off rather than sent.
 */
export function askHref(question: string, context?: AskContext | string | null): string {
  const base = `/ask?q=${encodeURIComponent(question.trim().slice(0, ASK_MAX_QUESTION_CHARS))}`;
  const parsed = typeof context === "string" ? parseAskContext(context) : context ? parseAskContext(formatAskContext(context)) : null;
  return parsed ? `${base}&ctx=${encodeURIComponent(formatAskContext(parsed))}` : base;
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
    ask: [first, second].map((question) => ({ label: question, href: askHref(question, `stock:${ticker}`) })),
    watch: reminder
      ? { label: reminder.days === 3 ? "Remind me 3 days before earnings" : "Remind me the day before earnings", href: reminder.href }
      : move
        ? { label: `Tell me when ${ticker} moves 5% in a day`, href: move }
        : null,
  };
}
