import type { OpeningReport } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";

function timestamp(value?: string): number {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Ignore a cached opening report when a newer live mover snapshot exists. */
export function currentOpeningReport(
  report: OpeningReport | null,
  movers: PremarketMovers | null,
): OpeningReport | null {
  if (!report || !movers) return report;
  const moverTime = timestamp(movers.generated_at);
  if (!moverTime) return report;
  return timestamp(report.generated_at) >= moverTime ? report : null;
}
