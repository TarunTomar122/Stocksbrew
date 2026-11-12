import * as React from "react";

import { PairBar } from "./tone";

/**
 * "This vs the S&P 500 (or a peer)" as two thin labelled bars on one scale (owner VISUALS CHECK: two numbers side by
 * side always get a bar). The thing is copper, what it is held against teal; a loss runs left of one shared zero line.
 * `format` prints each figure; `signed` adds a "+" to gains (returns and changes, not shares or counts).
 * Nothing renders when either figure is missing, so a caller never shows half a comparison.
 */
export function VsBar({
  value,
  versus,
  labels,
  format = (n: number) => `${Math.round(n)}`,
  suffix = "",
  signed = false,
  className = "",
}: {
  value: number | null | undefined;
  versus: number | null | undefined;
  /** What each bar is: the thing, then what it is held against ("You", "S&P 500"). */
  labels: [string, string];
  format?: (n: number) => string;
  /** Printed after each figure ("%"). */
  suffix?: string;
  signed?: boolean;
  className?: string;
}) {
  if (value == null || versus == null || !Number.isFinite(value) || !Number.isFinite(versus)) return null;
  return <PairBar value={value} versus={versus} labels={labels} texts={[vsText(value, format, suffix, signed), vsText(versus, format, suffix, signed)]} className={className} />;
}

/** One figure as VsBar prints it: a real minus sign for a loss, "+" for a gain when `signed`, nothing on zero. */
export function vsText(value: number, format: (n: number) => string, suffix = "", signed = false): string {
  const body = `${format(Math.abs(value))}${suffix}`;
  // A figure that prints as zero carries no sign, so "−0%" never shows.
  if (!/[1-9]/.test(body)) return body;
  if (value < 0) return `−${body}`;
  return signed && value > 0 ? `+${body}` : body;
}
