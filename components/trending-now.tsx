"use client";

import Link from "next/link";
import { useRef, useState, useEffect, useCallback } from "react";

import { StockLogo } from "@/components/stock-logo";

export type TrendingStock = { ticker: string; name: string; price: number; changePct: number };

function money(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TrendingNow({ stocks }: { stocks: TrendingStock[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, stocks.length]);

  if (stocks.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <section className="border-b border-outline-variant pb-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Top traded stocks</h2>
        {canScrollLeft || canScrollRight ? (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Scroll left"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface disabled:opacity-30 enabled:hover:bg-surface-container-low"
            >
              <span className="leading-none" style={{ transform: "translateY(-1px)" }}>‹</span>
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              disabled={!canScrollRight}
              onClick={() => scrollBy(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface disabled:opacity-30 enabled:hover:bg-surface-container-low"
            >
              <span className="leading-none" style={{ transform: "translateY(-1px)" }}>›</span>
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        onScroll={updateArrows}
        className="mt-5 -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {stocks.map((stock) => {
          const up = stock.changePct >= 0;
          return (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              className="flex w-40 shrink-0 flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4 hover:bg-surface-container-low sm:w-44"
            >
              <div className="flex items-center gap-2">
                <StockLogo ticker={stock.ticker} market="US" size={28} />
                <div className="min-w-0">
                  <p className="text-[16px] font-bold text-on-surface">{stock.ticker}</p>
                  <p className="truncate text-[13px] text-on-surface-variant">{stock.name}</p>
                </div>
              </div>
              <div>
                <p className="text-[18px] font-bold tabular-nums text-on-surface">${money(stock.price)}</p>
                <p
                  className="text-[14px] font-semibold tabular-nums"
                  style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                >
                  {up ? "▲" : "▼"} {Math.abs(stock.changePct).toFixed(2)}%
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
