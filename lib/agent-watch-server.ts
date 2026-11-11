import { cache } from "react";

import { AGENT_RUNS_COLLECTION, listJobs } from "@/lib/agent-jobs-data";
import { runIdsToRead, watchJob, watchRunFromDoc } from "@/lib/agent-watch";
import { adminFirestore } from "@/lib/firebase-admin";
import type { AgentsSource } from "@/lib/portfolio-home/log";
import type { Loaded } from "@/lib/portfolio-home/pick";

/**
 * A signed-in person's standing agents and each one's newest runs, read
 * cheaply: one query for their jobs, then the run documents by id (one run
 * per job per market day, lib/agent-jobs.ts `runDocId`) for the day each job
 * last checked and the last market day, so the scheduled runner can be proven
 * to be running without listing every run they ever had. Never calls a model.
 */

/** How long the watches may take before the page goes on without them. */
export const WATCHES_TIMEOUT_MS = 2500;

export async function readAgentWatches(uid: string, today: string): Promise<AgentsSource> {
  const jobs = await listJobs(uid);
  if (jobs.length === 0) return { jobs: [], runs: [] };
  const ids = runIdsToRead(uid, jobs, today);
  const collection = adminFirestore.collection(AGENT_RUNS_COLLECTION);
  const snaps = ids.length > 0 ? await adminFirestore.getAll(...ids.map((id) => collection.doc(id))) : [];
  const live = new Set(jobs.map((job) => job.id));
  const runs = snaps
    .filter((snap) => snap.exists)
    .map((snap) => watchRunFromDoc(snap.data() as Record<string, unknown> | undefined, uid))
    .filter((run): run is AgentsSource["runs"][number] => run !== null && live.has(run.job_id))
    .sort((a, b) => b.day.localeCompare(a.day) || b.ran_at.localeCompare(a.ran_at));
  return { jobs: jobs.map(watchJob), runs };
}

/** The person's watches, once per request, or "slow" / "failed" so the page can say so for this part only. */
export const loadWatches = cache(async (uid: string, today: string): Promise<Loaded<AgentsSource>> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<Loaded<AgentsSource>>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[agent-watch] watches took longer than ${WATCHES_TIMEOUT_MS}ms; showing the page without them`);
      resolve({ state: "slow" });
    }, WATCHES_TIMEOUT_MS);
  });
  const done = readAgentWatches(uid, today).then(
    (value): Loaded<AgentsSource> => ({ state: "ready", value }),
    (error): Loaded<AgentsSource> => {
      console.warn("[agent-watch] watches failed:", error instanceof Error ? error.message : error);
      return { state: "failed" };
    },
  );
  return Promise.race([done, slow]).finally(() => clearTimeout(timer));
});
