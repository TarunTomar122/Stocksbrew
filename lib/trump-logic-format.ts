/** Client-safe display helpers for Trump Logic (no firebase-admin). */

export function formatSincePct(
  pct: number | null | undefined,
): { text: string; positive: boolean } | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const positive = pct >= 0;
  return {
    text: `${positive ? "+" : ""}${pct.toFixed(1)}% since`,
    positive,
  };
}
