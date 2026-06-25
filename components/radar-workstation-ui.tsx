"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { StockLogo } from "@/components/stock-logo";
import { isGenericActionLine } from "@/lib/radar-copy";
import type { RadarActionCard, RadarCallKind, RadarPriorityItem } from "@/lib/radar-hub-data";

export function pctClass(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-on-surface-variant";
  if (v > 0.05) return "text-[var(--signal-bullish)]";
  if (v < -0.05) return "text-[var(--signal-bearish)]";
  return "text-on-surface-variant";
}

export function PctChange({
  value,
  className = "",
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return <span className={`font-mono tabular-nums text-on-surface-variant ${className}`}>—</span>;
  }
  const up = value >= 0;
  return (
    <span className={`font-mono font-semibold tabular-nums ${pctClass(value)} ${className}`}>
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`;
}

export function WsRule({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-outline-variant/50 ${className}`} aria-hidden />;
}

export function WsSectionHead({
  children,
  aside,
  className = "",
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
        {children}
      </h2>
      {aside ? <div className="font-mono text-[10px] text-on-surface-variant/80">{aside}</div> : null}
    </div>
  );
}

function callVerb(kind: RadarCallKind): string {
  switch (kind) {
    case "buy_dip":
      return "Buy";
    case "trim":
      return "Trim";
    case "entry":
      return "Entry";
    case "exit":
      return "Exit";
  }
}

export function CompactActionRow({ card }: { card: RadarActionCard }) {
  const subline =
    card.zoneLabel && !isGenericActionLine(card.actionLine) ? card.actionLine : card.zoneLabel ? undefined : card.actionLine;
  const headline = card.zoneLabel || card.actionLine;

  return (
    <Link
      href={`/stock/${card.ticker}`}
      className="group flex items-center gap-2.5 py-2.5 transition-colors hover:bg-surface-container-low/70"
    >
      <StockLogo ticker={card.ticker} logoUrl={card.logoUrl} market={card.market} size={22} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] font-bold text-on-surface">{card.ticker}</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-on-surface-variant/80">
            {callVerb(card.callKind)}
          </span>
          <span className="ml-auto font-mono text-[11px] font-semibold tabular-nums text-on-surface">
            {fmtPrice(card.price)}
          </span>
          <PctChange value={card.changePct} className="w-[52px] text-right text-[11px]" />
        </div>
        <p className="text-[12px] font-medium leading-snug text-on-surface [overflow-wrap:anywhere]">{headline}</p>
        {subline && !isGenericActionLine(subline) ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
            {subline}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function ActionTabList({ cards }: { cards: RadarActionCard[] }) {
  if (cards.length === 0) {
    return <p className="py-3 text-[13px] text-on-surface-variant">Nothing here right now.</p>;
  }
  return (
    <div className="divide-y divide-outline-variant/35">
      {cards.map((card) => (
        <CompactActionRow key={`${card.ticker}-${card.callKind}`} card={card} />
      ))}
    </div>
  );
}

export function SignalLine({ item }: { item: RadarPriorityItem }) {
  return (
    <Link
      href={`/stock/${item.ticker}`}
      className="flex items-start gap-3 py-2.5 transition-colors hover:bg-surface-container-low/80"
    >
      <StockLogo ticker={item.ticker} logoUrl={item.logoUrl} market={item.market} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] font-bold text-on-surface">{item.ticker}</span>
          {item.subline ? (
            <span
              className={`ml-auto font-mono text-[11px] tabular-nums ${
                item.tone === "up"
                  ? "text-[var(--signal-bullish)]"
                  : item.tone === "down"
                    ? "text-[var(--signal-bearish)]"
                    : "text-on-surface-variant"
              }`}
            >
              {item.subline}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
          {item.headline}
        </p>
      </div>
    </Link>
  );
}

export function FactorPillar({
  label,
  score,
  muted = false,
}: {
  label: string;
  score: number | null;
  muted?: boolean;
}) {
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  const tone = muted
    ? "var(--on-surface)"
    : score === null
      ? "var(--on-surface-variant)"
      : score >= 75
        ? "var(--signal-bullish)"
        : score >= 55
          ? "#2563eb"
          : score >= 40
            ? "var(--on-surface)"
            : "var(--signal-bearish)";
  const barOpacity = muted ? (score === null ? 0.15 : 0.22 + (clamped / 100) * 0.5) : 1;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">
          {label}
        </span>
        <span
          className="font-mono text-[13px] font-semibold tabular-nums"
          style={{ color: muted ? "var(--on-surface)" : tone }}
        >
          {score === null ? "—" : Math.round(score)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-outline-variant/35">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(score === null ? 0 : 8, clamped)}%`,
            background: tone,
            opacity: barOpacity,
          }}
        />
      </div>
    </div>
  );
}

export function WeightRangeBar({
  current,
  min,
  max,
}: {
  current: number | null;
  min: number | null;
  max: number | null;
}) {
  if (min == null || max == null || current == null) return null;
  const scale = Math.max(max * 1.2, current, 20);
  const bandStart = (min / scale) * 100;
  const bandWidth = ((max - min) / scale) * 100;
  const dot = Math.max(0, Math.min(100, (current / scale) * 100));

  return (
    <div className="relative mt-2 h-1.5 w-full max-w-[180px] rounded-full bg-outline-variant/35">
      <div
        className="absolute inset-y-0 rounded-full bg-on-surface/18"
        style={{ left: `${bandStart}%`, width: `${Math.max(bandWidth, 2)}%` }}
      />
      <div
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-on-surface"
        style={{ left: `calc(${dot}% - 4px)` }}
      />
    </div>
  );
}

export function ExploreLine({
  ticker,
  name,
  reason,
  market,
}: {
  ticker: string;
  name?: string;
  reason?: string;
  market: "US" | "IN";
}) {
  return (
    <Link
      href={`/stock/${ticker}`}
      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-surface-container-low/80"
    >
      <StockLogo ticker={ticker} market={market} size={20} />
      <span className="w-12 shrink-0 font-mono text-[12px] font-bold text-on-surface">{ticker}</span>
      <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
        {reason || name}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">+ track</span>
    </Link>
  );
}

// Back-compat alias
export const ActionLedgerRow = CompactActionRow;
