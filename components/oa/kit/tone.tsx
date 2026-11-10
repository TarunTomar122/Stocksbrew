import * as React from "react";

/**
 * The good-or-bad marks on their own, with no server imports, so client
 * components can use them too. The kit index re-exports both.
 */

const TONE_VAR = { up: "var(--signal-bullish)", down: "var(--signal-bearish)", flat: "var(--oa-muted-fg)" } as const;

/**
 * The good-or-bad cue, used everywhere a number or a sentence could be read
 * either way. Numbers stay in the normal text colour so they read as numbers;
 * this small arrow beside them carries the colour. Neutral is a hollow ring,
 * never a dash, because a dash beside a number reads as a minus sign.
 */
export function ToneGlyph({
  tone,
  className = "",
  decorative = false,
}: {
  tone: "up" | "down" | "flat";
  className?: string;
  /** Hidden from screen readers when a word beside it already says it (inside a Verdict). */
  decorative?: boolean;
}) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": tone === "up" ? "good" : tone === "down" ? "bad" : "neutral" })}
      className={`inline-block shrink-0 ${className}`}
      style={{ color: TONE_VAR[tone] }}
    >
      {tone === "up" ? (
        <path d="M5 1.5 9 8H1z" fill="currentColor" />
      ) : tone === "down" ? (
        <path d="M5 8.5 1 2h8z" fill="currentColor" />
      ) : (
        <circle cx="5" cy="5" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  );
}

/**
 * A short verdict word on a soft tint of its tone, beside a sentence or a
 * figure: "Growing", "Thin margin", "Heavy debt". The word carries the
 * meaning, so the colour is never the only signal.
 */
export function Verdict({ tone, children, className = "" }: { tone: "up" | "down" | "flat"; children: React.ReactNode; className?: string }) {
  const color = TONE_VAR[tone];
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium leading-none ${className}`}
      style={{ color, background: `color-mix(in srgb, ${color} ${tone === "flat" ? 10 : 12}%, transparent)` }}
    >
      <ToneGlyph tone={tone} className="size-2" decorative />
      {children}
    </span>
  );
}

/**
 * A fixed-width slot after a number for its good-or-bad mark, so right-aligned
 * figures line up whether or not a row has one. Neutral and missing leave the
 * slot empty: a gray mark beside a number reads as a minus sign.
 */
export function MarkSlot({ tone, className = "" }: { tone: "up" | "down" | "flat" | null | undefined; className?: string }) {
  return <span className={`inline-flex w-2.5 shrink-0 justify-center ${className}`}>{tone === "up" || tone === "down" ? <ToneGlyph tone={tone} /> : null}</span>;
}

/**
 * The size of a move as a short bar, scaled to the biggest move in its list
 * (pass that as `max`), green up and red down. Reads faster than a column of
 * percentages; the number stays beside it.
 */
export function MoveBar({
  value,
  max,
  width = 56,
  className = "",
}: {
  value: number | null | undefined;
  max: number;
  width?: number;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value) || !(max > 0)) return null;
  const share = Math.min(1, Math.abs(value) / max);
  return (
    <span aria-hidden="true" className={`relative inline-block h-1.5 shrink-0 overflow-hidden rounded-full bg-oa-bg ${className}`} style={{ width }}>
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.max(8, share * 100)}%`, background: value >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)", opacity: 0.8 }}
      />
    </span>
  );
}
