import type { Directive } from "@/lib/stock";

type Props = {
  ticker: string;
  directive?: Directive | null;
};

const STANCE_BG: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  watch: "var(--primary)",
  avoid: "var(--signal-bearish)",
  hold: "var(--surface-container-high)",
};

function isTriggerable(d: Directive): boolean {
  return (
    (d.trigger_type === "price_below" || d.trigger_type === "price_above") &&
    !!d.trigger_value
  );
}

export function StrategicDirective({ ticker, directive }: Props) {
  if (!directive?.text) return null;
  const stance = directive.stance ?? "watch";
  const bg = STANCE_BG[stance] ?? STANCE_BG.watch;
  const isNeutralText = stance === "trim" || stance === "hold";

  return (
    <section
      className="relative overflow-hidden px-8 py-6 flex items-center justify-between gap-6 brutalist-border"
      style={{
        backgroundColor: bg,
        color: isNeutralText ? "var(--on-surface)" : "var(--on-primary)",
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 select-none font-display font-black tracking-[-0.04em] text-[72px] leading-none"
        style={{
          color: isNeutralText ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)",
        }}
      >
        {ticker}
      </span>

      <div className="min-w-0 relative z-10 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-[0.2em] uppercase opacity-75">
            Strategic Directive
          </span>
          {directive.confidence && (
            <span
              className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase rounded-sm"
              style={{
                backgroundColor: isNeutralText
                  ? "rgba(0,0,0,0.1)"
                  : "rgba(255,255,255,0.2)",
              }}
            >
              {directive.confidence}
            </span>
          )}
        </div>
        <h2 className="mt-2 text-[28px] font-bold tracking-tight leading-tight">
          {directive.text}
        </h2>
        {directive.rationale && (
          <p className="mt-2 text-[13px] leading-snug opacity-85 max-w-2xl">
            {directive.rationale}
          </p>
        )}
      </div>

      {isTriggerable(directive) && (
        <button
          type="button"
          className="shrink-0 relative z-10 bg-surface-container-lowest text-on-surface px-5 py-2.5 text-sm font-bold tracking-tight hover:bg-surface-container-low transition-colors"
        >
          Set Alert
        </button>
      )}
    </section>
  );
}
