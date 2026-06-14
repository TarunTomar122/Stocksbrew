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
  const borderTint = isUp ? "border-[#bbf7d0]" : "border-[#fecaca]";
  const cardBg = isUp
    ? "bg-gradient-to-br from-[#f0fdf4] via-white to-white"
    : "bg-gradient-to-br from-[#fff1f2] via-white to-white";
  const changeBg = isUp ? "bg-[#ecfdf5]" : "bg-[#fef2f2]";
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
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#6b7280]">
              Today&apos;s move
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[15px] font-bold tabular-nums ${changeBg} ${changeFg}`}
            >
              {isUp ? "▲" : "▼"} {fmtMovePct(dayChangePct)}
            </span>
          </div>
          <div className="rounded-2xl border border-dashed border-[#d1d5db] bg-white/75 p-4">
            <p className="inline-flex items-center gap-1.5 text-[16px] font-semibold leading-snug text-[#111111] md:text-[17px]">
              <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 18, fontVariationSettings: "'wght' 500" }}>
                lock
              </span>
              Why today&apos;s move happened is Pro.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280] md:text-[14px]">
              This stock moved sharply today. Unlock Pro to see the explanation, setup, and what to watch next.
            </p>
            <a
              href="/subscribe"
              className="mt-4 inline-flex rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#0052ff]"
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
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#6b7280]">
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
          <p className="text-[16px] font-semibold leading-snug text-[#111111] md:text-[17px]">
            {headline}
          </p>
          {detail ? (
            <p className="text-[14px] leading-relaxed text-[#374151] md:text-[15px]">{detail}</p>
          ) : null}
        </div>

        {showCatalyst ? (
          <span className="self-start rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-[#6b7280] ring-1 ring-[#e5e7eb]">
            {catalyst}
          </span>
        ) : null}
      </div>
    </div>
  );
}
