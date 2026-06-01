import type { ThesisScore, ThesisDriver } from "../types";

type Props = {
  score: ThesisScore;
  drivers: ThesisDriver[];
  history: { date: string; score: number }[];
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const fill =
    value >= 0.65 ? "#10b981" : value >= 0.4 ? "#d97706" : "#ef4444";

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-[5px] flex-1 bg-[#f3f4f6] overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </div>
      <span className="w-[32px] text-right text-[11px] font-mono font-medium text-[#374151] tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

export function DailyScore({ score, drivers, history }: Props) {
  const overall = Math.round(score.overallConfidence * 100);
  const triggeredAlerts = score.disproofAlerts.filter((a) => a.triggered);

  return (
    <section aria-labelledby="daily-score-heading" className="flex flex-col gap-5">
      <h2
        id="daily-score-heading"
        className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]"
      >
        Daily Score
      </h2>

      <div className="flex items-end justify-between gap-4 border-b border-[#f3f4f6] pb-5">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[48px] lg:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-none tabular-nums"
            aria-label={`Overall confidence ${overall} out of 100`}
          >
            {overall}
          </span>
          <span className="text-[13px] text-[#9ca3af] pb-1">/ 100</span>
        </div>
        {history.length > 0 && (
          <div
            className="flex items-end gap-1 h-[40px] w-[min(100%,140px)]"
            aria-label="Seven day confidence trend"
          >
            {history.map((h) => (
              <div
                key={h.date}
                className="flex flex-1 flex-col items-center justify-end gap-1 h-full"
              >
                <div
                  className="w-full min-h-[4px]"
                  style={{
                    height: `${Math.max(12, Math.round(h.score * 100))}%`,
                    backgroundColor:
                      h.score >= 0.65
                        ? "var(--signal-bullish)"
                        : h.score >= 0.4
                          ? "var(--signal-neutral)"
                          : "var(--signal-bearish)",
                    opacity: 0.65,
                  }}
                />
                <span className="text-[8px] font-mono text-[#9ca3af] leading-none">
                  {h.date.replace("May ", "")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          By driver
        </span>
        <ul className="flex flex-col gap-2">
          {drivers.map((d) => {
            const driverScore = score.driverScores[d.id] ?? 0.5;
            return (
              <li key={d.id} className="flex flex-col gap-1">
                <span className="text-[12px] text-[#374151] leading-snug line-clamp-2">
                  {d.label}
                </span>
                <ConfidenceBar value={driverScore} />
              </li>
            );
          })}
        </ul>
      </div>

      {triggeredAlerts.length > 0 && (
        <div
          role="alert"
          className="border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#dc2626]">
            Disproof alerts
          </span>
          <ul className="mt-1.5 flex flex-col gap-1">
            {triggeredAlerts.map((a) => (
              <li key={a.conditionId} className="text-[12px] text-[#dc2626]">
                {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
