/**
 * Evaluate every enabled standing job once and record each decision in
 * `tm_agent_runs` (including "checked, nothing to do").
 *
 *   npx vite-node -c vitest.config.ts scripts/run-agent-jobs.ts            # run for real
 *   npx vite-node -c vitest.config.ts scripts/run-agent-jobs.ts -- --dry   # list what would run
 *
 * It reads the same env files as the app (.env.local, .env.vps.local). One run
 * per job per market day, so running it twice is harmless. It sends nothing:
 * results show up in the job's run log and in the Briefing.
 *
 * Run it after the daily price refresh (`python3 -m backend.agentdata.prices`),
 * because price rules read daily closes. It is not installed on any server.
 */
import { adminFirestore } from "@/lib/firebase-admin";
import { AGENT_JOBS_COLLECTION, agentMarketDay, runAllEnabledJobs } from "@/lib/agent-jobs-data";

async function main() {
  const dry = process.argv.includes("--dry");
  const now = new Date();
  if (dry) {
    const snap = await adminFirestore.collection(AGENT_JOBS_COLLECTION).where("enabled", "==", true).get();
    console.log(`[agent-jobs] dry run for ${agentMarketDay(now)}: ${snap.docs.length} enabled jobs, nothing written`);
    return;
  }
  const summary = await runAllEnabledJobs(now, (line) => console.log(`[agent-jobs] ${line}`));
  console.log(`[agent-jobs] ${JSON.stringify(summary)}`);
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[agent-jobs] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
