"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { ExploreLine, PctChange, WsRule, WsSectionHead } from "@/components/radar-workstation-ui";
import type { RadarCallKind, RadarHubModel, RadarTapeRow } from "@/lib/radar-hub-data";

type BookTab = "flagged" | "holdings" | "watching";

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

function isFlagged(row: RadarTapeRow): boolean {
  return Boolean(row.callUrgent || row.hasMaterialChange);
}

function flagSortKey(row: RadarTapeRow): number {
  if (row.flagTier === "now") return 0;
  if (row.flagTier === "move") return 1;
  if (row.flagTier === "level") return 2;
  return 3;
}

function sortBookRows(rows: RadarTapeRow[]): RadarTapeRow[] {
  return [...rows].sort((a, b) => {
    const tierDiff = flagSortKey(a) - flagSortKey(b);
    if (tierDiff !== 0) return tierDiff;
    const moveDiff = Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
    if (moveDiff !== 0) return moveDiff;
    return a.ticker.localeCompare(b.ticker);
  });
}

function rowHeadline(row: RadarTapeRow): string | undefined {
  if (row.callUrgent && row.callKind) return `${callVerb(row.callKind)} · ${row.callHint ?? "in range"}`;
  if (row.callHint) return row.callHint;
  if (row.hasMaterialChange) return "Updated today";
  return row.actionLine || row.name;
}

function BookTableRow({ row, showWeight }: { row: RadarTapeRow; showWeight: boolean }) {
  const headline = rowHeadline(row);
  const urgent = row.flagTier === "now";

  return (
    <Link
      href={`/stock/${row.ticker}`}
      className={`flex items-center gap-3 border-b border-outline-variant/30 py-3 transition-colors last:border-b-0 hover:bg-surface-container-low/60 ${
        urgent ? "border-l-2 border-l-on-surface pl-2" : "px-1"
      }`}
    >
      <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market={row.market} size={22} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[13px] font-bold text-on-surface">{row.ticker}</span>
          {urgent ? (
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface">
              Now
            </span>
          ) : row.flagTier === "move" ? (
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
              Move
            </span>
          ) : null}
        </div>
        {headline ? (
          <p
            className={`mt-0.5 text-[13px] leading-snug [overflow-wrap:anywhere] ${
              urgent ? "font-semibold text-on-surface" : "text-on-surface-variant"
            }`}
          >
            {headline}
          </p>
        ) : null}
      </div>
      {showWeight && typeof row.weightPct === "number" ? (
        <span className="hidden shrink-0 text-right font-mono text-[11px] tabular-nums text-on-surface-variant sm:block">
          {row.weightPct.toFixed(1)}%
        </span>
      ) : null}
      <div className="shrink-0 text-right">
        <div className="font-mono text-[13px] font-semibold tabular-nums text-on-surface">
          {typeof row.price === "number" ? `$${row.price.toFixed(2)}` : "—"}
        </div>
        <PctChange value={row.changePct} className="mt-0.5 text-[11px]" />
      </div>
    </Link>
  );
}

function BookPulseStrip({ stats }: { stats: RadarHubModel["stats"] }) {
  const parts: string[] = [];
  if (stats.flaggedCount > 0) {
    parts.push(`${stats.flaggedCount} in range`);
  }
  if (typeof stats.holdingsDayChange === "number") {
    const v = stats.holdingsDayChange;
    parts.push(`Book ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
  } else if (typeof stats.avgDayChange === "number") {
    const v = stats.avgDayChange;
    parts.push(`Avg ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
  }
  if (stats.upCount > 0 || stats.downCount > 0) {
    parts.push(`${stats.upCount} up · ${stats.downCount} down`);
  }
  if (parts.length === 0) return null;

  return (
    <p className="mb-5 font-mono text-[11px] leading-relaxed text-on-surface-variant">{parts.join(" · ")}</p>
  );
}

export function RadarBookTable({ model }: { model: RadarHubModel }) {
  const { tape, stats, suggestions } = model;
  const flaggedRows = useMemo(
    () => sortBookRows([...tape.holdings, ...tape.watching].filter(isFlagged)),
    [tape.holdings, tape.watching],
  );

  const tabs = useMemo(() => {
    const out: { key: BookTab; label: string; rows: RadarTapeRow[]; showWeight: boolean }[] = [];
    if (flaggedRows.length > 0) {
      out.push({ key: "flagged", label: "Flagged", rows: flaggedRows, showWeight: false });
    }
    if (tape.holdings.length > 0) {
      out.push({
        key: "holdings",
        label: "Holdings",
        rows: sortBookRows(tape.holdings),
        showWeight: true,
      });
    }
    if (tape.watching.length > 0) {
      out.push({
        key: "watching",
        label: "Watching",
        rows: sortBookRows(tape.watching),
        showWeight: false,
      });
    }
    return out;
  }, [flaggedRows, tape.holdings, tape.watching]);

  const [tab, setTab] = useState<BookTab>(() =>
    flaggedRows.length > 0 ? "flagged" : tape.holdings.length > 0 ? "holdings" : "watching",
  );
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  if (!current) return null;

  return (
    <div>
      <BookPulseStrip stats={stats} />
      <WsSectionHead aside={`${stats.totalCount} names`}>Book</WsSectionHead>

      {tabs.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-outline-variant/50">
          {tabs.map((t) => {
            const on = t.key === current.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="-mb-px border-b-2 pb-2 font-mono text-[11px] font-semibold transition-colors"
                style={{
                  borderColor: on ? "var(--on-surface)" : "transparent",
                  color: on ? "var(--on-surface)" : "var(--on-surface-variant)",
                }}
              >
                {t.label}
                <span className="ml-1 opacity-45">{t.rows.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-1">
        {current.rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-on-surface-variant">No stocks here yet.</p>
        ) : (
          current.rows.map((row) => (
            <BookTableRow key={row.instrumentId} row={row} showWeight={current.showWeight} />
          ))
        )}
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-8">
          <WsRule className="mb-4" />
          <WsSectionHead>Fill gaps</WsSectionHead>
          <div className="mt-2 divide-y divide-outline-variant/35">
            {suggestions.map((s) => (
              <ExploreLine
                key={s.ticker}
                ticker={s.ticker}
                name={s.name}
                reason={s.reason}
                market={s.market}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
