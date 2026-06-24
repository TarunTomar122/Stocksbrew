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
    <div className="flex flex-col gap-2.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
        {label}
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
            Low
          </span>
          <span className="text-[14px] font-semibold tabular-nums text-on-surface">
            {format(low)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
            High
          </span>
          <span className="text-[14px] font-semibold tabular-nums text-on-surface">
            {format(high)}
          </span>
        </div>
      </div>

      <div className="relative h-2">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #f97316 0%, #f59e0b 22%, #84cc16 55%, #10b981 100%)",
          }}
        />
        {/* Inner safe zone - markers are centered within this padded area so
         * the 0% and 100% extremes don't clip on the rounded edges. */}
        <div className="absolute inset-y-0 left-[7px] right-[7px]">
          {refPct !== null && (
            <span
              aria-hidden
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-surface"
              style={{ left: `${refPct}%`, boxShadow: "0 0 0 1px #6b7280" }}
              title={reference?.label}
            />
          )}
          <span
            aria-hidden
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-surface ring-2 ring-on-surface"
            style={{ left: `${currentPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 text-[11px] text-on-surface-variant">
        <span className="tabular-nums">
          Today <span className="font-semibold text-on-surface">{format(current)}</span>
        </span>
        {reference && (
          <span className="tabular-nums">
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
      ? { label: "Overbought", tone: "text-[#ef4444]" }
      : state === "oversold" || value <= 30
        ? { label: "Oversold", tone: "text-[#0052ff]" }
        : { label: "Neutral", tone: "text-[#10b981]" };

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
        RSI (14)
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[20px] font-semibold tabular-nums text-on-surface">
            {value.toFixed(1)}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${verdict.tone}`}
          >
            {verdict.label}
          </span>
        </span>
      </div>

      <div className="relative h-2">
        {/* Zones live in a clipped child so the marker can extend beyond. */}
        <div className="absolute inset-0 rounded-full overflow-hidden bg-surface-container">
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: "30%", background: "rgba(239,68,68,0.18)" }}
          />
          <div
            className="absolute inset-y-0"
            style={{ left: "70%", width: "30%", background: "rgba(239,68,68,0.18)" }}
          />
          <div
            className="absolute inset-y-0"
            style={{
              left: "30%",
              width: "40%",
              background: "linear-gradient(90deg, #84cc16 0%, #10b981 100%)",
              opacity: 0.85,
            }}
          />
        </div>
        {/* Marker sits in an unclipped sibling so it can render full-size. */}
        <div className="absolute inset-y-0 left-[7px] right-[7px]">
          <span
            aria-hidden
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-surface ring-2 ring-on-surface"
            style={{ left: `${clamped}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
        <span>Oversold</span>
        <span>Healthy</span>
        <span>Overbought</span>
      </div>
    </div>
  );
}
