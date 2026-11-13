/**
 * Check every thesis (lib/thesis-monitor) on a switched-on basket once: each measurable line judged per report with
 * the conditions engine's guards, each new 10-K/10-Q risk change recorded, the status rolled up, and the state written
 * to `tm_agent_thesis_checks`. It runs after the filing changes step, so a filing compared tonight is seen tonight.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-thesis-checks.ts         # run for real
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-thesis-checks.ts --dry   # decide, write nothing
 *
 * It reads the same env files as the app. Running it twice on one day is harmless (the second check is judged against
 * the day before, and every report and filing is recorded once). It sends nothing: the agent's proposals are worked
 * out from the stored state when the person next opens the app.
 */
// A developer's .env.local can switch every account to Pro; the run must see the real plans.
process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO = "0";

export {};

async function main() {
  const started = Date.now();
  const { runAllThesisMonitors } = await import("@/lib/thesis-monitor/data");
  const dryRun = process.argv.includes("--dry");
  // The step is stopped at 15 minutes (backend/agentdata/schedule.py): no thesis starts after 12.
  const summary = await runAllThesisMonitors(new Date(), (line) => console.log(`[thesis-checks] ${line}`), { dryRun, deadline: started + 12 * 60_000 });
  if (summary.deferred > 0) console.log(`[thesis-checks] ${summary.deferred} theses left for the next run (time budget)`);
  console.log(`[thesis-checks]${dryRun ? " dry run, nothing written:" : ""} ${JSON.stringify(summary)}`);
  if (summary.failed > 0) process.exitCode = 1;
}

// Awaited at the top level: vite-node closes its module server once the top level returns.
await main().catch((error) => {
  console.error("[thesis-checks] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
