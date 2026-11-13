import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BasketAgentActions } from "@/components/basket-agent/agent-actions";
import { Folded } from "@/components/basket-agent/fold";
import {
  CardRows,
  CompanyCard,
  foldClass,
  foldOf,
  ReplayView,
  RunRecord,
} from "@/components/basket-agent/parts";
import { shortReasons } from "@/lib/basket-agent/short-reasons";
import { reviewedReasons } from "@/lib/basket-agent/start";
import { SignInButton } from "@/components/briefing/sign-in-button";
import { LockCard } from "@/components/oa/gate";
import {
  AppPage,
  barDomain,
  Empty,
  PageHead,
  Panel,
} from "@/components/oa/kit";
import { agentMarketDay } from "@/lib/agent-jobs-data";
import {
  afterCloseDayWords,
  afterCloseTimeEt,
  nextAfterCloseRun,
} from "@/lib/agent-schedule";
import { getSessionUser } from "@/lib/auth-server";
import {
  basketsOverPlan,
  getBasket,
  listBasketRuns,
  listBaskets,
  quotesFor,
  runningAgents,
} from "@/lib/basket-agent/data";
import { listJobs } from "@/lib/agent-jobs-data";
import { basketWaiting } from "@/lib/basket-agent/proposals";
import { listProposals } from "@/lib/proposals-server";
import {
  KIND_WORDS,
  mainKind,
  wordCount,
  type LineStatus,
} from "@/lib/basket-agent/model";
import { dayWords } from "@/lib/day-words";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Idea basket",
  robots: { index: false },
};

type Props = { params: { id: string } };

export default async function BasketAgentPage({ params }: Props) {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Idea basket" />
        <Empty title="Sign in to see your idea basket.">
          <SignInButton label="Sign in" />
        </Empty>
      </AppPage>
    );
  }
  const basket = await getBasket(session.uid, params.id);
  if (!basket) notFound();
  const today = agentMarketDay();
  const tickers = basket.lines.map((line) => line.ticker);
  const now = new Date();
  const [runs, quotes, viewer, running, proposals, all, jobs] =
    await Promise.all([
      listBasketRuns(session.uid, basket.id, 60).catch(() => []),
      quotesFor(tickers),
      getViewer(),
      basket.enabled
        ? Promise.resolve(0)
        : runningAgents(session.uid, basket.id).catch(() => 0),
      listProposals(session.uid).catch(() => []),
      basket.enabled
        ? listBaskets(session.uid).catch(() => [basket])
        : Promise.resolve([basket]),
      basket.enabled
        ? listJobs(session.uid).catch(() => [])
        : Promise.resolve([]),
    ]);
  const limit = limitFor("agents", viewer.plan);
  // On, but past the plan's room (a plan that changed): the nightly run leaves it out, as the runner decides it.
  const pausedByPlan =
    basket.enabled &&
    basketsOverPlan(all, jobs.filter((job) => job.enabled).length, limit).has(
      basket.id,
    );
  // Paused with no room left on the plan, or left out by it: say why, with the plan's own lock card.
  const atLimit = pausedByPlan || (!basket.enabled && running >= limit);
  const latest = runs[0] ?? null;
  // Prices for companies a change would bring in: every stock card shows its price.
  const incoming = (latest?.changes ?? [])
    .map((change) => change.ticker)
    .filter((ticker) => !quotes[ticker]);
  const changeQuotes = {
    ...quotes,
    ...(incoming.length > 0 ? await quotesFor(incoming) : {}),
  };
  // "Answer in Needs you" only when a proposal from this basket really waits there; otherwise the record is history.
  const waiting = basketWaiting(proposals, basket.id, now);
  const statuses = new Map<string, LineStatus>(
    (latest?.statuses ?? []).map((status) => [status.ticker, status]),
  );
  const kind = mainKind(basket.lines, basket.idea);
  // Companies that need a look come first (broken, played out, weaker), then the rest as the person ordered them.
  const rank: Record<string, number> = {
    broken: 0,
    played_out: 1,
    weaker: 2,
    unknown: 3,
    holds: 4,
  };
  const ordered = basket.lines
    .map((line, index) => ({
      line,
      index,
      rank: rank[statuses.get(line.ticker)?.verdict ?? "holds"] ?? 4,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.line);
  const attention = ordered.filter(
    (line) => (rank[statuses.get(line.ticker)?.verdict ?? "holds"] ?? 4) < 3,
  ).length;
  const fold = foldOf(ordered.length, attention);
  const shorts = shortReasons(basket.lines, reviewedReasons);
  // One scale for one figure: bars only for the companies checked on the basket's own kind of figure.
  const metrics = basket.lines.map(
    (line) => statuses.get(line.ticker)?.metric ?? null,
  );
  const counts = new Map<string, number>();
  for (const metric of metrics)
    if (metric) counts.set(metric.label, (counts.get(metric.label) ?? 0) + 1);
  const label =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const domain = barDomain(
    metrics
      .filter((metric) => metric?.label === label)
      .map((metric) => metric!.value),
  );
  const checked = basket.lines.filter(
    (line) =>
      statuses.has(line.ticker) &&
      statuses.get(line.ticker)!.verdict !== "unknown",
  );
  const holding = checked.filter(
    (line) => statuses.get(line.ticker)!.verdict === "holds",
  ).length;
  const next = nextAfterCloseRun(new Date());
  const when = pausedByPlan
    ? "Paused by your plan"
    : !basket.enabled
      ? "Paused"
      : latest
        ? `Checked ${dayWords(latest.day, today)}`
        : `First check ${afterCloseDayWords(next)}, ${afterCloseTimeEt(next)}`;
  const replayTickers = basket.replay?.tickers;
  const earlier = Boolean(
    replayTickers &&
    [...replayTickers].sort().join(",") !== [...tickers].sort().join(","),
  );

  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead
        title={basket.name}
        lede={
          wordCount(basket.idea) <= 15 && basket.idea !== basket.name
            ? basket.idea
            : undefined
        }
        meta={<span>{when}</span>}
        note={false}
        actions={<BasketAgentActions id={basket.id} enabled={basket.enabled} />}
      />

      {atLimit ? (
        <LockCard
          feature="agents"
          plan={viewer.plan}
          trialEligible={viewer.trialEligible}
          className="mb-4"
        />
      ) : null}

      <section aria-label="Companies" className="flex min-w-0 flex-col gap-2">
        <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 text-[15px] font-semibold leading-6 text-oa-fg">
          <span className="flex items-baseline gap-2">
            Companies
            <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg">
              {checked.length > 0
                ? `${holding} of ${checked.length} reasons hold`
                : `${basket.lines.length} · ${KIND_WORDS[kind].toLowerCase()} reasons`}
            </span>
          </span>
          {label ? (
            <span className="text-[12.5px] font-normal text-oa-muted-fg">
              Bars: {label.toLowerCase()}
            </span>
          ) : null}
        </h2>
        <Folded fold={fold}>
          <CardRows cols={fold.cols}>
            {ordered.map((line, index) => {
              const status = statuses.get(line.ticker) ?? null;
              const metric =
                status?.metric && status.metric.label === label
                  ? status.metric
                  : null;
              return (
                <CompanyCard
                  key={line.ticker}
                  ticker={line.ticker}
                  company={line.company}
                  quote={quotes[line.ticker] ?? null}
                  verdict={status?.verdict ?? null}
                  kind={line.kind !== kind ? line.kind : null}
                  // A reason that holds shows the person's reason; one that does not, what the check found.
                  line={
                    status && status.verdict !== "holds" && status.line
                      ? status.line
                      : (shorts[line.ticker] ?? line.reason)
                  }
                  className={foldClass(fold, index)}
                  title={`Your reason: ${line.reason}`}
                  bar={
                    metric
                      ? { value: metric.value, text: metric.text, domain }
                      : null
                  }
                  href={`/stock/${encodeURIComponent(line.ticker)}`}
                  eager={index < 6}
                />
              );
            })}
          </CardRows>
        </Folded>
      </section>

      {runs.length > 0 ? (
        <Panel
          flush
          className="mt-5"
          label="What it decided"
          right={
            waiting ? (
              <Link
                prefetch={false}
                href="/agent#agent-proposals"
                className="font-medium text-oa-primary hover:underline"
              >
                Answer in Needs you
              </Link>
            ) : (
              <span className="oa-mono tabular-nums">
                {runs.length} {runs.length === 1 ? "check" : "checks"}
              </span>
            )
          }
        >
          <RunRecord
            runs={runs}
            today={today}
            quotes={changeQuotes}
            size={basket.lines.length}
          />
        </Panel>
      ) : null}
      {basket.replay ? (
        <Panel flush className="mt-4" label="The replay">
          <ReplayView
            replay={basket.replay}
            today={today}
            kind="page"
            earlier={earlier}
          />
        </Panel>
      ) : null}
    </AppPage>
  );
}
