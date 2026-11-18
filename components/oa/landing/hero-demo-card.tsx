"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { NavIcon } from "@/components/oa/nav-icon";
import { PLACES } from "@/components/oa/nav-items";
import { StockLogo } from "@/components/stock-logo";
import { StocksbrewLogo } from "@/components/stocksbrew-logo";
import { periodChange, sparkGeometry, type HeroDemoStock } from "@/lib/landing-hero-demo";
import { CALL_PLAIN } from "@/lib/plain-copy";

/**
 * The demo itself (components/oa/landing/hero-demo.tsx loads it), drawn as a window of the app under the centred hero
 * (council, Nov 18, after tradytics: show the product, not a widget). From lg a quiet sidebar of the app's real places sits
 * on the left, Research lit; the stock's call, why and three months of closes fill the rest. One stock at a time, with
 * logo tabs to flip between today's stand-outs. Every stock's data is already here, so a flip is instant.
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
function Sparkline({ closes, level, className = "h-20" }: { closes: number[]; level: number | null; className?: string }) {
  const { points, levelY } = sparkGeometry(closes, level);
  if (!points) return null;
  const change = periodChange(closes);
  const stroke = change == null || change >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return (
    <div className="relative">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" className={`${className} w-full overflow-visible`}>
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

  const tablist =
    stocks.length > 1 ? (
      <div role="tablist" aria-label="Stocks" className={`grid gap-1.5 ${stocks.length === 2 ? "grid-cols-2" : "grid-cols-3"} sm:flex`}>
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
              className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full border px-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-oa-fg/20 sm:pl-1.5 sm:pr-3 ${
                selected ? "border-oa-fg/25 bg-oa-accent" : "border-oa-border bg-transparent hover:bg-oa-accent"
              }`}
            >
              <StockLogo ticker={item.ticker} size={22} circle eager />
              <span className="oa-mono text-[13px] font-semibold text-oa-fg">{item.ticker}</span>
              {/* Not on the open tab: its move is said under the price (owner rule 1). */}
              {item.dayPct != null && !selected ? <span className={`oa-mono hidden text-[12px] tabular-nums min-[400px]:inline ${tone(item.dayPct)}`}>{signedPct(item.dayPct)}</span> : null}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <figure className="w-full">
      <WindowFrame>
        {/* The window's top bar: what this screen is and when its prices are from, the stock tabs on the right. */}
        <div className="flex flex-col gap-3 border-b border-oa-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-start">
            <p className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-oa-fg/80">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              {title}
            </p>
            {stamp ? <p className="shrink-0 text-[13px] tabular-nums text-oa-muted-fg">{stamp}</p> : null}
          </div>
          {tablist}
        </div>

        <div
          role={stocks.length > 1 ? "tabpanel" : undefined}
          id={`${id}-panel`}
          aria-labelledby={stocks.length > 1 ? `${id}-tab-${index}` : undefined}
          // On a phone: the stock, its chart, then the buttons. From lg the chart takes the right column beside both.
          className={`grid gap-5 p-4 sm:p-6 lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-5 lg:p-8 ${
            stock.closes.length > 1 ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : "lg:max-w-xl"
          }`}
        >
          <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-1">
            <Link
              prefetch={false}
              href={`/stock/${encodeURIComponent(stock.ticker)}`}
              className="flex items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-oa-fg/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <StockLogo ticker={stock.ticker} size={44} circle eager />
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-balance text-[18px] font-medium leading-6 text-oa-fg">{stock.name}</span>
                  <span className="oa-mono block text-[13px] leading-5 text-oa-muted-fg">{stock.ticker}</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[24px] font-medium leading-7 tabular-nums text-oa-fg">{fmtPrice(stock.price)}</span>
                {stock.dayPct != null ? <span className={`block text-[14px] font-medium leading-5 tabular-nums ${tone(stock.dayPct)}`}>{signedPct(stock.dayPct, 2)} today</span> : null}
              </span>
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-[15px] font-semibold ${CALL_CHIP[stock.call]}`}>{CALL_PLAIN[stock.call]}</span>
              {stock.level ? (
                <span className="text-[14px] leading-5 text-oa-muted-fg">
                  {stock.level.label} <span className="font-medium tabular-nums text-oa-fg">{fmtWhole(stock.level.price)}</span>
                </span>
              ) : null}
            </div>

            {/* Two lines kept for the reason on every stock, so flipping never makes the window jump. */}
            <p className="mt-3 line-clamp-2 min-h-[48px] text-pretty text-[15px] leading-6 text-oa-fg/85">
              {stock.why ? (
                <>
                  <span className="font-medium text-oa-fg">{WHY_LABEL[stock.call]}: </span>
                  {stock.why}
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-start-1 lg:row-start-2 lg:self-end">
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

          {stock.closes.length > 1 ? (
            <div className="row-start-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:justify-end">
              <Sparkline closes={stock.closes} level={stock.level?.price ?? null} className="h-28 sm:h-36 lg:h-48" />
              <p className="mt-2 flex justify-between gap-3 text-[13px] leading-5 text-oa-muted-fg">
                <span>Last 3 months</span>
                {change != null ? <span className={`tabular-nums ${tone(change)}`}>{signedPct(change)}</span> : null}
              </p>
            </div>
          ) : null}
        </div>
      </WindowFrame>
    </figure>
  );
}

/**
 * The app window around the demo: a raised panel with a soft long shadow, and from lg the app's sidebar, drawn from
 * the real places (components/oa/nav-items.ts) with Research lit, since the screen is a stock's call. The sidebar is a
 * picture of the app, so it is hidden from screen readers and not clickable; the header above has the real links.
 */
export function WindowFrame({ children }: { children: React.ReactNode }) {
  const lit = PLACES.find((place) => place.label === "Research");
  return (
    <div className="flex overflow-hidden rounded-[20px] border border-oa-border bg-oa-card text-left shadow-[0_40px_90px_-50px_rgba(58,42,16,0.55)] dark:shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)]">
      <div aria-hidden="true" className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-oa-border bg-oa-bg p-3 lg:flex">
        <span className="flex h-9 items-center px-2">
          <StocksbrewLogo markSize={18} wordmarkClassName="text-[14px] font-medium tracking-tight" />
        </span>
        <span className="mb-2 mt-1 flex h-8 items-center gap-2 rounded-lg border border-oa-border bg-oa-card px-2.5 text-[13px] text-oa-muted-fg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5 shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search
          <span className="oa-mono ml-auto text-[11px]">⌘K</span>
        </span>
        {PLACES.map((place) => {
          const on = place === lit;
          return (
            <span key={place.href} className="flex flex-col">
              <span className={`flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13.5px] ${on ? "bg-oa-accent font-medium text-oa-fg" : "text-oa-muted-fg"}`}>
                <NavIcon name={place.icon} className="size-4 shrink-0" />
                {place.label}
              </span>
              {on
                ? place.sections.slice(0, 3).map((item) => (
                    <span key={item.href} className="flex h-7 items-center pl-8 text-[13px] text-oa-muted-fg">
                      {item.label}
                    </span>
                  ))
                : null}
            </span>
          );
        })}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
