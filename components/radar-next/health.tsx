import type { HealthPillar } from "@/components/radar-next/types";

function gradeColor(score: number): string {
  if (score >= 75) return "var(--rn-bull)";
  if (score >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function PillarRadar({ pillars }: { pillars: HealthPillar[] }) {
  const center = 78;
  const radius = 45;
  const labelRadius = 64;
  const score = pillars.reduce((total, pillar) => total + pillar.score, 0) / pillars.length;
  const color = gradeColor(score);
  const points = pillars.map((pillar, index) => {
    const angle = (-Math.PI / 2) + (index * Math.PI * 2) / pillars.length;
    const x = center + Math.cos(angle) * radius * (Math.max(0, Math.min(100, pillar.score)) / 100);
    const y = center + Math.sin(angle) * radius * (Math.max(0, Math.min(100, pillar.score)) / 100);
    const labelX = center + Math.cos(angle) * labelRadius;
    const labelY = center + Math.sin(angle) * labelRadius;
    return { ...pillar, angle, x, y, labelX, labelY };
  });
  const polygon = (scale: number) => pillars.map((_, index) => {
    const angle = (-Math.PI / 2) + (index * Math.PI * 2) / pillars.length;
    return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
  }).join(" ");

  return (
    <div className="w-full max-w-[18rem]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--rn-muted)]">Book balance</span>
        <span className="font-mono text-[12px] tabular-nums" style={{ color }}>4 signals</span>
      </div>
      <svg viewBox="0 0 156 156" role="img" aria-label="Portfolio balance across valuation, growth, quality, and momentum" className="h-auto w-full overflow-visible">
        {[0.33, 0.66, 1].map((scale) => (
          <polygon key={scale} points={polygon(scale)} fill="none" stroke="var(--rn-line)" strokeWidth="1" />
        ))}
        {points.map((point) => (
          <line key={point.label} x1={center} y1={center} x2={center + Math.cos(point.angle) * radius} y2={center + Math.sin(point.angle) * radius} stroke="var(--rn-line)" strokeWidth="1" />
        ))}
        <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill={color} fillOpacity="0.14" stroke={color} strokeWidth="2" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="3" fill="var(--rn-card)" stroke={color} strokeWidth="2" />
            <text x={point.labelX} y={point.labelY} dominantBaseline="middle" textAnchor={Math.cos(point.angle) < -0.2 ? "end" : Math.cos(point.angle) > 0.2 ? "start" : "middle"} fill="var(--rn-muted)" fontSize="9" fontWeight="600" letterSpacing="0.7">
              {point.label.toUpperCase()}
            </text>
            <text x={point.labelX} y={point.labelY + 12} dominantBaseline="middle" textAnchor={Math.cos(point.angle) < -0.2 ? "end" : Math.cos(point.angle) > 0.2 ? "start" : "middle"} fill="var(--rn-ink)" fontSize="11" fontWeight="700">
              {Math.round(point.score)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ScoreRing({ grade, score }: { grade: string; score: number }) {
  const color = gradeColor(score);
  const boundedScore = Math.max(0, Math.min(100, score));
  return (
    <div
      aria-label={`Portfolio score: ${Math.round(score)} out of 100, grade ${grade}`}
      className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} 0 ${boundedScore}%, var(--rn-card-2) ${boundedScore}% 100%)` }}
    >
      <span className="grid h-[74px] w-[74px] place-items-center rounded-full bg-[var(--rn-card)] text-center">
        <strong className="block font-mono text-[25px] font-semibold leading-none tabular-nums text-[var(--rn-ink)]">{Math.round(score)}</strong>
      </span>
    </div>
  );
}

export function Health({
  grade,
  gradePct,
  headline,
  body,
  fixes,
  pillars,
}: {
  grade: string;
  gradePct: number;
  headline: string;
  body: string;
  fixes: string[];
  pillars: HealthPillar[];
}) {
  return (
    <section aria-labelledby="rn-health">
      <div className="mb-3">
        <h2 id="rn-health" className="text-[16px] font-medium tracking-tight text-[var(--rn-ink)]">
          The portfolio-level read
        </h2>
      </div>

      <div className="border-y border-[var(--rn-line)]">
        <div className="grid gap-7 py-7 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] md:items-center md:px-3">
          <div className="flex min-w-0 items-start gap-5 sm:gap-6">
            <ScoreRing grade={grade} score={gradePct} />
            <div className="min-w-0">
              <p className="text-[17px] font-bold leading-snug text-[var(--rn-ink)] sm:text-[18px]">{headline}</p>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--rn-muted)]">{body}</p>
            </div>
          </div>

          {pillars.length > 0 ? (
            <div className="md:justify-self-end"><PillarRadar pillars={pillars} /></div>
          ) : null}
        </div>

        {fixes.length > 0 ? (
          <div className="border-t border-[var(--rn-line)] py-6 md:px-3">
            <p className="text-[18px] font-medium text-[var(--rn-ink)]">What to improve first</p>
            <ol className="mt-4 grid overflow-hidden rounded-2xl border border-[var(--rn-line)] sm:grid-cols-2">
              {fixes.slice(0, 4).map((fix, index) => (
                <li
                  key={`${fix}-${index}`}
                  className="flex min-w-0 items-center gap-3 border-b border-[var(--rn-line)] p-4 text-[14.5px] leading-relaxed text-[var(--rn-ink)] last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--rn-card-2)] font-mono text-[11px] font-bold text-[var(--rn-muted)]">{String(index + 1).padStart(2, "0")}</span>
  <span className="min-w-0 flex-1">{fix}</span>
</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
