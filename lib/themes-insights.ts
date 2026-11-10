/**
 * The read for the idea baskets: which ideas are moving against the S&P 500,
 * and which names inside each basket carry or drag it. Pure. Basket returns
 * are hypothetical equal-weight baskets; line returns are each stock's own.
 */

import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import type { Basket, BasketLine, BasketWindow } from "@/lib/screener-themes";

const MINUS = "−";

/** Screener units: 12.3 means +12.3%. */
function signed(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return `${rounded < 0 ? MINUS : rounded > 0 ? "+" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

function pts(value: number): string {
  return `${Math.abs(value).toFixed(1)} pts`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Mover = { ticker: string; ret: number };

/** The lines with a return over the window, best first. */
export function lineMoves(lines: BasketLine[], window: BasketWindow): Mover[] {
  return lines
    .map((line) => ({ ticker: line.ticker, ret: line.row?.[window] }))
    .filter((row): row is Mover => typeof row.ret === "number" && Number.isFinite(row.ret))
    .sort((a, b) => b.ret - a.ret || a.ticker.localeCompare(b.ticker));
}

function upWords(up: number, total: number): string {
  return `${up} of ${total} names ${up === 1 ? "is" : "are"} up`;
}

function moverWords(movers: Mover[]): string {
  return listWords(movers.map((row) => `${row.ticker} ${signed(row.ret, 0)}`));
}

const WINDOW_WORDS: Record<BasketWindow, string> = {
  ret_1m: "this month",
  ret_3m: "over three months",
  ret_ytd: "this year",
  ret_1y: "over a year",
};

function basketInsight(basket: Basket, window: BasketWindow, id: string, kind: "lead" | "lag"): Insight | null {
  const perf = basket.perf[window];
  const bench = basket.benchmark[window];
  if (!perf || bench == null) return null;
  const moves = lineMoves(basket.lines, window);
  if (moves.length === 0) return null;
  const gap = perf.pct - bench;
  const carriers = kind === "lead" ? moves.slice(0, 2).filter((row) => row.ret > 0) : moves.slice(-2).reverse().filter((row) => row.ret <= -1);
  const up = moves.filter((row) => row.ret > 0).length;
  return {
    id,
    tone: toneOfChange(gap, 0.5),
    text: `${basket.name} is ${signed(perf.pct)} ${WINDOW_WORDS[window]}, ${pts(gap)} ${gap >= 0 ? "ahead of" : "behind"} the S&P 500${
      carriers.length > 0 ? `, ${kind === "lead" ? "carried by" : "dragged by"} ${moverWords(carriers)}` : ""
    }.`,
    soWhat: `${upWords(up, moves.length)}.`,
    tickers: carriers.map((row) => row.ticker),
    action: { label: "Open the basket", href: `/themes/${basket.slug}` },
  };
}

export function buildThemesRead(baskets: Basket[], window: BasketWindow = "ret_1m"): TheRead {
  const ranked = baskets
    .filter((basket) => basket.perf[window] && basket.benchmark[window] != null)
    .sort((a, b) => (b.perf[window]?.pct ?? 0) - (a.perf[window]?.pct ?? 0));
  if (ranked.length < 2) return { headline: "", insights: [] };
  const lead = ranked[0];
  const last = ranked[ranked.length - 1];
  const bench = lead.benchmark[window] ?? 0;
  const beat = ranked.filter((basket) => (basket.perf[window]?.pct ?? 0) > bench).length;

  // This year's leader, when it is a different idea from this month's.
  const ytdRanked = baskets.filter((basket) => basket.perf.ret_ytd).sort((a, b) => (b.perf.ret_ytd?.pct ?? 0) - (a.perf.ret_ytd?.pct ?? 0));
  const yearLead = ytdRanked[0] && ytdRanked[0].slug !== lead.slug && ytdRanked[0].slug !== last.slug ? basketInsight(ytdRanked[0], "ret_ytd", "year", "lead") : null;
  const breadth: Insight = {
    id: "breadth",
    tone: beat * 2 >= ranked.length ? "up" : "down",
    text: `${beat} of ${ranked.length} ideas beat the S&P 500 ${WINDOW_WORDS[window]} (${signed(bench)}).`,
  };

  const headline = `${lead.name} leads ${WINDOW_WORDS[window]} at ${signed(lead.perf[window]?.pct ?? 0)}; ${last.name} lags at ${signed(last.perf[window]?.pct ?? 0)}.`;
  return {
    headline,
    insights: pickInsights([basketInsight(lead, window, "lead", "lead"), basketInsight(last, window, "lag", "lag"), yearLead ?? breadth]),
    source: "Hypothetical equal-weight baskets, against SPY",
  };
}

export function buildThemeRead(basket: Basket, options: { callsVisible?: boolean } = {}): TheRead {
  const month = basket.perf.ret_1m;
  const year = basket.perf.ret_ytd;
  const monthBench = basket.benchmark.ret_1m;
  const yearBench = basket.benchmark.ret_ytd;
  const insights: Array<Insight | null> = [];

  const monthMoves = lineMoves(basket.lines, "ret_1m");
  if (month && monthBench != null && monthMoves.length > 0) {
    const gap = month.pct - monthBench;
    const best = monthMoves.slice(0, 2).filter((row) => row.ret > 0);
    const worst = monthMoves.slice(-2).reverse().filter((row) => row.ret <= -1);
    insights.push({
      id: "month",
      tone: toneOfChange(gap, 0.5),
      text:
        month.pct < 0 && worst.length > 0
          ? `${moverWords(worst)} pulled it down this month${best.length > 0 ? `; ${moverWords(best)} held up` : ""}.`
          : best.length > 0
            ? `${moverWords(best)} carried it this month${worst.length > 0 ? `; ${moverWords(worst)} held it back` : ""}.`
            : `Every name is down this month; ${moverWords(worst)} fell the most.`,
      soWhat: `${upWords(monthMoves.filter((row) => row.ret > 0).length, monthMoves.length)}; the basket is ${pts(gap)} ${gap >= 0 ? "ahead of" : "behind"} the S&P 500.`,
      tickers: [...best, ...worst].map((row) => row.ticker),
    });
  }

  const yearMoves = lineMoves(basket.lines, "ret_ytd");
  if (year && yearBench != null && yearMoves.length > 0) {
    const gap = year.pct - yearBench;
    // How lopsided: the share of the gain that the best name alone accounts for, in an equal-weight basket.
    const total = yearMoves.reduce((sum, row) => sum + row.ret, 0);
    const top = yearMoves[0];
    const share = total > 0 && top.ret > 0 && top.ret <= total ? Math.round((top.ret / total) * 100) : null;
    insights.push({
      id: "year",
      tone: toneOfChange(gap, 0.5),
      text: `This year it is ${signed(year.pct)}, ${pts(gap)} ${gap >= 0 ? "ahead of" : "behind"} the S&P 500${
        share !== null && share >= 35 && yearMoves.length >= 4 ? `, and ${top.ticker} (${signed(top.ret, 0)}) is ${share}% of that gain on its own` : ""
      }.`,
      soWhat: `${yearMoves.filter((row) => row.ret > yearBench).length} of ${yearMoves.length} names beat the S&P this year.`,
      tickers: [top.ticker],
    });
  }

  if (options.callsVisible !== false) {
    const adds = basket.lines.filter((line) => line.row?.call === "Add").map((line) => line.ticker);
    const trims = basket.lines.filter((line) => line.row?.call === "Trim").map((line) => line.ticker);
    if (adds.length + trims.length > 0) {
      insights.push({
        id: "calls",
        tone: adds.length >= trims.length ? "up" : "down",
        text: `Our call says add on ${adds.length} of the ${basket.lines.length} names${adds.length > 0 ? ` (${adds.length > 3 ? `${adds.slice(0, 3).join(", ")} and more` : listWords(adds)})` : ""}${
          trims.length > 0 ? ` and trim ${listWords(trims.slice(0, 3))}` : ", and trim on none"
        }.`,
        tickers: [...adds.slice(0, 3), ...trims.slice(0, 2)],
        action: { label: "The book", href: "#book" },
      });
    }
  }

  const first = insights.find(Boolean);
  const headline =
    month && monthBench != null
      ? `${basket.name} is ${month.pct - monthBench >= 0 ? "beating" : "trailing"} the S&P 500 this month: ${signed(month.pct)} against ${signed(monthBench)}.`
      : first?.text ?? "";
  return { headline, insights: pickInsights(insights), source: "Hypothetical equal-weight basket" };
}
