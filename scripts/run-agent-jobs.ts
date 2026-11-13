/**
 * Evaluate every enabled standing job once and record each decision in
 * `tm_agent_runs` (including "checked, nothing to do"), then check every idea
 * basket that is switched on and record its decision in `tm_agent_basket_runs`.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-agent-jobs.ts         # run for real
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-agent-jobs.ts --dry   # decide, write nothing
 *
 * It reads the same env files as the app (.env.local, .env.vps.local). One run
 * per job per market day, so running it twice is harmless. It sends nothing:
 * results show up in the job's run log and in the Briefing.
 *
 * The VPS runs it every weekday after the close, after the price refresh
 * (the after_close group in backend/agentdata/schedule.py), because price
 * rules read daily closes. Use scripts/jobs.config.ts, not the test config:
 * it stands in for React's `cache` and `unstable_cache`, which only exist
 * inside a Next server.
 */
// A developer's .env.local can switch every account to Pro; a job must see the real plans.
process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO = "0";

// The app modules are imported inside main(), after the line above: static imports would load first.
export {};

async function main() {
  const started = Date.now();
  const { runAllEnabledJobs } = await import("@/lib/agent-jobs-data");
  const dryRun = process.argv.includes("--dry");
  const summary = await runAllEnabledJobs(new Date(), (line) => console.log(`[agent-jobs] ${line}`), { dryRun });
  console.log(`[agent-jobs]${dryRun ? " dry run, nothing written:" : ""} ${JSON.stringify(summary)}`);
  // Idea baskets the agent watches (lib/basket-agent), after the jobs: within each account's plan the jobs come first.
  const { runAllBasketAgents } = await import("@/lib/basket-agent/data");
  // The step is stopped at 20 minutes (backend/agentdata/schedule.py): no basket starts after 17.
  const baskets = await runAllBasketAgents(new Date(), (line) => console.log(`[agent-jobs] ${line}`), { dryRun, deadline: started + 17 * 60_000 });
  if (baskets.deferred > 0) console.log(`[agent-jobs] ${baskets.deferred} baskets left for the next run (time budget)`);
  console.log(`[agent-jobs] baskets${dryRun ? " dry run, nothing written:" : ""} ${JSON.stringify(baskets)}`);
  if (summary.failed > 0 || baskets.failed > 0) process.exitCode = 1;
}

// Awaited at the top level: vite-node closes its module server once the top level returns, and any import still
// loading then fails with "The server is being restarted or closed" (seen on the VPS's node 22).
await main().catch((error) => {
  console.error("[agent-jobs] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
