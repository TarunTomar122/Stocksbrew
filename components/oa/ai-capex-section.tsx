import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { SquircleSurface } from "@/components/oa/squircle";
import type { AiCapexBeneficiary, AiCapexWatchItem } from "@/lib/ai-capex";

type MarketQuote = {
  price?: number;
  changePct?: number;
};

export type AiCapexRow = AiCapexBeneficiary & MarketQuote;
export type AiCapexWatchRow = AiCapexWatchItem & MarketQuote;

function money(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span className="tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

const ROLE_TONE: Record<AiCapexBeneficiary["role"], string> = {
  Compute: "var(--signal-bullish)",
  Memory: "var(--signal-bullish)",
  Manufacturing: "var(--primary)",
  Networking: "var(--primary)",
  "Power & cooling": "var(--signal-neutral)",
  "AI platforms": "var(--on-surface-variant)",
  Cooling: "var(--signal-neutral)",
  "Optical connectivity": "var(--primary)",
  "Grid infrastructure": "var(--signal-neutral)",
  "Reliable power": "var(--signal-neutral)",
  "Data centers": "var(--on-surface-variant)",
};

function RolePill({ role }: { role: AiCapexBeneficiary["role"] }) {
  const color = ROLE_TONE[role];
  return (
    <span
      className="inline-flex w-fit rounded-full border border-oa-border bg-oa-card px-2.5 py-1 text-[12px] font-medium"
      style={{ color }}
    >
      {role}
    </span>
  );
}

function StocksbrewView({ row }: { row: AiCapexRow }) {
  const hasScore = typeof row.stocksbrewScore === "number";
  return (
    <div className="shrink-0 text-left md:text-right">
      <p className="text-[13px] font-medium text-oa-muted-fg">Stocksbrew</p>
      <p className="mt-0.5 text-[16px] font-medium" style={{ color: hasScore ? "var(--signal-bullish)" : "var(--on-surface-variant)" }}>
        {row.stocksbrewLabel}
        {hasScore ? <span className="ml-1 tabular-nums">· {row.stocksbrewScore}</span> : null}
      </p>
      {row.coverageNote ? <p className="mt-0.5 text-[12px] text-oa-muted-fg">{row.coverageNote}</p> : null}
    </div>
  );
}

function BeneficiaryRow({ row }: { row: AiCapexRow }) {
  return (
    <div className="border-t border-oa-border/70 px-3 py-4 first:border-t-0 sm:px-5 sm:py-5">
      <div className="grid gap-4 md:grid-cols-[2rem_minmax(10rem,0.85fr)_9rem_minmax(0,1.6fr)_8rem] md:items-start md:gap-5">
        <span className="pt-1 text-[15px] font-medium tabular-nums text-oa-muted-fg">{row.rank}</span>
        <Link
          href={`/stock/${row.ticker}`}
          className="group flex min-w-0 items-start gap-2.5 outline-none"
        >
          <StockLogo ticker={row.ticker} market="US" size={32} circle />
          <span className="min-w-0">
            <span className="block text-[17px] font-medium leading-6 text-oa-fg group-hover:text-oa-primary group-focus-visible:text-oa-primary">
              {row.ticker}
            </span>
            <span className="block truncate text-[14px] leading-6 text-oa-muted-fg">{row.company}</span>
          </span>
        </Link>
        <RolePill role={row.role} />
        <div className="min-w-0">
          <p className="text-[15px] leading-6 text-oa-fg">{row.whyItBenefits}</p>
          <details className="mt-2 text-[14px] leading-6 text-oa-muted-fg">
            <summary className="cursor-pointer font-medium text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg">
              What could break it
            </summary>
            <p className="mt-1.5 max-w-2xl">{row.breaksThesis}</p>
          </details>
        </div>
        <StocksbrewView row={row} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-0 text-[14px] text-oa-muted-fg md:hidden">
        {typeof row.price === "number" ? <span className="font-medium tabular-nums text-oa-fg">${money(row.price)}</span> : null}
        {typeof row.changePct === "number" ? pctLabel(row.changePct) : null}
      </div>
    </div>
  );
}

function WatchItem({ row }: { row: AiCapexWatchRow }) {
  return (
    <Link href={`/stock/${row.ticker}`} className="group outline-none">
      <SquircleSurface className="h-full border border-oa-border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-visible:bg-oa-accent/60">
        <div className="flex items-start gap-2.5">
          <StockLogo ticker={row.ticker} market="US" size={28} circle />
          <div className="min-w-0">
            <p className="text-[17px] font-medium text-oa-fg group-hover:text-oa-primary group-focus-visible:text-oa-primary">
              {row.ticker}
            </p>
            <p className="truncate text-[14px] text-oa-muted-fg">{row.company}</p>
          </div>
          <div className="ml-auto text-right">
            {typeof row.price === "number" ? <p className="text-[15px] font-medium tabular-nums text-oa-fg">${money(row.price)}</p> : null}
            {typeof row.changePct === "number" ? <p className="mt-0.5 text-[13px] font-medium">{pctLabel(row.changePct)}</p> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RolePill role={row.role} />
          {row.coverageNote ? <span className="text-[12px] text-oa-muted-fg">{row.coverageNote}</span> : null}
        </div>
        <p className="mt-3 text-[15px] leading-6 text-oa-muted-fg">{row.whyItBenefits}</p>
      </SquircleSurface>
    </Link>
  );
}

export function AiCapexSection({ rows, watchlist }: { rows: AiCapexRow[]; watchlist: AiCapexWatchRow[] }) {
  return (
    <section aria-labelledby="ai-capex-heading">
      <div className="mb-4 max-w-3xl">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-oa-muted-fg">Theme</p>
        <h2 id="ai-capex-heading" className="mt-1 text-2xl font-medium tracking-tight text-oa-fg">
          AI capex beneficiaries
        </h2>
        <p className="mt-1 text-[16.5px] leading-7 text-oa-muted-fg">
          Ten public companies exposed to the AI buildout, from compute and memory to networking, power, cooling, and AI platforms.
        </p>
      </div>

      <SquircleSurface className="overflow-hidden border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {rows.map((row) => <BeneficiaryRow key={row.ticker} row={row} />)}
        <div className="border-t border-oa-border bg-oa-bg px-3 py-3 text-[13px] leading-5 text-oa-muted-fg sm:px-5">
          Curated research map · each thesis includes a failure case · research only, not investment advice.
        </div>
      </SquircleSurface>

      {watchlist.length > 0 ? (
        <div className="mt-8">
          <div className="mb-4 max-w-2xl">
            <h3 className="text-xl font-medium tracking-tight text-oa-fg">Smaller names worth tracking</h3>
            <p className="mt-1 text-[16px] leading-7 text-oa-muted-fg">Higher-risk exposure across cooling, optics, power, and data-center real estate.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {watchlist.map((row) => <WatchItem key={row.ticker} row={row} />)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
