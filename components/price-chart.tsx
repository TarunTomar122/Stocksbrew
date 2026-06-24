"use client";

import { useRef, useState } from "react";

type Point = { date: string; close: number };

/** Price line with 50/200-day MA reference lines, optional accumulate/trim zone, and hover crosshair. */
export function PriceChart({
  data,
  sma50,
  sma200,
  currency,
  zoneBelow,
  zoneAbove,
  zoneColor = "var(--signal-bullish)",
  zoneLabel,
  lineColor,
}: {
  data: Point[];
  sma50?: number;
  sma200?: number;
  currency: string;
  /** Shade everything below this price (e.g. accumulate on dips). */
  zoneBelow?: number;
  /** Shade everything above this price (e.g. trim into strength). */
  zoneAbove?: number;
  zoneColor?: string;
  zoneLabel?: string;
  /** Stroke color for the price line (defaults to ink). */
  lineColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 640, H = 130;
  const closes = data.map((p) => p.close);
  const extra = [sma50, sma200, zoneBelow, zoneAbove].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  let lo = Math.min(...closes, ...extra);
  let hi = Math.max(...closes, ...extra);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const X = (i: number) => (i / (data.length - 1)) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(p.close).toFixed(1)}`).join(" ");
  const ma50Y = typeof sma50 === "number" && Number.isFinite(sma50) ? Y(sma50) : null;
  const ma200Y = typeof sma200 === "number" && Number.isFinite(sma200) ? Y(sma200) : null;
  const zoneBelowY = typeof zoneBelow === "number" && Number.isFinite(zoneBelow) ? Y(zoneBelow) : null;
  const zoneAboveY = typeof zoneAbove === "number" && Number.isFinite(zoneAbove) ? Y(zoneAbove) : null;
  const priceStroke = lineColor ?? "color-mix(in srgb, var(--on-surface) 82%, transparent)";

  const money = (v: number) => `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (data.length - 1)));
  }

  const hp = hover != null ? data[hover] : null;
  const hoverLeftPct = hover != null ? (hover / (data.length - 1)) * 100 : 0;
  const zoneLineY = zoneBelowY ?? zoneAboveY;
  const zoneLinePct = zoneLineY != null ? (zoneLineY / H) * 100 : null;
  const zoneLabelTop =
    zoneBelowY != null && zoneLinePct != null
      ? zoneLinePct + (100 - zoneLinePct) * 0.42
      : zoneAboveY != null && zoneLinePct != null
        ? zoneLinePct * 0.42
        : zoneLinePct;

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full">
        {zoneBelowY != null && (
          <rect x={0} y={zoneBelowY} width={W} height={H - zoneBelowY} fill={zoneColor} opacity={0.14} />
        )}
        {zoneAboveY != null && (
          <rect x={0} y={0} width={W} height={zoneAboveY} fill={zoneColor} opacity={0.14} />
        )}
        {ma200Y != null && <line x1={0} x2={W} y1={ma200Y} y2={ma200Y} stroke="var(--on-surface-variant)" strokeWidth={1} strokeDasharray="4 4" opacity={0.45} />}
        {ma50Y != null && <line x1={0} x2={W} y1={ma50Y} y2={ma50Y} stroke="var(--on-surface-variant)" strokeWidth={1} strokeDasharray="4 4" opacity={0.55} />}
        {zoneBelowY != null && (
          <line x1={0} x2={W} y1={zoneBelowY} y2={zoneBelowY} stroke={zoneColor} strokeWidth={1} strokeDasharray="5 4" opacity={0.55} vectorEffect="non-scaling-stroke" />
        )}
        {zoneAboveY != null && (
          <line x1={0} x2={W} y1={zoneAboveY} y2={zoneAboveY} stroke={zoneColor} strokeWidth={1} strokeDasharray="5 4" opacity={0.55} vectorEffect="non-scaling-stroke" />
        )}
        <path d={path} fill="none" stroke={priceStroke} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        {hp && (
          <>
            <line x1={X(hover!)} x2={X(hover!)} y1={0} y2={H} stroke="var(--on-surface-variant)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.6} />
            <circle cx={X(hover!)} cy={Y(hp.close)} r={3.5} fill={priceStroke} stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {zoneLabel && zoneLabelTop != null && (
        <div
          className="pointer-events-none absolute left-2 z-10 max-w-[58%] truncate rounded-md border px-2 py-0.5 font-mono text-[10px] leading-snug shadow-sm"
          style={{
            top: `${zoneLabelTop}%`,
            transform: "translateY(-50%)",
            color: zoneColor,
            background: "var(--surface)",
            borderColor: `color-mix(in srgb, ${zoneColor} 28%, var(--outline-variant))`,
          }}
        >
          {zoneLabel}
        </div>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-2 py-1 font-mono text-[11px] shadow-md"
          style={{ left: `${hoverLeftPct}%`, background: "var(--surface-container-highest)", color: "var(--on-surface)" }}
        >
          <span className="font-bold tabular-nums">{money(hp.close)}</span>
          <span className="ml-1.5 text-on-surface-variant">{fmtDate(hp.date)}</span>
        </div>
      )}
    </div>
  );
}
