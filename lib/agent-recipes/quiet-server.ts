/**
 * Today's quiet checks across every kind of agent the person runs (standing jobs, idea baskets and theses), as the
 * one line /agent's record shows for them (lib/agent-recipes/view.ts todayQuietText). Three small reads, each keyed
 * to the person and the day; the caller bounds them in time and keeps the thread's own line if they are slow.
 */

import { AGENT_RUNS_COLLECTION, listJobs } from "@/lib/agent-jobs-data";
import { presentRun, type RunLike } from "@/lib/agent-jobs-present";
import { BASKET_RUNS_COLLECTION } from "@/lib/basket-agent/model";
import { adminFirestore } from "@/lib/firebase-admin";
import { THESIS_CHECKS_COLLECTION } from "@/lib/thesis-monitor/model";
import type { RecordItem } from "@/lib/thread/record";

import { checkedWhat, todayQuietText, type TodayRun } from "./view";

type Doc = Record<string, unknown>;

async function docsOf(collection: string, uid: string, day: string | null): Promise<Doc[]> {
  let query = adminFirestore.collection(collection).where("uid", "==", uid);
  if (day) query = query.where("day", "==", day);
  const snap = await query.get();
  return snap.docs.map((doc) => doc.data() as Doc).filter((data) => data.uid === uid && (!day || data.day === day));
}

function decisionOf(raw: unknown): TodayRun["decision"] | null {
  return raw === "notify" || raw === "nothing" || raw === "could_not_check" || raw === "propose" ? raw : null;
}

/** Folds several checks of one agent into one: it found something if any check did; quiet only when all were. */
function fold(list: TodayRun["decision"][]): TodayRun["decision"] {
  if (list.some((decision) => decision === "notify" || decision === "propose")) return "notify";
  if (list.every((decision) => decision === "nothing")) return "nothing";
  return "could_not_check";
}

/**
 * Today's quiet line for /agent, or null when no agent checked quietly today. A thesis on an idea basket and the
 * basket's own check are one agent (the plan counts them once), so they are folded together.
 */
export async function todayQuietItem(uid: string, today: string): Promise<RecordItem | null> {
  const [jobRuns, basketRuns, theses] = await Promise.all([
    docsOf(AGENT_RUNS_COLLECTION, uid, today),
    docsOf(BASKET_RUNS_COLLECTION, uid, today),
    docsOf(THESIS_CHECKS_COLLECTION, uid, null),
  ]);
  const agents = new Map<string, TodayRun["decision"][]>();
  const add = (key: string, decision: TodayRun["decision"] | null) => {
    if (decision) agents.set(key, [...(agents.get(key) ?? []), decision]);
  };
  for (const run of jobRuns) {
    const decision = decisionOf(run.decision);
    // A run whose only findings were stale quotes reads as quiet everywhere else (presentRun), so it does here too.
    const stale = decision === "notify" && Array.isArray(run.findings) && presentRun(run as unknown as RunLike, null).verdict === "quiet";
    add(`job:${String(run.job_id ?? "")}`, stale ? "nothing" : decision);
  }
  for (const run of basketRuns) add(`basket:${String(run.basket_id ?? "")}`, decisionOf(run.decision));
  for (const state of theses) {
    if (state.day !== today) continue;
    // A thesis spoke today when it recorded something new today (a broken line, a new risk, a status change).
    const events = Array.isArray(state.events) ? (state.events as Doc[]) : [];
    const spoke = events.some((event) => event.day === today && event.baseline !== true);
    add(`basket:${String(state.basket_id ?? "")}`, spoke ? "notify" : "nothing");
  }
  const runs: TodayRun[] = [...agents.entries()].map(([key, list]) => ({ decision: fold(list), line: key }));
  // One agent alone says what it checked; that needs the job's rule.
  const quiet = runs.filter((run) => run.decision === "nothing");
  if (runs.length === 1 && quiet.length === 1 && quiet[0]!.line?.startsWith("job:")) {
    const job = (await listJobs(uid).catch(() => [])).find((entry) => `job:${entry.id}` === quiet[0]!.line);
    quiet[0]!.line = job ? checkedWhat(job) + ": nothing new" : undefined;
  } else {
    for (const run of runs) run.line = undefined;
  }
  const text = todayQuietText(runs);
  if (!text) return null;
  return { id: `note:agents-quiet:${today}`, kind: "quiet", ticker: null, text, tag: null, figure: null, href: "/agents" };
}
