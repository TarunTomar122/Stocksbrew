/**
 * Create (or refresh) the example portfolio's standing agents, owned by the
 * site's example account (EXAMPLE_AGENTS_UID in lib/entitlements.ts), and
 * optionally run them once. Idempotent: fixed job ids; a second run changes
 * nothing unless the definitions in lib/portfolio-home/example-agents.ts did.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/setup-example-agents.ts --dry        # say what it would write
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/setup-example-agents.ts              # write the jobs
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/setup-example-agents.ts --run --dry  # also decide today's run, write nothing
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/setup-example-agents.ts --run        # also record today's run
 *
 * --run goes through the after-close runner itself (runAllEnabledJobs), limited
 * to the example account, so it proves the nightly run picks these jobs up with
 * the plan they need. It never runs anyone else's agents. One run per job per
 * New York day: a run recorded before the close means tonight's after-close
 * run skips these jobs for that day, so prefer running it in the evening.
 *
 * Writes only tm_agent_jobs/example-portfolio__* and, with --run,
 * tm_agent_runs/example-portfolio__* (and the jobs' last-checked fields). It
 * sends nothing. Env: the same files as the app (.env.local, .env.vps.local).
 */
process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO = "0";

export {};

async function main() {
  const dryRun = process.argv.includes("--dry");
  const run = process.argv.includes("--run");
  const { ensureExampleAgents } = await import("@/lib/portfolio-home/example-agents");
  const { EXAMPLE_AGENTS_UID } = await import("@/lib/entitlements");
  const lines = await ensureExampleAgents({ dryRun });
  for (const line of lines) console.log(`[example-agents] ${line.id}: ${line.action === "unchanged" ? "unchanged" : `${dryRun ? "would " : ""}${line.action}`}`);
  if (!run) return;
  // A recorded run counts for the whole New York day, so one made before the close would make the after-close runner
  // skip that day's close. Only dry runs, or --force, before 4:30 PM ET on a weekday.
  const nyClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => nyClock.find((p) => p.type === type)?.value ?? "";
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const weekday = !["Sat", "Sun"].includes(part("weekday"));
  if (!dryRun && weekday && minutes < 16 * 60 + 30 && !process.argv.includes("--force")) {
    console.log("[example-agents] not recording a run before 4:30 PM ET on a market day; the after-close runner records it (use --dry to preview, --force to override)");
    return;
  }
  const { runAllEnabledJobs, runJob } = await import("@/lib/agent-jobs-data");
  const { EXAMPLE_AGENTS } = await import("@/lib/portfolio-home/example-agents");
  const now = new Date();
  if (dryRun) {
    // What each agent would record now, in full, from the definitions (the jobs may not be written yet).
    for (const agent of EXAMPLE_AGENTS) {
      const stamp = now.toISOString();
      const job = { ...agent.draft, id: agent.id, uid: EXAMPLE_AGENTS_UID, mode: "tell_me" as const, enabled: true, created_at: stamp, updated_at: stamp, last_checked_day: null, last_close_seen: null };
      const outcome = await runJob(job, now, { dryRun: true });
      if (outcome.status === "not_due") {
        console.log(`[example-agents] ${agent.id}: not due`);
        continue;
      }
      const { decision, summary, findings, checked, day } = outcome.run;
      console.log(`[example-agents] ${agent.id} (${outcome.status}, ${day}): ${decision}: ${summary}`);
      for (const line of checked) console.log(`    checked: ${line}`);
      for (const finding of findings) console.log(`    found: ${finding.headline} | ${finding.detail} | ${finding.source} ${finding.url ?? ""} (${finding.at})`);
    }
    if (lines.some((line) => line.action === "create")) return;
  }
  const summary = await runAllEnabledJobs(now, (line) => console.log(`[example-agents] ${line}`), { dryRun, onlyUid: EXAMPLE_AGENTS_UID });
  console.log(`[example-agents]${dryRun ? " dry run, nothing written:" : ""} ${JSON.stringify(summary)}`);
  if (summary.failed > 0) process.exitCode = 1;
}

// Awaited at the top level, as in scripts/run-agent-jobs.ts: vite-node closes its module server once the top level returns.
await main().catch((error) => {
  console.error("[example-agents] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
