"use client";

import { useState } from "react";
import type { HealthPillar } from "@/components/radar-next/types";

function gradeColor(pct: number): string {
  if (pct >= 75) return "var(--rn-bull)";
  if (pct >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function GradeRing({ pct, grade }: { pct: number; grade: string }) {
  const size = 118;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  const color = gradeColor(clamped);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="rn-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ stroke: color }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="rn-stat text-[34px] font-extrabold" style={{ color }}>
          {grade}
        </span>
        <span className="font-mono text-[10px] text-[var(--rn-muted)]">{Math.round(clamped)}/100</span>
      </div>
    </div>
  );
}

function PillarBar({ pillar }: { pillar: HealthPillar }) {
  const color = gradeColor(pillar.score);
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-20 shrink-0 font-mono text-[11px] text-[var(--rn-muted)]">{pillar.label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rn-card-2)]">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(4, Math.min(100, pillar.score))}%`, background: color }}
        />
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-[var(--rn-ink)]">
        {Math.round(pillar.score)}
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
  const [showFixes, setShowFixes] = useState(true);
  return (
    <section aria-labelledby="rn-health" className="flex h-full flex-col">
      <h2 id="rn-health" className="rn-kick mb-3">
        // book health
      </h2>
      <div className="rn-card flex-1 p-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          <GradeRing pct={gradePct} grade={grade} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug text-[var(--rn-ink)]">{headline}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--rn-muted)]">{body}</p>
          </div>
        </div>

        {pillars.length > 0 ? (
          <div className="mt-5 space-y-2.5 border-t border-[var(--rn-line)] pt-4">
            {pillars.map((p) => (
              <PillarBar key={p.label} pillar={p} />
            ))}
          </div>
        ) : null}

        {fixes.length > 0 ? (
          <div className="mt-4 border-t border-[var(--rn-line)] pt-4">
            <button
              type="button"
              onClick={() => setShowFixes((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="rn-kick">top fixes · {fixes.length}</span>
              <span
                className="font-mono text-[12px] text-[var(--rn-muted)] transition-transform"
                style={{ transform: showFixes ? "rotate(90deg)" : "none" }}
                aria-hidden
              >
                ›
              </span>
            </button>
            {showFixes ? (
              <ol className="mt-3 space-y-2">
                {fixes.map((fix, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-[var(--rn-muted)]">
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold"
                      style={{ color: "var(--rn-accent)", background: "color-mix(in srgb, var(--rn-accent) 14%, transparent)" }}
                    >
                      {i + 1}
                    </span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
