"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";
import type { TrumpLogicSnapshot } from "@/lib/trump-logic-types";
import {
  flattenTrumpLogicMentions,
  formatSincePct,
  formatTrumpLogicDate,
  splitTrumpLogicTableRows,
  type TrumpLogicTableRow,
} from "@/lib/trump-logic-format";

type Props = {
  data: TrumpLogicSnapshot | null;
  hideHeader?: boolean;
};

type SideTab = "bullish" | "bearish";

const SIDE_META: Record<
  SideTab,
  { label: string; color: string; bg: string; border: string }
> = {
  bullish: {
    label: "Bullish",
    color: "#047857",
    bg: "#ecfdf5",
    border: "#bbf7d0",
  },
  bearish: {
    label: "Bearish",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
};

function MentionTable({
  rows,
  side,
  showHeader = true,
}: {
  rows: TrumpLogicTableRow[];
  side: SideTab;
  showHeader?: boolean;
}) {
  const meta = SIDE_META[side];

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-4 py-10 text-center">
        <p className="text-[13px] text-[#9ca3af]">No {meta.label.toLowerCase()} mentions in this window.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
      {showHeader ? (
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: meta.border, background: meta.bg }}
        >
          <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[12px] font-medium tabular-nums text-[#6b7280]">
            {rows.length} mention{rows.length === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}

      <div className="max-h-[min(620px,70vh)] overflow-y-auto">
        <div className="flex flex-col divide-y divide-[#f3f4f6] lg:hidden">
          {rows.map((row) => {
            const since = formatSincePct(row.change_since_pct);
            const when = relativeTime(row.published_at);
            const dateLabel = formatTrumpLogicDate(row.published_at);
            return (
              <article key={row.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/stock/${encodeURIComponent(row.ticker)}`}
                    className="flex min-w-0 items-center gap-2.5 group"
                  >
                    <StockLogo ticker={row.ticker} market="US" size={34} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[15px] font-bold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                        {row.ticker}
                      </span>
                      {dateLabel || when || row.mention_count > 1 ? (
                        <span className="text-[12px] text-[#9ca3af]">
                          {[dateLabel, when, row.mention_count > 1 ? `${row.mention_count} posts` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                  {since ? (
                    <span
                      className="shrink-0 text-[15px] font-bold tabular-nums"
                      style={{ color: since.positive ? "#10b981" : "#ef4444" }}
                    >
                      {since.text}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                    What he said
                  </span>
                  <a
                    href={row.truth_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] leading-relaxed text-[#374151] hover:text-[#0052ff] hover:underline"
                  >
                    {row.said}
                  </a>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[360px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-[#f3f4f6] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af] shadow-[0_1px_0_#f3f4f6]">
              <th className="px-4 py-2.5 font-semibold">Stock</th>
              <th className="px-4 py-2.5 font-semibold">What he said</th>
              <th className="px-4 py-2.5 text-right font-semibold">Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const since = formatSincePct(row.change_since_pct);
              const when = relativeTime(row.published_at);
              const dateLabel = formatTrumpLogicDate(row.published_at);
              return (
                <tr
                  key={row.id}
                  className="border-b border-[#f3f4f6] last:border-b-0 align-top hover:bg-[#fafafa]"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/stock/${encodeURIComponent(row.ticker)}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <StockLogo ticker={row.ticker} market="US" size={28} />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13px] font-bold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                          {row.ticker}
                        </span>
                        {dateLabel || when || row.mention_count > 1 ? (
                          <span className="text-[11px] text-[#9ca3af]">
                            {[dateLabel, when, row.mention_count > 1 ? `${row.mention_count} posts` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[13px] leading-snug text-[#374151]">
                    <a
                      href={row.truth_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#0052ff] hover:underline"
                    >
                      {row.said}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {since ? (
                      <span
                        className="text-[13px] font-bold tabular-nums"
                        style={{ color: since.positive ? "#10b981" : "#ef4444" }}
                      >
                        {since.text}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export function TrumpLogicView({ data, hideHeader = false }: Props) {
  const [mobileTab, setMobileTab] = useState<SideTab>("bullish");

  const { bullish, bearish, allRows } = useMemo(() => {
    const mentions = data?.mentions?.length
      ? data.mentions
      : (data?.tickers ?? []).flatMap((row) => row.mentions);
    const allRows = flattenTrumpLogicMentions(mentions);
    return { ...splitTrumpLogicTableRows(allRows), allRows };
  }, [data]);

  if (!data || allRows.length === 0) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {!hideHeader ? (
          <>
            <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-on-surface md:text-[40px]">
              Trump Logic
            </h1>
            <p className="text-[15px] leading-relaxed text-on-surface-variant">
              Stocks Trump mentioned on Truth Social and how they moved after.
            </p>
          </>
        ) : (
          <p className="text-[15px] leading-relaxed text-on-surface-variant">
            Stocks Trump mentioned on Truth Social and how they moved after.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      {!hideHeader ? (
        <header className="flex max-w-2xl flex-col gap-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-on-surface md:text-[40px]">
            Trump Logic
          </h1>
          <p className="text-[15px] leading-relaxed text-on-surface-variant">
            Stocks Trump mentioned on Truth Social, split bullish vs bearish, with price change after each post.
          </p>
          {relativeTime(data.generated_at) ? (
            <p className="text-[12px] text-on-surface-variant">Updated {relativeTime(data.generated_at)}</p>
          ) : null}
        </header>
      ) : relativeTime(data.generated_at) ? (
        <p className="text-[12px] text-on-surface-variant">Updated {relativeTime(data.generated_at)}</p>
      ) : null}

      {/* Desktop: side-by-side tables */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <MentionTable rows={bullish} side="bullish" />
        <MentionTable rows={bearish} side="bearish" />
      </div>

      {/* Mobile: tabs */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div className="flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
          {(["bullish", "bearish"] as const).map((tab) => {
            const active = mobileTab === tab;
            const meta = SIDE_META[tab];
            const count = tab === "bullish" ? bullish.length : bearish.length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  active ? "bg-white shadow-sm" : "text-[#6b7280]"
                }`}
                style={active ? { color: meta.color } : undefined}
              >
                {meta.label}
                <span className="ml-1.5 tabular-nums text-[12px] font-medium text-[#9ca3af]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <MentionTable
          rows={mobileTab === "bullish" ? bullish : bearish}
          side={mobileTab}
          showHeader={false}
        />
      </div>
    </div>
  );
}
