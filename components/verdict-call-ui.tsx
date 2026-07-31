import type { ReactNode } from "react";

export const CALL_KICK = "font-mono text-[11px] uppercase tracking-[0.13em] text-on-surface-variant";

function convictionDots(confidence: string) {
  const level = confidence.toLowerCase();
  if (level === "high") return { filled: 3, color: "var(--signal-bullish)", label: "HIGH CONVICTION" };
  if (level === "med" || level === "medium") return { filled: 2, color: "var(--accent-terminal)", label: "MED CONVICTION" };
  return { filled: 1, color: "var(--on-surface-variant)", label: "LOW CONVICTION" };
}

export function ConvictionDotsInline({ confidence }: { confidence: string }) {
  const { filled, color, label } = convictionDots(confidence);
  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex gap-1" role="img" aria-label={label}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: i <= filled ? color : "transparent",
              boxShadow: i <= filled ? undefined : "inset 0 0 0 1px var(--outline-variant)",
            }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
    </div>
  );
}

export function highlightCallText(text: string) {
  const parts = text.split(/(\$[\d,]+(?:\.\d{2})?|[\d.]+%)/g);
  return parts.map((part, i) =>
    /^(\$[\d,]+(?:\.\d{2})?|[\d.]+%)$/.test(part) ? (
      <strong key={i} className="font-semibold text-on-surface">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export function CallInsightCard({
  tone,
  title,
  bullets,
  footer,
}: {
  tone: "bullish" | "bearish";
  title: string;
  bullets: string[];
  footer?: string | null;
}) {
  const accent = tone === "bullish" ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <div className="flex h-full min-w-0 flex-col">
      <p className={`${CALL_KICK} mb-3`} style={{ color: accent }}>
        {title}
      </p>
      <ul className="space-y-2.5">
        {bullets.map((text, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-on-surface/80">
            <span
              aria-hidden
              className="mt-[0.35rem] h-1 w-1 shrink-0 rounded-full"
              style={{ background: accent }}
            />
            <span>{highlightCallText(text)}</span>
          </li>
        ))}
      </ul>
      {footer ? (
        <p className="mt-4 text-[12px] leading-snug text-on-surface-variant">{highlightCallText(footer)}</p>
      ) : null}
    </div>
  );
}

export function CallMetricsStrip({
  metrics,
  actions,
  mobileColumns = "auto",
}: {
  metrics: Array<{
    label: string;
    value: string;
    hint?: string;
    hintTone?: "bullish" | "bearish" | "neutral";
  }>;
  actions?: ReactNode;
  mobileColumns?: "auto" | 2;
}) {
  if (!metrics.length && !actions) return null;

  const hintColor = (tone?: "bullish" | "bearish" | "neutral") =>
    tone === "bullish"
      ? "var(--signal-bullish)"
      : tone === "bearish"
        ? "var(--signal-bearish)"
        : "var(--on-surface-variant)";

  return (
    <div
      className={`grid gap-x-4 gap-y-5 border-t border-outline-variant/50 pt-5 sm:gap-x-6 ${
        mobileColumns === 2
          ? "grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]"
          : "grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]"
      }`}
    >
      {metrics.map((m) => (
        <div key={m.label} className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant sm:text-[9.5px] sm:tracking-[0.12em]">
            {m.label}
          </p>
          <p className="mt-1 text-[15px] font-bold tabular-nums tracking-tight text-on-surface sm:text-[17px]">{m.value}</p>
          {m.hint ? (
            <p
              className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em]"
              style={{ color: hintColor(m.hintTone) }}
            >
              {m.hint}
            </p>
          ) : null}
        </div>
      ))}
      {actions}
    </div>
  );
}
