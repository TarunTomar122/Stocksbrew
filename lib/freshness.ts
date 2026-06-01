export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";

export type FreshnessInfo = {
  status: FreshnessStatus;
  ageHours: number | null;
  relative: string;
  label: string;
  toneClass: string;
};

// Market-derived feeds do not refresh on weekends. A Friday close document
// should be "aging" on Sunday, not "stale"; it only becomes stale after the
// next trading-day refresh window is missed.
export const MARKET_FEED_FRESHNESS = { agingHours: 36, staleHours: 84 } as const;

export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function freshnessInfo(
  iso?: string | null,
  options: { agingHours: number; staleHours: number } = { agingHours: 24, staleHours: 72 },
): FreshnessInfo {
  if (!iso) {
    return {
      status: "unknown",
      ageHours: null,
      relative: "",
      label: "Unknown freshness",
      toneClass: "text-[#9ca3af]",
    };
  }
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) {
    return {
      status: "unknown",
      ageHours: null,
      relative: "",
      label: "Unknown freshness",
      toneClass: "text-[#9ca3af]",
    };
  }

  const ageHours = Math.max(0, (Date.now() - t) / 3_600_000);
  if (ageHours >= options.staleHours) {
    return {
      status: "stale",
      ageHours,
      relative: relativeTime(iso),
      label: "Stale",
      toneClass: "text-[#ef4444]",
    };
  }
  if (ageHours >= options.agingHours) {
    return {
      status: "aging",
      ageHours,
      relative: relativeTime(iso),
      label: "Aging",
      toneClass: "text-[#b45309]",
    };
  }
  return {
    status: "fresh",
    ageHours,
    relative: relativeTime(iso),
    label: "Fresh",
    toneClass: "text-[#10b981]",
  };
}

export function freshnessText(
  iso?: string | null,
  options: { agingHours: number; staleHours: number } = { agingHours: 24, staleHours: 72 },
): string {
  const info = freshnessInfo(iso, options);
  return info.relative ? `${info.label} · ${info.relative}` : info.label;
}
