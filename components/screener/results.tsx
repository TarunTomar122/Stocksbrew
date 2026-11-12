"use client";

import Link from "next/link";
import * as React from "react";

import { Sparkline } from "@/components/oa/kit/cells";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { ShowMore } from "@/components/oa/kit/more";
import { RowCheck } from "@/components/screener/selection";
import { CallTag, EarningsDate, FieldValue, Unknown, ZoneTag } from "@/components/screener/shared";
import { StockLogo } from "@/components/stock-logo";
import { ZONE_COLUMN_IDS, isFiniteNumber, type ScreenerRow } from "@/lib/screener-shared";

/**
 * The screener's results: the desktop table and the phone list, drawn here
 * from plain rows. The page used to render every cell on the server, which
 * shipped each row three times (table HTML, phone HTML, and both element trees
 * in the RSC payload); now the payload carries each row's figures once.
 */

/** A screener row cut down to what the shown columns print. `short` is the company name as rows print it. */
export type ResultRow = Partial<ScreenerRow> & { symbol: string; short: string; also?: string };

/** One table cell for a column, the same markup the page used to render on the server. */
export function cellFor(id: string, row: Partial<ScreenerRow>): React.ReactNode {
  switch (id) {
    case "sector":
      return row.sector ? <span className="text-oa-muted-fg">{row.sector}</span> : <Unknown />;
    case "industry":
      return row.industry ? <span className="block max-w-[12rem] truncate text-oa-muted-fg">{row.industry}</span> : <Unknown />;
    case "spark":
      return row.spark && row.spark.length > 1 ? <Sparkline values={row.spark} width={72} height={22} className="inline-block align-middle" /> : <Unknown />;
    case "earnings_date":
      return <EarningsDate row={row as ScreenerRow} />;
    case "analyst_label":
      return row.analyst_label ? <span className="text-oa-fg">{row.analyst_label}</span> : <Unknown />;
    case "call":
      return row.call ? <CallTag call={row.call} /> : null;
    case "zone":
      return row.zone ? <ZoneTag zone={row.zone} /> : null;
    default: {
      const value = (row as Record<string, unknown>)[id];
      if (ZONE_COLUMN_IDS.has(id) && !isFiniteNumber(value)) return null;
      return <FieldValue id={id} value={value} row={row as ScreenerRow} />;
    }
  }
}

/** Logo, ticker and short name: the kit's Ticker, drawn from words the page worked out. */
function StockCell({ row }: { row: ResultRow }) {
  const label = row.short && row.short.toUpperCase() !== row.symbol.toUpperCase() ? row.short : "";
  return (
    <div className="sm:max-w-[11.5rem] xl:max-w-[13rem]">
      <Link href={`/stock/${encodeURIComponent(row.symbol)}`} prefetch={false} className="oa-tk max-w-full">
        <StockLogo ticker={row.symbol} size={20} />
        <span className="oa-mono oa-tk-sym">{row.symbol}</span>
        {label ? (
          <span title={row.short} className="oa-tk-name">
            {label}
          </span>
        ) : null}
      </Link>
      {row.also ? <span className="oa-mono tabular-nums ml-7 block text-[12px] leading-4 text-oa-muted-fg">{row.also}</span> : null}
    </div>
  );
}

/** Phone: a list, not a squeezed table. Ticker and name, price over the day's change, our call. */
function PhoneRow({ row, extra }: { row: ResultRow; extra: string | null }) {
  return (
    // Phone row styles are .sp-* in app/globals.css.
    <li className="sp-row">
      {/* No tick boxes on a phone: a row is one tap to the stock; comparing lives on the stock page. */}
      <Link prefetch={false} href={`/stock/${encodeURIComponent(row.symbol)}`} className="sp-link">
        <StockLogo ticker={row.symbol} size={28} />
        <span className="min-w-0 flex-1">
          {/* The sorted-by figure sits beside the ticker, so the name keeps the second line to itself. */}
          <span className="sp-top">
            <span className="oa-mono sp-sym">{row.symbol}</span>
            {extra ? <span className="sp-extra">{cellFor(extra, row)}</span> : null}
          </span>
          {/* One line, cut with an ellipsis if it must (owner, Nov 11); the full name is on hover. */}
          <span className="sp-sub">
            {/* The name keeps its room; "also GOOG" is the part that gets cut when space runs out. */}
            <span className="sp-name" title={row.name ?? undefined}>
              {row.short}
            </span>
            {row.also ? <span className="oa-mono tabular-nums min-w-0 truncate">· {row.also}</span> : null}
          </span>
        </span>
        {row.spark && row.spark.length > 1 ? (
          <Sparkline values={row.spark} width={44} height={20} className="max-[359px]:hidden" />
        ) : (
          <span aria-hidden="true" className="w-11 shrink-0 max-[359px]:hidden" />
        )}
        <span className="sp-num">
          <FieldValue id="price" value={row.price} />
          <FieldValue id="day_pct" value={row.day_pct} />
        </span>
        <span className="sp-call">{row.call ? <CallTag call={row.call} /> : null}</span>
      </Link>
    </li>
  );
}

/** Twenty is a screen's worth on a phone; the rest of the page is one tap away, not a long scroll. */
const PHONE_FIRST = 20;

export function ScreenerResults({
  rows,
  columns,
  columnIds,
  phoneHead,
  phoneExtra,
}: {
  rows: ResultRow[];
  /** The table's header cells (sort links, Pro marks) as the page drew them; the first two are the tick box and Stock. */
  columns: DataColumn[];
  /** The value columns after Stock, in order. */
  columnIds: string[];
  /** The phone list's header row, with its sort links. */
  phoneHead: React.ReactNode;
  /** The sorted-by field a phone row shows beside its ticker, when it is not already in the row. */
  phoneExtra: string | null;
}) {
  const tableRows: DataRow[] = rows.map((row) => ({
    key: row.symbol,
    href: `/stock/${encodeURIComponent(row.symbol)}`,
    cells: [
      <RowCheck key="_select" symbol={row.symbol} />,
      <StockCell key="symbol" row={row} />,
      ...columnIds.map((id) => <React.Fragment key={id}>{cellFor(id, row)}</React.Fragment>),
    ],
  }));
  return (
    <>
      <div className="hidden sm:block">
        {/* The screener is for scanning: about 14 rows before it scrolls inside (owner, Nov 11), header pinned. */}
        <DataTable columns={columns} rows={tableRows} compact maxRows={14} />
      </div>
      <div className="sm:hidden">
        {phoneHead}
        <ul>
          {rows.slice(0, PHONE_FIRST).map((row) => (
            <PhoneRow key={row.symbol} row={row} extra={phoneExtra} />
          ))}
        </ul>
        {rows.length > PHONE_FIRST ? (
          <ShowMore label={`Show ${rows.length - PHONE_FIRST} more stocks`} className="pb-3 [&>button]:mx-3 [&>button]:w-[calc(100%-1.5rem)]">
            <ul className="border-t border-oa-border">
              {rows.slice(PHONE_FIRST).map((row) => (
                <PhoneRow key={row.symbol} row={row} extra={phoneExtra} />
              ))}
            </ul>
          </ShowMore>
        ) : null}
      </div>
    </>
  );
}
