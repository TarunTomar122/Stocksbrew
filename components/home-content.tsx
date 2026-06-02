"use client";

import Link from "next/link";
import { useState } from "react";
import type { NewsArticle } from "@/lib/news";
import { StockLogo } from "@/components/stock-logo";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";

type StockData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type Props = {
  stocks: StockData[];
  news: NewsArticle[];
  market?: "US" | "IN";
  /** Retained for compatibility with the home page; not used in the new design. */
  launchTickers?: string[];
};

type Filter = "Gainers" | "Losers";

const FILTERS: { id: Filter; color: string; arrow: string }[] = [
  { id: "Gainers", color: "#10b981", arrow: "▲" },
  { id: "Losers",  color: "#ef4444", arrow: "▼" },
];

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function StockRow({ stock, market }: { stock: StockData; market: "US" | "IN" }) {
  const { user } = useUser();
  const up = stock.changePct > 0;
  const down = stock.changePct < 0;
  const tone = up
    ? "bg-[#ecfdf5] text-[#10b981]"
    : down
      ? "bg-[#fef2f2] text-[#ef4444]"
      : "bg-[#f3f4f6] text-[#6b7280]";

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
    >
      <StockLogo ticker={stock.ticker} market={market} size={32} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] font-semibold text-[#111111] truncate">
          {stock.name}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.06em] text-[#6b7280] truncate">
          {stock.ticker}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[13px] font-semibold text-[#111111] tabular-nums">
          {fmtPrice(stock.price)}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
        >
          {up ? "▲" : down ? "▼" : "•"} {fmtPct(stock.changePct)}
        </span>
      </div>
      <button
        type="button"
        aria-label="Add to Radar"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!user) {
            signInWithGoogle().catch(console.error);
          }
        }}
        className="hidden sm:inline-flex text-[#9ca3af] hover:text-[#111111] transition-colors shrink-0"
      >
        <svg
          width="16"
          height="18"
          viewBox="0 0 16 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 1.5h12v15l-6-4-6 4v-15z" />
        </svg>
      </button>
    </Link>
  );
}

function NewsItem({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1.5 px-5 py-4 border-t border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
    >
      <span className="text-[13px] font-semibold text-[#111111] leading-snug line-clamp-3">
        {article.title}
      </span>
      <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-[#0052ff] truncate min-w-0">
        {article.source_name}
      </span>
    </a>
  );
}

export function HomeContent({ stocks, news, market = "US" }: Props) {
  const [activeFilter, setActiveFilter] = useState<Filter>("Gainers");

  const filteredStocks = stocks
    .filter((s) =>
      activeFilter === "Gainers" ? s.changePct > 0 : s.changePct < 0,
    )
    .sort((a, b) =>
      activeFilter === "Gainers"
        ? b.changePct - a.changePct
        : a.changePct - b.changePct,
    )
    .slice(0, 8);

  const displayNews = news.slice(0, 8);

  return (
    <>
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Today's stocks */}
      <div className="lg:col-span-2 flex flex-col rounded-[24px] border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-[16px] md:text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            Today's stocks
          </h2>
        </div>

        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          {FILTERS.map((f) => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  active
                    ? "bg-[#111111] text-white"
                    : "bg-white text-[#111111] border border-[#e5e7eb] hover:border-[#111111]"
                }`}
              >
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white"
                  style={{ background: f.color }}
                  aria-hidden
                >
                  {f.arrow}
                </span>
                {f.id}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_auto] gap-4 px-5 pt-3 pb-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
          <span>Stocks</span>
          <span className="text-right">Price</span>
          <span className="text-right">Change</span>
          <span className="w-4" aria-hidden />
        </div>

        <div className="flex flex-col">
          {filteredStocks.length > 0 ? (
            filteredStocks.map((stock) => (
              <StockRow key={stock.ticker} stock={stock} market={market} />
            ))
          ) : (
            <div className="border-t border-[#f3f4f6] py-12 text-center text-[13px] text-[#6b7280]">
              No {activeFilter.toLowerCase()} right now.
            </div>
          )}
        </div>
      </div>

      {/* Right: Latest News */}
      <div className="flex flex-col rounded-[24px] border border-[#e5e7eb] bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <Link
            href="/news"
            className="group inline-flex items-center gap-1.5 rounded-lg -mx-1 px-1 py-0.5 hover:bg-[#f8f9fa] transition-colors"
          >
            <h2 className="text-[16px] md:text-[18px] font-semibold text-[#111111] tracking-[-0.01em] group-hover:text-[#0052ff] transition-colors">
              Latest news
            </h2>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[#9ca3af] group-hover:text-[#0052ff] transition-colors"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </div>
        <div className="flex flex-col">
          {displayNews.length > 0 ? (
            displayNews.map((article) => (
              <NewsItem key={article.id} article={article} />
            ))
          ) : (
            <div className="border-t border-[#f3f4f6] py-12 text-center text-[13px] text-[#6b7280]">
              No recent news.
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  );
}
