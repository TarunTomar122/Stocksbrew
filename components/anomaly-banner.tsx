import { AnimatedIcon } from "@/components/animated-icon";
import {
  anomalyDetail,
  anomalyHeadline,
  fmtMovePct,
  isWeakMoveExplanation,
  verdictStyle,
} from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";

type Props = {
  anomaly: AnomalyItem;
  /** Live quote from tm_latest_prices — overrides stale anomaly snapshot for the move badge. */
  liveDayChangePct?: number | null;
  isSubscribed?: boolean;
};

export function AnomalyBanner({ anomaly, liveDayChangePct, isSubscribed = false }: Props) {
  const dayChangePct =
    typeof liveDayChangePct === "number" && Number.isFinite(liveDayChangePct)
      ? liveDayChangePct
      : anomaly.day_change_pct;
  const isUp = Number.isFinite(dayChangePct) ? dayChangePct >= 0 : anomaly.direction === "up";
  const borderTint = isUp ? "border-outline-variant" : "border-outline-variant";
  const cardBg = isUp
    ? "bg-gradient-to-br from-surface-container-low via-surface to-surface"
    : "bg-gradient-to-br from-surface-container-low via-surface to-surface";
  const changeBg = isUp ? "tint-bull" : "tint-bear";
  const changeFg = isUp ? "text-[#10b981]" : "text-[#ef4444]";

  const weakMove = isWeakMoveExplanation(anomaly);
  const headline = anomalyHeadline(anomaly);
  const detail = anomalyDetail(anomaly);
  const verdict = weakMove ? "" : (anomaly.overall_verdict || "").trim();
  const verdictColors = verdict ? verdictStyle(verdict) : null;
  const catalyst = (anomaly.catalyst || "").trim();
  const showCatalyst = !weakMove && catalyst && catalyst.length <= 48;

  if (!isSubscribed) {
    return (
      <div className={`rounded-2xl border ${borderTint} ${cardBg} p-4 md:p-6`}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">
              Today&apos;s move
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[15px] font-bold tabular-nums ${changeBg} ${changeFg}`}
            >
              {isUp ? "▲" : "▼"} {fmtMovePct(dayChangePct)}
            </span>
          </div>
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface/75 p-4">
            <p className="inline-flex items-center gap-1.5 text-[16px] font-semibold leading-snug text-on-surface md:text-[17px]">
              <AnimatedIcon name="lock" size={18} className="text-on-surface-variant" aria-hidden />
              Why today&apos;s move happened is Pro.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant md:text-[14px]">
              This stock moved sharply today. Unlock Pro to see the explanation, setup, and what to watch next.
            </p>
            <a
              href="/subscribe"
              className="mt-4 inline-flex rounded-full bg-on-surface px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#0052ff]"
            >
              Unlock Pro
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${borderTint} ${cardBg} p-4 md:p-6`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">
            Today&apos;s move
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[15px] font-bold tabular-nums ${changeBg} ${changeFg}`}
            >
              {isUp ? "▲" : "▼"} {fmtMovePct(dayChangePct)}
            </span>
            {verdictColors ? (
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{ color: verdictColors.text, background: verdictColors.bg }}
              >
                {verdict}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-[16px] font-semibold leading-snug text-on-surface md:text-[17px]">
            {headline}
          </p>
          {detail ? (
            <p className="text-[14px] leading-relaxed text-on-surface md:text-[15px]">{detail}</p>
          ) : null}
        </div>

        {showCatalyst ? (
          <span className="self-start rounded-md bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-on-surface-variant ring-1 ring-outline-variant">
            {catalyst}
          </span>
        ) : null}
      </div>
    </div>
  );
}
