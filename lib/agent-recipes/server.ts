/**
 * Server side of agent recipes: who the subject is (a covered stock, a fund or a member of Congress from /follow, or
 * the person's own basket or thesis), which recipes already stand as jobs, how much room the plan has, the replay, and
 * saving one. The draft is always rebuilt here from the recipe catalog; nothing a browser sends is saved as a rule.
 */

import { unstable_cache } from "next/cache";

import { planMayRun, PRO_EVENTS_PAUSED, triggerLabel, type AgentJob, type AgentJobDraft } from "@/lib/agent-jobs";
import { agentMarketDay, createJob, listJobs, replayDraft, AgentJobError } from "@/lib/agent-jobs-data";
import { runningBasketCount } from "@/lib/basket-agent/count";
import { getBasket } from "@/lib/basket-agent/data";
import { limitFor, type Plan } from "@/lib/entitlements";
import { getFollowProfile } from "@/lib/follow";
import { getScreenerRows } from "@/lib/screener";
import { createIpRateLimiter } from "@/lib/ip-rate-limit";

import { parseSubjectKey, recipeById, recipesFor, standingJob, type Recipe, type RecipeId, type RecipeSubject } from "./recipes";
import { replayView, type ReplayView } from "./view";

export class RecipeError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "RecipeError";
  }
}

/** The subject a page named ("stock:NVDA", "fund:berkshire-hathaway", "congress:nancy-pelosi", "basket:<id>"), or an error. */
export async function resolveSubject(raw: unknown, uid: string | null): Promise<RecipeSubject> {
  const key = parseSubjectKey(raw);
  if (!key) throw new RecipeError("That page has no agent recipes.", 404);
  if (key.kind === "stock") {
    const row = (await getScreenerRows([key.id]).catch(() => new Map())).get(key.id);
    if (!row) throw new RecipeError("We don't cover that stock yet.", 404);
    return { kind: "stock", ticker: key.id, name: typeof row.name === "string" && row.name ? row.name : null };
  }
  if (key.kind === "fund" || key.kind === "congress") {
    const profile = await getFollowProfile(key.id).catch(() => null);
    if (!profile || profile.kind !== key.kind) throw new RecipeError("We don't follow that investor.", 404);
    return profile.kind === "fund" ? { kind: "fund", id: profile.slug, name: profile.fund } : { kind: "congress", id: profile.slug, name: profile.name };
  }
  if (!uid) throw new RecipeError("Sign in to set up agents on your basket.", 401);
  const basket = await getBasket(uid, key.id).catch(() => null);
  if (!basket) throw new RecipeError("That basket is not yours or no longer exists.", 404);
  return {
    kind: "basket",
    id: basket.id,
    name: basket.name,
    tickers: basket.lines.map((line) => line.ticker),
    thesis: Boolean(basket.thesis),
    enabled: basket.enabled,
  };
}

export type RecipeRow = Pick<Recipe, "id" | "title" | "line" | "source" | "icon" | "choices"> & {
  /** The rule in a few words, as the agents list says it. */
  rule: string | null;
  /** The person's job that already does this (or the basket's own check, when it is on). */
  standing: { id: string; enabled: boolean; label: string } | null;
  /** Watches filings on a plan without them: saved paused (lib/entitlements.ts agent_events). */
  proOnly: boolean;
  /** Can be replayed and saved: false for a basket with no stocks. */
  ready: boolean;
};

export type RecipeContext = {
  subject: { key: string; kind: RecipeSubject["kind"]; name: string };
  signedIn: boolean;
  plan: Plan;
  /** Agents switched on now (jobs, baskets and theses together) and how many the plan runs. */
  running: number;
  limit: number;
  recipes: RecipeRow[];
};

function subjectName(subject: RecipeSubject): string {
  return subject.kind === "stock" ? subject.ticker : subject.name;
}

function keyOf(subject: RecipeSubject): string {
  return `${subject.kind}:${subject.kind === "stock" ? subject.ticker : subject.id}`;
}

function rowOf(recipe: Recipe, subject: RecipeSubject, jobs: readonly AgentJob[], plan: Plan): RecipeRow {
  const job = standingJob(recipe, jobs);
  const basketOn = recipe.id === "lines" && subject.kind === "basket" && subject.enabled;
  return {
    id: recipe.id,
    title: recipe.title,
    line: recipe.line,
    source: recipe.source,
    icon: recipe.icon,
    ...(recipe.choices ? { choices: recipe.choices } : {}),
    rule: recipe.draft ? triggerLabel(recipe.draft.trigger) : null,
    standing: job
      ? { id: job.id, enabled: job.enabled, label: triggerLabel(job.trigger) }
      : basketOn
        ? { id: subject.id, enabled: true, label: "Checks every night" }
        : null,
    proOnly: recipe.draft ? !planMayRun(recipe.draft, plan) : false,
    ready: recipe.id === "lines" || recipe.draft !== null,
  };
}

/** Everything the sheet needs before a recipe is picked. */
export async function recipeContext(subject: RecipeSubject, viewer: { uid: string | null; plan: Plan }): Promise<RecipeContext> {
  const [jobs, baskets] = viewer.uid
    ? await Promise.all([listJobs(viewer.uid).catch(() => [] as AgentJob[]), runningBasketCount(viewer.uid).catch(() => 0)])
    : [[] as AgentJob[], 0];
  return {
    subject: { key: keyOf(subject), kind: subject.kind, name: subjectName(subject) },
    signedIn: Boolean(viewer.uid),
    plan: viewer.plan,
    running: jobs.filter((job) => job.enabled).length + baskets,
    limit: viewer.uid ? limitFor("agents", viewer.plan) : 0,
    recipes: recipesFor(subject).map((recipe) => rowOf(recipe, subject, jobs, viewer.plan)),
  };
}

/* ── replay ─────────────────────────────────────────────────────────────── */

/**
 * A replay reads a few weeks of filings, trades or closes; one person may start this many in ten minutes (per server
 * instance). Each recipe, size and subject is replayed once per market day and shared (`cachedReplay`), so clicking
 * through a sheet's recipes and sizes costs a store read only the first time anyone does it that day.
 */
export const RECIPE_REPLAYS_PER_WINDOW = 40;
const takeReplay = createIpRateLimiter({ limit: RECIPE_REPLAYS_PER_WINDOW, windowMs: 10 * 60_000 });

export function recipeReplayAllowed(key: string): boolean {
  return takeReplay(`recipe-replay:${key}`).ok;
}

export type RecipeReplay = ReplayView & { recipe: RecipeId; rule: string };

/** One replay per rule per market day, shared across visitors. A failed read throws and is not cached. */
const cachedReplay = unstable_cache(
  async (draftJson: string, _day: string) => replayDraft(null, JSON.parse(draftJson) as AgentJobDraft),
  ["agent-recipe-replay-v1"],
  { revalidate: 6 * 3600 },
);

/** The recipe's four-week replay for this subject, read with no hindsight. Reads only; writes nothing. */
export async function replayRecipe(subject: RecipeSubject, id: string, size: number | null, uid: string | null, now = new Date()): Promise<RecipeReplay> {
  const recipe = recipeById(subject, id, size);
  if (!recipe) throw new RecipeError("Pick one of the recipes on offer.");
  if (!recipe.draft) throw new RecipeError("This one has its own replay on its page.");
  // Every recipe names its stocks or its investor outright, so its replay is the same for everyone: read with no
  // account (no plan-covered levels; recipes never use them) and shared for the market day.
  void uid;
  const day = agentMarketDay(now);
  const replay = await cachedReplay(JSON.stringify(recipe.draft), day);
  return { ...replayView(replay, day), recipe: recipe.id, rule: triggerLabel(recipe.draft.trigger) };
}

/* ── switching it on ────────────────────────────────────────────────────── */

export type SavedRecipe = {
  job: AgentJob;
  /** Saved switched off, and why, said once. */
  paused: string | null;
  /** It already stood: nothing new was saved. */
  existing: boolean;
};

/**
 * Save the recipe as a job. Past the plan's room (jobs, baskets and theses together) or on a plan without filing
 * watches it is saved switched off, never thrown away (createJob decides). A recipe that already stands saves nothing.
 */
export async function saveRecipe(subject: RecipeSubject, id: string, size: number | null, uid: string, plan: Plan, now = new Date()): Promise<SavedRecipe> {
  const recipe = recipeById(subject, id, size);
  if (!recipe?.draft) throw new RecipeError("Pick one of the recipes on offer.");
  const jobs = await listJobs(uid);
  const already = standingJob(recipe, jobs);
  if (already) return { job: already, paused: already.enabled ? null : "You already have this one, paused.", existing: true };
  const limit = limitFor("agents", plan);
  try {
    const job = await createJob(uid, recipe.draft, now, limit, plan);
    const paused = job.enabled
      ? null
      : !planMayRun(recipe.draft, plan)
        ? PRO_EVENTS_PAUSED
        : `Saved and paused: your plan runs ${limit === 1 ? "one agent" : `${limit} agents`} at a time.`;
    return { job, paused, existing: false };
  } catch (error) {
    if (error instanceof AgentJobError) throw new RecipeError(error.message, error.status);
    throw error;
  }
}
