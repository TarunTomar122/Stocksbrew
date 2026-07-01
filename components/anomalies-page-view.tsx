import { AnomalyMovesBoard } from "@/components/daily-anomalies-board";
import { MOVES_SECTION_TAGLINE, splitDisplayableMoves } from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { MARKET_FEED_FRESHNESS, SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";

export function AnomaliesPageView({
  anomalies,
  generatedAt,
  isSubscribed = false,
  fullItemLimit,
}: {
  anomalies: AnomalyItem[];
  generatedAt: string;
  isSubscribed?: boolean;
  fullItemLimit?: number;
}) {
  const { ups, downs } = splitDisplayableMoves(anomalies, { explainedOnly: true, limit: anomalies.length });

  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(generatedAt, MARKET_FEED_FRESHNESS)
    : null;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[34px]">
          Today&apos;s big moves
        </h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[#6b7280] md:text-[14px]">
          {MOVES_SECTION_TAGLINE}
          {relativeTime(generatedAt) ? (
            <span className="text-[#9ca3af]"> · Updated {relativeTime(generatedAt)}</span>
          ) : null}
          {SHOW_DATA_FRESHNESS_UI && freshness ? (
            <>
              {" "}
              · <span className={freshness.toneClass}>{freshness.label}</span>
            </>
          ) : null}
        </p>
      </div>

      <AnomalyMovesBoard
        ups={ups}
        downs={downs}
        layout="cards"
        isSubscribed={isSubscribed}
        fullItemLimit={fullItemLimit}
      />
    </div>
  );
}
