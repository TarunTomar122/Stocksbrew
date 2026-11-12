/**
 * Seed tm_research_shared from reports people already ran: for each stock, the newest finished report becomes its
 * shared copy, unless a newer one is already stored. Additive only: per-person reports are read, never changed.
 * Dry run by default; pass --write to store, and --only=MP,NVDA to limit it to some stocks.
 *
 *   node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/backfill-research-shared.ts [--write] [--only=MP]
 */
import { adminFirestore } from "@/lib/firebase-admin";
import { putSharedReport } from "@/lib/research/shared";
import { RESEARCH_COLLECTION, type ResearchReport } from "@/lib/research/types";

async function main() {
  const write = process.argv.includes("--write");
  const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).toUpperCase().split(",").filter(Boolean)) : null;
  const snap = await adminFirestore.collection(RESEARCH_COLLECTION).where("kind", "==", "report").get();
  const newest = new Map<string, ResearchReport>();
  for (const doc of snap.docs) {
    const data = doc.data() as ResearchReport & { kind?: string };
    if (data.status !== "ready" || !data.body || !data.finished_at || data.shared_from) continue;
    if (only && !only.has(data.ticker)) continue;
    const have = newest.get(data.ticker);
    if (!have || Date.parse(data.finished_at) > Date.parse(have.finished_at ?? "")) newest.set(data.ticker, data);
  }
  for (const report of newest.values()) {
    const stored = write ? await putSharedReport(report) : false;
    console.log(`${report.ticker} written ${report.finished_at}${write ? (stored ? " stored" : " kept the newer copy") : " (dry run)"}`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
