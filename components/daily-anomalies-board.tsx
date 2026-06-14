"use client";

import Link from "next/link";
import { useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import {
  anomalyDetail,
  anomalyHeadline,
  fmtMovePct,
  fmtMovePrice,
  verdictStyle,
  type MoveSide,
} from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";

function itemKey(item: AnomalyItem): string {
  return item.instrument_id || item.ticker;
}

function MoveRowCompact({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const headline = anomalyHeadline(item);

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group grid min-h-[52px] grid-cols-[28px_3rem_4.25rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-3.5 transition-colors hover:bg-[#f9fafb] sm:min-h-[56px] sm:grid-cols-[28px_3.25rem_4.5rem_minmax(0,1fr)] sm:gap-x-4 sm:px-5 sm:py-4"
    >
      <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={28} className="shrink-0" />
      <span className="truncate text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
        {item.ticker}
      </span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: changeColor }}>
        {isUp ? "▲" : "▼"} {fmtMovePct(item.day_change_pct)}
      </span>
      <span className="min-w-0 truncate text-[13px] leading-normal text-[#6b7280]">{headline}</span>
    </Link>
  );
}

function LockedMoveRow({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const color = isUp ? "#10b981" : "#ef4444";
  return (
    <div className="grid min-h-[52px] grid-cols-[28px_3rem_4.25rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-3.5 sm:min-h-[56px] sm:grid-cols-[28px_3.25rem_4.5rem_minmax(0,1fr)] sm:gap-x-4 sm:px-5 sm:py-4">
      <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={28} className="shrink-0 opacity-70" />
      <span className="truncate text-[14px] font-semibold text-[#111111]">{item.ticker}</span>
      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
        {isUp ? "▲" : "▼"} {fmtMovePct(item.day_change_pct)}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] font-medium text-[#6b7280]">
        <span className="material-symbols-outlined shrink-0 text-[#9ca3af]" style={{ fontSize: 15, fontVariationSettings: "'wght' 500" }}>
          lock
        </span>
        Unlock Pro to see why it moved.
      </span>
    </div>
  );
}

function MoveCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const headline = anomalyHeadline(item);
  const detail = anomalyDetail(item);
  const verdict = (item.overall_verdict || "").trim();
  const verdictColors = verdict ? verdictStyle(verdict) : null;
  const catalyst = (item.catalyst || "").trim();
  const showCatalyst = catalyst && catalyst.length <= 48;

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex h-full flex-col gap-3.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-colors hover:border-[#d1d5db] hover:bg-[#fafafa] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#111111] group-hover:text-[#0052ff]">{item.ticker}</p>
            <p className="line-clamp-1 text-[12px] leading-snug text-[#9ca3af]">{item.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold tabular-nums" style={{ color: changeColor }}>
            {isUp ? "▲" : "▼"} {fmtMovePct(item.day_change_pct)}
          </span>
          {verdictColors ? (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ color: verdictColors.text, background: verdictColors.bg }}
            >
              {verdict}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] tabular-nums">
        <span className="font-semibold text-[#111111]">${fmtMovePrice(item.price)}</span>
        {item.day_change_abs != null && Number.isFinite(item.day_change_abs) ? (
          <span className="font-medium" style={{ color: changeColor }}>
            {isUp ? "+" : ""}
            {item.day_change_abs.toFixed(2)} today
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <p className="text-[15px] font-medium leading-snug text-[#111111]">{headline}</p>
        {detail ? (
          <p className="text-[13px] leading-relaxed text-[#374151]">{detail}</p>
        ) : null}
      </div>

      {showCatalyst ? (
        <div className="mt-auto pt-1">
          <span className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#6b7280]">
            {catalyst}
          </span>
        </div>
      ) : null}
    </Link>
  );
}

function LockedMoveCard({ item }: { item: AnomalyItem }) {
  const isUp = item.direction === "up";
  const color = isUp ? "#10b981" : "#ef4444";
  return (
    <Link
      href="/subscribe"
      className="group flex h-full min-h-[260px] flex-col gap-4 rounded-2xl border border-dashed border-[#d1d5db] bg-[#fafafa] p-5 transition-colors hover:border-[#111111] hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} className="shrink-0 opacity-75" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#111111]">{item.ticker}</p>
            <p className="line-clamp-1 text-[12px] leading-snug text-[#9ca3af]">{item.name}</p>
          </div>
        </div>
        <span className="text-[14px] font-bold" style={{ color }}>
          {isUp ? "▲" : "▼"} {fmtMovePct(item.day_change_pct)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] tabular-nums">
        <span className="font-semibold text-[#111111]">${fmtMovePrice(item.price)}</span>
        {item.day_change_abs != null && Number.isFinite(item.day_change_abs) ? (
          <span className="font-medium" style={{ color }}>
            {isUp ? "+" : ""}
            {item.day_change_abs.toFixed(2)} today
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#111111]">
          <span className="material-symbols-outlined text-[#9ca3af]" style={{ fontSize: 17, fontVariationSettings: "'wght' 500" }}>
            lock
          </span>
          Why it moved is locked.
        </p>
        <p className="text-[13px] leading-relaxed text-[#6b7280]">
          Pro shows the move read and what the setup means.
        </p>
        <span className="mt-1 inline-flex w-fit rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white group-hover:bg-[#0052ff]">
          Unlock Pro
        </span>
      </div>
    </Link>
  );
}

function SideToggleIcon({ side, active }: { side: MoveSide; active: boolean }) {
  const color = active ? "#ffffff" : side === "up" ? "#10b981" : "#ef4444";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      {side === "up" ? (
        <path d="M6 2L10 8H2L6 2Z" fill={color} />
      ) : (
        <path d="M6 10L2 4H10L6 10Z" fill={color} />
      )}
    </svg>
  );
}

function SideToggle({
  active,
  onSelect,
  className = "",
}: {
  active: MoveSide;
  onSelect: (side: MoveSide) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-2 ${className}`}>
      {(
        [
          { side: "up" as const, label: "Gainers" },
          { side: "down" as const, label: "Losers" },
        ] as const
      ).map(({ side, label }) => {
        const isActive = active === side;
        return (
          <button
            key={side}
            type="button"
            onClick={() => onSelect(side)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors sm:flex-none sm:px-6 ${
              isActive
                ? "bg-[#111111] text-white"
                : "border border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]"
            }`}
          >
            <SideToggleIcon side={side} active={isActive} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CardsSection({ side, items, isSubscribed }: { side: MoveSide; items: AnomalyItem[]; isSubscribed: boolean }) {
  const isUp = side === "up";

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#e5e7eb] px-4 py-8 text-center text-[13px] text-[#9ca3af]">
        No big {isUp ? "gainers" : "losers"} right now.
      </p>
    );
  }
  const visible = isSubscribed ? items : items.slice(0, 2);
  const lockedCount = isSubscribed ? 0 : Math.max(0, items.length - visible.length);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) => (
        <MoveCard key={itemKey(item)} item={item} />
      ))}
      {items.slice(visible.length).map((item) => (
        <LockedMoveCard key={`locked-${itemKey(item)}`} item={item} />
      ))}
    </div>
  );
}

const MOVES_TABLE_SCROLL_CLASS = "lg:max-h-[min(32rem,55vh)] lg:overflow-y-auto";

function MovesTable({
  side,
  items,
  isSubscribed,
  scrollable = false,
}: {
  side: MoveSide;
  items: AnomalyItem[];
  isSubscribed: boolean;
  scrollable?: boolean;
}) {
  const isUp = side === "up";

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#e5e7eb] px-4 py-8 text-center text-[13px] text-[#9ca3af]">
        No big {isUp ? "gainers" : "losers"} right now.
      </p>
    );
  }

  const visible = isSubscribed ? items : items.slice(0, 2);
  const lockedCount = isSubscribed ? 0 : Math.max(0, items.length - visible.length);
  const rows = [
    ...visible.map((item) => <MoveRowCompact key={itemKey(item)} item={item} />),
    ...items.slice(visible.length).map((item) => (
      <LockedMoveRow key={`locked-${itemKey(item)}`} item={item} />
    )),
  ];

  if (scrollable) {
    return (
      <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        <div className={`divide-y divide-[#f3f4f6] ${MOVES_TABLE_SCROLL_CLASS}`}>{rows}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white divide-y divide-[#f3f4f6]">
      {rows}
    </div>
  );
}

type BoardProps = {
  ups: AnomalyItem[];
  downs: AnomalyItem[];
  layout?: "table" | "cards";
  showSeeAll?: boolean;
  scrollable?: boolean;
  isSubscribed?: boolean;
};

export function AnomalyMovesBoard({
  ups,
  downs,
  layout = "table",
  showSeeAll = false,
  scrollable = false,
  isSubscribed = false,
}: BoardProps) {
  const [activeSide, setActiveSide] = useState<MoveSide>("up");
  const activeItems = activeSide === "up" ? ups : downs;

  if (layout === "cards") {
    return (
      <div className="flex flex-col gap-5">
        <SideToggle active={activeSide} onSelect={setActiveSide} className="max-w-xs sm:max-w-none" />
        <CardsSection side={activeSide} items={activeItems} isSubscribed={isSubscribed} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SideToggle active={activeSide} onSelect={setActiveSide} className="max-w-xs sm:max-w-none" />
        {showSeeAll && activeItems.length > 0 ? (
          <Link
            href="/anomalies"
            className="shrink-0 text-[12px] font-semibold text-[#6b7280] hover:text-[#0052ff] transition-colors"
          >
            Full read →
          </Link>
        ) : null}
      </div>
      <MovesTable side={activeSide} items={activeItems} isSubscribed={isSubscribed} scrollable={scrollable} />
    </div>
  );
}
