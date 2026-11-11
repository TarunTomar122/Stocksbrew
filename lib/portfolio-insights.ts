/**
 * The reads on each Portfolio tab: what the book did today and who did it,
 * what is coming in the names you hold, where the call's zones are, how the
 * book leans against the S&P 500, which watched names are closest to an add,
 * and which alerts are near.
 *
 * Pure. The page loader passes the computed `Portfolio` (lib/portfolio-shared)
 * plus a few baselines it loaded (SPY's live move, sectors and S&P weights
 * from the screener snapshot, live sector medians, recent call changes). Every
 * sentence is a plain rule over those numbers; anything the data cannot back
 * is left out.
 *
 * Gating: `zones` and `callChanges` must only hold covered stocks. The loader
 * strips the rest before it calls this, so no level of an uncovered stock can
 * end up in a sentence.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import { dayGap, dayWord, fin, joinNames, money, movedWord, pct, plural, shortDay, signedPct } from "@/lib/insight-format";
import { FUNDS_SECTOR, type Portfolio, type PortfolioPosition } from "@/lib/portfolio-shared";

/** Names, then "and N more" for the ones left out, so a count and its list agree. */
function joinSome(names: readonly string[], total: number): string {
  return total > names.length ? `${names.join(", ")} and ${total - names.length} more` : joinNames(names);
}

export type CallWord = "Add" | "Hold" | "Trim";

export type PortfolioInsightInput = {
  portfolio: Portfolio;
  /** New York day of the run. */
  today: string;
  /** New York day the quotes are from (SPY's), for "today" vs "on Nov 9". */
  quoteDay: string | null;
  /** SPY's move on the quote day. */
  marketPct: number | null;
  /** Ticker to sector, from the screener snapshot (falls back to the row's own label). */
  sectorOf: Record<string, string>;
  /** S&P 500 sector weights in percent. */
  spSectorWeights: Record<string, number>;
  /** Live median move per sector on the quote day. */
  sectorMoves: Record<string, number>;
  /** Covered stocks only, by instrument id. */
  zones: Record<string, { addBelow: number | null; trimAbove: number | null }>;
  /** Covered stocks only: call switches in the last week. */
  callChanges: Array<{ ticker: string; from: CallWord | null; to: CallWord; date: string }>;
  alerts?: Array<{ ticker: string; instrument_id: string; condition: "above" | "below" | null; target_price: number | null; kind: string }>;
  example?: boolean;
};

export type PortfolioReads = {
  positions: TheRead | null;
  watching: TheRead | null;
  analytics: TheRead | null;
  alerts: TheRead | null;
};

type Weighted = { position: PortfolioPosition; weight: number };

/** Value weights when any holding has a value, otherwise every holding counts the same. */
function weights(portfolio: Portfolio): { rows: Weighted[]; byValue: boolean } {
  const holdings = portfolio.positions;
  const valued = holdings.filter((position) => position.weight !== null && position.weight > 0);
  if (valued.length > 0) return { rows: valued.map((position) => ({ position, weight: position.weight! })), byValue: true };
  return { rows: holdings.map((position) => ({ position, weight: holdings.length ? 100 / holdings.length : 0 })), byValue: false };
}

/** Provider sector names mapped onto the GICS names the S&P weights use. */
const SECTOR_ALIASES: Record<string, string> = {
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Financial Services": "Financials",
  Financial: "Financials",
  Healthcare: "Health Care",
  "Basic Materials": "Materials",
  Communication: "Communication Services",
  "Information Technology": "Technology",
};

/**
 * The row's own sector first, so the read agrees with the allocation chart under it; the
 * screener snapshot's only when the row has none.
 */
function sectorFor(position: PortfolioPosition, sectorOf: Record<string, string>): string | null {
  const raw = position.sector ?? sectorOf[position.ticker] ?? null;
  return raw ? SECTOR_ALIASES[raw] ?? raw : null;
}

/** Index funds hold every sector, so they are not counted as one. */
const FUNDS = FUNDS_SECTOR;

/** "9% of your book" with value weights, "1 of your 11 holdings" without. */
function shareOfBook(names: Weighted[], all: Weighted[], byValue: boolean): string {
  if (byValue) return `${pct(names.reduce((sum, item) => sum + item.weight, 0), 0)} of your portfolio`;
  return `${names.length} of your ${all.length} holdings`;
}

function zoneState(
  position: PortfolioPosition,
  zones: PortfolioInsightInput["zones"],
): { state: "add" | "trim" | "between"; toAdd: number | null; add: number | null; trim: number | null } | null {
  const zone = zones[position.instrument_id];
  const price = position.price;
  if (!zone || !fin(price) || price <= 0) return null;
  const add = fin(zone.addBelow) && zone.addBelow > 0 ? zone.addBelow : null;
  const trim = fin(zone.trimAbove) && zone.trimAbove > 0 ? zone.trimAbove : null;
  if (add === null && trim === null) return null;
  if (add !== null && price <= add) return { state: "add", toAdd: 0, add, trim };
  if (trim !== null && price >= trim) return { state: "trim", toAdd: null, add, trim };
  return { state: "between", toAdd: add !== null ? ((price - add) / add) * 100 : null, add, trim };
}

type Reporting = Weighted & { date: string; time: string | null; inDays: number };

function earningsSoon(rows: Weighted[], today: string, days: number): Reporting[] {
  const out: Reporting[] = [];
  for (const row of rows) {
    const next = row.position.nextEarnings;
    const gap = next ? dayGap(today, next.date) : null;
    if (next && gap !== null && gap >= 0 && gap <= days) out.push({ ...row, date: next.date, time: next.time, inDays: gap });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.weight - a.weight);
}

/* ── Positions ───────────────────────────────────────────────────────────── */

function positionsRead(input: PortfolioInsightInput): TheRead | null {
  const { portfolio } = input;
  const { rows, byValue } = weights(portfolio);
  if (rows.length === 0) return null;
  const when = dayWord(input.quoteDay, input.today);
  const moved = rows.filter((row) => fin(row.position.dayPct));
  const movedWeight = moved.reduce((sum, row) => sum + row.weight, 0);

  // Today: the book's move (value-weighted when there are values) against SPY.
  let headline = "";
  let bookPct: number | null = null;
  if (moved.length > 0 && movedWeight > 0) {
    bookPct = byValue && fin(portfolio.totals.dayPct) ? portfolio.totals.dayPct : moved.reduce((sum, row) => sum + row.weight * row.position.dayPct!, 0) / movedWeight;
    const subject = input.example ? "These holdings" : byValue ? "Your holdings" : `Your ${plural(moved.length, "holding")}`;
    const verb = Math.abs(bookPct) < 0.05 ? "were flat" : `${bookPct > 0 ? "rose" : "fell"} ${pct(bookPct, 1)}${byValue ? "" : " on average"}`;
    const market = fin(input.marketPct) ? `, against ${signedPct(input.marketPct, 1)} for the S&P 500` : "";
    headline = `${subject} ${verb} ${when}${market}.`;
  }

  // Who did it: the two biggest contributions in the direction of the move.
  let contributors: Insight | null = null;
  if (bookPct !== null && Math.abs(bookPct) >= 0.15 && moved.length >= 2) {
    const contrib = moved.map((row) => ({ ...row, c: (row.weight / movedWeight) * row.position.dayPct! }));
    const sign = Math.sign(bookPct);
    const leaders = contrib.filter((row) => Math.sign(row.c) === sign).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 2);
    const drag = contrib.filter((row) => Math.sign(row.c) === -sign).sort((a, b) => Math.abs(b.c) - Math.abs(a.c))[0];
    if (leaders.length > 0) {
      const share = (leaders.reduce((sum, row) => sum + row.c, 0) / bookPct) * 100;
      const names = leaders.map((row) => `${row.position.ticker} (${signedPct(row.position.dayPct!)})`);
      const text =
        share >= 35 && share <= 100
          ? `${joinNames(names)} did ${pct(share, 0)} of that move.`
          : `${joinNames(names)} led the move${share > 100 ? `; the rest of your stocks ${sign > 0 ? "rose less or fell" : "made up some of the drop"}` : ""}.`;
      contributors = {
        id: "contributors",
        tone: sign > 0 ? "up" : "down",
        text,
        soWhat: drag ? `${drag.position.ticker} went the other way: it ${drag.position.dayPct! > 0 ? "rose" : "fell"} ${pct(Math.abs(drag.position.dayPct!), 1)}.` : undefined,
        tickers: [...leaders.map((row) => row.position.ticker), ...(drag ? [drag.position.ticker] : [])],
        action: { label: `Why ${leaders[0]!.position.ticker} moved`, href: `/stock/${leaders[0]!.position.ticker}` },
      };
    }
  }

  // The biggest risk this week: reports in names you hold, and how much of the book they are.
  let earnings: Insight | null = null;
  const reporting = earningsSoon(rows, input.today, 7);
  if (reporting.length > 0) {
    const first = reporting[0]!;
    const list = reporting.slice(0, 4).map((row) => `${row.position.ticker} ${shortDay(row.date)}`);
    earnings = {
      id: "earnings",
      tone: "flat",
      text:
        reporting.length === 1
          ? `${first.position.ticker} reports ${shortDay(first.date)}${first.time === "amc" ? " after the close" : first.time === "bmo" ? " before the open" : ""}, the only holding reporting this week; it is ${shareOfBook([first], rows, byValue)}.`
          : `${plural(reporting.length, "holding")} report this week: ${joinSome(list, reporting.length)}${byValue ? `, ${shareOfBook(reporting, rows, byValue)} between them` : ""}.`,
      tickers: reporting.slice(0, 6).map((row) => row.position.ticker),
      action: { label: `${first.position.ticker} earnings`, href: `/stock/${first.position.ticker}#earnings` },
    };
  }

  // Zones: holdings inside their add or trim zone, else the one closest to an add.
  const zoneInsight = zoneLine(portfolio.positions, input.zones, "holding");

  // What changed in our calls on the names you hold.
  let calls: Insight | null = null;
  const held = new Set(portfolio.positions.map((position) => position.ticker));
  const changes = input.callChanges.filter((change) => held.has(change.ticker) && change.from);
  if (changes.length > 0) {
    const parts = changes.slice(0, 3).map((change) => `${change.ticker} to ${change.to} (was ${change.from})`);
    calls = {
      id: "calls",
      tone: changes.every((change) => change.to === "Add") ? "up" : changes.every((change) => change.to === "Trim") ? "down" : "flat",
      text: `We changed our call on ${plural(changes.length, "holding")} this week: ${joinSome(parts, changes.length)}.`,
      tickers: changes.slice(0, 6).map((change) => change.ticker),
      action: { label: "Read why", href: `/stock/${changes[0]!.ticker}#read` },
    };
  }

  const concentration = sectorLine(input, rows, byValue);
  const gains = gainsLine(portfolio, rows, byValue);

  const insights = pickInsights([contributors, earnings, zoneInsight, calls, concentration, gains], 3);
  if (!headline) {
    const lead = insights.shift();
    if (!lead) return null;
    headline = lead.text;
  }
  return { headline, insights, source: byValue ? undefined : "Weighted equally until shares are entered", asOf: null };
}

/** Holdings or watched names inside a zone, else the closest one to its add level. */
function zoneLine(list: PortfolioPosition[], zones: PortfolioInsightInput["zones"], noun: "holding" | "watched name"): Insight | null {
  const states = list
    .map((position) => ({ position, zone: zoneState(position, zones) }))
    .filter((item): item is { position: PortfolioPosition; zone: NonNullable<ReturnType<typeof zoneState>> } => item.zone !== null);
  if (states.length === 0) return null;
  const inAdd = states.filter((item) => item.zone.state === "add");
  const inTrim = states.filter((item) => item.zone.state === "trim");
  const nouns = noun === "holding" ? "holdings" : "watched names";
  if (inAdd.length > 0 || inTrim.length > 0) {
    const parts: string[] = [];
    const named: string[] = [];
    // Up to four names per zone; the rest are counted, so the number and the names always agree.
    const list = (items: typeof states) => {
      const names = items.slice(0, 4).map((item) => item.position.ticker);
      named.push(...names);
      return joinSome(names, items.length);
    };
    if (inAdd.length) parts.push(`${inAdd.length === 1 ? `1 ${noun} is` : `${inAdd.length} ${nouns} are`} inside the add zone: ${list(inAdd)}`);
    if (inTrim.length) parts.push(`${inTrim.length === 1 ? `1 is` : `${inTrim.length} are`} in the trim zone: ${list(inTrim)}`);
    const first = (inAdd[0] ?? inTrim[0])!;
    return {
      id: "zones",
      tone: inAdd.length >= inTrim.length ? "up" : "down",
      text: `${parts.join("; ")}.`,
      tickers: named,
      action: { label: `See ${first.position.ticker}`, href: `/stock/${first.position.ticker}` },
    };
  }
  const closest = states
    .filter((item) => item.zone.toAdd !== null)
    .sort((a, b) => a.zone.toAdd! - b.zone.toAdd!);
  const top = closest[0];
  if (!top || top.zone.toAdd! > 10) return null;
  // Within half a percent reads as "at" the level, not "0.0% above" it.
  const atLevel = closest.filter((item) => item.zone.toAdd! < 0.5);
  if (atLevel.length > 0) {
    const names = atLevel.slice(0, 5).map((item) => item.position.ticker);
    return {
      id: "zones",
      tone: "up",
      text:
        atLevel.length === 1
          ? `${names[0]} sits right at its add level (${money(atLevel[0]!.zone.add!)}).`
          : `${joinNames(names)}${atLevel.length > names.length ? ` and ${atLevel.length - names.length} more` : ""} sit right at their add levels.`,
      tickers: names,
      action: { label: `See ${names[0]}`, href: `/stock/${names[0]}` },
    };
  }
  const next = closest.slice(1, 3).filter((item) => item.zone.toAdd! <= 10);
  return {
    id: "zones",
    tone: "flat",
    text: `${top.position.ticker} is ${pct(top.zone.toAdd!)} above its add level (${money(top.zone.add!)}), the closest of your ${nouns}.`,
    soWhat: next.length ? `Next: ${joinNames(next.map((item) => `${item.position.ticker} ${pct(item.zone.toAdd!)} away`))}.` : undefined,
    tickers: [top.position.ticker, ...next.map((item) => item.position.ticker)],
    action: { label: `Set an alert on ${top.position.ticker}`, href: `/stock/${top.position.ticker}` },
  };
}

/** The biggest sector against its S&P 500 weight. */
function sectorLine(input: PortfolioInsightInput, rows: Weighted[], byValue: boolean): Insight | null {
  if (rows.length < 2) return null;
  const bySector = new Map<string, Weighted[]>();
  for (const row of rows) {
    const sector = sectorFor(row.position, input.sectorOf);
    if (!sector || sector === FUNDS) continue;
    bySector.set(sector, [...(bySector.get(sector) ?? []), row]);
  }
  const ranked = [...bySector.entries()]
    .map(([sector, members]) => ({ sector, members, weight: members.reduce((sum, row) => sum + row.weight, 0) }))
    .sort((a, b) => b.weight - a.weight);
  const top = ranked[0];
  if (!top || top.weight < 30) return null;
  const sp = input.spSectorWeights[top.sector];
  const names = [...top.members].sort((a, b) => b.weight - a.weight).map((row) => row.position.ticker);
  // With index funds in the book, the share is of stocks bought directly; the funds hold more of the sector.
  const direct = rows.some((row) => sectorFor(row.position, input.sectorOf) === FUNDS) ? " stocks bought directly" : "";
  const lead = byValue
    ? `${pct(top.weight, 0)} of your money is in ${top.sector}${direct}`
    : `${top.members.length} of your ${rows.length} holdings are ${top.sector}${direct} (${pct(top.weight, 0)})`;
  return {
    id: "sector",
    tone: "flat",
    text: `${lead}${fin(sp) ? `, against ${pct(sp, 0)} of the S&P 500` : ""}.`,
    tickers: names.slice(0, 6),
    action: { label: "Analytics", href: "/watchlist?tab=analytics" },
  };
}

/** Gain on cost when costs are entered, else the move since each holding was saved, against the S&P 500. */
function gainsLine(portfolio: Portfolio, rows: Weighted[], byValue: boolean): Insight | null {
  const { totals } = portfolio;
  if (fin(totals.gain) && fin(totals.gainPct) && totals.withCost > 0) {
    const best = [...portfolio.positions].filter((position) => fin(position.gainPct)).sort((a, b) => b.gainPct! - a.gainPct!)[0];
    const worst = [...portfolio.positions].filter((position) => fin(position.gainPct)).sort((a, b) => a.gainPct! - b.gainPct!)[0];
    return {
      id: "gains",
      tone: totals.gain >= 0 ? "up" : "down",
      text: `You are ${totals.gain >= 0 ? "up" : "down"} ${pct(totals.gainPct)} on cost (${totals.gain >= 0 ? "+" : "−"}${money(totals.gain)}) across ${plural(totals.withCost, "holding")}.`,
      soWhat:
        best && worst && best !== worst
          ? `${best.ticker} leads at ${signedPct(best.gainPct!)}; ${worst.ticker} trails at ${signedPct(worst.gainPct!)}.`
          : undefined,
      tickers: [best?.ticker, worst?.ticker].filter((ticker): ticker is string => Boolean(ticker)).filter((ticker, index, all) => all.indexOf(ticker) === index),
    };
  }
  const dated = rows.filter((row) => row.position.sinceSaved !== null);
  if (dated.length === 0) return null;
  const totalWeight = dated.reduce((sum, row) => sum + row.weight, 0);
  const book = dated.reduce((sum, row) => sum + row.weight * row.position.sinceSaved!.pct, 0) / totalWeight;
  const benches = dated.map((row) => row.position.sinceSaved!.benchmarkPct).filter(fin);
  const bench = benches.length === dated.length ? dated.reduce((sum, row) => sum + row.weight * row.position.sinceSaved!.benchmarkPct!, 0) / totalWeight : null;
  const from = dated.map((row) => row.position.sinceSaved!.fromDate).sort()[0]!;
  const sameDay = dated.every((row) => row.position.sinceSaved!.fromDate === from);
  const best = [...dated].sort((a, b) => b.position.sinceSaved!.pct - a.position.sinceSaved!.pct)[0]!;
  return {
    id: "since",
    tone: bench !== null ? (book >= bench ? "up" : "down") : book >= 0 ? "up" : "down",
    text: `Since you saved them${sameDay ? ` on ${shortDay(from)}` : ""}, your holdings ${book >= 0 ? "are up" : "are down"} ${pct(book)}${byValue ? "" : " on average"}${bench !== null ? `, against ${signedPct(bench)} for the S&P 500` : ""}.`,
    soWhat: `${best.position.ticker} leads at ${signedPct(best.position.sinceSaved!.pct)}.`,
    tickers: [best.position.ticker],
    action: { label: "Analytics", href: "/watchlist?tab=analytics" },
  };
}

/* ── Watching ────────────────────────────────────────────────────────────── */

function watchingRead(input: PortfolioInsightInput): TheRead | null {
  const watched = input.portfolio.watching;
  if (watched.length === 0) return null;
  const when = dayWord(input.quoteDay, input.today);
  const zoneInsight = zoneLine(watched, input.zones, "watched name");

  // Who moved most against their own sector on the day.
  const gaps = watched
    .map((position) => {
      const sector = sectorFor(position, input.sectorOf);
      const base = sector ? input.sectorMoves[sector] : undefined;
      return fin(position.dayPct) && sector && fin(base) ? { position, sector, base, gap: position.dayPct - base } : null;
    })
    .filter((item): item is { position: PortfolioPosition; sector: string; base: number; gap: number } => item !== null)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  let movers: Insight | null = null;
  const top = gaps[0];
  if (top && Math.abs(top.gap) >= 1.5) {
    const other = gaps.slice(1).find((item) => Math.sign(item.gap) !== Math.sign(top.gap) && Math.abs(item.gap) >= 1.5);
    movers = {
      id: "movers",
      tone: top.gap > 0 ? "up" : "down",
      text: `${top.position.ticker} ${movedWord(top.position.dayPct!)} ${when} while ${top.sector} ${movedWord(top.base)}, the widest gap among your watched names.`,
      soWhat: other ? `${other.position.ticker} went the other way: ${signedPct(other.position.dayPct!)} against ${signedPct(other.base)} for ${other.sector}.` : undefined,
      tickers: [top.position.ticker, ...(other ? [other.position.ticker] : [])],
      action: { label: `Why ${top.position.ticker} moved`, href: `/stock/${top.position.ticker}` },
    };
  } else {
    const ranked = watched.filter((position) => fin(position.dayPct)).sort((a, b) => Math.abs(b.dayPct!) - Math.abs(a.dayPct!));
    const lead = ranked[0];
    if (lead && Math.abs(lead.dayPct!) >= 2) {
      movers = {
        id: "movers",
        tone: lead.dayPct! > 0 ? "up" : "down",
        text: `${lead.ticker} moved most of your watched names ${when}, ${signedPct(lead.dayPct!)}${fin(input.marketPct) ? ` against ${signedPct(input.marketPct)} for the S&P 500` : ""}.`,
        tickers: [lead.ticker],
        action: { label: `Why ${lead.ticker} moved`, href: `/stock/${lead.ticker}` },
      };
    }
  }

  const reporting = watched
    .map((position) => ({ position, gap: position.nextEarnings ? dayGap(input.today, position.nextEarnings.date) : null }))
    .filter((item) => item.gap !== null && item.gap >= 0 && item.gap <= 7)
    .sort((a, b) => a.gap! - b.gap!);
  const earnings: Insight | null = reporting.length
    ? {
        id: "earnings",
        tone: "flat",
        text: `${plural(reporting.length, "watched name")} report${reporting.length === 1 ? "s" : ""} this week: ${joinSome(reporting.slice(0, 5).map((item) => `${item.position.ticker} ${shortDay(item.position.nextEarnings!.date)}`), reporting.length)}.`,
        tickers: reporting.slice(0, 5).map((item) => item.position.ticker),
        action: { label: `${reporting[0]!.position.ticker} earnings`, href: `/stock/${reporting[0]!.position.ticker}#earnings` },
      }
    : null;

  const adds = watched.filter((position) => (position.stance ?? "").toLowerCase() === "accumulate");
  const addCalls: Insight | null =
    adds.length > 0
      ? {
          id: "adds",
          tone: "up",
          text: `${adds.length} of your ${watched.length} watched names carry an Add call: ${joinSome(adds.slice(0, 5).map((position) => position.ticker), adds.length)}.`,
          tickers: adds.slice(0, 5).map((position) => position.ticker),
        }
      : null;

  const items = pickInsights([zoneInsight, movers, earnings, addCalls], 4);
  const lead = items.shift();
  if (!lead) return null;
  return { headline: lead.text + (lead.soWhat ? ` ${lead.soWhat}` : ""), insights: items.slice(0, 3), asOf: null };
}

/* ── Analytics ───────────────────────────────────────────────────────────── */

function analyticsRead(input: PortfolioInsightInput): TheRead | null {
  const { portfolio } = input;
  const { rows, byValue } = weights(portfolio);
  if (rows.length === 0) return null;
  const { analytics } = portfolio;

  // Tilt: the sector furthest above its S&P weight, and the biggest sector you do not own.
  const mine = new Map<string, number>();
  for (const row of rows) {
    const sector = sectorFor(row.position, input.sectorOf) ?? "Unclassified";
    mine.set(sector, (mine.get(sector) ?? 0) + row.weight);
  }
  const sp = input.spSectorWeights;
  const tilts = [...mine.entries()]
    .filter(([sector]) => fin(sp[sector]))
    .map(([sector, weight]) => ({ sector, weight, sp: sp[sector]!, gap: weight - sp[sector]! }))
    .sort((a, b) => b.gap - a.gap);
  const over = tilts[0];
  const missing = Object.entries(sp)
    .filter(([sector]) => !mine.has(sector))
    .sort((a, b) => b[1] - a[1]);
  const missingWeight = missing.reduce((sum, [, weight]) => sum + weight, 0);
  // Index funds hold every sector, so sector shares count only the stocks bought directly, and "you own nothing in" is left out.
  const fundRows = rows.filter((row) => sectorFor(row.position, input.sectorOf) === FUNDS);
  const fundWeight = fundRows.reduce((sum, row) => sum + row.weight, 0);
  const direct = fundRows.length > 0 ? " stocks bought directly" : "";
  const sectorCount = [...mine.keys()].filter((sector) => sector !== FUNDS).length;

  let headline = "";
  if (over && over.gap >= 10) {
    headline = `${pct(over.weight, 0)} of your money is in ${over.sector}${direct}, against ${pct(over.sp, 0)} of the S&P 500.`;
  } else if (byValue && fin(analytics.top3) && portfolio.positions.length > 3) {
    headline = `Your three biggest holdings are ${pct(analytics.top3, 0)} of your portfolio.`;
  } else if (rows.length > 0) {
    headline =
      fundRows.length === rows.length
        ? `Your ${plural(rows.length, "holding")} ${rows.length === 1 ? "is a fund" : "are all funds"}.`
        : fundRows.length > 0
          ? `Your ${plural(rows.length, "holding")} include ${plural(fundRows.length, "fund")} and stocks in ${plural(sectorCount, "sector")}.`
          : `Your ${plural(rows.length, "holding")} spread across ${plural(sectorCount, "sector")}.`;
  }

  const funds: Insight | null =
    fundRows.length > 0
      ? {
          id: "funds",
          tone: "flat",
          text: `${joinNames(fundRows.map((row) => row.position.ticker))} ${fundRows.length === 1 ? "is" : "are"} ${byValue ? `${pct(fundWeight, 0)} of your portfolio` : `${fundRows.length} of your ${rows.length} holdings`}, and ${fundRows.length === 1 ? "it holds hundreds of companies" : "they hold hundreds of companies between them"}.`,
          soWhat: `The X-ray shows what is inside ${fundRows.length === 1 ? "it" : "them"} next to the stocks bought directly.`,
          tickers: fundRows.map((row) => row.position.ticker),
          action: { label: "Open the X-ray", href: "/portfolio/xray" },
        }
      : null;

  const gaps: Insight | null =
    fundRows.length === 0 && missing.length > 0 && missingWeight >= 10
      ? {
          id: "missing",
          tone: "flat",
          text: `You own nothing in ${joinNames(missing.slice(0, 3).map(([sector]) => sector))}, ${pct(missing.slice(0, 3).reduce((sum, [, weight]) => sum + weight, 0), 0)} of the S&P 500 between them.`,
          action: { label: "Screen a sector", href: `/screener?tab=sectors` },
        }
      : null;

  const concentration: Insight | null =
    byValue && fin(analytics.top1) && analytics.byPosition[0]
      ? {
          id: "top",
          tone: analytics.top1 >= 25 ? "down" : "flat",
          text: `${analytics.byPosition[0].label} alone is ${pct(analytics.top1, 0)} of your portfolio${fin(analytics.top3) ? `; the top three are ${pct(analytics.top3, 0)}` : ""}.`,
          soWhat: fin(analytics.effectivePositions) ? `It behaves like ${analytics.effectivePositions.toFixed(1)} equal-sized positions.` : undefined,
          tickers: analytics.byPosition.slice(0, 3).map((slice) => slice.label),
        }
      : null;

  let risk: Insight | null = null;
  if (fin(analytics.beta)) {
    const vol = fin(analytics.volatility) && fin(analytics.benchmarkVolatility) ? ` Its ups and downs over a year are ${pct(analytics.volatility, 0)}, against ${pct(analytics.benchmarkVolatility, 0)} for the S&P 500.` : "";
    const high = [...rows].filter((row) => fin(row.position.beta)).sort((a, b) => b.position.beta! - a.position.beta!).slice(0, 2);
    risk = {
      id: "risk",
      tone: analytics.beta > 1.2 ? "down" : analytics.beta < 0.8 ? "up" : "flat",
      text: `When the S&P 500 moves 1%, your portfolio has tended to move ${analytics.beta.toFixed(1)}%.${vol}`,
      soWhat: high.length ? `${joinNames(high.map((row) => `${row.position.ticker} (${row.position.beta!.toFixed(1)})`))} swing the most.` : undefined,
      tickers: high.map((row) => row.position.ticker),
    };
  }

  // Contributors: to the gain on cost when costs are entered (the figure in the page header), else to the move since saved.
  let contributors: Insight | null = null;
  const { totals } = portfolio;
  const costed = portfolio.positions.filter((position) => fin(position.gain));
  const dated = rows.filter((row) => row.position.sinceSaved !== null);
  if (fin(totals.gain) && fin(totals.gainPct) && costed.length >= 2 && Math.abs(totals.gainPct) >= 0.5) {
    const gain = totals.gain;
    const sign = Math.sign(gain) || 1;
    const lead = costed.filter((position) => Math.sign(position.gain!) === sign).sort((a, b) => Math.abs(b.gain!) - Math.abs(a.gain!)).slice(0, 2);
    if (lead.length) {
      const share = (lead.reduce((sum, position) => sum + position.gain!, 0) / gain) * 100;
      const names = joinNames(lead.map((position) => position.ticker));
      contributors = {
        id: "contributors",
        tone: sign > 0 ? "up" : "down",
        text:
          sign > 0
            ? `${names} ${share >= 35 && share <= 100 ? `made ${pct(share, 0)} of` : "did the most for"} your +${money(gain)} (${signedPct(totals.gainPct, 2)}) gain on cost.`
            : `${names} ${share >= 35 && share <= 100 ? `${lead.length === 1 ? "accounts" : "account"} for ${pct(share, 0)} of` : share > 100 ? "drove most of" : "lost the most in"} your ${money(gain)} (${pct(totals.gainPct, 2)}) loss on cost.`,
        tickers: lead.map((position) => position.ticker),
      };
    }
  }
  // No usable gain on cost (fewer than two costs entered, or too small to split): the move since saved instead.
  if (!contributors && dated.length >= 2) {
    const total = dated.reduce((sum, row) => sum + row.weight, 0);
    const contrib = dated.map((row) => ({ ...row, c: (row.weight / total) * row.position.sinceSaved!.pct }));
    const book = contrib.reduce((sum, row) => sum + row.c, 0);
    const sign = Math.sign(book) || 1;
    const lead = contrib.filter((row) => Math.sign(row.c) === sign).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 2);
    if (lead.length && Math.abs(book) >= 0.5) {
      const share = (lead.reduce((sum, row) => sum + row.c, 0) / book) * 100;
      contributors = {
        id: "contributors",
        tone: book >= 0 ? "up" : "down",
        text:
          share >= 35 && share <= 100
            ? `${joinNames(lead.map((row) => row.position.ticker))} did ${pct(share, 0)} of your ${pct(book)} ${book >= 0 ? "gain" : "loss"} since you saved them.`
            : `${joinNames(lead.map((row) => row.position.ticker))} did the most for your ${pct(book)} ${book >= 0 ? "gain" : "loss"} since you saved them.`,
        tickers: lead.map((row) => row.position.ticker),
      };
    }
  }

  const insights = pickInsights([contributors, funds, risk, concentration, gaps], 3);
  if (!headline && insights.length === 0) return null;
  return {
    headline,
    insights,
    source: byValue ? undefined : "Weighted equally until shares are entered",
    asOf: null,
  };
}

/* ── Alerts ──────────────────────────────────────────────────────────────── */

function alertsRead(input: PortfolioInsightInput): TheRead | null {
  const alerts = input.alerts ?? [];
  const everyone = [...input.portfolio.positions, ...input.portfolio.watching];
  if (everyone.length === 0) return null;
  const priceById = new Map(everyone.map((position) => [position.instrument_id, position.price]));
  const priced = alerts
    .filter((alert) => alert.kind === "price_threshold" && fin(alert.target_price) && alert.condition)
    .map((alert) => {
      const price = priceById.get(alert.instrument_id);
      return fin(price) && price > 0 ? { alert, away: ((alert.target_price! - price) / price) * 100 } : null;
    })
    .filter((item): item is { alert: NonNullable<PortfolioInsightInput["alerts"]>[number]; away: number } => item !== null)
    .sort((a, b) => Math.abs(a.away) - Math.abs(b.away));

  const covered = new Set(alerts.map((alert) => alert.instrument_id));
  const bare = input.portfolio.positions.filter((position) => !covered.has(position.instrument_id));
  const soon = bare
    .map((position) => ({ position, gap: position.nextEarnings ? dayGap(input.today, position.nextEarnings.date) : null }))
    .filter((item) => item.gap !== null && item.gap >= 0 && item.gap <= 14)
    .sort((a, b) => a.gap! - b.gap!);

  const nearest = priced[0];
  const headline = nearest
    ? `Your nearest alert: ${nearest.alert.ticker} ${nearest.alert.condition} ${money(nearest.alert.target_price!)}, ${pct(nearest.away)} away.`
    : alerts.length === 0
      ? `No alerts set on your ${plural(everyone.length, "stock")}.`
      : `${plural(alerts.length, "alert")} set, none on a price level.`;

  const next: Insight | null =
    priced.length > 1
      ? {
          id: "next",
          tone: "flat",
          text: `Next closest: ${joinNames(priced.slice(1, 4).map((item) => `${item.alert.ticker} ${item.alert.condition} ${money(item.alert.target_price!)} (${pct(item.away)} away)`))}.`,
          tickers: [...new Set(priced.slice(1, 4).map((item) => item.alert.ticker))],
        }
      : null;
  const reporting: Insight | null = soon.length
    ? {
        id: "unwatched-earnings",
        tone: "flat",
        text: `${joinSome(soon.slice(0, 3).map((item) => item.position.ticker), soon.length)} ${soon.length === 1 ? "reports" : "report"} in the next two weeks with no alert set.`,
        tickers: soon.slice(0, 3).map((item) => item.position.ticker),
        action: { label: `Alert on ${soon[0]!.position.ticker}`, href: `/stock/${soon[0]!.position.ticker}` },
      }
    : null;
  const coverage: Insight | null =
    bare.length > 0 && input.portfolio.positions.length > 0
      ? {
          id: "bare",
          tone: "flat",
          text: `${bare.length} of your ${plural(input.portfolio.positions.length, "holding")} ${bare.length === 1 ? "has" : "have"} no alert of any kind.`,
          tickers: bare.slice(0, 6).map((position) => position.ticker),
        }
      : null;
  return { headline, insights: pickInsights([next, reporting, coverage], 3), asOf: null };
}

/** The example is nobody's book: "your book" reads as "the book", "you are up" as "the holdings are up". */
export function impersonalText(text: string): string {
  return text
    .replace(/\bYou own nothing in\b/g, "The portfolio owns nothing in")
    .replace(/\bYou are (up|down)\b/g, "The holdings are $1")
    .replace(/\b(S|s)ince you saved them\b/g, "$1ince they were added")
    .replace(/\byour\b/g, "the")
    .replace(/\bYour\b/g, "The");
}

function impersonal(read: TheRead | null): TheRead | null {
  if (!read) return read;
  const fix = impersonalText;
  return {
    ...read,
    headline: fix(read.headline),
    insights: read.insights.map((item) => ({ ...item, text: fix(item.text), soWhat: item.soWhat ? fix(item.soWhat) : item.soWhat })),
  };
}

/** Every sector the reads will compare against, so the loader can fetch each one's live move. */
export function sectorsToLoad(portfolio: Portfolio, sectorOf: Record<string, string>): string[] {
  return [...new Set([...portfolio.positions, ...portfolio.watching].map((position) => sectorFor(position, sectorOf)).filter((name): name is string => Boolean(name)))];
}

export function buildPortfolioReads(input: PortfolioInsightInput): PortfolioReads {
  const tidy = input.example ? impersonal : (read: TheRead | null) => read;
  return {
    positions: tidy(positionsRead(input)),
    watching: tidy(watchingRead(input)),
    analytics: tidy(analyticsRead(input)),
    alerts: input.example ? null : alertsRead(input),
  };
}

// Exported for tests.
export const __test = { weights, zoneState };
