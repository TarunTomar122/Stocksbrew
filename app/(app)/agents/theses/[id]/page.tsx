import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SignInButton } from "@/components/briefing/sign-in-button";
import { CardRows } from "@/components/basket-agent/parts";
import { LockCard } from "@/components/oa/gate";
import { AppPage, Empty, PageHead, Panel } from "@/components/oa/kit";
import { EventList, HistoryList, LinesCard, StatusStrip, ThesisSummary } from "@/components/thesis-monitor/parts";
import { ThesisActions } from "@/components/thesis-monitor/thesis-actions";
import { agentMarketDay, listJobs } from "@/lib/agent-jobs-data";
import { afterCloseDayWords, afterCloseTimeEt, nextAfterCloseRun } from "@/lib/agent-schedule";
import { getSessionUser } from "@/lib/auth-server";
import { basketsOverPlan, listBaskets, runningAgents } from "@/lib/basket-agent/data";
import { basketHref } from "@/lib/basket-agent/model";
import { dayWords } from "@/lib/day-words";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { loadThesis } from "@/lib/thesis-monitor/data";
import { thesisEditHref } from "@/lib/thesis-monitor/model";
import { companiesView, historyStretches } from "@/lib/thesis-monitor/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Thesis", robots: { index: false } };

type Props = { params: { id: string } };

/** "AI infrastructure demand keeps growing" against "AI infrastructure": the statement says more than the title. */
function saysMore(statement: string, title: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(statement) !== norm(title);
}

export default async function ThesisPage({ params }: Props) {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Thesis" />
        <Empty title="Sign in to see your thesis.">
          <SignInButton label="Sign in" />
        </Empty>
      </AppPage>
    );
  }
  const data = await loadThesis(session.uid, params.id);
  if (!data) notFound();
  const { basket, state, quotes, nextReports } = data;
  const today = agentMarketDay();
  const holdings = basket.source.kind === "holdings";
  const [viewer, running, all, jobs] = await Promise.all([
    getViewer(),
    basket.enabled ? Promise.resolve(0) : runningAgents(session.uid, basket.id).catch(() => 0),
    basket.enabled ? listBaskets(session.uid).catch(() => [basket]) : Promise.resolve([basket]),
    basket.enabled ? listJobs(session.uid).catch(() => []) : Promise.resolve([]),
  ]);
  const limit = limitFor("agents", viewer.plan);
  const pausedByPlan = basket.enabled && basketsOverPlan(all, jobs.filter((job) => job.enabled).length, limit).has(basket.id);
  const atLimit = pausedByPlan || (!basket.enabled && running >= limit);
  const tickers = basket.lines.map((line) => line.ticker);
  const names = Object.fromEntries(basket.lines.map((line) => [line.ticker, line.company]));
  const companies = companiesView(basket.thesis, state, tickers);
  const next = nextAfterCloseRun(new Date());
  const when = pausedByPlan
    ? "Paused by your plan"
    : !basket.enabled
      ? "Paused"
      : state
        ? `Checked ${dayWords(state.day, today)}`
        : `First check ${afterCloseDayWords(next)}, ${afterCloseTimeEt(next)}`;
  const lineTotal = companies.reduce((sum, company) => sum + company.lines.length, 0);
  const stretches = state ? historyStretches(state.history) : [];
  const cols = companies.length === 2 || companies.length === 4 ? 2 : 3;

  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead
        title={basket.name}
        meta={<span>{when}</span>}
        note={false}
        actions={
          <ThesisActions
            id={basket.id}
            enabled={basket.enabled}
            holdings={holdings}
            editHref={thesisEditHref({ id: basket.id })}
            basketHref={holdings ? null : basketHref(basket.id)}
          />
        }
      />

      {atLimit ? <LockCard feature="agents" plan={viewer.plan} trialEligible={viewer.trialEligible} className="mb-4" /> : null}

      <ThesisSummary
        statement={basket.thesis.statement}
        showStatement={saysMore(basket.thesis.statement, basket.name)}
        status={state?.status ?? null}
        counts={state?.counts ?? null}
        affected={state?.affected ?? []}
        since={state?.status_since ?? null}
        today={today}
      />

      <section aria-label="Lines" className="mt-5 flex min-w-0 flex-col gap-2">
        <h2 className="flex items-baseline gap-2 px-1 text-[15px] font-semibold leading-6 text-oa-fg">
          Lines
          <span className="oa-mono text-[13px] font-medium tabular-nums text-oa-muted-fg">
            {lineTotal} on {companies.length} {companies.length === 1 ? "company" : "companies"}
          </span>
        </h2>
        <CardRows cols={cols}>
          {companies.map((company, index) => (
            <LinesCard
              key={company.ticker}
              company={company}
              name={names[company.ticker] ?? null}
              quote={quotes[company.ticker] ?? null}
              next={nextReports[company.ticker] ?? null}
              today={today}
              eager={index < 6}
            />
          ))}
        </CardRows>
      </section>

      {state && state.events.length > 0 ? (
        <Panel
          flush
          className="mt-5"
          // Until something moves it, the list is what was on file when it started, and says so in its title.
          label={state.events.some((event) => !event.baseline) ? "What moved it" : "On file when it started"}
          right={<span className="oa-mono tabular-nums">{state.events.length}</span>}
        >
          <EventList events={state.events} today={today} />
        </Panel>
      ) : null}

      {/* One check is the summary above; the history starts to say something from the second. */}
      {state && state.history.length > 1 ? (
        <Panel
          flush
          className="mt-4"
          label="History"
          right={<span className="oa-mono tabular-nums">{state.history.length} {state.history.length === 1 ? "check" : "checks"}</span>}
        >
          <div className="border-b border-oa-border px-4 py-3">
            <StatusStrip days={state.history.map((row) => ({ day: row.day, status: row.status }))} today={today} />
          </div>
          <HistoryList stretches={stretches} today={today} />
        </Panel>
      ) : null}
    </AppPage>
  );
}
