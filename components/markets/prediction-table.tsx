"use client";

import * as React from "react";

import { ProbabilityBar, toneText } from "@/components/markets/widgets";
import {
  formatCompactNumber,
  formatCompactUsd,
  formatDay,
  formatProbability,
  formatProbabilityChange,
  predictionHref,
  type PredictionMarket,
  type PredictionOutcome,
} from "@/lib/markets-shared";

type SortKey = "order" | "probability" | "change" | "closes";

function leader(market: PredictionMarket): PredictionOutcome {
  if (market.kind === "binary") return market.outcomes[0];
  return [...market.outcomes].sort((a, b) => b.probability - a.probability)[0];
}

/** Volume over the last day in the venue's own unit: dollars on Polymarket, contracts on Kalshi. */
function dayVolume(market: PredictionMarket): string | null {
  if (market.volume_24h === null || market.volume_24h <= 0) return null;
  return market.volume_unit === "usd" ? formatCompactUsd(market.volume_24h) : `${formatCompactNumber(market.volume_24h)} ct`;
}

function sortValue(market: PredictionMarket, key: SortKey): number | null {
  if (key === "order") return market.order;
  if (key === "probability") return leader(market).probability;
  if (key === "change") {
    const change = leader(market).change_24h;
    return change === null ? null : Math.abs(change);
  }
  const closes = Date.parse(market.close_time ?? "");
  return Number.isNaN(closes) ? null : closes;
}

/** Every open prediction market we cover, sortable, with a topic filter. */
export function PredictionTable({ markets }: { markets: PredictionMarket[] }) {
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({ key: "order", desc: false });
  const [topic, setTopic] = React.useState("all");

  const topics = React.useMemo(() => [...new Set(markets.map((market) => market.topic))], [markets]);
  const rows = React.useMemo(() => {
    const filtered = topic === "all" ? markets : markets.filter((market) => market.topic === topic);
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (left === null && right === null) return a.order - b.order;
      if (left === null) return 1;
      if (right === null) return -1;
      return (sort.desc ? right - left : left - right) || a.order - b.order;
    });
  }, [markets, topic, sort]);

  function header(key: SortKey, label: string, title: string, className = "") {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"} className={`h-9 border-b border-oa-border bg-oa-bg p-0 font-normal ${className}`}>
        <button
          type="button"
          title={title}
          onClick={() => setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "closes" }))}
          className={`oa-mono inline-flex h-9 w-full cursor-pointer items-center justify-end gap-1 whitespace-nowrap px-2.5 text-[12.5px] uppercase tracking-[0.04em] outline-none transition-colors hover:text-oa-fg focus-visible:text-oa-fg ${
            active ? "text-oa-fg" : "text-oa-muted-fg"
          }`}
        >
          {label}
          <span aria-hidden="true" className={`text-[9px] ${active ? "opacity-100" : "opacity-0"}`}>
            {sort.desc ? "▼" : "▲"}
          </span>
        </button>
      </th>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-6 text-[14px] text-oa-muted-fg">
        No open prediction markets to show right now.
      </div>
    );
  }

  const plain = "oa-mono h-9 border-b border-oa-border bg-oa-bg px-2.5 text-[12.5px] font-normal uppercase tracking-[0.04em] text-oa-muted-fg";

  return (
    <div className="flex flex-col gap-3">
      {topics.length > 1 ? (
        <div role="group" aria-label="Filter by topic" className="flex flex-wrap gap-1.5">
          {["all", ...topics].map((item) => {
            const on = topic === item;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={on}
                onClick={() => setTopic(item)}
                className={`oa-mono h-7 cursor-pointer rounded-md border px-2 text-[12.5px] uppercase tracking-[0.06em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-ring ${
                  on ? "border-oa-primary bg-oa-primary text-oa-primary-fg" : "border-oa-border bg-oa-card text-oa-muted-fg hover:text-oa-fg"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th scope="col" className={`${plain} pl-3.5 text-left`}>
                  Market
                </th>
                <th scope="col" className={`${plain} text-left`}>
                  Leading outcome
                </th>
                {header("probability", "Odds", "Probability of the leading outcome")}
                {header("change", "24h", "Change in the leading outcome's probability over a day, largest first")}
                <th scope="col" className={`${plain} text-right`} title="Traded in the last day, in the venue's own unit">
                  Vol 24h
                </th>
                {header("closes", "Closes", "When trading closes", "pr-1")}
              </tr>
            </thead>
            <tbody>
              {rows.map((market) => {
                const top = leader(market);
                const change = formatProbabilityChange(top.change_24h);
                const tone = !change ? "flat" : (top.change_24h ?? 0) > 0 ? "up" : "down";
                return (
                  <tr key={market.id} className="group border-b border-oa-border last:border-b-0 hover:bg-oa-bg">
                    <th scope="row" className="max-w-[20rem] p-0 text-left font-normal">
                      <a href={predictionHref(market)} className="flex min-h-12 flex-col justify-center px-3.5 py-1.5 outline-none focus-visible:bg-oa-accent">
                        <span className="text-[14px] font-medium leading-[18px] text-oa-fg">{market.question}</span>
                        <span className="oa-mono text-[12.5px] uppercase leading-4 tracking-[0.06em] text-oa-muted-fg">
                          {market.topic} · {market.source_name}
                        </span>
                      </a>
                    </th>
                    <td className="w-[13rem] px-2.5">
                      <span className="flex flex-col gap-1">
                        <span className="truncate text-[14px] leading-4 text-oa-fg" title={top.label}>
                          {top.label}
                        </span>
                        <ProbabilityBar probability={top.probability} lead />
                      </span>
                    </td>
                    <td className="oa-mono whitespace-nowrap px-2.5 text-right font-medium tabular-nums text-oa-fg">{formatProbability(top.probability)}</td>
                    <td className={`oa-mono whitespace-nowrap px-2.5 text-right tabular-nums ${toneText(tone)}`}>{change ?? <span title="No change, or not reported">·</span>}</td>
                    <td className="oa-mono whitespace-nowrap px-2.5 text-right tabular-nums text-oa-muted-fg">{dayVolume(market) ?? "·"}</td>
                    <td className="oa-mono whitespace-nowrap px-3.5 text-right tabular-nums text-oa-muted-fg">{formatDay(market.close_time, true) || "·"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="oa-mono text-[12.5px] leading-4 text-oa-muted-fg">
        Volume is in each venue&apos;s own unit: US dollars on Polymarket, contracts (ct) on Kalshi. The two are not comparable, so the column does not sort.
      </p>
    </div>
  );
}
