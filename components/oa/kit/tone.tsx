import * as React from "react";

import { barGeometry, type BarGeometry } from "@/components/stock-report/fact-bars";

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
      className={className ? `inline-block shrink-0 ${className}` : "inline-block shrink-0"}
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
  // .oa-markslot in app/globals.css: a table column prints one on every row.
  return <span className={className ? `oa-markslot ${className}` : "oa-markslot"}>{tone === "up" || tone === "down" ? <ToneGlyph tone={tone} /> : null}</span>;
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
  if (value == null || !Number.isFinite(value)) return null;
  // A flat move draws an empty track: the 8% minimum is for a small move, never for none (also when every move is 0).
  if (value === 0) return <span aria-hidden="true" className={`relative inline-block h-1.5 shrink-0 rounded-full bg-oa-bg ${className}`} style={{ width }} />;
  if (!(max > 0)) return null;
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

/** The chart series colours (components/backtest/format.ts SERIES_VARS): copper for the thing, teal for what it is held against. */
const PAIR_VARS = "[--series-a:#b85a1e] [--series-b:#0e8199] dark:[--series-a:#cf7a35] dark:[--series-b:#2f9db5]";

const PAIR_FILL = ["bg-[var(--series-a)]", "bg-[var(--series-b)]"] as const;

/** One signed bar on its track: a loss runs left of zero, a bar too thin to see is marked by a dot at its end. */
function PairTrack({ geometry, index }: { geometry: BarGeometry; index: 0 | 1 }) {
  const bar = geometry.bars[index]!;
  const fill = PAIR_FILL[index];
  return (
    <span className="flex h-4 items-center">
      <span className="relative block h-2 w-full rounded-full bg-oa-bg">
        {bar.width > 0 ? (
          <span className={`absolute inset-y-0 ${bar.negative ? "rounded-l-full" : "rounded-r-full"} ${fill}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
        ) : null}
        {bar.tiny ? (
          <span
            className={`absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fill}`}
            style={{ left: `${bar.negative ? bar.left : bar.left + bar.width}%` }}
          />
        ) : null}
      </span>
    </span>
  );
}

/**
 * Two figures compared on one scale (owner VISUALS CHECK; council, Nov 12): each line named and given its figure
 * ("You +1.1%", "S&P 500 +3.3%"), one zero line drawn through both, a loss running left of it. The thing is copper,
 * what it is held against teal, the same colours as the charts. Nothing when either figure is missing.
 */
export function PairBar({
  value,
  versus,
  labels,
  texts,
  className = "",
}: {
  value: number | null | undefined;
  versus: number | null | undefined;
  /** What each line is: the thing, then what it is held against. */
  labels: [string, string];
  /** Each line's figure as printed. */
  texts: [string, string];
  className?: string;
}) {
  if (value == null || versus == null || !Number.isFinite(value) || !Number.isFinite(versus)) return null;
  // Both at zero still shows both names and figures, on empty tracks at the zero line (council, Nov 12).
  const geometry = barGeometry([value, versus]);
  return (
    <span
      className={`${PAIR_VARS} grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-start gap-x-2 ${className}`}
      role="img"
      aria-label={`${labels[0]} ${texts[0]}, ${labels[1]} ${texts[1]}`}
    >
      <span aria-hidden="true" className="flex flex-col gap-1 text-[12px] leading-4 text-oa-muted-fg">
        <span className="whitespace-nowrap">{labels[0]}</span>
        <span className="whitespace-nowrap">{labels[1]}</span>
      </span>
      <span aria-hidden="true" className="relative flex flex-col gap-1">
        <PairTrack geometry={geometry} index={0} />
        <PairTrack geometry={geometry} index={1} />
        {/* One zero line through both bars, always drawn: at the left edge when both are gains, the right when both
            are losses, between them when one is each. */}
        <span className="absolute -bottom-0.5 -top-0.5 w-px -translate-x-1/2 bg-oa-fg/60" style={{ left: `${geometry.zero}%` }} />
      </span>
      <span aria-hidden="true" className="oa-mono flex flex-col gap-1 text-right text-[12px] leading-4 tabular-nums text-oa-fg">
        <span className="whitespace-nowrap">{texts[0]}</span>
        <span className="whitespace-nowrap">{texts[1]}</span>
      </span>
    </span>
  );
}
