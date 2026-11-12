/**
 * Share cards for the portfolio tools, the copy tests, the plain-English
 * baskets and the agents page. Same rules as `lib/og/data.ts`:
 *
 * - The viewer is always anonymous. The portfolio cards draw the example
 *   portfolio (the one a signed-out visitor sees on the page), from the same
 *   loader and read builder the page calls, and say it is the example. No
 *   session is read and nothing of any person's holdings is ever drawn.
 * - Every number comes from stored data at render time; a source that is slow
 *   or empty leaves the card on its words-only version, never a made-up figure.
 *
 * Server only.
 */

import { unstable_cache } from "next/cache";

import { BASKET_EXAMPLES } from "@/lib/baskets-plain/examples";
import { loadBasket, readStoredBasket } from "@/lib/baskets-plain/server";
import { isEmptySpec, specTitle } from "@/lib/baskets-plain/spec";
import { COPY_HUB_PATH, buildCopyRead, buildHubRead, copyHref, fmtDollars, getCopyHub, getCopyRecord, isFullRecord, possessive, whoLine } from "@/lib/copy-trades";
import { buildDividendRead } from "@/lib/dividend-plan";
import { exampleSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { loadExampleSeason } from "@/lib/earnings-season-data";
import { isValidSourceSlug } from "@/lib/follow-shared";
import { PATHS, INFLATION, replay } from "@/lib/goal/bootstrap";
import { loadExampleGoal, type GoalData } from "@/lib/goal/data";
import { inputProblem, readInputs } from "@/lib/goal/inputs";
import { planOutcome } from "@/lib/goal/plan";
import { buildGoalRead } from "@/lib/goal/read";
import { HINDSIGHT_DISCOUNT, discounted } from "@/lib/goal/series";
import type { TheRead } from "@/lib/insights";
import { loadExampleMemo } from "@/lib/memo/server";
import { loadLogos } from "@/lib/og/logos";
import { signedPct, toneOfPct, weekdayOf } from "@/lib/og/pieces";
import { newYorkToday } from "@/lib/portfolio-data";
import { pickNoticed } from "@/lib/portfolio-home/pick";
import { loadExampleIdeas } from "@/lib/portfolio-ideas/server";
import { DEFAULT_RATES } from "@/lib/portfolio-ideas/tax";
import { loadExampleStress } from "@/lib/stress-test-data";
import { loadExampleXray } from "@/lib/xray-data";
import { AGENT_SAMPLE_JOB, parseJobDraft } from "@/lib/agent-jobs";
import { agentMarketDay, replayDraft } from "@/lib/agent-jobs-data";

import { copyRows, within } from "@/lib/og/data";
import { OG_HEADLINE_MAX, ogDayLabel, ogEyebrow, ogFootnote, ogMonthLabel, ogSignedPct, ogStamp, ogThin, ogTone, whole, wholeLines } from "@/lib/og/format";
import type { OgCard, OgLine, OgReadCard, OgRecordCard, OgTextCard } from "@/lib/og/types";
import { PORTFOLIO_OG_TOOLS, type PortfolioOgTool } from "@/lib/og/url";

/** The example loaders read many stored documents on a cold cache; give them longer than a quote card. */
const SLOW_MS = 7000;

/* ── shared ─────────────────────────────────────────────────────────────── */

const EXAMPLE = "Example portfolio";

type ToolPage = { path: string; label: string; title: string; sub: string };

/** Each tool's page, its label on the card, and the words-only card for when its data is not in. */
export const PORTFOLIO_TOOL_PAGES: Record<PortfolioOgTool, ToolPage> = {
  home: {
    path: "/portfolio",
    label: "My stocks",
    title: "What changed in your stocks this week, and what to do about it",
    sub: "The week's moves, the next earnings report and dividend, what your funds really hold, and the trim or tax idea worth a look.",
  },
  memo: {
    path: "/portfolio/memo",
    label: "Weekly memo",
    title: "A short memo on your portfolio every week",
    sub: "How it did against the S&P 500 and why, what changed, what could hurt and what is worth a look.",
  },
  xray: {
    path: "/portfolio/xray",
    label: "Analysis",
    title: "Your funds hold companies too",
    sub: "Add what is inside your ETFs to the stocks you bought, from each fund's own SEC filing.",
  },
  dividends: {
    path: "/portfolio/dividends",
    label: "Dividends",
    title: "What your stocks should pay you in the next twelve months",
    sub: "Announced dividends with their pay dates, kept apart from estimates based on last year's payments.",
  },
  stress: {
    // Printed on the card: the crash replay lives on Analysis now.
    path: "/portfolio/xray",
    label: "Past crashes",
    title: "How your stocks did in real market shocks",
    sub: "The Covid crash, the 2022 rate-hike slide, the 2023 bank scare and the 2025 tariff shock, each against the S&P 500.",
  },
  earnings: {
    path: "/portfolio/earnings",
    label: "Earnings season",
    title: "Every earnings report coming for your stocks",
    sub: "The date and time, the estimate, and how each stock moved after its past reports.",
  },
  goal: {
    path: "/portfolio/goal",
    label: "Goal planner",
    title: "Will your portfolio reach your goal in time?",
    sub: "Thousands of replays of your holdings' real monthly returns, with your monthly savings added.",
  },
  ideas: {
    path: "/portfolio/ideas",
    label: "Rebalancing ideas",
    title: "Where to sell some or buy more in a lopsided portfolio",
    sub: "The tax on each sale, and losses you could sell to save tax with a similar stock to hold meanwhile.",
  },
};

/** The words-only card. `transient` when it stands in for data that was not in, so it is not kept long. */
function toolText(tool: PortfolioOgTool, transient: boolean): OgTextCard {
  const page = PORTFOLIO_TOOL_PAGES[tool];
  return { kind: "text", eyebrow: page.label, path: page.path, title: page.title, sub: page.sub, footnote: null, ...(transient ? { transient } : {}) };
}

/** "Oct 14 to Nov 10", or null when either end is missing (never "null to Nov 10"). */
function spanWords(from: string | null, to: string | null): string | null {
  return from && to ? `${from} to ${to}` : null;
}

/** A read from the example portfolio, labelled as the example on the card. */
function exampleRead(
  tool: PortfolioOgTool,
  read: { headline: string; insights: Array<{ text: string; tone: OgLine["tone"] }> } | null | undefined,
  footnote: string | null,
): OgReadCard | null {
  const headline = whole(read?.headline, OG_HEADLINE_MAX);
  if (!read || !headline) return null;
  const page = PORTFOLIO_TOOL_PAGES[tool];
  return {
    kind: "read",
    eyebrow: ogEyebrow(page.label, EXAMPLE),
    path: page.path,
    headline,
    lines: wholeLines(read.insights),
    footnote,
  };
}

/* ── the portfolio tools ────────────────────────────────────────────────── */

async function memoCard(): Promise<OgCard | null> {
  const data = await within(loadExampleMemo(newYorkToday(), null), SLOW_MS);
  const memo = data?.memo;
  if (!memo || !memo.topLine.trim()) return null;
  const items = [...memo.hurt, ...memo.look, ...memo.changed].filter((item) => item.text.trim());
  // The memo's top line leads when it fits whole; otherwise the week's own result does.
  const headline = whole(memo.topLine, OG_HEADLINE_MAX) ?? whole(memo.week?.text, OG_HEADLINE_MAX);
  if (!headline) return null;
  const card = exampleRead(
    "memo",
    { headline, insights: items },
    ogFootnote(ogDayLabel(memo.monday) ? `Week of ${ogDayLabel(memo.monday)}` : null, ogDayLabel(memo.endDay) ? `closes to ${ogDayLabel(memo.endDay)}` : null),
  );
  // With the page's picture of the week, the card is the same poster as a shared memo: the week's figure, the line
  // against the S&P 500 and who moved it, with their logos.
  const view = memo.view;
  if (!card || !view || typeof view.portfolioPct !== "number" || !Number.isFinite(view.portfolioPct)) return card;
  const short = whole(view.headline, OG_HEADLINE_MAX);
  if (!short) return card;
  const movers = [...view.movers].sort((a, b) => b.points - a.points).slice(0, 6);
  const logos = await loadLogos(movers.map((mover) => mover.ticker));
  const curve = view.curve.length >= 2 ? view.curve : [];
  return {
    ...card,
    headline: short,
    lines: [],
    figure: { value: signedPct(view.portfolioPct), label: memo.complete ? "the example portfolio this week" : "the example portfolio so far this week", tone: toneOfPct(view.portfolioPct) },
    curve:
      curve.length >= 2
        ? {
            title: `${memo.complete ? "The week" : "The week so far"}${curve.every((point) => typeof point.market === "number") ? " against the S&P 500" : ""}`,
            mine: curve.map((point) => point.portfolio),
            market: curve.every((point) => typeof point.market === "number") ? curve.map((point) => point.market as number) : null,
            labels: curve.map((point) => weekdayOf(point.day)),
            mineLabel: "Example",
          }
        : null,
    chips: movers.map((mover) => ({ ticker: mover.ticker, logo: logos[mover.ticker] ?? null, display: signedPct(mover.pct, Math.abs(mover.pct) >= 9.95 ? 0 : 1), tone: toneOfPct(mover.pct) })),
  };
}

async function xrayCard(): Promise<OgCard | null> {
  const view = await within(loadExampleXray(), SLOW_MS);
  if (!view) return null;
  return exampleRead("xray", view.read, ogFootnote("Fund holdings from SEC filings", view.pricesAsOf ? `prices ${ogDayLabel(view.pricesAsOf)}` : null));
}

async function dividendsCard(): Promise<OgCard | null> {
  const seeds = await within(exampleSeeds(), SLOW_MS);
  if (!seeds || seeds.length === 0) return null;
  const data = await within(loadDividendPlan(seeds), SLOW_MS);
  if (!data) return null;
  const read = buildDividendRead(data.plan, { example: true, editHref: "/portfolio" });
  return exampleRead("dividends", read, ogFootnote("Yahoo Finance and Nasdaq", data.plan.asOf ? `as of ${ogStamp(data.plan.asOf)}` : null));
}

async function stressCard(): Promise<OgCard | null> {
  const view = await within(loadExampleStress(), SLOW_MS);
  if (!view) return null;
  return exampleRead("stress", view.read, ogFootnote("Daily closes with dividends", "history, not a forecast"));
}

async function earningsCard(): Promise<OgCard | null> {
  const view = await within(loadExampleSeason(), SLOW_MS);
  if (!view) return null;
  return exampleRead("earnings", view.read, ogFootnote("Nasdaq earnings calendar", view.asOf ? `as of ${ogStamp(view.asOf)}` : null));
}

/**
 * The goal planner's first read, worked out the way the planner does it on
 * the page with no inputs changed (components/goal/planner.tsx): same mix,
 * same hindsight discount, same seeded replays, so the card and the page agree.
 */
export function defaultGoalRead(data: GoalData): TheRead | null {
  const start = data.portfolioValue !== null ? Math.round(data.portfolioValue / 100) * 100 : 0;
  const own = data.mixes.find((mix) => mix.id === "own") ?? null;
  const spy = data.mixes.find((mix) => mix.id === "spy") ?? null;
  const inputs = readInputs({}, start, Boolean(own));
  if (inputProblem(inputs)) return null;
  const mix = data.mixes.find((item) => item.id === inputs.mix) ?? data.mixes[0];
  if (!mix) return null;
  const inflation = inputs.real ? INFLATION : 0;
  const discount = mix.id === "own" && !inputs.full && spy !== null;
  const series = discount && spy ? discounted(mix.returns, spy.returns, HINDSIGHT_DISCOUNT) : mix.returns;
  const spyReplays = spy && mix.id !== "spy" ? replay(spy.returns, { inflation }) : null;
  const outcome = planOutcome(replay(series, { inflation }), inputs, spyReplays);
  const fullFlatters = own?.yearly != null && spy?.yearly != null ? own.yearly > spy.yearly : true;
  return buildGoalRead(outcome, inputs, { example: data.mode === "example", parts: mix.parts, span: data.span, paths: PATHS, fullFlatters });
}

async function goalCard(): Promise<OgCard | null> {
  const data = await within(loadExampleGoal(), SLOW_MS);
  if (!data) return null;
  const read = defaultGoalRead(data);
  // The hindsight-discount sentence explains how the planner counts; the card keeps to what it found (owner rule: no mechanics copy).
  const findings = read ? { ...read, insights: read.insights.filter((insight) => insight.id !== "goal-discount" && insight.id !== "goal-full") } : null;
  return exampleRead("goal", findings, ogFootnote(`${PATHS.toLocaleString("en-US")} replays of past monthly returns`, "not a forecast"));
}

async function ideasCard(): Promise<OgCard | null> {
  const view = await within(loadExampleIdeas(DEFAULT_RATES), SLOW_MS);
  if (!view) return null;
  return exampleRead("ideas", view.read, ogFootnote(view.pricesAsOf ? `Prices and our calls, close of ${ogDayLabel(view.pricesAsOf)}` : "Prices and our calls", "not advice"));
}

/** The overview: what the agent noticed across the example portfolio's tools, as the page picks it. */
async function homeCard(): Promise<OgCard | null> {
  const [memo, xray, season, dividendSeeds, stress, ideas] = await Promise.all([
    // The overview reads the rules-only memo (lib/portfolio-home/server.ts), so the card does too.
    within(loadExampleMemo(newYorkToday(), null, { worded: false }), SLOW_MS),
    within(loadExampleXray(), SLOW_MS),
    within(loadExampleSeason(), SLOW_MS),
    within(exampleSeeds(), SLOW_MS),
    within(loadExampleStress(), SLOW_MS),
    within(loadExampleIdeas(DEFAULT_RATES), SLOW_MS),
  ]);
  const dividendData = dividendSeeds && dividendSeeds.length ? await within(loadDividendPlan(dividendSeeds), SLOW_MS) : null;
  const ready = <T,>(value: T | null | undefined) => (value ? { state: "ready" as const, value } : { state: "empty" as const });
  const noticed = pickNoticed(
    {
      memo: ready(memo),
      xray: ready(xray),
      season: ready(season),
      dividends: ready(dividendData ? { plan: dividendData.plan, read: buildDividendRead(dividendData.plan, { example: true, editHref: "/portfolio" }) } : null),
      stress: ready(stress),
      ideas: ready(ideas),
    },
    "example",
  );
  // The first pick that fits the card whole leads; the next picks are the lines under it.
  const lead = noticed.findIndex((item) => whole(item.text, OG_HEADLINE_MAX));
  if (lead < 0) return null;
  return exampleRead(
    "home",
    { headline: noticed[lead]!.text, insights: noticed.filter((_, index) => index !== lead) },
    "Prices, filings, earnings and dividends",
  );
}

const TOOL_LOADERS: Record<PortfolioOgTool, (() => Promise<OgCard | null>) | null> = {
  home: homeCard,
  memo: memoCard,
  xray: xrayCard,
  dividends: dividendsCard,
  stress: stressCard,
  earnings: earningsCard,
  goal: goalCard,
  ideas: ideasCard,
  // The analyzer works on tickers someone pastes; there is no example finding to draw.
};

export function isPortfolioOgTool(value: string): value is PortfolioOgTool {
  return (PORTFOLIO_OG_TOOLS as readonly string[]).includes(value);
}

export async function portfolioToolCard(tool: PortfolioOgTool): Promise<OgCard> {
  const loader = TOOL_LOADERS[tool];
  const card = loader
    ? await loader().catch((error) => {
        console.error(`og: portfolio ${tool} card failed`, error);
        return null;
      })
    : null;
  return card ?? toolText(tool, loader !== null);
}

/* ── copy tests ─────────────────────────────────────────────────────────── */

/** /follow/copy: how many funds and members beat the S&P 500 when copied. */
export async function copyHubCard(): Promise<OgCard> {
  const hub = await within(getCopyHub(), SLOW_MS);
  const read = buildHubRead(hub);
  const headline = whole(read?.headline, OG_HEADLINE_MAX);
  if (hub && read && headline) {
    return {
      kind: "read",
      eyebrow: ogEyebrow("Copy tests", ogDayLabel(hub.price_as_of)),
      path: COPY_HUB_PATH,
      headline,
      lines: wholeLines(read.insights),
      // The eyebrow carries the prices' date.
      footnote: "A test on paper, before costs and taxes",
    };
  }
  return {
    kind: "text",
    eyebrow: "Copy tests",
    path: COPY_HUB_PATH,
    title: "Whose moves were worth copying?",
    sub: "Every 13F fund and House member we follow, copied from the day each filing went public, against the S&P 500.",
    footnote: null,
    // Only a stand-in when the hub itself was not in; a read too long for the card is the hub's real answer.
    ...(hub ? {} : { transient: true }),
  };
}

/** /follow/<slug>/copy: $10,000 copied from the public filing dates, against the S&P 500. */
export async function copyRecordCard(slug: string): Promise<OgCard | null> {
  if (!isValidSourceSlug(slug)) return null;
  const record = await within(getCopyRecord(slug), SLOW_MS);
  if (!record) return null;
  const path = copyHref(record.slug);
  if (!isFullRecord(record)) {
    // The page exists (noindex) and says there is too little to test; the card says the same instead of showing the home card.
    return {
      kind: "text",
      eyebrow: "Copy test",
      path,
      title: record.name,
      sub: `There is not enough of a record yet to test copying ${possessive(record.name)} ${record.kind === "fund" ? "13F filings" : "reported trades"} against the S&P 500.`,
      footnote: null,
    };
  }
  const read = buildCopyRead(record);
  const from = ogMonthLabel(record.start_date);
  const until = record.stopped ? ogMonthLabel(record.end_date) : null;
  // The page's own headline when it fits the card whole; otherwise the same two figures, said shorter.
  const headline =
    whole(read?.headline, 120) ??
    (from
      ? `$10,000 copied from ${from}${until ? ` until ${until}` : ""} became ${fmtDollars(record.copy.end_value)}. The S&P 500 made it ${fmtDollars(record.spy.end_value)}.`
      : null);
  const chips = record.best
    .map((position) => position.ticker)
    .filter((ticker): ticker is string => Boolean(ticker))
    .slice(0, 5);
  return {
    kind: "record",
    // A running record is dated by its last close; one that stopped says when it ended.
    eyebrow: ogEyebrow(record.kind === "fund" ? "Copy test · 13F" : "Copy test · Congress", until ? `ended ${until}` : ogDayLabel(record.price_as_of ?? record.end_date)),
    path,
    title: record.name,
    subtitle: whoLine(record) || null,
    headline,
    chips,
    chipsLabel: chips.length ? "Best copied positions" : null,
    record: copyRows(record),
    footnote: "A test on paper, not a forecast",
  };
}

/* ── plain-English baskets ──────────────────────────────────────────────── */

/** /baskets/new: the builder, with requests it reads in full. */
export function basketBuilderCard(): OgTextCard {
  return {
    kind: "text",
    eyebrow: "Baskets",
    path: "/baskets/new",
    title: "Describe the stocks you want in your own words",
    sub: "Every company that fits, why each one is in, and a backtest against the S&P 500.",
    chips: BASKET_EXAMPLES.slice(0, 3),
    footnote: null,
  };
}

/**
 * /baskets/<slug>: the saved rule, the companies that fit today and the
 * backtest, for an anonymous viewer (our-call conditions dropped, as the page
 * does below Pro). The title and rule are worded by our rules, never the
 * words someone typed.
 */
export async function basketCard(slug: string): Promise<OgCard | null> {
  const stored = await within(readStoredBasket(slug), 3000);
  if (!stored) return null;
  const loaded = await within(loadBasket(stored, "anon"), SLOW_MS);
  const path = `/baskets/${stored.slug}`;
  if (!loaded || (loaded.callDropped && isEmptySpec(loaded.spec)) || loaded.shown.length === 0) {
    // Without the screen (slow or failed) the words stand in only briefly; a locked or empty basket is its real answer.
    return { kind: "text", eyebrow: "Basket", path, title: stored.title, sub: stored.sentence, footnote: null, ...(loaded ? {} : { transient: true }) };
  }
  const summary = loaded.backtest?.summary ?? null;
  const curve = loaded.backtest?.result.curve ?? null;
  const rows: NonNullable<OgRecordCard["record"]>["rows"] = [];
  if (summary) {
    const perYear = summary.basket.annual !== null && summary.benchmark.annual !== null;
    const mine = perYear ? summary.basket.annual! : summary.basket.total;
    const bench = perYear ? summary.benchmark.annual! : summary.benchmark.total;
    rows.push({ label: perYear ? "Basket, a year" : "Basket", value: ogSignedPct(mine * 100)!, tone: ogTone(mine), big: true });
    rows.push({ label: perYear ? "S&P 500, a year" : "S&P 500", value: ogSignedPct(bench * 100)!, tone: ogTone(bench) });
  }
  return {
    kind: "record",
    eyebrow: ogEyebrow("Basket", `${loaded.match.members.length} ${loaded.match.members.length === 1 ? "company" : "companies"}`),
    path,
    // What an anonymous viewer sees: below Pro the call condition is dropped, and the page titles the rule it ran.
    title: specTitle(loaded.spec),
    subtitle: null,
    headline: whole(loaded.read.headline, 120) ?? whole(loaded.sentence, 120),
    chips: loaded.shown.slice(0, 5).map((member) => member.row.symbol),
    chipsLabel: "Fits today",
    record:
      summary && rows.length
        ? {
            title: "Backtest against the S&P 500",
            rows,
            spark: curve && curve.strategy.length > 1 ? ogThin(curve.strategy) : null,
            benchmark: curve && curve.benchmark.length > 1 ? ogThin(curve.benchmark) : null,
            sparkTone: "flat",
            period: ogFootnote(spanWords(ogMonthLabel(summary.start), ogMonthLabel(summary.end)), "today's list applied to the past"),
          }
        : null,
    // Basket addresses are long, so the footnote stays short enough to show whole beside them.
    footnote: ogFootnote(ogDayLabel(loaded.asOf) ? `Screen of ${ogDayLabel(loaded.asOf)}` : null),
  };
}

/* ── agents ─────────────────────────────────────────────────────────────── */

/** The replay is several store reads; once per market day is enough. Throws on failure so a failure is never cached. */
const sampleReplay = unstable_cache(
  async (_day: string) => {
    const draft = parseJobDraft(AGENT_SAMPLE_JOB);
    if (!draft.ok) throw new Error("og: the agents sample no longer parses");
    return replayDraft(null, draft.draft);
  },
  ["og-agents-sample-replay-v1"],
  { revalidate: 3600 },
);

/** /agents: what the example agent would have told you over the last four weeks. */
export async function agentsCard(): Promise<OgCard | null> {
  const replayed = await within(sampleReplay(agentMarketDay()), SLOW_MS);
  if (!replayed || replayed.sessions === 0) return null;
  const alerts = replayed.runs.filter((run) => run.decision === "notify");
  const count = alerts.length;
  // The list card draws 100 characters of headline; the five stocks are named in the rows and on the page.
  const watched = AGENT_SAMPLE_JOB.scope.tickers.length;
  const watching = `A ${AGENT_SAMPLE_JOB.trigger.pct}% move alert on ${watched === 5 ? "five" : watched} big stocks`;
  const footnote = ogFootnote(spanWords(ogDayLabel(replayed.from), ogDayLabel(replayed.to)), "replayed on real closes");
  if (count === 0) {
    return { kind: "read", eyebrow: ogEyebrow("Agents", "replay"), path: "/agents", headline: `${watching} would have stayed quiet for all ${replayed.sessions} trading days.`, lines: [], footnote };
  }
  const headline = `${watching} would have pinged you on ${count} of the last ${replayed.sessions} trading days.`;
  return {
    kind: "list",
    eyebrow: ogEyebrow("Agents", "replay"),
    path: "/agents",
    headline,
    // The replay lists runs newest first.
    rows: alerts
      .slice(0, 3)
      .map((run) => ({ label: ogDayLabel(run.day) ?? run.day, value: null, tone: "flat" as const, note: run.summary })),
    footnote,
  };
}
