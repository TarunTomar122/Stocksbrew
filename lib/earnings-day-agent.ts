import type { AgentEvaluation, AgentFacts, AgentFinding } from "@/lib/agent-jobs";

/**
 * The "Earnings came out" agent: the follow-up to "Earnings are coming". On
 * each run it tells you which of your names published an earnings report
 * (tm_earnings_day) since the last check, with the report's own headline and
 * a link to it. Pure, like the rest of the evaluator: facts in, decision out,
 * nothing dated after the day being evaluated.
 */

export type EarningsReportFact = {
  ticker: string;
  /** The calendar date of the report, YYYY-MM-DD. */
  date: string;
  /** The New York day the release was filed (or the calendar date before it is). */
  filed_day: string;
  title: string;
  headline: string;
  href: string;
  url: string | null;
  tone: "up" | "down" | "flat";
};

function short(day: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return match ? `${months[Number(match[2]) - 1]} ${Number(match[3])}` : day;
}

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= 4) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, 3).join(", ")} and ${list.length - 3} more`;
}

export function evaluateEarningsReported(
  facts: AgentFacts,
  options: { day: string; since: string | null; tickers: string[] },
  maxFindings = 8,
): AgentEvaluation {
  const { day, since, tickers } = options;
  if (tickers.length === 0) {
    return { decision: "could_not_check", summary: "Could not check: there are no names to look at yet. Add a stock to your watchlist.", findings: [], checked: ["Names in scope: 0"] };
  }
  if (!facts.available.earnings_reports) {
    return { decision: "could_not_check", summary: "Could not check: earnings reports were not available.", findings: [], checked: ["Earnings reports: unavailable"] };
  }
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  // New since the last check; on a first run, today's only.
  const inWindow = (date: string) => date <= day && (since == null ? date === day : date > since);
  const reports = (facts.earnings_reports ?? [])
    .filter((report) => wanted.has(report.ticker.toUpperCase()) && inWindow(report.filed_day))
    .sort((a, b) => b.filed_day.localeCompare(a.filed_day) || a.ticker.localeCompare(b.ticker));
  const span = since == null ? short(day) : `${short(since)} to ${short(day)}`;
  const checked = [`Earnings reports for your names, ${span}: ${reports.length}`, `Names in scope: ${tickers.length}`];
  if (reports.length === 0) {
    return { decision: "nothing", summary: "Checked, nothing to do. None of your names published an earnings report since the last check.", findings: [], checked };
  }
  const findings: AgentFinding[] = reports.slice(0, maxFindings).map((report) => ({
    ticker: report.ticker,
    headline: report.headline,
    detail: report.title,
    source: "Earnings release on SEC EDGAR",
    url: report.href,
    at: report.filed_day,
    kind: "earnings",
  }));
  const summary = reports.length === 1 ? reports[0].headline : `${names(reports.map((report) => report.ticker))} reported earnings.`;
  return { decision: "notify", summary, findings, checked };
}
