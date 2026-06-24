import type { DataQuality } from "@/lib/stock";
import { SHOW_DATA_FRESHNESS_UI } from "@/lib/freshness";

type Props = {
  quality: DataQuality | null | undefined;
};

function freshnessTone(status?: string): { label: string; color: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "fresh")   return { label: "Fresh",   color: "#10b981" };
  if (s === "aging")   return { label: "Aging",   color: "#f59e0b" };
  if (s === "stale")   return { label: "Stale",   color: "#ef4444" };
  if (s === "missing") return { label: "Missing", color: "var(--on-surface-variant)" };
  return { label: status ?? "Unknown", color: "var(--on-surface-variant)" };
}

function confidenceTone(score?: number): { label: string; color: string } {
  if (typeof score !== "number") return { label: "-", color: "var(--on-surface-variant)" };
  if (score >= 75) return { label: "High",   color: "#10b981" };
  if (score >= 50) return { label: "Medium", color: "#f59e0b" };
  return { label: "Low", color: "#ef4444" };
}

function formatFreshness(hours?: number): string {
  if (typeof hours !== "number") return "";
  if (hours < 1) return "< 1h old";
  if (hours < 24) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

export function DataQualityStrip({ quality }: Props) {
  if (!SHOW_DATA_FRESHNESS_UI || !quality) return null;

  const fresh = freshnessTone(quality.freshness_status);
  const conf = confidenceTone(quality.confidence_score);
  const mix = quality.source_tier_mix ?? {};
  const totalSources = (mix.broad ?? 0) + (mix.core ?? 0) + (mix.promoted ?? 0);

  return (
    <div className="flex items-center gap-x-6 gap-y-2 flex-wrap text-[12px] pt-4 border-t border-outline-variant">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
          Confidence
        </span>
        <span className="font-semibold tabular-nums" style={{ color: conf.color }}>
          {typeof quality.confidence_score === "number"
            ? `${Math.round(quality.confidence_score)} · ${conf.label}`
            : conf.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
          Data
        </span>
        <span className="font-semibold" style={{ color: fresh.color }}>
          {fresh.label}
        </span>
        {quality.freshness_hours !== undefined && (
          <span className="text-on-surface-variant">{formatFreshness(quality.freshness_hours)}</span>
        )}
      </div>

      {typeof quality.evidence_count === "number" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
            Evidence
          </span>
          <span className="font-semibold text-on-surface tabular-nums">
            {quality.evidence_count} article{quality.evidence_count === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {totalSources > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
            Sources
          </span>
          {typeof mix.core === "number" && mix.core > 0 && (
            <span className="font-medium text-on-surface">{mix.core} core</span>
          )}
          {typeof mix.promoted === "number" && mix.promoted > 0 && (
            <span className="font-medium text-on-surface">· {mix.promoted} promoted</span>
          )}
          {typeof mix.broad === "number" && mix.broad > 0 && (
            <span className="text-on-surface-variant">· {mix.broad} broad</span>
          )}
        </div>
      )}
    </div>
  );
}
