"use client";

import Link from "next/link";

import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { ShowMore } from "@/components/oa/kit/more";
import { StockLogo } from "@/components/stock-logo";

/**
 * One company in "Every company", already in words. The page hands the table
 * its rows as data and the table builds its cells here, on the client, once
 * someone opens the fold: up to 300 rows used to ship as a server-rendered
 * element tree (and hidden HTML) on every visit, opened or not.
 */
export type CompanyLine = {
  key: string;
  ticker: string;
  /** The short company name, or "" when it would only repeat the ticker. */
  label: string;
  /** The full short name, for the hover. */
  title: string;
  direct: string;
  funds: string;
  via: string;
  pct: string;
  /** Sort values: name, direct, through funds, number of funds, total. */
  sort: [string, number, number, number, number];
};

const NUM = "oa-mono tabular-nums";

const COLUMNS: DataColumn[] = [
  { id: "company", label: "Company", sortable: true },
  { id: "direct", label: "Bought directly", align: "right", sortable: true, hideOnMobile: true },
  { id: "funds", label: "Through funds", align: "right", sortable: true, hideOnMobile: true },
  { id: "via", label: "Held through", hideOnMobile: true },
  { id: "pct", label: "Share", align: "right", sortable: true },
];

/** The kit's Ticker (logo, symbol, short name), drawn on the client from words worked out on the server. */
function CompanyCell({ line }: { line: CompanyLine }) {
  return (
    <Link href={`/stock/${encodeURIComponent(line.ticker)}`} prefetch={false} className="oa-tk">
      <StockLogo ticker={line.ticker} size={20} />
      <span className="oa-mono oa-tk-sym">{line.ticker}</span>
      {line.label ? (
        <span title={line.title} className="oa-tk-name">
          {line.label}
        </span>
      ) : null}
    </Link>
  );
}

export function CompanyTable({ lines, label, note }: { lines: CompanyLine[]; label: string; note: string | null }) {
  const rows: DataRow[] = lines.map((line) => ({
    key: line.key,
    cells: [
      <CompanyCell key="t" line={line} />,
      <span key="d" className={NUM}>{line.direct}</span>,
      <span key="f" className={NUM}>{line.funds}</span>,
      <span key="v" className={`${NUM} text-oa-muted-fg`}>{line.via}</span>,
      <span key="p" className={`${NUM} text-oa-fg`}>{line.pct}</span>,
    ],
    sort: line.sort,
  }));
  return (
    <ShowMore always lazy label={label} className="[&>button]:mx-4 [&>button]:mb-4 [&>button]:w-[calc(100%-2rem)]">
      <DataTable columns={COLUMNS} rows={rows} initialSort={{ id: "pct", dir: "desc" }} pageSize={50} compact />
      {note ? <p className="border-t border-oa-border px-4 py-3 text-[14px] text-oa-muted-fg">{note}</p> : null}
    </ShowMore>
  );
}
