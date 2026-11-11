/**
 * The read of a pasted or imported portfolio: what we think of each stock and
 * what the list adds up to. Pure (no server imports): the server loads the
 * facts (lib/import/read.ts), the page builds the read from them, with the
 * share counts that only ever live in the browser.
 *
 * Everything shown to a signed-out visitor is open on every plan: the call
 * and its date, a reason with any price level taken out, the sector, today's
 * move and the next earnings date. Price zones are never in here.
 */

import { pickInsights, type Insight, type TheRead } from "@/lib/insights";

export type ReadCall = "Add" | "Hold" | "Trim";

export type ReadStock = {
  instrument_id: string;
  ticker: string;
  name: string;
  sector: string | null;
  price: number | null;
  day_pct: number | null;
  /** When the price was taken (ISO). */
  price_at: string | null;
  call: ReadCall | null;
  /** Day the call was made (YYYY-MM-DD). */
  call_at: string | null;
  /** Why, in one sentence, with any price level removed. */
  reason: string | null;
  earnings_date: string | null;
  earnings_time: "bmo" | "amc" | null;
};

export type ReadFacts = {
  stocks: ReadStock[];
  /** S&P 500 move today, percent. */
  market_pct: number | null;
  /** S&P 500 sector weights, percent. */
  sp_weights: Record<string, number>;
  /** New York day today (YYYY-MM-DD). */
  today: string;
  as_of: string;
};

export type SectorSlice = { sector: string; pct: number; tickers: string[] };

export type PortfolioReadResult = {
  read: TheRead;
  sectors: SectorSlice[];
  /** "value" when every stock has shares and a price, else "count". */
  weighting: "value" | "count";
  /** Reporting in the next 30 days, soonest first. */
  upcoming: Array<{ ticker: string; date: string; time: "bmo" | "amc" | null; days: number }>;
  calls: Record<ReadCall | "none", string[]>;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "AAPL", "AAPL and MSFT", "AAPL, MSFT and NVDA", "AAPL, MSFT and 3 more". */
export function listTickers(tickers: string[], max = 3): string {
  if (tickers.length === 0) return "";
  if (tickers.length === 1) return tickers[0]!;
  if (tickers.length <= max) return `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
  return `${tickers.slice(0, max - 1).join(", ")} and ${tickers.length - (max - 1)} more`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function signed(pct: number, digits = 1): string {
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(digits)}%`;
}

/** First sentence of a reason, so each stock gets one line. The sentence is never cut. */
export function firstSentence(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const [first] = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  return first ?? clean;
}

/**
 * The read. `shares` maps instrument id to share count, when the person gave
 * them; with shares for every stock the mix is by value, otherwise every
 * stock counts the same.
 */
export function buildPortfolioRead(facts: ReadFacts, shares: Record<string, number | null | undefined> = {}): PortfolioReadResult {
  const stocks = facts.stocks;
  const values = stocks.map((stock) => {
    const n = shares[stock.instrument_id];
    return fin(n) && n > 0 && fin(stock.price) ? n * stock.price : null;
  });
  const byValue = stocks.length > 0 && values.every((value) => value !== null);
  const weights = byValue ? (values as number[]) : stocks.map(() => 1);
  const total = weights.reduce((sum, w) => sum + w, 0);

  // Sector mix.
  const bySector = new Map<string, { weight: number; tickers: string[] }>();
  stocks.forEach((stock, index) => {
    const sector = stock.sector || "Other";
    const slot = bySector.get(sector) ?? { weight: 0, tickers: [] };
    slot.weight += weights[index]!;
    slot.tickers.push(stock.ticker);
    bySector.set(sector, slot);
  });
  const sectors: SectorSlice[] = [...bySector.entries()]
    .map(([sector, slot]) => ({ sector, pct: total > 0 ? (slot.weight / total) * 100 : 0, tickers: slot.tickers }))
    .sort((a, b) => b.pct - a.pct || a.sector.localeCompare(b.sector));

  // Calls.
  const calls: PortfolioReadResult["calls"] = { Add: [], Hold: [], Trim: [], none: [] };
  for (const stock of stocks) calls[stock.call ?? "none"].push(stock.ticker);
  const called = calls.Add.length + calls.Hold.length + calls.Trim.length;

  // Today: weighted move against the S&P 500.
  let moveWeight = 0;
  let moveSum = 0;
  stocks.forEach((stock, index) => {
    if (!fin(stock.day_pct)) return;
    moveSum += stock.day_pct * weights[index]!;
    moveWeight += weights[index]!;
  });
  const dayPct = moveWeight > 0 ? moveSum / moveWeight : null;
  const movers = stocks.filter((stock) => fin(stock.day_pct)).sort((a, b) => Math.abs(b.day_pct!) - Math.abs(a.day_pct!));

  // Earnings coming up.
  const upcoming = stocks
    .filter((stock) => stock.earnings_date && stock.earnings_date >= facts.today)
    .map((stock) => ({ ticker: stock.ticker, date: stock.earnings_date!, time: stock.earnings_time, days: daysBetween(facts.today, stock.earnings_date!) }))
    .filter((item) => item.days <= 30)
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));

  const insights: Array<Insight | null> = [];

  // 1. What we would do with these stocks.
  if (called > 0) {
    const parts = [
      calls.Add.length ? `buy more of ${calls.Add.length}` : null,
      calls.Hold.length ? `keep ${calls.Hold.length}` : null,
      calls.Trim.length ? `sell some of ${calls.Trim.length}` : null,
    ].filter(Boolean) as string[];
    const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]!;
    insights.push({
      id: "calls",
      tone: calls.Trim.length > calls.Add.length ? "down" : calls.Add.length > calls.Trim.length ? "up" : "flat",
      text:
        called === 1
          ? `We would ${calls.Add.length ? "buy more of" : calls.Trim.length ? "sell some of" : "keep"} ${[...calls.Add, ...calls.Hold, ...calls.Trim][0]}${stocks.length > 1 ? ", the one stock here we have a call on" : ""}.`
          : `Of the ${called} stocks we have a call on, we would ${said}.`,
      soWhat: calls.Trim.length
        ? `${listTickers(calls.Trim)} ${calls.Trim.length === 1 ? "is" : "are"} the ${calls.Trim.length === 1 ? "one" : "ones"} to look at first.`
        : calls.Add.length
          ? `${listTickers(calls.Add)} ${calls.Add.length === 1 ? "looks" : "look"} the strongest to us right now.`
          : undefined,
      tickers: calls.Trim.length ? calls.Trim.slice(0, 6) : calls.Add.slice(0, 6),
    });
  }

  // 2. How concentrated it is, against the S&P 500.
  const top = sectors[0];
  if (top && stocks.length >= 2 && top.sector !== "Other" && top.pct >= 35) {
    const index = facts.sp_weights[top.sector];
    const times = fin(index) && index > 0 ? top.pct / index : null;
    insights.push({
      id: "concentration",
      tone: top.pct >= 50 ? "down" : "flat",
      text: `${Math.round(top.pct)}% of this portfolio is in ${top.sector}${byValue ? " by value" : ""}.`,
      soWhat:
        times !== null && times >= 1.5
          ? `That is ${times.toFixed(1)} times its ${Math.round(index!)}% weight in the S&P 500, so one bad week for the sector would hit ${top.pct >= 50 ? "most of it" : "a big part of it"}.`
          : times !== null
            ? `The S&P 500 holds about ${Math.round(index!)}% there.`
            : undefined,
      tickers: top.tickers.slice(0, 6),
    });
  } else if (sectors.length >= 4 && top && top.pct < 35) {
    insights.push({
      id: "concentration",
      tone: "up",
      text: `It is spread across ${plural(sectors.length, "sector")}, and none has more than ${Math.round(top.pct)}%.`,
    });
  }

  // 3. Today, against the market.
  if (dayPct !== null && movers.length > 0) {
    const lead = movers[0]!;
    const versus = fin(facts.market_pct) ? `, against ${signed(facts.market_pct)} for the S&P 500` : "";
    insights.push({
      id: "today",
      tone: dayPct > 0.05 ? "up" : dayPct < -0.05 ? "down" : "flat",
      text: `${stocks.length === 1 ? "It is" : "Together these are"} ${dayPct >= 0 ? "up" : "down"} ${Math.abs(dayPct).toFixed(1)}% today${versus}.`,
      // The sentence names the mover itself; a lone ticker here would be drawn in front of "Together".
      soWhat: stocks.length > 1 && Math.abs(lead.day_pct!) >= 1 ? `${lead.ticker} moved the most, ${signed(lead.day_pct!)}.` : undefined,
    });
  }

  // 4. Earnings this week, when there is room.
  const thisWeek = upcoming.filter((item) => item.days <= 7);
  if (thisWeek.length > 0) {
    insights.push({
      id: "earnings",
      tone: "flat",
      text: `${listTickers(thisWeek.map((item) => item.ticker))} ${thisWeek.length === 1 ? "reports" : "report"} earnings in the next seven days.`,
      tickers: thisWeek.map((item) => item.ticker).slice(0, 6),
    });
  }

  const picked = pickInsights(insights, 3);
  let headline: string;
  if (stocks.length === 0) headline = "";
  else if (top && top.pct >= 50 && stocks.length >= 2 && top.sector !== "Other")
    headline = calls.Trim.length
      ? `Heavy on ${top.sector}, and we would sell some ${listTickers(calls.Trim, 2)}.`
      : `Most of this portfolio rides on ${top.sector}.`;
  else if (calls.Trim.length > 0) headline = `We would sell some ${listTickers(calls.Trim, 2)}, and keep or buy more of the rest.`;
  else if (calls.Add.length * 2 > called) headline = `We like most of this: we would buy more of ${calls.Add.length} of the ${called}.`;
  else if (called > 0) headline = `Nothing here we would sell, and we would keep ${calls.Hold.length} of the ${called} as they are.`;
  else headline = "We do not have a call on these stocks yet.";

  return {
    read: { headline, insights: picked, asOf: facts.as_of },
    sectors,
    weighting: byValue ? "value" : "count",
    upcoming,
    calls,
  };
}
