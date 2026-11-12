"use client";

import * as React from "react";

import { Sparkline, toneText } from "@/components/markets/widgets";
import { StockLogo } from "@/components/stock-logo";
import {
  assetHref,
  signalTone,
  sparkTone,
  ETF_GROUPS,
  formatChange,
  formatCompactNumber,
  formatCompactUsd,
  formatLevel,
  type MarketAsset,
  type MarketChange,
} from "@/lib/markets-shared";
import Link from "next/link";

type SortKey = "order" | "symbol" | "price" | keyof MarketChange | "extra1" | "extra2";

interface ExtraColumn {
  label: string;
  title: string;
  value: (asset: MarketAsset) => number | null;
  text: (asset: MarketAsset) => string | null;
}

function extraColumns(assetClass: MarketAsset["class"]): ExtraColumn[] {
  if (assetClass === "etf") {
    return [
      {
        label: "Fee",
        title: "Annual expense ratio, as the fund reports it",
        value: (asset) => asset.expense_ratio_pct,
        text: (asset) => (asset.expense_ratio_pct === null ? null : `${asset.expense_ratio_pct.toFixed(2)}%`),
      },
      {
        label: "Assets",
        title: "Total net assets",
        value: (asset) => asset.total_assets,
        text: (asset) => formatCompactUsd(asset.total_assets),
      },
    ];
  }
  if (assetClass === "crypto") {
    return [
      {
        label: "Mkt cap",
        title: "Market value of the circulating supply",
        value: (asset) => asset.market_cap,
        text: (asset) => formatCompactUsd(asset.market_cap),
      },
      {
        label: "Vol 24h",
        title: "Traded in the last 24 hours",
        value: (asset) => asset.volume_24h,
        text: (asset) => formatCompactUsd(asset.volume_24h),
      },
    ];
  }
  if (assetClass === "commodity") {
    return [
      {
        label: "Later vs now",
        title: "What a later contract costs against the nearest one. Above zero, later contracts cost more; below zero, they cost less.",
        value: (asset) => asset.structure?.spread_pct ?? null,
        text: (asset) =>
          asset.structure ? `${asset.structure.spread_pct > 0 ? "+" : asset.structure.spread_pct < 0 ? "−" : ""}${Math.abs(asset.structure.spread_pct).toFixed(1)}%` : null,
      },
    ];
  }
  if (assetClass === "option") {
    return [
      {
        label: "20d avg",
        title: "Average of the last 20 trading days (put/call ratios only)",
        value: (asset) => asset.average_20d,
        text: (asset) => (asset.average_20d === null ? null : asset.average_20d.toFixed(2)),
      },
      {
        label: "Volume",
        title: "Calls plus puts traded that day (put/call ratios only)",
        value: (asset) => (asset.call_volume !== null && asset.put_volume !== null ? asset.call_volume + asset.put_volume : null),
        text: (asset) =>
          asset.call_volume !== null && asset.put_volume !== null ? formatCompactNumber(asset.call_volume + asset.put_volume) : null,
      },
    ];
  }
  return [];
}

const CHANGE_COLUMNS: Array<{ key: keyof MarketChange; label: string; title: string }> = [
  { key: "d1", label: "Day", title: "Change from the previous close (24 hours for crypto)" },
  { key: "w1", label: "1W", title: "Change over one week" },
  { key: "m1", label: "1M", title: "Change over one month" },
  { key: "ytd", label: "YTD", title: "Change since the last close of the previous year" },
  { key: "y1", label: "1Y", title: "Change over one year" },
];

/** A phone shows the day change; the longer ranges need the width of a tablet. */
const PHONE_CHANGES = new Set<keyof MarketChange>(["d1"]);

function sortValue(asset: MarketAsset, key: SortKey, extras: ExtraColumn[]): number | string | null {
  if (key === "order") return asset.order;
  if (key === "symbol") return asset.symbol;
  if (key === "price") return asset.price;
  if (key === "extra1") return extras[0]?.value(asset) ?? null;
  if (key === "extra2") return extras[1]?.value(asset) ?? null;
  return asset.change[key];
}

/**
 * The full table for one class. Click a column to sort; click again to flip.
 * The first column stays put while the rest scrolls sideways on a phone.
 */
export function AssetTable({ assets, assetClass }: { assets: MarketAsset[]; assetClass: MarketAsset["class"] }) {
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: "order", desc: false });
  const [group, setGroup] = React.useState<string>("all");
  const extras = React.useMemo(() => extraColumns(assetClass), [assetClass]);

  const groups = React.useMemo(() => {
    if (assetClass !== "etf") return [];
    const present = new Set(assets.map((asset) => asset.group));
    return ETF_GROUPS.filter((item) => present.has(item.id));
  }, [assets, assetClass]);

  const rows = React.useMemo(() => {
    const filtered = group === "all" ? assets : assets.filter((asset) => asset.group === group);
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sort.key, extras);
      const right = sortValue(b, sort.key, extras);
      // Unknown values always sink to the bottom, whichever way the column is sorted.
      if (left === null && right === null) return a.order - b.order;
      if (left === null) return 1;
      if (right === null) return -1;
      const compared = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right)) : left - right;
      return (sort.desc ? -compared : compared) || a.order - b.order;
    });
  }, [assets, group, sort, extras]);

  function toggle(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "symbol" && key !== "order" },
    );
  }

  function header(key: SortKey, label: string, title: string, align: "left" | "right" = "right", wide = false) {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
        className={`h-9 whitespace-nowrap border-b border-oa-border bg-oa-bg px-0 font-normal ${align === "left" ? "sticky left-0 z-10 text-left" : "text-right"} ${wide ? "hidden sm:table-cell" : ""}`}
      >
        <button
          type="button"
          onClick={() => toggle(key)}
          title={title}
          className={`oa-mono inline-flex h-9 w-full cursor-pointer items-center gap-1 px-2.5 text-[12.5px] font-medium uppercase tracking-[0.04em] outline-none transition-colors hover:text-oa-fg focus-visible:text-oa-fg ${
            align === "left" ? "justify-start pl-3.5" : "justify-end"
          } ${active ? "text-oa-fg" : "text-oa-muted-fg"}`}
        >
          {label}
          <span aria-hidden="true" className={`text-[9px] ${active ? "opacity-100" : "opacity-0"}`}>
            {sort.desc ? "▼" : "▲"}
          </span>
        </button>
      </th>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-6 text-[14px] text-oa-muted-fg">
        Nothing to show for this class right now.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 1 ? (
        <div role="group" aria-label="Filter funds" className="oa-scroll-fade -mx-2 flex gap-2 overflow-x-auto px-4 pr-8 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {[{ id: "all", title: "All" }, ...groups].map((item) => {
            const on = group === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(item.id)}
                className={`h-10 shrink-0 cursor-pointer rounded-md border px-3 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-ring sm:h-8 ${
                  on
                    ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg"
                    : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                }`}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px] sm:min-w-[720px]">
            <thead>
              <tr>
                {header("symbol", "Name", "Sort by symbol", "left")}
                {header("price", assetClass === "rate" ? "Yield" : assetClass === "option" ? "Level" : "Price", "Latest level")}
                {CHANGE_COLUMNS.map((column) => header(column.key, column.label, column.title, "right", !PHONE_CHANGES.has(column.key)))}
                {extras.map((column, index) => header(index === 0 ? "extra1" : "extra2", column.label, column.title, "right", true))}
                <th scope="col" className="oa-caption hidden h-9 border-b border-oa-border bg-oa-bg px-3.5 text-right sm:table-cell">
                  1 year
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => (
                <tr key={asset.id} className="group border-b border-oa-border last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 max-w-[9.5rem] bg-oa-card p-0 text-left font-normal group-hover:bg-oa-bg sm:max-w-[19rem]">
                    <Link prefetch={false} href={assetHref(asset)} className="flex min-h-11 flex-col justify-center px-3.5 py-1.5 outline-none focus-visible:bg-oa-accent">
                      {asset.class === "etf" ? (
                        // Funds are real tickers with logos; indexes, rates, commodities, FX and crypto are not.
                        <span className="oa-mono flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-[18px] text-oa-fg">
                          <StockLogo ticker={asset.symbol} size={16} />
                          <span className="truncate">{asset.symbol}</span>
                        </span>
                      ) : (
                        <span className="oa-mono truncate text-[14px] font-medium leading-[18px] text-oa-fg">{asset.symbol}</span>
                      )}
                      <span className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{asset.name}</span>
                    </Link>
                  </th>
                  <td className="oa-mono whitespace-nowrap px-2.5 text-right tabular-nums text-oa-fg group-hover:bg-oa-bg">
                    {formatLevel(asset.price, asset.unit)}
                  </td>
                  {CHANGE_COLUMNS.map((column) => {
                    const value = asset.change[column.key];
                    return (
                      <td
                        key={column.key}
                        className={`oa-mono whitespace-nowrap px-2.5 text-right tabular-nums group-hover:bg-oa-bg max-sm:last-of-type:pr-4 ${toneText(signalTone(value, asset.change_mode))} ${
                          PHONE_CHANGES.has(column.key) ? "" : "hidden sm:table-cell"
                        }`}
                      >
                        {formatChange(value, asset.change_mode) ?? <span title="Not available">·</span>}
                      </td>
                    );
                  })}
                  {extras.map((column) => (
                    <td key={column.label} className="oa-mono hidden whitespace-nowrap px-2.5 text-right tabular-nums text-oa-muted-fg group-hover:bg-oa-bg sm:table-cell">
                      {column.text(asset) ?? <span title="Not reported">·</span>}
                    </td>
                  ))}
                  <td className="hidden px-3.5 text-right group-hover:bg-oa-bg sm:table-cell">
                    <span className="inline-flex justify-end align-middle">
                      <Sparkline values={asset.spark} tone={sparkTone(asset.spark, asset.change_mode)} width={84} height={24} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
