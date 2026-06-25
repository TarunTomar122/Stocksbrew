type Props = {
  label: string;
  low: number;
  high: number;
  current: number;
  /** Optional secondary marker (e.g. industry avg, sector P/E). */
  reference?: { value: number; label: string };
  /** How to format each anchor value. */
  format: (v: number) => string;
};

const STRIP_PAD = 7;

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

function StripMarker({
  leftPct,
  variant = "primary",
  title,
}: {
  leftPct: number;
  variant?: "primary" | "reference";
  title?: string;
}) {
  const isRef = variant === "reference";
  return (
    <span
      aria-hidden
      title={title}
      className={
        isRef
          ? "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-outline-variant bg-surface-container-high shadow-sm"
          : "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-on-surface bg-surface shadow-[0_1px_4px_rgba(17,24,39,0.16)]"
      }
      style={{ left: `${clampPct(leftPct)}%` }}
    />
  );
}

/** Dot-on-a-track used in stock hero (52w range, RSI). Marker sits in padded lane so it never clips. */
export function PositionStrip({
  pct,
  trackBackground,
  fillPct,
  fillBackground,
}: {
  pct: number;
  trackBackground: string;
  fillPct?: number;
  fillBackground?: string;
}) {
  const p = clampPct(pct);
  return (
    <div className="relative h-2.5">
      <div className="absolute inset-0 rounded-full" style={{ background: trackBackground }} />
      {fillPct != null && fillBackground && (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${clampPct(fillPct)}%`, background: fillBackground }}
        />
      )}
      <div className="absolute inset-y-0" style={{ left: STRIP_PAD, right: STRIP_PAD }}>
        <StripMarker leftPct={p} />
      </div>
    </div>
  );
}

export function RsiZoneLabels() {
  const zoneLeft = (pct: number) =>
    `calc(${STRIP_PAD}px + (100% - ${STRIP_PAD * 2}px) * ${pct / 100})`;

  return (
    <div className="relative mt-2 h-3.5 font-mono text-[9px] tabular-nums text-on-surface-variant/75">
      <span className="absolute left-0 top-0">0</span>
      <span
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
        style={{ left: zoneLeft(30) }}
        title="Oversold below 30"
      >
        30
      </span>
      <span
        className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
        style={{ left: zoneLeft(70) }}
        title="Overbought above 70"
      >
        70
      </span>
      <span className="absolute right-0 top-0">100</span>
    </div>
  );
}

const RSI_TRACK_BG =
  "linear-gradient(90deg, color-mix(in srgb, var(--signal-bearish) 10%, var(--surface-container-high)) 0%, var(--surface-container-high) 30%, color-mix(in srgb, var(--signal-bullish) 8%, var(--surface-container-high)) 50%, var(--surface-container-high) 70%, color-mix(in srgb, var(--signal-bearish) 10%, var(--surface-container-high)) 100%)";

const WEEK52_FILL_BG =
  "linear-gradient(90deg, color-mix(in srgb, var(--signal-bearish) 10%, var(--surface-container-high)), color-mix(in srgb, var(--signal-bullish) 12%, var(--surface-container-high)))";

export { RSI_TRACK_BG, WEEK52_FILL_BG };

// Cal/INDmoney-style range strip: a gradient bar with a dot marker at the
// current value. Built to sit in narrow columns (3-up grid) so headers stack
// vertically rather than fighting for horizontal room.
export function RangeBar({
  label,
  low,
  high,
  current,
  reference,
  format,
}: Props) {
  const span = high - low;
  if (!Number.isFinite(span) || span <= 0) return null;
  const clamp = (v: number) => Math.max(0, Math.min(100, ((v - low) / span) * 100));
  const currentPct = clamp(current);
  const refPct = reference ? clamp(reference.value) : null;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
            Low
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-on-surface sm:text-[14px]">
            {format(low)}
          </span>
        </div>
        <div className="min-w-0 text-right">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
            High
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-on-surface sm:text-[14px]">
            {format(high)}
          </span>
        </div>
      </div>

      <div className="relative h-2.5">
        <div className="absolute inset-0 rounded-full bg-surface-container-high" />
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: WEEK52_FILL_BG }}
        />
        {/* Inner safe zone - markers are centered within this padded area so
         * the 0% and 100% extremes don't clip on the rounded edges. */}
        <div className="absolute inset-y-0 left-[7px] right-[7px]">
          {refPct !== null && (
            <StripMarker leftPct={refPct} variant="reference" title={reference?.label} />
          )}
          <StripMarker leftPct={currentPct} />
        </div>
      </div>

      <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] text-on-surface-variant">
        <span className="min-w-0 truncate tabular-nums">
          Today <span className="font-semibold text-on-surface">{format(current)}</span>
        </span>
        {reference && (
          <span className="shrink-0 text-right tabular-nums">
            {reference.label}{" "}
            <span className="font-semibold text-on-surface">{format(reference.value)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

type RsiProps = {
  value: number;
  state?: string;
};

// Dedicated RSI strip with overbought/oversold zones drawn into the gradient.
// Goes 0–100, marker at the current value.
export function RsiStrength({ value, state }: RsiProps) {
  if (!Number.isFinite(value)) return null;

  const clamped = Math.max(0, Math.min(100, value));
  const verdict =
    state === "overbought" || value >= 70
      ? { label: "Overbought", color: "var(--signal-bearish)" }
      : state === "oversold" || value <= 30
        ? { label: "Oversold", color: "var(--signal-bullish)" }
        : { label: "Neutral", color: "var(--on-surface-variant)" };

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
        RSI (14)
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[18px] font-semibold tabular-nums text-on-surface">
            {value.toFixed(1)}
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: verdict.color }}
          >
            {verdict.label}
          </span>
        </span>
      </div>

      <PositionStrip pct={clamped} trackBackground={RSI_TRACK_BG} />

      <RsiZoneLabels />
    </div>
  );
}
