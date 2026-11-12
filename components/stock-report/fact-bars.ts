/**
 * Signed bars from one zero line on one shared scale (council, Nov 12: −13% and −0.9% must point left, +5% right).
 * Positions are percents of the track: the zero line sits at `zero`, and each bar runs from the zero line to its
 * value, so a negative bar ends left of it and a positive one right. With no negative values the zero line is the
 * left edge; with no positive ones, the right edge.
 */
export type BarGeometry = { zero: number; bars: Array<{ left: number; width: number; negative: boolean; tiny: boolean }> };

/**
 * Under this width (percent of the track) a bar is too thin to see. It keeps its exact width (council, Nov 12: no
 * padding, so a 0.1 beside a 100 is never drawn 15 times too long) and is flagged `tiny`, so the card marks its end with
 * a dot instead.
 */
const TINY_WIDTH = 1.5;

export function barGeometry(values: ReadonlyArray<number>): BarGeometry {
  const finite = values.map((value) => (Number.isFinite(value) ? value : 0));
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const span = high - low;
  if (span <= 0) return { zero: 0, bars: finite.map(() => ({ left: 0, width: 0, negative: false, tiny: false })) };
  // Not -0 when nothing is negative.
  const zero = low < 0 ? (-low / span) * 100 : 0;
  return {
    zero,
    bars: finite.map((value) => {
      if (value === 0) return { left: zero, width: 0, negative: false, tiny: false };
      const width = (Math.abs(value) / span) * 100;
      const tiny = width < TINY_WIDTH;
      return value < 0
        ? { left: Math.max(0, zero - width), width: Math.min(width, zero), negative: true, tiny }
        : { left: zero, width: Math.min(width, 100 - zero), negative: false, tiny };
    }),
  };
}
