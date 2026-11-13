/**
 * What changed in each company's filings: for every stock someone tracks, then the covered universe, find a 10-K or
 * 10-Q newer than the one stored, compare its risk factor headings with the filing it should be read against, and
 * store the result in `tm_filing_changes/{TICKER}` (lib/filing-changes/job.ts).
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-filing-changes.ts                    # check and store
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-filing-changes.ts --dry --tickers=AMD,NVDA
 *
 * Rules only, no model calls. SEC requests go through lib/research/edgar.ts's queue with the declared User-Agent, 400ms
 * apart here (SEC_MIN_GAP_MS), so this job and the hourly Python SEC job together stay under SEC's 10 a second. Only
 * reads user docs, and only their stock lists. Prints one line per
 * stock it compared (tickers only), then one summary line of counts. The VPS runs it every weekday after the close
 * (backend/agentdata/schedule.py); a run that runs out of time leaves the rest to the next one.
 *
 * Flags: --dry, --tickers=A,B (only these), --limit=N, --budget-minutes=N (default 25), --concurrency=N (default 3),
 * --force (compare again even when the newest filing is stored, after a parsing fix), --quiet (summary line only).
 */
// 400ms between SEC requests (2.5 a second): the hourly SEC filings job (backend/agentdata/sec_filings.py, at :20,
// about 7 a second) can run at the same time from the same address, and the two together must stay under SEC's 10.
process.env.SEC_MIN_GAP_MS ||= "400";

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
  const { runFilingChanges, runFailed, summaryLine } = await import("@/lib/filing-changes/job");
  const { storeDeps } = await import("@/lib/filing-changes/job-store");
  const minutes = positive(flag("budget-minutes"));
  const only = (flag("tickers") ?? "")
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
  const quiet = process.argv.includes("--quiet");
  const summary = await runFilingChanges(storeDeps, {
    dryRun: process.argv.includes("--dry"),
    force: process.argv.includes("--force"),
    only,
    limit: positive(flag("limit")),
    concurrency: positive(flag("concurrency")),
    budgetMs: minutes === undefined ? undefined : minutes * 60 * 1000,
    log: quiet ? undefined : (line) => console.log(`[filing-changes] ${line}`),
  });
  console.log(`[filing-changes] ${summaryLine(summary)}`);
  if (runFailed(summary)) process.exitCode = 1;
}

// Awaited at the top level: vite-node closes its module server once the top level returns (see run-reason-checks.ts).
await main().catch((error) => {
  console.error("[filing-changes] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
