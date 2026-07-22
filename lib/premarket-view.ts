import type { OpeningReport } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";

function timestamp(value?: string): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Use a report only when it was materialized from the exact mover snapshot shown. */
export function currentOpeningReport(
  report: OpeningReport | null,
  movers: PremarketMovers | null,
): OpeningReport | null {
  if (!report || !movers) return report;
  const moverTime = timestamp(movers.generated_at);
  if (!moverTime) return report;
  const reportMoverTime = timestamp(
    report.source_movers_generated_at || report.premarket?.generated_at,
  );
  if (!reportMoverTime || reportMoverTime !== moverTime) return null;
  return timestamp(report.generated_at) >= moverTime ? report : null;
}
