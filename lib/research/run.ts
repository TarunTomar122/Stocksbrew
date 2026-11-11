import { todayET } from "@/lib/calendar-shared";
import { checkReport } from "@/lib/research/check";
import { shortHeadline } from "@/lib/research/format";
import type { StepContext, StepLoader, StepOutput } from "@/lib/research/gather";
import { SourceBook } from "@/lib/research/sources";
import {
  EMPTY_CHARTS,
  initialSteps,
  reportHref,
  reportKeyAt,
  type ResearchCharts,
  type ResearchEvent,
  type ResearchReport,
  type ResearchStep,
  type ResearchStepId,
} from "@/lib/research/types";
import { costOf, type Writer } from "@/lib/research/write";

/**
 * One research run, start to finish: save a "running" report, read the
 * evidence in fixed steps (a few at a time, each with a time limit), write the
 * report in one model call, check every figure against the evidence, save the
 * result and only then count it against the person's allowance. A failed run
 * is saved as failed and costs the person nothing.
 *
 * Everything with a side effect comes in through `deps`, so the whole sequence
 * runs in tests with fake loaders, a fake writer and an in-memory store.
 */

export type RunInput = { uid: string; isPro: boolean; ticker: string; name: string };

export type RunDeps = {
  loaders: Partial<Record<ResearchStepId, StepLoader>>;
  write: Writer;
  save: (report: ResearchReport) => Promise<void>;
  /** Count the finished report against the allowance. Keyed so a retry never counts twice. */
  consume: (key: string) => Promise<unknown>;
  now?: () => Date;
  stepTimeoutMs?: number;
  writeTimeoutMs?: number;
  concurrency?: number;
  /** Pause before each retry of the final save, in ms. */
  saveRetryMs?: number[];
  /** Save the steps for anyone polling the report page at most this often while evidence is read. */
  progressEveryMs?: number;
  /** The whole run, evidence to final save, finishes inside this budget (the route's maxDuration is 300 s). */
  budgetMs?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
};

export class ResearchError extends Error {
  constructor(
    readonly code: "no_evidence" | "sources_down" | "write_failed" | "not_configured" | "save_failed" | "running",
    message: string,
  ) {
    super(message);
  }
}

const EVIDENCE_STEPS: ResearchStepId[] = ["brief", "financials", "earnings", "annual", "quarterly", "filings", "ownership", "peers", "news", "social"];

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (next < items.length) {
        const item = items[next]!;
        next += 1;
        await work(item);
      }
    }),
  );
}

/** How a step that failed is named in the report's gaps. */
const GAP_NAMES: Partial<Record<ResearchStepId, string>> = {
  brief: "our brief and the price history",
  financials: "the financial statements",
  earnings: "the earnings history",
  annual: "the latest 10-K",
  quarterly: "the latest 10-Q",
  filings: "the recent SEC filings",
  ownership: "the fund, insider and Congress trades",
  peers: "the peer comparison",
  news: "the news",
  social: "Reddit and policy posts",
};

const STAT_ORDER = ["Price", "1 year", "Market value", "P/E", "Revenue growth", "Operating margin", "Net cash", "Net debt"];

function statRank(label: string): number {
  const index = STAT_ORDER.indexOf(label);
  return index < 0 ? STAT_ORDER.length : index;
}

const FRIENDLY: Record<string, string> = {
  research_not_configured: "The research writer is not set up on this server yet.",
};

export async function runResearch(input: RunInput, deps: RunDeps, emit: (event: ResearchEvent) => void): Promise<ResearchReport> {
  const clock = deps.now ?? (() => new Date());
  const started = clock();
  const t0 = Date.now();
  const log = deps.log ?? (() => undefined);
  const key = reportKeyAt(started);
  const steps = initialSteps();
  const charts: ResearchCharts = { ...EMPTY_CHARTS, stats: [] };
  const report: ResearchReport = {
    key,
    uid: input.uid,
    ticker: input.ticker,
    name: input.name,
    status: "running",
    created_at: started.toISOString(),
    updated_at: started.toISOString(),
    finished_at: null,
    steps,
    body: null,
    sources: [],
    charts,
    missing: [],
    audit: null,
    usage: null,
    error: null,
    share_id: null,
  };

  const touch = () => {
    report.updated_at = clock().toISOString();
  };
  // Every save after the first goes through one queue, so a slow progress save can never land after the final one.
  let queue: Promise<unknown> = Promise.resolve();
  const queuedSave = () => {
    const next = queue.then(() => deps.save(report));
    queue = next.catch(() => undefined);
    return next;
  };
  // Progress for the report page's poller: at most one save in flight, and not more often than every few seconds.
  let progressBusy = false;
  let lastProgress = Date.now();
  const saveProgress = () => {
    if (progressBusy || Date.now() - lastProgress < (deps.progressEveryMs ?? 2500)) return;
    progressBusy = true;
    lastProgress = Date.now();
    touch();
    void queuedSave()
      .catch(() => undefined)
      .finally(() => {
        progressBusy = false;
      });
  };
  // The last write decides what the person sees; one store hiccup must not leave a report "still being written".
  const saveFinal = async () => {
    const pauses = deps.saveRetryMs ?? [400, 1200];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await queuedSave();
        return;
      } catch (error) {
        if (attempt >= pauses.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, pauses[attempt]));
      }
    }
  };
  const setStep = (id: ResearchStepId, patch: Partial<ResearchStep>) => {
    const step = steps.find((item) => item.id === id)!;
    Object.assign(step, patch);
    emit({ type: "step", step: { ...step } });
  };

  try {
    await deps.save(report);
  } catch (error) {
    // The store refuses a second report while one is still being written (checked inside its transaction).
    if (error instanceof Error && error.message === "research_running") {
      emit({ type: "error", code: "running", message: "Your other report is still being written. One at a time: it takes a minute or two." });
      report.status = "failed";
      report.error = "running";
      return report;
    }
    log("research_save_failed", { ticker: input.ticker, error: String(error) });
    emit({ type: "error", code: "save_failed", message: "We could not start the report just now. Nothing was counted. Try again in a minute." });
    report.status = "failed";
    report.error = "save_failed";
    return report;
  }
  emit({ type: "start", key, ticker: input.ticker, steps: steps.map((step) => ({ ...step })) });

  const book = new SourceBook();
  const ctx: StepContext = { ticker: input.ticker, uid: input.uid, isPro: input.isPro, now: started, book, charts, dates: new Set(), edgar: {} };
  const facts: Record<string, unknown> = {};
  const missing: string[] = [];
  // One deadline for the whole run: evidence gets the first part, the writer what is left minus room to save.
  const deadline = t0 + (deps.budgetMs ?? 270_000);
  const evidenceDeadline = t0 + Math.round((deps.budgetMs ?? 270_000) * 0.42);

  try {
    await eachLimited(EVIDENCE_STEPS, deps.concurrency ?? 4, async (id) => {
      const loader = deps.loaders[id];
      if (!loader) {
        setStep(id, { status: "empty", detail: "Not available here." });
        return;
      }
      setStep(id, { status: "running" });
      let output: StepOutput;
      try {
        const limit = Math.max(1, Math.min((deps.stepTimeoutMs ?? 30_000) * (id === "annual" || id === "quarterly" ? 1.5 : 1), evidenceDeadline - Date.now()));
        output = await withTimeout(loader(ctx), limit, id);
      } catch (error) {
        log("research_step_failed", { ticker: input.ticker, step: id, error: String(error).slice(0, 200) });
        missing.push(`We could not read ${GAP_NAMES[id] ?? "one of the sources"} when this report was written.`);
        setStep(id, { status: "failed", detail: "Could not be read." });
        return;
      }
      if (output.facts) facts[id] = output.facts;
      for (const line of output.missing ?? []) if (!missing.includes(line)) missing.push(line);
      setStep(id, { status: output.status, detail: output.detail });
      saveProgress();
    });

    report.sources = book.all();
    report.missing = missing;
    // Steps finish in any order; the stat strip reads the same way every time.
    charts.stats.sort((a, b) => statRank(a.label) - statRank(b.label));

    const found = Object.keys(facts);
    if (!found.includes("brief") && found.length < 3) {
      const unread = steps.filter((step) => step.status === "failed").length;
      if (unread >= 3) {
        throw new ResearchError("sources_down", "We could not reach enough of our data just now to write a fair report. Nothing was counted. Try again in a few minutes.");
      }
      throw new ResearchError("no_evidence", "We could not find enough about this company to write a fair report. Nothing was counted.");
    }

    // Saved with the writer already running, so the report page shows "Writing the report" for the long wait.
    setStep("write", { status: "running", detail: `${report.sources.length} sources` });
    touch();
    await queuedSave().catch(() => undefined);
    let written;
    // Room left for the check and the final save; the model call is cancelled, not just abandoned, at the limit.
    const writeMs = Math.max(1_000, Math.min(deps.writeTimeoutMs ?? 170_000, deadline - Date.now() - 15_000));
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), writeMs);
    try {
      written = await withTimeout(
        deps.write({ ticker: input.ticker, name: input.name, today: todayET(started), sources: report.sources, facts, missing, signal: abort.signal }),
        writeMs,
        "write",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStep("write", { status: "failed", detail: "The writer did not finish." });
      if (message === "research_not_configured") throw new ResearchError("not_configured", FRIENDLY[message]!);
      log("research_write_failed", { ticker: input.ticker, error: message.slice(0, 300) });
      throw new ResearchError("write_failed", "The report could not be written just now. Nothing was counted. Try again in a minute.");
    } finally {
      clearTimeout(abortTimer);
    }
    setStep("write", { status: "done", detail: null });

    setStep("check", { status: "running" });
    const evidence = { facts, sources: report.sources };
    const checked = checkReport({ body: written.body, evidence, sourceIds: new Set(report.sources.map((source) => source.id)), dates: ctx.dates });
    const body = checked.body;
    const sections = body.business.length + body.drivers.length + body.bull.length + body.bear.length + body.valuation.length + body.numbers.length;
    if (body.summary.length === 0 && sections === 0) {
      setStep("check", { status: "failed", detail: "Too little survived the check." });
      throw new ResearchError("write_failed", "The draft did not hold up against the evidence, so we did not save it. Nothing was counted. Try again.");
    }
    if (!body.headline) body.headline = body.summary[0]?.replace(/\[S\d+\]/g, "").trim() || `${input.name}: the long research report`;
    body.headline = shortHeadline(body.headline);
    // "What to watch next" looks ahead: a date already past keeps its line but loses the date.
    const today = todayET(started);
    body.watch = body.watch.map((item) => (item.date && item.date < today ? { ...item, date: null } : item));
    const removed = checked.audit.removed.length;
    setStep("check", {
      status: "done",
      detail: `${checked.audit.traced} of ${checked.audit.checked} figures matched the sources${removed ? `, ${removed} sentence${removed === 1 ? "" : "s"} removed` : ""}`,
    });

    const ms = Date.now() - t0;
    report.body = body;
    report.audit = checked.audit;
    report.usage = {
      via: written.via,
      model: written.model,
      input_tokens: written.input_tokens,
      output_tokens: written.output_tokens,
      cost_usd: costOf(written.model, written.input_tokens, written.output_tokens),
      ms,
    };
    report.status = "ready";
    report.finished_at = clock().toISOString();
    touch();
    try {
      await saveFinal();
    } catch (error) {
      log("research_save_failed", { ticker: input.ticker, error: String(error) });
      throw new ResearchError("save_failed", "The report was written but could not be saved. Nothing was counted. Try again in a minute.");
    }
    // Counted only once the report is saved, so a failure never costs a person a report.
    await deps.consume(key).catch((error) => log("research_meter_failed", { error: String(error) }));
    log("research_usage", {
      ticker: input.ticker,
      via: written.via,
      model: written.model,
      input_tokens: written.input_tokens,
      output_tokens: written.output_tokens,
      cost_usd: report.usage.cost_usd,
      ms,
      sources: report.sources.length,
      figures_checked: checked.audit.checked,
      sentences_removed: removed,
    });
    emit({ type: "done", key, href: reportHref(input.ticker, key), removed });
    return report;
  } catch (error) {
    const known = error instanceof ResearchError ? error : null;
    if (!known) log("research_failed", { ticker: input.ticker, error: String(error).slice(0, 300) });
    report.status = "failed";
    report.error = known?.code ?? "failed";
    report.finished_at = clock().toISOString();
    for (const step of steps) if (step.status === "running" || step.status === "pending") step.status = step.status === "running" ? "failed" : "pending";
    touch();
    await saveFinal().catch((saveError) => log("research_save_failed", { ticker: input.ticker, error: String(saveError).slice(0, 200) }));
    emit({ type: "error", code: known?.code ?? "failed", message: known?.message ?? "Something went wrong while writing the report. Nothing was counted. Try again." });
    return report;
  }
}
