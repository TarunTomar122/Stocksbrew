import * as React from "react";

import { fmtEps, fmtSignedPct } from "@/lib/earnings-day-shared";

/**
 * Two small honest charts for an earnings report, inline SVG, no chart
 * library. Both share one scale per chart, start bars at zero, label values
 * directly in ink and carry a hover title on every mark. Green and red only
 * mean better or worse than expected, up or down.
 */

const BAR_H = 14;

function toneVar(tone: "up" | "down" | "flat"): string {
  return tone === "up" ? "var(--signal-bullish)" : tone === "down" ? "var(--signal-bearish)" : "var(--oa-fg)";
}

/** Expected against actual EPS, from one zero line. Handles losses (bars run left). */
export function EpsBars({ estimate, actual, tone, label = "EPS" }: { estimate: number; actual: number; tone: "up" | "down" | "flat"; label?: string }) {
  const rows = [
    { name: "Expected", value: estimate, fill: "var(--oa-muted-fg)", opacity: 0.45 },
    { name: "Actual", value: actual, fill: toneVar(tone), opacity: 1 },
  ];
  const max = Math.max(Math.abs(estimate), Math.abs(actual), 0.01);
  const hasNegative = estimate < 0 || actual < 0;
  const hasPositive = estimate > 0 || actual > 0;
  // Plot area in viewBox units; the labels column sits left of it.
  const left = 70;
  const width = 230;
  const zero = hasNegative && hasPositive ? left + width / 2 : hasNegative ? left + width : left;
  const span = hasNegative && hasPositive ? width / 2 : width;
  const scale = (value: number) => (Math.abs(value) / max) * (span - 52);
  return (
    <svg viewBox={`0 0 320 ${rows.length * 30 + 6}`} role="img" aria-label={`${label}: expected ${fmtEps(estimate)}, actual ${fmtEps(actual)}`} className="block h-auto w-full max-w-[22rem]">
      {rows.map((row, index) => {
        const y = 6 + index * 30;
        const length = Math.max(scale(row.value), 2);
        const x = row.value < 0 ? zero - length : zero;
        const textX = row.value < 0 ? x - 6 : x + length + 6;
        return (
          <g key={row.name}>
            <title>{`${row.name}: ${fmtEps(row.value)} a share`}</title>
            <text x={0} y={y + BAR_H - 3} className="fill-[var(--oa-muted-fg)] text-[11px]" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
              {row.name}
            </text>
            <rect x={x} y={y} width={length} height={BAR_H} rx={4} fill={row.fill} opacity={row.opacity} />
            <text
              x={textX}
              y={y + BAR_H - 3}
              textAnchor={row.value < 0 ? "end" : "start"}
              className="fill-[var(--oa-fg)] text-[12.5px] font-medium tabular-nums"
              style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
            >
              {fmtEps(row.value)}
            </text>
          </g>
        );
      })}
      <line x1={zero} x2={zero} y1={2} y2={rows.length * 30 + 4} stroke="var(--oa-border)" strokeWidth={1} />
    </svg>
  );
}

/**
 * This report's move against the stock's usual earnings move: a shaded band
 * for the usual size either way, a tick for each past report, and this move
 * as the one coloured bar from zero.
 */
export function ReactionStrip({
  pct,
  typical,
  history,
  final,
}: {
  pct: number;
  typical: number | null | undefined;
  history: Array<{ day: string; pct: number }>;
  final: boolean;
}) {
  const extent = Math.max(Math.abs(pct), typical ?? 0, ...history.map((row) => Math.abs(row.pct)), 1) * 1.12;
  const left = 8;
  const width = 304;
  const mid = left + width / 2;
  const x = (value: number) => mid + (value / extent) * (width / 2);
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const barY = 30;
  return (
    <svg viewBox="0 0 320 78" role="img" aria-label={`Moved ${fmtSignedPct(pct)}${typical ? `, usual move ${typical.toFixed(1)}% either way` : ""}`} className="block h-auto w-full max-w-[30rem]">
      {typical ? (
        <g>
          <title>{`Usual earnings move: ${typical.toFixed(1)}% either way (median of the last ${history.length} reports)`}</title>
          <rect x={x(-typical)} y={18} width={x(typical) - x(-typical)} height={30} rx={4} fill="var(--oa-muted-fg)" opacity={0.13} />
          <text x={x(-typical)} y={13} textAnchor="middle" className="fill-[var(--oa-muted-fg)] text-[11.5px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
            −{typical.toFixed(1)}%
          </text>
          <text x={x(typical)} y={13} textAnchor="middle" className="fill-[var(--oa-muted-fg)] text-[11.5px] tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
            +{typical.toFixed(1)}%
          </text>
        </g>
      ) : null}
      {history.map((row) => (
        <g key={row.day}>
          <title>{`${row.day}: ${fmtSignedPct(row.pct)}`}</title>
          <rect x={x(row.pct) - 1} y={20} width={2} height={26} rx={1} fill="var(--oa-muted-fg)" opacity={0.55} />
          {/* A wider invisible target so the tooltip is easy to hit. */}
          <rect x={x(row.pct) - 5} y={16} width={10} height={34} fill="transparent" />
        </g>
      ))}
      <g>
        <title>{`This report: ${fmtSignedPct(pct)}${final ? "" : " so far"}`}</title>
        <rect
          x={Math.min(mid, x(pct))}
          y={barY - 3}
          width={Math.max(Math.abs(x(pct) - mid), 2)}
          height={BAR_H}
          rx={4}
          fill={toneVar(tone)}
          opacity={final ? 1 : 0.7}
        />
      </g>
      <line x1={mid} x2={mid} y1={16} y2={52} stroke="var(--oa-fg)" strokeWidth={1} opacity={0.5} />
      <text x={x(pct)} y={68} textAnchor={pct < 0 ? "start" : "end"} className="fill-[var(--oa-fg)] text-[12.5px] font-medium tabular-nums" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
        {fmtSignedPct(pct)}
      </text>
      {Math.abs(x(pct) - mid) > 56 ? (
        <text x={mid} y={68} textAnchor="middle" className="fill-[var(--oa-muted-fg)] text-[11.5px]" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
          0
        </text>
      ) : null}
    </svg>
  );
}
