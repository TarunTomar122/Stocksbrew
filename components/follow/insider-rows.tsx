import * as React from "react";

import { DOWN, ExternalLink, Ticker, UP } from "@/components/follow/bits";
import {
  fmtDate,
  fmtFiledAt,
  fmtShares,
  fmtUsd,
  type InsiderCluster,
  type InsiderTrade,
} from "@/lib/follow-shared";

/** One stock where several insiders bought close together. */
export function ClusterCard({ cluster }: { cluster: InsiderCluster }) {
  const span =
    cluster.first_date === cluster.last_date
      ? fmtDate(cluster.last_date, false)
      : `${fmtDate(cluster.first_date, false)} to ${fmtDate(cluster.last_date, false)}`;
  return (
    <div className="oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex min-w-0 items-baseline gap-2">
          <Ticker ticker={cluster.symbol} logo={18} className="text-[15px]" />
          <span className="truncate text-[13px] text-oa-muted-fg">
            {cluster.company}
          </span>
        </p>
        <span className={`oa-mono shrink-0 text-[13px] font-medium ${UP}`}>
          {cluster.total_value != null ? fmtUsd(cluster.total_value) : ""}
        </span>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-oa-fg">
        {cluster.insiders} insiders bought, {span}.
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
            <span className="oa-mono shrink-0 text-oa-muted-fg">
              {member.value != null
                ? fmtUsd(member.value)
                : `${fmtShares(member.shares)} sh`}
            </span>
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
 * Cluster buys as a ranked list: one line per stock, the insiders behind a
 * click. The first few are shown; the rest open with one control.
 */
export function ClusterRows({ clusters, first = 3 }: { clusters: InsiderCluster[]; first?: number }) {
  const row = (cluster: InsiderCluster) => {
    const span =
      cluster.first_date === cluster.last_date
        ? fmtDate(cluster.last_date, false)
        : `${fmtDate(cluster.first_date, false)} to ${fmtDate(cluster.last_date, false)}`;
    return (
      <li key={cluster.symbol} className="border-b border-oa-border last:border-b-0">
        <details className="group">
          <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 px-4 py-2 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto_1rem] [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-baseline gap-2 sm:col-start-1 sm:row-start-1">
              <Ticker ticker={cluster.symbol} className="text-[14px]" />
              <span className="truncate text-[14px] text-oa-muted-fg">{cluster.company}</span>
            </span>
            <span className="col-span-3 row-start-2 text-[13px] leading-5 text-oa-muted-fg sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-[14px] sm:text-oa-fg">
              {cluster.insiders} insiders bought, {span}
            </span>
            <span className={`oa-mono text-right text-[14px] font-medium sm:col-start-3 sm:row-start-1 ${UP}`}>
              {cluster.total_value != null ? fmtUsd(cluster.total_value) : ""}
            </span>
            <span aria-hidden="true" className="sm:col-start-4 sm:row-start-1 text-[12.5px] text-oa-muted-fg transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="space-y-1 border-t border-oa-border bg-oa-bg px-4 py-2.5">
            {cluster.members.map((member) => (
              <li key={`${member.insider}-${member.role}`} className="flex max-w-xl items-baseline justify-between gap-3 text-[13px] leading-5">
                <span className="min-w-0 truncate">
                  <span className="text-oa-fg">{member.insider}</span>
                  <span className="text-oa-muted-fg"> · {member.role}</span>
                </span>
                <span className="oa-mono shrink-0 text-oa-muted-fg">
                  {member.value != null ? fmtUsd(member.value) : `${fmtShares(member.shares)} sh`}
                </span>
              </li>
            ))}
            {cluster.insiders > cluster.members.length ? (
              <li className="text-[12.5px] text-oa-muted-fg">and {cluster.insiders - cluster.members.length} more</li>
            ) : null}
          </ul>
        </details>
      </li>
    );
  };
  return (
    <>
      <ul>{clusters.slice(0, first).map(row)}</ul>
      {clusters.length > first ? (
        <details className="group/more border-t border-oa-border">
          <summary className="flex min-h-10 cursor-pointer list-none items-center px-4 text-[14px] font-medium text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent group-open/more:hidden [&::-webkit-details-marker]:hidden">
            Show {clusters.length - first} more
          </summary>
          <ul>{clusters.slice(first).map(row)}</ul>
        </details>
      ) : null}
    </>
  );
}

const TRADE_GRID =
  "md:grid-cols-[122px_58px_minmax(150px,1.4fr)_52px_78px_72px_80px_86px_56px]";

export function InsiderTableHead() {
  const cell = "oa-caption";
  return (
    <div
      className={`hidden h-9 items-center gap-x-3 border-b border-oa-border bg-oa-bg px-4 md:grid ${TRADE_GRID}`}
    >
      <span className={cell}>Filed</span>
      <span className={cell}>Stock</span>
      <span className={cell}>Insider</span>
      <span className={cell}>Side</span>
      <span className={`${cell} text-right`}>Value</span>
      <span className={`${cell} text-right`}>Shares</span>
      <span className={`${cell} text-right`}>Avg price</span>
      <span className={`${cell} text-right`}>Traded</span>
      <span className={`${cell} text-right`}>Form 4</span>
    </div>
  );
}

/** One insider's buys or sells in one filing. */
export function InsiderRow({ trade }: { trade: InsiderTrade }) {
  const buy = trade.tx_type === "buy";
  const tone = buy ? UP : DOWN;
  const lag =
    trade.lag_days != null && trade.lag_days > 2
      ? ` · ${trade.lag_days}d late to file`
      : "";
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 md:min-h-[44px] md:py-1.5 ${TRADE_GRID}`}
    >
      <span
        className="oa-mono order-3 col-span-2 text-[11.5px] text-oa-muted-fg md:order-none md:col-span-1 md:text-[12px]"
        title={`Filed ${trade.filed_at} US Eastern`}
      >
        <span className="md:hidden">Filed </span>
        {fmtFiledAt(trade.filed_at).replace(" ET", "")}
        <span className="md:hidden">
          , traded {fmtDate(trade.transaction_date, false)}
          {lag}
          {" · "}
          <ExternalLink href={trade.url}>Form 4</ExternalLink>
        </span>
      </span>
      <span className="order-1 flex min-w-0 items-baseline gap-2 md:order-none">
        <Ticker ticker={trade.symbol} className="text-[13.5px]" />
        <span
          className={`oa-mono text-[10.5px] uppercase tracking-[0.06em] md:hidden ${tone}`}
        >
          {buy ? "Bought" : "Sold"}
        </span>
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
      <span
        className={`oa-mono hidden text-[11px] uppercase tracking-[0.06em] md:block ${tone}`}
      >
        {buy ? "Buy" : "Sell"}
      </span>
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
      <span className="hidden text-right text-[12px] text-oa-muted-fg md:block">
        <ExternalLink href={trade.url}>SEC</ExternalLink>
      </span>
    </li>
  );
}
