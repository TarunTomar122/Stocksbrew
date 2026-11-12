"use client";

import Link from "next/link";

import { Verdict } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import type { PortfolioReadResult, ReadCall, ReadStock } from "@/lib/import/read-shared";
import { dayWords } from "@/lib/day-words";
import { CALL_MEANING, CALL_PLAIN } from "@/lib/plain-copy";

const NUM = "oa-mono tabular-nums";

/** Muted, distinct fills for the sector bar, in order of size. Copper leads. */
const SECTOR_FILLS = [
  "var(--oa-primary)",
  "color-mix(in srgb, var(--oa-primary) 62%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 55%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-primary) 34%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 30%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 16%, var(--oa-card))",
];

const CALL_TONE: Record<ReadCall, "up" | "flat" | "down"> = { Add: "up", Hold: "flat", Trim: "down" };

function fmtPct(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

function fmtMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1000 ? 0 : 2 });
}

export function fmtDayShort(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function whenReports(item: { days: number; time: "bmo" | "amc" | null }): string {
  const day = item.days === 0 ? "Today" : item.days === 1 ? "Tomorrow" : `In ${item.days} days`;
  return item.time === "bmo" ? `${day}, before the open` : item.time === "amc" ? `${day}, after the close` : day;
}

function SectorMix({ result }: { result: PortfolioReadResult }) {
  const slices = result.sectors.filter((slice) => slice.pct > 0);
  if (slices.length === 0) return null;
  // Six colours; anything smaller is grouped so the bar stays readable.
  const shown = slices.slice(0, 5);
  const rest = slices.slice(5);
  const all = rest.length
    ? [...shown, { sector: `${rest.length} more ${rest.length === 1 ? "sector" : "sectors"}`, pct: rest.reduce((sum, s) => sum + s.pct, 0), tickers: rest.flatMap((s) => s.tickers) }]
    : shown;
  return (
    <section aria-label="Sector mix" className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="oa-label">Where your money sits</h2>
        <p className="text-[12.5px] text-oa-muted-fg">{result.weighting === "value" ? "By value" : "Each stock counted once"}</p>
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-oa-bg" role="img" aria-label={all.map((s) => `${s.sector} ${Math.round(s.pct)}%`).join(", ")}>
        {all.map((slice, index) => (
          <span key={slice.sector} style={{ width: `${slice.pct}%`, background: SECTOR_FILLS[index] }} className="h-full border-r border-oa-card last:border-r-0" />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {all.map((slice, index) => (
          <li key={slice.sector} className="flex min-w-0 items-baseline gap-2 text-[13px] leading-5">
            <span className="mt-[5px] size-2.5 shrink-0 self-start rounded-sm" style={{ background: SECTOR_FILLS[index] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-pretty text-oa-fg">
              {slice.sector} <span className="oa-mono text-[12px] text-oa-muted-fg">{slice.tickers.join(" ")}</span>
            </span>
            <span className={`${NUM} shrink-0 text-oa-fg`}>{Math.round(slice.pct)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StockRow({ stock, today }: { stock: ReadStock; today: string }) {
  const days = stock.earnings_date ? Math.round((Date.parse(`${stock.earnings_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
      <Link href={`/stock/${encodeURIComponent(stock.ticker)}`} prefetch={false} className="flex min-w-0 items-center gap-2.5 rounded hover:underline">
        <StockLogo ticker={stock.ticker} size={24} circle className="shrink-0" />
        <span className="min-w-0">
          <span className="oa-mono block text-[14px] font-medium leading-5 text-oa-fg">{stock.ticker}</span>
          <span className="block text-pretty text-[12.5px] leading-4 text-oa-muted-fg">{stock.name}</span>
        </span>
      </Link>
      <div className="flex flex-col items-end gap-0.5 text-right">
        {stock.price !== null ? <span className={`${NUM} text-[14px] leading-5 text-oa-fg`}>{fmtMoney(stock.price)}</span> : null}
        {stock.day_pct !== null ? (
          <span className={`${NUM} text-[12.5px] leading-4 ${stock.day_pct > 0 ? "text-signal-bullish" : stock.day_pct < 0 ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
            {fmtPct(stock.day_pct)} today
          </span>
        ) : null}
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:pl-[2.125rem]">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          {stock.call ? (
            <Verdict tone={CALL_TONE[stock.call]} className="mt-[1px]">
              {CALL_PLAIN[stock.call]}
            </Verdict>
          ) : null}
          <p className="min-w-0 flex-1 text-pretty text-[14px] leading-5 text-oa-fg">
            {stock.call ? stock.reason ?? `${CALL_MEANING[stock.call]}${stock.call_at ? `, our call since ${dayWords(stock.call_at.slice(0, 10), today) || fmtDayShort(stock.call_at)}` : ""}.` : "We do not have a call on this one yet."}
          </p>
        </div>
        <p className="text-[12.5px] leading-4 text-oa-muted-fg">
          {[stock.sector, stock.earnings_date && days !== null ? `Reports ${dayWords(stock.earnings_date, today) || fmtDayShort(stock.earnings_date)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </li>
  );
}

/** "Nov 12, 4:05 PM ET", or null for a missing or broken time. Kept here so this client file does not pull in the kit. */
function stampET(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;
}

/**
 * What we think of a pasted portfolio: where the money sits, then each stock
 * with our call and why, then what reports soon.
 */
export function PortfolioReadView({
  result,
  stocks,
  today,
  unknown,
}: {
  result: PortfolioReadResult;
  stocks: ReadStock[];
  today: string;
  /** Tickers we do not cover, said once at the bottom. */
  unknown: string[];
}) {
  // Trims first, then adds, then holds: the ones that need a decision lead.
  const order: Record<string, number> = { Trim: 0, Add: 1, Hold: 2 };
  const sorted = [...stocks].sort((a, b) => (order[a.call ?? ""] ?? 3) - (order[b.call ?? ""] ?? 3) || a.ticker.localeCompare(b.ticker));
  const asOf = stampET(result.asOf);
  return (
    <div className="flex flex-col gap-3">
      <SectorMix result={result} />
      <section aria-label="Each stock" className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2 sm:px-5">
          <h2 className="oa-label">Stock by stock</h2>
          <span className="text-[12.5px] text-oa-muted-fg">Our call is a view, not advice</span>
        </div>
        {/* About eight stocks, then the list scrolls inside (owner rule for long lists). */}
        <ul className="max-h-[48rem] divide-y divide-oa-border overflow-y-auto">
          {sorted.map((stock) => (
            <StockRow key={stock.instrument_id} stock={stock} today={today} />
          ))}
        </ul>
      </section>
      {result.upcoming.length > 0 ? (
        <section aria-label="Coming up" className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
          <div className="flex min-h-11 items-center border-b border-oa-border px-4 py-2 sm:px-5">
            <h2 className="oa-label">Earnings in the next 30 days</h2>
          </div>
          {/* About eight rows, then the list scrolls inside. */}
          <ul className="max-h-[21rem] divide-y divide-oa-border overflow-y-auto">
            {result.upcoming.map((item) => (
              <li key={item.ticker} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className="flex items-center gap-2">
                  <StockLogo ticker={item.ticker} size={20} circle />
                  <span className="oa-mono text-[13px] font-medium text-oa-fg">{item.ticker}</span>
                </span>
                <span className="text-right text-[13px] text-oa-fg">
                  <span className={NUM}>{fmtDayShort(item.date)}</span>
                  <span className="text-oa-muted-fg"> · {whenReports(item)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {unknown.length > 0 ? (
        <p className="px-2 text-pretty text-[13px] leading-5 text-oa-muted-fg sm:px-0">
          We do not cover {unknown.join(", ")} yet, so {unknown.length === 1 ? "it is" : "they are"} left out above.
        </p>
      ) : null}
      {asOf ? <p className="px-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-0">As of {asOf}</p> : null}
    </div>
  );
}
