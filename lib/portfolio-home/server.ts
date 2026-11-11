import { cache } from "react";

import { buildDividendRead } from "@/lib/dividend-plan";
import { exampleSeeds, holdingSeeds, loadDividendPlan } from "@/lib/dividend-plan-data";
import { loadExampleSeason, loadUserSeason } from "@/lib/earnings-season-data";
import { getViewer, type Viewer } from "@/lib/entitlements-server";
import { loadExampleGoal, loadUserGoal } from "@/lib/goal/data";
import { loadExampleMemo, type MemoPageData } from "@/lib/memo/server";
import { listMemos, readMemo } from "@/lib/memo/store";
import { newYorkToday } from "@/lib/portfolio-data";
import { loadExampleIdeas, loadUserIdeas } from "@/lib/portfolio-ideas/server";
import { DEFAULT_RATES } from "@/lib/portfolio-ideas/tax";
import { loadExampleStress, loadUserStress } from "@/lib/stress-test-data";
import { getUserDoc, type UserDoc } from "@/lib/watchlist";
import { loadExampleXray, loadUserXray } from "@/lib/xray-data";

import type { DividendSource, HomeMode, HomeSources, Loaded } from "./pick";

/**
 * Loads every portfolio tool's own data for the My stocks overview, all at
 * once, each with its own time limit. A source that is slow or breaks comes
 * back as "slow" or "failed" and the page says so for that tool only; the rest
 * still render. The loaders are the tools' own (each page calls the same one),
 * so the overview never works a number out differently from the page it links to.
 */

/** How long one source may take before the overview goes on without it. */
export const SOURCE_TIMEOUT_MS = 6000;

/** Why a signed-in person sees the example, so the page can say it. */
export type ExampleReason = "signed-out" | "read-failed" | "no-holdings" | "watching-only" | "no-us-holdings";

export type HomeContext = {
  viewer: Viewer;
  mode: HomeMode;
  reason: ExampleReason | null;
};

export type HomeLoad = { context: Promise<HomeContext>; sources: { [K in keyof HomeSources]: Promise<HomeSources[K]> } };

export function withTimeout<T>(work: Promise<T | null>, label: string, ms = SOURCE_TIMEOUT_MS): Promise<Loaded<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<Loaded<T>>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[portfolio-home] ${label} took longer than ${ms}ms; showing the page without it`);
      resolve({ state: "slow" });
    }, ms);
  });
  const done = work.then(
    (value): Loaded<T> => (value === null || value === undefined ? { state: "empty" } : { state: "ready", value }),
    (error): Loaded<T> => {
      console.warn(`[portfolio-home] ${label} failed:`, error instanceof Error ? error.message : error);
      return { state: "failed" };
    },
  );
  return Promise.race([done, slow]).finally(() => clearTimeout(timer));
}

function usHoldings(userDoc: UserDoc | null): { holdings: number; usHoldings: number; tracked: number } {
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks!.filter((id): id is string => typeof id === "string") : [];
  const kinds = userDoc?.watchlist_positions ?? {};
  const held = tracked.filter((id) => kinds[id] === "holding");
  return { holdings: held.length, usHoldings: held.filter((id) => id.startsWith("US_")).length, tracked: tracked.length };
}

async function resolveContext(): Promise<HomeContext & { userDoc: UserDoc | null }> {
  const viewer = await getViewer();
  if (!viewer.uid) return { viewer, mode: "example", reason: "signed-out", userDoc: null };
  let failed = false;
  const userDoc = await getUserDoc(viewer.uid).catch((error) => {
    console.warn("[portfolio-home] user read failed:", error instanceof Error ? error.message : error);
    failed = true;
    return null;
  });
  if (failed || !userDoc) return { viewer, mode: "example", reason: failed ? "read-failed" : "no-holdings", userDoc: null };
  const counts = usHoldings(userDoc);
  if (counts.usHoldings > 0) return { viewer, mode: "mine", reason: null, userDoc };
  const reason: ExampleReason = counts.holdings > 0 ? "no-us-holdings" : counts.tracked > 0 ? "watching-only" : "no-holdings";
  return { viewer, mode: "example", reason, userDoc };
}

/**
 * The person's latest stored memo, read only. Writing this week's memo can
 * call a model, so that stays with /portfolio/memo (opening it writes the
 * week's memo); the overview never starts a write it might not wait for.
 */
async function storedMemo(uid: string): Promise<MemoPageData | null> {
  const history = await listMemos(uid);
  const latest = history[0];
  if (!latest) return null;
  const stored = await readMemo(uid, latest.weekKey);
  return stored ? { mode: "mine", memo: stored.memo, history, missingWeek: false } : null;
}

async function exampleDividends(): Promise<DividendSource | null> {
  const seeds = await exampleSeeds();
  if (!seeds || seeds.length === 0) return null;
  const { plan } = await loadDividendPlan(seeds);
  return { plan, read: buildDividendRead(plan, { example: true, editHref: "/watchlist" }) };
}

async function userDividends(userDoc: UserDoc): Promise<DividendSource | null> {
  const seeds = holdingSeeds(userDoc);
  if (seeds.length === 0) return null;
  const { plan } = await loadDividendPlan(seeds);
  return { plan, read: buildDividendRead(plan, { example: false, editHref: "/watchlist" }) };
}

/**
 * Starts every source once per request (the feed and each tool card share
 * them) and hands back the promises, so each part of the page can render as
 * soon as its own source is in.
 */
export const loadPortfolioHome = cache((): HomeLoad => {
  // Never rejects: with no viewer at all the page shows the example rather than an error.
  const ctx = resolveContext().catch(async (error) => {
    console.warn("[portfolio-home] viewer failed:", error instanceof Error ? error.message : error);
    const viewer = await getViewer().catch(() => null);
    return {
      viewer: viewer ?? ({ uid: null, signedIn: false, isSubscribed: false, plan: "anon", tracked: [], covered: [], coverage: null, trialEligible: false } as Viewer),
      mode: "example" as const,
      reason: "read-failed" as const,
      userDoc: null,
    };
  });
  const mine = <T,>(label: string, own: (doc: UserDoc, viewer: Viewer) => Promise<T | null>, example: () => Promise<T | null>) =>
    ctx.then((context) => withTimeout<T>(context.mode === "mine" && context.userDoc ? own(context.userDoc, context.viewer) : example(), label));
  // The ideas page's default rates; a person who set other rates sees them on that page.
  const rates = DEFAULT_RATES;
  return {
    context: ctx.then(({ viewer, mode, reason }) => ({ viewer, mode, reason })),
    sources: {
      memo: mine("memo", (_doc, viewer) => (viewer.uid ? storedMemo(viewer.uid) : Promise.resolve(null)), () => loadExampleMemo(newYorkToday(), null, { worded: false })),
      xray: mine("xray", (doc) => loadUserXray(doc), () => loadExampleXray()),
      season: mine("earnings", (doc) => loadUserSeason(doc), () => loadExampleSeason()),
      dividends: mine("dividends", (doc) => userDividends(doc), () => exampleDividends()),
      stress: mine("stress", (doc) => loadUserStress(doc), () => loadExampleStress()),
      goal: mine("goal", (doc) => loadUserGoal(doc), () => loadExampleGoal()),
      ideas: mine("ideas", (doc) => loadUserIdeas(doc, rates), () => loadExampleIdeas(rates)),
    },
  };
});

/** The sources the "noticed" feed picks from, once each has answered or run out of time (the goal planner only feeds its card). */
export async function feedSources(load: HomeLoad): Promise<Omit<HomeSources, "goal">> {
  const [memo, xray, season, dividends, stress, ideas] = await Promise.all([
    load.sources.memo,
    load.sources.xray,
    load.sources.season,
    load.sources.dividends,
    load.sources.stress,
    load.sources.ideas,
  ]);
  return { memo, xray, season, dividends, stress, ideas };
}
