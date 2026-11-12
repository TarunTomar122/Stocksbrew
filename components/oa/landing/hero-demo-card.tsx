"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { periodChange, sparkGeometry, type HeroDemoStock } from "@/lib/landing-hero-demo";
import { CALL_PLAIN } from "@/lib/plain-copy";

/**
 * The demo card itself (components/oa/landing/hero-demo.tsx loads it): one stock at a time, with small logo tabs to
 * flip between today's stand-outs. Every stock's data is already here, so a flip is instant.
 */

const CALL_CHIP: Record<HeroDemoStock["call"], string> = {
  Add: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  Hold: "bg-oa-accent text-oa-fg",
  Trim: "bg-amber-500/15 text-amber-900 dark:text-amber-300",
};

const WHY_LABEL: Record<HeroDemoStock["call"], string> = { Add: "Why buy more", Hold: "Why keep it", Trim: "Why sell some" };

function signedPct(pct: number, digits = 1): string {
  const shown = Number(pct.toFixed(digits));
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(digits)}%`;
}

const tone = (pct: number | null) => (pct == null || Math.abs(pct) < 0.05 ? "text-oa-muted-fg" : pct > 0 ? "text-signal-bullish" : "text-signal-bearish");

function fmtPrice(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtWhole(value: number): string {
  return `$${value >= 100 ? Math.round(value).toLocaleString("en-US") : value.toFixed(2)}`;
}

/** Three months of closes; the call's own level, when it is near, as a dashed line with its price at the end. */
function Sparkline({ closes, level }: { closes: number[]; level: number | null }) {
  const { points, levelY } = sparkGeometry(closes, level);
  if (!points) return null;
  const change = periodChange(closes);
  const stroke = change == null || change >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return (
    <div className="relative">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" className="h-20 w-full overflow-visible">
        {levelY != null ? (
          <line x1="0" x2="100" y1={levelY} y2={levelY} stroke="var(--oa-muted-fg)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" opacity="0.6" />
        ) : null}
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {levelY != null && level != null ? (
        <span
          aria-hidden="true"
          className="absolute left-0 -translate-y-1/2 rounded bg-oa-card pr-1.5 text-[11px] font-medium leading-4 tabular-nums text-oa-muted-fg"
          style={{ top: `${(levelY / 40) * 100}%` }}
        >
          {fmtWhole(level)}
        </span>
      ) : null}
    </div>
  );
}

export function HeroDemoCard({ stocks, stamps }: { stocks: HeroDemoStock[]; stamps: string[] }) {
  const [index, setIndex] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const stock = stocks[index] ?? stocks[0];
  if (!stock) return null;

  const top = stocks.reduce((most, item) => Math.max(most, Math.abs(item.dayPct ?? 0)), 0);
  const stamp = stamps[index] ?? stamps[0] ?? "";
  // "Stood out" only when something did; a quiet day still shows the stocks, without the claim.
  // The stamp carries the day when it is not today ("Nov 11, 3:59 PM ET"), so the title only says "today" when it is.
  const today = !stamp.includes(",");
  const title = top >= 1.5 ? (today ? "What stood out today" : "What stood out") : today ? "Our calls today" : "Our calls";
  const change = periodChange(stock.closes);

  const select = (next: number) => {
    const wrapped = (next + stocks.length) % stocks.length;
    setIndex(wrapped);
    tabs.current[wrapped]?.focus();
  };

  return (
    <figure className="w-full">
      <div className="oa-surface w-full border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-oa-fg/80">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {title}
          </p>
          {stamp ? (
            <p className="shrink-0 text-[13px] tabular-nums text-oa-muted-fg">
              {stamp}
            </p>
          ) : null}
        </div>

        {stocks.length > 1 ? (
          <div role="tablist" aria-label="Stocks" className={`mt-3 grid gap-1.5 ${stocks.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {stocks.map((item, i) => {
              const selected = i === index;
              return (
                <button
                  key={item.ticker}
                  ref={(node) => {
                    tabs.current[i] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${i}`}
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setIndex(i)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") select(i + 1);
                    else if (event.key === "ArrowLeft") select(i - 1);
                  }}
                  className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border px-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-fg/20 ${
                    selected ? "border-oa-fg/25 bg-oa-accent" : "border-oa-border bg-transparent hover:bg-oa-accent"
                  }`}
                >
                  <StockLogo ticker={item.ticker} size={22} circle eager />
                  <span className="oa-mono text-[13px] font-semibold text-oa-fg">{item.ticker}</span>
                  {item.dayPct != null ? <span className={`oa-mono hidden text-[12px] tabular-nums min-[400px]:inline lg:hidden xl:inline ${tone(item.dayPct)}`}>{signedPct(item.dayPct)}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div role={stocks.length > 1 ? "tabpanel" : undefined} id={`${id}-panel`} aria-labelledby={stocks.length > 1 ? `${id}-tab-${index}` : undefined} className="mt-4">
          <Link
            prefetch={false}
            href={`/stock/${encodeURIComponent(stock.ticker)}`}
            className="flex items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-oa-fg/20"
          >
            <span className="flex min-w-0 items-center gap-3">
              <StockLogo ticker={stock.ticker} size={40} circle eager />
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-medium leading-6 text-oa-fg">{stock.name}</span>
                <span className="oa-mono block text-[13px] leading-5 text-oa-muted-fg">{stock.ticker}</span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[22px] font-medium leading-7 tabular-nums text-oa-fg">{fmtPrice(stock.price)}</span>
              {stock.dayPct != null ? <span className={`block text-[14px] font-medium leading-5 tabular-nums ${tone(stock.dayPct)}`}>{signedPct(stock.dayPct, 2)} today</span> : null}
            </span>
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-semibold ${CALL_CHIP[stock.call]}`}>{CALL_PLAIN[stock.call]}</span>
            {stock.level ? (
              <span className="text-[14px] leading-5 text-oa-muted-fg">
                {stock.level.label} <span className="font-medium tabular-nums text-oa-fg">{fmtWhole(stock.level.price)}</span>
              </span>
            ) : null}
          </div>

          {/* Two lines kept for the reason on every stock, so flipping never makes the card jump. */}
          <p className="mt-3 line-clamp-2 min-h-[48px] text-pretty text-[15px] leading-6 text-oa-fg/85">
            {stock.why ? (
              <>
                <span className="font-medium text-oa-fg">{WHY_LABEL[stock.call]}: </span>
                {stock.why}
              </>
            ) : null}
          </p>

          {stock.closes.length > 1 ? (
            <div className="mt-3">
              <Sparkline closes={stock.closes} level={stock.level?.price ?? null} />
              <p className="mt-1.5 flex justify-between gap-3 text-[13px] leading-5 text-oa-muted-fg">
                <span>Last 3 months</span>
                {change != null ? <span className={`tabular-nums ${tone(change)}`}>{signedPct(change)}</span> : null}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              prefetch={false}
              href={`/agents?watch=${encodeURIComponent(stock.ticker)}`}
              data-track="landing_cta_clicked"
              data-track-surface="hero_watch"
              className="inline-flex h-11 items-center rounded-full bg-oa-fg px-5 text-[15px] font-medium text-oa-page outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-oa-fg/30"
            >
              Watch {stock.ticker} for me
            </Link>
            <Link
              prefetch={false}
              href={`/stock/${encodeURIComponent(stock.ticker)}`}
              className="text-[15px] font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg"
            >
              Our full view
            </Link>
          </div>
        </div>
      </div>
    </figure>
  );
}
