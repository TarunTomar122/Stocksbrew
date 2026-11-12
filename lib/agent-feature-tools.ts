import {
  AGENT_ACCESS_VERSION,
  AGENT_DATA_NOTICE,
  publicAppUrl,
} from "@/lib/agent-access-config";
import { AgentDataError } from "@/lib/agent-errors";
import { MAX_JOBS_PER_USER, hiddenTemplateIds } from "@/lib/agent-jobs";
import { listJobs } from "@/lib/agent-jobs-data";
import { consumePlainParse } from "@/lib/agents-plain/limits";
import { plainModelReader } from "@/lib/agents-plain/model";
import { MAX_REQUEST_CHARS, parseByRules, parsePlainRequest, type CallLookup } from "@/lib/agents-plain/parse";
import { sameJob } from "@/lib/agents-plain/save";
import { plainCallLookup, plainCatalog } from "@/lib/agents-plain/server";
import {
  COPY_HUB_PATH,
  COPY_LIMITS,
  buildCopyRead,
  buildHubRead,
  copyHref,
  copyVerdict,
  getCopyHub,
  getCopyRecord,
  holdSentence,
  isFullRecord,
  rankRows,
  whoLine,
  type CopyHub,
  type CopyHubRow,
  type CopyKind,
  type CopyPosition,
  type CopyRecord,
  type CopyStats,
} from "@/lib/copy-trades";
import { buildDividendRead, monthName, type PlannedPayment } from "@/lib/dividend-plan";
import { holdingSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { limitFor } from "@/lib/entitlements";
import { viewerFromUserDoc } from "@/lib/entitlements-server";
import { isValidSourceSlug } from "@/lib/follow-shared";
import { freshnessInfo } from "@/lib/freshness";
import type { TheRead } from "@/lib/insights";
import { episodeSentence, episodeTitle, type HoldingMove } from "@/lib/stress-test";
import { loadUserStress } from "@/lib/stress-test-data";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";
import { xrayFootnote } from "@/lib/xray";
import { loadUserXray } from "@/lib/xray-data";

/**
 * Agent tools over the portfolio features (x-ray, dividends, stress test),
 * the copy tests and the plain-English agent reader. Each one is a thin
 * wrapper: it calls the loader the page calls, with the signed-in member's
 * own user document, and returns the same numbers and the same sentences the
 * page shows, plus sources, dates and a link. Nothing here computes a figure.
 *
 * Scope checks and the daily allowance happen in executeAgentTool before any
 * of these run; agent access itself is Pro only (requireAgentPrincipal).
 */

/** How old each kind of data can get before an agent should say so. */
const FRESHNESS = {
  /** Quotes and daily closes. */
  prices: { agingHours: 36, staleHours: 84 },
  /** The copy job runs weekly. */
  weekly: { agingHours: 8 * 24, staleHours: 15 * 24 },
  /** Fund holdings come from quarterly N-PORT filings, published about 60 days after the quarter, so five months old is normal. */
  filings: { agingHours: 165 * 24, staleHours: 260 * 24 },
} as const;

function envelope<T extends Record<string, unknown>>(
  data: T,
  asOf: string | null,
  thresholds: { agingHours: number; staleHours: number },
) {
  const freshness = freshnessInfo(asOf, thresholds);
  return {
    schema_version: AGENT_ACCESS_VERSION,
    as_of: asOf,
    freshness: {
      status: freshness.status,
      age_hours: freshness.ageHours === null ? null : Math.round(freshness.ageHours * 10) / 10,
      relative: freshness.relative || null,
    },
    notice: AGENT_DATA_NOTICE,
    ...data,
  };
}

function link(path: string): string {
  return `${publicAppUrl()}${path}`;
}

const round = (value: number | null | undefined, digits = 2): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null;

/** The page's read as plain JSON: the headline, then each insight's sentence. */
function readOut(read: TheRead | null | undefined, source?: string | null) {
  if (!read) return null;
  return {
    headline: read.headline,
    insights: read.insights.map((insight) => ({
      tone: insight.tone,
      text: insight.text,
      so_what: insight.soWhat ?? null,
      tickers: insight.tickers ?? [],
    })),
    source: source ?? read.source ?? null,
  };
}

async function memberDoc(uid: string): Promise<UserDoc | null> {
  try {
    return await getUserDoc(uid);
  } catch (error) {
    console.error("agent_feature_user_read_failed", error instanceof Error ? error.message : "unknown");
    throw new AgentDataError("Your holdings could not be read just now. Try again in a minute.", "portfolio_unavailable", 503);
  }
}

function markedHoldings(userDoc: UserDoc | null): { total: number; us: number } {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const held = tracked.filter((id) => userDoc?.watchlist_positions?.[id] === "holding");
  return { total: held.length, us: held.filter((id) => id.startsWith("US_")).length };
}

/** The same reasons the pages give when they fall back to the example portfolio. */
function noHoldings(userDoc: UserDoc | null, feature: string, path: string) {
  const marked = markedHoldings(userDoc);
  const message = marked.total > 0 && marked.us === 0
    ? `${feature} covers US stocks and funds, and none of your holdings is one yet.`
    : "You have no holdings marked yet. Mark the stocks you own in Portfolio, with share counts, and ask again.";
  return {
    data_status: "no_holdings",
    message,
    edit_link: link("/portfolio"),
    link: link(path),
  };
}

/* ── what_you_own ─────────────────────────────────────────────────────── */

export async function getAgentWhatYouOwn(uid: string, input: { limit?: number } = {}) {
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit || 15)));
  const userDoc = await memberDoc(uid);
  const view = await loadUserXray(userDoc);
  if (!view) return envelope(noHoldings(userDoc, "The analysis", "/portfolio/xray"), null, FRESHNESS.prices);
  const { xray } = view;
  const footnote = xrayFootnote(xray);
  // The same reasons the page gives (emptyReason in app/(app)/portfolio/xray/page.tsx).
  const status = xray.total <= 0
    ? xray.unvalued.length > 0 ? "no_values" : "no_holdings"
    : xray.funds.length === 0 ? "no_funds" : "available";
  const message = status === "no_values"
    ? "None of your holdings has a share count or value yet, so there is nothing to weigh. Add share counts in Portfolio."
    : status === "no_holdings"
      ? "You have no holdings with a value yet. Mark the stocks you own in Portfolio, with share counts, and ask again."
      : status === "no_funds"
        ? "None of your holdings is a fund, so this is only the stocks you bought directly."
        : null;
  return envelope({
    data_status: status,
    message,
    units: "Dollar values at the latest quote; every *_pct field is a percent of the valued portfolio (0 to 100).",
    read: readOut(view.read, footnote),
    totals: {
      value: round(xray.total),
      direct_value: round(xray.directValue),
      through_funds_value: round(xray.fundValue),
      unplaced_fund_value: round(xray.unplacedValue),
      closed_fund_value: round(xray.closedFundValue),
      unclassified_sector_value: round(xray.unclassifiedValue),
      biggest_direct_pct: round(xray.maxDirectPct),
    },
    companies_count: xray.companies.length,
    companies: xray.companies.slice(0, limit).map((company) => ({
      ticker: company.ticker,
      classes: company.classes,
      name: company.name,
      sector: company.sector,
      value: round(company.total),
      pct: round(company.pct),
      direct_pct: round(company.directPct),
      through_funds_pct: round(company.fundPct),
      via_funds: company.via.map((slice) => ({ fund: slice.fund, value: round(slice.value) })),
    })),
    sectors: xray.sectors.map((sector) => ({
      sector: sector.sector,
      pct: round(sector.pct),
      direct_value: round(sector.direct),
      through_funds_value: round(sector.viaFunds),
      sp500_pct: round(sector.benchmarkPct),
    })),
    funds: xray.funds.map((fund) => ({
      ticker: fund.ticker,
      name: fund.fundName,
      pct: round(fund.pct),
      status: fund.status,
      note: fund.note,
      holdings_as_of: fund.asOf,
      filing_url: fund.sourceUrl,
      top: fund.top.slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, weight_pct: round(row.weightPct) })),
    })),
    overlaps: xray.overlaps.map((overlap) => ({
      funds: [overlap.a, overlap.b],
      overlap_pct: round(overlap.pct),
      shared_companies: overlap.shared,
      top_shared: overlap.top.map((row) => row.ticker),
    })),
    unvalued: xray.unvalued,
    sources: [
      { name: footnote, as_of: xray.asOfDates },
      { name: "Latest quotes, else the last stored close", as_of: null },
    ],
    link: link("/portfolio/xray"),
  // The oldest filing, so one stale fund is not hidden behind a fresh one. Without funds there is no filing date.
  }, xray.asOfDates[0] ?? null, FRESHNESS.filings);
}

/* ── dividend_plan ────────────────────────────────────────────────────── */

function paymentOut(payment: PlannedPayment) {
  return {
    ex_date: payment.exDate,
    pay_date: payment.payDate,
    pay_date_known: payment.payDateKnown,
    per_share: round(payment.perShare, 4),
    amount: round(payment.amount),
    status: payment.status === "confirmed" ? "announced" : "estimate",
    special: payment.special,
    paid: payment.paid,
  };
}

export async function getAgentDividendPlan(uid: string, input: { payments?: boolean } = {}) {
  const userDoc = await memberDoc(uid);
  const seeds = holdingSeeds(userDoc);
  if (seeds.length === 0) return envelope(noHoldings(userDoc, "The dividend planner", "/portfolio/dividends"), null, FRESHNESS.prices);
  const { plan, pricesAsOf, calendarOk } = await loadDividendPlan(seeds);
  const read = buildDividendRead(plan, { example: false, editHref: "/portfolio" });
  const noShares = plan.stocks.length > 0 && plan.stocks.every((stock) => stock.shares === null);
  return envelope({
    data_status: noShares ? "no_shares" : "available",
    message: noShares
      ? "None of your holdings has a share count, so the dollar totals are empty. Per-share dividends and dates are still listed. Add share counts in Portfolio."
      : null,
    units: "Dollars for amounts and income; yields, payout and change are percents. \"announced\" payments are on the dividend calendar; \"estimate\" ones repeat the stock's last year of payments.",
    read: readOut(read, "Yahoo Finance and Nasdaq"),
    warning: calendarOk ? null : "The dividend calendar could not be read just now, so announced payments may be shown as estimates.",
    today: plan.today,
    totals: {
      next_12_months: round(plan.total),
      announced: round(plan.confirmed),
      estimated: round(plan.estimated),
      market_value: round(plan.marketValue),
      cost_basis: round(plan.costBasis),
      // The yearly income from the holdings that have both a cost and a price, the base of yield on cost.
      income_from_holdings_with_cost: round(plan.incomeOnCost),
    },
    missing_shares: plan.missingShares,
    months: plan.months.map((month) => ({
      month: month.month,
      label: monthName(month.month),
      announced: round(month.confirmed),
      estimated: round(month.estimated),
      total: round(month.total),
      tickers: month.tickers,
    })),
    stocks: plan.stocks.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      shares: stock.shares,
      status: stock.status,
      frequency: stock.frequency,
      income: round(stock.income),
      announced_income: round(stock.confirmedIncome),
      per_share: round(stock.perShare, 4),
      yield_on_price_pct: round(stock.yieldOnPrice),
      yield_on_cost_pct: round(stock.yieldOnCost),
      payout_pct: round(stock.payout),
      payout_at_risk: stock.atRisk,
      change_vs_year_ago_pct: round(stock.changePct),
      last_ex_date: stock.lastExDate,
      next: stock.next ? paymentOut(stock.next) : null,
      ...(input.payments ? { payments: stock.payments.map(paymentOut) } : {}),
    })),
    sources: [
      { name: "Past payments: Yahoo Finance", as_of: plan.asOf },
      { name: "Announced dividends: Nasdaq dividend calendar", as_of: null },
      { name: "Last close, for yields", as_of: pricesAsOf },
    ],
    link: link("/portfolio/dividends"),
  }, plan.asOf ?? pricesAsOf, FRESHNESS.prices);
}

/* ── stress_test ──────────────────────────────────────────────────────── */

function moveOut(move: HoldingMove | null) {
  if (!move) return null;
  return {
    ticker: move.ticker,
    name: move.name,
    weight_pct: round(move.weight),
    status: move.status,
    pct: round(move.pct),
    contribution_points: round(move.contribution),
    first_close: move.firstDate,
    fund: move.fund,
  };
}

export async function getAgentStressTest(uid: string, input: { holdings?: boolean } = {}) {
  const userDoc = await memberDoc(uid);
  const view = await loadUserStress(userDoc);
  if (!view) return envelope(noHoldings(userDoc, "The crash replay", "/portfolio/xray#crashes"), null, FRESHNESS.prices);
  const { result } = view;
  const notes = [
    "Each holding is held at your weights today from the first close of an episode to its last, and the S&P 500 is SPY over the same closes.",
    "You picked these stocks knowing how they have done since, so a past episode can flatter them.",
    "It is history, not a forecast.",
  ];
  if (result.basis === "count") notes.push("None of these holdings has a share count, so each one counts the same.");
  return envelope({
    data_status: "available",
    units: "Every *_pct field is a percent return over the episode; weight_pct is today's weight (0 to 100); contribution_points is percentage points of the portfolio's result.",
    read: readOut(view.read, "Daily closes with dividends, from Yahoo Finance"),
    notes,
    weights_basis: result.basis,
    unvalued: result.unvalued,
    holdings: result.holdings.map((holding) => ({ ticker: holding.ticker, name: holding.name, weight_pct: round(holding.weight) })),
    episodes: result.episodes.map((episode) => ({
      id: episode.episode.id,
      title: episodeTitle(episode.episode),
      kind: episode.episode.kind,
      start: episode.episode.start,
      end: episode.episode.end,
      what_happened: episode.episode.what,
      portfolio_pct: round(episode.portfolio),
      sp500_pct: round(episode.market),
      covered_pct: round(episode.covered),
      ratio_to_sp500: round(episode.ratio),
      sentence: episodeSentence(episode, "your portfolio"),
      driver: moveOut(episode.driver),
      stock_driver: moveOut(episode.stockDriver),
      worst: moveOut(episode.worst),
      best: moveOut(episode.best),
      ...(input.holdings ? { moves: episode.moves.map(moveOut) } : {}),
    })),
    sources: [{ name: "Daily closes with dividends, from Yahoo Finance", as_of: view.history.last, from: view.history.first }],
    link: link("/portfolio/xray#crashes"),
  }, view.history.last, FRESHNESS.prices);
}

/* ── copy_test ────────────────────────────────────────────────────────── */

function statsOut(stats: CopyStats | null) {
  if (!stats) return null;
  return {
    end_value: round(stats.end_value),
    total: round(stats.total, 4),
    annualized: round(stats.annualized, 4),
    max_drawdown: round(stats.max_drawdown, 4),
    drawdown_peak: stats.drawdown_peak,
    drawdown_trough: stats.drawdown_trough,
  };
}

function positionOut(position: CopyPosition | null) {
  if (!position) return null;
  return {
    ticker: position.ticker,
    name: position.name,
    pnl: round(position.pnl),
    stock_return: round(position.return, 4),
    first: position.first,
    last: position.last,
    held_now: position.held,
  };
}

function sourceName(kind: CopyKind): string {
  return kind === "fund" ? "SEC 13F filings" : "House Clerk periodic transaction reports";
}

function rowOut(row: CopyHubRow) {
  return {
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    who: whoLine(row),
    rank: row.rank,
    start_date: row.start_date,
    end_date: row.end_date,
    ended: row.ended ?? false,
    excess_per_year: round(row.excess_per_year, 4),
    copy_total: round(row.copy_total, 4),
    copy_annualized: round(row.copy_annualized, 4),
    sp500_total: round(row.spy_total, 4),
    sp500_annualized: round(row.spy_annualized, 4),
    max_drawdown: round(row.max_drawdown, 4),
    trades: row.trades,
    not_ranked_because: row.not_ranked_because,
    link: link(copyHref(row.slug)),
  };
}

const YEARLY_NAMES: Record<string, string> = { copy: "copy", spy: "sp500", hold: "not_trading" };

const COPY_UNITS = "Returns, excess_per_year and drawdowns are fractions (0.12 is 12%). end_value is what $10,000 became. A historical test on paper, before costs and taxes; the future can differ.";

function recordOut(record: CopyRecord, hub: CopyHub | null) {
  const base = {
    slug: record.slug,
    kind: record.kind,
    name: record.name,
    who: whoLine(record),
    rule: record.rule,
    caveat: record.caveat,
    limits: COPY_LIMITS[record.kind],
    eligible: record.eligible,
    rank: record.rank ?? null,
    not_ranked_because: record.not_ranked_because,
    link: link(copyHref(record.slug)),
  };
  if (!isFullRecord(record)) {
    return envelope({
      data_status: "empty",
      message: `We could not build a copy of ${record.name}: ${record.not_ranked_because ?? "there is no record"}.`,
      units: COPY_UNITS,
      ...base,
      sources: [{ name: sourceName(record.kind), as_of: record.updated_at ?? null }],
    }, record.updated_at ?? hub?.generated_at ?? null, FRESHNESS.weekly);
  }
  const read = buildCopyRead(record);
  const verdict = copyVerdict(record);
  const columns = record.curve_columns.slice(1);
  return envelope({
    data_status: "available",
    units: COPY_UNITS,
    ...base,
    read: readOut(read),
    verdict: verdict ? { headline: verdict.headline, detail: verdict.detail, span: verdict.span } : null,
    versus_not_trading: holdSentence(record),
    start_date: record.start_date,
    end_date: record.end_date,
    stopped: record.stopped ?? false,
    years: round(record.years),
    start_value: record.start_value,
    copy: statsOut(record.copy),
    sp500: statsOut(record.spy),
    not_trading: record.hold ? { label: record.hold_label, ...statsOut(record.hold) } : null,
    excess_per_year: round(record.excess_per_year, 4),
    yearly: record.yearly.map((year) => ({
      year: year.year,
      from: year.from,
      to: year.to,
      // Named like the rest of this answer: copy, sp500, not_trading.
      returns: Object.fromEntries(columns.map((column, index) => [YEARLY_NAMES[column] ?? column, round(year.values[index] ?? null, 4)])),
    })),
    trades: record.trades,
    positions_count: record.positions_count,
    held_now: record.held_now,
    best: record.best.slice(0, 5).map(positionOut),
    worst: record.worst.slice(0, 5).map(positionOut),
    coverage: record.coverage,
    sources: [
      { name: sourceName(record.kind), as_of: record.last_filing ?? record.last_report ?? null },
      { name: record.price_source || "Daily closes", as_of: record.price_as_of ?? record.end_date },
    ],
  }, record.updated_at ?? hub?.generated_at ?? null, FRESHNESS.weekly);
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

/** A missing record is null; a failed read is a 503, never "not found" (the page throws for the same reason). */
async function readRecord(slug: string): Promise<CopyRecord | null> {
  try {
    return await getCopyRecord(slug);
  } catch (error) {
    console.error("agent_copy_record_failed", error instanceof Error ? error.message : "unknown");
    throw new AgentDataError("The copy tests could not be loaded. Try again later.", "copy_tests_unavailable", 503);
  }
}

async function loadHub(): Promise<CopyHub> {
  const hub = await getCopyHub().catch(() => null);
  if (!hub) throw new AgentDataError("The copy tests could not be loaded. Try again later.", "copy_tests_unavailable", 503);
  return hub;
}

export async function getAgentCopyTest(input: { slug?: string; query?: string; kind?: CopyKind; limit?: number }) {
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit || 10)));
  const slug = input.slug?.trim().toLowerCase();
  if (slug) {
    if (!isValidSourceSlug(slug)) throw new AgentDataError("That is not a copy test slug. Use one from a copy_test search.", "invalid_slug");
    const record = await readRecord(slug);
    if (!record) throw new AgentDataError(`No copy test for "${slug}". Search by name instead.`, "copy_test_not_found", 404);
    return recordOut(record, null);
  }

  const hub = await loadHub();
  const query = input.query ? normalize(input.query).slice(0, 100) : "";
  if (query) {
    const rows = hub.rows.filter((row) => !input.kind || row.kind === input.kind);
    const exact = rows.filter((row) => normalize(row.name) === query || normalize(row.person) === query || row.slug === query.replace(/ /g, "-"));
    const words = query.split(" ");
    const partial = rows.filter((row) => {
      const hay = normalize(`${row.name} ${row.person} ${row.slug.replace(/-/g, " ")}`);
      return words.every((word) => hay.includes(word));
    });
    const matches = exact.length > 0 ? exact : partial;
    if (matches.length === 0) {
      throw new AgentDataError(`No fund or House member we copy matches "${input.query!.slice(0, 100)}". Call copy_test with no query for the full list.`, "copy_test_not_found", 404);
    }
    if (matches.length === 1) {
      const record = await readRecord(matches[0]!.slug);
      if (!record) throw new AgentDataError(`The copy test for ${matches[0]!.name} could not be loaded.`, "copy_test_not_found", 404);
      return recordOut(record, hub);
    }
    return envelope({
      data_status: "several_matches",
      message: `${matches.length} records match "${input.query!.slice(0, 100)}". Call copy_test again with one slug.`,
      units: COPY_UNITS,
      matches: matches.slice(0, 20).map(rowOut),
      link: link(COPY_HUB_PATH),
    }, hub.generated_at, FRESHNESS.weekly);
  }

  const kinds: CopyKind[] = input.kind ? [input.kind] : ["fund", "congress"];
  const rankings = Object.fromEntries(kinds.map((kind) => {
    const groups = rankRows(hub.rows, kind);
    return [kind === "fund" ? "funds" : "house_members", {
      ranked_count: groups.ranked.length,
      ranked: groups.ranked.slice(0, limit).map(rowOut),
      not_ranked: { ended: groups.ended.length, too_short: groups.short.length, too_little_to_copy: groups.untested.length },
    }];
  }));
  return envelope({
    data_status: "available",
    units: COPY_UNITS,
    read: readOut(buildHubRead(hub)),
    ranking_rule: "Best first, by how much more the copy made each year than the S&P 500 over the same dates. Records need about two years and must not have ended more than three months ago to be ranked.",
    rules: { fund: hub.fund_rule, congress: hub.congress_rule },
    caveats: { fund: hub.fund_caveat, congress: hub.congress_caveat },
    limits: COPY_LIMITS,
    counts: { funds: hub.funds, house_members: hub.members, ranked_funds: hub.ranked_funds, ranked_members: hub.ranked_members },
    ...rankings,
    sources: [
      { name: "SEC 13F filings and House Clerk periodic transaction reports", as_of: hub.generated_at },
      { name: "Daily closes", as_of: hub.price_as_of },
    ],
    link: link(COPY_HUB_PATH),
  }, hub.generated_at, FRESHNESS.weekly);
}

/* ── watch_in_plain_words ─────────────────────────────────────────────── */

export async function readAgentWatchRequest(uid: string, input: { text: string }) {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) throw new AgentDataError("Say what to watch, like \"tell me if NVDA closes below 150\".", "invalid_request");
  if (text.length > MAX_REQUEST_CHARS) {
    throw new AgentDataError(`Keep it under ${MAX_REQUEST_CHARS} characters. One or two things to watch works best.`, "invalid_request");
  }

  // The same steps as POST /api/agents/parse. Agent access is Pro only, so the Pro meter applies,
  // counted against the same daily allowance as the Agents page.
  const hidden = hiddenTemplateIds();
  const catalog = await plainCatalog();
  const rules = parseByRules(text, catalog, { hidden });
  const reader = rules.confident ? null : plainModelReader();
  const meter = await consumePlainParse("pro", uid, Boolean(reader));
  if (!meter.allowed) throw new AgentDataError("That's a lot of requests for one day. Try again tomorrow.", "plain_parse_limit", 429);
  // Our call on a stock a buy or sell watch names, so the read-back says the real price, as on the Agents page. The
  // member's own plan decides which levels show; their document is read only when such a watch is asked for.
  const callLookup: CallLookup = async (tickers) => plainCallLookup(viewerFromUserDoc(uid, await getUserDoc(uid).catch(() => null)))(tickers);
  const spec = await parsePlainRequest(text, catalog, { hidden, rules, model: meter.model ? reader : null, callLookup });
  const limited = Boolean(reader) && !meter.model ? (meter.reason === "model" ? "model" : "busy") : spec.limited ? "model" : null;

  const jobs = await listJobs(uid).catch(() => null);
  const existing = spec.watches.map((watch) => Boolean(jobs?.some((job) => sameJob(job, watch.draft))));
  const runLimit = limitFor("agents", "pro");

  return envelope({
    data_status: spec.watches.length > 0 ? "understood" : "nothing_to_watch",
    saved: false,
    via: spec.via,
    limited,
    limited_message: limited === "model"
      ? "Today's model reads are used up, so this is the simple reading only and may miss part of the request."
      : limited === "busy"
        ? "The model reader is busy, so this is the simple reading only and may miss part of the request."
        : null,
    lead: spec.lead,
    sentence: spec.sentence,
    watches: spec.watches.map((watch, index) => ({
      line: watch.line,
      full: watch.full,
      note: watch.note,
      already_have: existing[index] ?? false,
      agent: watch.draft,
    })),
    cannot: spec.cannot.map((entry) => ({ code: entry.code, what: entry.what, line: entry.line, suggest: entry.suggest ?? null })),
    stocks: spec.stocks.map((stock) => ({ ticker: stock.ticker, name: stock.name })),
    uses_watchlist: spec.uses_watchlist,
    capacity: jobs
      ? { running: jobs.filter((job) => job.enabled).length, total: jobs.length, run_limit: runLimit, max: MAX_JOBS_PER_USER }
      : null,
    how_to_save: "This only reads the request; nothing is saved. To switch these on, type the same request in the box on the Agents page.",
    link: link("/agents"),
  }, new Date().toISOString(), FRESHNESS.prices);
}
