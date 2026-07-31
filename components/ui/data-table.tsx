"use client";

import * as React from "react";
import {
  type ColumnDef,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right";
    hideOnMobile?: boolean;
  }
}

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Generic sortable table. Columns opt into sorting via `enableSorting`.
// Click a sortable header to cycle asc/desc. Styling comes from ui/table.
export function DataTable<TData, TValue>({
  columns,
  data,
  initialSorting = [],
  className,
  onRowClick,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  initialSorting?: SortingState;
  className?: string;
  onRowClick?: (row: TData) => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-transparent">
            {group.headers.map((header) => {
              const sortable = header.column.getCanSort();
              const dir = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    header.column.columnDef.meta?.align === "right" && "text-right",
                    header.column.columnDef.meta?.hideOnMobile && "hidden md:table-cell",
                    sortable && "cursor-pointer select-none hover:text-on-surface",
                  )}
                  onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {sortable ? (
                      <span className="text-on-surface-variant/70">
                        {dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕"}
                      </span>
                    ) : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className={cn(onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cn(
                  cell.column.columnDef.meta?.align === "right" && "text-right",
                  cell.column.columnDef.meta?.hideOnMobile && "hidden md:table-cell",
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
