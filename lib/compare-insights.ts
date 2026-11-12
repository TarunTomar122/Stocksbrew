/**
 * The read at the top of /compare: the biggest difference as one quantified line, then the
 * few differences that matter most (the year against the S&P 500, how far
 * each sits from its high, a report coming up, where the call stands).
 *
 * Pure, over screener snapshot rows the page already loaded. Rows arrive with
 * zones already stripped for stocks the viewer does not cover, so a zone is
 * only ever mentioned for a covered stock.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { fin, inDays, joinNames, pct, shortDay, signedPct } from "@/lib/insight-format";
import type { ScreenerRow } from "@/lib/screener-shared";

type Pick = { symbol: string; value: number };

function values(rows: ScreenerRow[], key: keyof ScreenerRow, filter: (value: number) => boolean = () => true): Pick[] {
  return rows
    .map((row) => ({ symbol: row.symbol, value: row[key] }))
    .filter((item): item is Pick => fin(item.value) && filter(item.value as number));
}

function ends(items: Pick[]): { top: Pick; bottom: Pick } | null {
  if (items.length < 2) return null;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  return { top: sorted[0]!, bottom: sorted[sorted.length - 1]! };
}

/**
 * How many times bigger one figure is than another, in words, so a headline carries one number: "more than three
 * times", "about twice", "40% more". Null when the two are too close to say it that way.
 */
export function timesWords(ratio: number): string | null {
  if (!Number.isFinite(ratio) || ratio < 1.15) return null;
  if (ratio < 1.9) return `${Math.round((ratio - 1) * 100)}% more`;
  const words = ["", "", "twice", "three times", "four times", "five times", "six times", "seven times", "eight times", "nine times", "ten times"];
  const whole = Math.floor(ratio + 0.1);
  if (whole > 10) return `${Math.round(ratio)} times`;
  const name = words[whole]!;
  return ratio - whole >= 0.25 ? `more than ${name}` : `about ${name}`;
}

/** "3x" for big ratios, "1.6x" for small ones. */
function times(ratio: number): string {
  return ratio >= 3 || Math.abs(ratio - Math.round(ratio)) < 0.1 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`;
}

/** One sentence per stock, folding a repeated subject: "NVDA grows 2x faster and costs less ...". */
export function joinClauses(clauses: Array<{ text: string; symbols: string[] }>): string {
  const groups: Array<{ subject: string; parts: string[] }> = [];
  for (const clause of clauses) {
    const subject = clause.symbols[0] ?? "";
    const rest = clause.text.startsWith(`${subject} `) ? clause.text.slice(subject.length + 1) : clause.text;
    const group = groups.find((item) => item.subject === subject);
    if (group) group.parts.push(rest);
    else groups.push({ subject, parts: [rest] });
  }
  const sentences = groups.map((group) => `${group.subject} ${group.parts.length > 1 ? `${group.parts.slice(0, -1).join(", ")} and ${group.parts[group.parts.length - 1]}` : group.parts[0]}`);
  return sentences.map((sentence) => `${sentence}.`).join(" ");
}

/** One short clause per dimension where the names really differ, strongest first. */
export type WinnerClause = {
  id: string;
  text: string;
  /** The same difference as a headline with one figure: "NVDA keeps more than three times AMD's operating profit per sales dollar." */
  lead: string;
  /** The two numbers behind a one-figure headline, said once under it ("NVDA keeps 65¢ of each sales dollar ...; AMD keeps 18¢."). */
  sub?: string;
  symbols: string[];
  strength: number;
};

type Lead = { lead: string; sub?: string };

// Each headline carries one figure (owner rule 8): how many times one is the other. The two numbers go under it.
// When the two are too close for that, the headline keeps both, as before.

function cheapLead(multiple: { top: Pick; bottom: Pick }, what: string): Lead {
  const ratio = multiple.top.value / multiple.bottom.value;
  // The cheaper one leads, as the share of the other's price it costs: "about half", "less than a third".
  const whole = Math.floor(ratio + 0.1);
  const part = ["", "", "half", "a third", "a quarter", "a fifth"][Math.min(whole, 5)];
  const words = ratio >= 1.9 && part ? `${ratio - whole >= 0.25 || whole > 5 ? "less than" : "about"} ${part}` : null;
  return words
    ? {
        lead: `${multiple.bottom.symbol} costs ${words} as much as ${multiple.top.symbol} for each $1 of ${what}.`,
        sub: `${multiple.bottom.symbol} costs $${multiple.bottom.value.toFixed(0)} for each $1 of ${what}; ${multiple.top.symbol} costs $${multiple.top.value.toFixed(0)}.`,
      }
    : {
        // Closer than half: how much less it costs, as one share.
        lead: `${multiple.bottom.symbol} costs ${Math.round((1 - 1 / ratio) * 100)}% less than ${multiple.top.symbol} for each $1 of ${what}.`,
        sub: `${multiple.bottom.symbol} costs $${multiple.bottom.value.toFixed(0)} for each $1 of ${what}; ${multiple.top.symbol} costs $${multiple.top.value.toFixed(0)}.`,
      };
}

function growthLead(growth: { top: Pick; bottom: Pick }, ratio: number | null): Lead {
  if (growth.top.value <= 0)
    return { lead: `${growth.top.symbol}'s sales fell the least over the past year, ${pct(growth.top.value)} against ${pct(growth.bottom.value)} for ${growth.bottom.symbol}.` };
  if (growth.bottom.value < 0)
    return {
      lead: `${growth.top.symbol}'s sales grew ${pct(growth.top.value)} over the past year, while ${growth.bottom.symbol}'s shrank.`,
      sub: `${growth.bottom.symbol}'s sales fell ${pct(growth.bottom.value)}.`,
    };
  const words = ratio && ratio >= 1.9 ? timesWords(ratio) : null;
  return words
    ? {
        lead: `${growth.top.symbol}'s sales grew ${words} as fast as ${growth.bottom.symbol}'s over the past year.`,
        sub: `${growth.top.symbol}'s sales grew ${pct(growth.top.value)}; ${growth.bottom.symbol}'s grew ${pct(growth.bottom.value)}.`,
      }
    : {
        // Closer than twice: the gap in points, as one figure.
        lead: `${growth.top.symbol}'s sales grew ${Math.round(growth.top.value - growth.bottom.value)} points faster than ${growth.bottom.symbol}'s over the past year.`,
        sub: `${growth.top.symbol}'s sales grew ${pct(growth.top.value)}; ${growth.bottom.symbol}'s grew ${pct(growth.bottom.value)}.`,
      };
}

function marginLead(margin: { top: Pick; bottom: Pick }): Lead {
  const { top, bottom } = margin;
  if (top.value <= 0) return { lead: `${bottom.symbol} loses more on its day-to-day business than ${top.symbol}.` };
  if (bottom.value < 0)
    return { lead: `${top.symbol} keeps ${top.value.toFixed(0)}¢ of each sales dollar as operating profit, while ${bottom.symbol} loses money on its day-to-day business.` };
  // Under a cent the ratio means nothing ("65 times"), so the two figures stay in the headline.
  const words = bottom.value >= 1 ? timesWords(top.value / bottom.value) : null;
  if (!words)
    return {
      lead: `${top.symbol} keeps ${Math.round(top.value - bottom.value)}¢ more of each sales dollar as operating profit than ${bottom.symbol}.`,
      sub: `${top.symbol} keeps ${top.value.toFixed(0)}¢ of each sales dollar as operating profit; ${bottom.symbol} keeps ${bottom.value.toFixed(0)}¢.`,
    };
  return {
    lead: words.endsWith("more")
      ? `${top.symbol} keeps ${words} operating profit per sales dollar than ${bottom.symbol}.`
      : `${top.symbol} keeps ${words} ${bottom.symbol}'s operating profit per sales dollar.`,
    sub: `${top.symbol} keeps ${top.value.toFixed(0)}¢ of each sales dollar as operating profit; ${bottom.symbol} keeps ${bottom.value.toFixed(0)}¢.`,
  };
}

export function winnerClauses(rows: ScreenerRow[]): WinnerClause[] {
  const out: WinnerClause[] = [];
  const pair = rows.length === 2;

  const forward = ends(values(rows, "fwd_pe", (value) => value > 0));
  const trailing = ends(values(rows, "pe", (value) => value > 0));
  const multiple = forward ?? trailing;
  if (multiple && multiple.top.value / multiple.bottom.value >= 1.2) {
    const ratio = multiple.top.value / multiple.bottom.value;
    out.push({
      id: "cheap",
      // "x times earnings" said as dollars: you pay $15 for each $1 of profit.
      text: pair
        ? `${multiple.bottom.symbol} costs less than ${multiple.top.symbol} for each $1 of ${forward ? "next year's expected " : ""}profit ($${multiple.bottom.value.toFixed(0)} against $${multiple.top.value.toFixed(0)})`
        : `${multiple.bottom.symbol} costs the least for each $1 of ${forward ? "next year's expected " : ""}profit ($${multiple.bottom.value.toFixed(0)})`,
      ...cheapLead(multiple, forward ? "next year's expected profit" : "last year's profit"),
      symbols: [multiple.bottom.symbol, multiple.top.symbol],
      strength: Math.min(3, ratio - 1),
    });
  }

  const growth = ends(values(rows, "rev_growth"));
  if (growth && growth.top.value - growth.bottom.value >= 5) {
    const ratio = growth.bottom.value > 1 ? growth.top.value / growth.bottom.value : null;
    out.push({
      id: "growth",
      text:
        ratio && ratio >= 1.5
          ? `${growth.top.symbol} grows revenue ${times(ratio)} faster than ${growth.bottom.symbol} (${signedPct(growth.top.value)} a year against ${signedPct(growth.bottom.value)})`
          : growth.bottom.value < 0
            ? `${growth.top.symbol} grows revenue (${signedPct(growth.top.value)}) while ${growth.bottom.symbol}'s shrinks`
            : `${growth.top.symbol} grows fastest (${signedPct(growth.top.value)} a year)`,
      ...growthLead(growth, ratio),
      symbols: [growth.top.symbol, growth.bottom.symbol],
      strength: Math.min(3, (growth.top.value - growth.bottom.value) / 15),
    });
  }

  const margin = ends(values(rows, "op_margin"));
  if (margin && margin.top.value - margin.bottom.value >= 5) {
    out.push({
      id: "margin",
      text:
        margin.bottom.value < 0
          ? `${margin.bottom.symbol} loses money on its day-to-day business`
          : `${margin.bottom.symbol} keeps less of each sales dollar as profit than ${margin.top.symbol} (${pct(margin.bottom.value, 0)} against ${pct(margin.top.value, 0)})`,
      // Cents of each sales dollar, as "Where they differ" says it.
      ...marginLead(margin),
      symbols: [margin.bottom.symbol, margin.top.symbol],
      strength: Math.min(3, (margin.top.value - margin.bottom.value) / 12),
    });
  }

  const cash = ends(values(rows, "net_cash"));
  if (cash && cash.top.value > 0 && cash.bottom.value < 0) {
    out.push({
      id: "balance",
      text: `${cash.top.symbol} has net cash (${cash.bottom.symbol} has net debt)`,
      lead: `${cash.top.symbol} has more cash than debt, while ${cash.bottom.symbol} owes more than it holds.`,
      symbols: [cash.top.symbol, cash.bottom.symbol],
      strength: 0.5,
    });
  }

  return out.sort((a, b) => b.strength - a.strength);
}

// Our call on one stock, as what we would do with it.
const CALL_VERB: Record<NonNullable<ScreenerRow["call"]>, (symbol: string) => string> = {
  Add: (symbol) => `buy more ${symbol}`,
  Hold: (symbol) => `keep ${symbol} without adding`,
  Trim: (symbol) => `sell some ${symbol}`,
};
const SAME_CALL: Record<NonNullable<ScreenerRow["call"]>, string> = {
  Add: "buy more of",
  Hold: "keep, without adding to,",
  Trim: "sell some of",
};

export function buildCompareRead(input: {
  rows: Array<ScreenerRow | null>;
  benchmark?: ScreenerRow | null;
  asOf?: string | null;
  /**
   * The compare desk's mix: the headline is the strongest difference, so the cards show the year against the S&P
   * 500 and our call on each, then the price against each stock's own past (it moves up when `calls` is false), then
   * the other differences when there is room. Off, the other differences lead.
   */
  spread?: boolean;
  /** false when the page shows the calls on their own (the pair page's call cards). */
  calls?: boolean;
}): TheRead | null {
  const rows = input.rows.filter((row): row is ScreenerRow => row !== null);
  if (rows.length < 2) return null;

  const clauses = winnerClauses(rows).slice(0, 3);
  // The headline is the strongest difference as one figure ("NVDA keeps more than three times AMD's operating profit
  // per sales dollar."), with the two numbers under it (owner rule 8). The other differences follow as their own
  // lines; the first is the headline, so it is not said again under it.
  let headline = clauses[0]?.lead ?? "";
  // The two numbers behind a one-figure headline, once, right under it.
  const sub = clauses[0]?.sub;
  const clauseInsights: Insight[] = clauses.slice(1).map((clause) => ({
    id: `diff-${clause.id}`,
    tone: "flat",
    text: `${clause.text.charAt(0).toUpperCase()}${clause.text.slice(1)}.`,
    // Only the stocks the sentence names, so no stray chip sits under it.
    tickers: clause.symbols.filter((symbol) => clause.text.includes(symbol)),
  }));

  // The year, against the S&P 500.
  let year: Insight | null = null;
  const yearRange = ends(values(rows, "ret_1y"));
  if (yearRange) {
    const spy = input.benchmark && fin(input.benchmark.ret_1y) ? input.benchmark.ret_1y : null;
    const ranked = [...values(rows, "ret_1y")].sort((a, b) => b.value - a.value);
    const beat = spy !== null ? ranked.filter((item) => item.value > spy).map((item) => item.symbol) : [];
    year = {
      id: "year",
      // Against the index when we have it, so a green mark never sits beside "None of them kept up".
      tone:
        spy !== null
          ? beat.length === ranked.length
            ? "up"
            : beat.length === 0
              ? "down"
              : "flat"
          : yearRange.top.value >= 0
            ? "up"
            : "down",
      text: `Over the past year ${joinNames(ranked.map((item) => `${item.symbol} ${signedPct(item.value)}`))}${spy !== null ? `, against ${signedPct(spy)} for the S&P 500` : ""}.`,
      soWhat:
        spy !== null
          ? beat.length === ranked.length
            ? "All of them beat the index."
            : beat.length === 0
              ? "None of them kept up with the index."
              : `Only ${joinNames(beat)} beat the index.`
          : undefined,
      tickers: ranked.map((item) => item.symbol),
    };
  }

  // Distance from the 52-week high: who has already run, who is beaten down.
  let highs: Insight | null = null;
  const fromHigh = ends(values(rows, "from_hi_pct"));
  if (fromHigh && fromHigh.top.value - fromHigh.bottom.value >= 8) {
    highs = {
      id: "highs",
      tone: "flat",
      text: `${fromHigh.bottom.symbol} is ${pct(fromHigh.bottom.value)} below its highest price of the past year; ${fromHigh.top.symbol} is ${Math.abs(fromHigh.top.value) < 1 ? "at its high" : `${pct(fromHigh.top.value)} below its own`}.`,
      tickers: [fromHigh.bottom.symbol, fromHigh.top.symbol],
      action: { label: `See ${fromHigh.bottom.symbol}`, href: `/stock/${fromHigh.bottom.symbol}` },
    };
  }

  // A report coming up in one of them.
  let earnings: Insight | null = null;
  const soon = rows
    .filter((row) => fin(row.earnings_in_days) && row.earnings_in_days >= 0 && row.earnings_in_days <= 21 && row.earnings_date)
    .sort((a, b) => a.earnings_in_days! - b.earnings_in_days!);
  if (soon.length) {
    earnings = {
      id: "earnings",
      tone: "flat",
      text: `${joinNames(soon.map((row) => `${row.symbol} reports ${shortDay(row.earnings_date)} (${inDays(row.earnings_in_days!)})`))}.`,
      tickers: soon.map((row) => row.symbol),
      action: { label: `${soon[0]!.symbol} earnings`, href: `/stock/${soon[0]!.symbol}#earnings` },
    };
  }

  // Our call on each, and any that sit in a zone (covered stocks only: the zones are stripped otherwise).
  let calls: Insight | null = null;
  const called = rows.filter((row) => row.call);
  if (called.length >= 2) {
    const distinct = new Set(called.map((row) => row.call));
    const inAdd = rows.filter((row) => row.zone === "add").map((row) => row.symbol);
    const inTrim = rows.filter((row) => row.zone === "trim").map((row) => row.symbol);
    const zoneText = [
      inAdd.length ? `${joinNames(inAdd)} ${inAdd.length === 1 ? "is" : "are"} at a price where we'd buy more` : "",
      inTrim.length ? `${joinNames(inTrim)} ${inTrim.length === 1 ? "is" : "are"} at a price where we'd sell some` : "",
    ]
      .filter(Boolean)
      .join("; ");
    calls = {
      id: "calls",
      tone: "flat",
      text:
        distinct.size === 1
          ? `We'd ${SAME_CALL[called[0]!.call!]} ${called.length === 2 ? "both" : `all ${called.length}`}.`
          : `We'd ${joinNames(called.map((row) => CALL_VERB[row.call!](row.symbol)))}.`,
      soWhat: zoneText ? `${zoneText.charAt(0).toUpperCase()}${zoneText.slice(1)}.` : undefined,
      tickers: called.map((row) => row.symbol),
    };
  }

  // Price for profit against each stock's own past (0 is the cheapest it has been, 100 the dearest).
  let history: Insight | null = null;
  const past = ends(values(rows, "pe_hist_pctile"));
  if (past && past.top.value - past.bottom.value >= 15) {
    const low = Math.round(past.bottom.value);
    const high = Math.round(past.top.value);
    history = {
      id: "history",
      tone: "flat",
      text: `${past.bottom.symbol} is cheaper against its own earnings history than ${past.top.symbol}: ${low} out of 100, where 0 is the cheapest it has been, against ${high}.`,
      figure: { value: `${low} of 100` },
      tickers: [past.bottom.symbol, past.top.symbol],
    };
  }

  const showCalls = input.calls === false ? null : calls;
  // The desk's mix: the year against the S&P 500, then the call, then the other differences. Otherwise the other
  // differences lead and the call and the year follow when there is room.
  const insights = input.spread
    ? pickInsights([year, showCalls, history, ...clauseInsights, highs, earnings], 4)
    : pickInsights([...clauseInsights, showCalls, year, highs, earnings], 4);
  if (!headline) {
    const lead = insights.shift();
    if (!lead) return null;
    headline = lead.text;
    // The lead's second clause is the first line under it, so the headline stays one sentence.
    if (lead.soWhat) insights.unshift({ id: `${lead.id}-more`, tone: lead.tone, text: lead.soWhat, action: lead.action });
  }
  // The lead's second clause rides on top of the usual three points instead of pushing one out.
  return { headline, ...(sub ? { sub } : {}), insights: insights.slice(0, insights[0]?.id.endsWith("-more") ? 4 : 3), asOf: input.asOf ?? null };
}
