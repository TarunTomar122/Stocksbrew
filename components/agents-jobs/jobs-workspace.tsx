"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PlainAgentReadContext } from "@/components/agents-plain/plain-agent-box";
import { TEMPLATE_ICON } from "@/components/agents-jobs/template-icons";
import { KindIcon } from "@/components/oa/nav-icon";
import { PageIcon } from "@/components/oa/place-nav";
import { OaButton } from "@/components/oa/button";
import { LockCard, ProMark } from "@/components/oa/gate";
import {
  AGENT_TEMPLATES,
  describeJob,
  jobDisplayName,
  parseJobDraft,
  planMayRun,
  PRO_EVENTS_PAUSED,
  shortDate,
  triggerLabel,
  type AgentFacts,
  type AgentJob,
  type AgentJobDraft,
  type AgentReplay,
  type AgentRun,
  type AgentTemplate,
} from "@/lib/agent-jobs";
import { draftHref, type LinkedDraft } from "@/lib/agent-jobs-link";
import { orderJobs, presentRun, type JobStatus } from "@/lib/agent-jobs-present";
import { sameJob } from "@/lib/agents-plain/save";
import type { Plan } from "@/lib/entitlements";
import { currentFirebaseUser, firebaseUserNow, POST_SIGNUP_ONBOARDING_PENDING, signInWithGoogle, syncServerSession } from "@/lib/sign-in";

import { RunList, RunReport, StockNamesContext, VerdictChip, type RunRow } from "./run-list";
import { checksWhenShort, earningsWhen, tellsShort, watchSummary } from "./summary";
import { trackAgentPreviewed, trackAgentReportOpened, trackAgentSwitchedOn, trackLimitHit } from "@/lib/product-analytics";

type Replay = AgentReplay & { tickers: string[]; available: AgentFacts["available"]; replayed_at: string };

export type JobsWorkspaceProps = {
  signedIn: boolean;
  /** The viewer's plan, so an agent the plan cannot run (a filing or news agent on Free) says so instead of looking on. */
  plan?: Plan;
  initialJobs: AgentJob[];
  initialRuns: AgentRun[];
  /** Which sources hold any data today, so a template can say when it cannot run yet. */
  available: AgentFacts["available"];
  /** How many names the person tracks. */
  tracked: number;
  /** The person's research levels today, so the latest run can say when a name sits past one. */
  levels?: AgentFacts["levels"];
  /** Company names by ticker for the rows of a run, short form ("Meta Platforms"). */
  names?: Readonly<Record<string, string>>;
  /** A job to open on arrival, from the briefing link. */
  focusJobId?: string | null;
  /** A replay computed on the server for the signed-out example. */
  sample?: { draft: AgentJobDraft; replay: Replay } | null;
  /** An agent a link asked for (`?q=` read by rules, or `?draft=` kept across a sign-in): opened filled in, on top. */
  linked?: LinkedDraft | null;
  /** When the agents run on their own (lib/agent-schedule.ts), worked out on the server: "5:30 PM ET" and "today". */
  schedule?: { time: string; next: string } | null;
  /** Template ids not offered right now (server flags, lib/agent-jobs.ts hiddenTemplateIds). */
  hiddenTemplates?: string[];
  /** Shown under the intro, above everything else (the plain-English agent box). */
  lead?: React.ReactNode;
};

const NO_NAMES: Readonly<Record<string, string>> = {};

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";
const INPUT =
  "h-9 w-full rounded-lg border border-oa-border bg-oa-bg px-2.5 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus-visible:border-[color:color-mix(in_srgb,var(--oa-fg)_40%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_40%,transparent)]";
/** The same field without a fixed width, for inputs that sit inside a sentence. */
const INLINE_INPUT = INPUT.replace("w-full ", "");
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
  /** Carried through from a linked draft: which SEC forms, and which news change. No field edits them. */
  filings?: Extract<AgentJobDraft["trigger"], { type: "event" }>["filings"];
  news?: Extract<AgentJobDraft["trigger"], { type: "event" }>["news"];
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
      ...(form.filings ? { filings: form.filings } : {}),
      ...(form.news ? { news: form.news } : {}),
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

/**
 * The builder's form for a draft the plain-English box read, so the builder can preview that agent. Null for a
 * template the builder does not offer.
 */
function formFromDraft(draft: AgentJobDraft, offered: AgentTemplate[]): { template: AgentTemplate; form: Form } | null {
  const template = offered.find((entry) => entry.id === draft.template);
  if (!template) return null;
  const { trigger, scope } = draft;
  const form: Form = {
    ...BLANK,
    scope: scope.kind,
    tickers: scope.kind === "tickers" ? scope.tickers.join(", ") : "",
  };
  if (trigger.type === "price") {
    if (trigger.rule === "crosses_above" || trigger.rule === "crosses_below") form.direction = trigger.rule;
    if (trigger.level != null) form.level = String(trigger.level);
    if (trigger.pct != null) form.pct = String(trigger.pct);
  } else if (trigger.type === "event" && (trigger.days_before != null || trigger.filings || trigger.news)) {
    if (trigger.days_before != null) form.days = String(trigger.days_before);
    if (trigger.filings) form.filings = trigger.filings;
    if (trigger.news) form.news = trigger.news;
  } else if (trigger.type === "schedule" && trigger.weekday != null) {
    form.weekday = trigger.weekday;
  }
  return { template, form };
}

/** True while the form still lacks something only the person can type (a ticker, a price), so a phone opens it for editing. */
function needsInput(template: AgentTemplate, form: Form): boolean {
  const names = form.tickers.split(/[\s,;]+/).filter(Boolean).length;
  if ((template.id === "price-level" || form.scope === "tickers") && names === 0) return true;
  return template.fields.includes("level") && !(Number(form.level) > 0);
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
  const unchecked = replay.counts.could_not_check;
  const evidence =
    job.trigger.type !== "event"
      ? "Real closes"
      : job.trigger.event === "sec_filing"
        ? "Real SEC filings"
        : job.trigger.event === "news"
          ? "Real headlines and our tone read of them"
          : "Real data";
  // On a phone the result is one line; the strip, the latest report and every day wait behind "See all".
  const phoneLine =
    rows.length === 0
      ? "There was nothing to check in the last four weeks."
      : told === 0 && unchecked === rows.length
        ? `It could not check any of the last ${rows.length} market days.`
        : told === 0 && unchecked > 0
          ? `All quiet on the ${rows.length - unchecked} market days it could check.`
          : told === 0
            ? `All quiet on the last ${rows.length} market days.`
            : `It would have told you on ${told} of the last ${rows.length} market days.`;
  const tickersLine =
    replay.tickers.length > 0 ? (
      <>
        On {replay.tickers.slice(0, 8).join(", ")}
        {replay.tickers.length > 8 ? ` and ${replay.tickers.length - 8} more` : ""}. {evidence}, each day seeing only what was known then.
      </>
    ) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-oa-border bg-oa-bg">
      <p className="px-3.5 py-2.5 text-pretty text-[14px] font-medium leading-5 text-oa-fg sm:hidden">{phoneLine}</p>
      {/* No strip of day bars beside this: the sentence has the number, and "See all days" lists each one (owner rules 5 and 6). */}
      <div className="px-3.5 py-3 max-sm:hidden sm:px-4">
        <div className="min-w-0">
          <p className="oa-caption">
            What it would have done, {shortDate(replay.from)} to {shortDate(replay.to)}
          </p>
          <p className="mt-1 text-pretty text-[15px] font-medium leading-snug text-oa-fg">
            {rows.length === 0
              ? "There was nothing to check in the last four weeks."
              : told === 0 && unchecked === rows.length
                ? `It could not check any of the last ${rows.length} market days. The list under this says why.`
                : told === 0 && unchecked > 0
                  ? `All quiet on the ${rows.length - unchecked} market days it could check. It could not check the other ${unchecked}.`
                  : told === 0
                    ? `All quiet: it would not have told you anything in the last ${rows.length} market days.`
                : `It would have told you on ${told} of the last ${rows.length} market days.`}
          </p>
          {tickersLine ? <p className="mt-0.5 text-[13px] leading-5 text-oa-muted-fg">{tickersLine}</p> : null}
        </div>
      </div>
      {latestHit ? (
        <div className="border-t border-oa-border bg-oa-card px-3.5 py-3 max-sm:hidden sm:px-4">
          <p className="oa-caption mb-1.5">Latest time it would have told you · {shortDate(latestHit.day)}</p>
          <RunReport view={presentRun(latestHit, job, { replay: true })} />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <details className="group border-t border-oa-border bg-oa-card">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg sm:px-4">
            See all {rows.length} days
          </summary>
          {/* What the phone line leaves out: the period and the stocks. */}
          <div className="border-t border-oa-border px-3.5 py-2.5 sm:hidden">
            <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg">
              {shortDate(replay.from)} to {shortDate(replay.to)}. {tickersLine}
            </p>
          </div>
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

/** When an agent runs, from the real after-close schedule. Every agent is checked in that one run. */
function checksWhen(trigger: AgentJobDraft["trigger"], schedule: JobsWorkspaceProps["schedule"]): string {
  const at = schedule?.time ?? "5:30 PM ET";
  if (trigger.type === "schedule" && trigger.cadence === "weekly") {
    const day = WEEKDAYS.find((entry) => entry.value === trigger.weekday)?.label ?? "Monday";
    return `Every ${day} after the market closes, from ${at}.`;
  }
  const first = schedule?.next ? ` If you save it now, its first check is ${schedule.next}.` : "";
  const earnings = earningsWhen(trigger);
  return `After every market close, from ${at}, Monday to Friday.${earnings ? ` ${earnings}` : ""}${first}`;
}

/** Sign-in errors that mean the person closed the window themselves: nothing to say about those. */
const SIGN_IN_CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/**
 * Sign in, then load the page again at an address that holds the draft, so the same agent is waiting with its
 * save button. A navigation to `href` (not a reload) because the router can rewrite the address after a sign-in.
 */
async function signInKeepingDraft(href: string) {
  const known = firebaseUserNow();
  const user = known !== undefined ? known : await currentFirebaseUser();
  // A browser can still hold a Firebase user after the server session expired: refresh the cookie instead.
  if (user) await syncServerSession(user);
  else await signInWithGoogle({ surface: "agents_save" });
  try {
    // Saving this agent is the new account's first step; the general welcome would open on top of it.
    localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
  } catch {
    // Storage blocked: the welcome shows, and the draft is still waiting under it.
  }
  window.location.replace(href);
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
  plan = "pro",
  initialJobs,
  initialRuns,
  available,
  tracked,
  levels,
  names,
  focusJobId,
  sample,
  linked,
  schedule,
  hiddenTemplates,
  lead,
}: JobsWorkspaceProps) {
  const offered = React.useMemo(
    () => (hiddenTemplates?.length ? AGENT_TEMPLATES.filter((entry) => !hiddenTemplates.includes(entry.id)) : AGENT_TEMPLATES),
    [hiddenTemplates],
  );
  const router = useRouter();
  const [jobs, setJobs] = React.useState(initialJobs);
  const [runs, setRuns] = React.useState(initialRuns);
  // A server refresh (signing in or out, say) replaces what this page holds.
  React.useEffect(() => setJobs(initialJobs), [initialJobs]);
  React.useEffect(() => setRuns(initialRuns), [initialRuns]);
  const [openJob, setOpenJob] = React.useState<string | null>(focusJobId ?? null);
  // Signed out, the builder opens on a real example with its replay, so the page shows what an agent says.
  // The page only sends an example to a signed-out visitor, or to anyone who came to watch one stock ("?watch=MSFT").
  const starter = React.useMemo(() => starterFor(sample && (signedIn || initialJobs.length === 0) ? sample : null, signedIn), [initialJobs.length, sample, signedIn]);
  // The agent a link asked for, read once on arrival: a refresh after saving elsewhere on the page must not bring it back.
  const [arrived] = React.useState(() => {
    const next = linked ? formFromDraft(linked.draft, offered) : null;
    return next && linked ? { ...next, key: JSON.stringify(payloadFor(next.template, next.form, signedIn)), note: linked.note ?? null } : null;
  });
  /** True while the builder still holds the linked agent (edited or not); it then sits on top of the page. */
  const [linkedOpen, setLinkedOpen] = React.useState(Boolean(arrived));
  const [templateId, setTemplateId] = React.useState<string | null>(starter?.templateId ?? arrived?.template.id ?? null);
  const [form, setForm] = React.useState<Form>(starter?.form ?? arrived?.form ?? { ...BLANK, scope: signedIn && tracked > 0 ? "watchlist" : "tickers" });
  const [replay, setReplay] = React.useState<Replay | null>(starter?.replay ?? null);
  // On a phone the builder shows a one-line summary of what it watches; tapping it opens the fields (`editing`).
  const [editing, setEditing] = React.useState(() => {
    const id = starter?.templateId ?? arrived?.template.id ?? null;
    const first = AGENT_TEMPLATES.find((entry) => entry.id === id);
    return first ? needsInput(first, starter?.form ?? arrived?.form ?? BLANK) : false;
  });
  React.useEffect(() => {
    // Opened from Edit (or a blocked Save) on a phone: focus goes to the first field. Done keeps focus on the
    // toggle, which stays in place. A desktop shows the fields all along and keeps focus where it is.
    const phone = window.matchMedia("(max-width: 639.98px)").matches;
    if (phone && focusAfter.current === "fields" && editing) fieldsRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    focusAfter.current = null;
  }, [editing]);
  const [replayFor, setReplayFor] = React.useState<string>(starter?.key ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  // The plan's lock for an agent the server just saved paused (lib/entitlements.ts agents / agent_events).
  const [lock, setLock] = React.useState<{ feature: "agents" | "agent_events"; plan: Plan } | null>(null);
  const [allTemplates, setAllTemplates] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  /** The payload of an agent loaded into the builder from the plain-English box, while it is unchanged. */
  const [fromWords, setFromWords] = React.useState<string | null>(null);
  const builderRef = React.useRef<HTMLDivElement>(null);
  const fieldsRef = React.useRef<HTMLDListElement>(null);
  // Opening the fields from the phone summary moves focus to the first one.
  const focusAfter = React.useRef<"fields" | "toggle" | null>(null);

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
      template.id === "price-level" || form.scope === "tickers"
        ? { kind: "tickers", tickers }
        : form.scope === "any"
          ? { kind: "any" }
          : { kind: "watchlist" };
    let trigger = base.trigger;
    if (trigger.type === "price" && template.id === "price-level") trigger = { type: "price", rule: form.direction, level: Number(form.level) || 0 };
    else if (trigger.type === "price" && template.id === "big-move") trigger = { type: "price", rule: "moves_pct", pct: Number(form.pct) || 5 };
    else if (trigger.type === "event" && trigger.event === "earnings_approaching") trigger = { ...trigger, days_before: Number(form.days) || 3 };
    else if (trigger.type === "schedule" && trigger.cadence === "weekly") trigger = { ...trigger, weekday: form.weekday };
    if (trigger.type === "event" && (trigger.event === "sec_filing" || trigger.event === "news")) {
      trigger = { ...trigger, ...(form.filings ? { filings: form.filings } : {}), ...(form.news ? { news: form.news } : {}) };
    }
    return { trigger, scope };
  }, [form, template]);
  // A phone's Save bar sticks above the tab bar only once the draft's title has scrolled off the top, so it never
  // covers the example while "Build my agent" is still the main thing on screen; before that it sits at the card's foot.
  const saveSentinel = React.useRef<HTMLDivElement>(null);
  const [stickSave, setStickSave] = React.useState(false);
  const draftOpen = Boolean(template && draftPreview);
  React.useEffect(() => {
    const node = saveSentinel.current;
    if (!draftOpen || !node || typeof IntersectionObserver === "undefined") {
      setStickSave(false);
      return;
    }
    // The phone's top bar is 52px tall, so the title counts as passed once it is behind it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const top = entry.rootBounds?.top ?? 0;
        setStickSave(!entry.isIntersecting && entry.boundingClientRect.top < top);
      },
      { rootMargin: "-52px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [draftOpen, linkedOpen]);

  const runsByJob = React.useMemo(() => {
    const map = new Map<string, AgentRun[]>();
    for (const run of runs) map.set(run.job_id, [...(map.get(run.job_id) ?? []), run]);
    return map;
  }, [runs]);
  const statuses = React.useMemo(() => orderJobs(jobs, runsByJob, levels), [jobs, runsByJob, levels]);

  React.useEffect(() => {
    if (focusJobId) document.getElementById(`job-${focusJobId}`)?.scrollIntoView({ block: "start" });
    // Links to one agent (#job-…, from the inbox or an email) open that job without reloading the page.
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
    setLock(null);
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = (await response.json().catch(() => null)) as (T & { error?: string; feature?: string; plan?: Plan }) | null;
      // A plan refusal (switching on a filing or news agent on Free, or past the agent limit) shows the lock card, not an error.
      if (!response.ok && body && (body.feature === "agents" || body.feature === "agent_events") && body.plan && body.plan !== "pro") {
        setLock({ feature: body.feature, plan: body.plan });
        trackLimitHit({ feature: body.feature, plan: body.plan, code: body.feature === "agent_events" ? "pro_only_trigger" : "switch_on_at_limit" });
        return null;
      }
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
    setLinkedOpen(false);
    setTemplateId(next.id);
    setReplay(null);
    setError(null);
    setNotice(null);
    const nextForm: Form = { ...BLANK, scope: signedIn && tracked > 0 && next.id !== "price-level" ? "watchlist" : "tickers" };
    setForm(nextForm);
    setEditing(needsInput(next, nextForm));
    requestAnimationFrame(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function openFields() {
    focusAfter.current = "fields";
    setEditing(true);
  }

  async function replayPayload(key: string, templateForTracking: string) {
    const body = await call<{ replay: Replay }>("replay", "/api/agent-jobs/replay", { method: "POST", body: key });
    trackAgentPreviewed({ template: templateForTracking, ok: Boolean(body) });
    if (body) {
      setReplay(body.replay);
      setReplayFor(key);
    }
  }

  async function runReplay() {
    if (!payload || !template) return;
    await replayPayload(payloadKey, template.id);
  }

  // The plain-English box read the person's words as an agent. While the builder still shows the untouched
  // example, that unrelated example gives way: to a preview of the agent they asked for when the builder offers
  // it, otherwise the builder closes, so two different agents never sit one above the other.
  // A later read replaces an agent loaded from earlier words too, as long as the person has not changed it here.
  const wordsShowing = Boolean(fromWords && fromWords === payloadKey);
  const linkedUntouched = Boolean(linkedOpen && arrived && payloadKey === arrived.key);
  const exampleShowing = Boolean(starter && templateId === starter.templateId && replayFor === starter.key && !fromWords) || wordsShowing || linkedUntouched;
  const exampleRef = React.useRef({ replaceable: exampleShowing, words: wordsShowing });
  exampleRef.current = { replaceable: exampleShowing, words: wordsShowing };
  const onPlainRead = React.useCallback(
    (drafts: AgentJobDraft[] | null) => {
      if (!exampleRef.current.replaceable) return;
      if (!drafts?.length) {
        // Saved from the box above, or nothing understood: an agent from those words is no longer "not switched on".
        if (exampleRef.current.words) {
          setTemplateId(null);
          setReplay(null);
          setFromWords(null);
        }
        return;
      }
      const next = formFromDraft(drafts[0]!, offered);
      setLinkedOpen(false);
      if (!next) {
        setTemplateId(null);
        setReplay(null);
        setFromWords(null);
        return;
      }
      const key = JSON.stringify(payloadFor(next.template, next.form, signedIn));
      setTemplateId(next.template.id);
      setForm(next.form);
      setEditing(needsInput(next.template, next.form));
      setReplay(null);
      setFromWords(key);
      // Signed out there is no list of theirs to replay, so "anything I own" is shown without a replay; the card says why.
      if (signedIn || next.form.scope === "tickers") void replayPayload(key, next.template.id);
    },
    // replayPayload only uses setters and `call`, which read no changing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offered, signedIn],
  );

  async function create(body: string, key: string) {
    const result = await call<{ job: AgentJob; paused?: { message?: string; feature?: "agents" | "agent_events"; plan?: Plan } | null }>(key, "/api/agent-jobs", {
      method: "POST",
      body,
    });
    if (!result) return;
    setLock(!result.job.enabled && result.paused?.feature && result.paused.plan ? { feature: result.paused.feature, plan: result.paused.plan } : null);
    trackAgentSwitchedOn({ template: result.job.template, via: key === "create" ? "create" : "quick_start", enabled: result.job.enabled });
    // Saved but switched off: the plan's agent limit (lib/entitlements.ts `agents`).
    if (!result.job.enabled && result.paused) trackLimitHit({ feature: result.paused.feature ?? "agents", code: result.paused.feature === "agent_events" ? "pro_only_trigger" : "paused_at_limit" });
    setJobs((current) => [...current, result.job]);
    setOpenJob(result.job.id);
    setTemplateId(null);
    setReplay(null);
    setAdding(false);
    // Saved: a reload must not offer the same agent again from the address it came in on. Through the router, so a
    // later refresh does not put the old address back.
    if (linkedOpen || /[?&](?:draft|q)=/.test(window.location.search)) router.replace("/agents", { scroll: false });
    setLinkedOpen(false);
    // Past the plan's limit the server saves the job switched off and says why.
    setNotice(
      result.paused?.message && !result.job.enabled
        ? // The lock card under this note says why and what the ways out are; on Pro (no card) the server's message does.
          result.paused.plan && result.paused.plan !== "pro"
          ? `"${result.job.name}" is saved and paused.`
          : `"${result.job.name}": ${result.paused.message}`
        : `"${result.job.name}" is on. Its reports show up here, starting with its next check.`,
    );
  }

  async function turnOn() {
    if (!payload) return;
    // Something is missing or wrong (no ticker, no price): say so and open the fields on a phone, where they may be folded.
    if (savable && !savable.ok) {
      setError(savable.error);
      openFields();
      return;
    }
    await create(payloadKey, "create");
  }

  // The agent as it would be saved, checked the way the server checks it. Signed out, "the stocks I track" stays
  // that, so after signing in it watches their list instead of an empty one.
  const savable = React.useMemo(
    () => (template ? parseJobDraft(payloadFor(template, form, true), { hidden: hiddenTemplates ?? [] }) : null),
    [form, hiddenTemplates, template],
  );
  const already = Boolean(signedIn && savable?.ok && jobs.some((job) => sameJob(job, savable.draft)));

  async function saveSignedOut() {
    if (!savable) return;
    if (!savable.ok) {
      setError(savable.error);
      openFields();
      return;
    }
    setBusy("signin");
    setError(null);
    try {
      await signInKeepingDraft(draftHref(savable.draft));
    } catch (cause) {
      setBusy(null);
      const code = (cause as { code?: unknown } | null)?.code;
      if (typeof code === "string" && SIGN_IN_CANCELLED.has(code)) return;
      setError("Sign-in did not finish. This agent is still here, so try again when you are ready.");
    }
  }

  // Arrived with an agent: replay it straight away (reads only), so the last four weeks are there to look at.
  // Signed out, a replay needs named stocks (at most five, as the route allows).
  const replayedOnArrival = React.useRef(false);
  React.useEffect(() => {
    if (replayedOnArrival.current || !arrived) return;
    replayedOnArrival.current = true;
    const names = arrived.form.tickers.split(/[\s,;]+/).filter(Boolean).length;
    if (!signedIn && (arrived.form.scope !== "tickers" || names === 0 || names > 5)) return;
    void replayPayload(arrived.key, arrived.template.id);
    // Once per arrival; replayPayload only uses setters and `call`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Signed out, "the stocks I track" can still be picked: it is what gets saved, and it takes effect after signing in.
  const needsTickers = template ? template.id === "price-level" || form.scope === "tickers" : false;
  const hasJobs = signedIn && jobs.length > 0;
  const showTemplates = !hasJobs || adding;

  const LABEL = "text-[12.5px] font-medium text-oa-muted-fg";
  const namesTyped = form.tickers.split(/[\s,;]+/).filter(Boolean).length;
  // Signed out, a replay needs stocks named here: there is no list of theirs to read yet.
  const replayBlocked = !signedIn && (needsTickers ? namesTyped === 0 : form.scope === "watchlist");
  // Signed in with nothing tracked, "the stocks I track" would save an agent with nothing to watch.
  const emptyList = signedIn && tracked === 0 && !needsTickers && form.scope === "watchlist";
  // On a phone the fields stay open while something only the person can fix is missing (the notes under them say what).
  const fieldsLocked = Boolean(template && (needsInput(template, form) || replayBlocked || emptyList));
  const fieldsOpen = editing || fieldsLocked;
  // Once open for a missing field, they stay open: filling it in must not fold them away mid-typing.
  React.useEffect(() => {
    if (fieldsLocked) setEditing(true);
  }, [fieldsLocked]);
  const summary = template && draftPreview ? watchSummary(draftPreview, { signedIn, tracked, title: template.title }) : "";

  const messages = (
    <>
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
      {lock ? <LockCard feature={lock.feature} plan={lock.plan} /> : null}
    </>
  );

  const builder =
    template && draftPreview ? (
      // overflow-clip, not hidden: the phone's Save bar sticks inside this card, and a hidden overflow would stop it.
      <section aria-labelledby="draft-title" className={CARD.replace("overflow-hidden", "overflow-clip")}>
        <div ref={builderRef} className="grid min-w-0 content-start gap-3.5 px-3.5 py-3.5 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="draft-title" className="text-pretty text-[17px] font-semibold leading-6 text-oa-fg">
                {describeJob(draftPreview)}
              </h2>
              {starter && replayFor === starter.key && replayIsCurrent ? (
                <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
                  This is an example, and it is not switched on.{" "}
                  {sample?.draft.scope.kind === "tickers" && sample.draft.scope.tickers.length === 1
                    ? `It watches ${sample.draft.scope.tickers[0]} over the last four weeks of real prices. Change anything, or pick a different agent below.`
                    : "It watches Nvidia, Apple, Microsoft, Amazon and Tesla over the last four weeks of real prices. Change anything, or pick a different agent below."}
                </p>
              ) : fromWords && fromWords === payloadKey ? (
                <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
                  This is the agent you described above, and it is not switched on yet. Save it above, or change it here.
                </p>
              ) : (
                <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">Nothing is saved yet. Change anything here, then save it.</p>
              )}
              {linkedOpen && arrived?.note ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{arrived.note}</p> : null}
              {sourceNote(template, available) ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{sourceNote(template, available)}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setTemplateId(null);
                setLinkedOpen(false);
              }}
              className="-mr-1 h-8 shrink-0 cursor-pointer px-1 text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg"
            >
              Close
            </button>
          </div>
          {/* Where the phone's Save bar starts to stick: the draft's title and its note have been scrolled past. */}
          <div ref={saveSentinel} aria-hidden="true" className="-mt-3.5 h-0" />

          {/* A phone gets the agent in three short lines; the first one opens and closes the fields under it. */}
          <div className="overflow-hidden rounded-xl border border-oa-border bg-oa-bg sm:hidden">
            {fieldsLocked ? (
              // Something only the person can type is still missing, so the fields stay open and there is nothing to toggle.
              <p className="flex min-h-11 items-center px-3.5 py-2 text-pretty text-[14px] font-medium leading-5 text-oa-fg">{summary}</p>
            ) : (
              <button
                type="button"
                aria-expanded={editing}
                aria-controls="draft-fields"
                onClick={() => (editing ? setEditing(false) : openFields())}
                className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
              >
                <span className="min-w-0 text-pretty text-[14px] font-medium leading-5 text-oa-fg">{summary}</span>
                <span className="shrink-0 text-[13px] font-medium text-oa-primary">{editing ? "Done" : "Edit"}</span>
              </button>
            )}
            {fieldsOpen ? null : (
              <div className="border-t border-oa-border px-3.5 py-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">
                <p>{checksWhenShort(draftPreview.trigger, schedule?.time)}</p>
                <p>{tellsShort(draftPreview.trigger)}</p>
              </div>
            )}
          </div>

          <dl ref={fieldsRef} id="draft-fields" className={`grid gap-x-5 gap-y-3 rounded-xl border border-oa-border bg-oa-bg px-3.5 py-3 sm:grid-cols-2 ${fieldsOpen ? "" : "max-sm:hidden"}`}>
            <div className="grid min-w-0 content-start gap-1">
              <dt className={LABEL}>What it watches</dt>
              <dd className="min-w-0">
                {template.fields.some((field) => field === "direction" || field === "level" || field === "pct" || field === "days_before" || field === "weekday") ? (
                  <div className="flex flex-wrap items-center gap-2 text-[14px] text-oa-fg">
                    {template.fields.includes("direction") ? (
                      <>
                        <span>Closes</span>
                        <select aria-label="Above or below" className={`${INLINE_INPUT}`} value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Form["direction"] })}>
                          <option value="crosses_below">below</option>
                          <option value="crosses_above">above</option>
                        </select>
                      </>
                    ) : null}
                    {template.fields.includes("level") ? (
                      <input
                        aria-label="Price in dollars"
                        className={`${INLINE_INPUT} oa-mono w-28`}
                        inputMode="decimal"
                        value={form.level}
                        placeholder="$180"
                        onChange={(event) => setForm({ ...form, level: event.target.value })}
                      />
                    ) : null}
                    {template.fields.includes("pct") ? (
                      <>
                        <span>Moves at least</span>
                        <input aria-label="Move in percent" className={`${INLINE_INPUT} oa-mono w-20`} inputMode="decimal" value={form.pct} onChange={(event) => setForm({ ...form, pct: event.target.value })} />
                        <span>% in a day</span>
                      </>
                    ) : null}
                    {template.fields.includes("days_before") ? (
                      <>
                        <input aria-label="Days before earnings" className={`${INLINE_INPUT} oa-mono w-16`} inputMode="numeric" value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} />
                        <span>calendar days before earnings</span>
                      </>
                    ) : null}
                    {template.fields.includes("weekday") ? (
                      <>
                        <span>Every</span>
                        <select aria-label="Day of the week" className={`${INLINE_INPUT}`} value={form.weekday} onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}>
                          {WEEKDAYS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </div>
                ) : (
                  // The filled-in trigger ("8-K filing", "News turns negative"), not the template's generic name.
                  <p className="text-pretty text-[14px] leading-5 text-oa-fg">{draftPreview ? triggerLabel(draftPreview.trigger) : template.title}</p>
                )}
              </dd>
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <dt className={LABEL}>Which stocks</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-2">
                {template.id !== "price-level" ? (
                  <select
                    aria-label="Which stocks"
                    className={`${INLINE_INPUT}`}
                    value={form.scope}
                    onChange={(event) => setForm({ ...form, scope: event.target.value as Form["scope"] })}
                  >
                    <option value="watchlist">{signedIn ? `The stocks I track (${tracked})` : "The stocks I track"}</option>
                    <option value="tickers">Stocks I choose</option>
                    {template.defaults.trigger.type === "event" && ["fund_13f", "congress_trade", "insider_trade"].includes(template.defaults.trigger.event) ? (
                      <option value="any">Any stock</option>
                    ) : null}
                  </select>
                ) : null}
                {needsTickers ? (
                  <input
                    aria-label={template.id === "price-level" ? "Ticker" : "Tickers"}
                    className={`${INLINE_INPUT} oa-mono min-w-0 flex-1 basis-40 uppercase`}
                    value={form.tickers}
                    placeholder={template.id === "price-level" ? "AAPL" : "AAPL, NVDA, MSFT"}
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => setForm({ ...form, tickers: event.target.value })}
                  />
                ) : null}
              </dd>
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <dt className={LABEL}>When it checks</dt>
              <dd className="text-pretty text-[14px] leading-5 text-oa-fg">{checksWhen(draftPreview.trigger, schedule)}</dd>
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <dt className={LABEL}>How it tells you</dt>
              <dd className="text-pretty text-[14px] leading-5 text-oa-fg">
                A short report here after every check, and an email when it finds something. You can switch the emails off in your profile.
              </dd>
            </div>
          </dl>

          {replayShown && replay ? (
            <ReplayPanel replay={replay} job={draftPreview} />
          ) : busy === "replay" ? (
            <p role="status" className="rounded-xl border border-oa-border bg-oa-bg px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg">
              Replaying the last four weeks of real closes…
            </p>
          ) : emptyList ? (
            <p className="rounded-xl border border-oa-border bg-oa-bg px-3.5 py-3 text-pretty text-[14px] leading-5 text-oa-fg">
              You don&apos;t track any stocks yet, so this has nothing to watch until you add some in{" "}
              <Link href="/portfolio" className="font-medium underline underline-offset-2">
                My stocks
              </Link>
              . Or choose stocks above instead.
            </p>
          ) : replayBlocked ? (
            <p className="rounded-xl border border-oa-border bg-oa-bg px-3.5 py-3 text-pretty text-[14px] leading-5 text-oa-fg">
              {needsTickers
                ? "Type a ticker or two above to see what it would have said over the last four weeks."
                : "Once you sign in, it watches the stocks you track. To see what it would have said over the last four weeks, choose stocks above and type a ticker or two."}
            </p>
          ) : null}

          {/* On a phone the wrapper steps aside (contents) so the buttons can stick above the tab bar once the draft's title
              has been scrolled past (stickSave). The offset is the bar's measured height: 57.5px plus its bottom padding,
              max(safe area, 4px). */}
          <div className="flex flex-col gap-2 max-sm:contents sm:flex-row sm:flex-wrap sm:items-center">
            {/* The note comes first so a phone reads it above the Save bar; from sm up it sits after the buttons. */}
            {replay && !replayIsCurrent ? (
              <span className="text-[13px] leading-5 text-oa-muted-fg sm:order-last">You changed it. Update the preview to see the new result.</span>
            ) : draftPreview && plan !== "pro" && !planMayRun(draftPreview, plan === "anon" ? "free" : plan) ? (
              <span className="flex flex-wrap items-center gap-2 text-pretty text-[13px] leading-5 text-oa-muted-fg sm:order-last sm:ml-1">
                <ProMark className="h-[22px]" />
                <span>
                  Agents that read new filings and news are part of Pro. On Free this one saves paused.{" "}
                  <a href="/pricing" className="font-medium text-oa-primary hover:underline">
                    See Pro
                  </a>
                </span>
              </span>
            ) : !signedIn && !already ? (
              <span className="text-pretty text-[13px] leading-5 text-oa-muted-fg sm:order-last sm:ml-1">Saving asks you to sign in. It is free, and this agent stays filled in while you do.</span>
            ) : null}
            <div
              data-stuck={stickSave ? "" : undefined}
              className={`flex items-center gap-2 sm:contents ${
                stickSave
                  ? "max-sm:sticky max-sm:bottom-[calc(58px+max(env(safe-area-inset-bottom),4px))] max-sm:z-20 max-sm:-mx-3.5 max-sm:border-t max-sm:border-oa-border max-sm:bg-oa-card max-sm:px-3.5 max-sm:py-2.5 max-sm:shadow-[0_-6px_18px_-12px_rgba(0,0,0,0.35)]"
                  : ""
              }`}
            >
              {already ? (
                <p className="text-pretty text-[14px] font-medium leading-5 text-oa-fg max-sm:flex-1">You already have this agent.</p>
              ) : signedIn ? (
                <OaButton loading={busy === "create"} onClick={turnOn} className="max-sm:!h-10 max-sm:flex-1">
                  Save this agent
                </OaButton>
              ) : (
                <OaButton loading={busy === "signin"} onClick={saveSignedOut} className="max-sm:!h-10 max-sm:flex-1">
                  Save this agent
                </OaButton>
              )}
              <OaButton
                variant="secondary"
                data-action="replay"
                loading={busy === "replay"}
                disabled={replayBlocked}
                onClick={runReplay}
                // On a phone the preview already on screen needs no second button; it comes back once something changes.
                className={`max-sm:!h-10 ${replayShown ? "max-sm:hidden" : ""}`}
              >
                <span className="sm:hidden">{replay && !replayIsCurrent ? "Update preview" : "Preview"}</span>
                <span className="max-sm:hidden">{replay && !replayIsCurrent ? "Update the preview" : "Preview the last four weeks"}</span>
              </OaButton>
            </div>
          </div>
        </div>
      </section>
    ) : null;


  return (
    <PlainAgentReadContext.Provider value={onPlainRead}>
    <StockNamesContext.Provider value={names ?? NO_NAMES}>
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-2 sm:px-0">
        {/* The place's icon beside its title, as in the nav (owner rule 6), the same way PageHead draws it. */}
        <div className="flex items-center gap-2.5">
          <PageIcon />
          <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">Agents</h1>
        </div>
      </header>
      <p className="-mt-1 max-w-[62ch] text-pretty px-2 text-[15px] leading-[22px] text-oa-muted-fg sm:-mt-2 sm:px-0">
        Each agent watches your stocks for one thing and tells you. Agents never trade.
      </p>

      {/* An agent from a link comes first: it is what the person came here for. */}
      {linkedOpen ? builder : null}
      {linkedOpen ? messages : null}

      {lead}

      {linkedOpen ? null : messages}

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
                proOnly={plan !== "pro" && !planMayRun(status.job, plan)}
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

      {linkedOpen ? null : builder}

      {showTemplates ? (
        <section aria-labelledby="templates-label" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-2 sm:px-0">
            <h2 id="templates-label" className="oa-label">
              {hasJobs ? "Add an agent" : template && draftPreview ? "Other agents you can set up" : "Pick an agent to start"}
            </h2>
            <p className="text-[12.5px] leading-5 text-oa-muted-fg">
              {signedIn
                ? tracked > 0
                  ? `Start watches your ${tracked} tracked names. Pick a card to see its last four weeks first.`
                  : "Track a few stocks first, or pick a card and choose the tickers."
                : "Pick one to try it on the last four weeks of prices before you save it."}
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
                  className={`${CARD} relative flex flex-col gap-2 px-3.5 py-3 transition-colors hover:bg-oa-accent ${active ? "shadow-[inset_0_0_0_1px_var(--oa-primary)]" : ""} ${
                    !allTemplates && index >= PHONE_TEMPLATES ? "max-lg:hidden" : ""
                  }`}
                >
                  {/* The whole card tries the agent; no "Preview" button repeated on every card (owner, Nov 11). */}
                  <button
                    type="button"
                    aria-current={active || undefined}
                    aria-label={`${entry.id === "price-level" ? "Set up" : "Try"}: ${entry.title}`}
                    data-template={entry.id}
                    // The card already open goes back to it instead of starting it over, so a stray tap keeps the edits.
                    onClick={() => (active ? builderRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }) : pick(entry))}
                    className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                  />
                  <div className="min-w-0">
                    <p className="oa-caption">{GROUP_LABEL[entry.group]}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14.5px] font-medium leading-5 text-oa-fg">
                      <KindIcon name={TEMPLATE_ICON[entry.id] ?? "agents"} className="size-4 text-oa-primary" />
                      {entry.title}
                      {unavailable ? <span className="text-[12px] font-normal text-oa-muted-fg">no data yet</span> : null}
                      {taken ? <span className="text-[12px] font-normal text-oa-muted-fg">already running</span> : null}
                    </p>
                    <p className="mt-0.5 text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{entry.tells}</p>
                  </div>
                  {signedIn && oneClick(entry, tracked) && !taken ? (
                    <div className="relative z-10 mt-auto flex items-center gap-2 self-start pt-1">
                      <OaButton size="xs" loading={busy === `start-${entry.id}`} onClick={() => quickStart(entry)} data-template-start={entry.id}>
                        Start
                      </OaButton>
                    </div>
                  ) : null}
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
    </StockNamesContext.Provider>
    </PlainAgentReadContext.Provider>
  );
}

function JobRow({
  status,
  log,
  open,
  tracked,
  busy,
  proOnly = false,
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
  /** Watches filings or news on a plan without them: saved, never run, until Pro (lib/entitlements.ts agent_events). */
  proOnly?: boolean;
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
            {proOnly ? (
              <ProMark className="h-[22px]" />
            ) : !job.enabled ? (
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
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium leading-[22px] text-oa-fg">
              <KindIcon name={TEMPLATE_ICON[job.template] ?? "agents"} className="size-4 text-oa-muted-fg" />
              {jobDisplayName(job.name)}
            </span>
            <span className="text-[12.5px] text-oa-muted-fg">
              {triggerLabel(job.trigger)} · {scopeWords(job, tracked)}
            </span>
          </span>
          <span className={`mt-1 block text-[13.5px] leading-5 ${open ? "" : "line-clamp-2 sm:line-clamp-1"} ${view?.verdict === "quiet" ? "text-oa-muted-fg" : "text-oa-fg"}`}>
            {proOnly ? (
              <span className="text-oa-muted-fg">{PRO_EVENTS_PAUSED} It stays saved and does not run until then.</span>
            ) : view ? (
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
