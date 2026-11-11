"use client";

import * as React from "react";

/**
 * A dense sortable table. Cells arrive pre-rendered from the server so any
 * page can use it; each row also carries plain sort values, one per column.
 */
export type DataColumn = {
  id: string;
  label: React.ReactNode;
  align?: "left" | "right";
  /** Hide below the sm breakpoint to keep phones readable. */
  hideOnMobile?: boolean;
  sortable?: boolean;
  /** Tooltip explaining what the column means. */
  hint?: string;
};

export type DataRow = {
  key: string;
  cells: React.ReactNode[];
  /** One per column: number, string or null (nulls always sort last). */
  sort?: Array<number | string | null>;
  href?: string;
};

export function DataTable({
  columns,
  rows,
  initialSort,
  empty,
  pageSize,
  stickyHeader = true,
  maxRows = 8,
  compact = false,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  initialSort?: { id: string; dir: "asc" | "desc" };
  empty?: React.ReactNode;
  /** Show this many rows, with a "Show more" control for the rest. */
  pageSize?: number;
  stickyHeader?: boolean;
  /** Rows shown before the table scrolls inside itself (owner rule: about eight, no visible scrollbar). 0 turns it off. */
  maxRows?: number;
  /** Tighter cell padding, for wide tables that must fit the content column at 1280. */
  compact?: boolean;
}) {
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [shown, setShown] = React.useState(pageSize ?? rows.length);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const index = columns.findIndex((column) => column.id === sort.id);
    if (index < 0) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a.sort?.[index] ?? null;
      const bv = b.sort?.[index] ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, columns]);

  if (rows.length === 0) {
    return <div className="px-4 py-8 text-center text-[14px] text-oa-muted-fg">{empty ?? "Nothing to show."}</div>;
  }

  const visible = pageSize ? sorted.slice(0, shown) : sorted;

  return (
    <div className="min-w-0">
      <div className={`overflow-x-auto ${maxRows > 0 && visible.length > maxRows ? "overflow-y-auto" : ""}`} style={maxRows > 0 && visible.length > maxRows ? { maxHeight: `${2.6 + maxRows * 2.75 + 1.4}rem` } : undefined}>
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.id === column.id;
                const align = column.align === "right" ? "text-right" : "text-left";
                return (
                  <th
                    key={column.id}
                    scope="col"
                    title={column.hint}
                    aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`oa-caption h-9 whitespace-nowrap border-b border-oa-border bg-oa-bg ${compact ? "px-1.5" : "px-2"} py-0 first:pl-4 last:pr-4 ${align} ${
                      column.hideOnMobile ? "hidden sm:table-cell" : ""
                    } ${stickyHeader ? "sticky top-0 z-[1]" : ""}`}
                  >
                    {column.sortable === false ? (
                      column.label
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setSort((current) =>
                            current?.id === column.id
                              ? { id: column.id, dir: current.dir === "desc" ? "asc" : "desc" }
                              : { id: column.id, dir: column.align === "right" ? "desc" : "asc" },
                          )
                        }
                        className={`inline-flex items-center gap-1 uppercase tracking-[inherit] outline-none hover:text-oa-fg focus-visible:underline ${
                          active ? "text-oa-fg" : ""
                        }`}
                      >
                        {column.label}
                        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                          {sort?.dir === "asc" ? "↑" : "↓"}
                        </span>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-oa-border last:border-b-0 hover:bg-oa-accent ${row.href ? "cursor-pointer" : ""}`}
                onClick={
                  row.href
                    ? (event) => {
                        if ((event.target as HTMLElement).closest("a,button,input,select,label")) return;
                        window.location.href = row.href as string;
                      }
                    : undefined
                }
              >
                {row.cells.map((cell, index) => {
                  const column = columns[index];
                  return (
                    <td
                      key={column?.id ?? index}
                      className={`h-11 whitespace-nowrap ${compact ? "px-1.5" : "px-2"} py-1 align-middle first:pl-4 last:pr-4 ${
                        column?.align === "right" ? "text-right" : "text-left"
                      } ${column?.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && shown < sorted.length ? (
        <div className="border-t border-oa-border p-2 text-center">
          <button
            type="button"
            onClick={() => setShown((count) => count + pageSize)}
            className="rounded-md px-3 py-1 text-[14px] font-medium text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
          >
            Show {Math.min(pageSize, sorted.length - shown)} more of {sorted.length - shown}
          </button>
        </div>
      ) : null}
    </div>
  );
}
