import type { WatchAgentChip } from "@/components/research/watch-agents";
import { hiddenTemplateIds, planMayRun } from "@/lib/agent-jobs";
import { listJobs } from "@/lib/agent-jobs-data";
import type { Plan } from "@/lib/entitlements";
import { adminFirestore } from "@/lib/firebase-admin";
import { suggestWatchAgents, watchStatus } from "@/lib/research/watch-agents";
import type { ResearchReport } from "@/lib/research/types";

/**
 * The "Have an agent watch these" chips for one report and one viewer: the suggestions from the report's watch list,
 * each marked "watching" or "paused" when an agent of theirs already covers it. Reads the person's agents (one
 * query) and, only when one of them watches their list, whether this stock is on it. A failed read shows every chip
 * as new: saving skips an agent the person already has, so nothing is ever doubled.
 */
export async function watchAgentChips(report: Pick<ResearchReport, "ticker" | "body" | "charts">, viewer: { uid: string | null; plan: Plan }): Promise<WatchAgentChip[]> {
  const points = report.charts.price?.points ?? [];
  const suggestions = suggestWatchAgents({
    ticker: report.ticker,
    watch: report.body?.watch ?? [],
    price: points.length > 0 ? points[points.length - 1]!.close : null,
    hidden: hiddenTemplateIds(),
  });
  if (suggestions.length === 0) return [];
  const jobs = viewer.uid ? await listJobs(viewer.uid).catch(() => []) : [];
  let tracks = false;
  if (viewer.uid && jobs.some((job) => job.scope.kind === "watchlist" && suggestions.some((item) => item.template === job.template))) {
    const user = await adminFirestore.collection("users").doc(viewer.uid).get().catch(() => null);
    const tracked = user?.exists ? ((user.data()?.tracked_stocks as unknown) ?? []) : [];
    tracks = Array.isArray(tracked) && tracked.includes(`US_${report.ticker.replace(/\./g, "_")}`);
  }
  // Signed out we cannot know the plan; mark "Pro" only for what a free account could not run.
  const plan: Plan = viewer.plan === "anon" ? "free" : viewer.plan;
  return suggestions.map((item) => ({
    id: item.id,
    template: item.template,
    label: item.label,
    draft: item.draft,
    status: watchStatus(item, jobs, report.ticker, tracks),
    pro: !planMayRun(item.draft, plan),
  }));
}
