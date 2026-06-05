"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TrumpLogicMention, TrumpLogicSnapshot, TrumpLogicTickerRow } from "@/lib/trump-logic-types";
import {
  formatSincePct,
  sortTrumpLogicTickers,
  TRUMP_LOGIC_SORT_OPTIONS,
  type TrumpLogicSortKey,
} from "@/lib/trump-logic-format";
import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";

type Props = {
  data: TrumpLogicSnapshot | null;
};

const SENTIMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  bullish: { label: "Bullish", color: "#10b981", bg: "#ecfdf5" },
  bearish: { label: "Bearish", color: "#ef4444", bg: "#fef2f2" },
  mixed: { label: "Mixed", color: "#b45309", bg: "#fffbeb" },
  neutral: { label: "Neutral", color: "#6b7280", bg: "#f9fafb" },
};

function sentimentMeta(s: string) {
  return SENTIMENT_META[s?.toLowerCase()] ?? SENTIMENT_META.neutral;
}

function cardSentiment(row: TrumpLogicTickerRow) {
  if (row.bullish_count > 0 && row.bearish_count > 0) {
    return SENTIMENT_META.mixed;
  }
  return sentimentMeta(row.latest_sentiment);
}

function MentionLine({ mention, ticker }: { mention: TrumpLogicMention; ticker: string }) {
  const meta = sentimentMeta(mention.sentiment);
  const move = mention.ticker_moves?.find((row) => row.ticker === ticker);
  const since = formatSincePct(move?.change_since_pct);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-[#f3f4f6] bg-[#fafafa] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9ca3af]">
        <span>{relativeTime(mention.published_at) || "recent"}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.label}
        </span>
        {since ? (
          <span
            className="ml-auto text-[11px] font-bold tabular-nums"
            style={{ color: since.positive ? "#10b981" : "#ef4444" }}
          >
            {since.text}
          </span>
        ) : null}
      </div>
      <p className="text-[13px] leading-snug text-[#374151]">{mention.said}</p>
      <a
        href={mention.truth_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] font-medium text-[#9ca3af] hover:text-[#0052ff] hover:underline"
      >
        Source
      </a>
    </div>
  );
}

function TickerRow({ row }: { row: TrumpLogicTickerRow }) {
  const [open, setOpen] = useState(false);
  const meta = cardSentiment(row);
  const since = formatSincePct(row.latest_change_since_pct);

  return (
    <article className="rounded-[20px] border border-[#e5e7eb] bg-white overflow-hidden shadow-sm">
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Link
            href={`/stock/${encodeURIComponent(row.ticker)}`}
            className="flex min-w-0 flex-1 items-start gap-3 group"
          >
            <StockLogo ticker={row.ticker} market="US" size={36} />
            <div className="min-w-0 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-bold tracking-[-0.02em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
                  {row.ticker}
                </span>
                <span className="text-[12px] font-semibold text-[#9ca3af]">
                  {row.mention_count} mention{row.mention_count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-[#374151] line-clamp-2">
                {row.latest_said}
              </p>
              <p className="text-[11px] text-[#9ca3af]">
                Latest {relativeTime(row.latest_published_at)}
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: meta.bg, color: meta.color }}
            >
              {meta.label}
            </span>
            {since ? (
              <span
                className="text-[13px] font-bold tabular-nums"
                style={{ color: since.positive ? "#10b981" : "#ef4444" }}
              >
                {since.text}
              </span>
            ) : null}
          </div>
        </div>

        {row.mentions.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="self-start text-[12px] font-semibold text-[#0052ff] hover:underline"
          >
            {open ? "Hide mentions" : `Show all ${row.mentions.length} mentions`}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-[#f3f4f6] bg-[#fcfcfc] p-4 md:p-5">
          {row.mentions.map((mention) => (
            <MentionLine key={`${mention.post_id}-${row.ticker}`} mention={mention} ticker={row.ticker} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function TrumpLogicView({ data }: Props) {
  const [sortKey, setSortKey] = useState<TrumpLogicSortKey>("mentions");
  const rows = useMemo(
    () => sortTrumpLogicTickers(data?.tickers ?? [], sortKey),
    [data?.tickers, sortKey],
  );

  if (!data || rows.length === 0) {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.03em] text-[#111111]">
          Trump Logic
        </h1>
        <p className="text-[15px] text-[#6b7280] leading-relaxed">
          Ticker index of @realDonaldTrump Truth Social mentions — which stocks he talked about,
          bullish or bearish, and how they moved since. Updated daily.
        </p>
      </div>
    );
  }

  const bullishTickers = rows.filter((r) => r.latest_sentiment === "bullish").length;
  const bearishTickers = rows.filter((r) => r.latest_sentiment === "bearish").length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.03em] text-[#111111]">
            Trump Logic
          </h1>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
            style={{ background: "#eff6ff", color: "#0052ff" }}
          >
            Ticker index
          </span>
        </div>
        <p className="text-[15px] text-[#6b7280] leading-relaxed max-w-3xl">
          Stocks Trump mentioned on Truth Social — bullish/bearish reads and price change since each
          mention.
          {data.lookback_days ? <> Last {data.lookback_days} days.</> : null}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#9ca3af]">
          <span>
            {data.ticker_count} tickers from {data.posts_scanned} posts scanned
          </span>
          {relativeTime(data.generated_at) ? (
            <span>Updated {relativeTime(data.generated_at)}</span>
          ) : null}
          <span style={{ color: "#10b981" }}>{bullishTickers} bullish</span>
          <span style={{ color: "#ef4444" }}>{bearishTickers} bearish</span>
        </div>
        {data.source_note ? (
          <p className="text-[11px] text-[#9ca3af] leading-relaxed max-w-3xl">{data.source_note}</p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
          Sort
        </span>
        {TRUMP_LOGIC_SORT_OPTIONS.map((option) => {
          const active = sortKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                active
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#111111]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <TickerRow key={row.ticker} row={row} />
        ))}
      </div>
    </div>
  );
}
