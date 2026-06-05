import type { Metadata } from "next";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { getCurrentMarket } from "@/lib/market";
import { getPremarketMovers, isPremarketLive, type PremarketRow } from "@/lib/premarket";
import { getSectorRegimes } from "@/lib/sector-regimes";
import { relativeTime } from "@/lib/freshness";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Before the Open - Pre-Market Movers & Setup",
  description:
    "What is gapping before the bell and what it means. Pre-market movers, the day's setup, and what to watch, from stocksbrew.",
  alternates: { canonical: "/premarket" },
};

const PHASE_LABEL: Record<string, string> = {
  trending_up: "trending up",
  distribution: "in distribution",
  correction: "in a correction",
  recovery: "recovering",
  range: "range-bound",
};
const RISK_LABEL: Record<string, string> = { on: "risk-on", off: "risk-off", mixed: "mixed" };

function MoverCard({ row }: { row: PremarketRow }) {
  const up = row.pre_market_change_pct >= 0;
  const color = up ? "#10b981" : "#ef4444";
  const bg = up ? "#ecfdf5" : "#fef2f2";
  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={row.ticker} market="US" size={34} logoUrl={row.logo_url} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {row.ticker}
          </span>
          <span className="truncate max-w-[150px] text-[11px] text-[#9ca3af]">{row.name}</span>
        </div>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-semibold tabular-nums"
        style={{ background: bg, color }}
      >
        {up ? "▲" : "▼"} {Math.abs(row.pre_market_change_pct).toFixed(1)}%
      </span>
    </Link>
  );
}

export default async function PremarketPage() {
  const market = getCurrentMarket();
  const [movers, regimes] = await Promise.all([
    getPremarketMovers(market).catch(() => null),
    getSectorRegimes(market).catch(() => ({ sectors: new Map(), macro: null })),
  ]);

  const macro = regimes.macro;
  const phase = macro?.market_phase ? PHASE_LABEL[macro.market_phase] : null;
  const risk = macro?.risk_appetite ? RISK_LABEL[macro.risk_appetite] : null;
  const live = isPremarketLive(movers);

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-10 px-6 py-12 md:px-10 md:py-16 lg:px-16">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0052ff]">
              Before the open
            </span>
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                Pre-market live
              </span>
            )}
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[40px]">
            What is set up before the bell
          </h1>
          <p className="max-w-[720px] text-[16px] leading-[1.6] text-[#374151]">
            {phase
              ? `The market is ${phase}${risk ? `, ${risk}` : ""}. Here is what is gapping pre-market and what it means.`
              : "Pre-market movers and the day's setup, read for what they actually mean."}
            {movers?.generated_at && (
              <span className="text-[#9ca3af]"> Updated {relativeTime(movers.generated_at)}.</span>
            )}
          </p>
        </header>

        {!live || (movers?.quoted_count ?? 0) === 0 ? (
          <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
            <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#111111]">
              Pre-market is quiet
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6b7280]">
              Pre-market trading runs from 4:00 to 9:30 ET. Check back closer to the open to see
              what is gapping on the names that matter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <section className="flex flex-col gap-4">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
                Gapping up
              </h2>
              <div className="flex flex-col gap-3">
                {(movers?.gappers_up ?? []).slice(0, 8).map((r) => (
                  <MoverCard key={r.ticker} row={r} />
                ))}
                {(movers?.gappers_up ?? []).length === 0 && (
                  <p className="text-[13px] italic text-[#9ca3af]">Nothing gapping up right now.</p>
                )}
              </div>
            </section>
            <section className="flex flex-col gap-4">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
                Gapping down
              </h2>
              <div className="flex flex-col gap-3">
                {(movers?.gappers_down ?? []).slice(0, 8).map((r) => (
                  <MoverCard key={r.ticker} row={r} />
                ))}
                {(movers?.gappers_down ?? []).length === 0 && (
                  <p className="text-[13px] italic text-[#9ca3af]">Nothing gapping down right now.</p>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="flex flex-col gap-2 text-[11px] text-[#9ca3af]">
          <Link href="/watchlist" className="font-semibold text-[#0052ff] hover:underline">
            See what is moving on your own book on Radar →
          </Link>
          <span>Not investment advice.</span>
        </footer>
      </div>
    </main>
  );
}
