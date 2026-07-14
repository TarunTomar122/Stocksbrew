"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { BookFlag, BookFlagTone, BookRow } from "@/components/radar-next/types";

type SortKey = "name" | "last" | "chg";
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
  if (!sort) return rows;
  const copy = [...rows];
  const mul = sort.dir === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    if (sort.key === "name") return mul * a.ticker.localeCompare(b.ticker);
    if (sort.key === "last") return compareNullable(a.price, b.price, mul);
    return compareNullable(a.dayChangePct, b.dayChangePct, mul);
  });
  return copy;
}

function SortHeader({
  label,
  sortKey,
  align = "left",
  active,
  dir,
  onPick,
  rounded,
}: {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right";
  active: boolean;
  dir: SortDir;
  onPick: (key: SortKey) => void;
  rounded?: "tl" | "tr";
}) {
  const roundClass =
    rounded === "tl" ? "rounded-tl-[11px]" : rounded === "tr" ? "rounded-tr-[11px]" : "";
  return (
    <th
      className={`sticky top-0 z-20 bg-[var(--rn-card)] px-2 pb-2 pt-2.5 font-normal shadow-[0_1px_0_var(--rn-line),0_6px_12px_-4px_var(--rn-card)] sm:px-4 sm:pt-3 ${roundClass} ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onPick(sortKey)}
        className={`rn-kick inline-flex items-center gap-1 transition-colors ${
          align === "right" ? "w-full justify-end" : "justify-start"
        } ${active ? "text-[var(--rn-ink)]" : "text-[var(--rn-muted)] hover:text-[var(--rn-ink)]"}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span
          className={`text-[9px] leading-none transition-colors ${
            active ? "text-[var(--rn-ink)]" : "text-[var(--rn-muted)] opacity-70"
          }`}
          aria-hidden
        >
          {active ? (dir === "desc" ? "▼" : "▲") : "▼"}
        </span>
      </button>
    </th>
  );
}

function flagStyle(tone: BookFlagTone): { color: string; background: string } {
  const c =
    tone === "pos"
      ? "var(--rn-bull)"
      : tone === "neg"
        ? "var(--rn-bear)"
        : tone === "warn"
          ? "var(--signal-neutral)"
          : tone === "earnings"
            ? "var(--on-surface-variant)"
            : "#2563eb"; // info
  return { color: c, background: `color-mix(in srgb, ${c} 13%, transparent)` };
}

function FlagChip({ flag }: { flag: BookFlag }) {
  const s = flagStyle(flag.tone);
  return (
    <span
      title={flag.title}
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold leading-none"
      style={{ color: s.color, background: s.background }}
    >
      {flag.label}
    </span>
  );
}

function changeColor(v: number | null): string {
  if (v === null) return "var(--rn-muted)";
  return v >= 0 ? "var(--rn-bull)" : "var(--rn-bear)";
}

function attentionAccent(direction: BookRow["attentionDirection"]): string {
  if (direction === "bullish") return "var(--rn-bull)";
  if (direction === "bearish") return "var(--rn-bear)";
  return "var(--signal-neutral)";
}

function BookTable({
  rows,
  sort,
  onPickSort,
}: {
  rows: BookRow[];
  sort: SortState;
  onPickSort: (key: SortKey) => void;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-[13px] text-[var(--rn-muted)]">Nothing here yet.</p>;
  }
  return (
    <table className="w-full min-w-0 border-collapse sm:min-w-[340px]">
      <thead className="sticky top-0 z-20 bg-[var(--rn-card)]">
        <tr className="text-left">
          <SortHeader
            label="name"
            sortKey="name"
            active={sort?.key === "name"}
            dir={sort?.key === "name" ? sort.dir : "asc"}
            onPick={onPickSort}
            rounded="tl"
          />
          <SortHeader
            label="last"
            sortKey="last"
            align="right"
            active={sort?.key === "last"}
            dir={sort?.key === "last" ? sort.dir : "desc"}
            onPick={onPickSort}
          />
          <SortHeader
            label="chg"
            sortKey="chg"
            align="right"
            active={sort?.key === "chg"}
            dir={sort?.key === "chg" ? sort.dir : "desc"}
            onPick={onPickSort}
            rounded="tr"
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const price =
            row.price !== null
              ? `${row.currency}${row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "-";
          const isLast = index === rows.length - 1;
          const accent = row.needsAttention ? attentionAccent(row.attentionDirection) : null;
          const cellHover = accent
            ? "transition-colors group-hover:bg-[color-mix(in_srgb,var(--rn-card-2)_70%,transparent)]"
            : "transition-colors group-hover:bg-[var(--rn-card-2)]";
          const firstCellHover = `${cellHover} sm:rounded-l-[10px]${isLast ? " sm:rounded-bl-[10px]" : ""}`;
          const lastCellHover = `${cellHover} sm:rounded-r-[10px]${isLast ? " sm:rounded-br-[10px]" : ""}`;
          return (
            <tr
              key={`${row.market}-${row.ticker}`}
              className="group border-b border-[var(--rn-line)] last:border-b-0"
              style={
                accent
                  ? {
                      background: `color-mix(in srgb, ${accent} 8%, var(--rn-card))`,
                      boxShadow: `inset 3px 0 0 ${accent}`,
                    }
                  : undefined
              }
            >
              <td className={`px-2 py-3.5 sm:px-4 sm:py-3 ${firstCellHover}`}>
                <Link href={row.href} className="flex items-center gap-2.5 no-underline sm:gap-3">
                  <StockLogo ticker={row.ticker} market={row.market} size={28} className="shrink-0" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-bold leading-tight tracking-tight text-[var(--rn-ink)] group-hover:underline">
                        {row.ticker}
                      </span>
                      {row.flags.map((flag, i) => (
                        <FlagChip key={i} flag={flag} />
                      ))}
                    </span>
                    {row.needsAttention && row.attentionAction ? (
                      <span
                        className="mt-0.5 block max-w-[9rem] truncate text-[11px] font-semibold leading-tight sm:max-w-[17rem]"
                        style={{ color: accent ?? "var(--rn-ink)" }}
                      >
                        {row.attentionAction}
                      </span>
                    ) : row.name ? (
                      <span className="mt-0.5 block max-w-[8.5rem] truncate text-[11px] leading-tight text-[var(--rn-muted)] sm:max-w-[17rem]">
                        {row.name}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </td>
              <td className={`px-2 py-3.5 text-right align-middle font-mono text-[13px] font-semibold tabular-nums text-[var(--rn-ink)] sm:px-4 sm:py-3 ${cellHover}`}>
                {price}
              </td>
              <td
                className={`px-2 py-3.5 text-right align-middle font-mono text-[13px] font-semibold tabular-nums sm:px-4 sm:py-3 ${lastCellHover}`}
                style={{ color: changeColor(row.dayChangePct) }}
              >
                {row.dayChangePct === null
                  ? "-"
                  : `${row.dayChangePct >= 0 ? "+" : "−"}${Math.abs(row.dayChangePct).toFixed(2)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Book({ holdings, watching }: { holdings: BookRow[]; watching: BookRow[] }) {
  const [tab, setTab] = useState<"holdings" | "watching">(
    holdings.length > 0 ? "holdings" : "watching",
  );
  const [sort, setSort] = useState<SortState>(null);
  const baseRows = tab === "holdings" ? holdings : watching;
  const rows = useMemo(() => sortBookRows(baseRows, sort), [baseRows, sort]);

  const onPickSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: defaultDirFor(key) };
    });
  };

  const TabButton = ({ id, label, count }: { id: "holdings" | "watching"; label: string; count: number }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors"
        style={
          active
            ? { color: "var(--rn-ink)", background: "var(--rn-card-2)", boxShadow: "inset 0 0 0 1px var(--rn-line)" }
            : { color: "var(--rn-muted)" }
        }
      >
        {label}
        <span
          className="rounded-full px-1.5 text-[10px]"
          style={{ background: active ? "color-mix(in srgb, var(--rn-accent) 16%, transparent)" : "var(--rn-card-2)", color: active ? "var(--rn-accent)" : "var(--rn-muted)" }}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <section aria-labelledby="rn-book" className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="rn-book" className="rn-kick">
          // your book
        </h2>
        <div className="flex items-center gap-1.5">
          <TabButton id="holdings" label="holdings" count={holdings.length} />
          <TabButton id="watching" label="watching" count={watching.length} />
        </div>
      </div>
      <div className="rn-card flex min-h-0 flex-1 flex-col overflow-hidden max-sm:rounded-xl">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto max-h-[min(72dvh,520px)] sm:max-h-[460px]">
          <BookTable rows={rows} sort={sort} onPickSort={onPickSort} />
        </div>
      </div>
    </section>
  );
}
