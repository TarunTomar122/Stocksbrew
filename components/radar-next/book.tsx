"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { BookFlag, BookFlagTone, BookRow } from "@/components/radar-next/types";

type SortKey = "name" | "last" | "chg" | "score";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir } | null;

function defaultDirFor(key: SortKey): SortDir {
  return key === "name" ? "asc" : "desc";
}

function compareNullable(a: number | null, b: number | null, mul: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return mul * (a - b);
}

function sortBookRows(rows: BookRow[], sort: SortState): BookRow[] {
  if (!sort) {
    return [...rows].sort((left, right) => Number(right.needsAttention) - Number(left.needsAttention));
  }
  const copy = [...rows];
  const mul = sort.dir === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    if (sort.key === "name") return mul * a.ticker.localeCompare(b.ticker);
    if (sort.key === "last") return compareNullable(a.price, b.price, mul);
    if (sort.key === "score") return compareNullable(a.score, b.score, mul);
    return compareNullable(a.dayChangePct, b.dayChangePct, mul);
  });
  return copy;
}

function flagStyle(tone: BookFlagTone): { color: string; background: string } {
  const color =
    tone === "pos"
      ? "var(--rn-bull)"
      : tone === "neg"
        ? "var(--rn-bear)"
        : tone === "warn"
          ? "var(--signal-neutral)"
          : tone === "earnings"
            ? "var(--on-surface-variant)"
            : "var(--primary)";
  return { color, background: `color-mix(in srgb, ${color} 12%, transparent)` };
}

function FlagChip({ flag }: { flag: BookFlag }) {
  const style = flagStyle(flag.tone);
  return (
    <span
      title={flag.title}
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none"
      style={style}
    >
      {flag.label}
    </span>
  );
}

function changeColor(value: number | null): string {
  if (value === null) return "var(--rn-muted)";
  return value >= 0 ? "var(--rn-bull)" : "var(--rn-bear)";
}

function stanceColor(stance: string | null): string {
  const normalized = (stance ?? "").toLowerCase();
  if (["accumulate", "buy", "add"].includes(normalized)) return "var(--rn-bull)";
  if (["trim", "sell", "reduce", "exit", "avoid"].includes(normalized)) return "var(--rn-bear)";
  return "var(--rn-muted)";
}

function scoreColor(score: number | null): string {
  if (score === null) return "var(--rn-muted)";
  if (score >= 70) return "var(--rn-bull)";
  if (score >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function attentionAccent(direction: BookRow["attentionDirection"]): string {
  if (direction === "bullish") return "var(--rn-bull)";
  if (direction === "bearish") return "var(--rn-bear)";
  return "var(--signal-neutral)";
}

function priceText(row: BookRow): string {
  if (row.price === null) return "–";
  return `${row.currency}${row.price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function changeText(value: number | null): string {
  if (value === null) return "–";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function SortHeader({
  label,
  sortKey,
  align = "left",
  sort,
  onPick,
}: {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right";
  sort: SortState;
  onPick: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const direction = active ? sort.dir : defaultDirFor(sortKey);
  return (
    <th
      className={`px-3 py-3 font-normal ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onPick(sortKey)}
        className={`inline-flex items-center gap-1 text-[14px] font-medium text-[var(--rn-muted)] ${align === "right" ? "justify-end" : ""} ${
          active ? "text-[var(--rn-ink)]" : "hover:text-[var(--rn-ink)]"
        }`}
      >
        {label}
        <span className="text-[9px]" aria-hidden>
          {direction === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

function MobileRow({ row }: { row: BookRow }) {
  const accent = row.needsAttention ? attentionAccent(row.attentionDirection) : null;
  return (
    <Link
      href={row.href}
      className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-3 py-4 no-underline"
      style={accent ? ({ backgroundColor: `color-mix(in srgb, ${accent} 9%, var(--rn-card))` } as CSSProperties) : undefined}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={row.ticker} market={row.market} size={30} className="shrink-0" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15.5px] font-bold text-[var(--rn-ink)]">{row.ticker}</span>
            <span className="font-mono text-[11px] font-semibold uppercase" style={{ color: stanceColor(row.stance) }}>
              {row.stance ?? "watch"}
            </span>
            {row.flags.map((flag, index) => (
              <FlagChip key={`${flag.label}-${index}`} flag={flag} />
            ))}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-[var(--rn-muted)]">{row.name}</span>
        </span>
      </span>

      <span className="text-right">
        <span className="block font-mono text-[14.5px] font-semibold tabular-nums text-[var(--rn-ink)]">
          {priceText(row)}
        </span>
        <span className="block font-mono text-[12.5px] font-semibold tabular-nums" style={{ color: changeColor(row.dayChangePct) }}>
          {changeText(row.dayChangePct)}
        </span>
      </span>

    </Link>
  );
}

function DesktopTable({
  rows,
  sort,
  onPickSort,
}: {
  rows: BookRow[];
  sort: SortState;
  onPickSort: (key: SortKey) => void;
}) {
  return (
    <div className="hidden max-h-[39rem] overflow-auto sm:block">
      <table className="w-full min-w-[760px] border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--rn-card)]">
          <tr className="border-b border-[var(--rn-line)]">
            <SortHeader label="Stock" sortKey="name" sort={sort} onPick={onPickSort} />
            <SortHeader label="Last" sortKey="last" align="right" sort={sort} onPick={onPickSort} />
            <SortHeader label="Day" sortKey="chg" align="right" sort={sort} onPick={onPickSort} />
            <th className="px-3 py-3 text-left font-normal"><span className="text-[14px] font-medium text-[var(--rn-muted)]">Signals</span></th>
            <SortHeader label="Score" sortKey="score" align="right" sort={sort} onPick={onPickSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rn-line)]">
          {rows.map((row) => {
            const accent = row.needsAttention ? attentionAccent(row.attentionDirection) : null;
            return (
              <tr
                key={`${row.market}-${row.ticker}`}
                className="group transition-colors hover:bg-[var(--rn-card-2)]"
                style={accent ? ({ backgroundColor: `color-mix(in srgb, ${accent} 9%, var(--rn-card))` } as CSSProperties) : undefined}
              >
                <td className="px-3 py-3.5">
                  <Link href={row.href} className="flex min-w-0 items-center gap-2.5 no-underline">
                    <StockLogo ticker={row.ticker} market={row.market} size={28} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[15px] font-bold text-[var(--rn-ink)] group-hover:underline">{row.ticker}</span>
                        {row.needsAttention && row.stance && (
                          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide" style={{ color: stanceColor(row.stance) }}>
                            {row.stance}
                          </span>
                        )}
                      </span>
                      <span className="block max-w-[12rem] truncate text-[12px] text-[var(--rn-muted)]">{row.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-[14px] font-semibold tabular-nums text-[var(--rn-ink)]">
                  {priceText(row)}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-[13px] font-semibold tabular-nums" style={{ color: changeColor(row.dayChangePct) }}>
                  {changeText(row.dayChangePct)}
                </td>
                <td className="px-3 py-3.5">
                  <span className="flex max-w-[14rem] flex-wrap gap-1">
                    {row.flags.length > 0 ? row.flags.map((flag, index) => <FlagChip key={`${flag.label}-${index}`} flag={flag} />) : <span className="text-[10.5px] text-[var(--rn-muted)]">On plan</span>}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-[13px] font-bold tabular-nums" style={{ color: scoreColor(row.score) }}>
                  {row.score === null ? "–" : Math.round(row.score)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Book({ holdings, watching }: { holdings: BookRow[]; watching: BookRow[] }) {
  const [tab, setTab] = useState<"holdings" | "watching">(holdings.length > 0 ? "holdings" : "watching");
  const [sort, setSort] = useState<SortState>(null);
  const baseRows = tab === "holdings" ? holdings : watching;
  const rows = useMemo(() => sortBookRows(baseRows, sort), [baseRows, sort]);

  const onPickSort = (key: SortKey) => {
    setSort((previous) => {
      if (previous?.key === key) return { key, dir: previous.dir === "asc" ? "desc" : "asc" };
      return { key, dir: defaultDirFor(key) };
    });
  };

  return (
    <section aria-label="Watchlist positions">
      <div className="mb-3 flex flex-wrap items-end justify-start gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Watchlist positions">
          {([
            ["holdings", "Holdings", holdings.length],
            ["watching", "Watching", watching.length],
          ] as const).map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className="rounded-full px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide transition-colors"
                style={active ? { color: "var(--rn-ink)", background: "var(--rn-card-2)", boxShadow: "inset 0 0 0 1px var(--rn-line)" } : { color: "var(--rn-muted)" }}
              >
                {label} <span className="ml-1">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="border-y border-[var(--rn-line)] py-10 text-center text-[13px] text-[var(--rn-muted)]">
          Nothing here yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)]">
          <div className="max-h-[39rem] divide-y divide-[var(--rn-line)] overflow-y-auto sm:hidden">
            {rows.map((row) => <MobileRow key={`${row.market}-${row.ticker}`} row={row} />)}
          </div>
          <DesktopTable rows={rows} sort={sort} onPickSort={onPickSort} />
        </div>
      )}
    </section>
  );
}
