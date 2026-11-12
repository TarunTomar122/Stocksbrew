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
  /** Only on very wide screens (2xl): a column a 1280 screen has no room for, so the others never scroll sideways. Never a sort. */
  wideOnly?: boolean;
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

/** A body cell's own classes: only what differs from the .oa-dt default (left-aligned, shown everywhere). */
function cellClass(column: DataColumn | undefined): string | undefined {
  const parts = [column?.align === "right" ? "text-right" : "", hideClass(column)].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

/** Where a column is hidden: everywhere below 2xl, or only on a phone. */
function hideClass(column: DataColumn | undefined): string {
  if (column?.wideOnly) return "hidden 2xl:table-cell";
  return column?.hideOnMobile ? "hidden sm:table-cell" : "";
}

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
  /** Whole rows shown before the table scrolls inside itself (owner rule: about eight, no visible scrollbar). 0 turns it off. */
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
  const scrolls = maxRows > 0 && visible.length > maxRows;

  return (
    <div className="min-w-0">
      {/* A long table scrolls inside a box that ends on a whole row (the header, then `maxRows` rows of h-11 and their
          1px borders), with no bar shown, and hands the scroll back to the page at either end (no overscroll
          containment). The header row stays put while it scrolls. */}
      <div
        className={`overflow-x-auto ${scrolls ? "overflow-y-auto scrollbar-hide" : ""}`}
        style={scrolls ? { maxHeight: `calc(2.25rem + 1px + ${maxRows} * (2.75rem + 1px))` } : undefined}
      >
        {/* Body row and cell styles are .oa-dt in app/globals.css, so each cell carries only its alignment. */}
        <table className={`oa-dt w-full border-collapse text-[14px]${compact ? " oa-dt-compact" : ""}`}>
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
                    className={`oa-caption h-9 whitespace-nowrap border-b border-oa-border bg-oa-bg ${compact ? "px-1.5" : "px-2"} py-0 first:pl-4 last:pr-4 ${align} ${hideClass(column)} ${stickyHeader || scrolls ? "sticky top-0 z-[1]" : ""}`}
                  >
                    {/* A wide-only column is not a sort: sorted by it, a narrower screen would order rows by a column it hides. */}
                    {column.sortable === false || column.wideOnly ? (
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
                className={row.href ? "cursor-pointer" : undefined}
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
                      className={cellClass(column)}
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
