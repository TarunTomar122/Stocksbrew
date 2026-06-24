import type { Directive } from "@/lib/stock";
import { AlertButton } from "@/components/alert-button";

type Props = {
  ticker: string;
  directive?: Directive | null;
  instrumentId?: string;
};

// Each stance maps to one accent hue. The card tint and text derive from it via
// color-mix over themed surface tokens, so it adapts to light and dark.
const STANCE_META: Record<string, { label: string; accent: string }> = {
  accumulate: { label: "Accumulate", accent: "#10b981" },
  trim:       { label: "Trim",       accent: "#f59e0b" },
  watch:      { label: "Watch",      accent: "#3b82f6" },
  avoid:      { label: "Avoid",      accent: "#ef4444" },
  hold:       { label: "Hold",       accent: "#64748b" },
};

function StrategicDirectiveCard({ ticker, directive, instrumentId }: { ticker: string; directive: Directive; instrumentId?: string }) {
  const stance = (directive.stance ?? "watch").toLowerCase();
  const meta = STANCE_META[stance] ?? STANCE_META.watch;

  const showAlert =
    instrumentId &&
    (directive.trigger_type === "price_below" || directive.trigger_type === "price_above") &&
    typeof directive.trigger_value === "string" &&
    directive.trigger_value.trim() !== "" &&
    !isNaN(Number(directive.trigger_value));

  const alertCondition = directive.trigger_type === "price_below" ? "below" : "above";
  const alertPrice = showAlert ? Number(directive.trigger_value) : 0;

  const TRIGGER_LABEL: Record<string, string> = {
    price_below: "trigger · add below",
    price_above: "trigger · trim above",
    date: "trigger · watch date",
    sentiment_flip: "trigger · sentiment flips",
    new_catalyst: "trigger · new catalyst",
  };
  const triggerLabel = directive.trigger_type ? TRIGGER_LABEL[directive.trigger_type] : undefined;
  const triggerValue = typeof directive.trigger_value === "string" ? directive.trigger_value.trim() : "";
  const showTriggerChip = Boolean(triggerLabel && triggerValue);

  return (
    <section
      className="panel relative overflow-hidden px-6 py-6 md:px-7 md:py-7"
      style={{ background: `color-mix(in srgb, ${meta.accent} 8%, var(--surface-container-low))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 select-none font-mono font-bold tracking-[-0.04em] text-[120px] leading-none opacity-[0.05]"
        style={{ color: meta.accent }}
      >
        {ticker}
      </span>

      <div className="relative z-10 flex flex-col gap-4">
        {/* Kicker: THE CALL · PRO ........ conviction · alert */}
        <div className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
          <span style={{ color: meta.accent }}>The call</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] text-amber"
            style={{ background: "color-mix(in srgb, var(--secondary-container) 22%, transparent)" }}
          >
            Pro
          </span>
          <span className="ml-auto flex items-center gap-3 text-on-surface-variant">
            {directive.confidence && (
              <span>
                conviction: <span style={{ color: meta.accent }}>{directive.confidence}</span>
              </span>
            )}
            {showAlert && (
              <AlertButton
                ticker={ticker}
                instrumentId={instrumentId!}
                condition={alertCondition}
                targetPrice={alertPrice}
                directiveText={directive.text}
              />
            )}
          </span>
        </div>

        {/* Stance word + the action line */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="font-mono text-[26px] md:text-[30px] font-bold tracking-tight leading-none"
            style={{ color: meta.accent }}
          >
            {meta.label.toUpperCase()}
          </span>
          <span className="text-[14px] md:text-[15px] text-on-surface-variant">{directive.text}</span>
        </div>

        {directive.rationale && (
          <p className="max-w-[680px] text-[14px] leading-[1.6] text-on-surface-variant">
            {directive.rationale}
          </p>
        )}

        {showTriggerChip && (
          <div className="pt-1">
            <div className="inset inline-flex flex-col px-3 py-2.5 font-mono text-[11px]">
              <span className="tracking-[0.1em] uppercase text-on-surface-variant">{triggerLabel}</span>
              <span className="mt-0.5 text-on-surface">{triggerValue}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function StrategicDirective({ ticker, directive, instrumentId }: Props) {
  if (!directive?.text) return null;
  return <StrategicDirectiveCard ticker={ticker} directive={directive} instrumentId={instrumentId} />;
}

/** Same UI as the AI tab strategic directive - pass static copy for marketing / previews. */
export function StrategicDirectiveDemo({
  ticker,
  directive,
}: {
  ticker: string;
  directive: Directive;
}) {
  return <StrategicDirectiveCard ticker={ticker} directive={directive} />;
}
