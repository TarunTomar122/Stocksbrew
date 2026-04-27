import type { DataQuality } from "@/lib/stock";

type Props = {
  quality: DataQuality | null | undefined;
};

function freshnessTone(status?: string): { label: string; color: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "fresh")
    return { label: "Fresh", color: "var(--signal-bullish)" };
  if (s === "aging")
    return { label: "Aging", color: "var(--signal-neutral)" };
  if (s === "stale")
    return { label: "Stale", color: "var(--signal-bearish)" };
  if (s === "missing")
    return { label: "Missing", color: "var(--outline)" };
  return { label: status ?? "Unknown", color: "var(--outline)" };
}

function confidenceTone(score?: number): {
  label: string;
  color: string;
} {
  if (typeof score !== "number") return { label: "—", color: "var(--outline)" };
  if (score >= 75)
    return { label: "High", color: "var(--signal-bullish)" };
  if (score >= 50)
    return { label: "Medium", color: "var(--signal-neutral)" };
  return { label: "Low", color: "var(--signal-bearish)" };
}

function formatFreshness(hours?: number): string {
  if (typeof hours !== "number") return "";
  if (hours < 1) return "< 1h old";
  if (hours < 24) return `${Math.round(hours)}h old`;
  const d = Math.round(hours / 24);
  return `${d}d old`;
}

export function DataQualityStrip({ quality }: Props) {
  if (!quality) return null;

  const fresh = freshnessTone(quality.freshness_status);
  const conf = confidenceTone(quality.confidence_score);
  const mix = quality.source_tier_mix ?? {};
  const totalSources =
    (mix.broad ?? 0) + (mix.core ?? 0) + (mix.promoted ?? 0);

  return (
    <section className="px-1 -mt-4">
      <div className="flex items-center gap-6 flex-wrap text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.15em] uppercase text-outline">
            Confidence
          </span>
          <span className="font-bold tabular-nums" style={{ color: conf.color }}>
            {typeof quality.confidence_score === "number"
              ? `${Math.round(quality.confidence_score)} · ${conf.label}`
              : conf.label}
          </span>
        </div>

        <span className="text-outline">·</span>

        <div className="flex items-center gap-2">
          <span className="font-bold tracking-[0.15em] uppercase text-outline">
            Data
          </span>
          <span className="font-bold" style={{ color: fresh.color }}>
            {fresh.label}
          </span>
          {quality.freshness_hours !== undefined && (
            <span className="text-on-surface-variant">
              {formatFreshness(quality.freshness_hours)}
            </span>
          )}
        </div>

        {typeof quality.evidence_count === "number" && (
          <>
            <span className="text-outline">·</span>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-[0.15em] uppercase text-outline">
                Evidence
              </span>
              <span className="font-bold text-on-surface tabular-nums">
                {quality.evidence_count} article
                {quality.evidence_count === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}

        {totalSources > 0 && (
          <>
            <span className="text-outline">·</span>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-[0.15em] uppercase text-outline">
                Sources
              </span>
              {typeof mix.core === "number" && mix.core > 0 && (
                <span className="text-on-surface font-semibold">
                  {mix.core} core
                </span>
              )}
              {typeof mix.promoted === "number" && mix.promoted > 0 && (
                <span className="text-on-surface font-semibold">
                  · {mix.promoted} promoted
                </span>
              )}
              {typeof mix.broad === "number" && mix.broad > 0 && (
                <span className="text-on-surface-variant">
                  · {mix.broad} broad
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
