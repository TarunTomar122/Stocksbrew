function moveConfidence(confidence?: string) {
  const level = (confidence ?? "med").toLowerCase();
  if (level === "high") return { filled: 3, color: "var(--signal-bullish)", label: "high" };
  if (level === "low") return { filled: 1, color: "var(--on-surface-variant)", label: "low" };
  return { filled: 2, color: "var(--signal-neutral)", label: "med" };
}

function MoveConfidenceInline({ confidence }: { confidence?: string }) {
  const { filled, color, label } = moveConfidence(confidence);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-on-surface-variant">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: i <= filled ? color : "transparent",
            boxShadow: i <= filled ? undefined : "inset 0 0 0 1px var(--outline-variant)",
          }}
        />
      ))}
      <span className="normal-case">{label}</span>
    </span>
  );
}

const sign = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

/** Unusual-move explainer for the stock page right rail. */
export function StockTodaysMoveRailCard({
  dayPct,
  dayAbs,
  up,
  formatMoney,
  headline,
  body,
  confidence,
}: {
  dayPct: number;
  dayAbs?: number;
  up: boolean;
  formatMoney: (value: number) => string;
  headline?: string;
  body?: string;
  confidence?: string;
}) {
  if (!headline && !body) return null;

  const moveColor = up ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <section
      id="stock-todays-move"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-outline-variant bg-surface p-4 sm:p-5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-on-surface-variant">today&apos;s move</p>
        <p className="font-mono text-[12px] font-bold tabular-nums" style={{ color: moveColor }}>
          {up ? "▲" : "▼"} {sign(dayPct, 1)}
          {typeof dayAbs === "number" && Number.isFinite(dayAbs) ? (
            <span className="ml-1.5 font-semibold text-on-surface-variant">
              {dayAbs >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(dayAbs))}
            </span>
          ) : null}
        </p>
      </div>

      {headline ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[14px] font-bold leading-snug text-on-surface">{headline}</p>
          {confidence ? <MoveConfidenceInline confidence={confidence} /> : null}
        </div>
      ) : confidence ? (
        <MoveConfidenceInline confidence={confidence} />
      ) : null}

      {body ? (
        <p className={`text-[12.5px] leading-relaxed text-on-surface-variant ${headline ? "mt-2" : "mt-1"}`}>
          {body}
        </p>
      ) : null}
    </section>
  );
}
