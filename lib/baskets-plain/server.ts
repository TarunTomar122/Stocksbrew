import { headers } from "next/headers";

import { loadPriceSeries, PRICE_SOURCE } from "@/lib/backtest";
import { thinCurve, type ChartCurve } from "@/lib/backtest/chart";
import { BacktestError, runWeightsBacktest } from "@/lib/backtest/engine";
import type { Caveat, WeightsResult } from "@/lib/backtest/types";
import { can, type Plan } from "@/lib/entitlements";
import type { Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import type { TheRead } from "@/lib/insights";
import { getLiveInvestmentThemes } from "@/lib/research-themes";
import { getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import { loadUniverseCatalog } from "@/lib/universe-catalog";

import { anonymousBasketSubject, consumeBasketParse } from "./limits";
import { BASKET_SHOWN, matchBasket, type BasketMatch } from "./match";
import { basketModelReader } from "./model";
import { cannotLine, mergeModelParse, parseBasketRequest, settleLeftover, type BasketCannot, type BasketParse } from "./parse";
import { buildBasketRead, pickBacktestMembers, type BacktestPick, type BacktestSummary } from "./read";
import { SLUG_PATTERN, isEmptySpec, normalizeSpec, specSentence, specSlug, specTitle, usesCall, withoutCall, type BasketSpec } from "./spec";
import { TOPIC_BY_ID, type ThemeLine } from "./topics";

/**
 * The server half of plain-English baskets: read a request (rules, then a
 * metered model read for leftovers), store the spec under a stable slug in
 * `tm_baskets_plain`, and load a stored basket with its matches, backtest
 * and read.
 *
 * Only the spec is stored, never the matches: a basket is a rule, so the
 * list is rebuilt from today's snapshot every time it is opened.
 */

export const BASKETS_COLLECTION = "tm_baskets_plain";
export const BASKET_BENCHMARK = "SPY";
const BACKTEST_COST_BPS = 10;

export type StoredBasket = {
  slug: string;
  spec: BasketSpec;
  title: string;
  sentence: string;
  via: "rules" | "model";
  created_at: string | null;
};

export async function readStoredBasket(slug: string): Promise<StoredBasket | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const doc = await adminFirestore.collection(BASKETS_COLLECTION).doc(slug).get();
  if (!doc.exists) return null;
  const data = doc.data() as Record<string, unknown>;
  const spec = normalizeSpec(data.spec);
  if (isEmptySpec(spec)) return null;
  return {
    slug,
    spec,
    title: specTitle(spec),
    sentence: specSentence(spec),
    via: data.via === "model" ? "model" : "rules",
    created_at: typeof data.created_at === "string" ? data.created_at : null,
  };
}

/**
 * Store the spec under its slug. Only the spec: never the words someone typed, so a shared basket cannot show
 * one person's request (or text planted in it) to everyone who opens the same rule.
 */
async function storeBasket(parse: BasketParse): Promise<string> {
  const slug = specSlug(parse.spec);
  const ref = adminFirestore.collection(BASKETS_COLLECTION).doc(slug);
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, { slug, spec: parse.spec, via: parse.via, created_at: new Date().toISOString() });
  });
  return slug;
}

export type BuildOutcome =
  | { ok: true; slug: string; parse: BasketParse }
  | { ok: false; reason: "empty" | "limit" | "unavailable"; parse: BasketParse | null; message: string };

function meterSubject(viewer: Viewer): string {
  if (viewer.uid) return viewer.uid;
  const store = headers();
  return anonymousBasketSubject(store.get("x-forwarded-for"), store.get("x-real-ip"));
}

/** Text in, a stored basket out. Rules first; a model reads the leftovers only when one is set up and the meter allows. */
export async function buildBasketFromText(text: string, viewer: Viewer): Promise<BuildOutcome> {
  let parse = parseBasketRequest(text);
  const reader = parse.leftover.length > 0 ? basketModelReader() : null;
  const meter = await consumeBasketParse(viewer.plan, meterSubject(viewer), reader !== null);
  if (!meter.allowed) {
    return { ok: false, reason: "limit", parse, message: "That is a lot of baskets for one day. The count resets at midnight UTC, and every basket you already built still opens." };
  }
  if (reader && meter.model) {
    try {
      parse = mergeModelParse(parse, await reader(parse.input, parse.leftover));
    } catch (error) {
      console.error("plain basket model read failed", error instanceof Error ? error.message : "unknown");
    }
  }
  parse = settleLeftover(parse);
  if (isEmptySpec(parse.spec)) {
    return { ok: false, reason: "empty", parse, message: "I couldn't turn that into a rule we can screen on." };
  }
  try {
    return { ok: true, slug: await storeBasket(parse), parse };
  } catch (error) {
    console.error("plain basket store failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, reason: "unavailable", parse, message: "I read the request but could not save the basket just now. Try again in a minute." };
  }
}

/* ── loading a basket ───────────────────────────────────────────────────── */

async function themeLines(): Promise<Map<string, ThemeLine[]>> {
  const themes = await getLiveInvestmentThemes().catch(() => []);
  const out = new Map<string, ThemeLine[]>();
  for (const theme of themes) {
    for (const candidate of [...theme.candidates, ...theme.watchlist]) {
      const ticker = candidate.ticker.trim().toUpperCase();
      const line: ThemeLine = { slug: theme.slug, theme: theme.name, role: candidate.role, text: candidate.benefitMechanism };
      out.set(ticker, [...(out.get(ticker) ?? []), line]);
    }
  }
  return out;
}

async function catalogIndustries(): Promise<Map<string, string>> {
  const catalog = await loadUniverseCatalog().catch(() => ({}) as Awaited<ReturnType<typeof loadUniverseCatalog>>);
  const out = new Map<string, string>();
  for (const row of catalog.markets?.US?.instruments ?? []) {
    if (row.ticker && row.industry) out.set(row.ticker.toUpperCase(), row.industry);
  }
  return out;
}

export type BasketBacktest = {
  result: Omit<WeightsResult, "curve"> & { curve: ChartCurve };
  pick: BacktestPick;
  summary: BacktestSummary;
  source: string;
};

const TODAYS_LIST: Caveat = {
  id: "todays_list",
  title: "Today's list, applied to the past",
  text: "The rule picked these companies with today's numbers: today's company values, growth, dividends, prices and industry labels. Run on past prices, the test holds every company that went on to fit and none that failed, were bought out or stopped fitting along the way. That survivorship and look-ahead flatter the result, the return most of all.",
};

/** Equal amounts in each member, reset monthly, against SPY, over the longest window most members share. */
export async function runBasketBacktest(symbols: string[]): Promise<BasketBacktest | null> {
  if (symbols.length < 2) return null;
  const prices = await loadPriceSeries([...symbols, BASKET_BENCHMARK]).catch(() => null);
  if (!prices || !prices[BASKET_BENCHMARK]) return null;
  const firsts = new Map(symbols.map((symbol) => [symbol, prices[symbol]?.dates[0] ?? null] as const));
  const pick = pickBacktestMembers(firsts);
  if (!pick.start || pick.included.length < 2) return null;
  try {
    const result = runWeightsBacktest(
      {
        holdings: pick.included.map((symbol) => ({ symbol, weight: 1 })),
        start: pick.start,
        rebalance: "monthly",
        benchmark: BASKET_BENCHMARK,
        cost_bps: BACKTEST_COST_BPS,
      },
      prices,
    );
    const caveats = [TODAYS_LIST, ...result.caveats.filter((caveat) => caveat.id !== "hindsight_picks")];
    return {
      result: { ...result, caveats, curve: thinCurve(result.curve) },
      pick,
      source: PRICE_SOURCE,
      summary: {
        start: result.period.start,
        end: result.period.end,
        years: result.period.years,
        members: pick.included.length,
        basket: { annual: result.summary.strategy.annualized_return, total: result.summary.strategy.total_return, worst: result.summary.strategy.max_drawdown },
        benchmark: { annual: result.summary.benchmark.annualized_return, total: result.summary.benchmark.total_return, worst: result.summary.benchmark.max_drawdown },
      },
    };
  } catch (error) {
    if (error instanceof BacktestError) return null;
    throw error;
  }
}

export type LoadedBasket = {
  /** The spec this viewer sees: our-call conditions dropped below Pro. */
  spec: BasketSpec;
  sentence: string;
  match: BasketMatch;
  shown: BasketMatch["members"];
  backtest: BasketBacktest | null;
  read: TheRead;
  /** Lines to show under the rule: what the viewer's own request asked for that we could not filter on. */
  cannot: BasketCannot[];
  /** Our-call conditions were dropped because screening by the call is part of Pro. */
  callDropped: boolean;
  asOf: string | null;
  priceTo: string | null;
  benchmarkRow: ScreenerRow | null;
  /** Stocks in today's screen, for "12 of 781". */
  coveredCount: number;
};

function subjectNoun(spec: BasketSpec): string {
  if (spec.topics.length === 1) return (TOPIC_BY_ID.get(spec.topics[0]!)?.noun ?? "companies").toLowerCase();
  return "companies that fit the subject";
}

export async function loadBasket(
  stored: Pick<StoredBasket, "spec">,
  plan: Plan,
  options: { cannot?: BasketCannot[]; backtest?: boolean } = {},
): Promise<LoadedBasket | null> {
  const [snapshot, themes, industries] = await Promise.all([getScreenerSnapshot().catch(() => null), themeLines(), catalogIndustries()]);
  if (!snapshot) return null;
  const cannot = [...(options.cannot ?? [])];
  let spec = stored.spec;
  const callDropped = usesCall(spec) && !can("screener_call_filters", plan);
  if (callDropped) {
    spec = withoutCall(spec);
    cannot.unshift({ code: "call_pro", what: null, line: cannotLine("call_pro", null) });
  }
  const match = matchBasket(spec, { rows: snapshot.rows, themes, industries });
  const shown = match.members.slice(0, BASKET_SHOWN);
  const backtest = options.backtest === false ? null : await runBasketBacktest(shown.map((member) => member.row.symbol)).catch((error) => {
    console.error("plain basket backtest failed", error instanceof Error ? error.message : "unknown");
    return null;
  });
  const read = buildBasketRead({ match, test: backtest?.summary ?? null, subjectNoun: subjectNoun(spec), all: snapshot.rows, asOf: snapshot.meta.generated_at });
  return {
    spec,
    sentence: specSentence(spec),
    match,
    shown,
    backtest,
    read,
    cannot,
    callDropped,
    asOf: snapshot.meta.generated_at,
    priceTo: snapshot.meta.price_history_to ?? null,
    benchmarkRow: snapshot.extras.find((row) => row.symbol === BASKET_BENCHMARK) ?? null,
    coveredCount: snapshot.rows.filter((row) => !row.benchmark && !row.uncovered).length,
  };
}
