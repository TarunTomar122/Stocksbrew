/**
 * Shared primitives for the dark tickertape-inspired UI.
 * Keep purely visual — no data-fetching, no business logic.
 */

import Link from "next/link";
import { ReactNode } from "react";

/* ─── Colors ─── */
export const V2_COLORS = {
  bg: "#0A0E16",
  surface: "#141A26",
  surfaceHover: "#1A2130",
  border: "#252E42",
  borderSoft: "#1F2738",
  text: "#F5F6F8",
  textMuted: "#8C94A8",
  textSubtle: "#555E75",
  green: "#22C55E",
  greenSoft: "rgba(34, 197, 94, 0.12)",
  red: "#EF4444",
  redSoft: "rgba(239, 68, 68, 0.12)",
  gold: "#D4AF37",
} as const;

/* ─── Formatting helpers ─── */
export function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatPctCompact(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function pctClass(pct: number): string {
  if (pct > 0) return "text-[#22C55E]";
  if (pct < 0) return "text-[#EF4444]";
  return "text-[#8C94A8]";
}

export function sparkColor(pct: number): "green" | "red" | "neutral" {
  if (pct > 0) return "green";
  if (pct < 0) return "red";
  return "neutral";
}

export function formatCurrency(value: number, currency: string): string {
  const symbol = currency === "INR" ? "\u20B9" : currency === "USD" ? "$" : "";
  return `${symbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumberCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}

/* ─── DashboardCard: primary surface for the grid ─── */
type DashboardCardProps = {
  title: string;
  eyebrow?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: "normal" | "compact" | "none";
};

export function DashboardCard({
  title,
  eyebrow,
  seeAllHref,
  seeAllLabel = "See all",
  rightSlot,
  children,
  className = "",
  padding = "normal",
}: DashboardCardProps) {
  const padClass =
    padding === "none"
      ? ""
      : padding === "compact"
        ? "px-4 py-4"
        : "px-5 py-5";

  return (
    <section
      className={`overflow-hidden rounded-[10px] border border-[#252E42] bg-[#141A26] ${className}`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-[#1F2738] px-5 py-3">
        <div className="flex flex-col leading-tight">
          {eyebrow && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
              {eyebrow}
            </span>
          )}
          <h2 className="text-[14px] font-semibold text-[#F5F6F8]">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-[11px] font-medium text-[#8C94A8] transition-colors hover:text-[#F5F6F8]"
            >
              {seeAllLabel} &rarr;
            </Link>
          )}
        </div>
      </header>
      <div className={padClass}>{children}</div>
    </section>
  );
}

/* ─── SectionTitle: full-width label above card rows ─── */
export function SectionTitle({
  children,
  kicker,
}: {
  children: ReactNode;
  kicker?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#F5F6F8]">
        {children}
      </h3>
      {kicker && <span className="text-[11px] text-[#8C94A8]">{kicker}</span>}
    </div>
  );
}

/* ─── Tone chip (small colored tag) ─── */
export function ToneChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "red" | "gold" | "neutral";
}) {
  const styles =
    tone === "green"
      ? "bg-[rgba(34,197,94,0.12)] text-[#22C55E]"
      : tone === "red"
        ? "bg-[rgba(239,68,68,0.12)] text-[#EF4444]"
        : tone === "gold"
          ? "bg-[rgba(212,175,55,0.14)] text-[#D4AF37]"
          : "bg-[#1A2130] text-[#8C94A8]";
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles}`}
    >
      {children}
    </span>
  );
}
