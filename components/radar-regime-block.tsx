import type { BookRegimeRead, SectorRegime } from "@/lib/sector-regimes";
import { REGIME_LABEL, regimeTone } from "@/lib/sector-regimes";

const TONE = {
  good: { text: "#047857", soft: "#ecfdf5", dot: "#10b981" },
  warn: { text: "#92400e", soft: "#fffbeb", dot: "#f59e0b" },
  bad: { text: "#b91c1c", soft: "#fef2f2", dot: "#ef4444" },
  neutral: { text: "#1d4ed8", soft: "#eff6ff", dot: "#0052ff" },
} as const;

const PHASE_LABEL: Record<string, string> = {
  trending_up: "trending up",
  distribution: "in distribution",
  correction: "in a correction",
  recovery: "recovering",
  range: "range-bound",
};

const RISK_LABEL: Record<string, string> = {
  on: "risk-on",
  off: "risk-off",
  mixed: "mixed risk appetite",
};

function RegimePill({ regime }: { regime: SectorRegime }) {
  const tone = TONE[regimeTone(regime)];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: tone.soft, color: tone.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} aria-hidden />
      {REGIME_LABEL[regime]}
    </span>
  );
}

export function RadarRegimeBlock({ read }: { read: BookRegimeRead | null }) {
  if (!read || (read.sectors.length === 0 && !read.macro)) return null;

  const top = read.sectors[0];
  const macro = read.macro;
  const phase = macro?.market_phase ? PHASE_LABEL[macro.market_phase] : null;
  const risk = macro?.risk_appetite ? RISK_LABEL[macro.risk_appetite] : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef2ff] text-[14px]">
          🧭
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1d4ed8]">
          Regime on your book
        </span>
      </div>

      {(phase || macro?.rotation_signal) && (
        <p className="text-[13px] leading-relaxed text-[#374151]">
          {phase && (
            <>
              The market is <span className="font-semibold text-[#111111]">{phase}</span>
              {risk ? `, ${risk}` : ""}.
            </>
          )}
          {macro?.rotation_signal ? <> {macro.rotation_signal}</> : null}
        </p>
      )}

      {top && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111]">
              {Math.round(top.weightPct)}% of your book is {top.sector}
            </span>
            <RegimePill regime={top.regime} />
          </div>
          <p className="text-[13px] leading-relaxed text-[#6b7280]">{top.narrative}</p>
          {top.invalidators.length > 0 && (
            <p className="text-[12px] leading-relaxed text-[#9ca3af]">
              <span className="font-semibold text-[#6b7280]">Watch:</span> {top.invalidators[0]}
            </p>
          )}
        </div>
      )}

      {read.sectors.length > 1 && (
        <div className="flex flex-col divide-y divide-[#f3f4f6] rounded-2xl border border-[#e5e7eb] bg-white">
          {read.sectors.slice(1).map((s) => (
            <div key={s.sector} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[13px] text-[#374151]">
                <span className="font-semibold text-[#111111]">{Math.round(s.weightPct)}%</span> {s.sector}
              </span>
              <RegimePill regime={s.regime} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
