"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { PctChange, WsSectionHead } from "@/components/radar-workstation-ui";
import type { RadarTapeRow } from "@/lib/radar-hub-data";

function BookRow({ row, showWeight }: { row: RadarTapeRow; showWeight: boolean }) {
  return (
    <Link
      href={`/stock/${row.ticker}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 transition-colors hover:bg-surface-container-low/70 sm:grid-cols-[minmax(0,1fr)_44px_auto]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market={row.market} size={22} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] font-bold text-on-surface">{row.ticker}</span>
            {row.callUrgent ? (
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface" title="In range now" />
            ) : row.hasMaterialChange ? (
              <span className="h-1 w-1 rounded-full bg-on-surface-variant" title="Updated today" />
            ) : null}
          </div>
          {row.callHint ? (
            <p
              className={`text-[11px] leading-snug [overflow-wrap:anywhere] ${
                row.callUrgent ? "font-medium text-on-surface" : "text-on-surface-variant"
              }`}
            >
              {row.callHint}
            </p>
          ) : row.name ? (
            <p className="text-[11px] leading-snug text-on-surface-variant/90 [overflow-wrap:anywhere]">{row.name}</p>
          ) : null}
        </div>
      </div>
      {showWeight && typeof row.weightPct === "number" ? (
        <span className="hidden text-right font-mono text-[11px] tabular-nums text-on-surface-variant sm:block">
          {row.weightPct.toFixed(1)}
        </span>
      ) : (
        <span className="hidden sm:block" />
      )}
      <div className="text-right">
        <div className="font-mono text-[12px] font-semibold tabular-nums text-on-surface">
          {typeof row.price === "number" ? `$${row.price.toFixed(2)}` : "—"}
        </div>
        <div className="mt-0.5">
          <PctChange value={row.changePct} className="text-[11px]" />
        </div>
      </div>
    </Link>
  );
}

export function RadarWatchlistPanel({
  holdings,
  watching,
  embedded = false,
}: {
  holdings: RadarTapeRow[];
  watching: RadarTapeRow[];
  embedded?: boolean;
}) {
  const tabs = useMemo(() => {
    const out: { key: "holdings" | "watching"; label: string; rows: RadarTapeRow[] }[] = [];
    if (holdings.length > 0) out.push({ key: "holdings", label: "Holdings", rows: holdings });
    if (watching.length > 0) out.push({ key: "watching", label: "Watching", rows: watching });
    return out;
  }, [holdings, watching]);

  const [tab, setTab] = useState<"holdings" | "watching">(
    holdings.length > 0 ? "holdings" : "watching",
  );
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  const rows = useMemo(() => {
    if (!current) return [];
    return [...current.rows].sort((a, b) => {
      const au = a.callUrgent ? 1 : 0;
      const bu = b.callUrgent ? 1 : 0;
      if (bu !== au) return bu - au;
      const ah = a.callHint ? 1 : 0;
      const bh = b.callHint ? 1 : 0;
      return bh - ah;
    });
  }, [current]);

  if (!current) return null;

  return (
    <div
      className={`flex h-full flex-col ${embedded ? "" : "lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)]"}`}
    >
      <div className="px-4 pt-4 sm:px-5">
        <WsSectionHead aside={`${current.rows.length} names`}>Book</WsSectionHead>
        {tabs.length > 1 ? (
          <div className="mt-3 flex gap-4 border-b border-outline-variant/50">
            {tabs.map((t) => {
              const on = t.key === current.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className="-mb-px border-b-2 pb-2 font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? "var(--on-surface)" : "transparent",
                    color: on ? "var(--on-surface)" : "var(--on-surface-variant)",
                  }}
                >
                  {t.label}
                  <span className="ml-1 opacity-50">{t.rows.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {rows.length === 0 ? (
          <p className="px-1 py-10 text-center text-[13px] text-on-surface-variant">No stocks here yet.</p>
        ) : (
          rows.map((row) => (
            <BookRow
              key={row.instrumentId}
              row={row}
              showWeight={current.key === "holdings" && row.weightPct != null}
            />
          ))
        )}
      </div>
    </div>
  );
}
