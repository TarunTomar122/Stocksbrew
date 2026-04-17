import Link from "next/link";

import type { Mover, Sector, Stock } from "@/lib/api-types";

import {
  DashboardCard,
  ToneChip,
  formatPct,
  pctClass,
} from "./primitives";

type Props = {
  sector: Sector;
  sectorStocks: Stock[];
};

function sentimentLabel(value: number): string {
  if (value > 0.4) return "Strong positive";
  if (value > 0.1) return "Positive";
  if (value > -0.1) return "Neutral";
  if (value > -0.4) return "Negative";
  return "Strong negative";
}

function sentimentTone(value: number): "green" | "red" | "neutral" {
  if (value > 0.1) return "green";
  if (value < -0.1) return "red";
  return "neutral";
}

function MoverList({
  movers,
  stocksByTicker,
  tone,
  emptyMsg,
}: {
  movers: Mover[];
  stocksByTicker: Map<string, Stock>;
  tone: "green" | "red";
  emptyMsg: string;
}) {
  if (movers.length === 0) {
    return (
      <div className="px-5 py-6 text-center text-[12px] text-[#8C94A8]">
        {emptyMsg}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[#1F2738]">
      {movers.slice(0, 6).map((mover) => {
        const stock = stocksByTicker.get(mover.symbol.toUpperCase());
        const href = stock
          ? `/stock/${encodeURIComponent(stock.symbol)}?market=${stock.market ?? "us"}`
          : null;
        const body = (
          <div className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-semibold text-[#F5F6F8]">
                {mover.symbol}
              </span>
              {stock?.name && (
                <p className="mt-0.5 truncate text-[10px] text-[#555E75]">
                  {stock.name}
                </p>
              )}
            </div>
            <span
              className={`font-mono text-[12px] font-medium tabular-nums ${
                tone === "green" ? "text-[#22C55E]" : "text-[#EF4444]"
              }`}
            >
              {formatPct(mover.changePct)}
            </span>
          </div>
        );
        return (
          <li key={mover.symbol}>
            {href ? (
              <Link
                href={href}
                className="block transition-colors hover:bg-[#1A2130]"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SectorDetail({ sector, sectorStocks }: Props) {
  const stocksByTicker = new Map(
    sectorStocks.map((s) => [s.symbol.toUpperCase(), s]),
  );
  const market = sector.market === "india" ? "india" : "us";
  const tone = sentimentTone(sector.sentiment.overall);

  const sortedStocks = [...sectorStocks].sort(
    (a, b) => b.price.changePct - a.price.changePct,
  );

  return (
    <>
      {/* ─── Breadcrumb ─── */}
      <nav className="mb-5 flex items-center gap-2 text-[11px] text-[#8C94A8]">
        <Link
          href={`/dashboard${market === "india" ? "?market=india" : ""}`}
          className="transition-colors hover:text-[#F5F6F8]"
        >
          Dashboard
        </Link>
        <span className="text-[#555E75]">/</span>
        <span className="text-[#F5F6F8]">{sector.name}</span>
      </nav>

      {/* ─── Hero ─── */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-[#1F2738] pb-6">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
            {market === "india" ? "India" : "United States"} · Sector
          </span>
          <h1 className="text-[26px] font-bold tracking-tight text-[#F5F6F8]">
            {sector.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ToneChip tone={tone}>{sentimentLabel(sector.sentiment.overall)}</ToneChip>
            {sector.performance.vsMarket && (
              <span className="text-[11px] text-[#8C94A8]">
                {sector.performance.vsMarket}
              </span>
            )}
            <span className="text-[11px] text-[#8C94A8]">
              Sentiment {sector.sentiment.trend}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`font-mono text-[28px] font-bold tabular-nums leading-none ${pctClass(sector.performance.changePct)}`}
          >
            {formatPct(sector.performance.changePct)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#8C94A8]">
            Today
          </span>
        </div>
      </header>

      {/* ─── Grid ─── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Analysis + Outlook (wide) */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          {(sector.briefAnalysis || sector.bottomLine) && (
            <DashboardCard title="What's driving this sector" eyebrow="Analysis">
              <p className="max-w-[72ch] whitespace-pre-line text-[14px] leading-relaxed text-[#F5F6F8]/85">
                {sector.briefAnalysis || sector.bottomLine}
              </p>
              {sector.drivers.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {sector.drivers.slice(0, 6).map((driver, i) => (
                    <span
                      key={i}
                      className="rounded-[4px] border border-[#252E42] bg-[#1A2130] px-2 py-1 text-[11px] text-[#8C94A8]"
                    >
                      {driver}
                    </span>
                  ))}
                </div>
              )}
            </DashboardCard>
          )}

          {sector.briefOutlook && (
            <DashboardCard title="Outlook" eyebrow="What to watch">
              <p className="max-w-[72ch] whitespace-pre-line text-[14px] leading-relaxed text-[#F5F6F8]/85">
                {sector.briefOutlook}
              </p>
            </DashboardCard>
          )}

          {sortedStocks.length > 0 && (
            <DashboardCard
              title={`Stocks in ${sector.name}`}
              eyebrow={`${sortedStocks.length} tracked`}
              padding="none"
            >
              <ul className="divide-y divide-[#1F2738]">
                {sortedStocks.map((stock) => (
                  <li key={stock.symbol}>
                    <Link
                      href={`/stock/${encodeURIComponent(stock.symbol)}?market=${stock.market ?? market}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[#1A2130]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-semibold text-[#F5F6F8]">
                            {stock.symbol}
                          </span>
                          <span className="truncate text-[11px] text-[#555E75]">
                            {stock.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-[13px] font-medium tabular-nums text-[#F5F6F8]">
                          {stock.price.current.toFixed(2)}
                        </span>
                        <span
                          className={`font-mono text-[11px] tabular-nums ${pctClass(stock.price.changePct)}`}
                        >
                          {formatPct(stock.price.changePct)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </DashboardCard>
          )}
        </div>

        {/* Movers (narrow) */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <DashboardCard title="Gainers" eyebrow="Top movers" padding="none">
            <MoverList
              movers={sector.topMovers.gainers}
              stocksByTicker={stocksByTicker}
              tone="green"
              emptyMsg="No gainers today."
            />
          </DashboardCard>
          <DashboardCard title="Losers" eyebrow="Top movers" padding="none">
            <MoverList
              movers={sector.topMovers.losers}
              stocksByTicker={stocksByTicker}
              tone="red"
              emptyMsg="No losers today."
            />
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
