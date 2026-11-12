import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { queueFundRequests } from "@/lib/funds/on-demand";
import { fundKindOf } from "@/lib/funds/tickers";
import { pendingFundIds } from "@/lib/import/resolve";
import { cleanSaveRows, saveImport, type SaveSource } from "@/lib/import/save";
import { getImportDirectory } from "@/lib/import/server";
import { maybeQueueOnDemandNews } from "@/lib/on-demand-queue";
import { captureServerEventSafe } from "@/lib/posthog-server-capture";

/**
 * POST /api/import/save: the reviewed rows become holdings on the signed-in
 * person's own portfolio, next to what is already there (lib/import/save.ts).
 *
 * Body: { rows: [{ instrument_id, shares, average_cost, market_value, merge? }], source: "screenshot" | "manual" }
 * `merge` ("keep" | "replace" | "add") only matters for a stock already held; without it the saved numbers stay.
 * Header: x-client-mutation-id makes a retried save a no-op.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MUTATION_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { rows?: unknown; source?: unknown } | null;
  const rows = cleanSaveRows(body?.rows);
  if (!rows) return NextResponse.json({ error: "invalid_rows" }, { status: 400 });
  const source: SaveSource = body?.source === "screenshot" ? "screenshot" : "manual";

  // The browser checked these already; check again, so only stocks we cover are ever saved.
  const directory = await getImportDirectory();
  if (directory.byTicker.size === 0) return NextResponse.json({ error: "directory_unavailable" }, { status: 503 });
  const known = new Set([...directory.byTicker.values()].map((entry) => entry.instrument_id));
  // A US fund we are adding on demand saves too; its page and prices arrive within minutes (lib/funds/on-demand.ts).
  const adding = pendingFundIds(rows.map((row) => row.instrument_id), known, fundKindOf);
  const unknown = rows.filter((row) => !known.has(row.instrument_id) && !adding.has(row.instrument_id)).map((row) => row.instrument_id);
  if (unknown.length > 0) return NextResponse.json({ error: "unknown_stocks", unknown }, { status: 400 });

  const header = req.headers.get("x-client-mutation-id") ?? "";
  const mutationId = MUTATION_ID_RE.test(header) ? `import_${header}` : `import_${randomUUID()}`;
  const result = await saveImport({ uid: session.uid, rows, source, mutationId });
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: 409 });
  // Filed again on save (a no-op when the parse already did): a fund typed into the review was never parsed.
  if (adding.size > 0) await queueFundRequests([...adding].map((id) => id.slice(3)), { uid: session.uid, source: "import" });

  if (!result.replay) {
    // Research is queued for newly covered stocks only, as on every other add.
    const coveredSet = new Set(result.covered);
    for (const id of result.added.filter((added) => coveredSet.has(added))) {
      await maybeQueueOnDemandNews(session.uid, id, { source: "watchlist_batch" }).catch(() => false);
    }
    const now = new Date().toISOString();
    await adminFirestore
      .collection("tm_watchlist_view_refresh_control")
      .doc(session.uid)
      .set({ last_source_version: result.version, last_requested_at: now, requested_by: "import_save", updated_at: now }, { merge: true })
      .catch(() => undefined);
    if (result.added.length > 0) {
      // The activation funnel reads stock_tracked with tracked_count and first (docs/analytics.md); an import is one event.
      await captureServerEventSafe(session.uid, "stock_tracked", {
        via: "import",
        added_count: result.added.length,
        updated_count: result.updated.length,
        tracked_count: result.tracked,
        first: result.tracked === result.added.length,
        ticker: result.added.length === 1 ? result.added[0]!.replace(/^US_/, "").replace(/_/g, ".") : undefined,
        $insert_id: `import:${session.uid}:${mutationId}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    added: result.added,
    updated: result.updated,
    kept: result.kept,
    covered: result.covered,
    source_version: result.version,
  });
}
