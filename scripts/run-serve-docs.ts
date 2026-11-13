/**
 * Builds the stock page's serving docs, `tm_serve_stock/{TICKER}` (docs/serving-docs.md).
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts              # stale parts only
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts --all        # every part of every stock
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts --parts=news --tickers=AMD,AAPL --dry
 *
 * By default only the parts a page would not use right now are rebuilt (missing, from an older layout, past their
 * age limit, marked dirty by a writer, or built from a source doc that has changed since), so a run after a writer
 * costs about what that writer changed. Reads the same collections the page reads and writes only `tm_serve_stock`,
 * one merge per stock, each part replacing only itself.
 *
 * Flags: --all, --dry, --parts=a,b, --tickers=A,B, --concurrency=N (default 4), --budget-minutes=N (default 20).
 * Prints counts and sizes only, never a token.
 */
export {};

function flag(name: string): string | null {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function positive(value: string | null, fallback: number): number {
  const n = value === null ? Number.NaN : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const { SERVE_PART_NAMES } = await import("@/lib/serve/stock-serve-shared");
  const { buildStockParts, coveredStocks, stockFromTicker, staleParts, writeStockParts } = await import("@/lib/serve/stock-serve-build");
  type PartName = (typeof SERVE_PART_NAMES)[number];

  const all = process.argv.includes("--all");
  const dry = process.argv.includes("--dry");
  const partsFlag = flag("parts");
  const asked = partsFlag ? partsFlag.split(",").map((part) => part.trim()).filter(Boolean) : [...SERVE_PART_NAMES];
  const unknown = asked.filter((part) => !(SERVE_PART_NAMES as string[]).includes(part));
  if (unknown.length || asked.length === 0) throw new Error(`unknown part in --parts (known: ${SERVE_PART_NAMES.join(", ")})`);
  const wanted = new Set(asked as PartName[]);
  const tickersFlag = flag("tickers");
  const tickers = tickersFlag
    ? tickersFlag.split(",").map((ticker) => ticker.trim()).filter(Boolean).map(stockFromTicker)
    : await coveredStocks();
  const concurrency = Math.min(16, positive(flag("concurrency"), 4));
  const deadline = Date.now() + positive(flag("budget-minutes"), 20) * 60_000;

  const plan = all ? new Map(tickers.map((stock) => [stock, new Set(wanted)])) : await staleParts(tickers, wanted);
  const queue = [...plan.entries()];
  const counts = { stocks: tickers.length, planned: queue.length, built: 0, failed: 0, skippedBudget: 0, parts: 0, bytes: 0, maxBytes: 0 };
  const perPart = new Map<string, number>();
  const started = Date.now();

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      if (Date.now() > deadline) {
        counts.skippedBudget += 1;
        continue;
      }
      const [stock, parts] = next;
      try {
        const built = await buildStockParts(stock, parts);
        const names = Object.keys(built.parts);
        for (const name of names) perPart.set(name, (perPart.get(name) ?? 0) + 1);
        const bytes = dry ? JSON.stringify(built.parts).length : await writeStockParts(built.id, built.instrumentId, built.parts);
        counts.built += 1;
        counts.parts += names.length;
        counts.bytes += bytes;
        counts.maxBytes = Math.max(counts.maxBytes, bytes);
      } catch (error) {
        counts.failed += 1;
        // The message only, and no ticker: a request body could name a document.
        if (counts.failed <= 5) console.error("[serve-docs] a stock failed:", error instanceof Error ? error.message.slice(0, 160) : "unknown error");
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const partsLine = [...perPart.entries()].sort().map(([name, n]) => `${name}=${n}`).join(" ");
  console.log(
    `[serve-docs] ${dry ? "dry run, nothing written; " : ""}${counts.stocks} stocks, ${counts.planned} needed work, ${counts.built} built, ${counts.failed} failed, ${counts.skippedBudget} left for the next run; ${counts.parts} parts (${partsLine || "none"}); ${(counts.bytes / 1024).toFixed(0)} KB written, largest ${(counts.maxBytes / 1024).toFixed(1)} KB; ${seconds}s`,
  );
  // Any failure shows red on the timer; the stocks that failed keep their old parts, which prove themselves or not.
  if (counts.failed > 0) process.exitCode = 1;
}

// Awaited at the top level: vite-node closes its module server once the top level returns (see run-reason-checks.ts).
await main().catch((error) => {
  console.error("[serve-docs] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
