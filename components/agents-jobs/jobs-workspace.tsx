"use client";

import * as React from "react";

import { SignInButton } from "@/components/briefing/sign-in-button";
import { OaButton } from "@/components/oa/button";
import { TheRead } from "@/components/oa/insight";
import {
  AGENT_TEMPLATES,
  describeJob,
  shortDate,
  triggerLabel,
  type AgentFacts,
  type AgentJob,
  type AgentJobDraft,
  type AgentReplay,
  type AgentRun,
  type AgentTemplate,
} from "@/lib/agent-jobs";
import { agentsRead, orderJobs, presentRun, type JobStatus } from "@/lib/agent-jobs-present";

import { RunList, RunReport, SessionStrip, VerdictChip, type RunRow } from "./run-list";
import { trackAgentPreviewed, trackAgentReportOpened, trackAgentSwitchedOn, trackLimitHit } from "@/lib/product-analytics";

type Replay = AgentReplay & { tickers: string[]; available: AgentFacts["available"]; replayed_at: string };

export type JobsWorkspaceProps = {
  signedIn: boolean;
  initialJobs: AgentJob[];
  initialRuns: AgentRun[];
  /** Which sources hold any data today, so a template can say when it cannot run yet. */
  available: AgentFacts["available"];
  /** How many names the person tracks. */
  tracked: number;
  /** The person's research levels today, so the latest run can say when a name sits past one. */
  levels?: AgentFacts["levels"];
  /** The market day today, YYYY-MM-DD (US Eastern). */
  today: string;
  /** A job to open on arrival, from the briefing link. */
  focusJobId?: string | null;
  /** A replay computed on the server for the signed-out example. */
  sample?: { draft: AgentJobDraft; replay: Replay } | null;
  /** Template ids not offered right now (server flags, lib/agent-jobs.ts hiddenTemplateIds). */
  hiddenTemplates?: string[];
};

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";
const INPUT =
  "h-9 w-full rounded-lg border border-oa-border bg-oa-bg px-2.5 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus-visible:border-[color:color-mix(in_srgb,var(--oa-fg)_40%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_40%,transparent)]";
const WEEKDAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

type Form = {
  scope: "watchlist" | "tickers" | "any";
  tickers: string;
  level: string;
  direction: "crosses_above" | "crosses_below";
  pct: string;
  days: string;
  weekday: number;
};

const BLANK: Form = { scope: "watchlist", tickers: "", level: "", direction: "crosses_below", pct: "5", days: "3", weekday: 1 };

/** The request body for a template and what the person typed. The server validates it again. */
function payloadFor(template: AgentTemplate, form: Form, signedIn: boolean) {
  const onlyTickers = template.id === "price-level";
  const scopeKind = onlyTickers || (!signedIn && form.scope === "watchlist") ? "tickers" : form.scope;
  return {
    template: template.id,
    scope: scopeKind === "tickers" ? { kind: "tickers", tickers: form.tickers } : { kind: scopeKind },
    trigger: {
      rule: form.direction,
      level: Number(form.level),
      pct: Number(form.pct),
      days_before: Number(form.days),
      weekday: form.weekday,
    },
  };
}

const STARTER_TEMPLATE = "big-move";

/**
 * The example job as a filled-in draft. It is used only when the example is a
 * big-move rule on a list of tickers, so the form shows exactly what the
 * server replayed and the replay under it is the replay of that draft.
 */
function starterFor(sample: JobsWorkspaceProps["sample"], signedIn: boolean): { templateId: string; form: Form; replay: Replay; key: string } | null {
  if (!sample) return null;
  const { trigger, scope } = sample.draft;
  const template = AGENT_TEMPLATES.find((entry) => entry.id === STARTER_TEMPLATE);
  if (!template || trigger.type !== "price" || trigger.rule !== "moves_pct" || scope.kind !== "tickers") return null;
  const form: Form = { ...BLANK, scope: "tickers", tickers: scope.tickers.join(", "), pct: String(trigger.pct ?? 5) };
  return { templateId: template.id, form, replay: sample.replay, key: JSON.stringify(payloadFor(template, form, signedIn)) };
}

function runRows(runs: AgentRun[]): RunRow[] {
  return runs.map((run) => ({ ...run, key: run.id }));
}

function replayRows(replay: Replay): RunRow[] {
  return replay.runs.map((run) => ({ ...run, key: `replay-${run.day}` }));
}

/** Whom the job watches, in a few words, for the job row. */
function scopeWords(job: Pick<AgentJob, "scope">, tracked: number): string {
  if (job.scope.kind === "any") return "any stock";
  if (job.scope.kind === "tickers") return job.scope.tickers.slice(0, 3).join(", ") + (job.scope.tickers.length > 3 ? ` +${job.scope.tickers.length - 3}` : "");
  return tracked > 0 ? `your ${tracked} names` : "your names";
}

function ReplayPanel({ replay, job }: { replay: Replay; job: Pick<AgentJob, "trigger" | "scope"> }) {
  const rows = replayRows(replay);
  const latestHit = rows.find((run) => run.decision === "notify");
  const told = replay.counts.notify;
  return (
    <div className="overflow-hidden rounded-xl border border-oa-border bg-oa-bg">
      <div className="flex flex-wrap items-end justify-between gap-3 px-3.5 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="oa-caption">
            Replay of {shortDate(replay.from)} to {shortDate(replay.to)}
          </p>
          <p className="mt-1 text-pretty text-[15px] font-medium leading-snug text-oa-fg">
            {rows.length === 0
              ? "There was nothing to check in the last four weeks."
              : told === 0
                ? `All quiet: it would not have told you anything in the last ${rows.length} market days.`
                : `It would have told you on ${told} of the last ${rows.length} market days.`}
          </p>
          {replay.tickers.length > 0 ? (
            <p className="mt-0.5 text-[13px] leading-5 text-oa-muted-fg">
              On {replay.tickers.slice(0, 8).join(", ")}
              {replay.tickers.length > 8 ? ` and ${replay.tickers.length - 8} more` : ""}. Real closes, each day seeing only what was known then.
            </p>
          ) : null}
        </div>
        <SessionStrip runs={rows} job={job} />
      </div>
      {latestHit ? (
        <div className="border-t border-oa-border bg-oa-card px-3.5 py-3 sm:px-4">
          <p className="oa-caption mb-1.5">Latest time it would have told you · {shortDate(latestHit.day)}</p>
          <RunReport view={presentRun(latestHit, job, { replay: true })} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <details className="group border-t border-oa-border bg-oa-card">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg sm:px-4">
            See all {rows.length} days
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="border-t border-oa-border">
            <RunList runs={rows} job={job} limit={20} replay />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function sourceNote(template: AgentTemplate, available: AgentFacts["available"]): string | null {
  if (!template.needs || available[template.needs]) return null;
  if (template.needs === "fund_filings") return "13F filings are not in yet. Until they are, each run says it couldn't check.";
  if (template.needs === "insiders") return "Insider trades are not in yet. Until they are, each run says it couldn't check.";
  return "This source is not available right now. Until it is, each run says it couldn't check.";
}

const GROUP_LABEL: Record<AgentTemplate["group"], string> = {
  Schedule: "On a schedule",
  Event: "When something happens",
  Price: "When a price moves",
};
const GROUPS: AgentTemplate["group"][] = ["Schedule", "Event", "Price"];
// A phone shows the first few agents; the rest wait behind one button.
const PHONE_TEMPLATES = 4;

/** Templates that start in one click: nothing to type, and they watch the names you track. */
function oneClick(template: AgentTemplate, tracked: number): boolean {
  return template.id !== "price-level" && tracked > 0;
}

function Switch({ job, busy, onToggle }: { job: AgentJob; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={job.enabled}
      aria-label={`${job.enabled ? "Pause" : "Switch on"} ${job.name}`}
      title={job.enabled ? "On. Click to pause." : "Paused. Click to switch on."}
      disabled={busy}
      onClick={onToggle}
      className={`relative h-6 w-10 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50 ${
        job.enabled ? "border-oa-primary bg-oa-primary" : "border-oa-border bg-oa-bg"
      }`}
    >
      <span className={`absolute top-0.5 size-[18px] rounded-full bg-oa-card shadow transition-[left] ${job.enabled ? "left-[19px]" : "left-0.5"}`} />
    </button>
  );
}

export function JobsWorkspace({
  signedIn,
  initialJobs,
  initialRuns,
  available,
  tracked,
  levels,
  today,
  focusJobId,
  sample,
  hiddenTemplates,
}: JobsWorkspaceProps) {
  const offered = React.useMemo(
    () => (hiddenTemplates?.length ? AGENT_TEMPLATES.filter((entry) => !hiddenTemplates.includes(entry.id)) : AGENT_TEMPLATES),
    [hiddenTemplates],
  );
  const [jobs, setJobs] = React.useState(initialJobs);
  const [runs, setRuns] = React.useState(initialRuns);
  // A server refresh (signing in or out, say) replaces what this page holds.
  React.useEffect(() => setJobs(initialJobs), [initialJobs]);
  React.useEffect(() => setRuns(initialRuns), [initialRuns]);
  const [openJob, setOpenJob] = React.useState<string | null>(focusJobId ?? null);
  // Signed out, the builder opens on a real example with its replay, so the page shows what an agent says.
  const starter = React.useMemo(() => starterFor(!signedIn && initialJobs.length === 0 ? sample ?? null : null, signedIn), [initialJobs.length, sample, signedIn]);
  const [templateId, setTemplateId] = React.useState<string | null>(starter?.templateId ?? null);
  const [form, setForm] = React.useState<Form>(starter?.form ?? { ...BLANK, scope: signedIn && tracked > 0 ? "watchlist" : "tickers" });
  const [replay, setReplay] = React.useState<Replay | null>(starter?.replay ?? null);
  const [replayFor, setReplayFor] = React.useState<string>(starter?.key ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [allTemplates, setAllTemplates] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const builderRef = React.useRef<HTMLDivElement>(null);

  const template = AGENT_TEMPLATES.find((entry) => entry.id === templateId) ?? null;
  const payload = template ? payloadFor(template, form, signedIn) : null;
  const payloadKey = payload ? JSON.stringify(payload) : "";
  const replayIsCurrent = replay != null && replayFor === payloadKey;
  const replayShown = Boolean(replay && replayIsCurrent);

  const draftPreview: Pick<AgentJobDraft, "trigger" | "scope"> | null = React.useMemo(() => {
    if (!template) return null;
    const tickers = form.tickers
      .toUpperCase()
      .split(/[\s,;]+/)
      .filter(Boolean);
    const base = template.defaults;
    const scope: AgentJobDraft["scope"] =
      template.id === "price-level" || form.scope === "tickers" || (!signedIn && form.scope === "watchlist")
        ? { kind: "tickers", tickers }
        : form.scope === "any"
          ? { kind: "any" }
          : { kind: "watchlist" };
    let trigger = base.trigger;
    if (trigger.type === "price" && template.id === "price-level") trigger = { type: "price", rule: form.direction, level: Number(form.level) || 0 };
    else if (trigger.type === "price" && template.id === "big-move") trigger = { type: "price", rule: "moves_pct", pct: Number(form.pct) || 5 };
    else if (trigger.type === "event" && trigger.event === "earnings_approaching") trigger = { ...trigger, days_before: Number(form.days) || 3 };
    else if (trigger.type === "schedule" && trigger.cadence === "weekly") trigger = { ...trigger, weekday: form.weekday };
    return { trigger, scope };
  }, [form, signedIn, template]);

  const runsByJob = React.useMemo(() => {
    const map = new Map<string, AgentRun[]>();
    for (const run of runs) map.set(run.job_id, [...(map.get(run.job_id) ?? []), run]);
    return map;
  }, [runs]);
  const statuses = React.useMemo(() => orderJobs(jobs, runsByJob, levels), [jobs, runsByJob, levels]);
  const read = React.useMemo(() => agentsRead(statuses, today), [statuses, today]);

  React.useEffect(() => {
    if (focusJobId) document.getElementById(`job-${focusJobId}`)?.scrollIntoView({ block: "start" });
    // The read's "Open" links are #job-… anchors: open that job without reloading the page.
    const onHash = () => {
      const id = /^#job-([a-z0-9]+)$/.exec(window.location.hash)?.[1];
      if (id) setOpenJob(id);
    };
    onHash();
    // Next's Link changes the hash with pushState, which fires no hashchange, so catch the click too.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#job-"]');
      const id = link ? /^#job-([a-z0-9]+)$/.exec(link.getAttribute("href") ?? "")?.[1] : null;
      if (id) setOpenJob(id);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [focusJobId]);

  async function call<T>(key: string, url: string, init: RequestInit): Promise<T | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.error || "That did not work. Try again.");
      return body;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function pick(next: AgentTemplate) {
    setTemplateId(next.id);
    setReplay(null);
    setError(null);
    setNotice(null);
    setForm({ ...BLANK, scope: signedIn && tracked > 0 && next.id !== "price-level" ? "watchlist" : "tickers" });
    requestAnimationFrame(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function runReplay() {
    if (!payload) return;
    const body = await call<{ replay: Replay }>("replay", "/api/agent-jobs/replay", { method: "POST", body: payloadKey });
    if (template) trackAgentPreviewed({ template: template.id, ok: Boolean(body) });
    if (body) {
      setReplay(body.replay);
      setReplayFor(payloadKey);
    }
  }

  async function create(body: string, key: string) {
    const result = await call<{ job: AgentJob; paused?: { message?: string } | null }>(key, "/api/agent-jobs", { method: "POST", body });
    if (!result) return;
    trackAgentSwitchedOn({ template: result.job.template, via: key === "create" ? "create" : "quick_start", enabled: result.job.enabled });
    // Saved but switched off: the plan's agent limit (lib/entitlements.ts `agents`).
    if (!result.job.enabled && result.paused) trackLimitHit({ feature: "agents", code: "paused_at_limit" });
    setJobs((current) => [...current, result.job]);
    setOpenJob(result.job.id);
    setTemplateId(null);
    setReplay(null);
    setAdding(false);
    // Past the plan's limit the server saves the job switched off and says why.
    setNotice(
      result.paused?.message && !result.job.enabled
        ? `"${result.job.name}": ${result.paused.message}`
        : `"${result.job.name}" is on. Its reports show up here, starting with its next check.`,
    );
  }

  async function turnOn() {
    if (payload) await create(payloadKey, "create");
  }

  async function quickStart(entry: AgentTemplate) {
    await create(JSON.stringify(payloadFor(entry, { ...BLANK, scope: "watchlist" }, true)), `start-${entry.id}`);
  }

  async function toggle(job: AgentJob) {
    const body = await call<{ job: AgentJob }>(`toggle-${job.id}`, `/api/agent-jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    if (body?.job) {
      trackAgentSwitchedOn({ template: body.job.template, via: "toggle", enabled: body.job.enabled });
      setJobs((current) => current.map((entry) => (entry.id === job.id ? body.job : entry)));
    }
  }

  async function remove(job: AgentJob) {
    if (!window.confirm(`Remove "${job.name}"? Its past reports are kept.`)) return;
    const body = await call<{ ok: boolean }>(`remove-${job.id}`, `/api/agent-jobs/${job.id}`, { method: "DELETE" });
    if (body) setJobs((current) => current.filter((entry) => entry.id !== job.id));
  }

  async function runNow(job: AgentJob) {
    const body = await call<{ status: string; run?: AgentRun }>(`run-${job.id}`, `/api/agent-jobs/${job.id}/run`, { method: "POST" });
    if (!body) return;
    if (body.run) {
      const run = body.run;
      setRuns((current) => [run, ...current.filter((entry) => entry.id !== run.id)]);
      setOpenJob(job.id);
      setNotice(body.status === "already_ran" ? "It already checked today. One check per market day; this is that report." : null);
    } else {
      setNotice("Not due today. A weekly agent only checks on its day.");
    }
  }

  const needsTickers = template ? template.id === "price-level" || form.scope === "tickers" || (!signedIn && form.scope === "watchlist") : false;
  const hasJobs = signedIn && jobs.length > 0;
  const showTemplates = !hasJobs || adding;

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-2 sm:px-0">
        <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">Alerts &amp; agents</h1>
      </header>
      <p className="-mt-1 max-w-[62ch] text-pretty px-2 text-[15px] leading-[22px] text-oa-muted-fg sm:-mt-2 sm:px-0">
        An agent watches your stocks for one thing you pick, like a big daily move or an earnings date, and reports here and by email when it
        happens. Agents never trade.
      </p>

      {error ? (
        <p role="alert" className="rounded-lg border border-[color:color-mix(in_srgb,var(--signal-bearish)_40%,transparent)] bg-oa-card px-3.5 py-2 text-[13px] text-signal-bearish">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border border-oa-border bg-oa-card px-3.5 py-2 text-[13px] text-[color:color-mix(in_srgb,var(--oa-fg)_85%,transparent)]">
          {notice}
        </p>
      ) : null}

      {hasJobs ? <TheRead read={read} label="What your agents found" /> : null}

      {hasJobs ? (
        <section aria-labelledby="jobs-label" className={CARD}>
          <header className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-3.5 py-2 sm:px-4">
            <h2 id="jobs-label" className="oa-label flex items-center gap-2">
              Your agents <span className="oa-mono text-oa-muted-fg">{jobs.length}</span>
            </h2>
            <OaButton size="xs" variant="secondary" onClick={() => setAdding((value) => !value)} aria-expanded={adding}>
              {adding ? "Close" : "Add an agent"}
            </OaButton>
          </header>
          <ul>
            {statuses.map((status) => (
              <JobRow
                key={status.job.id}
                status={status}
                log={runsByJob.get(status.job.id) ?? []}
                open={openJob === status.job.id}
                tracked={tracked}
                busy={busy}
                onOpen={() => {
                  if (openJob !== status.job.id) trackAgentReportOpened({ template: status.job.template, has_report: Boolean(status.view) });
                  setOpenJob(openJob === status.job.id ? null : status.job.id);
                }}
                onToggle={() => toggle(status.job)}
                onRun={() => runNow(status.job)}
                onRemove={() => remove(status.job)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {template && draftPreview ? (
        <section aria-label="Set up an agent" className={CARD}>
          <header className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-3.5 py-2 sm:px-4">
            <h2 className="oa-label min-w-0 truncate">{template.title}</h2>
            <button type="button" onClick={() => setTemplateId(null)} className="cursor-pointer text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg">
              Close
            </button>
          </header>
          <div ref={builderRef} className="grid min-w-0 content-start gap-3.5 px-3.5 py-3.5 sm:px-4">
            {starter && replayFor === starter.key && replayIsCurrent ? (
              <p className="text-pretty text-[14px] leading-5 text-oa-fg">
                An example: this agent watching Nvidia, Apple, Microsoft, Amazon and Tesla over the last four weeks of real prices. Change anything, or pick a different agent below.
              </p>
            ) : null}
            <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${replayShown ? "order-2" : "order-1"}`}>
              {template.id !== "price-level" ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Which stocks
                  <select
                    className={INPUT}
                    value={!signedIn && form.scope === "watchlist" ? "tickers" : form.scope}
                    onChange={(event) => setForm({ ...form, scope: event.target.value as Form["scope"] })}
                  >
                    {signedIn ? <option value="watchlist">The stocks I track ({tracked})</option> : null}
                    <option value="tickers">Stocks I choose</option>
                    {template.defaults.trigger.type === "event" &&
                    ["fund_13f", "congress_trade", "insider_trade"].includes(template.defaults.trigger.event) ? (
                      <option value="any">Any stock</option>
                    ) : null}
                  </select>
                </label>
              ) : null}
              {needsTickers ? (
                <label className={`grid gap-1 text-[12.5px] font-medium text-oa-muted-fg ${template.id === "price-level" ? "" : "xl:col-span-2"}`}>
                  {template.id === "price-level" ? "Ticker" : "Tickers"}
                  <input
                    className={`${INPUT} oa-mono uppercase`}
                    value={form.tickers}
                    placeholder={template.id === "price-level" ? "AAPL" : "AAPL, NVDA, MSFT"}
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => setForm({ ...form, tickers: event.target.value })}
                  />
                </label>
              ) : null}
              {template.fields.includes("direction") ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Closes
                  <select className={INPUT} value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Form["direction"] })}>
                    <option value="crosses_below">Below</option>
                    <option value="crosses_above">Above</option>
                  </select>
                </label>
              ) : null}
              {template.fields.includes("level") ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Price ($)
                  <input className={`${INPUT} oa-mono`} inputMode="decimal" value={form.level} placeholder="180" onChange={(event) => setForm({ ...form, level: event.target.value })} />
                </label>
              ) : null}
              {template.fields.includes("pct") ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Smallest daily move (%)
                  <input className={`${INPUT} oa-mono`} inputMode="decimal" value={form.pct} onChange={(event) => setForm({ ...form, pct: event.target.value })} />
                </label>
              ) : null}
              {template.fields.includes("days_before") ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Days before earnings
                  <input className={`${INPUT} oa-mono`} inputMode="numeric" value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} />
                </label>
              ) : null}
              {template.fields.includes("weekday") ? (
                <label className="grid gap-1 text-[12.5px] font-medium text-oa-muted-fg">
                  Day of the week
                  <select className={INPUT} value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}>
                    {WEEKDAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className={`rounded-xl border border-oa-border bg-oa-bg px-3.5 py-3 ${replayShown ? "order-1" : "order-2"}`}>
              <p className="oa-caption">What it watches</p>
              <p className="mt-1 max-w-[70ch] text-pretty text-[16px] leading-6 text-oa-fg">&ldquo;{describeJob(draftPreview)}&rdquo;</p>
              {sourceNote(template, available) ? (
                <p className="mt-1.5 text-[12.5px] leading-5 text-[color:color-mix(in_srgb,var(--oa-fg)_80%,transparent)]">{sourceNote(template, available)}</p>
              ) : null}
            </div>

            <div className="order-4 flex flex-wrap items-center gap-2">
              {signedIn ? (
                <OaButton loading={busy === "create"} onClick={turnOn} className="max-sm:!h-10">
                  Switch it on
                </OaButton>
              ) : (
                <SignInButton label="Sign in to switch it on" size="md" className="max-sm:!h-10" />
              )}
              <OaButton variant="secondary" data-action="replay" loading={busy === "replay"} onClick={runReplay} className="max-sm:!h-10">
                {replay && replayIsCurrent ? "Update preview" : "Preview the last 4 weeks"}
              </OaButton>
              {replay && !replayIsCurrent ? <span className="text-[12.5px] text-oa-muted-fg">You changed it. Update the preview to see the new result.</span> : null}
            </div>

            {replayShown && replay ? (
              <div className="order-3">
                <ReplayPanel replay={replay} job={draftPreview} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showTemplates ? (
        <section aria-labelledby="templates-label" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-2 sm:px-0">
            <h2 id="templates-label" className="oa-label">
              {hasJobs ? "Add an agent" : template && draftPreview ? "Other agents you can set up" : "Pick an agent to start"}
            </h2>
            <p className="text-[12.5px] leading-5 text-oa-muted-fg">
              {signedIn
                ? tracked > 0
                  ? `Start watches your ${tracked} tracked names. Preview shows the last 4 weeks first.`
                  : "Track a few stocks first, or pick tickers in Preview."
                : "Try any of them on the last four weeks of prices. Sign in to switch one on."}
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.flatMap((group) => offered.filter((entry) => entry.group === group)).map((entry, index) => {
              const active = entry.id === templateId;
              const unavailable = Boolean(entry.needs && !available[entry.needs]);
              const taken = jobs.some((job) => job.template === entry.id && entry.id !== "price-level");
              return (
                <li
                  key={entry.id}
                  className={`${CARD} flex flex-col gap-2 px-3.5 py-3 ${active ? "shadow-[inset_0_0_0_1px_var(--oa-primary)]" : ""} ${
                    !allTemplates && index >= PHONE_TEMPLATES ? "max-lg:hidden" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="oa-caption">{GROUP_LABEL[entry.group]}</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[14.5px] font-medium leading-5 text-oa-fg">
                      {entry.title}
                      {unavailable ? <span className="text-[12px] font-normal text-oa-muted-fg">no data yet</span> : null}
                      {taken ? <span className="text-[12px] font-normal text-oa-muted-fg">already running</span> : null}
                    </p>
                    <p className="mt-0.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{entry.tells}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    {signedIn && oneClick(entry, tracked) && !taken ? (
                      <OaButton size="xs" loading={busy === `start-${entry.id}`} onClick={() => quickStart(entry)} data-template-start={entry.id}>
                        Start
                      </OaButton>
                    ) : null}
                    <OaButton size="xs" variant="secondary" aria-pressed={active} data-template={entry.id} onClick={() => pick(entry)}>
                      {entry.id === "price-level" ? "Set up" : "Preview"}
                    </OaButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {offered.length > PHONE_TEMPLATES ? (
            <button
              type="button"
              aria-expanded={allTemplates}
              onClick={() => setAllTemplates((value) => !value)}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-oa-border bg-oa-card px-4 text-[14px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] lg:hidden"
            >
              {allTemplates ? "Show fewer" : `Show all ${offered.length} agents`}
              <span aria-hidden="true" className={`text-oa-muted-fg transition-transform ${allTemplates ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}

function JobRow({
  status,
  log,
  open,
  tracked,
  busy,
  onOpen,
  onToggle,
  onRun,
  onRemove,
}: {
  status: JobStatus;
  log: AgentRun[];
  open: boolean;
  tracked: number;
  busy: string | null;
  onOpen: () => void;
  onToggle: () => void;
  onRun: () => void;
  onRemove: () => void;
}) {
  const { job, view, last } = status;
  const earlier = log.slice(1);
  return (
    <li id={`job-${job.id}`} className="scroll-mt-20 border-b border-oa-border last:border-b-0">
      <div className="flex items-start gap-3 px-3.5 py-2.5 sm:px-4">
        <button type="button" aria-expanded={open} onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left outline-none">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {!job.enabled ? (
              <span className="oa-mono inline-flex h-[22px] items-center rounded border border-oa-border px-1.5 text-[11.5px] uppercase tracking-[0.04em] text-oa-muted-fg">
                Paused
              </span>
            ) : view ? (
              <VerdictChip verdict={view.verdict} />
            ) : (
              <span className="oa-mono inline-flex h-[22px] items-center rounded border border-dashed border-oa-border px-1.5 text-[11.5px] uppercase tracking-[0.04em] text-oa-muted-fg">
                Not run yet
              </span>
            )}
            <span className="text-[15px] font-medium leading-[22px] text-oa-fg">{job.name}</span>
            <span className="text-[12.5px] text-oa-muted-fg">
              {triggerLabel(job.trigger)} · {scopeWords(job, tracked)}
            </span>
          </span>
          <span className={`mt-1 block text-[13.5px] leading-5 ${open ? "" : "line-clamp-2 sm:line-clamp-1"} ${view?.verdict === "quiet" ? "text-oa-muted-fg" : "text-oa-fg"}`}>
            {view ? (
              <>
                {view.headline} <span className="text-oa-muted-fg">{open ? "" : view.todo}</span>
              </>
            ) : (
              <span className="text-oa-muted-fg">No report yet. It reports here after its next check, or open it and check now.</span>
            )}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {last ? <span className="oa-mono hidden text-[12px] text-oa-muted-fg sm:inline">{shortDate(last.day)}</span> : null}
          <Switch job={job} busy={busy === `toggle-${job.id}`} onToggle={onToggle} />
        </div>
      </div>
      {open ? (
        <div className="border-t border-oa-border bg-[color:color-mix(in_srgb,var(--oa-bg)_60%,transparent)]">
          <div className="grid gap-2.5 px-3.5 py-3 sm:px-4">
            {view ? (
              <>
                <p className="text-pretty text-[14px] leading-5 text-oa-fg">{view.todo}</p>
                <RunReport view={view} showHeadline={false} />
              </>
            ) : null}
            <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">{describeJob(job)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <OaButton
                size="xs"
                variant="secondary"
                loading={busy === `run-${job.id}`}
                disabled={!job.enabled}
                title={job.enabled ? undefined : "Paused. Switch it on to run it."}
                onClick={onRun}
              >
                Check now
              </OaButton>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy === `remove-${job.id}`}
                className="h-7 cursor-pointer px-2 text-[12.5px] font-medium text-oa-muted-fg hover:text-signal-bearish"
              >
                Remove
              </button>
            </div>
          </div>
          {earlier.length > 0 ? (
            <details className="group border-t border-oa-border bg-oa-card">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg sm:px-4">
                Earlier reports ({earlier.length})
                <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="border-t border-oa-border">
                <RunList runs={runRows(earlier)} job={job} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
