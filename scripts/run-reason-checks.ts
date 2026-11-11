/**
 * The nightly reason check: every saved reason on a tracked stock, checked
 * against tonight's facts and stored in `tm_thesis_checks`, the same check the
 * web app runs when someone opens a page (lib/thesis-watch/nightly.ts).
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-reason-checks.ts         # check and store
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-reason-checks.ts --dry   # check, write nothing
 *
 * Rules wording only, no model calls. Respects each account's plan (Free:
 * covered stocks only). Never writes a user doc. Prints one summary line of
 * counts, never a uid or a ticker. The VPS runs it every weekday after the
 * close, right after the standing agents (backend/agentdata/schedule.py).
 *
 * Flags: --dry, --concurrency=N (default 4), --budget-minutes=N (default 15).
 */
// A developer's .env.local can switch every account to Pro; a job must see the real plans.
process.env.NEXT_PUBLIC_DEV_UNLOCK_PRO = "0";

// The app modules are imported inside main(), after the line above: static imports would load first.
export {};

function flag(name: string): string | null {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function positive(value: string | null): number | undefined {
  const n = value === null ? Number.NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  const { runFailed, runNightlyReasonChecks, storeDeps, summaryLine } = await import("@/lib/thesis-watch/nightly");
  const minutes = positive(flag("budget-minutes"));
  const summary = await runNightlyReasonChecks(storeDeps, {
    dryRun: process.argv.includes("--dry"),
    concurrency: positive(flag("concurrency")),
    budgetMs: minutes === undefined ? undefined : minutes * 60 * 1000,
  });
  console.log(`[reason-checks] ${summaryLine(summary)}`);
  if (runFailed(summary)) process.exitCode = 1;
}

main().catch((error) => {
  // The message only: a stack or a request body could name a document, and with it a person.
  console.error("[reason-checks] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
