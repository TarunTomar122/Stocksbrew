/**
 * The read at the top of /compare: who wins on what, in one line, then the
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

/** "3x" for big ratios, "1.6x" for small ones. */
function times(ratio: number): string {
  return ratio >= 3 || Math.abs(ratio - Math.round(ratio)) < 0.1 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`;
}

/** Join clauses into one sentence, folding a repeated subject: "NVDA is cheaper ... and grows 2x faster". */
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
  return `${sentences.join("; ")}.`;
}

/** One short clause per dimension where the names really differ, strongest first. */
export function winnerClauses(rows: ScreenerRow[]): Array<{ id: string; text: string; symbols: string[]; strength: number }> {
  const out: Array<{ id: string; text: string; symbols: string[]; strength: number }> = [];
  const pair = rows.length === 2;

  const forward = ends(values(rows, "fwd_pe", (value) => value > 0));
  const trailing = ends(values(rows, "pe", (value) => value > 0));
  const multiple = forward ?? trailing;
  if (multiple && multiple.top.value / multiple.bottom.value >= 1.2) {
    const ratio = multiple.top.value / multiple.bottom.value;
    out.push({
      id: "cheap",
      text: pair
        ? `${multiple.bottom.symbol} is cheaper on earnings (${multiple.bottom.value.toFixed(0)}x against ${multiple.top.value.toFixed(0)}x)`
        : `${multiple.bottom.symbol} is the cheapest on earnings (${multiple.bottom.value.toFixed(0)}x)`,
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
          ? `${growth.top.symbol} grows revenue ${times(ratio)} faster${pair ? "" : ` than ${growth.bottom.symbol}`} (${signedPct(growth.top.value)} a year)`
          : growth.bottom.value < 0
            ? `${growth.top.symbol} grows revenue (${signedPct(growth.top.value)}) while ${growth.bottom.symbol}'s shrinks`
            : `${growth.top.symbol} grows fastest (${signedPct(growth.top.value)} a year)`,
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
          ? `${margin.bottom.symbol} loses money at the operating line`
          : `${margin.bottom.symbol} has the weakest margins (${pct(margin.bottom.value, 0)} operating against ${pct(margin.top.value, 0)})`,
      symbols: [margin.bottom.symbol, margin.top.symbol],
      strength: Math.min(3, (margin.top.value - margin.bottom.value) / 12),
    });
  }

  const cash = ends(values(rows, "net_cash"));
  if (cash && cash.top.value > 0 && cash.bottom.value < 0) {
    out.push({
      id: "balance",
      text: `${cash.top.symbol} has net cash (${cash.bottom.symbol} has net debt)`,
      symbols: [cash.top.symbol, cash.bottom.symbol],
      strength: 0.5,
    });
  }

  return out.sort((a, b) => b.strength - a.strength);
}

export function buildCompareRead(input: { rows: Array<ScreenerRow | null>; benchmark?: ScreenerRow | null; asOf?: string | null }): TheRead | null {
  const rows = input.rows.filter((row): row is ScreenerRow => row !== null);
  if (rows.length < 2) return null;

  const clauses = winnerClauses(rows).slice(0, 3);
  let headline = "";
  if (clauses.length) {
    headline = joinClauses(clauses);
  }

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
      text: `${fromHigh.bottom.symbol} trades ${pct(fromHigh.bottom.value)} below its 52-week high; ${fromHigh.top.symbol} is ${Math.abs(fromHigh.top.value) < 1 ? "at its high" : `${pct(fromHigh.top.value)} off its high`}.`,
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
    const zoneText = [inAdd.length ? `${joinNames(inAdd)} ${inAdd.length === 1 ? "is" : "are"} inside the add zone` : "", inTrim.length ? `${joinNames(inTrim)} ${inTrim.length === 1 ? "is" : "are"} in the trim zone` : ""]
      .filter(Boolean)
      .join("; ");
    calls = {
      id: "calls",
      tone: "flat",
      text:
        distinct.size === 1
          ? `Our call is ${called[0]!.call} on ${called.length === 2 ? "both" : `all ${called.length}`}.`
          : `Our calls differ: ${joinNames(called.map((row) => `${row.symbol} ${row.call}`))}.`,
      soWhat: zoneText ? `${zoneText.charAt(0).toUpperCase()}${zoneText.slice(1)}.` : undefined,
      tickers: called.map((row) => row.symbol),
    };
  }

  const insights = pickInsights([calls, year, highs, earnings], 4);
  if (!headline) {
    const lead = insights.shift();
    if (!lead) return null;
    headline = lead.text;
  }
  return { headline, insights: insights.slice(0, 3), asOf: input.asOf ?? null };
}
