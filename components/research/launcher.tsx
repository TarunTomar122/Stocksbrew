"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { LockCard, MeterNote } from "@/components/oa/gate";
import { ResearchProgress } from "@/components/research/progress";
import type { Plan } from "@/lib/entitlements";
import { trackLimitHit, trackResearchCompleted, trackResearchFailed, trackResearchStarted } from "@/lib/product-analytics";
import { initialSteps, reportHref, type ResearchEvent, type ResearchStep } from "@/lib/research/types";

type Allowance = { used: number; limit: number; per: "day" | "month" } | null;

type State =
  | { kind: "idle" }
  | { kind: "running"; steps: ResearchStep[]; startedAt: number; key: string | null }
  | { kind: "done"; href: string }
  | { kind: "error"; code: string; message: string; steps: ResearchStep[] | null }
  | { kind: "limit"; message: string };

/**
 * "Get the full research": starts a run, reads the NDJSON stream from
 * POST /api/research and shows each step as it finishes, then opens the
 * saved report. Leaving the page does not stop the run.
 */
export function ResearchLauncher({
  ticker,
  name,
  plan,
  allowance,
  trialEligible,
  again,
}: {
  ticker: string;
  name: string;
  plan: Plan;
  allowance: Allowance;
  trialEligible: boolean;
  /** The person already has a report on this stock. */
  again: boolean;
}) {
  const router = useRouter();
  // A double click must not start two runs (the server refuses the second, but it would still flash an error).
  const busy = React.useRef(false);
  const [state, setState] = React.useState<State>(() =>
    allowance && allowance.used >= allowance.limit ? { kind: "limit", message: `That is all ${allowance.limit} reports for this month.` } : { kind: "idle" },
  );

  if (plan === "anon") {
    return (
      <LockCard
        feature="deep_research"
        plan="anon"
        ticker={ticker}
        title={`Sign in to get a long research report on ${name}`}
        body="A long, sourced report from the latest 10-K and 10-Q, four quarters of earnings, peers, fund and insider trades, and the last month of news. Free accounts get three a month."
      />
    );
  }

  async function start() {
    if (busy.current) return;
    busy.current = true;
    try {
      await run();
    } finally {
      busy.current = false;
    }
  }

  async function run() {
    trackResearchStarted({ ticker, surface: "research_page", again });
    const startedAt = Date.now();
    setState({ kind: "running", steps: initialSteps(), startedAt, key: null });
    let steps = initialSteps();
    let finished = false;
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { code?: string; message?: string; key?: string; ticker?: string; limit?: number };
        const code = data.code ?? `http_${response.status}`;
        trackResearchFailed({ ticker, code });
        if (code === "limit") {
          trackLimitHit({ feature: "deep_research", plan, limit: data.limit ?? null, code: "research_limit" });
          setState({ kind: "limit", message: data.message ?? "That is this month's reports used." });
          return;
        }
        if (code === "running" && data.key && data.ticker) {
          router.push(reportHref(data.ticker, data.key));
          return;
        }
        setState({ kind: "error", code, message: data.message ?? "The report could not start. Try again.", steps: null });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let key: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: ResearchEvent;
          try {
            event = JSON.parse(line) as ResearchEvent;
          } catch {
            continue;
          }
          if (event.type === "start") {
            key = event.key;
            steps = event.steps;
          } else if (event.type === "step") {
            steps = steps.map((step) => (step.id === event.step.id ? event.step : step));
          } else if (event.type === "done") {
            finished = true;
            trackResearchCompleted({ ticker, seconds: Math.round((Date.now() - startedAt) / 1000), removed: event.removed });
            setState({ kind: "done", href: event.href });
            router.push(event.href);
            router.refresh();
            return;
          } else if (event.type === "error") {
            finished = true;
            trackResearchFailed({ ticker, code: event.code, step: steps.find((step) => step.status === "failed")?.id ?? null });
            setState({ kind: "error", code: event.code, message: event.message, steps });
            return;
          }
          setState({ kind: "running", steps, startedAt, key });
        }
      }
      if (!finished) {
        // The stream ended without a verdict (a timeout on the way). The run may still finish: its page polls.
        trackResearchFailed({ ticker, code: "stream_ended" });
        if (key) {
          router.push(reportHref(ticker, key));
          return;
        }
        setState({ kind: "error", code: "stream_ended", message: "We lost the connection while the report was being written. Try again.", steps });
      }
    } catch {
      trackResearchFailed({ ticker, code: "network" });
      setState({ kind: "error", code: "network", message: "The connection dropped. If the report had started, it is still being written; check back in a minute.", steps });
    }
  }

  if (state.kind === "running" || state.kind === "done") {
    return (
      <section aria-label="Research in progress" className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
        <p className="oa-label mb-2">Researching {ticker}</p>
        <ResearchProgress steps={state.kind === "running" ? state.steps : initialSteps().map((step) => ({ ...step, status: "done" as const }))} startedAt={state.kind === "running" ? state.startedAt : null} />
        <p className="mt-3 border-t border-oa-border pt-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
          This takes a minute or two. You can leave this page: the report is saved under {ticker} when it is done.
        </p>
      </section>
    );
  }

  if (state.kind === "limit") {
    if (plan === "free") {
      return <LockCard feature="deep_research" plan="free" ticker={ticker} trialEligible={trialEligible} />;
    }
    return (
      <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
        <p className="text-[15px] font-medium text-oa-fg">{state.message}</p>
        <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">The count starts again on the first of the month, and every report you ran stays saved.</p>
      </section>
    );
  }

  return (
    <section aria-label="Get a long research report" className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold leading-6 text-oa-fg">{again ? `Run a fresh report on ${name}` : `Get a long research report on ${name}`}</p>
          <p className="mt-1 max-w-xl text-pretty text-[14px] leading-5 text-oa-muted-fg">
            We read the latest 10-K and 10-Q, four quarters of earnings and how the stock reacted, peers, fund and insider trades, and the last 30 days of news, then write it up with a source on every figure.
          </p>
          {allowance ? <MeterNote used={allowance.used} limit={allowance.limit} unit="reports" per={allowance.per} className="mt-2" /> : null}
        </div>
        <OaButton onClick={start} className="max-sm:min-h-11 max-sm:w-full sm:shrink-0" data-testid="research-start">
          {again ? "Run it again" : "Get the long report"}
        </OaButton>
      </div>
      {state.kind === "error" ? (
        <div role="alert" className="mt-3 border-t border-oa-border pt-3">
          <p className="text-[14px] font-medium leading-5 text-signal-bearish">{state.message}</p>
          {state.steps ? (
            <div className="mt-3">
              <ResearchProgress steps={state.steps} startedAt={null} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
