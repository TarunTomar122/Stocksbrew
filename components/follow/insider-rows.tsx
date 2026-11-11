import Link from "next/link";
import * as React from "react";

import { DOWN, ExternalLink, Ticker, UP } from "@/components/follow/bits";
import { StockLogo } from "@/components/stock-logo";
import { shortCompanyName } from "@/lib/plain-copy";
import {
  fmtDate,
  fmtFiledAt,
  fmtShares,
  fmtUsd,
  type InsiderCluster,
  type InsiderTrade,
} from "@/lib/follow-shared";

function spanWords(cluster: InsiderCluster): string {
  return cluster.first_date === cluster.last_date
    ? fmtDate(cluster.last_date, false)
    : `${fmtDate(cluster.first_date, false)} to ${fmtDate(cluster.last_date, false)}`;
}

function memberAmount(member: InsiderCluster["members"][number]): string {
  return member.value != null ? fmtUsd(member.value) : `${fmtShares(member.shares)} shares`;
}

/** "Jane Doe (CEO) $1.2M, John Roe (Director) $310K and 4 more": who bought, in one line. */
export function clusterMembersLine(cluster: InsiderCluster, shown = 3): string {
  const named = cluster.members.slice(0, shown).map((member) => `${member.insider} (${member.role}) ${memberAmount(member)}`);
  const rest = Math.max(0, cluster.insiders - named.length);
  if (named.length === 0) return "";
  if (rest > 0) return `${named.join(", ")} and ${rest} more`;
  if (named.length === 1) return named[0]!;
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

const insiderHref = (symbol: string) => `/insiders/${encodeURIComponent(symbol)}`;

/**
 * Logo, ticker and name, linking to the stock's insider page; its hit area
 * stretches over the nearest `relative` ancestor, so the whole row or card is
 * the link. (Not the kit's Ticker: this file is also used by a client component.)
 */
function ClusterStock({ cluster, size }: { cluster: InsiderCluster; size: number }) {
  return (
    <Link
      prefetch={false}
      href={insiderHref(cluster.symbol)}
      className="inline-flex min-w-0 items-center gap-2 rounded outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
    >
      <StockLogo ticker={cluster.symbol} size={size} />
      <span className="oa-mono text-[14px] font-medium text-oa-fg">{cluster.symbol}</span>
      {cluster.company ? <span title={cluster.company} className="min-w-0 truncate text-[14px] text-oa-muted-fg">{shortCompanyName(cluster.company)}</span> : null}
    </Link>
  );
}

/** One stock where several insiders bought close together. The card opens the stock's insider page. */
export function ClusterCard({ cluster }: { cluster: InsiderCluster }) {
  return (
    <div className="oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-card p-3.5 transition-colors hover:bg-oa-accent">
      <div className="flex items-center justify-between gap-3">
        <ClusterStock cluster={cluster} size={18} />
        <span className={`oa-mono shrink-0 text-[13px] font-medium ${UP}`}>
          {cluster.total_value != null ? fmtUsd(cluster.total_value) : ""}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-oa-fg">
        {cluster.insiders} insiders bought, {spanWords(cluster)}.
      </p>
      <ul className="mt-2 space-y-1 border-t border-oa-border pt-2">
        {cluster.members.slice(0, 4).map((member) => (
          <li
            key={`${member.insider}-${member.role}`}
            className="flex items-baseline justify-between gap-3 text-[12.5px] leading-5"
          >
            <span className="min-w-0 truncate">
              <span className="text-oa-fg">{member.insider}</span>
              <span className="text-oa-muted-fg"> · {member.role}</span>
            </span>
            <span className="oa-mono shrink-0 text-oa-muted-fg">{memberAmount(member)}</span>
          </li>
        ))}
        {cluster.insiders > 4 ? (
          <li className="text-[12px] text-oa-muted-fg">
            and {cluster.insiders - 4} more
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Cluster buys as a ranked list, every one in view: the stock and the money on
 * the line, who bought and when written out under it (owner rule 2: nothing to
 * open to read it). About eight rows show; the rest scroll inside with no bar.
 * The row opens the stock's insider page, which has every filing.
 */
export function ClusterRows({ clusters }: { clusters: InsiderCluster[] }) {
  return (
    <ul className="max-h-[31rem] divide-y divide-oa-border overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {clusters.map((cluster) => {
        const who = clusterMembersLine(cluster);
        return (
          <li key={cluster.symbol} className="relative px-4 py-2.5 transition-colors hover:bg-oa-accent">
            <div className="flex items-center justify-between gap-3">
              <ClusterStock cluster={cluster} size={20} />
              <span className={`oa-mono shrink-0 text-[14px] font-medium ${UP}`}>{cluster.total_value != null ? fmtUsd(cluster.total_value) : ""}</span>
            </div>
            <p className="mt-1 text-pretty pl-7 text-[13.5px] leading-5 text-oa-muted-fg">
              <span className="text-oa-fg">
                {cluster.insiders} insiders bought, {spanWords(cluster)}
                {who ? ": " : "."}
              </span>
              {who ? `${who}.` : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const TRADE_GRID =
  "md:grid-cols-[122px_58px_minmax(150px,1.4fr)_52px_78px_72px_80px_86px]";
/** A list of only buys (or only sells) says the side once, in its title or filter, not "BUY" on every row. */
const TRADE_GRID_ONE_SIDE =
  "md:grid-cols-[122px_58px_minmax(150px,1.4fr)_78px_72px_80px_86px]";

export function InsiderTableHead({ showSide = true }: { showSide?: boolean }) {
  const cell = "oa-caption";
  return (
    <div
      className={`hidden h-9 items-center gap-x-3 border-b border-oa-border bg-oa-bg px-4 md:grid ${showSide ? TRADE_GRID : TRADE_GRID_ONE_SIDE}`}
    >
      <span className={cell}>Filed</span>
      <span className={cell}>Stock</span>
      <span className={cell}>Insider</span>
      {showSide ? <span className={cell}>Side</span> : null}
      <span className={`${cell} text-right`}>Value</span>
      <span className={`${cell} text-right`}>Shares</span>
      <span className={`${cell} text-right`}>Avg price</span>
      <span className={`${cell} text-right`}>Traded</span>
    </div>
  );
}

/** One insider's buys or sells in one filing. */
export function InsiderRow({ trade, showSide = true }: { trade: InsiderTrade; showSide?: boolean }) {
  const buy = trade.tx_type === "buy";
  const tone = buy ? UP : DOWN;
  const lag =
    trade.lag_days != null && trade.lag_days > 2
      ? ` · ${trade.lag_days}d late to file`
      : "";
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 md:min-h-[44px] md:py-1.5 ${showSide ? TRADE_GRID : TRADE_GRID_ONE_SIDE}`}
    >
      <span
        className="oa-mono order-3 col-span-2 text-[11.5px] text-oa-muted-fg md:order-none md:col-span-1 md:text-[12px]"
        title={`Filed ${trade.filed_at} US Eastern`}
      >
        {/* The filing time opens the Form 4 itself, so no "SEC" or "Form 4" link is repeated on every row (owner, Nov 11). */}
        <ExternalLink href={trade.url} className="-my-1 inline-block py-1">
          <span className="md:hidden">Filed </span>
          {fmtFiledAt(trade.filed_at).replace(" ET", "")}
          <span className="sr-only"> (the Form 4 at the SEC)</span>
        </ExternalLink>
        <span className="md:hidden">
          , traded {fmtDate(trade.transaction_date, false)}
          {lag}
        </span>
      </span>
      <span className="order-1 flex min-w-0 items-baseline gap-2 md:order-none">
        <Ticker ticker={trade.symbol} className="text-[13.5px]" />
        {showSide ? (
          <span
            className={`oa-mono text-[10.5px] uppercase tracking-[0.06em] md:hidden ${tone}`}
          >
            {buy ? "Bought" : "Sold"}
          </span>
        ) : null}
      </span>
      <span className="order-2 col-span-2 flex min-w-0 items-baseline gap-1.5 text-[13px] leading-5 md:order-none md:col-span-1">
        <span className="min-w-0 truncate">
          <span className="text-oa-fg">{trade.insider}</span>
          <span className="text-oa-muted-fg"> · {trade.role}</span>
        </span>
        {trade.plan_10b5_1 ? (
          <span
            className="oa-mono shrink-0 rounded border border-oa-border px-1 text-[9.5px] uppercase tracking-wider text-oa-muted-fg"
            title="Traded under a pre-arranged 10b5-1 plan"
          >
            Plan
          </span>
        ) : null}
      </span>
      {showSide ? (
        <span
          className={`oa-mono hidden text-[11px] uppercase tracking-[0.06em] md:block ${tone}`}
        >
          {buy ? "Buy" : "Sell"}
        </span>
      ) : null}
      <span
        className={`oa-mono order-1 text-right text-[13px] font-medium md:order-none ${tone}`}
      >
        {trade.value != null ? (
          fmtUsd(trade.value)
        ) : (
          <span className="text-oa-muted-fg">{fmtShares(trade.shares)} shares</span>
        )}
      </span>
      <span className="oa-mono hidden text-right text-[12.5px] text-oa-fg md:block">
        {fmtShares(trade.shares)}
      </span>
      <span className="oa-mono hidden text-right text-[12.5px] text-oa-fg md:block">
        {trade.price != null
          ? `$${trade.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : ""}
      </span>
      <span
        className="oa-mono hidden text-right text-[12px] text-oa-muted-fg md:block"
        title={
          trade.lag_days != null
            ? `Filed ${trade.lag_days} days after the trade`
            : undefined
        }
      >
        {fmtDate(trade.transaction_date, false)}
      </span>
    </li>
  );
}
