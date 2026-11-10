/**
 * The read for the practice account: how the paper account is doing against
 * SPY and what drove it. Pure, so the desk can rebuild it after each order.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import type { PracticeView } from "@/lib/practice";

const MINUS = "−";

function signedPct(value: number, digits = 1): string {
  const rounded = Number((value * 100).toFixed(digits));
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

function signedMoney(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}$${Math.abs(rounded).toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : iso;
}

export function buildPracticeRead(view: PracticeView, options: { example?: boolean } = {}): TheRead {
  const bench = view.benchmark;
  const who = options.example ? "This example account" : "Your account";
  const priced = view.rows.filter((row) => row.pnl !== null);
  if (view.rows.length === 0 && view.trades.length === 0) {
    return {
      headline:
        bench.return !== null && Math.abs(bench.return) >= 0.0005
          ? `Nothing invested yet; ${bench.symbol} is ${signedPct(bench.return)} since the account opened.`
          : `No trades yet: $${Math.round(view.start_cash).toLocaleString("en-US")} of paper money is waiting for a first idea.`,
      insights: [],
    };
  }

  const insights: Array<Insight | null> = [];
  let headline = "";
  if (bench.return !== null) {
    const gap = view.total_return - bench.return;
    headline = `${who} is ${signedPct(view.total_return)} since ${shortDay(bench.start_date)}, ${Math.abs(gap * 100).toFixed(1)} pts ${gap >= 0 ? "ahead of" : "behind"} ${bench.symbol}.`;
  }

  // What drove it: the position that made the most and the one that cost the most, in dollars.
  const byPnl = [...priced].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
  const best = byPnl[0];
  const worst = byPnl[byPnl.length - 1];
  if (best && (best.pnl ?? 0) > 0) {
    insights.push({
      id: "driver",
      tone: "up",
      text: `${best.symbol} made the most: ${signedMoney(best.pnl ?? 0)} (${signedPct(best.pnl_pct ?? 0)})${
        Math.abs(view.total_pnl) > 1 && view.total_pnl > 0 && (best.pnl ?? 0) <= view.total_pnl ? `, ${Math.round(((best.pnl ?? 0) / view.total_pnl) * 100)}% of the account's gain` : ""
      }.`,
      soWhat: worst && worst !== best && (worst.pnl ?? 0) < 0 ? `${worst.symbol} cost the most: ${signedMoney(worst.pnl ?? 0)} (${signedPct(worst.pnl_pct ?? 0)}).` : undefined,
      tickers: [best.symbol, ...(worst && worst !== best && (worst.pnl ?? 0) < 0 ? [worst.symbol] : [])],
    });
  } else if (worst && (worst.pnl ?? 0) < 0) {
    insights.push({
      id: "driver",
      tone: "down",
      text: `${worst.symbol} cost the most: ${signedMoney(worst.pnl ?? 0)} (${signedPct(worst.pnl_pct ?? 0)}).`,
      tickers: [worst.symbol],
    });
  }

  // Cash earns nothing here, so a big cash pile is a drag whenever the market rose.
  const cashShare = view.equity > 0 ? view.cash / view.equity : 0;
  if (cashShare >= 0.15 && bench.return !== null && bench.return > 0.005) {
    insights.push({
      id: "cash",
      tone: "down",
      text: `${Math.round(cashShare * 100)}% of the account is cash, which earns nothing here while ${bench.symbol} rose ${signedPct(bench.return)}.`,
      soWhat: "Idle cash is the easiest gap to close.",
    });
  }

  if (cashShare >= 0.15 && bench.return !== null && bench.return < -0.005) {
    insights.push({
      id: "cash",
      tone: "up",
      text: `${Math.round(cashShare * 100)}% of the account is cash, which cushioned the fall: ${bench.symbol} is ${signedPct(bench.return)} since ${shortDay(bench.start_date)}.`,
    });
  }

  // Concentration: one position carrying a large share of the account.
  const top = [...priced].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  if (top && (top.weight ?? 0) >= 0.3) {
    insights.push({
      id: "concentration",
      tone: "flat",
      text: `${top.symbol} is ${Math.round((top.weight ?? 0) * 100)}% of the account, so it decides most of the result.`,
      tickers: [top.symbol],
    });
  }

  return {
    headline,
    insights: pickInsights(insights),
    source: view.price_as_of ? `Paper money, valued at the close on ${shortDay(view.price_as_of)}` : "Paper money",
  };
}
