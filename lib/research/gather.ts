import { returnStats, slicePeriod, thin, type QuoteCard, type SeriesPoint } from "@/lib/ask-cards";
import { loadDailySeriesStrict, loadTickerNews } from "@/lib/ask-data";
import { buildAskTools } from "@/lib/ask-tools";
import { loadEarningsDetailStrict } from "@/lib/calendar";
import { todayET } from "@/lib/calendar-shared";
import { redactLevels, redactLevelsDeep } from "@/lib/entitlements";
import { getFilingsForTicker } from "@/lib/filings";
import { getNewsForTicker } from "@/lib/news";
import { getRedditContextForTicker } from "@/lib/reddit-cues";
import { findLatestFilings, readFiling, type EdgarFiling, type FilingRead } from "@/lib/research/edgar";
import { day, fin, median, money, num, pct, price, round, signedPct, times } from "@/lib/research/format";
import type { SourceBook } from "@/lib/research/sources";
import type { ResearchCharts, ResearchStepId } from "@/lib/research/types";
import { getScreenerSnapshotStrict } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { loadPolicy } from "@/lib/signals";
import { getStockFacts, getStockSummary } from "@/lib/stock";
import { getStockCongressTrades } from "@/lib/stock-events";
import { getStockOwnership } from "@/lib/stock-ownership";

/**
 * The evidence steps of a research run. Each one reads what we already store
 * (or, for the 10-K and 10-Q, SEC EDGAR), cites every source it used in the
 * run's SourceBook, and returns compact facts for the writer plus anything a
 * chart needs. Nothing here writes, and nothing here sends price levels: the
 * report can be shared publicly, so it is built from what every reader may see
 * (the call's headline with levels redacted, never the zones or the covered
 * reasoning behind the call).
 */

export type StepContext = {
  ticker: string;
  uid: string;
  isPro: boolean;
  now: Date;
  book: SourceBook;
  charts: ResearchCharts;
  /** Every ISO day that appears in the evidence. "What to watch" may only name these. */
  dates: Set<string>;
  /** Shared between the 10-K and 10-Q steps so EDGAR is asked once. */
  edgar: { latest?: Promise<{ annual: EdgarFiling | null; quarterly: EdgarFiling | null } | null> };
};

export type StepOutput = {
  status: "done" | "empty";
  /** What a person sees under the step: "4 reports, the last on Aug 27, 2026". */
  detail: string;
  facts: Record<string, unknown> | null;
  /** Plain lines on what we could not find, for the report's gaps and the writer. */
  missing?: string[];
};

export type StepLoader = (ctx: StepContext) => Promise<StepOutput>;

function stockPage(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker)}`;
}

function noteDate(ctx: StepContext, value: unknown): void {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) ctx.dates.add(value.slice(0, 10));
}

function text(value: unknown, max = 600): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/* ── 1. our brief, the quote and the price history ──────────────────────── */

function trailing(series: SeriesPoint[], days: number) {
  if (series.length < 2) return null;
  const span = (Date.parse(series[series.length - 1]!.date) - Date.parse(series[0]!.date)) / 86400000;
  if (span < days - 5) return null;
  return returnStats(slicePeriod(series, { kind: "days", days, label: "" }));
}

export const loadBrief: StepLoader = async (ctx) => {
  const tools = buildAskTools({ uid: ctx.uid, isPro: ctx.isPro, now: ctx.now, levels: () => false });
  const [quoteRaw, summary, history, spy] = await Promise.all([
    tools.get_stock!.execute!({ ticker: ctx.ticker }, { toolCallId: "research-brief", messages: [] }) as Promise<unknown>,
    getStockSummary(ctx.ticker, "US"),
    // Strict reads: an outage fails the step ("could not be read") instead of reading as "no history".
    loadDailySeriesStrict(ctx.ticker),
    loadDailySeriesStrict("SPY").catch(() => null),
  ]);
  const quote = quoteRaw && typeof quoteRaw === "object" && (quoteRaw as { card?: string }).card === "quote" ? (quoteRaw as QuoteCard) : null;
  if (!quote && !summary) return { status: "empty", detail: "We hold no quote for this stock.", facts: null, missing: ["We hold no current quote or brief for this stock."] };

  const pageSource = ctx.book.cite({ label: `stocksbrew stock page for ${ctx.ticker}: quote, our call and analyst target`, url: stockPage(ctx.ticker), kind: "ours", as_of: quote?.as_of ?? summary?.captured_at ?? null });
  const profileSource = summary?.description
    ? ctx.book.cite({ label: `${summary.name} company profile`, url: stockPage(ctx.ticker), kind: "data", as_of: null })
    : null;

  let prices: Record<string, unknown> | null = null;
  if (history) {
    const series = history.series;
    const year = trailing(series, 365);
    const priceSource = ctx.book.cite({ label: `${ctx.ticker} daily closes, adjusted for splits and dividends (${history.source})`, url: stockPage(ctx.ticker), kind: "data", as_of: series[series.length - 1]?.date ?? null });
    const spyYear = spy && year ? returnStats(slicePeriod(spy.series, { kind: "range", start: year.from.date, end: year.to.date, label: "" })) : null;
    prices = {
      source: priceSource,
      last_close: { date: series[series.length - 1]!.date, close: round(series[series.length - 1]!.close) },
      return_1m_pct: round(trailing(series, 30)?.return_pct, 1),
      return_3m_pct: round(trailing(series, 91)?.return_pct, 1),
      return_1y_pct: round(year?.return_pct, 1),
      return_3y_pct: round(trailing(series, 1096)?.return_pct, 1),
      spy_return_same_year_pct: round(spyYear?.return_pct, 1),
      one_year_high: year ? { date: year.high.date, close: round(year.high.close) } : null,
      one_year_low: year ? { date: year.low.date, close: round(year.low.close) } : null,
      worst_fall_1y_pct: round(year?.max_drawdown_pct, 1),
    };
    if (year) {
      const slice = slicePeriod(series, { kind: "days", days: 365, label: "" });
      const bench = spy ? slicePeriod(spy.series, { kind: "range", start: slice[0]!.date, end: slice[slice.length - 1]!.date, label: "" }) : [];
      ctx.charts.price = {
        points: thin(slice, 160).map((point) => ({ date: point.date, close: round(point.close)! })),
        benchmark: bench.length > 1 ? thin(bench, 160).map((point) => ({ date: point.date, close: round(point.close)! })) : null,
        return_pct: round(year.return_pct, 1),
        benchmark_return_pct: round(spyYear?.return_pct, 1),
        source_id: priceSource,
      };
    }
  }

  if (quote?.next_earnings?.date) noteDate(ctx, quote.next_earnings.date);
  const stats = ctx.charts.stats;
  if (fin(quote?.price ?? summary?.price)) stats.push({ label: "Price", value: price(quote?.price ?? summary?.price), sub: fin(quote?.day_change_pct) ? `${signedPct(quote!.day_change_pct)} today` : null, tone: null });
  if (prices && fin(prices.return_1y_pct as number)) {
    const r = prices.return_1y_pct as number;
    stats.push({ label: "1 year", value: signedPct(r), sub: fin(prices.spy_return_same_year_pct as number) ? `S&P 500 ${signedPct(prices.spy_return_same_year_pct as number)}` : null, tone: r > 0 ? "up" : r < 0 ? "down" : "flat" });
  }
  // The financials step holds the figure the stock page shows; it wins when both are read.
  if (fin(quote?.market_cap) && !stats.some((stat) => stat.label === "Market value")) stats.push({ label: "Market value", value: money(quote!.market_cap), sub: null, tone: null });

  return {
    status: "done",
    detail: [quote?.price ? `Last price ${price(quote.price)}` : null, prices ? "a year of daily closes" : "no price history"].filter(Boolean).join(", "),
    facts: {
      source: pageSource,
      company: {
        name: quote?.name ?? summary?.name ?? ctx.ticker,
        sector: quote?.sector ?? summary?.sector ?? null,
        industry: quote?.industry ?? summary?.industry ?? null,
        description: profileSource ? { source: profileSource, text: text(summary?.description, 1600) } : null,
      },
      quote: quote
        ? {
            price: quote.price,
            day_change_pct: quote.day_change_pct,
            market_cap: quote.market_cap,
            pe_ttm: quote.pe_ttm,
            dividend_yield_pct: quote.dividend_yield,
            week_52_high: quote.week_52_high,
            week_52_low: quote.week_52_low,
            analyst_target: quote.analyst_target,
            target_upside_pct: quote.target_upside_pct,
            our_score_of_100: quote.score,
            our_verdict: quote.verdict,
            // The one-line call is free for every reader; any price level in it is removed.
            our_call_headline: redactLevels(quote.headline),
            next_earnings: quote.next_earnings,
            as_of: quote.as_of,
          }
        : null,
      prices,
    },
    missing: prices ? [] : ["We hold no daily price history for this stock, so there is no return or price chart."],
  };
};

/* ── 2. financials and their history ────────────────────────────────────── */

export const loadFinancials: StepLoader = async (ctx) => {
  // A failed read throws: the run then says the statements could not be read, not that there are none.
  const facts = await getStockFacts(`US_${ctx.ticker}`);
  const history = (facts?.financial_history ?? []).filter((row) => row && typeof row.period === "string");
  if (!facts || (history.length === 0 && !facts.financials)) {
    return { status: "empty", detail: "No financial statements on file.", facts: null, missing: ["We hold no financial statements for this company."] };
  }
  const provider = facts.financials?.source === "stockanalysis" ? "stockanalysis.com" : facts.financials?.source || "our data provider";
  const finSource = ctx.book.cite({
    label: `${ctx.ticker} income statement, cash flow and balance sheet, compiled by ${provider}`,
    url: facts.financials?.source === "stockanalysis" ? `https://stockanalysis.com/stocks/${ctx.ticker.toLowerCase().replace(/\./g, "-")}/financials/` : stockPage(ctx.ticker),
    kind: "data",
    as_of: facts.captured_at ?? null,
  });
  const analystSource = facts.analyst?.analyst_count
    ? ctx.book.cite({ label: `Analyst ratings and price targets for ${ctx.ticker} (${facts.analyst.source || "Nasdaq"})`, url: stockPage(ctx.ticker), kind: "data", as_of: facts.captured_at ?? null })
    : null;

  const fiscal = history.filter((row) => /^FY/i.test(row.period)).sort((a, b) => a.period.localeCompare(b.period));
  const ttm = history.find((row) => /ttm/i.test(row.period)) ?? null;
  const chartRows = [...fiscal.slice(-5), ...(ttm ? [ttm] : [])].filter((row) => fin(row.revenue));
  if (chartRows.length >= 2) {
    ctx.charts.revenue = {
      rows: chartRows.map((row) => ({ period: row.period, revenue: row.revenue as number, op_margin_pct: round(row.operating_margin_pct, 1) })),
      source_id: finSource,
    };
  }
  const marketValue = num(facts.quick_stats?.market_cap);
  if (marketValue !== null && marketValue > 0) {
    // Same number as the stock page (lib/stock.ts reads quick_stats first).
    const at = ctx.charts.stats.findIndex((stat) => stat.label === "Market value");
    if (at >= 0) ctx.charts.stats.splice(at, 1);
    ctx.charts.stats.push({ label: "Market value", value: money(marketValue), sub: null, tone: null });
  }
  if (fin(facts.financials?.revenue_growth_yoy_pct)) {
    const growth = facts.financials!.revenue_growth_yoy_pct!;
    ctx.charts.stats.push({ label: "Revenue growth", value: signedPct(growth), sub: "year on year", tone: growth > 0 ? "up" : growth < 0 ? "down" : "flat" });
  }
  if (fin(ttm?.operating_margin_pct)) ctx.charts.stats.push({ label: "Operating margin", value: pct(ttm!.operating_margin_pct), sub: "last 12 months", tone: null });
  if (fin(facts.balance?.net_cash)) {
    ctx.charts.stats.push({ label: facts.balance!.net_cash! >= 0 ? "Net cash" : "Net debt", value: money(Math.abs(facts.balance!.net_cash!)), sub: "cash minus debt", tone: null });
  }
  noteDate(ctx, facts.dividends?.next_ex_dividend_date ?? null);

  return {
    status: "done",
    detail: `${fiscal.length} fiscal year${fiscal.length === 1 ? "" : "s"}${ttm ? " and the last 12 months" : ""}`,
    facts: {
      source: finSource,
      history: [...fiscal, ...(ttm ? [ttm] : [])].map((row) => ({
        period: row.period,
        revenue: num(row.revenue),
        gross_profit: num(row.gross_profit),
        operating_income: num(row.operating_income),
        net_income: num(row.net_income),
        eps_diluted: num(row.eps_diluted),
        free_cash_flow: num(row.free_cash_flow),
        gross_margin_pct: round(row.gross_margin_pct, 1),
        operating_margin_pct: round(row.operating_margin_pct, 1),
        net_margin_pct: round(row.profit_margin_pct, 1),
      })),
      revenue_growth_yoy_pct: round(facts.financials?.revenue_growth_yoy_pct, 1),
      market_value_now: marketValue,
      balance: facts.balance ?? null,
      valuation: facts.valuation ?? null,
      quality: facts.quality ?? null,
      dividends: facts.dividends
        ? {
            annual_dividend: num(facts.dividends.annual_dividend),
            yield_pct: round(facts.dividends.yield_pct, 2),
            payout_ratio_pct: round(facts.dividends.payout_ratio_pct, 1),
            growth_pct: round(facts.dividends.growth_pct, 1),
            growth_years: num(facts.dividends.growth_years),
            buyback_yield_pct: round(facts.dividends.buyback_yield_pct, 2),
            next_ex_dividend_date: facts.dividends.next_ex_dividend_date ?? null,
          }
        : null,
      analysts: analystSource && facts.analyst
        ? {
            source: analystSource,
            consensus: facts.analyst.label ?? null,
            target_price: num(facts.analyst.target_price),
            target_low: num(facts.analyst.target_low),
            target_high: num(facts.analyst.target_high),
            buy: num(facts.analyst.buy),
            hold: num(facts.analyst.hold),
            sell: num(facts.analyst.sell),
            analyst_count: num(facts.analyst.analyst_count),
          }
        : null,
    },
  };
};

/* ── 3. the last four earnings reports and how the stock reacted ───────── */

export const loadEarnings: StepLoader = async (ctx) => {
  const today = todayET(ctx.now);
  const detail = await loadEarningsDetailStrict(ctx.ticker, today);
  const past = (detail?.events ?? []).filter((event) => event.date < today).slice(-4);
  const next = (detail?.events ?? []).find((event) => event.date >= today) ?? null;
  if (!detail || (past.length === 0 && !next)) {
    return { status: "empty", detail: "No earnings reports on file.", facts: null, missing: ["We hold no past earnings reports or reactions for this company."] };
  }
  const calendar = ctx.book.cite({ label: `${ctx.ticker} earnings dates, estimates, results and the stock's move on each report`, url: `/calendar/earnings/${encodeURIComponent(ctx.ticker)}`, kind: "ours", as_of: past[past.length - 1]?.date ?? null });
  const post = detail.postRead;
  const postSource = post
    ? ctx.book.cite({ label: `Our write-up of the ${day(post.event_date)} earnings report`, url: `/calendar/earnings/${encodeURIComponent(ctx.ticker)}`, kind: "ours", as_of: post.generated_at ?? post.event_date })
    : null;
  for (const event of past) noteDate(ctx, event.date);
  if (next) noteDate(ctx, next.date);
  const withReaction = past.filter((event) => event.reaction);
  if (withReaction.length >= 2) {
    ctx.charts.reactions = {
      rows: withReaction.map((event) => ({ date: event.date, pct: round(event.reaction!.pct, 1)!, surprise: event.surpriseLabel })),
      source_id: calendar,
    };
  }
  return {
    status: "done",
    detail: past.length > 0 ? `${past.length} report${past.length === 1 ? "" : "s"}, the last on ${day(past[past.length - 1]!.date)}` : `next report ${day(next!.date)}`,
    facts: {
      source: calendar,
      past_reports: past.map((event) => ({
        date: event.date,
        fiscal_period_ending: event.fiscalEnding || null,
        eps_estimate: event.epsEstimate,
        eps_actual: event.epsActual,
        surprise_pct: round(event.surprisePct, 1),
        result: event.surpriseLabel,
        stock_move_pct: event.reaction ? round(event.reaction.pct, 1) : null,
        move_window: event.reaction ? (event.reaction.basis === "1d" ? "one session" : "two sessions") : null,
      })),
      next_report: next ? { date: next.date, session: next.session, eps_estimate: next.epsEstimate } : null,
      latest_write_up: post && postSource
        ? redactLevelsDeep({
            source: postSource,
            report_date: post.event_date,
            headline: text(post.report.headline, 240),
            summary: text(post.report.summary, 900),
            reported_vs_expected: text(post.report.facts?.reported_vs_expected, 500),
            guidance: text(post.report.facts?.guidance_signal, 500),
            price_reaction: text(post.report.facts?.price_reaction, 400),
          })
        : null,
    },
    missing: past.length === 0 ? ["We hold no past earnings results for this company, only the next date."] : withReaction.length === 0 ? ["We have not measured the stock's move on its recent reports."] : [],
  };
};

/* ── 4 and 5. the latest 10-K and 10-Q from EDGAR ───────────────────────── */

function edgarLatest(ctx: StepContext) {
  ctx.edgar.latest ??= findLatestFilings(ctx.ticker);
  return ctx.edgar.latest;
}

function filingFacts(ctx: StepContext, read: FilingRead): Record<string, unknown> {
  const { filing } = read;
  const source = ctx.book.cite({
    label: `${filing.company || ctx.ticker} ${filing.form}${filing.period ? ` for the period ending ${day(filing.period)}` : ""}, filed ${day(filing.filed)}`,
    url: filing.url,
    kind: "filing",
    as_of: filing.filed,
  });
  noteDate(ctx, filing.filed);
  return {
    source,
    form: filing.form,
    filed: filing.filed,
    period_ending: filing.period,
    business_overview: read.business,
    risk_factor_headings: read.risks,
    mda_highlights: read.mda,
    risk_factor_update: read.risk_update,
  };
}

function filingStep(form: "annual" | "quarterly"): StepLoader {
  return async (ctx) => {
    const latest = await edgarLatest(ctx);
    const filing = latest?.[form] ?? null;
    const name = form === "annual" ? "10-K" : "10-Q";
    if (!filing) {
      return {
        status: "empty",
        detail: latest ? `No ${name} on EDGAR.` : "SEC does not list this ticker.",
        facts: null,
        missing: [latest ? `The company has no ${name} on SEC EDGAR (it may file a 20-F or 40-F as a foreign issuer).` : "SEC EDGAR does not list this ticker, so there are no filings to read."],
      };
    }
    const read = await readFiling(filing);
    const found = read.risks.length + read.mda.length + read.business.length;
    if (found === 0) {
      ctx.book.cite({ label: `${filing.company} ${name}, filed ${day(filing.filed)}`, url: filing.url, kind: "filing", as_of: filing.filed });
      return { status: "empty", detail: `Filed ${day(filing.filed)}, but its sections could not be read.`, facts: null, missing: [`We found the ${name} filed ${day(filing.filed)} but could not read its sections.`] };
    }
    return {
      status: "done",
      detail: `Filed ${day(filing.filed)}: ${[read.risks.length ? `${read.risks.length} risk factor${read.risks.length === 1 ? "" : "s"}` : null, read.mda.length ? `${read.mda.length} MD&A passage${read.mda.length === 1 ? "" : "s"}` : null, read.risk_update ? "a risk factor update" : null].filter(Boolean).join(", ")}`,
      facts: filingFacts(ctx, read),
    };
  };
}

export const loadAnnual = filingStep("annual");
export const loadQuarterly = filingStep("quarterly");

/* ── 6. other recent filings (8-Ks and the like) ────────────────────────── */

export const loadFilings: StepLoader = async (ctx) => {
  const cutoff = new Date(ctx.now.getTime() - 120 * 86400000).toISOString();
  const rows = (await getFilingsForTicker(ctx.ticker, 20)).filter((row) => row.filedAt >= cutoff && !/^10-[KQ]$/.test(row.form)).slice(0, 10);
  if (rows.length === 0) return { status: "empty", detail: "No other filings in the last 120 days.", facts: null };
  return {
    status: "done",
    detail: `${rows.length} filing${rows.length === 1 ? "" : "s"} in the last 120 days`,
    facts: {
      filings: rows.map((row) => {
        noteDate(ctx, row.filedAt);
        return {
          source: ctx.book.cite({ label: `${ctx.ticker} Form ${row.form}, filed ${day(row.filedAt)}: ${row.headline}`, url: row.url, kind: "filing", as_of: row.filedAt }),
          form: row.form,
          filed: row.filedAt.slice(0, 10),
          what: row.headline,
          items: row.items.slice(0, 4).map((item) => item.label).filter(Boolean),
        };
      }),
    },
  };
};

/* ── 7. funds, insiders and Congress ─────────────────────────────────────── */

export const loadOwnership: StepLoader = async (ctx) => {
  const [ownershipRead, congressRead] = await Promise.allSettled([getStockOwnership(ctx.ticker, "US"), getStockCongressTrades(ctx.ticker)]);
  if (ownershipRead.status === "rejected" && congressRead.status === "rejected") throw ownershipRead.reason;
  const ownership = ownershipRead.status === "fulfilled" ? ownershipRead.value : { funds: null, insiders: null };
  const congress = congressRead.status === "fulfilled" ? congressRead.value : [];
  const unread = [
    ownershipRead.status === "rejected" ? "We could not read the fund and insider filings when this report was written." : null,
    congressRead.status === "rejected" ? "We could not read the Congress trades when this report was written." : null,
  ].filter((line): line is string => Boolean(line));
  const funds = ownership.funds && ownership.funds.holderCount > 0 ? ownership.funds : null;
  const cutoff = new Date(ctx.now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
  const insiders = (ownership.insiders?.rows ?? []).filter((row) => row.transactionDate >= cutoff);
  const recentCongress = congress.filter((trade) => trade.transaction_date >= cutoff).slice(0, 12);
  if (!funds && insiders.length === 0 && recentCongress.length === 0) {
    if (unread.length > 0) throw new Error("ownership_partly_unread");
    return { status: "empty", detail: "No fund, insider or Congress trades on file.", facts: null, missing: ["We hold no 13F fund positions, insider trades or congressional trades in this stock."] };
  }
  const fundSource = funds
    ? ctx.book.cite({ label: `SEC Form 13F filings by the ${funds.holderCount} funds we follow that hold ${ctx.ticker}`, url: funds.rows[0]?.sourceUrl ?? "/follow", kind: "filing", as_of: funds.asOf })
    : null;
  const insiderSource = insiders.length > 0
    ? ctx.book.cite({ label: `SEC Form 4 insider trades in ${ctx.ticker}`, url: insiders[0]?.sourceUrl ?? stockPage(ctx.ticker), kind: "filing", as_of: ownership.insiders?.asOf ?? null })
    : null;
  const congressSource = recentCongress.length > 0
    ? ctx.book.cite({ label: `Congressional trade disclosures in ${ctx.ticker}`, url: "/follow?tab=congress", kind: "filing", as_of: recentCongress[0]?.disclosure_date ?? null })
    : null;
  const sum = (side: "buy" | "sell") => insiders.filter((row) => row.action === side).reduce((total, row) => total + (row.valueUsd ?? 0), 0);
  const actions = funds ? funds.rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.action ?? "unknown"]: (acc[row.action ?? "unknown"] ?? 0) + 1 }), {}) : {};
  return {
    status: "done",
    detail: [
      funds ? `${funds.holderCount} fund${funds.holderCount === 1 ? "" : "s"}` : null,
      insiders.length ? `${insiders.length} insider trade${insiders.length === 1 ? "" : "s"}` : null,
      recentCongress.length ? `${recentCongress.length} Congress trade${recentCongress.length === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(", "),
    facts: {
      funds: funds && fundSource
        ? {
            source: fundSource,
            funds_we_follow_holding: funds.holderCount,
            latest_quarter_actions: actions,
            positions: funds.rows.slice(0, 10).map((row) => ({
              fund: row.fund,
              manager: row.manager,
              action: row.action,
              shares_change_pct: round(row.changePct, 1),
              share_of_fund_pct: round(row.portfolioPct, 2),
              value_usd: num(row.valueUsd),
              quarter: row.quarter,
              filed: row.filedDate,
            })),
            exited_last_quarter: funds.exits.slice(0, 6).map((row) => ({ fund: row.fund, quarter: row.quarter, previous_share_of_fund_pct: round(row.prevPortfolioPct, 2) })),
          }
        : null,
      insiders: insiderSource
        ? {
            source: insiderSource,
            window: "last 180 days",
            buys: insiders.filter((row) => row.action === "buy").length,
            sales: insiders.filter((row) => row.action === "sell").length,
            bought_usd: round(sum("buy"), 0),
            sold_usd: round(sum("sell"), 0),
            sales_under_10b5_1_plans: insiders.filter((row) => row.action === "sell" && row.planned).length,
            largest: [...insiders].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)).slice(0, 6).map((row) => ({
              insider: row.insider,
              role: row.role,
              action: row.action,
              value_usd: num(row.valueUsd),
              date: row.transactionDate,
              planned: row.planned,
            })),
          }
        : null,
      congress: congressSource
        ? {
            source: congressSource,
            trades: recentCongress.map((trade) => ({
              member: trade.person_name,
              side: trade.tx_type,
              amount_range_usd: [num(trade.amount_low), num(trade.amount_high)],
              traded: trade.transaction_date,
              disclosed: trade.disclosure_date,
            })),
          }
        : null,
    },
    missing: [
      ...unread,
      funds || ownershipRead.status === "rejected" ? null : "None of the funds we follow report a position in this stock.",
      insiders.length > 0 || ownershipRead.status === "rejected" ? null : "No insider buys or sales in the last 180 days are on file.",
    ].filter((line): line is string => Boolean(line)),
  };
};

/* ── 8. peers from the screener snapshot ─────────────────────────────────── */

const PEER_FIELDS = [
  "market_cap", "pe", "fwd_pe", "ps", "p_fcf", "ev_ebitda", "rev_growth", "rev_cagr_3y", "eps_growth", "eps_next_y",
  "gross_margin", "op_margin", "net_margin", "fcf_margin", "roic", "debt_equity", "ret_1y", "div_yield",
] as const;

function peerRow(row: ScreenerRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ticker: row.symbol, name: row.name ?? row.symbol };
  for (const field of PEER_FIELDS) {
    const value = row[field];
    out[field] = fin(value) ? round(value, field === "market_cap" ? 0 : 2) : null;
  }
  return out;
}

/** The same industry first (closest in size first), then the rest of the sector to fill the list. */
export function pickPeers(self: ScreenerRow, rows: readonly ScreenerRow[], max = 5): ScreenerRow[] {
  const others = rows.filter((row) => row.symbol !== self.symbol && fin(row.market_cap) && row.market_cap > 0);
  const size = fin(self.market_cap) && self.market_cap > 0 ? self.market_cap : null;
  const bySize = (list: ScreenerRow[]) =>
    [...list].sort((a, b) =>
      size ? Math.abs(Math.log(a.market_cap! / size)) - Math.abs(Math.log(b.market_cap! / size)) : (b.market_cap ?? 0) - (a.market_cap ?? 0),
    );
  const byIndustry = self.industry ? bySize(others.filter((row) => row.industry === self.industry)) : [];
  const bySector = self.sector ? bySize(others.filter((row) => row.sector === self.sector && !(self.industry && row.industry === self.industry))) : [];
  return [...byIndustry, ...bySector].slice(0, max);
}

/**
 * A P/E "against its own history" only means something over a long window
 * that runs up to now: the screener sometimes holds a few weeks that ended
 * months ago. Shorter or older windows are left out of the chart and the
 * evidence.
 */
export function usefulPeHistory(from: string | null | undefined, to: string | null | undefined, now: Date): boolean {
  if (!from || !to) return false;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return end - start >= 300 * 86400000 && now.getTime() - end <= 45 * 86400000;
}

export const loadPeers: StepLoader = async (ctx) => {
  const snapshot = await getScreenerSnapshotStrict();
  const self = snapshot?.rows.find((row) => row.symbol === ctx.ticker) ?? null;
  if (!snapshot || !self) {
    return { status: "empty", detail: "This stock is not in our screener, so there are no peers to compare.", facts: null, missing: ["This stock is outside the universe our screener covers, so there is no peer comparison or valuation history."] };
  }
  const peers = pickPeers(self, snapshot.rows);
  const source = ctx.book.cite({ label: `stocksbrew screener: ${ctx.ticker} and its peers by size in ${self.industry || self.sector || "its group"}`, url: `/screener`, kind: "ours", as_of: snapshot.meta.as_of_day ?? snapshot.meta.generated_at });
  const metric: "pe" | "ps" = fin(self.pe) && self.pe > 0 ? "pe" : "ps";
  const valued = [self, ...peers].filter((row) => fin(row[metric]) && (row[metric] as number) > 0);
  const peerValues = peers.map((row) => row[metric]).filter((value): value is number => fin(value) && value > 0);
  const peerMedian = median(peerValues);
  if (valued.length >= 3) {
    ctx.charts.peers = {
      metric,
      rows: valued.map((row) => ({ ticker: row.symbol, value: round(row[metric] as number, 1)!, self: row.symbol === self.symbol })),
      median: round(peerMedian, 1),
      source_id: source,
    };
  }
  const history = usefulPeHistory(self.pe_hist_from, self.pe_hist_to, ctx.now) && fin(self.pe_hist_pctile);
  if (fin(self.pe) && self.pe > 0) {
    if (history) {
      ctx.charts.valuation = { pe: round(self.pe, 1)!, median: round(self.pe_hist_median, 1), pctile: round(self.pe_hist_pctile, 0), from: self.pe_hist_from ?? null, to: self.pe_hist_to ?? null, source_id: source };
    }
    ctx.charts.stats.push({ label: "P/E", value: times(self.pe), sub: history && fin(self.pe_hist_median) ? `own median ${times(self.pe_hist_median)}` : null, tone: null });
  }
  const medians: Record<string, number | null> = {};
  for (const field of ["pe", "fwd_pe", "ps", "ev_ebitda", "rev_growth", "op_margin", "net_margin", "fcf_margin"] as const) {
    medians[field] = round(median(peers.map((row) => row[field]).filter((value): value is number => fin(value))), 1);
  }
  noteDate(ctx, self.earnings_date ?? null);
  return {
    status: "done",
    detail: peers.length > 0 ? `${peers.length} peers: ${peers.map((row) => row.symbol).join(", ")}` : "no peers of a similar size",
    facts: {
      source,
      group: self.industry || self.sector || null,
      self: {
        ...peerRow(self),
        pe_vs_own_history: history
          ? { percentile_0_to_100: round(self.pe_hist_pctile, 0), own_median_pe: round(self.pe_hist_median, 1), history_from: self.pe_hist_from ?? null, history_to: self.pe_hist_to ?? null }
          : null,
        analysts_buy_pct: round(self.buy_pct, 0),
        analyst_count: num(self.analyst_count),
        short_float_pct: round(self.short_float, 1),
        institutional_ownership_pct: round(self.inst_own, 0),
        beta: round(self.beta, 2),
        volatility_90d_pct: round(self.vol_90d, 0),
        below_52w_high_pct: round(self.from_hi_pct, 1),
        next_earnings: self.earnings_date ?? null,
      },
      peers: peers.map(peerRow),
      peer_medians: medians,
      units: "Margins, growth, yields and returns are percentages; multiples are times.",
    },
  };
};

/* ── 9. the last 30 days of news ─────────────────────────────────────────── */

export const loadNews: StepLoader = async (ctx) => {
  const [storedRead, wireRead] = await Promise.allSettled([getNewsForTicker("US", ctx.ticker, { days: 30, limit: 40 }), loadTickerNews(ctx.ticker, 20)]);
  if (storedRead.status === "rejected" && wireRead.status === "rejected") throw storedRead.reason;
  const stored = storedRead.status === "fulfilled" ? storedRead.value : [];
  const wire = wireRead.status === "fulfilled" ? wireRead.value : [];
  const cutoff = ctx.now.getTime() - 30 * 86400000;
  const seen = new Set<string>();
  const items = [
    ...stored.map((row) => ({ title: row.title, url: row.url, source: row.source_name, published_at: row.published_at, summary: row.summary, tone: row.sentiment_label })),
    ...wire.map((row) => ({ title: row.title, url: row.url, source: row.source, published_at: row.published_at, summary: row.summary ?? "", tone: null as string | null })),
  ]
    .filter((row) => row.title && /^https?:\/\//.test(row.url) && Date.parse(row.published_at) >= cutoff)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .filter((row) => {
      const key = row.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 70);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
  if (items.length === 0) {
    // One feed answered empty while the other failed: that is not "no news".
    if (storedRead.status === "rejected" || wireRead.status === "rejected") throw new Error("news_partly_unread");
    return { status: "empty", detail: "No stories in the last 30 days.", facts: null, missing: ["We found no news stories about this company in the last 30 days."] };
  }
  const tones = items.reduce<Record<string, number>>((acc, row) => (row.tone ? { ...acc, [row.tone]: (acc[row.tone] ?? 0) + 1 } : acc), {});
  return {
    status: "done",
    detail: `${items.length} stor${items.length === 1 ? "y" : "ies"}, the newest ${day(items[0]!.published_at)}`,
    facts: {
      stories: items.map((row) => ({
        source: ctx.book.cite({ label: `${row.source}: ${row.title}`, url: row.url, kind: "news", as_of: row.published_at }),
        date: row.published_at.slice(0, 10),
        publisher: row.source,
        title: text(row.title, 200),
        excerpt: text(row.summary, 260),
        tone: row.tone,
      })),
      tone_counts: tones,
    },
  };
};

/* ── 10. Reddit and policy posts ─────────────────────────────────────────── */

/** A thread's address on reddit.com. A bare permalink ("/r/x/comments/...") would otherwise open on our own site. */
function redditUrl(post: { url?: string | null; permalink?: string | null }): string | null {
  const url = post.url?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  const link = post.permalink?.trim();
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return `https://www.reddit.com${link.startsWith("/") ? "" : "/"}${link}`;
}

export const loadSocial: StepLoader = async (ctx) => {
  const [redditRead, policyRead] = await Promise.allSettled([getRedditContextForTicker("US", ctx.ticker), loadPolicy()]);
  if (redditRead.status === "rejected" && policyRead.status === "rejected") throw redditRead.reason;
  const reddit = redditRead.status === "fulfilled" ? redditRead.value : null;
  const policy = policyRead.status === "fulfilled" ? policyRead.value : null;
  const cutoff = new Date(ctx.now.getTime() - 60 * 86400000).toISOString();
  const posts = (policy?.posts ?? []).filter((post) => post.publishedAt >= cutoff && post.names.some((name) => name.ticker === ctx.ticker)).slice(0, 5);
  const redditUseful = reddit && (reddit.cue.mention_count > 0 || reddit.top_posts.length > 0);
  if (!redditUseful && posts.length === 0) return { status: "empty", detail: "No Reddit threads or policy posts name it.", facts: null };
  const redditSource = redditUseful
    ? ctx.book.cite({ label: `Reddit scan of investing subreddits mentioning ${ctx.ticker}`, url: `/signals#reddit`, kind: "social", as_of: reddit!.generated_at || null })
    : null;
  return {
    status: "done",
    detail: [redditUseful ? `${reddit!.cue.mention_count} Reddit mentions` : null, posts.length ? `${posts.length} policy post${posts.length === 1 ? "" : "s"}` : null].filter(Boolean).join(", "),
    facts: {
      reddit: redditUseful && redditSource
        ? {
            source: redditSource,
            mentions: reddit!.cue.mention_count,
            lean: reddit!.cue.sentiment,
            summary: text(reddit!.cue.summary, 400),
            catalysts: (reddit!.cue.catalysts ?? []).slice(0, 4),
            threads: reddit!.top_posts.slice(0, 4).map((post) => ({
              source: redditUrl(post) ? ctx.book.cite({ label: `r/${post.subreddit}: ${post.title}`, url: redditUrl(post), kind: "social", as_of: post.published ?? null }) : redditSource,
              subreddit: post.subreddit,
              title: text(post.title, 200),
            })),
          }
        : null,
      policy_posts: posts.map((post) => ({
        source: ctx.book.cite({ label: `Policy post, ${day(post.publishedAt)}: ${post.summary}`, url: post.url, kind: "social", as_of: post.publishedAt }),
        date: post.publishedAt.slice(0, 10),
        summary: text(post.summary, 300),
        lean: post.stance,
        stock_move_since_pct: round(post.names.find((name) => name.ticker === ctx.ticker)?.since?.pct, 1),
      })),
    },
  };
};

export const STEP_LOADERS: Partial<Record<ResearchStepId, StepLoader>> = {
  brief: loadBrief,
  financials: loadFinancials,
  earnings: loadEarnings,
  annual: loadAnnual,
  quarterly: loadQuarterly,
  filings: loadFilings,
  ownership: loadOwnership,
  peers: loadPeers,
  news: loadNews,
  social: loadSocial,
};
