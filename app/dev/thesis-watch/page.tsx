import { notFound } from "next/navigation";

import { ThesisWatchPreview } from "@/components/dev/thesis-watch-preview";
import { interTight } from "@/components/oa/font";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { loadExamplePortfolio, newYorkToday } from "@/lib/portfolio-data";
import type { Thesis } from "@/lib/thesis";
import type { Condition } from "@/lib/thesis-watch/conditions";
import { EXAMPLE_REASONS, exampleReasonChecks } from "@/lib/thesis-watch/server";

export const dynamic = "force-dynamic";

/**
 * Local preview of the reason watcher's parts (rows, the reasons sheet, the
 * stock page entry) with the example portfolio's made-up reasons and real
 * checks on stored data. Signed-out screenshots cannot show these otherwise.
 * Not built in production.
 */
export default async function ThesisWatchPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  // Made-up measurable lines (`?lines=0` leaves them out), checked on the real stored figures.
  const lines: Record<string, Condition[]> =
    params.lines === "0"
      ? {}
      : {
          NVDA: [
            { metric: "revenue_growth", op: "above", value: 60 },
            { metric: "gross_margin", op: "above", value: 76 },
          ],
          COST: [{ metric: "revenue_growth", op: "above", value: 5 }],
          XOM: [{ metric: "dividend", op: "above", value: 0.99 }],
        };
  const [example, checks] = await Promise.all([loadExamplePortfolio(), exampleReasonChecks(new Date(), lines)]);
  if (!example) return <p>No example portfolio.</p>;
  const own: Record<string, string> = { NVDA: "Every big cloud is still buying its chips", JPM: "A bank that keeps raising its dividend" };
  const theses: Record<string, Thesis> = {};
  for (const [ticker, row] of Object.entries(EXAMPLE_REASONS)) {
    // Leave one holding without a reason, so the "add the rest" state shows.
    if (ticker === "UNH" && params.all !== "1") continue;
    theses[`US_${ticker}`] = {
      kind: row.kind,
      reason: own[ticker] ?? null,
      created_at: `${row.savedAt}T00:00:00.000Z`,
      updated_at: `${row.savedAt}T00:00:00.000Z`,
      ...(lines[ticker] ? { conditions: lines[ticker] } : {}),
    };
  }
  const byId = Object.fromEntries(checks.filter((check) => theses[check.instrumentId]).map((check) => [check.instrumentId, check]));
  const locked = params.free === "1" ? ["US_COST", "US_XOM"] : [];
  for (const id of locked) delete byId[id];
  const held = example.portfolio.positions.map((position) => position.instrument_id);
  return (
    <main className={`oa-landing ${interTight.variable} min-h-screen min-w-0 flex-grow overflow-x-clip bg-oa-page`}>
      <OaSiteHeader />
      <ThesisWatchPreview
      positions={example.portfolio.positions}
      totals={example.portfolio.totals}
      today={newYorkToday()}
      theses={theses}
      held={held}
      checks={byId}
      locked={locked}
      ticker={params.ticker ?? "NVDA"}
      empty={params.empty === "1"}
      />
    </main>
  );
}
