import type { ReactNode } from "react";
import type { StockSignal, StockSignals } from "@/lib/stock-signals";
import { ToneGlyph } from "@/components/oa/kit/tone";

import { TONE_COLOR } from "./primitives";

/**
 * How the stock page shows its good and watch signals (lib/stock-signals.ts): the judged figure in its tone with a
 * small ▲ (good) or ▼ (watch), and "Good sign" or "Watch out" in its accessible name. Never a chip on every row
 * (owner rule 1), never a sentence. A neutral figure is plain; a signal without its inputs shows nothing.
 *
 * Watch is red, not amber: the brew kit has no amber (app/globals.css "collapsed to neutral").
 */

export const VERDICT_COLOR = { good: TONE_COLOR.up, watch: TONE_COLOR.down } as const;
const VERDICT_WORDS = { good: "Good sign", watch: "Watch out" } as const;

/** One tab's or one page's signals, by id; tabs read their own through this. */
export type SignalsProp = Pick<StockSignals, "byId" | "tabs"> | null;

/** The judged figure: tone colour and mark for good or watch, plain for neutral, nothing without inputs. */
export function SignalFigure({
  signal,
  children,
  className = "",
  showPeriod = false,
}: {
  signal: StockSignal | null | undefined;
  /** Shown instead of the signal's own display ("+14.1%"), e.g. a figure the panel already formats. */
  children?: ReactNode;
  className?: string;
  /** Say the period after the figure, small: "+14.1% FY2025 vs FY2024". */
  showPeriod?: boolean;
}) {
  if (!signal || !signal.eligible || (!signal.display && children == null)) return null;
  const tone = signal.verdict === "neutral" ? null : signal.verdict;
  const title = [signal.metric, signal.period, ...signal.evidence].filter(Boolean).join(" · ");
  return (
    <span
      className={`oa-mono inline-flex items-center gap-1 whitespace-nowrap font-medium ${tone ? "" : "text-oa-fg"} ${className}`}
      style={tone ? { color: VERDICT_COLOR[tone] } : undefined}
      title={title}
    >
      {tone ? <ToneGlyph tone={tone === "good" ? "up" : "down"} decorative className="size-2" /> : null}
      {children ?? signal.display}
      {tone ? <span className="sr-only">, {VERDICT_WORDS[tone]}</span> : null}
      {showPeriod && signal.period ? <span className="font-sans text-[12px] font-normal text-oa-muted-fg">{signal.period}</span> : null}
    </span>
  );
}

/**
 * The tally by the call: "8 good · Revenue growth", "3 to watch · High P/E", one chip each. Counts as observations
 * only: related measures (the 50- and 200-day averages) are not independent votes, so the strip never sets them
 * against the call, which is our own (council, Nov 12). Not a read block (owner rule 7): one row of chips, no sentence.
 */
export function SignalStrip({ tally }: { tally: NonNullable<StockSignals["tally"]> }) {
  const chip = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-oa-border bg-oa-card px-2.5 text-[13px] leading-5 text-oa-fg";
  return (
    <ul role="list" aria-label="Signals across the report" className="flex flex-wrap items-center gap-1.5">
      {tally.good ? (
        <li className={chip}>
          <ToneGlyph tone="up" decorative className="size-2" />
          <span className="oa-mono font-semibold" style={{ color: VERDICT_COLOR.good }}>
            {tally.good} good
          </span>
          {tally.topGood ? <span className="text-oa-muted-fg">· {tally.topGood.name}</span> : null}
        </li>
      ) : null}
      {tally.watch ? (
        <li className={chip}>
          <ToneGlyph tone="down" decorative className="size-2" />
          <span className="oa-mono font-semibold" style={{ color: VERDICT_COLOR.watch }}>
            {tally.watch} to watch
          </span>
          {tally.topWatch ? <span className="text-oa-muted-fg">· {tally.topWatch.name}</span> : null}
        </li>
      ) : null}
    </ul>
  );
}
