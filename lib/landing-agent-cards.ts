import { hiddenTemplateIds } from "@/lib/agent-jobs";
import { earningsRequest } from "@/lib/agents-plain/ask-links";
import { parseByRules } from "@/lib/agents-plain/parse";
import { plainCatalog } from "@/lib/agents-plain/server";
import { BASKET_EXAMPLES } from "@/lib/baskets-plain/examples";
import { parseBasketRequest, settleLeftover } from "@/lib/baskets-plain/parse";
import { loadBasket } from "@/lib/baskets-plain/server";
import { isEmptySpec } from "@/lib/baskets-plain/spec";
import { getCopyHub, rankRows } from "@/lib/copy-trades";
import { fmtDollars } from "@/lib/dividend-plan";
import { exampleSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { oneToWatch, sessionWords, whenWords } from "@/lib/earnings-season";
import { loadExampleSeason } from "@/lib/earnings-season-data";
import { INFLATION, replay } from "@/lib/goal/bootstrap";
import { loadExampleGoal } from "@/lib/goal/data";
import { readInputs } from "@/lib/goal/inputs";
import { planOutcome } from "@/lib/goal/plan";
import { moneyWords, spyChanceWords } from "@/lib/goal/read";
import { HINDSIGHT_DISCOUNT, discounted } from "@/lib/goal/series";
import { buildMemo } from "@/lib/memo/build";
import { currentWeek, exampleHoldings, loadShapeFacts, loadSpanEvents, spanOf } from "@/lib/memo/data";
import { BENCHMARK_SYMBOL } from "@/lib/portfolio-data";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { wholeSentences } from "@/lib/plain-copy";
import { newYorkToday } from "@/lib/portfolio-data";
import { countWord } from "@/lib/read-format";
import { sharedCache } from "@/lib/shared-cache";
import { coveredPct, pctWords } from "@/lib/stress-test";
import { loadExampleStress } from "@/lib/stress-test-data";
import { loadExampleXray } from "@/lib/xray-data";

/**
 * The landing's "everything it watches for you" cards: one live finding per
 * tool, each from the tool's own loader on the example portfolio (or the
 * tool's live store), so the landing never says a number its page does not.
 *
 * Every card is cached on its own for every visitor and has its own time
 * limit, so a slow or broken source costs that one card its finding (it
 * falls back to a plain line about what the tool does) and nothing else.
 * Each loader throws when it has nothing to say, so an empty answer is never
 * cached as the site's answer (lib/shared-cache.ts).
 */

export type AgentCardId = "memo" | "xray" | "earnings" | "dividends" | "stress" | "goal" | "copy" | "agents" | "basket";

export type AgentFinding = {
  /** One plain sentence with its number. */
  line: string;
  /** A short second line: the caveat or the evidence behind the number. */
  note: string | null;
  /** What a person typed, for the cards that start from a request in plain words. */
  ask?: string;
};

/** How long one card may take before the landing shows its plain line instead. */
export const CARD_TIMEOUT_MS = 2500;
const REVALIDATE = 30 * 60;

function nothing(id: AgentCardId): never {
  throw new Error(`landing_${id}_empty`);
}

/** "12%" from 10% up, "4.5%" below. */
function share(pct: number): string {
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}


/**
 * The example memo's top line, from the memo's own rules only: never the model that words /portfolio/memo, so
 * the busiest page on the site can never start a model call. Same holdings, closes and facts as the memo page
 * (lib/memo/server.ts builds its example the same way), so the numbers match; only the wording can differ.
 */
async function memoFinding(_day: string): Promise<AgentFinding> {
  const source = await exampleHoldings((ticker) => isFeaturedStockTicker(ticker));
  if (!source) nothing("memo");
  const now = new Date();
  const current = await currentWeek(source.holdings.map((holding) => holding.ticker), now);
  if (!current) nothing("memo");
  const [events, shape] = await Promise.all([
    loadSpanEvents(source.holdings, spanOf([current.week], current.today)),
    loadShapeFacts(source, current.series).catch(() => ({ exposure: null, dividends: [], stress: null })),
  ]);
  const { memo } = buildMemo(
    {
      week: current.week,
      today: current.today,
      subject: source.subject,
      holdings: source.holdings,
      series: current.series,
      benchmark: current.series.get(BENCHMARK_SYMBOL) ?? null,
      ...events,
      ...shape,
    },
    now,
  );
  const top = memo.topLine?.trim();
  if (!top) nothing("memo");
  // The week's figure first. A partial week's "Together, eight of nine holdings..." keeps the next sentence,
  // which names the holding left out and why, so the figure never reads as each holding's.
  const line = wholeSentences(top, top.startsWith("Together,") ? 2 : 1);
  const say = (n: number) => countWord(n).toLowerCase();
  const hurt = memo.hurt.length;
  const look = memo.look.length;
  const parts = [hurt > 0 ? `${say(hurt)} ${hurt === 1 ? "thing that could hurt" : "things that could hurt"}` : null, look > 0 ? `${say(look)} worth a look` : null].filter(Boolean);
  return { line, note: parts.length > 0 ? `The memo also lists ${parts.join(" and ")}.` : null };
}

async function xrayFinding(): Promise<AgentFinding> {
  const view = await loadExampleXray();
  const headline = view?.read?.headline?.trim();
  if (!view || !headline || !view.xray.funds.some((fund) => fund.status === "ok")) nothing("xray");
  // On the landing "this portfolio" needs saying whose.
  return { line: headline.replace(/\bthis portfolio\b/, "the example portfolio"), note: null };
}

async function earningsFinding(day: string): Promise<AgentFinding & { ticker: string | null }> {
  const view = await loadExampleSeason();
  if (!view) nothing("earnings");
  const { season } = view;
  const holdings = season.reporting.filter((stock) => stock.kind === "holding" && stock.next);
  const watch = oneToWatch(holdings);
  if (!watch?.next) nothing("earnings");
  const session = sessionWords(watch.next.session);
  const when = `${whenWords(watch.next.date, season.today || day)}${session ? ` ${session}` : ""}`;
  const weight = watch.weight !== null ? `, and it is ${share(watch.weight)} of the example portfolio` : "";
  const line =
    holdings.length === 1
      ? `${watch.name} reports ${when}, the only one of the example's holdings to report soon${weight}.`
      : `${watch.name}'s report ${when} is the one to watch${weight}.`;
  const note = holdings.length > 1 ? `${countWord(holdings.length)} of the example's holdings report in the next six weeks.` : null;
  return { line, note, ticker: watch.ticker };
}

async function dividendFinding(): Promise<AgentFinding> {
  const seeds = await exampleSeeds();
  if (!seeds || seeds.length === 0) nothing("dividends");
  const { plan, calendarOk } = await loadDividendPlan(seeds);
  // Without the dividend calendar every payment reads as unannounced; the page warns, the landing says nothing.
  if (!calendarOk || !(plan.total > 0)) nothing("dividends");
  // "Paid" only when the calendar gave the pay date, as the dividends page's own headline decides it.
  const paidSoFar = plan.stocks.some((stock) => stock.payments.some((payment) => payment.paid && payment.payDateKnown && payment.amount != null));
  const announced = plan.confirmed >= 0.5 ? `, and ${fmtDollars(plan.confirmed)} of that is already ${paidSoFar ? "announced or paid" : "announced"}` : "";
  return {
    line: `The example portfolio should pay about ${fmtDollars(plan.total)} in dividends over the next twelve months${announced}.`,
    note: plan.confirmed >= 0.5 ? null : "None of it is announced yet, so every month is an estimate.",
  };
}

async function stressFinding(): Promise<AgentFinding> {
  const view = await loadExampleStress();
  const covid = view?.result.episodes.find((item) => item.episode.id === "covid-crash");
  if (!covid || covid.portfolio === null || covid.market === null) nothing("stress");
  const mine = covid.portfolio;
  const market = covid.market;
  const verb = (value: number) => (value < 0 ? "fell" : "rose");
  const line =
    pctWords(mine) === pctWords(market)
      ? `In the Covid crash the example portfolio ${verb(mine)} ${pctWords(mine)}, about as much as the S&P 500.`
      : `In the Covid crash the example portfolio ${verb(mine)} ${pctWords(mine)}, while the S&P 500 ${verb(market)} ${pctWords(market)}.`;
  const covered = coveredPct(covid);
  const others = view!.result.episodes.filter((item) => item.episode.kind === "fall" && item.episode.id !== covid.episode.id && item.portfolio !== null);
  const span =
    others.length > 1
      ? `It replays ${countWord(others.length).toLowerCase()} other falls the same way, from the ${others[0]!.episode.name} to the ${others[others.length - 1]!.episode.name}.`
      : null;
  return { line, note: covered < 100 ? `That counts the ${covered}% of today's holdings that were trading then.` : span };
}

async function goalFinding(): Promise<AgentFinding> {
  const data = await loadExampleGoal();
  const own = data?.mixes.find((mix) => mix.id === "own");
  const spy = data?.mixes.find((mix) => mix.id === "spy") ?? null;
  // Without the S&P 500 there is neither the hindsight discount nor a baseline, so the card says nothing.
  if (!data || !own || !spy) nothing("goal");
  // The planner's own defaults, started from the example's value, with its hindsight discount, as /portfolio/goal opens.
  const start = data.portfolioValue !== null ? Math.round(data.portfolioValue / 100) * 100 : 0;
  const inputs = readInputs({}, start, true);
  const inflation = inputs.real ? INFLATION : 0;
  const series = discounted(own.returns, spy.returns, HINDSIGHT_DISCOUNT);
  const outcome = planOutcome(replay(series, { inflation }), inputs, replay(spy.returns, { inflation }));
  if (inputs.start >= inputs.target) nothing("goal");
  const years = inputs.byAge - inputs.age;
  const odds =
    outcome.chance >= 0.95
      ? "in almost every replay"
      : outcome.chance < 0.05
        ? "in almost no replay"
        : outcome.chance >= 0.45 && outcome.chance < 0.55
          ? "in about half of the replays"
          : `in about ${Math.round(outcome.chance * 10)} of 10 replays`;
  const goal = `${moneyWords(inputs.target)}${inputs.real ? " in today's money" : ""}`;
  const bench = outcome.benchmark ? ` The S&P 500 alone gets there in ${spyChanceWords(outcome.benchmark.chance)}.` : "";
  return {
    line: `Adding ${moneyWords(inputs.monthly)} a month, the example portfolio reaches ${goal} within ${years} years ${odds}.`,
    // The planner's own caveat, said plainly: its stocks were chosen knowing how they did.
    note: `We count only half of how far its stocks beat or trailed the S&P 500, since they were picked with hindsight.${bench}`,
  };
}

async function copyFinding(): Promise<AgentFinding> {
  const hub = await getCopyHub();
  if (!hub) nothing("copy");
  const funds = rankRows(hub.rows, "fund").ranked;
  const members = rankRows(hub.rows, "congress").ranked;
  const total = funds.length + members.length;
  if (total === 0) nothing("copy");
  const beat = [...funds, ...members].filter((row) => (row.excess_per_year ?? 0) > 0).length;
  const line =
    beat * 2 === total
      ? "Copying the funds and House members we follow was a coin toss against simply owning the S&P 500."
      : `Copying most of the funds and House members we follow ${beat * 2 < total ? "would not have beaten" : "would have beaten"} simply owning the S&P 500.`;
  return { line, note: `${beat} of the ${total} we could rank did better.` };
}

async function agentFinding(ticker: string): Promise<AgentFinding> {
  const request = earningsRequest(ticker, 3);
  if (!request) nothing("agents");
  const catalog = await plainCatalog();
  const { spec, confident } = parseByRules(request, catalog, { hidden: hiddenTemplateIds() });
  if (!confident || spec.watches.length === 0 || spec.cannot.length > 0 || !spec.sentence.trim()) nothing("agents");
  return { ask: request, line: spec.sentence.trim(), note: null };
}

/** Fewer matches than this undersells the builder, more says the rule barely narrows anything; the next example is tried. */
const BASKET_MIN = 5;
const BASKET_MAX = 40;

async function basketFinding(): Promise<AgentFinding> {
  // The builder's own examples, in its order: the first that reads fully and finds a fair handful today.
  for (const request of BASKET_EXAMPLES) {
    const parse = settleLeftover(parseBasketRequest(request));
    if (isEmptySpec(parse.spec) || parse.cannot.length > 0 || parse.leftover.length > 0) continue;
    const loaded = await loadBasket({ spec: parse.spec }, "anon", { backtest: false });
    if (!loaded) nothing("basket");
    if (loaded.callDropped) continue;
    const count = loaded.match.members.length;
    if (count < BASKET_MIN || count > BASKET_MAX) continue;
    return {
      ask: request,
      line: `It finds ${count} companies that fit today, and says why each one is in.`,
      note: "Then it tests the basket against the S&P 500.",
    };
  }
  nothing("basket");
}

// One cache entry per card; the day is part of the key where the sentence says "today" or "on Thursday".
const cachedMemo = sharedCache(memoFinding, ["landing-card-memo-v4"], { revalidate: REVALIDATE });
const cachedXray = sharedCache(xrayFinding, ["landing-card-xray-v2"], { revalidate: REVALIDATE });
const cachedEarnings = sharedCache(earningsFinding, ["landing-card-earnings-v2"], { revalidate: REVALIDATE });
const cachedDividends = sharedCache(dividendFinding, ["landing-card-dividends-v3"], { revalidate: REVALIDATE });
const cachedStress = sharedCache(stressFinding, ["landing-card-stress-v2"], { revalidate: 6 * 3600 });
const cachedGoal = sharedCache(goalFinding, ["landing-card-goal-v4"], { revalidate: 6 * 3600 });
const cachedCopy = sharedCache(copyFinding, ["landing-card-copy-v3"], { revalidate: 3600 });
const cachedAgent = sharedCache(agentFinding, ["landing-card-agents-v2"], { revalidate: REVALIDATE });
const cachedBasket = sharedCache(basketFinding, ["landing-card-basket-v3"], { revalidate: REVALIDATE });

/** The agent example asks about the stock the earnings card names, so the two cards tell one story. */
const AGENT_FALLBACK_TICKER = "NVDA";

/**
 * One fill at a time per cache key on this server. Next 13.5's cache does not share a fill between requests
 * that arrive together, so without this every landing visit on an empty cache would start its own loads.
 */
const inflight = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const started = load().finally(() => inflight.delete(key));
  inflight.set(key, started);
  return started;
}

function earnings(day: string) {
  return once(`earnings:${day}`, () => cachedEarnings(day));
}

export function loadAgentFinding(id: AgentCardId): Promise<AgentFinding> {
  const day = newYorkToday();
  switch (id) {
    case "memo":
      return once(`memo:${day}`, () => cachedMemo(day));
    case "xray":
      return once("xray", cachedXray);
    case "earnings":
      return earnings(day);
    case "dividends":
      return once("dividends", cachedDividends);
    case "stress":
      return once("stress", cachedStress);
    case "goal":
      return once("goal", cachedGoal);
    case "copy":
      return once("copy", cachedCopy);
    case "agents":
      return earnings(day)
        .then((found) => found.ticker ?? AGENT_FALLBACK_TICKER)
        .catch(() => AGENT_FALLBACK_TICKER)
        .then((ticker) => once(`agents:${ticker}`, () => cachedAgent(ticker)));
    case "basket":
      return once("basket", cachedBasket);
  }
}

/** A card's finding, or null when it failed or ran past `ms`; the work keeps going and fills the cache for the next visitor. */
export function findingWithin(id: AgentCardId, ms = CARD_TIMEOUT_MS): Promise<AgentFinding | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[landing] ${id} card took longer than ${ms}ms; showing its plain line`);
      resolve(null);
    }, ms);
  });
  const done = loadAgentFinding(id).catch((error) => {
    console.warn(`[landing] ${id} card failed:`, error instanceof Error ? error.message : error);
    return null;
  });
  return Promise.race([done, slow]).finally(() => clearTimeout(timer));
}
