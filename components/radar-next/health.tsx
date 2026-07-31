import type { HealthPillar } from "@/components/radar-next/types";

function gradeColor(score: number): string {
  if (score >= 75) return "var(--rn-bull)";
  if (score >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function PillarBar({ pillar }: { pillar: HealthPillar }) {
  const color = gradeColor(pillar.score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--rn-muted)]">{pillar.label}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--rn-ink)]">
          {Math.round(pillar.score)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--rn-card-2)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(4, Math.min(100, pillar.score))}%`, background: color }}
        />
      </div>
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
  const color = gradeColor(gradePct);
  return (
    <section aria-labelledby="rn-health">
      <div className="mb-3">
        <span className="rn-kick">Book health</span>
        <h2 id="rn-health" className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-[var(--rn-ink)] sm:text-[26px]">
          The portfolio-level read
        </h2>
      </div>

      <div className="border-y border-[var(--rn-line)]">
        <div className="grid gap-7 py-6 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] md:items-center md:px-3">
          <div className="flex min-w-0 items-start gap-4 sm:gap-6">
            <div className="shrink-0">
              <span className="block text-[46px] font-extrabold leading-none tracking-[-0.06em]" style={{ color }}>
                {grade}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-[var(--rn-muted)]">{Math.round(gradePct)}/100</span>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-snug text-[var(--rn-ink)] sm:text-[17px]">{headline}</p>
              <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-[var(--rn-muted)]">{body}</p>
            </div>
          </div>

          {pillars.length > 0 ? (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {pillars.map((pillar) => <PillarBar key={pillar.label} pillar={pillar} />)}
            </div>
          ) : null}
        </div>

        {fixes.length > 0 ? (
          <div className="border-t border-[var(--rn-line)] py-5 md:px-3">
            <span className="rn-kick">What to improve first</span>
            <ol className="mt-3 grid gap-3 sm:grid-cols-2">
              {fixes.slice(0, 4).map((fix, index) => (
                <li key={`${fix}-${index}`} className="flex gap-2.5 text-[12.5px] leading-relaxed text-[var(--rn-muted)]">
                  <span className="font-mono text-[10px] font-bold text-[var(--rn-ink)]">{String(index + 1).padStart(2, "0")}</span>
                  <span>{fix}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
